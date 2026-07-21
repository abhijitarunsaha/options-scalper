"""
main.py — FastAPI backend for NIFTY50 Scalper
"""
import os, json, asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

from kite_auth import get_login_url, generate_session, check_session
from data_feed import start_ticker, stop_ticker, get_candles, get_active_index, register_broadcast, set_event_loop, switch_index
from indicators import compute_all
from signal_engine import evaluate_signals
from option_filter import get_affordable_options, get_oi_chain, get_vix
from fii_dii import get_fii_dii
import portfolio
from trade_manager import (place_trade, exit_trade, cancel_order, modify_order,
    get_active_trades, get_all_trades, refresh_live_pnl, refresh_order_statuses)
from config import get_index_cfg, BUDGET_PER_LOT, MIN_CANDLES, SL_LIMIT_PCT, TRAILING_SL_PCT

load_dotenv()
app = FastAPI(title="NIFTY50 Scalper API", version="3.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

ws_clients: list[WebSocket] = []
_vix_cache: float | None = None
_vix_prev:  float | None = None
_fii_dii_cache: dict = {}

# ── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    loop = asyncio.get_running_loop()
    set_event_loop(loop)
    if check_session():
        start_ticker(); register_broadcast(_broadcast)
    else:
        print(f"[Startup] Login needed: {get_login_url()}")

# ── Session guard ─────────────────────────────────────────────────────────────
@app.middleware("http")
async def session_guard(request, call_next):
    guarded = request.url.path.startswith(("/data/","/trade/","/ws/"))
    if guarded and not check_session():
        return JSONResponse(status_code=401,
            content={"authenticated":False,"login_url":get_login_url()})
    return await call_next(request)

# ── Auth ──────────────────────────────────────────────────────────────────────
@app.get("/auth/login")
async def auth_login(): return {"login_url": get_login_url()}

@app.get("/auth/callback")
async def auth_callback(request_token: str):
    token = generate_session(request_token)
    set_event_loop(asyncio.get_running_loop())
    start_ticker(); register_broadcast(_broadcast)
    return {"status":"authenticated","token_preview":token[:8]+"..."}

@app.get("/auth/status")
async def auth_status():
    v = check_session()
    return {"authenticated":v,"login_url":None if v else get_login_url()}

# ── Data ──────────────────────────────────────────────────────────────────────
@app.post("/data/switch-index")
async def switch_idx(index: str = Query(...)):
    switch_index(index)
    return {"status":"switched","index":index}

@app.get("/data/indicators")
async def get_indicators():
    c = get_candles(); r = compute_all(c, vix=_vix_cache)
    if not r: return JSONResponse(202, {"message":f"Need {MIN_CANDLES} candles","candle_count":len(c)})
    return r

@app.get("/data/signal")
async def get_signal(): return _build_signal()

@app.get("/data/options")
async def get_options(budget:int=Query(default=None), index:str=Query(default=None)):
    return get_affordable_options(_build_signal(), index or get_active_index(), budget or BUDGET_PER_LOT)

@app.get("/data/oi-chain")
async def oi_chain(range_pts:int=200, index:str=Query(default=None)):
    idx = index or get_active_index()
    c   = get_candles()
    ltp = (compute_all(c) or {}).get("latest",{}).get("ltp", 0)
    if not ltp: return {"chain":[],"message":"No LTP yet"}
    return {"chain":get_oi_chain(ltp, idx, range_pts),"ltp":ltp,"index":idx}

@app.get("/data/vix")
async def vix_ep(): return {"vix":_vix_cache}

@app.get("/data/fii-dii")
async def fii_dii_ep(): return get_fii_dii()

@app.get("/data/candles")
async def raw_candles(): return {"count":len(get_candles()),"candles":get_candles()}

@app.get("/data/config")
async def get_config():
    idx = get_active_index(); cfg = get_index_cfg(idx)
    lot = int(os.environ.get(cfg["lot_size_env"], cfg["default_lot"]))
    return {
        "default_index":idx,"lot_size":lot,
        "min_candles":MIN_CANDLES,"budget_per_lot":BUDGET_PER_LOT,
        "sl_limit_pct":SL_LIMIT_PCT,"trailing_sl_pct":TRAILING_SL_PCT,
        "min_premium":round(BUDGET_PER_LOT/(2*lot),2),
        "max_premium":round(BUDGET_PER_LOT/lot,2),
    }

# ── Portfolio (holdings, recommendations, margin-exposure sizing) ─────────────
@app.get("/data/portfolio/holdings")
async def portfolio_holdings(refresh: bool = Query(default=False)):
    try: return portfolio.get_holdings_snapshot(force=refresh)
    except Exception as e: return JSONResponse(400, {"error": str(e)})

@app.get("/data/portfolio/exposure")
async def portfolio_exposure():
    return portfolio.get_exposure_factor()

@app.post("/data/reload")
async def reload():
    idx = get_active_index(); stop_ticker(); start_ticker(idx)
    register_broadcast(_broadcast)
    return {"status":"reloaded","index":idx}

# ── Trade endpoints ───────────────────────────────────────────────────────────
@app.post("/trade/execute")
async def execute(body: dict):
    try:
        t = place_trade(body["option"], int(body.get("lots",1)),
                        body.get("index", get_active_index()),
                        body.get("limit_price"))
        return {"status":"executed","trade":t}
    except Exception as e: return JSONResponse(400,{"error":str(e)})

@app.post("/trade/exit/{trade_id}")
async def exit_t(trade_id:str, body:dict={}):
    try: return {"status":"exited","trade":exit_trade(trade_id,body.get("current_ltp"),body.get("exit_limit_price"))}
    except Exception as e: return JSONResponse(400,{"error":str(e)})

@app.post("/trade/cancel/{trade_id}")
async def cancel_t(trade_id:str):
    try: return {"status":"cancelled","trade":cancel_order(trade_id)}
    except Exception as e: return JSONResponse(400,{"error":str(e)})

@app.put("/trade/modify/{trade_id}")
async def modify_t(trade_id:str, body:dict):
    if not body.get("new_price") and not body.get("new_qty"):
        return JSONResponse(400,{"error":"Provide new_price or new_qty"})
    try: return {"status":"modified","trade":modify_order(trade_id,body.get("new_price"),body.get("new_qty"))}
    except Exception as e: return JSONResponse(400,{"error":str(e)})

@app.get("/trade/refresh")
async def trade_refresh():
    refresh_order_statuses()
    live = refresh_live_pnl()
    all_t = get_all_trades()
    total = round(sum((t.get("live_pnl") or t.get("pnl") or 0)
                      for t in all_t if t["status"] in ("OPEN","COMPLETED")),2)
    return {"trades":all_t,"total_pnl":total,
            "open":sum(1 for t in all_t if t["status"]=="OPEN"),
            "pending":sum(1 for t in all_t if t["status"]=="PENDING"),
            "completed":sum(1 for t in all_t if t["status"]=="COMPLETED"),
            "cancelled":sum(1 for t in all_t if t["status"]=="CANCELLED")}

@app.get("/trade/pnl")
async def trade_pnl():
    live = refresh_live_pnl()
    total = round(sum(t.get("live_pnl") or 0 for t in live),2)
    return {"trades":live,"total_pnl":total,"count":len(live)}

@app.get("/trade/history")
async def trade_history(): return {"trades":get_all_trades()}

# ── WebSocket ─────────────────────────────────────────────────────────────────
@app.websocket("/ws/live")
async def ws_live(ws: WebSocket):
    await ws.accept(); ws_clients.append(ws)
    try:
        while True: await ws.receive_text()
    except WebSocketDisconnect:
        if ws in ws_clients: ws_clients.remove(ws)

async def _broadcast(candle: dict):
    global _vix_cache, _vix_prev, _fii_dii_cache
    _vix_prev = _vix_cache; _vix_cache = get_vix() or _vix_cache
    _fii_dii_cache = get_fii_dii()
    refresh_order_statuses()
    c    = get_candles(); ind = compute_all(c, vix=_vix_cache)
    sig  = _build_signal()
    live = refresh_live_pnl()
    total = round(sum(t.get("live_pnl") or 0 for t in live),2)
    payload = json.dumps({"candle":candle,"signal":sig,
        "indicators":ind.get("latest",{}),"fibonacci":ind.get("fibonacci",{}),
        "trend":ind.get("trend",{}),"index":get_active_index(),
        "active_trades":get_active_trades(),"total_pnl":total,
        "fii_dii":_fii_dii_cache},default=str)
    dead=[]
    for ws in ws_clients:
        try: await ws.send_text(payload)
        except: dead.append(ws)
    for ws in dead:
        if ws in ws_clients: ws_clients.remove(ws)

def _build_signal():
    return evaluate_signals(get_candles(),vix=_vix_cache,
                            vix_prev=_vix_prev,fii_dii=_fii_dii_cache,
                            index=get_active_index())
