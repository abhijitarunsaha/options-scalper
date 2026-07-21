import os, uuid
from datetime import datetime
from kite_auth import get_kite
from config import TRAILING_SL_PCT, SL_LIMIT_PCT, TAKE_PROFIT_PCT

_trades: dict[str, dict] = {}
_KITE_MAP = {"OPEN":"PENDING","COMPLETE":"OPEN","CANCELLED":"CANCELLED","REJECTED":"REJECTED"}

def _ex(s): return "BFO" if "SENSEX" in s else "NFO"
def _tick(p): return round(round(p/0.05)*0.05, 2)
def _ms(s): return _KITE_MAP.get((s or "").upper(), "PENDING")

def _execute_sl(trade, ltp):
    if trade.get("sl_order_placed"): return
    trade["sl_order_placed"] = True
    kite = get_kite()
    sym, qty, ex = trade["symbol"], trade["qty"], _ex(trade["symbol"])
    if trade.get("gtt_id"):
        try: kite.delete_gtt(trade["gtt_id"]); trade["gtt_id"] = None
        except: pass
    sp = _tick(ltp * 0.995)
    try:
        oid = kite.place_order(tradingsymbol=sym, exchange=ex,
                               transaction_type=kite.TRANSACTION_TYPE_SELL,
                               quantity=qty, order_type=kite.ORDER_TYPE_LIMIT, price=sp,
                               product=kite.PRODUCT_MIS, variety=kite.VARIETY_REGULAR)
        trade.update({"status":"COMPLETED","exit_price":ltp,"exit_limit_price":sp,
                      "exit_order_id":oid,"exit_reason":"SL_TRIGGERED",
                      "pnl":round((ltp-trade["entry_price"])*qty,2),
                      "pnl_pct":round((ltp-trade["entry_price"])/trade["entry_price"]*100,2),
                      "exited_at":datetime.now().isoformat()})
    except Exception as e:
        trade["sl_order_placed"] = False
        print(f"[TM] SL order failed: {e}")

def _update_gtt(trade, new_trig):
    if not trade.get("gtt_id"): return
    try:
        kite = get_kite(); sym = trade["symbol"]; ex = _ex(sym)
        sl_lim = _tick(new_trig * 0.995)
        kite.modify_gtt(trigger_id=trade["gtt_id"], trigger_type=kite.GTT_TYPE_SINGLE,
                        tradingsymbol=sym, exchange=ex, trigger_values=[new_trig],
                        last_price=trade.get("current_ltp") or trade["entry_price"],
                        orders=[{"exchange":ex,"tradingsymbol":sym,
                                 "transaction_type":kite.TRANSACTION_TYPE_SELL,
                                 "quantity":trade["qty"],"order_type":kite.ORDER_TYPE_LIMIT,
                                 "price":sl_lim,"product":kite.PRODUCT_MIS}])
        trade["sl_limit"] = sl_lim
    except Exception as e: print(f"[TM] GTT modify: {e}")

def _sync_positions():
    open_t = [t for t in _trades.values() if t["status"] == "OPEN"]
    if not open_t: return
    try:
        kite = get_kite()
        net_by_sym = {p["tradingsymbol"]: int(p.get("quantity",0))
                      for p in kite.positions().get("net", [])}
    except Exception as e: print(f"[TM] pos sync: {e}"); return
    for t in open_t:
        sym = t["symbol"]
        if net_by_sym.get(sym, 0) != 0: continue
        ep = t.get("current_ltp") or t["entry_price"]
        try:
            orders = kite.orders()
            sells = [o for o in orders if o.get("tradingsymbol")==sym
                     and o.get("transaction_type")=="SELL" and o.get("status")=="COMPLETE"]
            if sells: ep = round(float(sells[-1].get("average_price", ep)), 2)
        except: pass
        pnl = round((ep - t["entry_price"]) * t["qty"], 2)
        t.update({"status":"COMPLETED","exit_price":ep,"exit_reason":"CLOSED_EXTERNALLY",
                  "pnl":pnl,"pnl_pct":round((ep-t["entry_price"])/t["entry_price"]*100,2),
                  "exited_at":datetime.now().isoformat()})

def place_trade(option, lots, index, limit_price=None):
    kite = get_kite(); sym = option["symbol"]
    qty  = lots * option["lot_size"]; ex = _ex(sym)
    se   = option["premium"]
    lp   = _tick(se * 1.005) if not limit_price else round(limit_price, 2)
    oid  = kite.place_order(tradingsymbol=sym, exchange=ex,
                             transaction_type=kite.TRANSACTION_TYPE_BUY,
                             quantity=qty, order_type=kite.ORDER_TYPE_LIMIT, price=lp,
                             product=kite.PRODUCT_MIS, variety=kite.VARIETY_REGULAR)
    sl_t = round(se * (1 - SL_LIMIT_PCT/100), 2)
    sl_l = _tick(sl_t * 0.995)
    try:
        gid = kite.place_gtt(trigger_type=kite.GTT_TYPE_SINGLE, tradingsymbol=sym,
                              exchange=ex, trigger_values=[sl_t], last_price=se,
                              orders=[{"exchange":ex,"tradingsymbol":sym,
                                       "transaction_type":kite.TRANSACTION_TYPE_SELL,
                                       "quantity":qty,"order_type":kite.ORDER_TYPE_LIMIT,
                                       "price":sl_l,"product":kite.PRODUCT_MIS}])
    except Exception as e: gid = None; print(f"[TM] GTT: {e}")
    tid = str(uuid.uuid4())[:8]
    t = {"trade_id":tid,"order_id":oid,"gtt_id":gid,"symbol":sym,"type":option["type"],
         "strike":option["strike"],"expiry":option["expiry"],"lots":lots,"qty":qty,
         "suggested_entry":se,"entry_price":se,"limit_price":lp,"sl_price":sl_t,
         "sl_limit":sl_l,"sl_pct":SL_LIMIT_PCT,"trailing_sl_pct":TRAILING_SL_PCT,
         "peak_ltp":None,"trailing_sl":sl_t,"target_ltp":option["target_ltp"],
         "target_index":option["target_index"],"status":"PENDING","sl_order_placed":False,
         "pnl":None,"live_pnl":None,"pnl_pct":None,"pnl_vs_target":None,
         "sl_breached":False,"current_ltp":None,"exit_price":None,"exit_reason":None,
         "entered_at":datetime.now().isoformat(),"filled_at":None,"exited_at":None}
    _trades[tid] = t; return t

def modify_order(trade_id, new_price=None, new_qty=None):
    kite = get_kite(); t = _trades.get(trade_id)
    if not t: raise ValueError(f"Trade {trade_id} not found")
    if t["status"] != "PENDING": raise ValueError(f"Only PENDING orders can be modified")
    mp = round(new_price,2) if new_price else t["limit_price"]
    mq = int(new_qty)       if new_qty   else t["qty"]
    kite.modify_order(variety=kite.VARIETY_REGULAR, order_id=t["order_id"],
                      quantity=mq, price=mp, order_type=kite.ORDER_TYPE_LIMIT)
    t["limit_price"] = mp; t["qty"] = mq; t["modified_at"] = datetime.now().isoformat()
    if new_qty and mq != t["qty"] and t.get("gtt_id"):
        try:
            kite.modify_gtt(trigger_id=t["gtt_id"], trigger_type=kite.GTT_TYPE_SINGLE,
                            tradingsymbol=t["symbol"], exchange=_ex(t["symbol"]),
                            trigger_values=[t["sl_price"]], last_price=t["entry_price"],
                            orders=[{"exchange":_ex(t["symbol"]),"tradingsymbol":t["symbol"],
                                     "transaction_type":kite.TRANSACTION_TYPE_SELL,"quantity":mq,
                                     "order_type":kite.ORDER_TYPE_LIMIT,"price":t["sl_limit"],
                                     "product":kite.PRODUCT_MIS}])
        except Exception as e: print(f"[TM] GTT qty: {e}")
    return t

def cancel_order(trade_id):
    kite = get_kite(); t = _trades.get(trade_id)
    if not t: raise ValueError(f"Not found")
    if t["status"] != "PENDING": raise ValueError(f"Only PENDING can be cancelled")
    kite.cancel_order(variety=kite.VARIETY_REGULAR, order_id=t["order_id"])
    if t.get("gtt_id"):
        try: kite.delete_gtt(t["gtt_id"])
        except: pass
    t.update({"status":"CANCELLED","exited_at":datetime.now().isoformat()}); return t

def exit_trade(trade_id, current_ltp=None, exit_limit_price=None):
    kite = get_kite(); t = _trades.get(trade_id)
    if not t: raise ValueError(f"Not found")
    if t["status"] != "OPEN": raise ValueError(f"Only OPEN can be exited")
    sym = t["symbol"]; ex = _ex(sym)
    if t.get("gtt_id"):
        try: kite.delete_gtt(t["gtt_id"]); t["gtt_id"] = None
        except: pass
    ref = current_ltp or t.get("current_ltp") or t["entry_price"]
    elp = _tick(ref*0.995) if not exit_limit_price else round(exit_limit_price,2)
    eoid = kite.place_order(tradingsymbol=sym, exchange=ex,
                             transaction_type=kite.TRANSACTION_TYPE_SELL,
                             quantity=t["qty"], order_type=kite.ORDER_TYPE_LIMIT, price=elp,
                             product=kite.PRODUCT_MIS, variety=kite.VARIETY_REGULAR)
    pnl = round((ref-t["entry_price"])*t["qty"],2)
    t.update({"status":"COMPLETED","exit_price":ref,"exit_limit_price":elp,
              "exit_order_id":eoid,"exit_reason":"MANUAL_EXIT",
              "pnl":pnl,"pnl_pct":round((ref-t["entry_price"])/t["entry_price"]*100,2),
              "exited_at":datetime.now().isoformat()}); return t

def refresh_order_statuses():
    pending = [t for t in _trades.values() if t["status"] == "PENDING"]
    if pending:
        try:
            kite = get_kite()
            by_id = {str(o["order_id"]): o for o in kite.orders()}
        except: by_id = {}
        for t in pending:
            ko = by_id.get(str(t["order_id"]))
            if not ko: continue
            ns = _ms(ko.get("status",""))
            if ns == t["status"]: continue
            t["status"] = ns
            if ns == "OPEN":
                avg = ko.get("average_price")
                if avg and float(avg) > 0:
                    t["entry_price"] = round(float(avg),2)
                    t["sl_price"]    = round(t["entry_price"]*(1-SL_LIMIT_PCT/100),2)
                    t["trailing_sl"] = t["sl_price"]
                t["filled_at"] = datetime.now().isoformat()
            elif ns in ("CANCELLED","REJECTED"):
                t["exited_at"] = datetime.now().isoformat()
    _sync_positions()

def refresh_live_pnl():
    refresh_order_statuses()
    open_t = [t for t in _trades.values() if t["status"] == "OPEN"]
    if not open_t: return []
    try:
        kite    = get_kite()
        keys    = [(_ex(t["symbol"])+":"+t["symbol"]) for t in open_t]
        quotes  = kite.quote(list(set(keys)))
    except Exception as e: print(f"[TM] pnl: {e}"); return open_t
    for t in open_t:
        key = _ex(t["symbol"])+":"+t["symbol"]
        ltp = (quotes.get(key) or {}).get("last_price")
        if not ltp: continue
        entry = t["entry_price"]; qty = t["qty"]; target = t["target_ltp"]
        peak  = t.get("peak_ltp") or entry
        if ltp > peak:
            peak = ltp; t["peak_ltp"] = round(peak,2)
            nt = round(peak*(1-TRAILING_SL_PCT/100),2)
            if nt > t.get("trailing_sl", t["sl_price"]):
                t["trailing_sl"] = nt; _update_gtt(t, nt)
        eff_sl = t.get("trailing_sl", t["sl_price"])
        raw    = round((ltp-entry)*qty,2)
        rng    = (target-entry) or 1
        t.update({"current_ltp":round(ltp,2),"live_pnl":raw,
                  "pnl_pct":round((ltp-entry)/entry*100,2),
                  "pnl_vs_target":round((ltp-entry)/rng*100,1),
                  "sl_breached":ltp<=eff_sl,"trailing_sl":eff_sl,
                  "pnl_updated_at":datetime.now().isoformat()})
        if ltp <= eff_sl and not t.get("sl_order_placed"):
            _execute_sl(t, ltp)
    return [t for t in _trades.values() if t["status"]=="OPEN"]

def get_active_trades(): return [t for t in _trades.values() if t["status"] in ("PENDING","OPEN")]
def get_all_trades():    return list(_trades.values())
