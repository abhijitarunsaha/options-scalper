# Option Scalper — Claude Code Context

## Project
Real-time intraday options scalper — NIFTY, BANKNIFTY, and SENSEX.
(Renamed from "NIFTY50 Scalper"; multi-index support was already wired
in config.py's INDEX_MAP, so this was a naming change, not a rebuild.)
Backend: Python FastAPI + Kite Connect (Zerodha)
Frontend: React 18 + TradingView Lightweight Charts

## Signal engine (signal_engine.py)
3-tier system: STRONG(7+/12), MODERATE(5-6/12), SCOUT(3-4 trend-only)
SCOUT fires in trending markets without needing structure alignment.
12 conditions: VWAP, EMA cross, MACD, RSI+slope, Fib, BB, swing breakout,
               volume spike, candle pattern, OI/PCR, VIX, FII/DII

## Regime-aware confirmation (trend_context.py + signal_engine.py)
Every signal now carries `actionable` (bool) + `confirm_reason` + `regime`.
The frontend should treat `actionable: false` as "still forming / already
flagged" and not re-prompt the user — this is the anti-overtrading layer.

Three regimes, evaluated per index:
- OPENING_RANGE (09:15–09:30 by default): fast lane. An OR high/low
  breakout on a volume spike fires immediately as tier "OR_BREAKOUT" —
  catches the day's first/biggest move without waiting on confirmation.
- COMPRESSION: BB-width + ATR both contracting ≥15%/10% over 10 bars.
  First breakout out of the squeeze is immediately actionable (the squeeze
  pattern itself is the confirmation) — this is the "1-2-3 pre-move" case.
- STEADY_STATE: everything else. Requires CONFIRM_BARS (default 2)
  consecutive same-direction bars AND COOLDOWN_MINUTES (default 4) since
  the last actionable fire in that direction. This is what stops the same
  ongoing move from re-prompting a trade every single bar.

Tunables live in config.py: OPENING_RANGE_END, CONFIRM_BARS,
COOLDOWN_MINUTES, COMPRESSION_BB_WIDTH_DROP, COMPRESSION_ATR_DROP,
TREND_LOOKBACK_BARS (20-30min VWAP-slope/EMA-persistence window).

## Portfolio awareness (portfolio.py)
- GET /data/portfolio/holdings — consolidated Zerodha holdings: value,
  P&L, allocation %, concentration flags (>25% in one name), and a
  per-holding BUY/SELL/HOLD call from daily EMA20/50 + RSI + 20d
  high/low distance. Cached 15 min (kite.historical_data per holding).
- GET /data/portfolio/exposure — margin utilization -> lot-size
  multiplier (1.0 / 0.75 / 0.5 as utilization crosses 60% / 80%).
  option_filter.get_affordable_options() applies this multiplier to the
  budget automatically, so option sizing shrinks on a heavily-deployed
  day instead of stacking full-size bets on existing exposure.

Still to do: dashboard (frontend consuming the two endpoints above +
live P&L/Greeks) and the full UI redesign.

## Lot sizes (NSE current)
NIFTY=65, BANKNIFTY=30, SENSEX=20

## Budget band formula
max_premium = budget / lot_size
min_premium = budget / (2 × lot_size)
All qty = lots × lot_size (always valid multiple)

## Order rules
- Always LIMIT orders (Kite rejects market orders for options without protection)
- Limit price = LTP × 1.005, rounded to 0.05 tick
- Hard SL = 20% via GTT
- Trailing SL = 5% (moves up with peak LTP, modifies GTT in real-time)
- SL breached → real LIMIT sell order placed automatically

## Run
Backend:  cd backend && uvicorn main:app --reload --port 8000
Frontend: cd frontend && npm start
Login:    GET http://localhost:8000/auth/status
