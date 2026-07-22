import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { T, pnlColor } from "../theme";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

const STATUS_COLORS = { COMPLETED:"var(--bull)", CANCELLED:"var(--muted)", REJECTED:"var(--bear)", OPEN:"var(--brand)", PENDING:"var(--watch)" };
const ttStyle = { background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:8, fontSize:11 };

function StatBox({ label, value, color, sub }) {
  return (
    <div style={{ background:"var(--glass2)", border:"1px solid var(--border)", borderRadius:12, padding:"14px 16px", backdropFilter:"blur(12px)" }}>
      <div style={{ fontSize:9, color:"var(--muted)", textTransform:"uppercase", letterSpacing:".08em", marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:20, fontWeight:700, color:color||"var(--text)", fontFamily:T.mono }}>{value ?? <span style={{color:"var(--muted)"}}>—</span>}</div>
      {sub && <div style={{ fontSize:10, color:"var(--text2)", marginTop:3 }}>{sub}</div>}
    </div>
  );
}

/* ── Today's Positions (Zerodha-sourced: bot + manually placed trades) ── */
function ModifyOrderForm({ order, onDone }) {
  const [price, setPrice] = useState(String(order.price || ""));
  const [qty,   setQty]   = useState(String(order.qty || ""));
  const [busy,  setBusy]  = useState(false);
  const [err,   setErr]   = useState(null);

  const submit = async () => {
    const np = parseFloat(price), nq = parseInt(qty);
    const body = {};
    if (np && np !== order.price) body.new_price = np;
    if (nq && nq !== order.qty)   body.new_qty   = nq;
    if (!Object.keys(body).length) { setErr("No changes"); return; }
    setBusy(true); setErr(null);
    try { await axios.put(`/trade/order/${order.order_id}/modify`, body); onDone(); }
    catch (e) { setErr(e.response?.data?.error || e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ marginTop:8, padding:"10px 12px", background:"var(--watchDim)", border:"1px solid rgba(224,160,46,.25)", borderRadius:9 }}>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"flex-end" }}>
        {[["Price ₹", price, setPrice], ["Qty", qty, setQty]].map(([lbl, val, set]) => (
          <div key={lbl}>
            <div style={{ fontSize:9, color:"var(--muted)", marginBottom:3, textTransform:"uppercase" }}>{lbl}</div>
            <input type="number" step=".05" value={val} onChange={e => set(e.target.value)} style={{
              width:85, padding:"5px 9px", background:"var(--bg)", border:"1px solid var(--border2)",
              borderRadius:7, color:"var(--text)", fontSize:12, fontFamily:T.mono,
            }} />
          </div>
        ))}
        <button onClick={submit} disabled={busy} style={{ padding:"5px 14px", borderRadius:7, border:"1px solid var(--watch)", background:"var(--watchDim)", color:"var(--watch)", fontSize:11, fontWeight:600 }}>{busy ? "…" : "Confirm"}</button>
        <button onClick={onDone} style={{ padding:"5px 10px", borderRadius:7, border:"1px solid var(--border)", background:"transparent", color:"var(--text2)", fontSize:11 }}>Cancel</button>
      </div>
      {err && <div style={{ fontSize:10, color:"var(--bear)", marginTop:5 }}>{err}</div>}
    </div>
  );
}

function TodaysPositions({ report, onRefresh }) {
  const [editingOrder, setEditingOrder] = useState(null);

  const cancelOrder = async (o) => {
    if (!window.confirm(`Cancel order ${o.symbol}?`)) return;
    try { await axios.post(`/trade/order/${o.order_id}/cancel`); onRefresh(); }
    catch (e) { alert(e.response?.data?.error || e.message); }
  };
  const exitPosition = async (p) => {
    if (!window.confirm(`Exit ${p.symbol} (${p.net_qty} qty) at market via LIMIT order?`)) return;
    try {
      await axios.post("/trade/position/exit", {
        exchange: p.exchange, tradingsymbol: p.symbol,
        qty: Math.abs(p.net_qty), product: p.product,
      });
      onRefresh();
    } catch (e) { alert(e.response?.data?.error || e.message); }
  };

  const openPos = report?.open_positions || [];
  const closedPos = report?.closed_positions || [];
  const pending = report?.pending_orders || [];

  const Th = ({ children, right }) => (
    <th style={{ padding:"6px 8px", textAlign: right ? "right" : "left", color:"var(--muted)", fontSize:9, textTransform:"uppercase", letterSpacing:".05em", fontWeight:600 }}>{children}</th>
  );
  const Td = ({ children, right, mono, color }) => (
    <td style={{ padding:"7px 8px", textAlign: right ? "right" : "left", fontFamily: mono ? T.mono : undefined, color: color || "var(--text)", fontSize:12 }}>{children}</td>
  );

  return (
    <div style={{ background:"var(--glass2)", border:"1px solid var(--border)", borderRadius:"var(--radius2)", overflow:"hidden", backdropFilter:"blur(12px)", boxShadow:"var(--shadow)", marginBottom:16 }}>
      <div style={{ padding:"12px 16px", background:"var(--bg3)", borderBottom:"1px solid var(--border)" }}>
        <span style={{ fontWeight:700, color:"var(--text)", fontSize:13 }}>Today's Positions</span>
        <span style={{ fontSize:10, color:"var(--muted)", marginLeft:8 }}>Pulled live from Zerodha — includes trades placed outside this tool</span>
      </div>

      <div style={{ padding:"14px 16px" }}>
        {/* Pending orders */}
        {pending.length > 0 && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:10, color:"var(--muted)", marginBottom:6, textTransform:"uppercase", letterSpacing:".07em" }}>Pending Orders</div>
            {pending.map(o => (
              <div key={o.order_id} style={{ border:"1px solid var(--border)", borderRadius:9, padding:"9px 12px", marginBottom:6, background:"var(--bg3)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                    <span style={{ fontFamily:T.mono, fontWeight:700, fontSize:12 }}>{o.symbol}</span>
                    <span style={{ fontSize:10, fontWeight:700, color: o.side === "BUY" ? "var(--bull)" : "var(--bear)" }}>{o.side}</span>
                    <span style={{ fontSize:11, color:"var(--text2)" }}>{o.qty} qty @ ₹{o.price}</span>
                    <span style={{ fontSize:9, padding:"1px 8px", borderRadius:20, background:"var(--watchDim)", color:"var(--watch)" }}>{o.status}</span>
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    <button onClick={() => setEditingOrder(editingOrder === o.order_id ? null : o.order_id)} style={{ padding:"4px 10px", borderRadius:7, border:"1px solid var(--watch)", background:"transparent", color:"var(--watch)", fontSize:11, fontWeight:600 }}>Modify</button>
                    <button onClick={() => cancelOrder(o)} style={{ padding:"4px 10px", borderRadius:7, border:"1px solid var(--border)", background:"transparent", color:"var(--muted)", fontSize:11 }}>Cancel</button>
                  </div>
                </div>
                {editingOrder === o.order_id && <ModifyOrderForm order={o} onDone={() => { setEditingOrder(null); onRefresh(); }} />}
              </div>
            ))}
          </div>
        )}

        {/* Open positions */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:10, color:"var(--muted)", marginBottom:6, textTransform:"uppercase", letterSpacing:".07em" }}>Open Positions</div>
          {!openPos.length && <div style={{ fontSize:12, color:"var(--muted)", padding:"8px 0" }}>No open positions</div>}
          {openPos.length > 0 && (
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead><tr style={{ borderBottom:"1px solid var(--border)" }}>
                  <Th>Symbol</Th><Th right>Net Qty</Th><Th right>Buy Avg</Th><Th right>LTP</Th><Th right>P&L</Th><Th right> </Th>
                </tr></thead>
                <tbody>
                  {openPos.map(p => (
                    <tr key={p.symbol} style={{ borderBottom:"1px solid var(--bg4)" }}>
                      <Td mono>{p.symbol}</Td>
                      <Td right mono>{p.net_qty}</Td>
                      <Td right mono color="var(--text2)">₹{p.buy_avg?.toFixed(2)}</Td>
                      <Td right mono>₹{p.ltp?.toFixed(2)}</Td>
                      <Td right mono color={pnlColor(p.pnl)}>{p.pnl >= 0 ? "+" : ""}₹{p.pnl?.toFixed(2)}</Td>
                      <Td right><button onClick={() => exitPosition(p)} style={{ padding:"4px 12px", borderRadius:7, border:"1px solid var(--bear)", background:"var(--bearDim)", color:"var(--bear)", fontSize:11, fontWeight:600 }}>Exit</button></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Closed positions */}
        <div>
          <div style={{ fontSize:10, color:"var(--muted)", marginBottom:6, textTransform:"uppercase", letterSpacing:".07em" }}>Closed Today</div>
          {!closedPos.length && <div style={{ fontSize:12, color:"var(--muted)", padding:"8px 0" }}>No closed positions yet</div>}
          {closedPos.length > 0 && (
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead><tr style={{ borderBottom:"1px solid var(--border)" }}>
                  <Th>Symbol</Th><Th right>Buy Avg</Th><Th right>Sell Avg</Th><Th right>Realized P&L</Th>
                </tr></thead>
                <tbody>
                  {closedPos.map(p => (
                    <tr key={p.symbol} style={{ borderBottom:"1px solid var(--bg4)" }}>
                      <Td mono>{p.symbol}</Td>
                      <Td right mono color="var(--text2)">₹{p.buy_avg?.toFixed(2)}</Td>
                      <Td right mono color="var(--text2)">₹{p.sell_avg?.toFixed(2)}</Td>
                      <Td right mono color={pnlColor(p.pnl)}>{p.pnl >= 0 ? "+" : ""}₹{p.pnl?.toFixed(2)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PnLReport() {
  const [trades, setTrades] = useState([]);
  const [report, setReport] = useState(null);

  const loadHistory = useCallback(async () => {
    try { const r = await axios.get("/trade/history"); setTrades(r.data.trades || []); } catch {}
  }, []);
  const loadReport = useCallback(async () => {
    try { const r = await axios.get("/trade/day-report"); setReport(r.data); } catch {}
  }, []);

  useEffect(() => {
    loadHistory(); loadReport();
    const id = setInterval(loadReport, 15000);
    return () => clearInterval(id);
  }, [loadHistory, loadReport]);

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
    <div>
      <TodaysPositions report={report} onRefresh={loadReport} />

      <div style={{ background:"var(--glass2)", border:"1px solid var(--border)", borderRadius:"var(--radius2)", overflow:"hidden", backdropFilter:"blur(12px)", boxShadow:"var(--shadow)" }}>
        <div style={{ padding:"12px 16px", background:"var(--bg3)", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ fontWeight:700, color:"var(--text)", fontSize:13 }}>Bot Trade History &amp; Analytics</span>
          <button onClick={() => { loadHistory(); loadReport(); }} style={{ fontSize:11, color:"var(--text2)", background:"var(--bg4)", border:"1px solid var(--border)", borderRadius:7, padding:"3px 10px" }}>↺</button>
        </div>

        <div style={{ padding:16 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))", gap:8, marginBottom:16 }}>
            <StatBox label="Total P&L"    value={(totalPnl >= 0 ? "+" : "") + "₹" + Math.abs(totalPnl).toFixed(0)} color={pnlColor(totalPnl)} sub="All closed" />
            <StatBox label="Win Rate"     value={winRate + "%"} color={winRate >= 50 ? "var(--bull)" : "var(--bear)"} sub={`${wins.length}W / ${losses.length}L`} />
            <StatBox label="Profit Factor" value={pf}           color={parseFloat(pf) >= 1 ? "var(--bull)" : "var(--bear)"} sub="Win÷Loss" />
            <StatBox label="Total Trades" value={closed.length} sub={`${trades.length} total`} />
            <StatBox label="Avg Win"      value={wins.length ? "₹" + (totalWin / wins.length).toFixed(0) : null}    color="var(--bull)" />
            <StatBox label="Avg Loss"     value={losses.length ? "₹" + (totalLoss / losses.length).toFixed(0) : null} color="var(--bear)" />
            <StatBox label="CE P&L"       value={"₹" + ceT.reduce((s, t) => s + (t.pnl || 0), 0).toFixed(0)} color="var(--bull)" sub={ceT.length + " trades"} />
            <StatBox label="PE P&L"       value={"₹" + peT.reduce((s, t) => s + (t.pnl || 0), 0).toFixed(0)} color="var(--bear)"   sub={peT.length + " trades"} />
          </div>

          {closed.length > 0 && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
              <div style={{ background:"var(--bg3)", borderRadius:12, padding:"12px", border:"1px solid var(--border)" }}>
                <div style={{ fontSize:10, color:"var(--muted)", marginBottom:8, textTransform:"uppercase", letterSpacing:".07em" }}>Trade Outcomes</div>
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={55} paddingAngle={2}>
                      {statusData.map((e, i) => <Cell key={i} fill={STATUS_COLORS[e.name] || "var(--muted)"} />)}
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
                      <Cell fill="var(--bull)" /><Cell fill="var(--bear)" />
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
                    {dailyData.map((e, i) => <Cell key={i} fill={e.pnl >= 0 ? "var(--bull)" : "var(--bear)"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

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
                      <tr key={i} style={{ borderBottom:"1px solid var(--bg4)" }}>
                        <td style={{ padding:"6px 8px", fontFamily:T.mono, color:"var(--text)", fontSize:11 }}>{t.symbol}</td>
                        <td style={{ padding:"6px 8px", fontWeight:700, color: t.type === "CE" ? "var(--bull)" : "var(--bear)" }}>{t.type}</td>
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
          {!closed.length && <div style={{ fontSize:12, color:"var(--muted)", padding:"16px 0", textAlign:"center" }}>No completed bot trades yet</div>}
        </div>
      </div>
    </div>
  );
}
