import React, { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import useLiveData from "./hooks/useLiveData";
import TopBar        from "./components/TopBar";
import CandleChart   from "./components/CandleChart";
import SignalCard    from "./components/SignalCard";
import RecommendPanel from "./components/RecommendPanel";
import TradeBox      from "./components/TradeBox";
import OIChain       from "./components/OIChain";
import FibLegend     from "./components/FibLegend";
import PnLReport     from "./components/PnLReport";
import StatCard      from "./components/StatCard";
import Portfolio     from "./components/Portfolio";
import PredictionCard from "./components/PredictionCard";
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
      background: isCE ? "rgba(47,190,131,0.04)" : "rgba(225,73,95,0.04)" }}>
      <div style={{
        padding:"20px 40px", borderRadius:20, fontWeight:700, fontSize:22, letterSpacing:"-.01em", fontFamily:"var(--font-display)",
        background: isCE ? "rgba(15,64,45,0.97)" : "rgba(80,20,28,0.97)",
        color: isCE ? "#4ade80" : "#f87171",
        border: `2px solid ${isCE ? "#2FBE83" : "#E1495F"}`,
        boxShadow: isCE ? "0 0 40px rgba(47,190,131,0.35)" : "0 0 40px rgba(225,73,95,0.35)",
        animation: "flashIn .3s ease",
      }}>
        {isCE ? "▲ CE BUY" : "▼ PE BUY"}
        {signal?.tier && <span style={{ marginLeft:12, fontSize:14, padding:"3px 10px", borderRadius:8, background:tm.bg, color:tm.color }}>{tm.icon} {tm.label}</span>}
      </div>
      <style>{`@keyframes flashIn{from{transform:scale(.8);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}

function SignalLog({ signal }) {
  const [log, setLog] = useState([]);
  const prev = useRef(null);
  useEffect(() => {
    const s = signal?.signal;
    if (s && s !== "WAIT" && s !== prev.current) {
      prev.current = s;
      setLog(l => [{ sig:s, tier:signal.tier, score:signal.score, ltp:signal.ltp,
        time: new Date().toLocaleTimeString("en-IN",{timeZone:"Asia/Kolkata",hour12:true}) }, ...l].slice(0,20));
    }
  }, [signal]);
  return (
    <div style={{ background:"var(--glass2)", border:"1px solid var(--border)", borderRadius:"var(--radius2)", padding:"12px 14px", backdropFilter:"blur(12px)" }}>
      <div style={{ fontSize:9, color:"var(--muted)", textTransform:"uppercase", letterSpacing:".08em", marginBottom:10, fontWeight:600 }}>Signal Log</div>
      {!log.length && <div style={{ fontSize:11, color:"var(--muted)", padding:"8px 0" }}>Waiting for signals…</div>}
      {log.map((e, i) => {
        const tm = tierMeta(e.tier);
        return (
          <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid var(--bg4)", gap:6 }}>
            <span style={{ fontSize:11, fontWeight:700, color:e.sig==="CE_BUY"?"var(--green)":"var(--red)", fontFamily:T.mono, minWidth:40 }}>
              {e.sig==="CE_BUY"?"▲ CE":"▼ PE"}
            </span>
            {e.tier && <span style={{ fontSize:9, fontWeight:600, padding:"1px 6px", borderRadius:4, background:tm.bg, color:tm.color }}>{tm.label}</span>}
            <span style={{ fontSize:10, color:"var(--text2)", fontFamily:T.mono }}>{e.score}</span>
            <span style={{ fontSize:10, color:"var(--text2)", fontFamily:T.mono }}>₹{e.ltp?.toFixed(0)}</span>
            <span style={{ fontSize:9, color:"var(--muted)" }}>{e.time}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  const [idx,      setIdx]    = useState("NIFTY");
  const [cfg,      setCfg]    = useState({});
  const [allC,     setAllC]   = useState([]);
  const [reload,   setReload] = useState(0);
  const [totalPnl, setTotal]  = useState(null);
  const [activeTab,setTab]    = useState("Live");

  const { candles, signal, indicators, fibonacci, trend, fiiDii, connected, authError } = useLiveData(idx);

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
  const isCE = signal?.signal === "CE_BUY", isPE = signal?.signal === "PE_BUY";

  const col = { display:"grid", gridTemplateColumns:"1fr", gap:10 };

  return (
    <div style={{ height:"100vh", display:"flex", flexDirection:"column", background:"var(--bg)", overflow:"hidden" }}>
      <SignalFlash signal={signal} />

      <TopBar connected={connected} authError={authError} ltp={ltp} index={idx}
        onIndex={handleIdx} onReload={handleReload}
        candles={allC.length} minCandles={cfg.min_candles || 10}
        signal={signal} totalPnl={totalPnl}
        activeTab={activeTab} onTab={setTab} />

      {authError && (
        <div style={{ background:"var(--redDim)", borderBottom:"1px solid rgba(245,65,93,.25)", padding:"8px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
          <span style={{ color:"var(--red)", fontSize:12 }}>⚠ Kite session expired — live data paused</span>
          <a href={authError.login_url} target="_blank" rel="noreferrer"
            style={{ background:"var(--red)", color:"#fff", padding:"4px 14px", borderRadius:7, fontSize:11, fontWeight:600, textDecoration:"none" }}>Login with Zerodha →</a>
        </div>
      )}

      {/* Main scrollable area */}
      <div style={{ flex:1, overflow:"auto", padding:12 }}>

        {/* ── LIVE TAB ── */}
        {activeTab === "Live" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:12, alignItems:"start" }}>
            {/* Left */}
            <div style={col}>
              {/* KPI row */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))", gap:8 }}>
                <StatCard icon="📈" label="LTP"   value={ltp ? `₹${ltp.toFixed(2)}` : null} color="var(--accent)" />
                <StatCard icon="⚖" label="VWAP"  value={indicators?.vwap ? `₹${indicators.vwap.toFixed(2)}` : null} color="var(--accent2)" />
                <StatCard icon="📊" label="RSI"   value={indicators?.rsi?.toFixed(1)}
                  color={!indicators?.rsi ? "var(--text)" : indicators.rsi < 35 ? "var(--green)" : indicators.rsi > 65 ? "var(--red)" : "var(--text)"} />
                <StatCard icon="🌊" label="ATR"   value={indicators?.atr?.toFixed(1)} color="var(--gold)" />
                <StatCard icon="💡" label="Trend" value={indicators?.trend || trend?.trend || "—"}
                  color={(indicators?.trend || trend?.trend || "").includes("BULL") ? "var(--green)" : (indicators?.trend || trend?.trend || "").includes("BEAR") ? "var(--red)" : "var(--text2)"}
                  sub={indicators?.volume_spike ? "Vol Spike ✓" : null} />
                <StatCard icon="😨" label="VIX"   value={indicators?.vix?.toFixed(2)}
                  color={!indicators?.vix ? "var(--text)" : indicators.vix <= 15 ? "var(--green)" : indicators.vix >= 20 ? "var(--red)" : "var(--gold)"}
                  sub={fiiDii?.bias || null} />
              </div>

              <CandleChart candles={allC} fibonacci={fibonacci} />
              <SignalCard  signal={signal} indicators={indicators} fiiDii={fiiDii} />
              <PredictionCard prediction={signal?.prediction} />
              <RecommendPanel key={reload} signal={signal} index={idx} defaultBudget={cfg.budget_per_lot || 2500} />
              <TradeBox    onUpdate={() => setReload(r => r + 1)} />
            </div>

            {/* Right sidebar */}
            <div style={col}>
              {/* Live snapshot card */}
              <div style={{ background:"var(--glass2)", border:"1px solid var(--border)", borderRadius:"var(--radius2)", padding:"14px", backdropFilter:"blur(12px)", boxShadow:"var(--shadow)" }}>
                <div style={{ fontSize:9, color:"var(--muted)", textTransform:"uppercase", letterSpacing:".08em", marginBottom:12, fontWeight:600 }}>Live Snapshot</div>
                {[
                  ["EMA 9",    indicators?.ema9?.toFixed(1)],
                  ["EMA 21",   indicators?.ema21?.toFixed(1)],
                  ["EMA 50",   indicators?.ema50?.toFixed(1)],
                  ["BB Upper", indicators?.bb_upper?.toFixed(1)],
                  ["BB Lower", indicators?.bb_lower?.toFixed(1)],
                  ["BB %",     indicators?.bb_pct != null ? (indicators.bb_pct * 100).toFixed(0) + "%" : null],
                  ["MACD H",   indicators?.macd_hist?.toFixed(2)],
                  ["Vol ×",    indicators?.volume_ratio?.toFixed(1) + "×"],
                  ["Swing R",  indicators?.swing_resistance ? `₹${indicators.swing_resistance}` : null],
                  ["Swing S",  indicators?.swing_support    ? `₹${indicators.swing_support}` : null],
                  ["Breakout", indicators?.breakout ? "YES ✓" : indicators?.breakdown ? "DOWN ✓" : "No"],
                  ["FII Net",  fiiDii?.fii_net != null ? (fiiDii.fii_net >= 0 ? "+" : "") + fiiDii.fii_net + " Cr" : null],
                  ["DII Net",  fiiDii?.dii_net != null ? (fiiDii.dii_net >= 0 ? "+" : "") + fiiDii.dii_net + " Cr" : null],
                  ["FII/DII",  fiiDii?.bias],
                ].map(([k, v]) => (
                  <div key={k} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"5px 0", borderBottom:"1px solid var(--bg4)" }}>
                    <span style={{ fontSize:11, color:"var(--text2)" }}>{k}</span>
                    <span style={{ fontSize:11, fontFamily:T.mono, fontWeight:500,
                      color: k === "FII/DII"  ? (v === "BULLISH" ? "var(--green)" : v === "BEARISH" ? "var(--red)" : "var(--text2)")
                           : k === "Breakout" ? (v?.includes("YES") ? "var(--green)" : v?.includes("DOWN") ? "var(--red)" : "var(--muted)")
                           : k.includes("FII Net") || k.includes("DII Net") ? (parseFloat(v) > 0 ? "var(--green)" : parseFloat(v) < 0 ? "var(--red)" : "var(--text2)")
                           : "var(--text)" }}>
                      {v ?? <span style={{ color:"var(--muted)" }}>—</span>}
                    </span>
                  </div>
                ))}
              </div>
              <FibLegend fibonacci={fibonacci} />
              <SignalLog signal={signal} />
            </div>
          </div>
        )}

        {/* ── PORTFOLIO TAB ── */}
        {activeTab === "Portfolio" && <Portfolio />}

        {/* ── TRADES TAB ── */}
        {activeTab === "Trades" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, alignItems:"start" }}>
            <div style={col}>
              <RecommendPanel key={reload} signal={signal} index={idx} defaultBudget={cfg.budget_per_lot || 2500} />
            </div>
            <div style={col}>
              <TradeBox onUpdate={() => setReload(r => r + 1)} />
              <OIChain ltp={ltp} index={idx} />
            </div>
          </div>
        )}

        {/* ── REPORT TAB ── */}
        {activeTab === "Report" && (
          <div style={{ maxWidth:900, margin:"0 auto" }}>
            <PnLReport />
          </div>
        )}

        <div style={{ marginTop:12, fontSize:10, color:"var(--muted)", textAlign:"center", padding:"8px 0", borderTop:"1px solid var(--border)" }}>
          ⚠ Educational tool only · Options trading carries significant risk · Always trade responsibly
        </div>
      </div>
    </div>
  );
}
