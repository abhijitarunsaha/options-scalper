import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import axios from "axios";
import useLiveData from "./hooks/useLiveData";
import TopBar        from "./components/TopBar";
import CandleChart   from "./components/CandleChart";
import SignalCard    from "./components/SignalCard";
import RecommendPanel from "./components/RecommendPanel";
import OIChain       from "./components/OIChain";
import FibLegend     from "./components/FibLegend";
import PnLReport     from "./components/PnLReport";
import StatCard      from "./components/StatCard";
import Portfolio     from "./components/Portfolio";
import PredictionCard from "./components/PredictionCard";
import SignalModuleCard from "./components/SignalModuleCard";
import PositionsHoldingsCard from "./components/PositionsHoldingsCard";
import ConfirmationRing from "./components/ConfirmationRing";
import { T, tierMeta, pnlColor } from "./theme";

function SignalFlash({ signal }) {
  const [show, setShow] = useState(false);
  const prev = useRef(null);
  useEffect(() => {
    const s = signal?.signal;
    if (s && s !== "WAIT" && s !== prev.current) {
      prev.current = s; setShow(true);
      setTimeout(() => setShow(false), 2000);
    }
  }, [signal?.signal, signal?.score]);
  if (!show) return null;
  const isCE = signal?.signal === "CE_BUY";
  const tm = tierMeta(signal?.tier);
  return (
    <div style={{ position:"fixed", inset:0, zIndex:9999, pointerEvents:"none",
      display:"flex", alignItems:"center", justifyContent:"center",
      background: isCE ? "rgba(0,230,126,0.04)" : "rgba(225,71,107,0.04)" }}>
      <div style={{
        padding:"20px 40px", borderRadius:20, fontWeight:700, fontSize:22, letterSpacing:"-.01em", fontFamily:"var(--font-display)",
        background: isCE ? "rgba(6,46,29,0.97)" : "rgba(74,20,32,0.97)",
        color: isCE ? "#4ade80" : "#f87171",
        border: `2px solid ${isCE ? "var(--bull)" : "var(--bear)"}`,
        boxShadow: isCE ? "0 0 40px rgba(0,230,126,0.35)" : "0 0 40px rgba(225,71,107,0.35)",
        animation: "flashIn .3s ease",
      }}>
        {isCE ? "▲ CE BUY" : "▼ PE BUY"}
        {signal?.tier && <span style={{ marginLeft:12, fontSize:14, padding:"3px 10px", borderRadius:8, background:tm.bg, color:tm.color }}>{tm.icon} {tm.label}</span>}
      </div>
      <style>{`@keyframes flashIn{from{transform:scale(.8);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}

function LogEntryRing({ sig, actionable }) {
  const color = actionable ? (sig === "CE_BUY" ? "var(--bull)" : "var(--bear)") : "var(--watch)";
  return (
    <div style={{ position: "relative", width: 30, height: 30, flexShrink: 0 }}>
      <ConfirmationRing regime="STEADY_STATE" actionable={actionable} size={30} tierColor={color} />
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color }}>
        {sig === "CE_BUY" ? "▲" : "▼"}
      </div>
    </div>
  );
}

function SignalLog({ signal, index }) {
  const [log, setLog] = useState([]);
  const prev = useRef(null);

  useEffect(() => {
    const s = signal?.signal;
    if (s && s !== "WAIT" && s !== prev.current) {
      prev.current = s;
      const entry = {
        sig: s, tier: signal.tier, score: signal.score, ltp: signal.ltp,
        actionable: signal.actionable, best: null,
        time: new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: true }),
      };
      setLog(l => [entry, ...l].slice(0, 20));
      if (signal.actionable) {
        axios.get(`/trade/best-option?index=${index?.replace(" 50", "") || "NIFTY"}`)
          .then(r => setLog(l => l.map(x => x === entry ? { ...x, best: r.data?.best || null } : x)))
          .catch(() => {});
      }
    }
  }, [signal, index]);

  const placeFromLog = async (entry) => {
    const opt = entry.best;
    if (!opt) return;
    const limit = +(opt.entry_ltp * 1.005).toFixed(1);
    if (!window.confirm(`LIMIT BUY\n${opt.symbol}\n1 lot · ${opt.lot_size} qty @ ₹${limit}`)) return;
    try {
      await axios.post("/trade/execute", { option: opt, lots: 1, index: index?.replace(" 50", "") || "NIFTY", limit_price: limit });
      alert("✓ Order placed");
    } catch (e) { alert("✗ " + (e.response?.data?.error || e.message)); }
  };

  return (
    <div style={{ background:"var(--glass2)", border:"1px solid var(--border)", borderRadius:"var(--radius2)", padding:"12px 14px", backdropFilter:"blur(12px)" }}>
      <div style={{ fontSize:9, color:"var(--muted)", textTransform:"uppercase", letterSpacing:".08em", marginBottom:10, fontWeight:600 }}>Signal Log</div>
      {!log.length && <div style={{ fontSize:11, color:"var(--muted)", padding:"8px 0" }}>Waiting for signals…</div>}
      {log.map((e, i) => {
        const tm = tierMeta(e.tier);
        return (
          <div key={i} style={{ padding:"7px 0", borderBottom:"1px solid var(--bg4)" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:6 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <LogEntryRing sig={e.sig} actionable={e.actionable} />
                <div>
                  <span style={{ fontSize:11, fontWeight:700, color:e.sig==="CE_BUY"?"var(--bull)":"var(--bear)", fontFamily:T.mono }}>
                    {e.sig==="CE_BUY"?"CE":"PE"}
                  </span>
                  {e.tier && <span style={{ marginLeft:6, fontSize:9, fontWeight:600, padding:"1px 6px", borderRadius:4, background:tm.bg, color:tm.color }}>{tm.label}</span>}
                  <div style={{ fontSize:9.5, color:"var(--muted)", marginTop:1 }}>{e.actionable ? "Actionable" : "Forming"} · {e.time}</div>
                </div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:10, color:"var(--text2)", fontFamily:T.mono }}>{e.score} pts</div>
                <div style={{ fontSize:10, color:"var(--text2)", fontFamily:T.mono }}>{e.ltp?.toFixed(1)}</div>
              </div>
            </div>
            {e.actionable && e.best && (
              <div style={{ marginTop:6, marginLeft:38, display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, padding:"6px 8px", background:"var(--bg4)", borderRadius:7 }}>
                <span style={{ fontSize:10.5, fontFamily:T.mono, color:"var(--text)" }}>{e.best.symbol} @ ₹{e.best.premium}</span>
                <button onClick={() => placeFromLog(e)} style={{ fontSize:10, fontWeight:700, padding:"3px 9px", borderRadius:6, border:"none", color:"#fff", background: e.sig==="CE_BUY" ? "var(--bull)" : "var(--bear)" }}>Click to Trade</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChartCard({ index, allC, fibonacci }) {
  const [showOverlays, setShowOverlays] = useState(true);
  const last = allC[allC.length - 1];
  const first = allC[0];
  const chg = last && first ? last.close - first.open : null;
  const chgPct = last && first && first.open ? (chg / first.open) * 100 : null;

  return (
    <div style={{ background:"var(--glass2)", border:"1px solid var(--border)", borderRadius:"var(--radius2)", overflow:"hidden", backdropFilter:"blur(12px)", boxShadow:"var(--shadow)" }}>
      <div style={{ padding:"10px 16px", background:"var(--bg3)", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
          <span style={{ fontWeight:700, fontSize:13, color:"var(--text)" }}>{index === "NIFTY" ? "NIFTY 50" : index}</span>
          <span style={{ fontSize:10, color:"var(--text2)", background:"var(--bg4)", padding:"2px 8px", borderRadius:6, fontFamily:T.mono }}>1m</span>
          {last && (
            <span style={{ fontSize:10.5, color:"var(--text2)", fontFamily:T.mono }}>
              O {last.open?.toFixed(2)} · H {last.high?.toFixed(2)} · L {last.low?.toFixed(2)} · C {last.close?.toFixed(2)}
              {chgPct != null && <span style={{ marginLeft:6, color: chg >= 0 ? "var(--bull)" : "var(--bear)", fontWeight:700 }}>
                {chg >= 0 ? "+" : ""}{chg.toFixed(2)} ({chg >= 0 ? "+" : ""}{chgPct.toFixed(2)}%)
              </span>}
            </span>
          )}
        </div>
        <button onClick={() => setShowOverlays(o => !o)} style={{
          fontSize:11, fontWeight:600, color: showOverlays ? "var(--watch)" : "var(--text2)",
          background: showOverlays ? "var(--watchDim)" : "var(--bg4)", border:"1px solid var(--border)",
          borderRadius:7, padding:"4px 12px",
        }}>Indicators {showOverlays ? "on" : "off"}</button>
      </div>
      <div style={{ padding:"10px 12px 4px" }}>
        <CandleChart candles={allC} fibonacci={fibonacci} showOverlays={showOverlays} />
      </div>
    </div>
  );
}

export default function App() {
  const [idx,      setIdx]    = useState("NIFTY");
  const [cfg,      setCfg]    = useState({});
  const [allC,     setAllC]   = useState([]);
  const [reload,   setReload] = useState(0);
  const [activeTab,setTab]    = useState("Dashboard");

  const { candles, signal, indicators, fibonacci, trend, fiiDii, connected, authError,
          refreshSeconds, setRefreshSeconds } = useLiveData(idx);

  useEffect(() => {
    axios.get("/data/config").then(r => { setCfg(r.data); setIdx(r.data.default_index || "NIFTY"); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!candles.length) return;
    setAllC(prev => {
      const ex = new Set(prev.map(c => String(c.time)));
      const fresh = candles.filter(c => !ex.has(String(c.time)));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
  }, [candles]);

  const handleIdx = useCallback(async i => {
    setIdx(i); setAllC([]);
    try { await axios.post(`/data/switch-index?index=${i}`); } catch {}
  }, []);

  const handleReload = useCallback(async () => {
    try { await axios.post("/data/reload"); setAllC([]); setReload(r => r + 1); } catch {}
  }, []);

  const ltp = indicators?.ltp;
  const dayChangePct = useMemo(() => {
    const first = allC[0];
    if (!first || !ltp || !first.open) return null;
    return ((ltp - first.open) / first.open) * 100;
  }, [allC, ltp]);

  const col = { display:"grid", gridTemplateColumns:"1fr", gap:10 };

  return (
    <div style={{ height:"100vh", display:"flex", flexDirection:"column", background:"var(--bg)", overflow:"hidden" }}>
      <SignalFlash signal={signal} />

      <TopBar connected={connected} authError={authError} ltp={ltp} index={idx}
        onIndex={handleIdx} onReload={handleReload}
        candles={allC.length} minCandles={cfg.min_candles || 10}
        signal={signal} dayChangePct={dayChangePct}
        activeTab={activeTab} onTab={setTab} />

      {/* Main scrollable area */}
      <div style={{ flex:1, overflow:"auto", padding:12, display:"flex", flexDirection:"column" }}>

        {/* ── DASHBOARD TAB ── */}
        {activeTab === "Dashboard" && (
          <div style={{ display:"flex", flexDirection:"column", gap:12, flex:1 }}>

            {/* Row 1 — signature signal module + live chart, mirrors the reference layout */}
            <div style={{ display:"grid", gridTemplateColumns:"340px 1fr", gap:12, alignItems:"start" }}>
              <SignalModuleCard signal={signal} indicators={indicators} index={idx === "NIFTY" ? "NIFTY 50" : idx} />
              <ChartCard index={idx} allC={allC} fibonacci={fibonacci} />
            </div>

            {/* Row 2 — option chain + positions/holdings */}
            <div style={{ display:"grid", gridTemplateColumns:"340px 1fr", gap:12, alignItems:"start" }}>
              <OIChain index={idx} />
              <PositionsHoldingsCard key={reload} onOpenReports={() => setTab("Reports")} />
            </div>

            {/* Row 3 — indicator detail, prediction, execute-trade, day P&L */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))", gap:8 }}>
              <StatCard icon="📈" label="LTP"   value={ltp ? `₹${ltp.toFixed(2)}` : null} color="var(--accent)" />
              <StatCard icon="⚖" label="VWAP"  value={indicators?.vwap ? `₹${indicators.vwap.toFixed(2)}` : null} color="var(--accent2)" />
              <StatCard icon="📊" label="RSI"   value={indicators?.rsi?.toFixed(1)}
                color={!indicators?.rsi ? "var(--text)" : indicators.rsi < 35 ? "var(--bull)" : indicators.rsi > 65 ? "var(--bear)" : "var(--text)"} />
              <StatCard icon="🌊" label="ATR"   value={indicators?.atr?.toFixed(1)} color="var(--watch)" />
              <StatCard icon="💡" label="Trend" value={indicators?.trend || trend?.trend || "—"}
                color={(indicators?.trend || trend?.trend || "").includes("BULL") ? "var(--bull)" : (indicators?.trend || trend?.trend || "").includes("BEAR") ? "var(--bear)" : "var(--text2)"}
                sub={indicators?.volume_spike ? "Vol Spike ✓" : null} />
              <StatCard icon="😨" label="VIX"   value={indicators?.vix?.toFixed(2)}
                color={!indicators?.vix ? "var(--text)" : indicators.vix <= 15 ? "var(--bull)" : indicators.vix >= 20 ? "var(--bear)" : "var(--watch)"}
                sub={fiiDii?.bias || null} />
            </div>

            <SignalCard  signal={signal} indicators={indicators} fiiDii={fiiDii}
              refreshSeconds={refreshSeconds} onSetRefreshSeconds={setRefreshSeconds} />
            <PredictionCard prediction={signal?.prediction} />
            <RecommendPanel key={reload} signal={signal} index={idx} defaultBudget={cfg.budget_per_lot || 2500} />
            <FibLegend fibonacci={fibonacci} />
            <SignalLog signal={signal} index={idx === "NIFTY" ? "NIFTY 50" : idx} />
          </div>
        )}

        {/* ── PORTFOLIO TAB ── */}
        {activeTab === "Portfolio" && <Portfolio />}

        {/* ── REPORTS TAB ── */}
        {activeTab === "Reports" && (
          <div style={{ maxWidth:1000, margin:"0 auto", width:"100%" }}>
            <PnLReport />
          </div>
        )}

        {/* Status footer — mirrors the reference layout's bottom bar */}
        <div style={{
          marginTop:12, padding:"9px 14px", borderTop:"1px solid var(--border)",
          display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8,
          fontSize:10.5, color:"var(--text2)",
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
            <span style={{ display:"flex", alignItems:"center", gap:5 }}>
              <span style={{ width:6, height:6, borderRadius:"50%", background: connected ? "var(--bull)" : "var(--bear)" }} />
              DATA FEED {connected ? "LIVE" : "OFFLINE"}
            </span>
            <span>SYSTEM HEALTH <span style={{ color: connected ? "var(--bull)" : "var(--watch)" }}>{connected ? "GOOD" : "DEGRADED"}</span></span>
            <span style={{ color:"var(--muted)" }}>⚠ Educational tool only · trade responsibly</span>
          </div>
          <span>Sigmatics · Signals, Quantified — © 2026 All rights reserved.</span>
        </div>
      </div>
    </div>
  );
}
