import requests
from datetime import datetime

_cache = {}
_cache_ts = None
_TTL = 300

def get_fii_dii() -> dict:
    global _cache, _cache_ts
    now = datetime.now()
    if _cache_ts and (now - _cache_ts).seconds < _TTL and _cache:
        return _cache
    try:
        url  = "https://www.nseindia.com/api/fiidiiTradeReact"
        hdrs = {"User-Agent":"Mozilla/5.0","Accept":"application/json",
                "Accept-Language":"en-US,en;q=0.9","Referer":"https://www.nseindia.com/"}
        r    = requests.get(url, headers=hdrs, timeout=6)
        r.raise_for_status()
        data = r.json()
        def net(row):
            if not row: return 0.0
            try: return float(row.get("netTurnover") or row.get("net") or 0)
            except: return 0.0
        fii_r = next((x for x in data if "FII" in (x.get("category") or "").upper()), None)
        dii_r = next((x for x in data if "DII" in (x.get("category") or "").upper()), None)
        fn, dn = net(fii_r), net(dii_r)
        bias = ("BULLISH" if fn > 0 and dn > 0 else
                "BEARISH" if fn < 0 and dn < 0 else
                "NEUTRAL" if abs(fn) < 100 and abs(dn) < 100 else "MIXED")
        _cache = {"fii_net": round(fn, 2), "dii_net": round(dn, 2),
                  "bias": bias, "as_of": now.strftime("%H:%M IST")}
        _cache_ts = now
        return _cache
    except Exception as e:
        print(f"[FII/DII] {e}")
        return _cache if _cache else {"fii_net": 0, "dii_net": 0, "bias": "NEUTRAL"}
