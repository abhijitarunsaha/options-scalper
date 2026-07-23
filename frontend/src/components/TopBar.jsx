import React, { useState, useEffect, useRef } from "react";
import { T, pnlColor } from "../theme";
import { useTheme } from "../ThemeContext";
import Logo from "./Logo";

function useClock() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id); }, []);
  return t;
}

function marketStatus(now) {
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = ist.getDay(), mins = ist.getHours() * 60 + ist.getMinutes();
  const open = day >= 1 && day <= 5 && mins >= 555 && mins < 930; // 9:15–15:30 IST
  const closeMins = 930 - mins;
  const hh = Math.max(0, Math.floor(closeMins / 60)), mm = Math.max(0, closeMins % 60);
  return { open, timeToClose: open ? `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}` : null };
}

const TABS = ["Dashboard", "Portfolio", "Reports"];
const INDICES = ["NIFTY", "BANKNIFTY", "SENSEX"];

function IndexTicker({ name, active, ltp, changePct, onClick }) {
  const up = changePct > 0, down = changePct < 0;
  return (
    <button onClick={onClick} style={{
      display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1,
      background: active ? "var(--bg4)" : "transparent", border: `1px solid ${active ? "var(--border2)" : "transparent"}`,
      borderRadius: 9, padding: "5px 12px", textAlign: "left",
    }}>
      <span style={{ fontSize: 9.5, fontWeight: 700, color: active ? "var(--text)" : "var(--muted)", letterSpacing: ".03em" }}>{name}</span>
      {active && ltp ? (
        <span style={{ fontFamily: T.mono, fontSize: 12.5, fontWeight: 600 }}>
          <span style={{ color: "var(--text)" }}>{ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          {changePct != null && (
            <span style={{ marginLeft: 6, color: up ? "var(--bull)" : down ? "var(--bear)" : "var(--text2)" }}>
              {up ? "+" : ""}{changePct.toFixed(2)}%
            </span>
          )}
        </span>
      ) : (
        <span style={{ fontSize: 10, color: "var(--muted)" }}>Switch to view</span>
      )}
    </button>
  );
}

export default function TopBar({ connected, authError, ltp, index, onIndex, onReload, candles, minCandles,
                                  signal, dayChangePct, activeTab, onTab }) {
  const now = useClock();
  const { dark, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellCount, setBellCount] = useState(0);
  const prevSig = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const s = signal?.signal;
    if (s && s !== "WAIT" && signal?.actionable && s !== prevSig.current) {
      prevSig.current = s; setBellCount(c => c + 1);
    }
  }, [signal]);

  useEffect(() => {
    const onDoc = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", onDoc); return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const ms = marketStatus(now);
  const clockStr = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: true });
  const warm = (candles || 0) < (minCandles || 10);

  return (
    <header style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap",
      padding: "8px 20px", minHeight: 56, flexShrink: 0, gap: 14,
      background: "var(--bg2)", borderBottom: "1px solid var(--border)",
      position: "sticky", top: 0, zIndex: 100,
    }}>

      {/* Menu + Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div ref={menuRef} style={{ position: "relative" }}>
          <button onClick={() => setMenuOpen(o => !o)} aria-label="Menu" style={{
            width: 34, height: 34, borderRadius: 9, border: "1px solid var(--border)",
            background: "var(--bg4)", color: "var(--text)", fontSize: 15,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>☰</button>
          {menuOpen && (
            <div style={{
              position: "absolute", top: 40, left: 0, background: "var(--bg2)", border: "1px solid var(--border)",
              borderRadius: 10, boxShadow: "var(--shadow2)", overflow: "hidden", minWidth: 160, zIndex: 200,
            }}>
              {TABS.map(tab => (
                <button key={tab} onClick={() => { onTab(tab); setMenuOpen(false); }} style={{
                  display: "block", width: "100%", textAlign: "left", padding: "10px 16px", border: "none",
                  background: activeTab === tab ? "var(--watchDim)" : "transparent",
                  color: activeTab === tab ? "var(--watch)" : "var(--text)", fontSize: 12.5, fontWeight: 600,
                }}>{tab}</button>
              ))}
              <div style={{ borderTop: "1px solid var(--border)" }} />
              <button onClick={() => { onReload(); setMenuOpen(false); }} style={{
                display: "block", width: "100%", textAlign: "left", padding: "10px 16px", border: "none",
                background: "transparent", color: "var(--text2)", fontSize: 12,
              }}>↺ Reload data feed</button>
            </div>
          )}
        </div>
        <Logo size={30} wordSize={17} />
      </div>

      {/* Index tickers */}
      <div style={{ display: "flex", gap: 4 }}>
        {INDICES.map(idx => (
          <IndexTicker key={idx} name={idx === "NIFTY" ? "NIFTY 50" : idx}
            active={index === idx} ltp={index === idx ? ltp : null}
            changePct={index === idx ? dayChangePct : null}
            onClick={() => onIndex(idx)} />
        ))}
      </div>

      {/* Status + clock */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600,
          color: ms.open ? "var(--bull)" : "var(--muted)", background: ms.open ? "var(--bullDim)" : "var(--bg4)",
          border: "1px solid var(--border)", borderRadius: 20, padding: "4px 12px",
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: ms.open ? "var(--bull)" : "var(--muted)" }} />
          MARKET {ms.open ? "OPEN" : "CLOSED"}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 12, color: "var(--text2)" }}>{clockStr} IST</div>
        {warm && (
          <div style={{ fontSize: 10, color: "var(--watch)", background: "var(--watchDim)", border: "1px solid var(--border)", borderRadius: 20, padding: "3px 10px", fontFamily: T.mono }}>
            {candles}/{minCandles} candles
          </div>
        )}
        {authError && (
          <a href={authError.login_url} target="_blank" rel="noreferrer" style={{
            background: "var(--bear)", color: "#fff", padding: "5px 12px",
            borderRadius: 8, fontWeight: 600, fontSize: 11, textDecoration: "none",
          }}>Login required →</a>
        )}
      </div>

      {/* Right controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div title={connected ? "Live data feed connected" : "Disconnected"} style={{ display: "flex", alignItems: "center", gap: 5, marginRight: 4 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: connected ? "var(--bull)" : "var(--bear)", boxShadow: connected ? "0 0 6px var(--bullGlow)" : "none" }} />
          <span style={{ fontSize: 10, color: connected ? "var(--bull)" : "var(--bear)", fontWeight: 600 }}>{connected ? "LIVE" : "OFF"}</span>
        </div>

        <button onClick={toggle} aria-label="Toggle theme" style={{
          width: 32, height: 32, borderRadius: 9, border: "1px solid var(--border)",
          background: "var(--bg4)", color: "var(--text2)", fontSize: 14,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>{dark ? "☀" : "☾"}</button>

        <button onClick={() => setBellCount(0)} title="Signal alerts" style={{
          position: "relative", width: 32, height: 32, borderRadius: 9, border: "1px solid var(--border)",
          background: "var(--bg4)", color: "var(--text2)", fontSize: 14,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          🔔
          {bellCount > 0 && (
            <span style={{
              position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8,
              background: "var(--bear)", color: "#fff", fontSize: 9, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px",
            }}>{bellCount}</span>
          )}
        </button>

        <div title="Account" style={{
          width: 32, height: 32, borderRadius: "50%", background: "var(--bg4)", border: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "var(--text2)",
        }}>👤</div>
      </div>
    </header>
  );
}
