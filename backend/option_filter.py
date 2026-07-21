import os
from kite_auth import get_kite
from config import get_index_cfg, SL_LIMIT_PCT, TRAILING_SL_PCT, TAKE_PROFIT_PCT, MIN_TARGET_GAP
from portfolio import get_exposure_factor

def _lot(index):
    cfg = get_index_cfg(index)
    return int(os.environ.get(cfg["lot_size_env"], cfg["default_lot"]))

def _tick(p): return round(round(p / 0.05) * 0.05, 2)
def _ex(sym): return "BFO" if "SENSEX" in sym else "NFO"

def get_vix():
    try:
        q = get_kite().quote(["NSE:INDIA VIX"])
        return float((q.get("NSE:INDIA VIX") or {}).get("last_price") or 0) or None
    except: return None

def get_oi_chain(ltp, index="NIFTY", range_pts=200):
    kite = get_kite()
    cfg  = get_index_cfg(index)
    step = cfg["strike_step"]
    atm  = round(ltp / step) * step
    strikes = list(range(int(atm - range_pts), int(atm + range_pts) + step, step))
    ex   = "NFO" if index != "SENSEX" else "BFO"
    insts = [i for i in kite.instruments(ex)
             if i["name"] == cfg["nfo_name"] and i["instrument_type"] in ("CE","PE") and i["strike"] in strikes]
    if not insts: return []
    insts.sort(key=lambda x: x["expiry"])
    ne = insts[0]["expiry"]
    insts = [i for i in insts if i["expiry"] == ne]
    try: quotes = kite.quote([i["instrument_token"] for i in insts])
    except: return []
    chain = {}
    for c in insts:
        q = quotes.get(str(c["instrument_token"]), {})
        s = int(c["strike"])
        if s not in chain:
            chain[s] = {"strike": s, "ce_oi": 0, "ce_oi_change": 0, "ce_ltp": 0,
                        "pe_oi": 0, "pe_oi_change": 0, "pe_ltp": 0, "pcr": 0}
        if c["instrument_type"] == "CE":
            chain[s]["ce_oi"]        = q.get("oi", 0)
            chain[s]["ce_ltp"]       = q.get("last_price", 0)
            # OI change = difference between today's OI high and OI low (net intraday OI flow)
            chain[s]["ce_oi_change"] = q.get("oi", 0) - q.get("oi_day_low", q.get("oi", 0))
        else:
            chain[s]["pe_oi"]        = q.get("oi", 0)
            chain[s]["pe_ltp"]       = q.get("last_price", 0)
            chain[s]["pe_oi_change"] = q.get("oi", 0) - q.get("oi_day_low", q.get("oi", 0))
    for v in chain.values():
        v["pcr"] = round(v["pe_oi"] / v["ce_oi"], 3) if v["ce_oi"] else 0
    return sorted(chain.values(), key=lambda x: x["strike"])

def get_affordable_options(signal, index="NIFTY", budget=2500):
    direction = signal.get("signal", "WAIT")
    ltp       = signal.get("ltp", 0)
    if direction == "WAIT" or ltp == 0:
        return {"best": None, "all_opts": [], "lot_size": 0, "min_premium": 0, "max_premium": 0}

    opt_type = "CE" if direction == "CE_BUY" else "PE"
    kite     = get_kite()
    cfg      = get_index_cfg(index)
    step     = cfg["strike_step"]
    lot      = _lot(index)
    atm      = round(ltp / step) * step
    # Extended range: ±12 steps
    strikes  = [atm + (i * step) for i in range(-12, 13)]
    # Portfolio-aware sizing: trim the effective budget when margin utilization
    # is already high, so a heavily-deployed day doesn't stack full-size bets.
    exposure = get_exposure_factor()
    budget   = round(budget * exposure["lot_multiplier"], 2)
    # Budget band: hard floor ₹10, ceiling = portfolio_budget / lot_size
    min_p    = 10.0
    max_p    = budget / lot
    ex       = "NFO" if index != "SENSEX" else "BFO"

    insts = [i for i in kite.instruments(ex)
             if i["name"] == cfg["nfo_name"] and i["instrument_type"] == opt_type and i["strike"] in strikes]
    if not insts: return {"best": None, "all_opts": [], "lot_size": lot, "min_premium": round(min_p,2), "max_premium": round(max_p,2), "exposure": exposure}
    insts.sort(key=lambda x: x["expiry"])
    ne = insts[0]["expiry"]
    insts = [i for i in insts if i["expiry"] == ne]
    try: quotes = kite.quote([i["instrument_token"] for i in insts])
    except: return {"best": None, "all_opts": [], "lot_size": lot, "min_premium": round(min_p,2), "max_premium": round(max_p,2), "exposure": exposure}

    atr = signal.get("atr", 50)
    results = []
    for c in insts:
        q       = quotes.get(str(c["instrument_token"]), {})
        premium = q.get("last_price", 0)
        if premium <= 0 or not (min_p <= premium <= max_p): continue
        strike  = c["strike"]
        diff    = abs(ltp - strike)
        mono    = "ATM" if strike == atm else ("ITM" if (opt_type=="CE" and strike<atm) or (opt_type=="PE" and strike>atm) else "OTM")
        steps   = diff / step
        delta   = max(0.05, min(0.95, 0.5 - steps * 0.08))
        if opt_type == "PE": delta = -delta
        oi, vol = q.get("oi", 0), q.get("volume", 0)
        score   = min(oi/100000,5) + min(vol/10000,3) + max(0,3-steps)
        sl_ltp  = round(premium * (1 - SL_LIMIT_PCT/100), 2)
        target_move = max(atr * 2, 20)
        target_idx  = round(ltp + target_move if opt_type=="CE" else ltp - target_move, 1)
        raw_tp = premium + abs(delta) * target_move * (TAKE_PROFIT_PCT/100)
        tp_ltp = round(max(raw_tp, premium + MIN_TARGET_GAP), 2)
        if tp_ltp - premium < MIN_TARGET_GAP: continue
        results.append({
            "symbol": c["tradingsymbol"], "strike": strike, "type": opt_type,
            "expiry": str(c["expiry"]), "premium": premium,
            "lot_cost_1": round(premium * lot, 2), "lot_cost_2": round(premium * lot * 2, 2),
            "lot_size": lot, "moneyness": mono, "oi": oi, "volume": vol,
            "delta": round(abs(delta), 3), "score": round(score, 2),
            "entry_ltp": premium, "sl_ltp": sl_ltp, "target_ltp": tp_ltp,
            "target_index": target_idx, "sl_pct": SL_LIMIT_PCT, "tp_pct": TAKE_PROFIT_PCT,
        })
    results.sort(key=lambda x: x["score"], reverse=True)
    return {"best": results[0] if results else None, "all_opts": results,
            "lot_size": lot, "min_premium": round(min_p,2), "max_premium": round(max_p,2),
            "exposure": exposure}
