import React, { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { T } from "../theme";

export default function OIChain({ index }) {
  const [tab,     setTab]     = useState("Option Chain");
  const [chain,   setChain]   = useState([]);
  const [ltp,     setLtp]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [trades,  setTrades]  = useState([]);

  // Polls on a fixed cadence (not on every live-price tick) and merges new
  // values into the existing rows by strike — keeps row identity/order stable
  // so the table's values update in place instead of the whole table
  // flickering/re-rendering every second. Also fires immediately on mount
  // regardless of the indicator warmup, since the backend now falls back to
  // the live in-progress candle for LTP (see main.py's _spot_ltp) — no need
  // to wait out the 10-candle signal-engine warmup just to see the chain.
  const load = useCallback(() => {
    setLoading(l => chain.length ? l : true);
    axios.get(`/data/oi-chain?range_pts=200&index=${index || "NIFTY"}`)
      .then(r => {
        if (r.data.ltp) setLtp(r.data.ltp);
        const fresh = r.data.chain || [];
        setChain(prev => {
          if (!prev.length) return fresh;
          const byStrike = new Map(fresh.map(row => [row.strike, row]));
          const merged = prev.map(row => byStrike.has(row.strike) ? { ...row, ...byStrike.get(row.strike) } : row)
            .filter(row => byStrike.has(row.strike));
          const knownStrikes = new Set(prev.map(r => r.strike));
          fresh.forEach(row => { if (!knownStrikes.has(row.strike)) merged.push(row); });
          return merged.sort((a, b) => a.strike - b.strike);
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [index]); // eslint-disable-line

  useEffect(() => {
    setChain([]); load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [index]); // eslint-disable-line

  useEffect(() => {
    if (tab !== "Active Chain") return;
    axios.get("/trade/refresh").then(r => setTrades(r.data.trades || [])).catch(() => {});
  }, [tab]);

  const step = index === "BANKNIFTY" || index === "SENSEX" ? 100 : 50;
  const atm  = ltp ? Math.round(ltp / step) * step : 0;
  const maxOI = Math.max(...chain.map(r => Math.max(r.ce_oi || 0, r.pe_oi || 0)), 1);
  const expiry = chain[0]?.expiry ? new Date(chain[0].expiry).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }).toUpperCase() : null;

  const activeStrikes = useMemo(() =>
    new Set(trades.filter(t => ["PENDING", "OPEN"].includes(t.status)).map(t => t.strike)),
  [trades]);

  const rows = tab === "Active Chain" ? chain.filter(r => activeStrikes.has(r.strike)) : chain;

  return (
    <div style={{ background: "var(--glass2)", border: "1px solid var(--border)", borderRadius: "var(--radius2)", overflow: "hidden", backdropFilter: "blur(12px)", boxShadow: "var(--shadow)" }}>
      <div style={{ padding: "10px 16px 0", background: "var(--bg3)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: 18 }}>
          {["Option Chain", "Active Chain"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: "none", border: "none", padding: "0 0 10px", fontSize: 11.5, fontWeight: 700,
              color: tab === t ? "var(--watch)" : "var(--muted)", borderBottom: tab === t ? "2px solid var(--watch)" : "2px solid transparent",
              letterSpacing: ".03em", textTransform: "uppercase",
            }}>{t}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "10px 16px 4px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{index || "NIFTY"}</span>
          {expiry && <span style={{ fontSize: 10, color: "var(--text2)", fontFamily: T.mono, background: "var(--bg4)", padding: "2px 8px", borderRadius: 6 }}>{expiry}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: "var(--muted)" }}>ATM ±200</span>
          <button onClick={load} style={{ fontSize: 11, color: "var(--text2)", background: "var(--bg4)", border: "1px solid var(--border)", borderRadius: 7, padding: "3px 10px" }}>↺</button>
        </div>
      </div>

      <div style={{ padding: "6px 16px 14px", overflowX: "auto" }}>
        {loading ? (
          <div style={{ fontSize: 12, color: "var(--muted)", padding: "16px 0", textAlign: "center" }}>Loading chain…</div>
        ) : rows.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--muted)", padding: "16px 0", textAlign: "center" }}>
            {tab === "Active Chain" ? "No open strikes right now" : "No data available"}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th colSpan={3} style={{ padding: "4px 4px", textAlign: "center", color: "var(--bull)", fontSize: 9, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700 }}>Calls</th>
                <th />
                <th colSpan={3} style={{ padding: "4px 4px", textAlign: "center", color: "var(--bear)", fontSize: 9, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700 }}>Puts</th>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["OI", "LTP", "CHG"].map(h => <th key={"c"+h} style={{ padding: "5px 6px", textAlign: "right", color: "var(--muted)", fontSize: 9, textTransform: "uppercase", fontWeight: 600 }}>{h}</th>)}
                <th style={{ padding: "5px 6px", textAlign: "center", color: "var(--muted)", fontSize: 9, textTransform: "uppercase", fontWeight: 600 }}>Strike</th>
                {["LTP", "CHG", "OI"].map(h => <th key={"p"+h} style={{ padding: "5px 6px", textAlign: "left", color: "var(--muted)", fontSize: 9, textTransform: "uppercase", fontWeight: 600 }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const isATM = row.strike === atm;
                const ceBar = Math.round((row.ce_oi / maxOI) * 40);
                const peBar = Math.round((row.pe_oi / maxOI) * 40);
                return (
                  <tr key={row.strike} style={{ background: isATM ? "var(--watchDim)" : "transparent", borderBottom: "1px solid var(--bg3)", transition: "background .15s" }}>
                    <td style={{ padding: "5px 6px", textAlign: "right" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5 }}>
                        <div style={{ width: ceBar, height: 4, background: "var(--bull)", borderRadius: 2, minWidth: 1, opacity: .6 }} />
                        <span style={{ color: "var(--text2)", fontFamily: T.mono, fontSize: 10 }}>{(row.ce_oi / 100000).toFixed(1)}L</span>
                      </div>
                    </td>
                    <td style={{ padding: "5px 6px", textAlign: "right", fontFamily: T.mono, color: "var(--text)" }}>₹{row.ce_ltp?.toFixed(1)}</td>
                    <td style={{ padding: "5px 6px", textAlign: "right", color: row.ce_oi_change > 0 ? "var(--bull)" : "var(--bear)", fontFamily: T.mono, fontSize: 10 }}>
                      {row.ce_oi_change > 0 ? "+" : ""}{(row.ce_oi_change / 1000).toFixed(0)}K
                    </td>
                    <td style={{ padding: "5px 6px", textAlign: "center" }}>
                      <span style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 12, color: isATM ? "var(--watch)" : "var(--text)", padding: "2px 8px", borderRadius: 6 }}>
                        {row.strike}{isATM && <span style={{ fontSize: 8, color: "var(--watch)", marginLeft: 3 }}>ATM</span>}
                      </span>
                    </td>
                    <td style={{ padding: "5px 6px", fontFamily: T.mono, color: "var(--text)" }}>₹{row.pe_ltp?.toFixed(1)}</td>
                    <td style={{ padding: "5px 6px", color: row.pe_oi_change > 0 ? "var(--bull)" : "var(--bear)", fontFamily: T.mono, fontSize: 10 }}>
                      {row.pe_oi_change > 0 ? "+" : ""}{(row.pe_oi_change / 1000).toFixed(0)}K
                    </td>
                    <td style={{ padding: "5px 6px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ color: "var(--text2)", fontFamily: T.mono, fontSize: 10 }}>{(row.pe_oi / 100000).toFixed(1)}L</span>
                        <div style={{ width: peBar, height: 4, background: "var(--bear)", borderRadius: 2, minWidth: 1, opacity: .6 }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: 10, fontSize: 9.5, color: "var(--muted)", textAlign: "right" }}>
          ● Data as of {new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: true })} IST
        </div>
      </div>
    </div>
  );
}
