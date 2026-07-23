"""
greeks.py — Black-Scholes greeks + implied volatility for NSE index options.

Kite Connect doesn't return option greeks or IV directly, so this backs out
implied volatility from each option's own traded premium (via bisection) and
then derives delta/gamma/theta/vega from Black-Scholes at that IV. Doing this
per-strike (rather than assuming one flat vol for the whole chain) captures
the real volatility skew — a far-OTM option's IV is usually higher than an
ATM option's, and that changes which strike is actually the best risk/reward
buy, not just which is nearest the money.
"""
import math
from datetime import datetime, date, time as dtime


def _norm_cdf(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def _norm_pdf(x: float) -> float:
    return math.exp(-0.5 * x * x) / math.sqrt(2 * math.pi)


def _bs_price(S, K, T, r, sigma, opt_type):
    if T <= 0 or sigma <= 0:
        return max(0.0, (S - K) if opt_type == "CE" else (K - S))
    sqT = math.sqrt(T)
    d1 = (math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqT)
    d2 = d1 - sigma * sqT
    if opt_type == "CE":
        return S * _norm_cdf(d1) - K * math.exp(-r * T) * _norm_cdf(d2)
    return K * math.exp(-r * T) * _norm_cdf(-d2) - S * _norm_cdf(-d1)


def implied_vol(price, S, K, T, r, opt_type, lo=0.02, hi=3.0, iters=60) -> float:
    """Bisection search for the IV that reproduces `price` under Black-Scholes."""
    if T <= 0 or price <= 0 or S <= 0 or K <= 0:
        return 0.18  # fallback flat guess (~typical index option IV)
    intrinsic = max(0.0, (S - K) if opt_type == "CE" else (K - S))
    if price <= intrinsic:
        return 0.02
    for _ in range(iters):
        mid = (lo + hi) / 2
        p = _bs_price(S, K, T, r, mid, opt_type)
        if p > price:
            hi = mid
        else:
            lo = mid
    return round((lo + hi) / 2, 4)


def greeks(S, K, T, r, sigma, opt_type) -> dict:
    """delta (unitless -1..1), gamma (per ₹1 of spot), theta (per calendar day,
    in premium ₹), vega (per 1 vol-point, in premium ₹)."""
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        itm = (S > K) if opt_type == "CE" else (S < K)
        return {"delta": (1.0 if itm else 0.0) if opt_type == "CE" else (-1.0 if itm else 0.0),
                "gamma": 0.0, "theta": 0.0, "vega": 0.0}
    sqT = math.sqrt(T)
    d1 = (math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqT)
    d2 = d1 - sigma * sqT
    pdf = _norm_pdf(d1)
    if opt_type == "CE":
        delta = _norm_cdf(d1)
        theta = (-(S * pdf * sigma) / (2 * sqT) - r * K * math.exp(-r * T) * _norm_cdf(d2)) / 365
    else:
        delta = _norm_cdf(d1) - 1
        theta = (-(S * pdf * sigma) / (2 * sqT) + r * K * math.exp(-r * T) * _norm_cdf(-d2)) / 365
    gamma = pdf / (S * sigma * sqT)
    vega = S * pdf * sqT / 100
    return {"delta": round(delta, 3), "gamma": round(gamma, 6), "theta": round(theta, 2), "vega": round(vega, 3)}


def time_to_expiry_years(expiry, now: datetime | None = None) -> float:
    """expiry: a date/datetime from Kite's instrument dump (options expire 15:30 IST)."""
    now = now or datetime.now()
    if isinstance(expiry, datetime):
        expiry_dt = expiry
    elif isinstance(expiry, date):
        expiry_dt = datetime.combine(expiry, dtime(15, 30))
    else:
        expiry_dt = datetime.combine(datetime.fromisoformat(str(expiry)).date(), dtime(15, 30))
    secs = max((expiry_dt - now).total_seconds(), 60.0)  # floor to avoid div/0 on expiry day
    return secs / (365 * 24 * 3600)
