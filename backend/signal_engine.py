"""
signal_engine.py — Tiered CE/PE signal engine.

CRITICAL FIX vs legacy dashboard:
  The old engine required 5/12 conditions including structural ones
  (Fibonacci proximity, BB band touch) which almost never align during
  a live trending move — causing missed opportunities.

NEW APPROACH — 3 signal tiers:
  STRONG  (7+/13): full confirmation, all groups align
  MODERATE(5-6/13): good trend + some structure
  SCOUT   (3-4/13): pure trend-following, fires ONLY when market is in
                    confirmed BULLISH_TREND or BEARISH_TREND

  In a trending market SCOUT fires immediately when 3 trend/momentum
  conditions align — so the alert comes at the START of the move,
  not after it has already run.

13 conditions across 7 groups:
  A. Trend (3):     VWAP, EMA9>21, MACD hist
  B. Momentum (2):  RSI range + slope, RSI divergence
  C. Structure (3): Fib zone, BB outer band, swing breakout/breakdown
  D. Volume (1):    Spike >= 1.5x avg
  E. Price Action(1): engulfing / hammer / 3-bar pattern
  F. OI/Context (2): 15-min OI momentum, VIX
  G. Target room (1): projected move clears MIN_INDEX_TARGET_POINTS

ANTI-OVERTRADING — an "actionable" fire now additionally requires the
near-term predictor (trend_predictor.py) to have a target at least
MIN_INDEX_TARGET_POINTS away in the signal's direction. A signal can score
high on the checklist above and still stay "forming" if there's no room for
the index to actually move — this is the direct fix for signals firing with
a 2-5pt target that no realistic option trade could profit from.
"""
from collections import deque
from datetime import datetime, timedelta
import pytz
from indicators import compute_all
from trend_predictor import predict as predict_trend
import oi_tracker
from config import (
    MIN_CANDLES,
    SIGNAL_THRESHOLD_STRONG, SIGNAL_THRESHOLD_MODERATE, SIGNAL_THRESHOLD_SCOUT,
    SIGNAL_START_H, SIGNAL_START_M, SIGNAL_END_H, SIGNAL_END_M,
    MIN_TARGET_GAP, MIN_INDEX_TARGET_POINTS, TAKE_PROFIT_PCT,
    CONFIRM_BARS, COOLDOWN_MINUTES, GLOBAL_COOLDOWN_MINUTES, MIN_MOVE_ATR_MULT,
    OI_MOMENTUM_SHORT_MIN, OI_MOMENTUM_LONG_MIN,
)

IST = pytz.timezone("Asia/Kolkata")


def _in_window() -> bool:
    now = datetime.now(IST)
    return ((now.hour, now.minute) >= (SIGNAL_START_H, SIGNAL_START_M) and
            (now.hour, now.minute) <  (SIGNAL_END_H,   SIGNAL_END_M))


# ── Anti-overtrading: per-index confirmation/cooldown state ────────────────────
# Keeps a short rolling history of recent (direction, tier) evaluations plus the
# last time each direction was marked "actionable", per index (NIFTY/BANKNIFTY/
# SENSEX each run independently). This is what turns "a signal on every bar of
# the same ongoing move" into "one actionable alert per move."
_state: dict = {}


def _get_state(index: str) -> dict:
    return _state.setdefault(index, {
        "history": deque(maxlen=max(CONFIRM_BARS, 2) + 3),
        "last_actionable": {"CE_BUY": None, "PE_BUY": None},
        "last_actionable_any": None,   # {"time","direction","tier","ltp"} — cross-direction guard
    })


def _confirm(index: str, regime_mode: str, direction: str, tier: str, ltp: float, atr: float, advance_history: bool) -> tuple[bool, str]:
    """
    Two independent gates before a signal is marked actionable:
      1. Regime-appropriate persistence (skipped for OR/compression fast lanes,
         required for steady-state — CONFIRM_BARS consecutive same-direction bars).
      2. A GLOBAL guard across BOTH directions: even a persistent, regime-eligible
         signal only fires if enough time has passed OR price has actually moved
         (>= MIN_MOVE_ATR_MULT × ATR) since the last actionable fire of ANY
         direction — unless this one is STRONG tier, the last wasn't, AND price
         has still moved at least half that threshold (a tier bump alone is no
         longer enough to bypass the cooldown outright).
    A third gate (target-room, based on the near-term predictor) is applied by
    the caller in _make(), since it needs the prediction dict computed there.

    advance_history: only True for real, once-per-minute closed-candle
    evaluations (main.py's _broadcast). The fast-refresh loop (main.py, every
    5-10s) calls this with False — it can still report the CURRENT persistence
    state, but must not push a new bar into the CONFIRM_BARS deque or update
    cooldown timers, or a signal that only lasted a few seconds intraminute
    could satisfy a "5 consecutive bars" requirement in 5-10 real seconds.
    """
    st = _get_state(index)
    now = datetime.now(IST)

    if advance_history:
        st["history"].append(direction)

    if regime_mode == "STEADY_STATE":
        recent = list(st["history"])[-CONFIRM_BARS:]
        persistent = len(recent) >= CONFIRM_BARS and all(d == direction for d in recent)
    else:
        persistent = True  # OPENING_RANGE / COMPRESSION fast lanes skip persistence

    if not persistent:
        return False, f"Building confirmation ({sum(1 for d in list(st['history'])[-CONFIRM_BARS:] if d == direction)}/{CONFIRM_BARS} bars)"

    last_any = st["last_actionable_any"]
    if last_any is None:
        global_cleared, why = True, None
    else:
        elapsed  = now - last_any["time"]
        cooled   = elapsed >= timedelta(minutes=GLOBAL_COOLDOWN_MINUTES)
        moved_full = bool(atr) and abs((ltp or 0) - (last_any.get("ltp") or 0)) >= MIN_MOVE_ATR_MULT * atr
        moved_half = bool(atr) and abs((ltp or 0) - (last_any.get("ltp") or 0)) >= 0.5 * MIN_MOVE_ATR_MULT * atr
        override = tier == "STRONG" and last_any.get("tier") != "STRONG" and moved_half
        global_cleared = cooled or moved_full or override
        if not global_cleared:
            left = GLOBAL_COOLDOWN_MINUTES - int(elapsed.total_seconds() // 60)
            why = (f"Cooldown active (~{max(left,0)}m) — price hasn't moved enough since the "
                   f"last {last_any['direction'].replace('_BUY','')} flag to count as a new move")

    if not global_cleared:
        return False, why

    if advance_history:
        st["last_actionable"][direction] = now
        st["last_actionable_any"] = {"time": now, "direction": direction, "tier": tier, "ltp": ltp}
    label = {"OPENING_RANGE": "Opening-range fast lane", "COMPRESSION": "Compression breakout"}.get(regime_mode)
    reason = f"{label} — immediate entry" if label else f"Confirmed {CONFIRM_BARS} consecutive bars, move validated"
    return True, reason


def evaluate_signals(
    candles:  list,
    oi_data:  dict | None = None,
    vix:      float | None = None,
    vix_prev: float | None = None,
    fii_dii:  dict | None = None,
    index:    str = "DEFAULT",
    advance_history: bool = True,
) -> dict:
    """
    Returns:
      { signal: "CE_BUY"|"PE_BUY"|"WAIT",
        tier:   "STRONG"|"MODERATE"|"SCOUT"|"OR_BREAKOUT"|None,
        score:  int,  total: 13,
        conditions: [...],
        trend:  str,
        actionable: bool,       # False = still forming / on cooldown / no target room
        confirm_reason: str,
        regime: "OPENING_RANGE"|"COMPRESSION"|"STEADY_STATE",
        ... }
    """
    if not _in_window():
        return {"signal": "WAIT", "tier": None, "reason": "Outside signal window",
                "actionable": False, "candle_count": len(candles)}

    if len(candles) < MIN_CANDLES:
        return {"signal": "WAIT", "tier": None,
                "reason": f"Warming up — {MIN_CANDLES - len(candles)} candle(s) needed",
                "actionable": False, "candle_count": len(candles)}

    data = compute_all(candles, vix=vix)
    if not data:
        return {"signal": "WAIT", "tier": None, "reason": "Indicator error", "actionable": False}

    L       = data["latest"]
    fib     = data["fibonacci"]
    pa      = data["price_action"]
    vol     = data["volume"]
    trn     = data["trend"]
    sw      = data["swing"]
    bkbo    = data["breakout"]
    trend   = trn["trend"]
    regime  = data["regime"]
    mode    = regime["mode"]

    oi_mom = oi_tracker.momentum(index, OI_MOMENTUM_SHORT_MIN, OI_MOMENTUM_LONG_MIN)
    prediction = predict_trend(candles, data, oi_momentum=oi_mom, index=index)

    ltp         = L["ltp"]
    rsi         = L["rsi"]
    rsi_slope   = L["rsi_slope"]
    vwap        = L["vwap"]
    e9          = L["ema9"]
    e21         = L["ema21"]
    bbl         = L["bb_lower"]
    bbu         = L["bb_upper"]
    atr         = L["atr"]
    macd_hist   = L["macd_hist"] or 0
    bb_pct      = L["bb_pct"] or 0.5

    tol          = max(0.3 * atr, 8)
    supports     = [fib["38.2"], fib["50.0"]]
    resistances  = [fib["61.8"], fib["78.6"]]

    # oi_data (per-strike chain snapshot) still informs the day's cumulative PCR;
    # oi_mom (oi_tracker) is the actual 5/15-min momentum read.
    pcr          = oi_mom.get("pcr") or (oi_data or {}).get("pcr", 1.0)
    vix_val      = vix or 15.0
    vix_rising   = vix is not None and vix_prev is not None and vix > vix_prev
    fd_bias      = (fii_dii or {}).get("bias", "NEUTRAL")

    div = prediction.get("rsi_divergence") or {"bullish": False, "bearish": False}

    conds = []
    def c(lce, lpe, ce_m, pe_m):
        conds.append({"label_ce": lce, "label_pe": lpe, "ce": bool(ce_m), "pe": bool(pe_m)})

    # ── A: Trend ──────────────────────────────────────────────────────────────
    c(f"Price {ltp:.0f} > VWAP {vwap:.0f}",
      f"Price {ltp:.0f} < VWAP {vwap:.0f}",
      ltp > vwap, ltp < vwap)
    c(f"EMA9 {e9:.0f} > EMA21 {e21:.0f}",
      f"EMA9 {e9:.0f} < EMA21 {e21:.0f}",
      e9 > e21, e9 < e21)
    c(f"MACD hist {macd_hist:.2f} > 0",
      f"MACD hist {macd_hist:.2f} < 0",
      macd_hist > 0, macd_hist < 0)

    # ── B: Momentum ───────────────────────────────────────────────────────────
    c(f"RSI {rsi:.1f} in 35-55 & rising",
      f"RSI {rsi:.1f} in 45-65 & falling",
      35 <= rsi <= 55 and rsi_slope > 0,
      45 <= rsi <= 65 and rsi_slope < 0)
    c("Bullish RSI divergence", "Bearish RSI divergence",
      div.get("bullish"), div.get("bearish"))

    # ── C: Structure ──────────────────────────────────────────────────────────
    c("Near Fib 38.2%/50% support",
      "Near Fib 61.8%/78.6% resistance",
      any(abs(ltp - s) <= tol for s in supports),
      any(abs(ltp - r) <= tol for r in resistances))
    c(f"BB lower band ({L['bb_lower']:.0f}) — oversold",
      f"BB upper band ({L['bb_upper']:.0f}) — overbought",
      bb_pct < 0.2,
      bb_pct > 0.8)
    c(f"Breakout above swing res {sw.get('swing_resistance') or '—'}",
      f"Breakdown below swing sup {sw.get('swing_support') or '—'}",
      bkbo.get("breakout"), bkbo.get("breakdown"))

    # ── D: Volume ─────────────────────────────────────────────────────────────
    vr = vol["volume_ratio"]
    c(f"Volume spike {vr:.1f}× avg",
      f"Volume spike {vr:.1f}× avg",
      vol["volume_spike"], vol["volume_spike"])

    # ── E: Price Action ───────────────────────────────────────────────────────
    bull_pa = pa["bullish_engulfing"] or pa["hammer"] or pa["three_white"]
    bear_pa = pa["bearish_engulfing"] or pa["shooting_star"] or pa["three_black"]
    c("Bullish candle pattern",
      "Bearish candle pattern",
      bull_pa, bear_pa)

    # ── F: OI momentum + VIX ───────────────────────────────────────────────────
    c(f"OI(15m): PE building > CE, PCR {pcr:.2f}",
      f"OI(15m): CE building > PE, PCR {pcr:.2f}",
      oi_mom.get("bias") == "BULLISH" or pcr < 0.8,
      oi_mom.get("bias") == "BEARISH" or pcr > 1.2)
    c(f"VIX {vix_val:.1f} ≤ 20",
      f"VIX {vix_val:.1f} ≥ 18 or rising",
      vix_val <= 20,
      vix_val >= 18 or vix_rising)

    # ── G: Target room ─────────────────────────────────────────────────────────
    # Uses the predictor's own gated ladder (already >= MIN_INDEX_TARGET_POINTS
    # away) rather than a flat ATR formula — so this reflects a real level, not
    # just "the index is volatile enough in the abstract."
    ladder = prediction.get("sr_ladder") or {"above": [], "below": []}
    tgt_room_ce = bool(ladder.get("above"))
    tgt_room_pe = bool(ladder.get("below"))
    c(f"Room to run ≥{MIN_INDEX_TARGET_POINTS:.0f}pts (next level above)",
      f"Room to run ≥{MIN_INDEX_TARGET_POINTS:.0f}pts (next level below)",
      tgt_room_ce, tgt_room_pe)

    sce = sum(1 for x in conds if x["ce"])
    spe = sum(1 for x in conds if x["pe"])

    # ── Trend-following mode (SCOUT tier) ─────────────────────────────────────
    # In a confirmed trend, only 3 trend/momentum conditions needed to fire.
    # This catches the move at the START rather than after structure aligns.
    trend_ce = trend in ("BULLISH_TREND", "WEAK_BULLISH")
    trend_pe = trend in ("BEARISH_TREND", "WEAK_BEARISH")

    # Trend score = only conditions A1+A2+A3+B1 (indices 0-3)
    trend_score_ce = sum(1 for x in conds[:4] if x["ce"])
    trend_score_pe = sum(1 for x in conds[:4] if x["pe"])

    def _make(direction, score, tier, reasons):
        actionable, confirm_reason = _confirm(index, mode, direction, tier, ltp, atr, advance_history)

        # Extra gate: even a persistent, cooled-down signal doesn't count as
        # actionable unless the predictor sees room to run in this direction —
        # this is what stops a 2-5pt "target" from ever reaching the UI as a
        # tradeable alert.
        if actionable:
            has_room = tgt_room_ce if direction == "CE_BUY" else tgt_room_pe
            if not has_room:
                actionable = False
                confirm_reason = f"No level ≥{MIN_INDEX_TARGET_POINTS:.0f}pts away in this direction yet — waiting for room to run"

        return {
            "signal":     direction,
            "tier":       tier,
            "score":      score,
            "total":      len(conds),
            "reasons":    reasons,
            "conditions": conds,
            "ltp": ltp, "vwap": vwap, "rsi": rsi,
            "atr": atr, "vix": vix_val,
            "trend": trend, "ema_slope": trn["ema_slope"],
            "fibonacci": fib,
            "fii_dii": fii_dii or {},
            "oi_momentum": oi_mom,
            "candle_count": len(candles),
            "actionable": actionable, "confirm_reason": confirm_reason,
            "regime": mode, "regime_detail": regime,
            "prediction": prediction,
        }

    # ── Opening-range fast lane ──────────────────────────────────────────────
    # OPENING_RANGE mode only, once today's OR has at least a few bars formed.
    # Breaking the OR high/low on a volume spike is its own confirmation —
    # this is what catches the first/biggest move of the day instead of
    # waiting on the steady-state persistence+cooldown gate below.
    or_high = regime["opening_range"]["high"]
    or_low  = regime["opening_range"]["low"]
    if mode == "OPENING_RANGE" and or_high and or_low and len(candles) >= 5:
        if ltp > or_high and vol["volume_spike"]:
            return _make("CE_BUY", trend_score_ce, "OR_BREAKOUT",
                         [f"Opening-range breakout above {or_high:.0f}"])
        if ltp < or_low and vol["volume_spike"]:
            return _make("PE_BUY", trend_score_pe, "OR_BREAKOUT",
                         [f"Opening-range breakdown below {or_low:.0f}"])

    # STRONG (7+/13, any trend)
    if sce >= SIGNAL_THRESHOLD_STRONG and sce >= spe:
        return _make("CE_BUY", sce, "STRONG", [x["label_ce"] for x in conds if x["ce"]])
    if spe >= SIGNAL_THRESHOLD_STRONG:
        return _make("PE_BUY", spe, "STRONG", [x["label_pe"] for x in conds if x["pe"]])

    # MODERATE (5-6/13, any trend)
    if sce >= SIGNAL_THRESHOLD_MODERATE and sce >= spe:
        return _make("CE_BUY", sce, "MODERATE", [x["label_ce"] for x in conds if x["ce"]])
    if spe >= SIGNAL_THRESHOLD_MODERATE:
        return _make("PE_BUY", spe, "MODERATE", [x["label_pe"] for x in conds if x["pe"]])

    # SCOUT (3-4 trend conditions, confirmed trend only — catches live moves)
    if trend_ce and trend_score_ce >= SIGNAL_THRESHOLD_SCOUT and trend_score_ce >= trend_score_pe:
        return _make("CE_BUY", trend_score_ce, "SCOUT",
                     [x["label_ce"] for x in conds[:4] if x["ce"]])
    if trend_pe and trend_score_pe >= SIGNAL_THRESHOLD_SCOUT:
        return _make("PE_BUY", trend_score_pe, "SCOUT",
                     [x["label_pe"] for x in conds[:4] if x["pe"]])

    return {
        "signal": "WAIT", "tier": None,
        "ce_score": sce, "pe_score": spe, "total": len(conds),
        "conditions": conds,
        "ltp": ltp, "vwap": vwap, "rsi": rsi, "atr": atr,
        "trend": trend, "ema_slope": trn["ema_slope"],
        "oi_momentum": oi_mom,
        "candle_count": len(candles),
        "actionable": False, "regime": mode, "regime_detail": regime,
        "prediction": prediction,
    }
