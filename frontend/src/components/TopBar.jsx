import React, { useState, useEffect } from "react";
import { T, tierMeta, pnlColor, regimeMeta } from "../theme";
import { useTheme } from "../ThemeContext";
import ConfirmationRing from "./ConfirmationRing";
import Brand from "../components/Brand";

function useClock() {
  const [t, setT] = useState(() => new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: true }));
  useEffect(() => {
    const id = setInterval(() => setT(new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: true })), 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}

const TABS = ["Live", "Portfolio", "Trades", "Report"];
const INDICES = ["NIFTY", "BANKNIFTY", "SENSEX"];

export default function TopBar({ connected, authError, ltp, index, onIndex, onReload, candles, minCandles, signal, totalPnl, activeTab, onTab }) {
  const clock = useClock();
  const {
    isDark,
    toggleTheme
  } = useTheme();
  const tier = signal?.tier;
  const sig = signal?.signal;
  const isCE = sig === "CE_BUY", isPE = sig === "PE_BUY";
  const tm = tierMeta(tier);
  const rm = regimeMeta(signal?.regime);
  const warm = (candles || 0) < (minCandles || 10);

  return (
    <header style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 20px", height: 56, flexShrink: 0, gap: 14,
      background: "var(--bg2)", borderBottom: "1px solid var(--border)",
      position: "sticky", top: 0, zIndex: 100,
    }}>

      {/* Wordmark + index tabs */}
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
          <Brand />
        </div>

        <div style={{ display: "flex", gap: 2, background: "var(--bg4)", borderRadius: 10, padding: 3 }}>
          {INDICES.map(idx => (
            <button key={idx} onClick={() => onIndex(idx)} style={{
              padding: "5px 12px", borderRadius: 8, border: "none",
              fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all .15s",
              fontFamily: T.mono, letterSpacing: ".01em",
              background: index === idx ? "var(--brand)" : "transparent",
              color: index === idx ? "#fff" : "var(--text2)",
            }}>{idx}</button>
          ))}
        </div>
      </div>

      {/* Section nav */}
      <nav style={{ display: "flex", gap: 2 }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => onTab(tab)} style={{
            padding: "6px 14px", borderRadius: 8, border: "none",
            fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all .15s",
            background: activeTab === tab ? "var(--brandDim)" : "transparent",
            color: activeTab === tab ? "var(--brand)" : "var(--text2)",
          }}>{tab}</button>
        ))}
      </nav>

      {/* Centre — LTP + regime-aware signal state */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {ltp && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: T.mono, fontSize: 17, fontWeight: 600, color: "var(--text)" }}>
              ₹{ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".07em" }}>{index} · {clock}</div>
          </div>
        )}
        {warm && (
          <div style={{ fontSize: 10, color: "var(--watch)", background: "var(--watchDim)", border: "1px solid var(--border)", borderRadius: 20, padding: "3px 10px", fontFamily: T.mono }}>
            {candles}/{minCandles} candles
          </div>
        )}
        {(isCE || isPE) && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ConfirmationRing regime={signal?.regime} actionable={signal?.actionable} tierColor={isCE ? "var(--bull)" : "var(--bear)"} size={30} />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: isCE ? "var(--bull)" : "var(--bear)" }}>
                  {isCE ? "▲ CE" : "▼ PE"}
                </span>
                {tier && (
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 6, background: tm.bg, color: tm.color, fontFamily: T.mono }}>
                    {tm.label}
                  </span>
                )}
                <span style={{ fontSize: 10, color: "var(--text2)", fontFamily: T.mono }}>{signal?.score}/{signal?.total}</span>
              </div>
              <div style={{ fontSize: 9, color: signal?.actionable ? rm.color : "var(--muted)", marginTop: 1 }}>
                {signal?.actionable ? "Actionable now" : (signal?.confirm_reason || rm.label)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {totalPnl != null && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>Session P&L</div>
            <div style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 600, color: pnlColor(totalPnl) }}>
              {totalPnl >= 0 ? "+" : ""}₹{Math.abs(totalPnl).toFixed(2)}
            </div>
          </div>
        )}
        {authError ? (
          <a href={authError.login_url} target="_blank" rel="noreferrer" style={{
            background: "var(--bear)", color: "#fff", padding: "6px 12px",
            borderRadius: 8, fontWeight: 600, fontSize: 11, textDecoration: "none",
          }}>Login required →</a>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{
              width: 7, height: 7, borderRadius: "50%",
              background: connected ? "var(--bull)" : "var(--bear)",
              boxShadow: connected ? "0 0 6px var(--bullGlow)" : "none",
            }} />
            <span style={{ fontSize: 11, color: connected ? "var(--bull)" : "var(--bear)", fontWeight: 500 }}>
              {connected ? "LIVE" : "OFF"}
            </span>
          </div>
        )}

        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            border: "1px solid var(--border)",
            background: "var(--bg4)",
            color: "var(--text2)",
            fontSize: 13,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          {isDark ? "☾" : "☀"}
        </button>

        <button onClick={onReload} aria-label="Reload" style={{
          width: 32, height: 32, borderRadius: 9, border: "1px solid var(--border)",
          background: "var(--bg4)", color: "var(--text2)", fontSize: 14,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>↺</button>
      </div>
    </header>
  );
}
