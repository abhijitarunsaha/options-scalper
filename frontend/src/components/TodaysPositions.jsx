import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { T, pnlColor } from "../theme";

/* Shared "Today's Positions" block — sourced from GET /trade/day-report,
   which reads straight from kite.positions()/orders(), so it covers trades
   placed directly in Zerodha as well as ones placed through this tool.
   Used on both the Dashboard (PositionsHoldingsCard's "View All Positions")
   and the Reports tab, so there's one place these rows + actions live. */

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
    <div style={{ marginTop:8, padding:"10px 12px", background:"var(--watchDim)", border:"1px solid rgba(212,175,55,.3)", borderRadius:9 }}>
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

/* GTT-backed stop-loss control for one open position — create / modify / cancel. */
function GttControl({ position, gtts, onDone }) {
  const existing = (gtts || []).find(g =>
    g.status === "active" && g.condition?.tradingsymbol === position.symbol &&
    g.condition?.exchange === position.exchange);
  const currentTrigger = existing?.condition?.trigger_values?.[0];
  const [open, setOpen]   = useState(false);
  const [trigger, setTrigger] = useState(currentTrigger ?? Math.round((position.ltp || 0) * 0.95 * 100) / 100);
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState(null);

  const submit = async () => {
    const tp = parseFloat(trigger);
    if (!tp || tp <= 0) { setErr("Enter a valid trigger price"); return; }
    setBusy(true); setErr(null);
    try {
      const body = { exchange: position.exchange, tradingsymbol: position.symbol, qty: Math.abs(position.net_qty), trigger_price: tp };
      if (existing) await axios.put(`/trade/gtt/${existing.id}`, body);
      else await axios.post("/trade/gtt", body);
      setOpen(false); onDone();
    } catch (e) { setErr(e.response?.data?.error || e.message); }
    finally { setBusy(false); }
  };

  const cancelGtt = async () => {
    if (!existing || !window.confirm(`Cancel GTT stop-loss for ${position.symbol}?`)) return;
    try { await axios.delete(`/trade/gtt/${existing.id}`); onDone(); }
    catch (e) { alert(e.response?.data?.error || e.message); }
  };

  return (
    <div style={{ display: "inline-block" }}>
      <div style={{ display: "flex", gap: 5 }}>
        <button onClick={() => setOpen(o => !o)} style={{
          padding: "4px 10px", borderRadius: 7, fontSize: 10.5, fontWeight: 600,
          border: `1px solid ${existing ? "var(--watch)" : "var(--border)"}`,
          background: existing ? "var(--watchDim)" : "transparent",
          color: existing ? "var(--watch)" : "var(--text2)",
        }}>{existing ? `SL ₹${currentTrigger}` : "Set SL"}</button>
        {existing && <button onClick={cancelGtt} title="Cancel GTT" style={{ padding: "4px 8px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", fontSize: 10.5 }}>✕</button>}
      </div>
      {open && (
        <div style={{ marginTop: 6, padding: "8px 10px", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, display: "flex", gap: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 9, color: "var(--muted)", marginBottom: 3, textTransform: "uppercase" }}>GTT Trigger ₹</div>
            <input type="number" step=".05" value={trigger} onChange={e => setTrigger(e.target.value)} style={{
              width: 90, padding: "5px 9px", background: "var(--bg)", border: "1px solid var(--border2)",
              borderRadius: 7, color: "var(--text)", fontSize: 12, fontFamily: T.mono,
            }} />
          </div>
          <button onClick={submit} disabled={busy} style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid var(--watch)", background: "var(--watchDim)", color: "var(--watch)", fontSize: 11, fontWeight: 600 }}>
            {busy ? "…" : existing ? "Update GTT" : "Create GTT"}
          </button>
          {err && <div style={{ fontSize: 10, color: "var(--bear)", width: "100%" }}>{err}</div>}
        </div>
      )}
    </div>
  );
}

export default function TodaysPositions({ report, onRefresh, showTitle = true }) {
  const [editingOrder, setEditingOrder] = useState(null);
  const [gtts, setGtts] = useState([]);

  const loadGtts = useCallback(() => {
    axios.get("/trade/gtts").then(r => setGtts(r.data.gtts || [])).catch(() => {});
  }, []);
  useEffect(() => { loadGtts(); }, [loadGtts]);

  const refreshAll = () => { onRefresh(); loadGtts(); };

  const cancelOrder = async (o) => {
    if (!window.confirm(`Cancel order ${o.symbol}?`)) return;
    try { await axios.post(`/trade/order/${o.order_id}/cancel`); refreshAll(); }
    catch (e) { alert(e.response?.data?.error || e.message); }
  };
  const exitPosition = async (p) => {
    if (!window.confirm(`Exit ${p.symbol} (${p.net_qty} qty) at market via LIMIT order?`)) return;
    try {
      await axios.post("/trade/position/exit", { exchange: p.exchange, tradingsymbol: p.symbol, qty: Math.abs(p.net_qty), product: p.product });
      refreshAll();
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
    <div style={{ background: showTitle ? "var(--glass2)" : "transparent", border: showTitle ? "1px solid var(--border)" : "none", borderRadius: "var(--radius2)", overflow: "hidden", backdropFilter: showTitle ? "blur(12px)" : "none", boxShadow: showTitle ? "var(--shadow)" : "none" }}>
      {showTitle && (
        <div style={{ padding:"12px 16px", background:"var(--bg3)", borderBottom:"1px solid var(--border)" }}>
          <span style={{ fontWeight:700, color:"var(--text)", fontSize:13 }}>Today's Positions</span>
          <span style={{ fontSize:10, color:"var(--muted)", marginLeft:8 }}>Pulled live from Zerodha — includes trades placed outside this tool</span>
        </div>
      )}

      <div style={{ padding: showTitle ? "14px 16px" : "2px 0" }}>
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
                {editingOrder === o.order_id && <ModifyOrderForm order={o} onDone={() => { setEditingOrder(null); refreshAll(); }} />}
              </div>
            ))}
          </div>
        )}

        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:10, color:"var(--muted)", marginBottom:6, textTransform:"uppercase", letterSpacing:".07em" }}>Open Positions</div>
          {!openPos.length && <div style={{ fontSize:12, color:"var(--muted)", padding:"8px 0" }}>No open positions</div>}
          {openPos.map(p => (
            <div key={p.symbol} style={{ border:"1px solid var(--border)", borderRadius:9, padding:"10px 12px", marginBottom:8, background:"var(--bg3)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                  <span style={{ fontFamily:T.mono, fontWeight:700, fontSize:12.5 }}>{p.symbol}</span>
                  <span style={{ fontSize:11, color:"var(--text2)" }}>{p.net_qty} qty · Avg ₹{p.buy_avg?.toFixed(2)}</span>
                  <span style={{ fontSize:11, color:"var(--text2)" }}>LTP ₹{p.ltp?.toFixed(2)}</span>
                  <span style={{ fontFamily:T.mono, fontWeight:700, fontSize:12.5, color:pnlColor(p.pnl) }}>{p.pnl >= 0 ? "+" : ""}₹{p.pnl?.toFixed(2)}</span>
                </div>
                <div style={{ display:"flex", alignItems:"flex-start", gap:6 }}>
                  <GttControl position={p} gtts={gtts} onDone={refreshAll} />
                  <button onClick={() => exitPosition(p)} style={{ padding:"4px 12px", borderRadius:7, border:"1px solid var(--bear)", background:"var(--bearDim)", color:"var(--bear)", fontSize:11, fontWeight:600 }}>Exit</button>
                </div>
              </div>
            </div>
          ))}
        </div>

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
