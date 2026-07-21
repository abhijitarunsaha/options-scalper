import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { T, pnlColor } from "../theme";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

const STATUS_COLORS = { COMPLETED:"#22d483", CANCELLED:"#94a3b8", REJECTED:"#f5415d", OPEN:"#4f8ef7", PENDING:"#f5a623" };

function StatBox({ label, value, color, sub }) {
  return (
    <div style={{ background:"var(--glass2)", border:"1px solid var(--border)", borderRadius:12, padding:"14px 16px", backdropFilter:"blur(12px)" }}>
      <div style={{ fontSize:9, color:"var(--muted)", textTransform:"uppercase", letterSpacing:".08em", marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:20, fontWeight:700, color:color||"var(--text)", fontFamily:T.mono }}>{value ?? <span style={{color:"var(--muted)"}}>—</span>}</div>
      {sub && <div style={{ fontSize:10, color:"var(--text2)", marginTop:3 }}>{sub}</div>}
    </div>
  );
}

const ttStyle = { background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:8, fontSize:11 };

export default function PnLReport() {
  const [trades, setTrades] = useState([]);
  const [open,   setOpen]   = useState(false);

  const load = useCallback(async () => {
    try { const r = await axios.get("/trade/history"); setTrades(r.data.trades || []); } catch {}
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  if (!open) return (
    <button onClick={() => setOpen(true)} style={{
      width:"100%", padding:"11px", borderRadius:12, border:"1px solid var(--border)",
      background:"var(--glass2)", color:"var(--text2)", fontSize:12, fontWeight:500,
      backdropFilter:"blur(12px)", cursor:"pointer", transition:"all .2s",
    }}>📊 View P&L Report & Trade History</button>
  );

  const closed = trades.filter(t => t.status === "COMPLETED");
  const wins   = closed.filter(t => (t.pnl || 0) > 0);
  const losses = closed.filter(t => (t.pnl || 0) < 0);
  const totalPnl  = closed.reduce((s, t) => s + (t.pnl || 0), 0);
  const totalWin  = wins.reduce((s,   t) => s + t.pnl, 0);
  const totalLoss = losses.reduce((s, t) => s + Math.abs(t.pnl), 0);
  const winRate   = closed.length ? Math.round(wins.length / closed.length * 100) : 0;
  const pf        = totalLoss > 0 ? (totalWin / totalLoss).toFixed(2) : "∞";

  const statusData = Object.entries(
    trades.reduce((a, t) => { a[t.status] = (a[t.status] || 0) + 1; return a; }, {})
  ).map(([name, value]) => ({ name, value }));

  const byDay = {};
  closed.forEach(t => {
    const d = t.exited_at ? t.exited_at.slice(0, 10) : "unknown";
    byDay[d] = (byDay[d] || 0) + (t.pnl || 0);
  });
  const dailyData = Object.entries(byDay).sort().map(([date, pnl]) => ({ date: date.slice(5), pnl: Math.round(pnl) }));

  const ceT = closed.filter(t => t.type === "CE");
  const peT = closed.filter(t => t.type === "PE");

  return (
    <div style={{ background:"var(--glass2)", border:"1px solid var(--border)", borderRadius:"var(--radius2)", overflow:"hidden", backdropFilter:"blur(12px)", boxShadow:"var(--shadow)" }}>
      <div style={{ padding:"12px 16px", background:"var(--bg3)", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <span style={{ fontWeight:700, color:"var(--text)", fontSize:13 }}>📊 P&L Report</span>
        <div style={{ display:"flex", gap:6 }}>
          <button onClick={load} style={{ fontSize:11, color:"var(--text2)", background:"var(--bg4)", border:"1px solid var(--border)", borderRadius:7, padding:"3px 10px" }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ fontSize:11, color:"var(--text2)", background:"var(--bg4)", border:"1px solid var(--border)", borderRadius:7, padding:"3px 10px" }}>▲ Hide</button>
        </div>
      </div>

      <div style={{ padding:16 }}>
        {/* Summary grid */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))", gap:8, marginBottom:16 }}>
          <StatBox label="Total P&L"    value={(totalPnl >= 0 ? "+" : "") + "₹" + Math.abs(totalPnl).toFixed(0)} color={pnlColor(totalPnl)} sub="All closed" />
          <StatBox label="Win Rate"     value={winRate + "%"} color={winRate >= 50 ? "var(--green)" : "var(--red)"} sub={`${wins.length}W / ${losses.length}L`} />
          <StatBox label="Profit Factor" value={pf}           color={parseFloat(pf) >= 1 ? "var(--green)" : "var(--red)"} sub="Win÷Loss" />
          <StatBox label="Total Trades" value={closed.length} sub={`${trades.length} total`} />
          <StatBox label="Avg Win"      value={wins.length ? "₹" + (totalWin / wins.length).toFixed(0) : null}    color="var(--green)" />
          <StatBox label="Avg Loss"     value={losses.length ? "₹" + (totalLoss / losses.length).toFixed(0) : null} color="var(--red)" />
          <StatBox label="CE P&L"       value={"₹" + ceT.reduce((s, t) => s + (t.pnl || 0), 0).toFixed(0)} color="var(--green)" sub={ceT.length + " trades"} />
          <StatBox label="PE P&L"       value={"₹" + peT.reduce((s, t) => s + (t.pnl || 0), 0).toFixed(0)} color="var(--red)"   sub={peT.length + " trades"} />
        </div>

        {/* Charts */}
        {closed.length > 0 && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
            <div style={{ background:"var(--bg3)", borderRadius:12, padding:"12px", border:"1px solid var(--border)" }}>
              <div style={{ fontSize:10, color:"var(--muted)", marginBottom:8, textTransform:"uppercase", letterSpacing:".07em" }}>Trade Outcomes</div>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={55} paddingAngle={2}>
                    {statusData.map((e, i) => <Cell key={i} fill={STATUS_COLORS[e.name] || "#64748b"} />)}
                  </Pie>
                  <Tooltip contentStyle={ttStyle} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize:10, color:"var(--text2)" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ background:"var(--bg3)", borderRadius:12, padding:"12px", border:"1px solid var(--border)" }}>
              <div style={{ fontSize:10, color:"var(--muted)", marginBottom:8, textTransform:"uppercase", letterSpacing:".07em" }}>Win / Loss Split</div>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={[{ name:"Wins", value:wins.length }, { name:"Losses", value:losses.length }]} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={55} paddingAngle={3}>
                    <Cell fill="#22d483" /><Cell fill="#f5415d" />
                  </Pie>
                  <Tooltip contentStyle={ttStyle} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize:10, color:"var(--text2)" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {dailyData.length > 0 && (
          <div style={{ background:"var(--bg3)", borderRadius:12, padding:"12px", border:"1px solid var(--border)", marginBottom:16 }}>
            <div style={{ fontSize:10, color:"var(--muted)", marginBottom:8, textTransform:"uppercase", letterSpacing:".07em" }}>Daily P&L</div>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={dailyData} margin={{ top:2, right:8, left:0, bottom:2 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize:9, fill:"var(--muted)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize:9, fill:"var(--muted)" }} axisLine={false} tickLine={false} tickFormatter={v => "₹" + v} />
                <Tooltip contentStyle={ttStyle} formatter={v => ["₹" + v, "P&L"]} />
                <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                  {dailyData.map((e, i) => <Cell key={i} fill={e.pnl >= 0 ? "#22d483" : "#f5415d"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Trade log */}
        {closed.length > 0 && (
          <>
            <div style={{ fontSize:10, color:"var(--muted)", marginBottom:8, textTransform:"uppercase", letterSpacing:".07em" }}>Trade Log</div>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                <thead>
                  <tr style={{ borderBottom:"1px solid var(--border)" }}>
                    {["Symbol","Type","Entry","Exit","Lots","P&L","P&L%","Reason","Closed"].map(h => (
                      <th key={h} style={{ padding:"5px 8px", textAlign:"left", color:"var(--muted)", fontSize:9, textTransform:"uppercase", letterSpacing:".05em", fontWeight:600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...closed].reverse().map((t, i) => (
                    <tr key={i} style={{ borderBottom:"1px solid var(--bg4)", transition:"background .15s" }}>
                      <td style={{ padding:"6px 8px", fontFamily:T.mono, color:"var(--text)", fontSize:11 }}>{t.symbol}</td>
                      <td style={{ padding:"6px 8px", fontWeight:700, color: t.type === "CE" ? "var(--green)" : "var(--red)" }}>{t.type}</td>
                      <td style={{ padding:"6px 8px", fontFamily:T.mono, color:"var(--text2)" }}>₹{t.entry_price}</td>
                      <td style={{ padding:"6px 8px", fontFamily:T.mono, color:"var(--text2)" }}>{t.exit_price ? `₹${t.exit_price}` : "—"}</td>
                      <td style={{ padding:"6px 8px", color:"var(--text2)" }}>{t.lots}</td>
                      <td style={{ padding:"6px 8px", fontFamily:T.mono, fontWeight:700, color:pnlColor(t.pnl) }}>{t.pnl != null ? (t.pnl >= 0 ? "+" : "") + "₹" + t.pnl.toFixed(0) : "—"}</td>
                      <td style={{ padding:"6px 8px", color:pnlColor(t.pnl_pct) }}>{t.pnl_pct != null ? (t.pnl_pct >= 0 ? "+" : "") + t.pnl_pct.toFixed(1) + "%" : "—"}</td>
                      <td style={{ padding:"6px 8px", color:"var(--muted)", fontSize:10 }}>{(t.exit_reason || "—").replace(/_/g, " ")}</td>
                      <td style={{ padding:"6px 8px", color:"var(--muted)", fontSize:10, fontFamily:T.mono }}>{t.exited_at ? new Date(t.exited_at).toLocaleTimeString("en-IN", { timeZone:"Asia/Kolkata", hour12:true }) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {!closed.length && <div style={{ fontSize:12, color:"var(--muted)", padding:"16px 0", textAlign:"center" }}>No completed trades yet</div>}
      </div>
    </div>
  );
}
