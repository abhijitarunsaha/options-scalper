import os
from kite_auth import get_kite
from config import get_index_cfg, SL_LIMIT_PCT, TRAILING_SL_PCT, TAKE_PROFIT_PCT, MIN_TARGET_GAP, MIN_INDEX_TARGET_POINTS, RISK_FREE_RATE
from portfolio import get_exposure_factor, get_available_funds
from greeks import implied_vol, greeks as bs_greeks, time_to_expiry_years

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
        v["expiry"] = str(ne)
    return sorted(chain.values(), key=lambda x: x["strike"])

def get_affordable_options(signal, index="NIFTY", budget=2500, use_available_funds=False):
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
    exposure = get_exposure_factor()

    if use_available_funds:
        # User-specified sizing rule: max premium a strike can trade at is
        # available_funds / (lot_size * 2) — i.e. size so 2 lots of the
        # costliest eligible option would still fit inside available funds.
        funds  = get_available_funds()
        budget_desc = f"available funds ₹{funds:,.0f} ÷ (lot {lot} × 2)"
        max_p  = (funds / (lot * 2)) if funds else 0
    else:
        budget = round(budget * exposure["lot_multiplier"], 2)
        budget_desc = f"budget ₹{budget:,.0f} ÷ lot {lot}"
        max_p  = budget / lot
    min_p = 10.0
    ex    = "NFO" if index != "SENSEX" else "BFO"

    insts = [i for i in kite.instruments(ex)
             if i["name"] == cfg["nfo_name"] and i["instrument_type"] == opt_type and i["strike"] in strikes]
    if not insts: return {"best": None, "all_opts": [], "lot_size": lot, "min_premium": round(min_p,2), "max_premium": round(max_p,2), "exposure": exposure, "budget_desc": budget_desc}
    insts.sort(key=lambda x: x["expiry"])
    ne = insts[0]["expiry"]
    insts = [i for i in insts if i["expiry"] == ne]
    try: quotes = kite.quote([i["instrument_token"] for i in insts])
    except: return {"best": None, "all_opts": [], "lot_size": lot, "min_premium": round(min_p,2), "max_premium": round(max_p,2), "exposure": exposure, "budget_desc": budget_desc}

    atr = signal.get("atr", 50)
    T   = time_to_expiry_years(ne)
    results = []
    for c in insts:
        q       = quotes.get(str(c["instrument_token"]), {})
        premium = q.get("last_price", 0)
        if premium <= 0 or not (min_p <= premium <= max_p): continue
        strike  = c["strike"]
        diff    = abs(ltp - strike)
        mono    = "ATM" if strike == atm else ("ITM" if (opt_type=="CE" and strike<atm) or (opt_type=="PE" and strike>atm) else "OTM")
        steps   = diff / step

        # Black-Scholes greeks: IV backed out from this option's own traded
        # premium (captures the real volatility skew per-strike), then delta/
        # gamma/theta/vega derived at that IV — replacing the old linear
        # "0.5 - steps*0.08" delta guess with an actual options-pricing model.
        iv = implied_vol(premium, ltp, strike, T, RISK_FREE_RATE, opt_type)
        g  = bs_greeks(ltp, strike, T, RISK_FREE_RATE, iv, opt_type)
        delta = g["delta"]

        oi, vol = q.get("oi", 0), q.get("volume", 0)
        # Composite score: reward a delta near 0.45 (enough directional
        # exposure without paying full intrinsic-heavy ITM premium), reward
        # liquidity (OI/volume), penalize fast theta decay relative to premium.
        delta_fit = 1 - min(abs(abs(delta) - 0.45) / 0.45, 1)
        liquidity = min(oi/100000, 5) + min(vol/10000, 3)
        theta_drag = min(abs(g["theta"]) / max(premium, 1), 1)
        score = round(delta_fit * 4 + liquidity - theta_drag * 3, 3)

        sl_ltp  = round(premium * (1 - SL_LIMIT_PCT/100), 2)
        target_move = max(atr * 2, MIN_INDEX_TARGET_POINTS)
        target_idx  = round(ltp + target_move if opt_type=="CE" else ltp - target_move, 1)
        raw_tp = premium + abs(delta) * target_move * (TAKE_PROFIT_PCT/100)
        tp_ltp = round(max(raw_tp, premium + MIN_TARGET_GAP), 2)
        if tp_ltp - premium < MIN_TARGET_GAP: continue
        results.append({
            "symbol": c["tradingsymbol"], "strike": strike, "type": opt_type,
            "expiry": str(c["expiry"]), "premium": premium,
            "lot_cost_1": round(premium * lot, 2), "lot_cost_2": round(premium * lot * 2, 2),
            "lot_size": lot, "moneyness": mono, "oi": oi, "volume": vol,
            "delta": round(delta, 3), "gamma": g["gamma"], "theta": g["theta"], "vega": g["vega"],
            "iv_pct": round(iv * 100, 1), "score": score,
            "entry_ltp": premium, "sl_ltp": sl_ltp, "target_ltp": tp_ltp,
            "target_index": target_idx, "sl_pct": SL_LIMIT_PCT, "tp_pct": TAKE_PROFIT_PCT,
        })
    results.sort(key=lambda x: x["score"], reverse=True)
    return {"best": results[0] if results else None, "all_opts": results,
            "lot_size": lot, "min_premium": round(min_p,2), "max_premium": round(max_p,2),
            "exposure": exposure, "budget_desc": budget_desc}
