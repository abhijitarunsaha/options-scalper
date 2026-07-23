import os
from dotenv import load_dotenv
load_dotenv()

INDEX_MAP = {
    "NIFTY": {
        "name": "NIFTY", "token": 256265, "exchange": "NSE",
        "nfo_name": "NIFTY", "strike_step": 50,
        "lot_size_env": "NIFTY_LOT_SIZE", "default_lot": 65,
    },
    "BANKNIFTY": {
        "name": "BANKNIFTY", "token": 260105, "exchange": "NSE",
        "nfo_name": "BANKNIFTY", "strike_step": 100,
        "lot_size_env": "BANKNIFTY_LOT_SIZE", "default_lot": 30,
    },
    "SENSEX": {
        "name": "SENSEX", "token": 265, "exchange": "BSE",
        "nfo_name": "SENSEX", "strike_step": 100,
        "lot_size_env": "SENSEX_LOT_SIZE", "default_lot": 20,
    },
}

def get_index_cfg(index=None):
    key = (index or os.environ.get("DEFAULT_INDEX", "NIFTY")).upper()
    return INDEX_MAP.get(key, INDEX_MAP["NIFTY"])

def _hm(env, default):
    h, m = os.environ.get(env, default).split(":")
    return int(h), int(m)

MIN_CANDLES              = int(os.environ.get("MIN_CANDLES", 10))
SIGNAL_THRESHOLD_STRONG  = int(os.environ.get("SIGNAL_THRESHOLD_STRONG",   7))
SIGNAL_THRESHOLD_MODERATE= int(os.environ.get("SIGNAL_THRESHOLD_MODERATE", 5))
SIGNAL_THRESHOLD_SCOUT   = int(os.environ.get("SIGNAL_THRESHOLD_SCOUT",    3))

MARKET_OPEN_H,  MARKET_OPEN_M  = _hm("MARKET_OPEN",  "09:15")
SIGNAL_START_H, SIGNAL_START_M = _hm("SIGNAL_START", "09:20")
SIGNAL_END_H,   SIGNAL_END_M   = _hm("SIGNAL_END",   "15:15")
MARKET_CLOSE_H, MARKET_CLOSE_M = _hm("MARKET_CLOSE", "15:30")

# ── Signal-stability / anti-overtrading (regime-aware confirmation) ────────────
# OPENING_RANGE: 09:15 -> OPENING_RANGE_END — fast lane, OR-breakout entries allowed
#                immediately so the day's first/biggest move isn't missed.
# COMPRESSION:   range squeeze (falling BB width + ATR) — early "pre-move" flag,
#                fires on first confirmed breakout of the squeeze.
# STEADY_STATE:  rest of the session — requires CONFIRM_BARS consecutive bars in the
#                same direction + COOLDOWN_MINUTES since the last actionable fire in
#                that direction, so a single ongoing move doesn't retrigger every bar.
OPENING_RANGE_END_H, OPENING_RANGE_END_M = _hm("OPENING_RANGE_END", "09:30")
CONFIRM_BARS              = int(os.environ.get("CONFIRM_BARS", 5))
COOLDOWN_MINUTES          = int(os.environ.get("COOLDOWN_MINUTES", 6))
# GLOBAL_COOLDOWN / MIN_MOVE_ATR_MULT: cross-direction guard. Even a persistent,
# regime-eligible signal only fires if GLOBAL_COOLDOWN_MINUTES have passed OR the
# index has moved >= MIN_MOVE_ATR_MULT x ATR since the last actionable fire in
# EITHER direction (a same-tier STRONG signal can override the cooldown). This is
# what stops a CE signal and a PE signal firing 2 minutes apart on ordinary chop.
GLOBAL_COOLDOWN_MINUTES   = int(os.environ.get("GLOBAL_COOLDOWN_MINUTES", 10))
MIN_MOVE_ATR_MULT         = float(os.environ.get("MIN_MOVE_ATR_MULT", 1.2))
COMPRESSION_BB_WIDTH_DROP = float(os.environ.get("COMPRESSION_BB_WIDTH_DROP", 0.15))
COMPRESSION_ATR_DROP      = float(os.environ.get("COMPRESSION_ATR_DROP", 0.10))
TREND_LOOKBACK_BARS       = int(os.environ.get("TREND_LOOKBACK_BARS", 20))  # ~20-30 min on 1-min candles

# Minimum index-point distance a projected target must clear before a signal
# counts as actionable / before the S/R ladder will use a level as a target.
# This is the direct fix for signals firing with only a 2-5pt "target" —
# too close to be a real trade, just noise around the current price.
MIN_INDEX_TARGET_POINTS   = float(os.environ.get("MIN_INDEX_TARGET_POINTS", 20))

BUDGET_PER_LOT  = int(os.environ.get("BUDGET_PER_LOT",  2500))
SL_LIMIT_PCT    = float(os.environ.get("SL_LIMIT_PCT",   20))
TRAILING_SL_PCT = float(os.environ.get("TRAILING_SL_PCT", 5))
TAKE_PROFIT_PCT = float(os.environ.get("TAKE_PROFIT_PCT", 95))
MIN_TARGET_GAP  = float(os.environ.get("MIN_TARGET_GAP",   8))

TREND_EMA_FAST = int(os.environ.get("TREND_EMA_FAST",  9))
TREND_EMA_SLOW = int(os.environ.get("TREND_EMA_SLOW", 21))
TREND_EMA_LONG = int(os.environ.get("TREND_EMA_LONG", 50))

# ── Options greeks + monthly S/R (used by option_filter.py / trend_predictor.py) ──
RISK_FREE_RATE       = float(os.environ.get("RISK_FREE_RATE", 0.068))  # ~India T-bill
MONTHLY_LOOKBACK_DAYS = int(os.environ.get("MONTHLY_LOOKBACK_DAYS", 35))
# OI momentum sampling window (main.py's oi_tracker records one snapshot per
# closed 1-min candle, so these are in *snapshots*, i.e. minutes)
OI_MOMENTUM_SHORT_MIN = int(os.environ.get("OI_MOMENTUM_SHORT_MIN", 5))
OI_MOMENTUM_LONG_MIN  = int(os.environ.get("OI_MOMENTUM_LONG_MIN", 15))
