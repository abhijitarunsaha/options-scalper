import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { T, pnlColor } from "../theme";
import ConfirmationRing from "./ConfirmationRing";

// Maps the live signal onto the anti-overtrading state shown by the legend —
// grounded in signal_engine.py's actual confirm_reason wording, not invented.
function regimeState(signal) {
  if (!signal) return "BUILDING";
  if (signal.actionable) return "ACTIONABLE";
  const reason = (signal.confirm_reason || signal.reason || "").toLowerCase();
  if (reason.includes("cooldown")) return "COOLDOWN";
  return "BUILDING";
}

function LegendDot({ label, tag, color, active }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, opacity: active ? 1 : 0.45 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: active ? `0 0 8px ${color}` : "none" }} />
      <span style={{ fontSize: 9.5, fontWeight: active ? 700 : 600, color: active ? color : "var(--muted)", letterSpacing: ".03em" }}>
        {label} <span style={{ opacity: 0.7 }}>({tag})</span>
      </span>
    </div>
  );
}

// Index-point levels — NOT rupee amounts, so no ₹ prefix here.
function LevelRow({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--bg4)" }}>
      <span style={{ fontSize: 11, color: "var(--text2)" }}>{label}</span>
      <span style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 13, color: color || "var(--text)" }}>
        {value != null ? Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : <span style={{ color: "var(--muted)", fontWeight: 400 }}>—</span>}
      </span>
    </div>
  );
}

export default function SignalModuleCard({ signal, indicators, index }) {
  const state = regimeState(signal);
  const isCE = signal?.signal === "CE_BUY";
  const isPE = signal?.signal === "PE_BUY";
  const ringColor = state === "ACTIONABLE" ? (isCE ? "var(--bull)" : isPE ? "var(--bear)" : "var(--brand)")
                   : state === "COOLDOWN"  ? "var(--bear)" : "var(--watch)";

  const ltp    = indicators?.ltp;
  const target = signal?.prediction?.target;
  const stop   = signal?.prediction?.invalidation;

  const [best, setBest]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [msg, setMsg]         = useState(null);

  const loadBest = useCallback(() => {
    if (!signal?.actionable || (!isCE && !isPE)) { setBest(null); return; }
    setLoading(true);
    axios.get(`/trade/best-option?index=${index?.replace(" 50", "") || "NIFTY"}`)
      .then(r => setBest(r.data))
      .catch(() => setBest(null))
      .finally(() => setLoading(false));
  }, [signal?.actionable, signal?.signal, index]); // eslint-disable-line

  useEffect(() => { loadBest(); }, [loadBest]);

  const clickToTrade = async () => {
    const opt = best?.best;
    if (!opt) return;
    const limit = +(opt.entry_ltp * 1.005).toFixed(1);
    if (!window.confirm(`LIMIT BUY\n${opt.symbol}\n1 lot · ${opt.lot_size} qty @ ₹${limit}\nSL ₹${opt.sl_ltp} · Target ₹${opt.target_ltp}\nSized from ${best.budget_desc}`)) return;
    setPlacing(true); setMsg(null);
    try {
      const r = await axios.post("/trade/execute", { option: opt, lots: 1, index: index?.replace(" 50", "") || "NIFTY", limit_price: limit });
      setMsg({ e: false, t: `✓ Placed — ${r.data.trade.trade_id}` });
      loadBest();
    } catch (e) {
      setMsg({ e: true, t: "✗ " + (e.response?.data?.error || e.message) });
    } finally { setPlacing(false); }
  };

  const opt = best?.best;

  return (
    <div style={{ background: "var(--glass2)", border: "1px solid var(--border)", borderRadius: "var(--radius2)", overflow: "hidden", backdropFilter: "blur(12px)", boxShadow: "var(--shadow)" }}>
      <div style={{ padding: "12px 16px", background: "var(--bg3)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13 }}>◈</span>
        <span style={{ fontWeight: 700, color: "var(--text)", fontSize: 12.5, letterSpacing: ".04em" }}>SIGNAL MODULE</span>
      </div>

      <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ position: "relative", width: 148, height: 148, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ConfirmationRing regime={signal?.regime || "STEADY_STATE"} actionable={signal?.actionable} size={148} tierColor={ringColor} />
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 18px" }}>
            <span style={{ fontFamily: T.display, fontWeight: 700, fontSize: 15, color: "var(--text)", letterSpacing: ".02em" }}>{index}</span>
            <span style={{ fontSize: 8.5, color: "var(--muted)", marginTop: 6, letterSpacing: ".06em" }}>SIGNAL STATUS</span>
            <span style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 12, color: ringColor, marginTop: 2, letterSpacing: ".03em" }}>{state}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, marginTop: 18, flexWrap: "wrap", justifyContent: "center" }}>
          <LegendDot label="BUILDING"   tag="MARIGOLD" color="var(--watch)" active={state === "BUILDING"} />
          <LegendDot label="ACTIONABLE" tag="EMERALD"  color="var(--bull)"  active={state === "ACTIONABLE"} />
          <LegendDot label="COOLDOWN"   tag="ROSE"     color="var(--bear)"  active={state === "COOLDOWN"} />
        </div>

        <div style={{ width: "100%", marginTop: 18 }}>
          <LevelRow label="Entry (Index)"  value={ltp} />
          <LevelRow label="Target (Index)" value={target} color="var(--bull)" />
          <LevelRow label="Stop (Index)"   value={stop}   color="var(--bear)" />
        </div>

        {/* Actionable CE/PE pick, sized from live Zerodha funds + ranked by Black-Scholes delta/theta */}
        {signal?.actionable && (isCE || isPE) && (
          <div style={{ width: "100%", marginTop: 14, padding: "12px", borderRadius: 12, background: isCE ? "var(--bullDim)" : "var(--bearDim)", border: `1px solid ${isCE ? "var(--bull)" : "var(--bear)"}33` }}>
            {loading && <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center" }}>Scanning chain…</div>}
            {!loading && !opt && <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center" }}>No option fits available funds right now</div>}
            {!loading && opt && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{opt.symbol}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 5, background: isCE ? "var(--bull)" : "var(--bear)", color: "#fff" }}>{opt.type}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, fontSize: 10, color: "var(--text2)", marginBottom: 10 }}>
                  <div>LTP <b style={{ color: "var(--text)", fontFamily: T.mono }}>₹{opt.premium}</b></div>
                  <div>Δ <b style={{ color: "var(--text)", fontFamily: T.mono }}>{opt.delta}</b></div>
                  <div>IV <b style={{ color: "var(--text)", fontFamily: T.mono }}>{opt.iv_pct}%</b></div>
                  <div>SL <b style={{ color: "var(--bear)", fontFamily: T.mono }}>₹{opt.sl_ltp}</b></div>
                  <div>Target <b style={{ color: "var(--bull)", fontFamily: T.mono }}>₹{opt.target_ltp}</b></div>
                  <div>Idx tgt <b style={{ color: "var(--watch)", fontFamily: T.mono }}>{opt.target_index}</b></div>
                </div>
                {msg && <div style={{ fontSize: 10.5, marginBottom: 8, color: msg.e ? "var(--bear)" : "var(--bull)" }}>{msg.t}</div>}
                <button onClick={clickToTrade} disabled={placing} style={{
                  width: "100%", padding: "9px", borderRadius: 9, border: "none", fontWeight: 700, fontSize: 12,
                  color: "#fff", background: placing ? "var(--muted)" : (isCE ? "linear-gradient(135deg,#0F6E4A,var(--bull))" : "linear-gradient(135deg,#8E2E48,var(--bear))"),
                }}>{placing ? "Placing…" : "⚡ Click to Trade"}</button>
                <div style={{ fontSize: 8.5, color: "var(--muted)", marginTop: 6, textAlign: "center" }}>Sized from {best.budget_desc}</div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
