"""
indicators.py
Computes all technical indicators, price-action patterns, volume analysis,
swing levels, and the multi-timeframe trend classifier.
"""
import pandas as pd
import numpy as np
from ta.momentum import RSIIndicator
from ta.trend import EMAIndicator, MACD
from ta.volatility import BollingerBands, AverageTrueRange
from config import MIN_CANDLES, TREND_EMA_FAST, TREND_EMA_SLOW, TREND_EMA_LONG
from trend_context import classify_regime


# ── Trend classification ──────────────────────────────────────────────────────
# Returns: "BULLISH_TREND" | "BEARISH_TREND" | "RANGING"
def classify_trend(df: pd.DataFrame) -> dict:
    close = df["close"]
    n = len(df)

    e_fast = EMAIndicator(close=close, window=min(TREND_EMA_FAST, n)).ema_indicator()
    e_slow = EMAIndicator(close=close, window=min(TREND_EMA_SLOW, n)).ema_indicator()
    e_long = EMAIndicator(close=close, window=min(TREND_EMA_LONG, n)).ema_indicator()

    ef_now  = float(e_fast.iloc[-1]) if pd.notna(e_fast.iloc[-1]) else 0
    es_now  = float(e_slow.iloc[-1]) if pd.notna(e_slow.iloc[-1]) else 0
    el_now  = float(e_long.iloc[-1]) if pd.notna(e_long.iloc[-1]) else 0
    ltp     = float(close.iloc[-1])

    # Slope of fast EMA over last 5 bars (trend momentum)
    ef_5ago = float(e_fast.iloc[-6]) if len(e_fast) >= 6 and pd.notna(e_fast.iloc[-6]) else ef_now
    ema_slope = ef_now - ef_5ago

    # EMA stack alignment
    bullish_stack = ef_now > es_now > el_now and ltp > ef_now
    bearish_stack = ef_now < es_now < el_now and ltp < ef_now

    # Trend strength: how many EMA pairs align
    bull_pts = (1 if ef_now > es_now else 0) + (1 if es_now > el_now else 0) + (1 if ltp > ef_now else 0)
    bear_pts = (1 if ef_now < es_now else 0) + (1 if es_now < el_now else 0) + (1 if ltp < ef_now else 0)

    if bull_pts >= 3 and ema_slope > 0:
        trend = "BULLISH_TREND"
    elif bear_pts >= 3 and ema_slope < 0:
        trend = "BEARISH_TREND"
    elif bull_pts == 2:
        trend = "WEAK_BULLISH"
    elif bear_pts == 2:
        trend = "WEAK_BEARISH"
    else:
        trend = "RANGING"

    return {
        "trend":       trend,
        "ema_slope":   round(ema_slope, 2),
        "bull_pts":    bull_pts,
        "bear_pts":    bear_pts,
        "ema_fast":    round(ef_now, 2),
        "ema_slow":    round(es_now, 2),
        "ema_long":    round(el_now, 2),
    }


# ── Candle patterns ───────────────────────────────────────────────────────────
def _bullish_engulfing(df, i):
    if i < 1: return False
    p, c = df.iloc[i-1], df.iloc[i]
    return (c["close"] > c["open"] and p["close"] < p["open"]
            and c["open"] <= p["close"] and c["close"] >= p["open"])

def _bearish_engulfing(df, i):
    if i < 1: return False
    p, c = df.iloc[i-1], df.iloc[i]
    return (c["close"] < c["open"] and p["close"] > p["open"]
            and c["open"] >= p["close"] and c["close"] <= p["open"])

def _hammer(row):
    body       = abs(row["close"] - row["open"])
    lo_wick    = min(row["close"], row["open"]) - row["low"]
    up_wick    = row["high"] - max(row["close"], row["open"])
    return body > 0 and lo_wick >= 2 * body and up_wick <= 0.3 * body

def _shooting_star(row):
    body    = abs(row["close"] - row["open"])
    up_wick = row["high"] - max(row["close"], row["open"])
    lo_wick = min(row["close"], row["open"]) - row["low"]
    return body > 0 and up_wick >= 2 * body and lo_wick <= 0.3 * body

def _doji(row):
    body  = abs(row["close"] - row["open"])
    rng   = row["high"] - row["low"]
    return rng > 0 and body / rng < 0.1

def _inside_bar(df, i):
    if i < 1: return False
    p, c = df.iloc[i-1], df.iloc[i]
    return c["high"] <= p["high"] and c["low"] >= p["low"]

def _three_white_soldiers(df, i):
    if i < 2: return False
    bars = [df.iloc[i-2], df.iloc[i-1], df.iloc[i]]
    return all(b["close"] > b["open"] for b in bars) and \
           bars[1]["close"] > bars[0]["close"] and bars[2]["close"] > bars[1]["close"]

def _three_black_crows(df, i):
    if i < 2: return False
    bars = [df.iloc[i-2], df.iloc[i-1], df.iloc[i]]
    return all(b["close"] < b["open"] for b in bars) and \
           bars[1]["close"] < bars[0]["close"] and bars[2]["close"] < bars[1]["close"]


# ── Swing levels ──────────────────────────────────────────────────────────────
def swing_levels(df, lookback=20):
    win  = df.tail(lookback)
    highs = win["high"].values
    lows  = win["low"].values
    sh, sl = [], []
    for j in range(1, len(highs) - 1):
        if highs[j] > highs[j-1] and highs[j] > highs[j+1]: sh.append(highs[j])
        if lows[j]  < lows[j-1]  and lows[j]  < lows[j+1]:  sl.append(lows[j])
    ltp = float(df["close"].iloc[-1])
    res = min((h for h in sh if h > ltp), default=None)
    sup = max((l for l in sl if l < ltp), default=None)
    return {
        "swing_resistance": round(res, 2) if res else None,
        "swing_support":    round(sup, 2) if sup else None,
    }


# ── Volume ────────────────────────────────────────────────────────────────────
def volume_analysis(df, lookback=10):
    avg = df["volume"].tail(lookback + 1).iloc[:-1].mean()
    cur = float(df["volume"].iloc[-1])
    ratio = round(cur / avg, 2) if avg > 0 else 1.0
    return {"volume_ratio": ratio, "volume_spike": ratio >= 1.5, "avg_volume": avg}


# ── Main compute ──────────────────────────────────────────────────────────────
def compute_all(candles: list, vix: float | None = None) -> dict:
    if len(candles) < MIN_CANDLES:
        return {}

    df = pd.DataFrame(candles)
    df["time"] = pd.to_datetime(df["time"])
    df = df.sort_values("time").reset_index(drop=True)
    close = df["close"]

    n = len(df)

    # BB
    w = min(20, n)
    bb = BollingerBands(close=close, window=w, window_dev=2)
    df["bb_upper"] = bb.bollinger_hband()
    df["bb_mid"]   = bb.bollinger_mavg()
    df["bb_lower"] = bb.bollinger_lband()
    df["bb_width"] = bb.bollinger_wband()
    df["bb_pct"]   = bb.bollinger_pband()   # % position 0=lower 1=upper

    # RSI
    df["rsi"]       = RSIIndicator(close=close, window=min(14, n-1)).rsi()
    df["rsi_slope"] = df["rsi"].diff(3)

    # EMAs
    df["ema9"]  = EMAIndicator(close=close, window=min(9,  n)).ema_indicator()
    df["ema21"] = EMAIndicator(close=close, window=min(21, n)).ema_indicator()
    df["ema50"] = EMAIndicator(close=close, window=min(50, n)).ema_indicator()

    # MACD
    if n >= 26:
        m = MACD(close=close, window_slow=26, window_fast=12, window_sign=9)
        df["macd"]        = m.macd()
        df["macd_signal"] = m.macd_signal()
        df["macd_hist"]   = m.macd_diff()
    else:
        df["macd"] = df["macd_signal"] = df["macd_hist"] = np.nan

    # ATR
    df["atr"] = AverageTrueRange(high=df["high"], low=df["low"], close=close, window=min(14, n)).average_true_range()

    # VWAP
    df["typical"]     = (df["high"] + df["low"] + df["close"]) / 3
    df["cum_vol"]     = df["volume"].cumsum()
    df["cum_tp_vol"]  = (df["typical"] * df["volume"]).cumsum()
    df["vwap"]        = np.where(df["cum_vol"] > 0, df["cum_tp_vol"] / df["cum_vol"], close)

    # Fibonacci
    sh = float(df["high"].max())
    sl = float(df["low"].min())
    rng = sh - sl or 1
    fib = {k: round(sl + r * rng, 2) for k, r in
           {"0": 0, "23.6": .236, "38.2": .382, "50.0": .5, "61.8": .618, "78.6": .786, "100": 1}.items()}

    # Price action
    li = n - 1
    lr = df.iloc[li]
    pa = {
        "bullish_engulfing": _bullish_engulfing(df, li),
        "bearish_engulfing": _bearish_engulfing(df, li),
        "hammer":            _hammer(lr),
        "shooting_star":     _shooting_star(lr),
        "doji":              _doji(lr),
        "inside_bar":        _inside_bar(df, li),
        "three_white":       _three_white_soldiers(df, li),
        "three_black":       _three_black_crows(df, li),
        "bullish_candle":    bool(lr["close"] > lr["open"]),
        "bearish_candle":    bool(lr["close"] < lr["open"]),
    }

    sw     = swing_levels(df)
    vol    = volume_analysis(df)
    trn    = classify_trend(df)
    regime = classify_regime(df, candles)

    atr_v = float(df["atr"].iloc[-1]) if pd.notna(df["atr"].iloc[-1]) else 1
    ltp   = float(close.iloc[-1])
    breakout  = bool(sw["swing_resistance"] and ltp > sw["swing_resistance"] + 0.2 * atr_v)
    breakdown = bool(sw["swing_support"]    and ltp < sw["swing_support"]    - 0.2 * atr_v)

    def s(v): return round(float(v), 2) if pd.notna(v) else None

    cols = ["time","open","high","low","close","volume",
            "bb_upper","bb_mid","bb_lower","bb_width","bb_pct",
            "rsi","rsi_slope","ema9","ema21","ema50","vwap","atr",
            "macd","macd_signal","macd_hist"]
    rec = df[cols].copy()
    rec["time"] = rec["time"].apply(lambda x: x.isoformat())
    rec = rec.where(pd.notna(rec), other=None)

    return {
        "candles":      rec.to_dict(orient="records"),
        "fibonacci":    fib,
        "session_high": sh, "session_low": sl,
        "vix":          vix,
        "price_action": pa,
        "swing":        sw,
        "volume":       vol,
        "trend":        trn,
        "regime":       regime,
        "breakout":     {"breakout": breakout, "breakdown": breakdown},
        "latest": {
            "ltp":       round(ltp, 2),
            "rsi":       s(df["rsi"].iloc[-1]) or 50,
            "rsi_slope": s(df["rsi_slope"].iloc[-1]) or 0,
            "vwap":      s(df["vwap"].iloc[-1]),
            "ema9":      s(df["ema9"].iloc[-1]),
            "ema21":     s(df["ema21"].iloc[-1]),
            "ema50":     s(df["ema50"].iloc[-1]),
            "bb_upper":  s(df["bb_upper"].iloc[-1]),
            "bb_mid":    s(df["bb_mid"].iloc[-1]),
            "bb_lower":  s(df["bb_lower"].iloc[-1]),
            "bb_pct":    s(df["bb_pct"].iloc[-1]),
            "atr":       atr_v,
            "macd_hist": s(df["macd_hist"].iloc[-1]),
            "vix":       round(vix, 2) if vix else None,
            # trend
            "trend":        trn["trend"],
            "ema_slope":    trn["ema_slope"],
            # price action
            **{k: pa[k] for k in pa},
            # volume
            "volume_ratio": vol["volume_ratio"],
            "volume_spike": vol["volume_spike"],
            # swing
            "swing_resistance": sw["swing_resistance"],
            "swing_support":    sw["swing_support"],
            "breakout":   breakout,
            "breakdown":  breakdown,
            # regime snapshot
            "regime_mode":      regime["mode"],
            "opening_range":    regime["opening_range"],
            "compressing":      regime["compression"]["compressing"],
            "trend_persistence_bars": regime["persistence"]["persistence_bars"],
            "vwap_slope":       regime["persistence"]["vwap_slope"],
        },
    }
