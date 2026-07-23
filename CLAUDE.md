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

## Brand + dashboard finalization (July 2026, follow-up)
- Logo finalized to the brand sheet: gold-ring sigma mark crossed by an
  emerald rising-line accent (Logo.jsx exports LogoMark, LogoCompact, and the
  full lockup with the "SIGNALS, QUANTIFIED" tagline). Palette tightened to
  the sheet's exact hex values (gold #D4AF37, bronze #B8860B, emerald
  #00E67E, accent blue #2962FF) in index.html; fonts moved to Orbitron
  (display) + Inter (body) + JetBrains Mono (numbers), replacing Space
  Grotesk/IBM Plex Mono.
- Dashboard restructured to mirror the reference layout: row 1 is
  SignalModuleCard (the big regime ring + entry/target/stop) next to
  ChartCard (candle chart with an OHLC toolbar + an Indicators on/off
  toggle — CandleChart's new `showOverlays` prop). Row 2 is OIChain
  (now tabbed Option Chain / Active Chain, columns reordered to
  OI/LTP/CHG per side to match) next to PositionsHoldingsCard (compact
  Positions/Holdings tabs with a "View All Positions" expander that reveals
  the full TradeBox for modify/cancel/exit). Everything from the previous
  redesign (KPI row, SignalCard w/ pattern-refresh selector, PredictionCard,
  RecommendPanel, DayPnlDoughnut, FibLegend, SignalLog) is kept below those
  two rows rather than removed — the reference image only showed the
  above-the-fold layout, not a request to drop functionality.
- TopBar rebuilt: hamburger menu holds the Dashboard/Portfolio/Reports nav
  (was inline tabs before), index switching is now a ticker strip (only the
  active index shows live price + intraday %, since the backend only
  streams one index at a time), plus a market-hours pill (computed from IST
  clock, not fetched), a signal-alert bell badge, and a decorative account
  avatar (no real user/profile system exists to wire it to).

## Prediction-engine rework + dashboard fixes (July 2026, priority follow-up)
**Root causes of the reported overtrading (4 signals/2min, 2-5pt targets):**
config.py had MIN_TARGET_GAP=5 (₹5 premium gap) and trend_predictor's S/R ladder
would happily project a target off a noise-level micro-pivot only 2-5 index
points away; CONFIRM_BARS=3 / GLOBAL_COOLDOWN_MINUTES=6 / MIN_MOVE_ATR_MULT=0.6
were all too loose; oi_data was NEVER actually populated (main.py never passed
it into evaluate_signals), so the OI/PCR condition was silently dead; and — the
subtlest bug — the new `_fast_refresh_loop` (added in the prior redesign
session, runs every 5-10s) was calling evaluate_signals() the same as the real
once-a-minute broadcast, so it was advancing the CONFIRM_BARS persistence
counter 6-12x faster than a bar-based counter should. Fixed via
`advance_history` param threaded through evaluate_signals()/_confirm() —
only main.py's real per-candle `_broadcast` passes advance_history=True now;
the fast-refresh loop passes False so it can still update the live checklist
without falsely satisfying persistence on sub-minute noise.

**New backend modules:** greeks.py (Black-Scholes delta/gamma/theta/vega +
IV backed out from each option's own premium via bisection — replaces the old
linear "0.5 - steps*0.08" delta guess), oi_tracker.py (rolling 5/15-min
aggregate CE/PE OI snapshots, sampled once per closed candle in
main.py's _broadcast — this is what actually feeds "OI change over 5-15 min"
now), monthly_levels.py (1-month daily-candle S/R via kite.historical_data,
cached 4h, merged into trend_predictor's intraday pivot ladder),
backtest.py (historical validation harness — replays evaluate_signals() over
N days of 1-min history and reports signals/day + hit rate by tier; NOT run
in this build environment — no network access to Zerodha's API here — the
user needs to run `python backtest.py --index NIFTY --days 90` themselves
with a live Kite session to actually validate/tune the new thresholds).

**trend_predictor.py** rewritten: bias score now combines EMA trend + BB
outer/mid position + RSI divergence + oi_tracker's 15-min OI bias + VIX
level/trend discount + 5-min timeframe confluence (sharply discounts when
5-min disagrees with 1-min). Target/invalidation come from the merged
intraday+monthly S/R ladder, gated to MIN_INDEX_TARGET_POINTS (config,
default 20) away — this is the direct fix for a 2-5pt "target". If no level
clears that bar, target stays None rather than picking a near one.

**signal_engine.py** now has 13 conditions (was 12, effectively fewer since
OI was dead) across trend/momentum/structure/volume/price-action/OI+VIX/
target-room groups, and an actionable fire additionally requires the
predictor to see room to run in that direction (tgt_room_ce/tgt_room_pe from
the gated ladder) — a signal can score well on the checklist and still show
as "Building" if there's no clean target.

**option_filter.get_affordable_options** gained `use_available_funds=True`
mode: sizes via `available_funds / (lot_size * 2)` (portfolio.py's new
get_available_funds(), from kite.margins()) per the user's exact formula,
and ranks candidates by delta-fit (prefers |delta|~0.45) + liquidity - theta
decay, using the real Black-Scholes greeks above. New endpoint
GET /trade/best-option is what SignalModuleCard's "Click to Trade" and the
Signal Log's per-entry trade button call.

**GTT stop-loss UI:** trade_manager.py gained generic
list_kite_gtts/place_kite_gtt_sl/modify_kite_gtt_sl/cancel_kite_gtt (work on
ANY position — bot or manual — unlike the older _execute_sl/_update_gtt
which only manage a bot trade's own GTT). Endpoints: GET/POST /trade/gtt(s),
PUT and DELETE /trade/gtt/{gtt_id}. UI lives in the new shared
TodaysPositions.jsx (extracted from PnLReport.jsx so both the Reports tab
and PositionsHoldingsCard's "View All Positions" expander use the same
component — this also fixed the bug where "View All Positions" only showed
bot-tracked trades from /trade/refresh and missed manually-placed Zerodha
positions; it now sources from /trade/day-report like Reports/the doughnut
already did).

**Dashboard fixes:** OIChain no longer refetches on every live-price tick
(was the cause of the "flickers every second" report — `load` depended on
`ltp`, which changes on every WS tick); now polls on a fixed 10s interval and
merges new values into existing rows by strike instead of replacing the
array, and fires immediately on mount without waiting for `ltp` truthy (the
backend's /data/oi-chain now falls back to the in-progress candle's live
close via main.py's `_spot_ltp()` when the 10-candle warmup hasn't finished,
so the chain — and PositionsHoldingsCard's holdings preload on mount — no
longer wait on signal-engine warmup). The day P&L doughnut moved from its
own card further down the page into PositionsHoldingsCard, beside the
Positions list. ConfirmationRing.jsx had a latent bug where the ring radius
was hardcoded to r=26 regardless of the `size` prop — harmless at the
original default size=64, but meant the new big Signal Module ring (size=148)
and the small Signal Log rings (size=30) were rendering wrong; fixed to scale
radius/stroke with size.

**SignalModuleCard / PredictionCard:** dropped the "₹" prefix from
Entry/Target/Stop and the near-term read's target/invalidation — these are
NIFTY/BANKNIFTY/SENSEX index points, not rupee amounts.
