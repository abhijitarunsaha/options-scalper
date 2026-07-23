"""
main.py — FastAPI backend for Sigmatics
"""
import os, json, asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

from kite_auth import get_login_url, generate_session, check_session
from data_feed import (start_ticker, stop_ticker, get_candles, get_current_candle,
    get_active_index, register_broadcast, set_event_loop, switch_index)
from indicators import compute_all
from signal_engine import evaluate_signals
from option_filter import get_affordable_options, get_oi_chain, get_vix
from fii_dii import get_fii_dii
import portfolio
import oi_tracker
from trade_manager import (place_trade, exit_trade, cancel_order, modify_order,
    get_active_trades, get_all_trades, refresh_live_pnl, refresh_order_statuses,
    get_day_report, modify_kite_order, cancel_kite_order, exit_kite_position,
    list_kite_gtts, place_kite_gtt_sl, modify_kite_gtt_sl, cancel_kite_gtt)
from config import get_index_cfg, BUDGET_PER_LOT, MIN_CANDLES, SL_LIMIT_PCT, TRAILING_SL_PCT

load_dotenv()
app = FastAPI(title="Sigmatics API", version="4.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

ws_clients: list[WebSocket] = []
_vix_cache: float | None = None
_vix_prev:  float | None = None
_fii_dii_cache: dict = {}
_refresh_seconds: int = 5   # selectable 5 / 10 cadence for the fast-path signal/pattern
                            # refresh, independent of the 1-min candle close broadcast
_refresh_task = None

# ── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    loop = asyncio.get_running_loop()
    set_event_loop(loop)
    global _refresh_task
    _refresh_task = asyncio.create_task(_fast_refresh_loop())
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

def _spot_ltp(candles):
    """LTP for chain/options priming even before MIN_CANDLES have closed —
    falls back to the still-forming candle's live close so the option chain
    and sizing don't have to wait out the signal-engine warmup."""
    r = compute_all(candles, vix=_vix_cache)
    ltp = (r or {}).get("latest", {}).get("ltp", 0)
    if ltp: return ltp
    cur = get_current_candle()
    return (cur or {}).get("close", 0) or 0

@app.get("/data/options")
async def get_options(budget:int=Query(default=None), index:str=Query(default=None), use_funds:bool=Query(default=False)):
    return get_affordable_options(_build_signal(), index or get_active_index(), budget or BUDGET_PER_LOT, use_available_funds=use_funds)

@app.get("/trade/best-option")
async def best_option(index:str=Query(default=None)):
    """Signal Module's 'Click to Trade' source: the best CE/PE for the
    CURRENT signal direction, sized from live available Zerodha funds via
    LTP <= available_funds/(lot_size*2), ranked by Black-Scholes delta/theta."""
    sig = _build_signal()
    result = get_affordable_options(sig, index or get_active_index(), use_available_funds=True)
    return {**result, "signal": sig.get("signal"), "actionable": sig.get("actionable"),
            "tier": sig.get("tier"), "prediction": sig.get("prediction")}

@app.get("/data/oi-chain")
async def oi_chain(range_pts:int=200, index:str=Query(default=None)):
    idx = index or get_active_index()
    ltp = _spot_ltp(get_candles())
    if not ltp: return {"chain":[],"message":"No LTP yet"}
    return {"chain":get_oi_chain(ltp, idx, range_pts),"ltp":ltp,"index":idx}

# ── GTT stop-loss management (any position — bot-placed or manual) ───────────
@app.get("/trade/gtts")
async def gtts_list():
    try: return {"gtts": list_kite_gtts()}
    except Exception as e: return JSONResponse(400, {"error": str(e)})

@app.post("/trade/gtt")
async def gtt_create(body: dict):
    try:
        gid = place_kite_gtt_sl(body["exchange"], body["tradingsymbol"], body["qty"],
            body["trigger_price"], body.get("limit_price"), body.get("last_price"), body.get("product"))
        return {"status":"created","gtt_id":gid}
    except Exception as e: return JSONResponse(400, {"error": str(e)})

@app.put("/trade/gtt/{gtt_id}")
async def gtt_modify(gtt_id: str, body: dict):
    try:
        r = modify_kite_gtt_sl(gtt_id, body["exchange"], body["tradingsymbol"], body["qty"],
            body["trigger_price"], body.get("limit_price"), body.get("last_price"), body.get("product"))
        return {"status":"modified","result":r}
    except Exception as e: return JSONResponse(400, {"error": str(e)})

@app.delete("/trade/gtt/{gtt_id}")
async def gtt_cancel(gtt_id: str):
    try: return {"status":"cancelled","result": cancel_kite_gtt(gtt_id)}
    except Exception as e: return JSONResponse(400, {"error": str(e)})

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

@app.post("/data/refresh-interval")
async def set_refresh_interval(seconds: int = Query(...)):
    global _refresh_seconds
    if seconds not in (5, 10, 15, 30, 60):
        return JSONResponse(400, {"error":"seconds must be one of 5, 10, 15, 30, 60"})
    _refresh_seconds = seconds
    return {"status":"ok","refresh_seconds":_refresh_seconds}

@app.get("/data/refresh-interval")
async def get_refresh_interval():
    return {"refresh_seconds":_refresh_seconds}

# ── Day report (Zerodha-sourced, covers manual + bot orders) ──────────────────
@app.get("/trade/day-report")
async def day_report():
    try: return get_day_report()
    except Exception as e: return JSONResponse(400, {"error": str(e)})

@app.put("/trade/order/{order_id}/modify")
async def modify_any_order(order_id: str, body: dict):
    try: return {"status":"modified","order_id": modify_kite_order(order_id,
        body.get("new_price"), body.get("new_qty"), body.get("trigger_price"), body.get("order_type"))}
    except Exception as e: return JSONResponse(400, {"error": str(e)})

@app.post("/trade/order/{order_id}/cancel")
async def cancel_any_order(order_id: str):
    try: return {"status":"cancelled","order_id": cancel_kite_order(order_id)}
    except Exception as e: return JSONResponse(400, {"error": str(e)})

@app.post("/trade/position/exit")
async def exit_any_position(body: dict):
    try:
        oid = exit_kite_position(body["exchange"], body["tradingsymbol"],
            body["qty"], body.get("product"), body.get("limit_price"))
        return {"status":"exit_order_placed","order_id": oid}
    except Exception as e: return JSONResponse(400, {"error": str(e)})

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
    idx  = get_active_index()
    ltp  = ind.get("latest", {}).get("ltp") or _spot_ltp(c)
    if ltp:
        try:
            chain = get_oi_chain(ltp, idx, range_pts=300)
            oi_tracker.record(idx, sum(r.get("ce_oi", 0) for r in chain), sum(r.get("pe_oi", 0) for r in chain))
        except Exception as e:
            print(f"[OITracker] {e}")
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

async def _fast_refresh_loop():
    """Recomputes indicators/signal/pattern using the still-forming candle and
    pushes it to clients at the selectable cadence (default 5s), so the pattern/
    signal checklist doesn't wait for the full 1-min bar to close. Marked
    'partial' so the frontend can distinguish it from a closed-candle update."""
    while True:
        try:
            await asyncio.sleep(_refresh_seconds)
            if not ws_clients: continue
            base = get_candles()
            cur  = get_current_candle()
            if not base and not cur: continue
            merged = base + [cur] if cur else base
            ind = compute_all(merged, vix=_vix_cache)
            if not ind: continue
            sig = evaluate_signals(merged, vix=_vix_cache, vix_prev=_vix_prev,
                                    fii_dii=_fii_dii_cache, index=get_active_index(),
                                    advance_history=False)
            payload = json.dumps({"partial":True,"candle":cur,"signal":sig,
                "indicators":ind.get("latest",{}),"fibonacci":ind.get("fibonacci",{}),
                "trend":ind.get("trend",{}),"index":get_active_index(),
                "refresh_seconds":_refresh_seconds}, default=str)
            dead=[]
            for ws in ws_clients:
                try: await ws.send_text(payload)
                except: dead.append(ws)
            for ws in dead:
                if ws in ws_clients: ws_clients.remove(ws)
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[FastRefresh] {e}")

def _build_signal():
    return evaluate_signals(get_candles(),vix=_vix_cache,
                            vix_prev=_vix_prev,fii_dii=_fii_dii_cache,
                            index=get_active_index())
