"""
oi_tracker.py — 5/15-minute OI momentum, sampled once per closed 1-min candle.

The option chain's own per-strike "oi_change" field (option_filter.get_oi_chain)
is today's cumulative change vs the day's OI low — useful for the chain display,
but not the "change over the last 5-15 minutes" read the signal engine needs.
This keeps a short rolling history of the aggregate CE/PE OI (summed across the
active strike range) per index, sampled each time main.py's broadcast loop runs,
and reports the actual short-window deltas + a resulting bias.
"""
from collections import deque
from datetime import datetime

_MAXLEN = 20  # ~20 one-minute snapshots is plenty for a 15-min lookback

_history: dict = {}


def record(index: str, ce_oi_total: float, pe_oi_total: float) -> None:
    hist = _history.setdefault(index, deque(maxlen=_MAXLEN))
    hist.append({"t": datetime.now(), "ce": ce_oi_total, "pe": pe_oi_total})


def _at_or_before(hist: deque, minutes_ago: int):
    now = datetime.now()
    candidate = None
    for snap in hist:
        age_min = (now - snap["t"]).total_seconds() / 60
        if age_min >= minutes_ago:
            candidate = snap
        else:
            break
    return candidate or (hist[0] if hist else None)


def momentum(index: str, short_min: int = 5, long_min: int = 15) -> dict:
    hist = _history.get(index)
    if not hist:
        return {"ce_oi_chg_5m": 0, "pe_oi_chg_5m": 0, "ce_oi_chg_15m": 0, "pe_oi_chg_15m": 0,
                "pcr": 1.0, "bias": "NEUTRAL", "ready": False}
    latest = hist[-1]
    s5  = _at_or_before(hist, short_min)
    s15 = _at_or_before(hist, long_min)
    ce5  = latest["ce"] - (s5["ce"] if s5 else latest["ce"])
    pe5  = latest["pe"] - (s5["pe"] if s5 else latest["pe"])
    ce15 = latest["ce"] - (s15["ce"] if s15 else latest["ce"])
    pe15 = latest["pe"] - (s15["pe"] if s15 else latest["pe"])
    pcr  = round(latest["pe"] / latest["ce"], 3) if latest["ce"] else 1.0

    # Bias read: PE OI building faster than CE = writers defending upside (bullish
    # for the underlying, since PE writers profit if price stays above the strike),
    # and vice versa. This is the standard "OI build vs price move" options-writer read.
    bias = "NEUTRAL"
    if pe15 > 0 and pe15 > ce15 * 1.2:
        bias = "BULLISH"
    elif ce15 > 0 and ce15 > pe15 * 1.2:
        bias = "BEARISH"

    return {
        "ce_oi_chg_5m": round(ce5), "pe_oi_chg_5m": round(pe5),
        "ce_oi_chg_15m": round(ce15), "pe_oi_chg_15m": round(pe15),
        "pcr": pcr, "bias": bias, "ready": len(hist) >= 3,
    }
