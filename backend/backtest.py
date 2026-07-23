"""
backtest.py — historical validation harness for signal_engine.py.

IMPORTANT — run this yourself: this was written but NOT executed against
real data in the environment this rework was built in, because that
environment has no network access to Zerodha's API (no live Kite session
available). The CONFIRM_BARS / GLOBAL_COOLDOWN_MINUTES / MIN_MOVE_ATR_MULT /
MIN_INDEX_TARGET_POINTS values in config.py were tightened by reasoning
about the specific overtrading pattern you reported (4 signals in 2 minutes,
2-5pt "targets"), not by backtested optimization. Treat them as a starting
point and use this script — with your own Kite session — to actually
validate and tune them against real history before trusting the live signal.

Usage:
    python backtest.py --index NIFTY --days 90 --horizon 20

Method: replays 1-min historical candles bar-by-bar through the exact same
evaluate_signals() the live app calls (so this tests precisely what's
deployed, not a separate simulation model). For every actionable signal it
looks `horizon` minutes forward and reports:
  - signal count/day (the overtrading check — compare against what you saw:
    4 signals in 2 minutes is the failure mode this rework targets)
  - hit rate: % of signals where price moved >= MIN_INDEX_TARGET_POINTS in
    the predicted direction within the horizon
  - average favorable move and average adverse move (drawdown before any
    target was reached)
  - breakdown by tier (STRONG / MODERATE / SCOUT / OR_BREAKOUT)

Known limitation: OI momentum (oi_tracker.py) is populated from *live*
snapshots recorded once per closed candle during a running session — Kite's
historical-data API doesn't give you historical open-interest time series,
so during this replay oi_tracker.momentum() will report ready=False the
whole way through, and that condition + its contribution to the near-term
predictor's bias score will sit neutral. That means live signals (which do
have a working OI read) may behave somewhat differently than what this
backtest shows — treat the OI-driven cases as unvalidated by this harness
specifically, everything else (trend/BB/RSI/divergence/fib/S-R/target-room)
is genuinely being tested as-deployed.
"""
import argparse
from datetime import datetime, timedelta
from statistics import mean

from kite_auth import get_kite
from config import get_index_cfg, MIN_INDEX_TARGET_POINTS
from signal_engine import evaluate_signals

HORIZON_MIN = 20  # matches the predictor's own "15-30 min" near-term horizon
CONTEXT_BARS = 300  # how much history evaluate_signals() sees per bar, similar
                     # to what the live app accumulates in a session


def fetch_minute_candles(index: str, days: int) -> list:
    kite = get_kite()
    cfg = get_index_cfg(index)
    to_d = datetime.now()
    from_d = to_d - timedelta(days=days)
    out = []
    cursor = from_d
    # Kite's minute-candle history is capped per request (~60 days) — chunk it.
    while cursor < to_d:
        chunk_end = min(cursor + timedelta(days=59), to_d)
        out += kite.historical_data(cfg["token"], cursor, chunk_end, "minute")
        cursor = chunk_end
    return [{"time": c["date"], "open": c["open"], "high": c["high"],
             "low": c["low"], "close": c["close"], "volume": c["volume"]} for c in out]


def run(index="NIFTY", days=90, horizon=HORIZON_MIN, warmup=10):
    candles = fetch_minute_candles(index, days)
    print(f"Loaded {len(candles)} 1-min candles for {index} over ~{days}d")
    if len(candles) < warmup + horizon + 1:
        print("Not enough history returned — check date range / market holidays.")
        return

    fired = []
    for i in range(warmup, len(candles)):
        window = candles[max(0, i - CONTEXT_BARS):i + 1]
        sig = evaluate_signals(window, index=index)
        if sig.get("actionable"):
            fired.append((i, sig))

    sessions = max(len(candles) / 375, 1)  # ~375 one-min bars per NSE session
    print(f"\n{len(fired)} actionable signals over {len(candles)} bars "
          f"(~{len(fired) / sessions:.1f}/day across ~{sessions:.0f} sessions)")

    results = []
    for i, sig in fired:
        entry_ltp = sig["ltp"]
        direction = sig["signal"]
        future = candles[i + 1: i + 1 + horizon]
        if not future:
            continue
        moves = [(c["close"] - entry_ltp) if direction == "CE_BUY" else (entry_ltp - c["close"])
                 for c in future]
        results.append({"tier": sig["tier"], "hit": max(moves) >= MIN_INDEX_TARGET_POINTS,
                         "best_move": max(moves), "worst_move": min(moves)})

    if not results:
        print("No signals with enough forward data to evaluate (too close to the end of range).")
        return

    hit_rate = sum(r["hit"] for r in results) / len(results) * 100
    print(f"\nOverall: {len(results)} evaluable signals, hit rate {hit_rate:.1f}% "
          f"(favorable move >= {MIN_INDEX_TARGET_POINTS:.0f}pts within {horizon}min)")
    print(f"Avg favorable move: {mean(r['best_move'] for r in results):+.1f}pts | "
          f"Avg adverse move: {mean(r['worst_move'] for r in results):+.1f}pts")

    print("\nBy tier:")
    for tier in ("STRONG", "MODERATE", "SCOUT", "OR_BREAKOUT"):
        rows = [r for r in results if r["tier"] == tier]
        if not rows:
            continue
        hr = sum(r["hit"] for r in rows) / len(rows) * 100
        print(f"  {tier:12s}: {len(rows):5d} signals, hit rate {hr:5.1f}%, "
              f"avg favorable {mean(r['best_move'] for r in rows):+.1f}pts")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--index", default="NIFTY", choices=["NIFTY", "BANKNIFTY", "SENSEX"])
    p.add_argument("--days", type=int, default=90, help="lookback window in calendar days (~3 months = 90)")
    p.add_argument("--horizon", type=int, default=HORIZON_MIN, help="forward-looking window in minutes")
    args = p.parse_args()
    run(args.index, args.days, args.horizon)
