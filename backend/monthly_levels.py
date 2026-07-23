"""
monthly_levels.py — support/resistance from the last ~35 calendar days of
daily candles, cached for a few hours since these levels barely move intraday.

Complements the intraday pivot ladder in trend_predictor.py, which only sees
the current session (or last ~60 minutes) and so has nothing to offer early
in the day, or for a level the market hasn't revisited yet today.
"""
import time
from datetime import datetime, timedelta
from kite_auth import get_kite
from config import get_index_cfg, MONTHLY_LOOKBACK_DAYS

_CACHE_TTL = 4 * 3600  # 4 hours
_cache: dict = {}


def _pivots(vals, kind):
    out = []
    for i in range(1, len(vals) - 1):
        if kind == "high" and vals[i] > vals[i - 1] and vals[i] > vals[i + 1]:
            out.append(vals[i])
        if kind == "low" and vals[i] < vals[i - 1] and vals[i] < vals[i + 1]:
            out.append(vals[i])
    return out


def get_monthly_levels(index: str = "NIFTY") -> dict:
    """Returns {'above': [...], 'below': [...], 'month_high':, 'month_low':}
    relative to nothing in particular — callers filter by current LTP."""
    now = time.time()
    hit = _cache.get(index)
    if hit and now - hit["ts"] < _CACHE_TTL:
        return hit["data"]

    cfg = get_index_cfg(index)
    try:
        kite = get_kite()
        to_d = datetime.now()
        from_d = to_d - timedelta(days=MONTHLY_LOOKBACK_DAYS)
        candles = kite.historical_data(cfg["token"], from_d, to_d, "day")
    except Exception as e:
        print(f"[MonthlyLevels] {index}: {e}")
        candles = []

    if len(candles) < 5:
        data = {"levels": [], "month_high": None, "month_low": None, "ready": False}
    else:
        highs = [c["high"] for c in candles]
        lows  = [c["low"] for c in candles]
        levels = sorted(set(round(v, 1) for v in _pivots(highs, "high") + _pivots(lows, "low")))
        data = {"levels": levels, "month_high": round(max(highs), 1),
                "month_low": round(min(lows), 1), "ready": True}

    _cache[index] = {"data": data, "ts": now}
    return data
