import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { T, pnlColor } from "../theme";

export default function DayPnlDoughnut({ onOpenReports }) {
  const [report, setReport] = useState(null);

  const load = useCallback(() => {
    axios.get("/trade/day-report").then(r => setReport(r.data)).catch(() => {});
  }, []);

  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id); }, [load]);

  const wins   = report?.win_count || 0;
  const losses = report?.loss_count || 0;
  const flat   = report?.flat_count || 0;
  const openCt = report?.open_count || 0;
  const total  = report?.total_pnl;

  const data = [
    { name: "Wins",   value: wins,   color: "var(--bull)" },
    { name: "Losses", value: losses, color: "var(--bear)" },
    { name: "Flat",   value: flat,   color: "var(--muted)" },
    { name: "Open",   value: openCt, color: "var(--watch)" },
  ].filter(d => d.value > 0);

  return (
    <div style={{
      background: "var(--glass2)", border: "1px solid var(--border)", borderRadius: "var(--radius2)",
      overflow: "hidden", backdropFilter: "blur(12px)", boxShadow: "var(--shadow)",
    }}>
      <div style={{ padding: "12px 16px", background: "var(--bg3)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 700, color: "var(--text)", fontSize: 13 }}>Today's P&L</span>
        <button onClick={onOpenReports} style={{ fontSize: 11, color: "var(--brand)", background: "var(--brandDim)", border: "1px solid var(--border)", borderRadius: 7, padding: "3px 10px", fontWeight: 600 }}>
          Full report →
        </button>
      </div>

      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ width: 120, height: 120, position: "relative", cursor: "pointer", flexShrink: 0 }} onClick={onOpenReports}>
          {data.length ? (
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={38} outerRadius={58} paddingAngle={3} onClick={onOpenReports}>
                  {data.map((d, i) => <Cell key={i} fill={d.color} style={{ cursor: "pointer" }} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ width: "100%", height: "100%", borderRadius: "50%", border: "8px solid var(--bg4)" }} />
          )}
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <span style={{ fontFamily: T.mono, fontSize: 15, fontWeight: 700, color: pnlColor(total) }}>
              {total != null ? `${total >= 0 ? "+" : ""}₹${Math.abs(total).toFixed(0)}` : "—"}
            </span>
            <span style={{ fontSize: 8, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>Day P&L</span>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 140, display: "grid", gap: 6 }}>
          {[
            ["Realized", report?.total_realized_pnl, "var(--text)"],
            ["Unrealized", report?.total_unrealized_pnl, "var(--watch)"],
          ].map(([lbl, v, c]) => (
            <div key={lbl} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
              <span style={{ color: "var(--text2)" }}>{lbl}</span>
              <span style={{ fontFamily: T.mono, fontWeight: 600, color: pnlColor(v) }}>
                {v != null ? `${v >= 0 ? "+" : ""}₹${Math.abs(v).toFixed(0)}` : "—"}
              </span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
            {data.map(d => (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--text2)" }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: d.color }} />
                {d.name} {d.value}
              </div>
            ))}
            {!data.length && <span style={{ fontSize: 11, color: "var(--muted)" }}>No positions today yet</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
