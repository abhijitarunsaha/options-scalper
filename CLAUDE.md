# Sigmatics — Claude Code Context

## Project
Real-time intraday options scalper — NIFTY, BANKNIFTY, and SENSEX.
Renamed to "Sigmatics" ("Signals through Mathematics"); multi-index support
was already wired in config.py's INDEX_MAP, so this was a naming/rebrand
change layered on top of a full Warm Ink UI redesign, not a rebuild.
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

## Warm Ink redesign (July 2026)
Full UI rebrand to "Sigmatics" — warm ink (not pure black) base with
emerald/rose/marigold for CE/PE/watch and a cobalt brand accent. Light + dark
mode via CSS vars in frontend/public/index.html; ThemeContext.js toggles a
`light-mode` body class. Fonts: Space Grotesk (display), Inter (UI), IBM Plex
Mono (numbers). Logo.jsx is the sigma-mark emblem (components/Logo.jsx).

Tabs collapsed from [Live, Portfolio, Trades, Report] to [Dashboard, Portfolio,
Reports] — order execution, open-position modify/cancel/exit, and the option
chain all now live on the Dashboard tab; there's no separate Trades tab.
The old "Live Snapshot" indicator dump was removed from the sidebar (that data
still flows into `indicators` for backend calc/prediction use, just isn't
rendered raw) and replaced with OIChain (option chain) in the sidebar.

- DayPnlDoughnut.jsx — dashboard widget pulling GET /trade/day-report; click
  any segment to jump to the Reports tab.
- Reports tab (PnLReport.jsx) auto-loads on mount (no more click-to-open
  gate) and now has a "Today's Positions" section sourced from
  GET /trade/day-report — this pulls straight from kite.positions()/orders(),
  so it shows positions/orders placed manually in Zerodha too, not just
  trades placed through this tool. Modify/cancel/exit there hit the new
  generic endpoints (trade_manager.py): modify_kite_order/cancel_kite_order/
  exit_kite_position + PUT /trade/order/{id}/modify, POST
  /trade/order/{id}/cancel, POST /trade/position/exit — these work on any
  Kite order_id/position, unlike modify_order/cancel_order/exit_trade which
  only know about this tool's own `_trades` dict.
- Fast pattern/signal refresh: data_feed.get_current_candle() exposes the
  still-forming candle; main.py's `_fast_refresh_loop()` background task
  recomputes indicators/signal against base candles + the in-progress one
  every `_refresh_seconds` (default 5) and broadcasts it over /ws/live with
  `partial: true` — the frontend (useLiveData.js) applies it to signal/
  indicators but does NOT append it to candle history (only real 1-min closes
  do that). GET/POST /data/refresh-interval (5/10/15/30/60) controls the
  cadence; SignalCard.jsx exposes a 5s/10s selector in its header.
