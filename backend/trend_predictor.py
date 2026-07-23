"""
trend_predictor.py — Near-term (15-30 min) directional read + target projection.

This is NOT a trained ML model — there's no historical-accuracy-tested model
here, and framing it as one would overstate what it does. It's a structured,
transparent codification of the same reasoning a discretionary trader uses:

  1. Support/resistance ladder — intraday pivots PLUS the last ~35 days of
     daily S/R (monthly_levels.py), merged. Once price breaks a level, the
     next level in that direction becomes the projected "likely touch"
     target — but only if it clears MIN_INDEX_TARGET_POINTS away, so a
     micro-pivot 2-3 points from LTP can no longer masquerade as a target.
  2. Bollinger Band position (outer + midline) — riding the outer band =
     continuation bias; pinned at a band edge with no expansion = mean-
     reversion bias back toward the midline/VWAP.
  3. RSI divergence — price vs RSI making disagreeing highs/lows over the
     recent swing, the classic early-reversal tell.
  4. OI momentum (5/15-min) — options-writer OI build read from oi_tracker.py:
     PE OI building faster than CE = writers defending upside (bullish read),
     and vice versa.
  5. India VIX level/trend — elevated or rising VIX discounts directional
     confidence regardless of what the chart structure says.
  6. 5-min parallel confluence — the 1-min read is checked against the same
     read computed on 5-min-resampled candles. Disagreement between the two
     lowers confidence sharply.

Output is a bias + confidence + target/invalidation levels + the rationale
list behind each, not a single trade call — confidence is a transparency
score for how many of these factors agree, not a backtested win-rate. See
backtest.py for the harness to validate/tune this against your own Kite
historical data — that hasn't been run in this environment (no live Kite
session / no network access to Zerodha's API here), so treat the current
thresholds as a starting point, not a validated model.
"""
import pandas as pd
import numpy as np
from ta.momentum import RSIIndicator
from ta.trend import EMAIndicator
from config import MIN_INDEX_TARGET_POINTS
from monthly_levels import get_monthly_levels

LOOKBACK_DIVERGENCE = 40   # bars scanned for RSI divergence pivots
LADDER_LOOKBACK     = 60   # bars scanned for intraday S/R candidate levels
LADDER_ATR_RANGE    = 4.0  # only keep levels within this many ATRs of LTP
MERGE_ATR_FRAC      = 0.15 # merge S/R levels closer than this fraction of ATR


def _pivots(series: pd.Series, kind: str):
    """Simple 3-bar pivot highs/lows -> list of (index, value)."""
    vals = series.values
    out = []
    for i in range(1, len(vals) - 1):
        if kind == "high" and vals[i] > vals[i - 1] and vals[i] > vals[i + 1]:
            out.append((i, vals[i]))
        if kind == "low" and vals[i] < vals[i - 1] and vals[i] < vals[i + 1]:
            out.append((i, vals[i]))
    return out


def _sr_ladder(df: pd.DataFrame, ltp: float, atr: float, index: str = "NIFTY") -> dict:
    win = df.tail(LADDER_LOOKBACK)
    highs = [v for _, v in _pivots(win["high"], "high")]
    lows  = [v for _, v in _pivots(win["low"], "low")]
    levels = sorted(set(round(x, 1) for x in highs + lows))

    # Merge in the last ~35 sessions' daily S/R so early-session reads (when
    # the intraday ladder is still thin) still have levels to project to.
    monthly = get_monthly_levels(index)
    levels = sorted(set(levels + monthly.get("levels", [])))

    # merge levels that are within MERGE_ATR_FRAC*ATR of each other
    merged = []
    for lv in levels:
        if merged and abs(lv - merged[-1]) <= MERGE_ATR_FRAC * (atr or 1):
            merged[-1] = round((merged[-1] + lv) / 2, 1)
        else:
            merged.append(lv)

    band = LADDER_ATR_RANGE * (atr or 1)
    # Only keep candidates at least MIN_INDEX_TARGET_POINTS away — this is the
    # direct fix for a 2-5pt "target" firing off a noise-level micro-pivot.
    above = sorted(v for v in merged if ltp + MIN_INDEX_TARGET_POINTS <= v <= ltp + band)
    below = sorted((v for v in merged if ltp - band <= v <= ltp - MIN_INDEX_TARGET_POINTS), reverse=True)
    return {"above": above, "below": below, "monthly_ready": monthly.get("ready", False)}


def _rsi_divergence(df: pd.DataFrame) -> dict:
    win = df.tail(LOOKBACK_DIVERGENCE)
    if len(win) < 10 or "rsi" not in win or win["rsi"].isna().all():
        return {"bullish": False, "bearish": False, "detail": None}

    lows  = _pivots(win["low"], "low")
    highs = _pivots(win["high"], "high")
    rsi = win["rsi"].reset_index(drop=True)

    bullish = bearish = False
    detail = None
    if len(lows) >= 2:
        (i1, p1), (i2, p2) = lows[-2], lows[-1]
        r1, r2 = rsi.iloc[i1], rsi.iloc[i2]
        if pd.notna(r1) and pd.notna(r2) and p2 < p1 and r2 > r1:
            bullish = True
            detail = f"Bullish RSI divergence: price lower low ({p1:.0f}->{p2:.0f}) but RSI higher low ({r1:.0f}->{r2:.0f})"
    if len(highs) >= 2:
        (i1, p1), (i2, p2) = highs[-2], highs[-1]
        r1, r2 = rsi.iloc[i1], rsi.iloc[i2]
        if pd.notna(r1) and pd.notna(r2) and p2 > p1 and r2 < r1:
            bearish = True
            detail = f"Bearish RSI divergence: price higher high ({p1:.0f}->{p2:.0f}) but RSI lower high ({r1:.0f}->{r2:.0f})"
    return {"bullish": bullish, "bearish": bearish, "detail": detail}


def _resample_5m(candles: list) -> pd.DataFrame:
    df = pd.DataFrame(candles)
    df["time"] = pd.to_datetime(df["time"])
    df = df.set_index("time").sort_index()
    agg = df.resample("5min").agg({"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}).dropna()
    return agg.reset_index()


def _mtf_bias(df5: pd.DataFrame) -> dict:
    if len(df5) < 6:
        return {"bias": "NEUTRAL", "detail": "Not enough 5-min bars yet"}
    close = df5["close"]
    e9  = EMAIndicator(close=close, window=min(9, len(df5))).ema_indicator().iloc[-1]
    e21 = EMAIndicator(close=close, window=min(21, len(df5))).ema_indicator().iloc[-1]
    ltp = close.iloc[-1]
    if ltp > e9 > e21:
        return {"bias": "UP", "detail": f"5-min: price>EMA9>EMA21 ({ltp:.0f}>{e9:.0f}>{e21:.0f})"}
    if ltp < e9 < e21:
        return {"bias": "DOWN", "detail": f"5-min: price<EMA9<EMA21 ({ltp:.0f}<{e9:.0f}<{e21:.0f})"}
    return {"bias": "NEUTRAL", "detail": "5-min EMAs not aligned"}


def predict(candles: list, data: dict, oi_momentum: dict | None = None, index: str = "NIFTY") -> dict:
    """
    candles: raw 1-min OHLCV list (same as passed to evaluate_signals)
    data:    the dict returned by indicators.compute_all() for the same candles
    oi_momentum: oi_tracker.momentum(index) result, if available
    """
    if len(candles) < 20 or not data:
        return {"bias": "NEUTRAL", "confidence": 0, "rationale": ["Warming up"]}

    df = pd.DataFrame(data["candles"])
    L  = data["latest"]
    ltp, atr = L["ltp"], L.get("atr") or 1
    trn = data["trend"]

    rationale = []
    score = 0  # -100..+100, +ve = bullish bias

    # 1) Trend / EMA structure (1-min)
    if trn["trend"] == "BULLISH_TREND":
        score += 22; rationale.append("1-min trend: bullish EMA stack")
    elif trn["trend"] == "BEARISH_TREND":
        score -= 22; rationale.append("1-min trend: bearish EMA stack")
    elif trn["trend"] == "WEAK_BULLISH":
        score += 8; rationale.append("1-min trend: weak bullish lean")
    elif trn["trend"] == "WEAK_BEARISH":
        score -= 8; rationale.append("1-min trend: weak bearish lean")

    # 2) Bollinger Band position — outer band AND distance from midline
    bb_pct = L.get("bb_pct")
    bb_mid = L.get("bb_mid")
    if bb_pct is not None:
        if bb_pct >= 0.85:
            if trn["trend"] in ("BULLISH_TREND", "WEAK_BULLISH"):
                score += 7; rationale.append(f"Riding upper BB ({bb_pct:.2f}) with trend — continuation lean")
            else:
                score -= 10; rationale.append(f"Pinned at upper BB ({bb_pct:.2f}) without trend — mean-reversion risk")
        elif bb_pct <= 0.15:
            if trn["trend"] in ("BEARISH_TREND", "WEAK_BEARISH"):
                score -= 7; rationale.append(f"Riding lower BB ({bb_pct:.2f}) with trend — continuation lean")
            else:
                score += 10; rationale.append(f"Pinned at lower BB ({bb_pct:.2f}) without trend — bounce risk")
    if bb_mid is not None and atr:
        dist_mid = (ltp - bb_mid) / atr
        if abs(dist_mid) < 0.3:
            rationale.append(f"Sitting on the BB midline ({bb_mid:.0f}) — no directional edge from bands right now")

    # 3) RSI divergence (overrides / reinforces)
    div = _rsi_divergence(df)
    if div["bullish"]:
        score += 18; rationale.append(div["detail"])
    if div["bearish"]:
        score -= 18; rationale.append(div["detail"])

    # 4) OI momentum (5/15-min) — options-writer positioning read
    oi_bias_applied = False
    if oi_momentum and oi_momentum.get("ready"):
        ob = oi_momentum.get("bias", "NEUTRAL")
        if ob == "BULLISH":
            score += 12; oi_bias_applied = True
            rationale.append(f"OI (15m): PE building faster than CE (ΔPE {oi_momentum['pe_oi_chg_15m']:+,} vs ΔCE {oi_momentum['ce_oi_chg_15m']:+,}) — writers defending upside")
        elif ob == "BEARISH":
            score -= 12; oi_bias_applied = True
            rationale.append(f"OI (15m): CE building faster than PE (ΔCE {oi_momentum['ce_oi_chg_15m']:+,} vs ΔPE {oi_momentum['pe_oi_chg_15m']:+,}) — writers defending downside")

    # 5) VIX — discount confidence when fear gauge is elevated/rising, regardless of direction
    vix = L.get("vix")
    if vix:
        if vix >= 20:
            score = int(score * 0.6); rationale.append(f"VIX {vix:.1f} elevated — confidence discounted")
        elif vix >= 17:
            score = int(score * 0.8); rationale.append(f"VIX {vix:.1f} slightly elevated — confidence trimmed")

    # 6) 5-min parallel confluence
    df5 = _resample_5m(candles)
    mtf = _mtf_bias(df5)
    one_min_dir = "UP" if score > 0 else "DOWN" if score < 0 else "NEUTRAL"
    aligned = mtf["bias"] == one_min_dir or mtf["bias"] == "NEUTRAL"
    if mtf["bias"] != "NEUTRAL" and mtf["bias"] == one_min_dir:
        score += 15 if score > 0 else -15
        rationale.append(f"5-min confirms: {mtf['detail']}")
    elif mtf["bias"] != "NEUTRAL" and mtf["bias"] != one_min_dir:
        score = int(score * 0.4)  # sharply discount — this is the disagreement case
        rationale.append(f"5-min CONFLICTS with 1-min read: {mtf['detail']} — confidence cut")
    else:
        rationale.append(mtf["detail"])

    bias = "UP" if score >= 15 else "DOWN" if score <= -15 else "NEUTRAL"
    confidence = min(100, abs(score))

    # 7) Target / invalidation from the merged intraday+monthly S/R ladder,
    #    gated to at least MIN_INDEX_TARGET_POINTS away (see _sr_ladder).
    ladder = _sr_ladder(df, ltp, atr, index)
    target = invalidation = None
    if bias == "UP":
        target       = ladder["above"][0] if ladder["above"] else None
        invalidation = ladder["below"][0] if ladder["below"] else None
    elif bias == "DOWN":
        target       = ladder["below"][0] if ladder["below"] else None
        invalidation = ladder["above"][0] if ladder["above"] else None

    if bias != "NEUTRAL" and target is None:
        rationale.append(f"No level ≥{MIN_INDEX_TARGET_POINTS:.0f}pts away yet — bias noted but no clean target, treat as lower conviction")

    return {
        "bias": bias,
        "confidence": confidence,
        "horizon_minutes": "15-30",
        "target": target,
        "invalidation": invalidation,
        "mtf_aligned": aligned,
        "mtf_detail": mtf["detail"],
        "rsi_divergence": div,
        "oi_bias_applied": oi_bias_applied,
        "sr_ladder": ladder,
        "rationale": rationale,
    }
