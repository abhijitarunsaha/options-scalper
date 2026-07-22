import os, asyncio
from datetime import datetime
from collections import deque
from kiteconnect import KiteTicker
from kite_auth import get_kite
from config import get_index_cfg
from dotenv import load_dotenv
load_dotenv()

candles: deque = deque(maxlen=300)
current_candle: dict = {}
broadcast_callbacks: list = []
_ticker = None
_main_loop = None
_active_index = os.environ.get("DEFAULT_INDEX", "NIFTY").upper()

def set_event_loop(loop): global _main_loop; _main_loop = loop

def _tick_to_candle(tick):
    global current_candle
    ltp    = tick["last_price"]
    minute = datetime.now().replace(second=0, microsecond=0)
    if not current_candle or current_candle["time"] != minute:
        if current_candle:
            closed = dict(current_candle)
            candles.append(closed)
            if _main_loop and _main_loop.is_running():
                for cb in broadcast_callbacks:
                    asyncio.run_coroutine_threadsafe(cb(closed), _main_loop)
        current_candle = {"time": minute, "open": ltp, "high": ltp, "low": ltp,
                          "close": ltp, "volume": tick.get("volume_traded", tick.get("volume", 0))}
    else:
        current_candle["high"]   = max(current_candle["high"], ltp)
        current_candle["low"]    = min(current_candle["low"],  ltp)
        current_candle["close"]  = ltp
        current_candle["volume"] = tick.get("volume_traded", tick.get("volume", current_candle["volume"]))

def start_ticker(index=None):
    global _ticker, _active_index
    cfg = get_index_cfg(index)
    _active_index = cfg["name"]
    token = cfg["token"]
    kite  = get_kite()
    t     = KiteTicker(os.environ["KITE_API_KEY"], kite.access_token)
    t.on_ticks   = lambda ws, ticks: [_tick_to_candle(tk) for tk in ticks if tk["instrument_token"] == token]
    t.on_connect = lambda ws, _: (ws.subscribe([token]), ws.set_mode(ws.MODE_FULL, [token]))
    t.on_error   = lambda ws, c, r: print(f"[Ticker] {c}: {r}")
    t.connect(threaded=True)
    _ticker = t
    return t

def switch_index(new_index):
    global current_candle
    stop_ticker(); current_candle = {}; start_ticker(new_index)

def stop_ticker():
    global _ticker
    if _ticker:
        try: _ticker.close()
        except: pass
        _ticker = None
    candles.clear()

def get_candles() -> list: return list(candles)
def get_current_candle() -> dict | None: return dict(current_candle) if current_candle else None
def get_active_index() -> str: return _active_index
def register_broadcast(cb):
    if cb not in broadcast_callbacks: broadcast_callbacks.append(cb)
