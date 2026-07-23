"""
portfolio.py — Portfolio-awareness layer.

- get_holdings_snapshot(): consolidated Zerodha holdings with value, P&L,
  allocation %, and a per-holding BUY/SELL/HOLD call.
- get_exposure_factor(): reads margin utilization and returns a lot-size
  multiplier the scalper's option sizing applies (option_filter.py) — so a
  day where you're already heavily deployed doesn't stack full-size new
  intraday bets on top of existing exposure.

Recommendations are technical-only — daily EMA20/50 structure + RSI +
distance from the 20-day high/low. Deliberately simple and transparent
(no black box), not financial advice.
"""
import time
from datetime import datetime, timedelta
from kite_auth import get_kite

_CACHE_TTL = 900  # 15 min — daily-technical recs don't need to be live
_cache = {"data": None, "ts": 0}


def _ema(values, span):
    if not values:
        return []
    k = 2 / (span + 1)
    out = [values[0]]
    for v in values[1:]:
        out.append(v * k + out[-1] * (1 - k))
    return out


def _rsi(closes, period=14):
    if len(closes) < period + 1:
        return 50.0
    gains, losses = [], []
    for i in range(1, len(closes)):
        d = closes[i] - closes[i - 1]
        gains.append(max(d, 0)); losses.append(max(-d, 0))
    avg_gain = sum(gains[-period:]) / period
    avg_loss = sum(losses[-period:]) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 1)


def _recommend(token):
    if not token:
        return {"call": "HOLD", "reason": "No instrument token", "rsi": None}
    kite = get_kite()
    to_d, from_d = datetime.now(), datetime.now() - timedelta(days=180)
    try:
        candles = kite.historical_data(token, from_d, to_d, "day")
    except Exception:
        return {"call": "HOLD", "reason": "Historical data unavailable", "rsi": None}
    if len(candles) < 25:
        return {"call": "HOLD", "reason": "Insufficient history", "rsi": None}

    closes = [c["close"] for c in candles]
    ltp    = closes[-1]
    ema20  = _ema(closes, 20)[-1]
    ema50  = _ema(closes, min(50, len(closes)))[-1]
    rsi    = _rsi(closes)
    hi20, lo20 = max(closes[-20:]), min(closes[-20:])
    near_high = (hi20 - ltp) / hi20 < 0.02
    near_low  = (ltp - lo20) / lo20 < 0.02 if lo20 else False

    bullish = ema20 > ema50 and ltp > ema20
    bearish = ema20 < ema50 and ltp < ema20

    if bullish and rsi < 70 and not near_high:
        return {"call": "BUY", "reason": f"Uptrend (EMA20>EMA50), RSI {rsi} not overbought", "rsi": rsi}
    if bullish:
        return {"call": "HOLD", "reason": f"Uptrend intact but stretched (RSI {rsi}, near 20d high)", "rsi": rsi}
    if bearish and rsi > 30 and not near_low:
        return {"call": "SELL", "reason": f"Downtrend (EMA20<EMA50), RSI {rsi} not oversold", "rsi": rsi}
    if bearish:
        return {"call": "HOLD", "reason": f"Downtrend but near-term oversold (RSI {rsi}) — avoid chasing exit", "rsi": rsi}
    return {"call": "HOLD", "reason": f"No clear trend (RSI {rsi})", "rsi": rsi}


def get_holdings_snapshot(force: bool = False) -> dict:
    now = time.time()
    if not force and _cache["data"] and now - _cache["ts"] < _CACHE_TTL:
        return _cache["data"]

    kite = get_kite()
    raw = kite.holdings()
    rows, total_invested, total_current, total_day_pnl = [], 0.0, 0.0, 0.0

    for h in raw:
        qty, avg, ltp = h.get("quantity", 0), h.get("average_price", 0), h.get("last_price", 0)
        if not qty:
            continue
        invested = qty * avg
        current  = qty * ltp
        day_pnl  = h.get("day_change", 0) * qty
        total_invested += invested; total_current += current; total_day_pnl += day_pnl
        rec = _recommend(h.get("instrument_token"))
        rows.append({
            "symbol": h.get("tradingsymbol"), "qty": qty,
            "avg_price": round(avg, 2), "ltp": round(ltp, 2),
            "invested": round(invested, 2), "current_value": round(current, 2),
            "pnl": round(current - invested, 2),
            "pnl_pct": round(((current - invested) / invested * 100) if invested else 0, 2),
            "day_change_pct": h.get("day_change_percentage", 0),
            "recommendation": rec["call"], "reason": rec["reason"], "rsi": rec["rsi"],
        })

    rows.sort(key=lambda r: r["current_value"], reverse=True)
    for r in rows:
        r["allocation_pct"] = round((r["current_value"] / total_current * 100) if total_current else 0, 2)

    concentration_flags = [
        f"{r['symbol']} is {r['allocation_pct']:.0f}% of holdings — concentrated position"
        for r in rows if r["allocation_pct"] > 25
    ]

    data = {
        "holdings": rows,
        "total_invested": round(total_invested, 2),
        "total_current_value": round(total_current, 2),
        "total_pnl": round(total_current - total_invested, 2),
        "total_pnl_pct": round(((total_current - total_invested) / total_invested * 100) if total_invested else 0, 2),
        "total_day_pnl": round(total_day_pnl, 2),
        "concentration_flags": concentration_flags,
        "updated_at": datetime.now().isoformat(),
    }
    _cache.update(data=data, ts=now)
    return data


def get_available_funds() -> float:
    """Live Zerodha equity available balance — used by option_filter's
    fund-based sizing (LTP <= available_funds / (lot_size * 2))."""
    try:
        m = get_kite().margins()
        return float(((m.get("equity", {}) or {}).get("available", {}) or {}).get("live_balance", 0) or 0)
    except Exception as e:
        print(f"[Portfolio] get_available_funds: {e}")
        return 0.0


def get_exposure_factor() -> dict:
    """Margin-utilization read -> lot-size multiplier for the scalper's sizing."""
    try:
        m  = get_kite().margins()
        eq = m.get("equity", {})
        available = (eq.get("available", {}) or {}).get("live_balance", 0) or 0
        used      = (eq.get("utilised", {}) or {}).get("debits", 0) or 0
        total     = available + used
        util_pct  = (used / total * 100) if total else 0
    except Exception:
        return {"utilization_pct": None, "lot_multiplier": 1.0, "reason": "Margin data unavailable"}

    if util_pct >= 80:
        return {"utilization_pct": round(util_pct, 1), "lot_multiplier": 0.5,
                "reason": f"Margin utilization {util_pct:.0f}% — sizing halved"}
    if util_pct >= 60:
        return {"utilization_pct": round(util_pct, 1), "lot_multiplier": 0.75,
                "reason": f"Margin utilization {util_pct:.0f}% — sizing trimmed"}
    return {"utilization_pct": round(util_pct, 1), "lot_multiplier": 1.0, "reason": "Normal sizing"}
