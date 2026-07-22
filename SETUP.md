# Sigmatics — Setup Guide

## Prerequisites
- Python 3.10+, Node.js 18+, pip, npm
- Zerodha demat account with F&O enabled
- Kite Connect API subscription (₹2,000/mo) from kite.trade
- Set Redirect URL in Kite dev console to: `http://localhost:8000/auth/callback`

---

## 1 — Backend Setup

```bash
cd nifty50-scalper/backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure credentials
nano .env
# Fill in:
#   KITE_API_KEY=your_key
#   KITE_API_SECRET=your_secret
#   DEFAULT_INDEX=NIFTY
#   BUDGET_PER_LOT=2500

# Start server
uvicorn main:app --reload --port 8000
```

---

## 2 — Frontend Setup

```bash
cd nifty50-scalper/frontend
npm install
npm start
# Opens at http://localhost:3000
```

---

## 3 — Daily Login (Required Every Morning)

Kite sessions expire at midnight IST.

```
1. Visit http://localhost:8000/auth/status
2. If "authenticated": false → open the login_url in browser
3. Complete Zerodha login
4. Browser redirects to /auth/callback automatically
5. Dashboard starts streaming live data
```

---

## 4 — Signal Tiers Explained

| Tier | Conditions | When it fires |
|------|-----------|---------------|
| STRONG | 7+/12 | Full alignment — high confidence |
| MODERATE | 5-6/12 | Good trend + some structure |
| SCOUT | 3-4 trend only | Live trending market — early entry |

**SCOUT is the key fix over the legacy dashboard.** In a confirmed
BULLISH_TREND or BEARISH_TREND, SCOUT fires when just 3 of the 4
trend/momentum conditions align — catching the move at the start.

---

## 5 — Budget & Lot Size

For NIFTY (lot=65, budget=₹2500):
- **Valid premium range: ₹19.23 to ₹38.46**
  - Upper: budget/lot = 2500/65 = ₹38.46 (1 lot fits exactly)
  - Lower: budget/(2×lot) = 2500/130 = ₹19.23 (2 lots fit)
- Qty sent to Kite = lots × 65 (always a multiple, no errors)

---

## 6 — Key Endpoints

| Endpoint | Description |
|----------|-------------|
| GET /auth/status | Check Kite session |
| GET /data/signal | Current signal |
| GET /data/config | Runtime config + budget band |
| GET /trade/refresh | Live trade status + P&L |
| WS /ws/live | Real-time WebSocket feed |

---

## 7 — Folder Structure

```
nifty50-scalper/
├── backend/
│   ├── main.py           # FastAPI server
│   ├── signal_engine.py  # 3-tier signal logic (STRONG/MODERATE/SCOUT)
│   ├── indicators.py     # All indicators + price action + trend
│   ├── trade_manager.py  # Order lifecycle + real SL execution
│   ├── option_filter.py  # Budget-band option screener
│   ├── fii_dii.py        # NSE FII/DII data
│   ├── data_feed.py      # KiteTicker WebSocket
│   └── .env              # Credentials (never commit)
└── frontend/
    └── src/
        ├── App.jsx           # Main layout + signal flash overlay
        ├── components/
        │   ├── TopBar.jsx        # Index switcher, live signal badge
        │   ├── CandleChart.jsx   # Candlestick + BB + EMA + VWAP + Fib
        │   ├── SignalCard.jsx    # 12-condition checklist + indicators
        │   ├── RecommendPanel.jsx# Best option + execute trade
        │   ├── TradeBox.jsx      # Positions: modify/cancel/exit + P&L bar
        │   ├── OIChain.jsx       # Option chain ±200pts
        │   ├── FibLegend.jsx     # Fibonacci levels sidebar
        │   └── PnLReport.jsx     # Pie charts + daily bar + trade log
        └── hooks/
            └── useLiveData.js    # WebSocket consumer
```

---

## 8 — Charges

| Service | Cost |
|---------|------|
| Kite Connect API | ₹2,000/mo |
| Zerodha brokerage | ₹20/order flat |
| TradingView Pro+ (optional webhook) | ₹1,500/mo |
| VPS/ngrok for webhook (optional) | ₹0–600/mo |
| Claude Pro (Claude Code) | ₹1,700/mo |

---

## 9 — Risk Warning

This is an educational and analytical tool.
Options trading carries significant financial risk.
The maximum loss on an option buy is the full premium paid.
Always use stop-losses. Never trade more than you can afford to lose.
