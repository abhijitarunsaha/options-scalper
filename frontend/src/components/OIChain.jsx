import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { T } from "../theme";
import TerminalPanel from "./ui/TerminalPanel";

export default function OIChain({ ltp, index }) {
  const [chain, setChain] = useState([]);
  const [loading, setLoading] = useState(false);

  const actionButton = {
    fontSize: 11,
    padding: "4px 10px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg4)",
    color: "var(--text2)",
    cursor: "pointer"
  };

  const load = useCallback(() => {
    if (!ltp) return;
    setLoading(true);
    axios.get(`/data/oi-chain?range_pts=200&index=${index || "NIFTY"}`)
      .then(r => setChain(r.data.chain || []))
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [ltp, index]);

  useEffect(() => { load(); }, [load]);

  const step = index === "BANKNIFTY" || index === "SENSEX" ? 100 : 50;
  const atm = ltp ? Math.round(ltp / step) * step : 0;
  const maxOI = Math.max(...chain.map(r => Math.max(r.ce_oi || 0, r.pe_oi || 0)), 1);

  return (
    <TerminalPanel
      icon="📊"
      title="Option Chain"
      subtitle="±200 pts around ATM"
      actions={
        <button
          onClick={load}
          style={actionButton}
        >
          ↻ Refresh
        </button>
      }
    >

      <div style={{ padding: "10px 16px", overflowX: "auto" }}>
        {loading ? (
          <div style={{ fontSize: 12, color: "var(--muted)", padding: "16px 0", textAlign: "center" }}>Loading chain…</div>
        ) : chain.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--muted)", padding: "16px 0", textAlign: "center" }}>No data available</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["CE Chg", "CE OI", "CE LTP", "STRIKE", "PE LTP", "PE OI", "PE Chg", "PCR"].map((h, i) => (
                  <th key={h} style={{ padding: "6px 8px", textAlign: i < 3 ? "right" : i === 3 ? "center" : "left", color: "var(--muted)", fontSize: 9, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chain.map(row => {
                const isATM = row.strike === atm;
                const ceBar = Math.round((row.ce_oi / maxOI) * 56);
                const peBar = Math.round((row.pe_oi / maxOI) * 56);
                return (
                  <tr key={row.strike} style={{ background: isATM ? "rgba(79,142,247,0.07)" : "transparent", borderBottom: "1px solid var(--bg3)", transition: "background .15s" }}>
                    <td style={{ padding: "5px 8px", textAlign: "right", color: row.ce_oi_change > 0 ? "var(--green)" : "var(--red)", fontFamily: T.mono, fontSize: 10 }}>
                      {row.ce_oi_change > 0 ? "+" : ""}{(row.ce_oi_change / 1000).toFixed(0)}K
                    </td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5 }}>
                        <span style={{ color: "var(--text2)", fontFamily: T.mono, fontSize: 10 }}>{(row.ce_oi / 100000).toFixed(1)}L</span>
                        <div style={{ width: ceBar, height: 4, background: "var(--red)", borderRadius: 2, minWidth: 1, opacity: .7 }} />
                      </div>
                    </td>
                    <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: T.mono, color: "var(--text)" }}>₹{row.ce_ltp?.toFixed(1)}</td>
                    <td style={{ padding: "5px 8px", textAlign: "center" }}>
                      <span style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 12, color: isATM ? "var(--accent)" : "var(--text)", background: isATM ? "var(--blueDim)" : "transparent", padding: "2px 8px", borderRadius: 6 }}>
                        {row.strike}{isATM && <span style={{ fontSize: 8, color: "var(--accent)", marginLeft: 3 }}>ATM</span>}
                      </span>
                    </td>
                    <td style={{ padding: "5px 8px", fontFamily: T.mono, color: "var(--text)" }}>₹{row.pe_ltp?.toFixed(1)}</td>
                    <td style={{ padding: "5px 8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <div style={{ width: peBar, height: 4, background: "var(--green)", borderRadius: 2, minWidth: 1, opacity: .7 }} />
                        <span style={{ color: "var(--text2)", fontFamily: T.mono, fontSize: 10 }}>{(row.pe_oi / 100000).toFixed(1)}L</span>
                      </div>
                    </td>
                    <td style={{ padding: "5px 8px", color: row.pe_oi_change > 0 ? "var(--green)" : "var(--red)", fontFamily: T.mono, fontSize: 10 }}>
                      {row.pe_oi_change > 0 ? "+" : ""}{(row.pe_oi_change / 1000).toFixed(0)}K
                    </td>
                    <td style={{ padding: "5px 8px", fontFamily: T.mono, fontSize: 10, color: row.pcr > 1.2 ? "var(--red)" : row.pcr < 0.8 ? "var(--green)" : "var(--text2)" }}>
                      {row.pcr?.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </TerminalPanel>
  );
}
