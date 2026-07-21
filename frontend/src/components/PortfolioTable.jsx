import React from "react";
import { T, pnlColor } from "../theme";

const callColor = (call) => call === "BUY" ? "var(--bull)" : call === "SELL" ? "var(--bear)" : "var(--watch)";
const callBg    = (call) => call === "BUY" ? "var(--bullDim)" : call === "SELL" ? "var(--bearDim)" : "var(--watchDim)";

export default function PortfolioTable({ data, loading }) {
  const rows = data?.holdings || [];

  return (
    <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--radius2)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: T.display, fontWeight: 600, fontSize: 14, color: T.text }}>Holdings</span>
        <span style={{ fontSize: 10, color: "var(--muted)" }}>{data?.updated_at ? `Updated ${new Date(data.updated_at).toLocaleTimeString("en-IN", { hour12: true })}` : ""}</span>
      </div>

      {data?.concentration_flags?.length > 0 && (
        <div style={{ padding: "8px 18px", background: "var(--watchDim)", borderBottom: "1px solid var(--border)" }}>
          {data.concentration_flags.map((f, i) => (
            <div key={i} style={{ fontSize: 11, color: "var(--watch)" }}>⚠ {f}</div>
          ))}
        </div>
      )}

      {loading && <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>Loading holdings…</div>}
      {!loading && !rows.length && <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>No holdings found.</div>}

      {!!rows.length && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Symbol", "Qty", "Avg", "LTP", "Value", "P&L", "Alloc", "Call"].map((h, i) => (
                <th key={h} style={{
                  textAlign: i === 0 ? "left" : "right", padding: "8px 14px", fontSize: 9.5,
                  color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em",
                  borderBottom: "1px solid var(--border)", fontWeight: 600,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.symbol} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "9px 14px", fontSize: 12, fontWeight: 600, color: T.text }}>{r.symbol}</td>
                <td style={{ padding: "9px 14px", fontSize: 12, textAlign: "right", fontFamily: T.mono, color: T.text2 }}>{r.qty}</td>
                <td style={{ padding: "9px 14px", fontSize: 12, textAlign: "right", fontFamily: T.mono, color: T.text2 }}>{r.avg_price?.toFixed(2)}</td>
                <td style={{ padding: "9px 14px", fontSize: 12, textAlign: "right", fontFamily: T.mono, color: T.text }}>{r.ltp?.toFixed(2)}</td>
                <td style={{ padding: "9px 14px", fontSize: 12, textAlign: "right", fontFamily: T.mono, color: T.text }}>₹{r.current_value?.toLocaleString("en-IN")}</td>
                <td style={{ padding: "9px 14px", fontSize: 12, textAlign: "right", fontFamily: T.mono, fontWeight: 600, color: pnlColor(r.pnl) }}>
                  {r.pnl >= 0 ? "+" : ""}{r.pnl_pct?.toFixed(1)}%
                </td>
                <td style={{ padding: "9px 14px", fontSize: 12, textAlign: "right", fontFamily: T.mono, color: T.muted }}>{r.allocation_pct?.toFixed(0)}%</td>
                <td style={{ padding: "9px 14px", textAlign: "right" }}>
                  <span title={r.reason} style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 6,
                    background: callBg(r.recommendation), color: callColor(r.recommendation),
                  }}>{r.recommendation}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
