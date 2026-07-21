"""
trend_context.py — Regime classification feeding the 3-lane signal-confirmation
system in signal_engine.py:

  OPENING_RANGE : 09:15 -> OPENING_RANGE_END. Fast lane — an OR high/low
                  breakout fires immediately, no persistence wait, so the
                  day's first/biggest move (often in the first 5-15 min)
                  isn't lost waiting on multi-bar confirmation.

  COMPRESSION   : BB width + ATR both contracting over the last 10 bars —
                  a squeeze. The 1-2-3 "pre-move" bars the trader watches
                  for. First confirmed breakout out of the squeeze fires
                  immediately (this pattern IS the confirmation).

  STEADY_STATE  : everything else. Full persistence (CONFIRM_BARS consecutive
                  same-direction bars) + cooldown gating applies here — this
                  is the lane that was causing repeat re-fires on every tick
                  of an already-known move.
"""
from datetime import datetime
import pandas as pd
import pytz
from config import (
    MARKET_OPEN_H, MARKET_OPEN_M, OPENING_RANGE_END_H, OPENING_RANGE_END_M,
    COMPRESSION_BB_WIDTH_DROP, COMPRESSION_ATR_DROP, TREND_LOOKBACK_BARS,
)

IST = pytz.timezone("Asia/Kolkata")


def in_opening_range() -> bool:
    now = datetime.now(IST)
    start = (MARKET_OPEN_H, MARKET_OPEN_M)
    end   = (OPENING_RANGE_END_H, OPENING_RANGE_END_M)
    return start <= (now.hour, now.minute) < end


def opening_range_levels(candles: list):
    """High/low formed so far today (used as the OR breakout reference)."""
    if not candles:
        return None, None
    today = datetime.now(IST).date()
    todays = [c for c in candles if pd.to_datetime(c["time"]).date() == today]
    if not todays:
        return None, None
    return max(c["high"] for c in todays), min(c["low"] for c in todays)


def compression_score(df: pd.DataFrame) -> dict:
    """Range-squeeze detector: BB width and ATR both contracting over 10 bars."""
    bw  = df["bb_width"].tail(10).dropna()
    atr = df["atr"].tail(10).dropna()
    if len(bw) < 5 or len(atr) < 5:
        return {"compressing": False, "bb_width_chg": 0.0, "atr_chg": 0.0}
    bw_chg  = (bw.iloc[-1]  - bw.iloc[0])  / (bw.iloc[0]  or 1)
    atr_chg = (atr.iloc[-1] - atr.iloc[0]) / (atr.iloc[0] or 1)
    compressing = bw_chg <= -COMPRESSION_BB_WIDTH_DROP and atr_chg <= -COMPRESSION_ATR_DROP
    return {"compressing": bool(compressing), "bb_width_chg": round(bw_chg, 3), "atr_chg": round(atr_chg, 3)}


def trend_persistence(df: pd.DataFrame, lookback: int = TREND_LOOKBACK_BARS) -> dict:
    """
    20-30 min forward-lean features (NOT a blackout window — just the lookback
    an indicator uses): VWAP slope over the window + how many consecutive bars
    EMA9 has been moving the same direction.
    """
    win = df.tail(lookback)
    if len(win) < 5:
        return {"vwap_slope": 0.0, "persistence_bars": 0, "direction": "NONE"}

    vwap_slope = float(win["vwap"].iloc[-1] - win["vwap"].iloc[0])
    diffs = win["ema9"].diff().dropna()
    if diffs.empty:
        return {"vwap_slope": round(vwap_slope, 2), "persistence_bars": 0, "direction": "NONE"}

    direction = "UP" if diffs.iloc[-1] > 0 else "DOWN" if diffs.iloc[-1] < 0 else "NONE"
    persistence = 0
    for d in diffs.iloc[::-1]:
        if (direction == "UP" and d > 0) or (direction == "DOWN" and d < 0):
            persistence += 1
        else:
            break
    return {"vwap_slope": round(vwap_slope, 2), "persistence_bars": persistence, "direction": direction}


def classify_regime(df: pd.DataFrame, candles: list) -> dict:
    or_high, or_low = opening_range_levels(candles)
    comp = compression_score(df)
    pers = trend_persistence(df)

    if in_opening_range():
        mode = "OPENING_RANGE"
    elif comp["compressing"]:
        mode = "COMPRESSION"
    else:
        mode = "STEADY_STATE"

    return {
        "mode": mode,
        "opening_range": {"high": or_high, "low": or_low},
        "compression": comp,
        "persistence": pers,
    }
