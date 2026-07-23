import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { T, pnlColor } from "../theme";
import TodaysPositions from "./TodaysPositions";

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 15, color: color || "var(--text)" }}>
        {value != null ? value : <span style={{ color: "var(--muted)", fontWeight: 400 }}>—</span>}
      </div>
    </div>
  );
}

function Row({ left, mid, right, badge, badgeColor, badgeBg, pnl }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid var(--bg4)", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {badge && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: badgeBg, color: badgeColor, flexShrink: 0 }}>{badge}</span>}
        <span style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{left}</span>
      </div>
      <span style={{ fontSize: 11, color: "var(--text2)", fontFamily: T.mono, flexShrink: 0 }}>{mid}</span>
      <span style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 12, color: pnlColor(pnl), flexShrink: 0, minWidth: 76, textAlign: "right" }}>{right}</span>
    </div>
  );
}

/* Compact P&L doughnut — lives beside Positions instead of scrolled further
   down the dashboard, since this card already has the vertical room for it. */
function PnlDoughnut({ report, onOpenReports }) {
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
    <div style={{ width: 190, flexShrink: 0, borderLeft: "1px solid var(--border)", paddingLeft: 16, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8, alignSelf: "flex-start" }}>Day P&L</div>
      <div style={{ width: 108, height: 108, position: "relative", cursor: "pointer" }} onClick={onOpenReports}>
        {data.length ? (
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={34} outerRadius={52} paddingAngle={3} onClick={onOpenReports}>
                {data.map((d, i) => <Cell key={i} fill={d.color} style={{ cursor: "pointer" }} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        ) : <div style={{ width: "100%", height: "100%", borderRadius: "50%", border: "7px solid var(--bg4)" }} />}
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: pnlColor(total) }}>
            {total != null ? `${total >= 0 ? "+" : ""}₹${Math.abs(total).toFixed(0)}` : "—"}
          </span>
        </div>
      </div>
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4, alignSelf: "flex-start", width: "100%" }}>
        {data.map(d => (
          <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--text2)" }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: d.color }} />{d.name} {d.value}
          </div>
        ))}
        {!data.length && <span style={{ fontSize: 10, color: "var(--muted)" }}>No positions yet</span>}
      </div>
      <button onClick={onOpenReports} style={{ marginTop: 10, width: "100%", fontSize: 10.5, color: "var(--brand)", background: "var(--brandDim)", border: "1px solid var(--border)", borderRadius: 7, padding: "5px 0", fontWeight: 600 }}>
        Full report →
      </button>
    </div>
  );
}

export default function PositionsHoldingsCard({ onOpenReports }) {
  const [tab, setTab]         = useState("Positions");
  const [trades, setTrades]   = useState([]);
  const [summary, setSummary] = useState({});
  const [report, setReport]   = useState(null);
  const [holdings, setHoldings] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const loadTrades = useCallback(async () => {
    try { const r = await axios.get("/trade/refresh"); setTrades(r.data.trades || []); setSummary(r.data); } catch {}
  }, []);
  const loadReport = useCallback(async () => {
    try { const r = await axios.get("/trade/day-report"); setReport(r.data); } catch {}
  }, []);
  const loadHoldings = useCallback(async () => {
    try { const r = await axios.get("/data/portfolio/holdings"); setHoldings(r.data); } catch {}
  }, []);

  // Prime everything on mount — don't wait on the 10-candle signal-engine
  // warmup or on the Holdings tab being clicked; positions/holdings data has
  // nothing to do with candle history.
  useEffect(() => {
    loadTrades(); loadReport(); loadHoldings();
    const id = setInterval(() => { loadTrades(); loadReport(); }, 5000);
    return () => clearInterval(id);
  }, [loadTrades, loadReport, loadHoldings]);

  const active = trades.filter(t => ["PENDING", "OPEN"].includes(t.status));

  return (
    <div style={{ background: "var(--glass2)", border: "1px solid var(--border)", borderRadius: "var(--radius2)", overflow: "hidden", backdropFilter: "blur(12px)", boxShadow: "var(--shadow)" }}>
      <div style={{ padding: "10px 16px 0", background: "var(--bg3)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: 18 }}>
          {["Positions", "Holdings"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: "none", border: "none", padding: "0 0 10px", fontSize: 12, fontWeight: 700,
              color: tab === t ? "var(--watch)" : "var(--muted)", borderBottom: tab === t ? "2px solid var(--watch)" : "2px solid transparent",
              letterSpacing: ".04em", textTransform: "uppercase",
            }}>{t}</button>
          ))}
        </div>
      </div>

      {tab === "Positions" && (
        <div style={{ padding: "14px 16px", display: "flex", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 12 }}>
              <Stat label="Total P&L"    value={summary.total_pnl != null ? `${summary.total_pnl >= 0 ? "+" : ""}₹${Math.abs(summary.total_pnl).toFixed(0)}` : null} color={pnlColor(summary.total_pnl)} />
              <Stat label="Today's P&L"  value={report?.total_pnl != null ? `${report.total_pnl >= 0 ? "+" : ""}₹${Math.abs(report.total_pnl).toFixed(0)}` : null} color={pnlColor(report?.total_pnl)} />
              <Stat label="Open Positions" value={active.length} />
            </div>

            {!active.length && <div style={{ fontSize: 12, color: "var(--muted)", padding: "10px 0", textAlign: "center" }}>No open bot positions</div>}
            {active.slice(0, 4).map(t => {
              const pnl = t.status === "OPEN" ? t.live_pnl : t.pnl;
              return (
                <Row key={t.trade_id}
                  badge={t.type} badgeColor={t.type === "CE" ? "var(--bull)" : "var(--bear)"} badgeBg={t.type === "CE" ? "var(--bullDim)" : "var(--bearDim)"}
                  left={t.symbol} mid={`${t.qty} qty · Avg ₹${t.entry_price}`}
                  right={pnl != null ? `${pnl >= 0 ? "+" : ""}₹${Math.abs(pnl).toFixed(0)}` : "—"} pnl={pnl} />
              );
            })}

            <button onClick={() => setExpanded(e => !e)} style={{
              width: "100%", marginTop: 12, padding: "8px 0", borderRadius: 8, border: "1px solid var(--border)",
              background: "var(--bg4)", color: "var(--text2)", fontSize: 11, fontWeight: 700, letterSpacing: ".04em",
            }}>{expanded ? "▲ HIDE FULL DETAIL" : "VIEW ALL POSITIONS ▾"}</button>

            {expanded && (
              // Sourced from day-report (live Zerodha), so this reliably shows
              // every open/pending position — including ones placed directly
              // in Zerodha, not just trades the bot itself placed.
              <div style={{ marginTop: 12 }}>
                <TodaysPositions report={report} onRefresh={() => { loadReport(); loadTrades(); }} showTitle={false} />
              </div>
            )}
          </div>
          <PnlDoughnut report={report} onOpenReports={onOpenReports} />
        </div>
      )}

      {tab === "Holdings" && (
        <div style={{ padding: "14px 16px" }}>
          {!holdings && <div style={{ fontSize: 12, color: "var(--muted)", padding: "10px 0", textAlign: "center" }}>Loading holdings…</div>}
          {holdings && !holdings.holdings?.length && <div style={{ fontSize: 12, color: "var(--muted)", padding: "10px 0", textAlign: "center" }}>No holdings found</div>}
          {(holdings?.holdings || []).slice(0, 6).map(h => (
            <Row key={h.symbol} left={h.symbol} mid={`${h.qty} qty · Avg ₹${h.avg_price?.toFixed(2)}`}
              right={`${h.pnl >= 0 ? "+" : ""}${h.pnl_pct?.toFixed(1)}%`} pnl={h.pnl} />
          ))}
        </div>
      )}
    </div>
  );
}
