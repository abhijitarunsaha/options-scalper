import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { T, pnlColor } from "../theme";

function PBar({ pct, sl, entry, target }) {
  const p = Math.max(-10, Math.min(105, pct || 0));
  const col = sl ? "var(--red)" : p >= 100 ? "var(--gold)" : p > 0 ? "var(--green)" : "var(--muted)";
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>
        <span style={{ fontFamily: T.mono }}>₹{entry}</span>
        <span style={{ color: col, fontWeight: 600 }}>{sl ? "⚠ SL BREACH" : p >= 100 ? "🎯 TARGET" : `${p.toFixed(0)}%`}</span>
        <span style={{ fontFamily: T.mono, color: "var(--gold)" }}>₹{target}</span>
      </div>
      <div style={{ position: "relative", height: 6, background: "var(--bg4)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, var(--bg4), ${col}30)` }} />
        <div style={{ position: "absolute", top: 0, left: 0, width: `${Math.max(0, Math.min(100, p))}%`, height: "100%", background: col, borderRadius: 3, transition: "width .5s ease" }} />
        <div style={{ position: "absolute", top: 0, left: 0, width: 2, height: "100%", background: "var(--red)" }} />
        <div style={{ position: "absolute", top: 0, right: 0, width: 2, height: "100%", background: "var(--gold)" }} />
      </div>
    </div>
  );
}

function ModifyForm({ trade, onDone }) {
  const [price, setPrice] = useState(String(trade.limit_price || ""));
  const [qty,   setQty]   = useState(String(trade.qty || ""));
  const [busy,  setBusy]  = useState(false);
  const [err,   setErr]   = useState(null);
  const lotSz = Math.round(trade.qty / trade.lots);

  const submit = async () => {
    const np = parseFloat(price), nq = parseInt(qty);
    if (!np && !nq) { setErr("Enter price or qty"); return; }
    if (nq && nq % lotSz !== 0) { setErr(`Qty must be multiple of ${lotSz}`); return; }
    const body = {};
    if (np && np !== trade.limit_price) body.new_price = np;
    if (nq && nq !== trade.qty) body.new_qty = nq;
    if (!Object.keys(body).length) { setErr("No changes"); return; }
    setBusy(true); setErr(null);
    try { await axios.put(`/trade/modify/${trade.trade_id}`, body); onDone(); }
    catch (e) { setErr(e.response?.data?.error || e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ marginTop: 10, padding: "12px 14px", background: "var(--goldDim)", border: "1px solid rgba(245,166,35,.2)", borderRadius: 10 }}>
      <div style={{ fontSize: 11, color: "var(--gold)", fontWeight: 600, marginBottom: 10 }}>✎ Modify Pending Order</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        {[["Limit Price ₹", price, setPrice, .05, 95], [`Qty (lot=${lotSz})`, qty, setQty, lotSz, 80]].map(([lbl, val, set, step, w]) => (
          <div key={lbl}>
            <div style={{ fontSize: 9, color: "var(--muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: ".06em" }}>{lbl}</div>
            <input type="number" step={step} value={val} onChange={e => set(e.target.value)} style={{
              width: w, padding: "6px 10px", background: "var(--bg)", border: "1px solid var(--border2)",
              borderRadius: 8, color: "var(--text)", fontSize: 12, fontFamily: T.mono,
            }} />
          </div>
        ))}
        <button onClick={submit} disabled={busy} style={{ padding: "6px 16px", borderRadius: 8, border: "1px solid var(--gold)", background: "var(--goldDim)", color: "var(--gold)", fontSize: 12, fontWeight: 600 }}>{busy ? "…" : "Confirm"}</button>
        <button onClick={onDone} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text2)", fontSize: 12 }}>Cancel</button>
      </div>
      {err && <div style={{ fontSize: 10, color: "var(--red)", marginTop: 6 }}>{err}</div>}
    </div>
  );
}

function TradeCard({ trade, onRefresh }) {
  const [showMod, setShowMod] = useState(false);
  const isOpen = trade.status === "OPEN", isPending = trade.status === "PENDING";
  const isClosed = ["COMPLETED", "CANCELLED", "REJECTED"].includes(trade.status);
  const pnl = isOpen ? trade.live_pnl : trade.pnl;
  const pc = pnlColor(pnl);
  const isCE = trade.type === "CE";
  const statusStyle = {
    PENDING:   { c: "var(--gold)",  bg: "var(--goldDim)",  label: "⏳ PENDING"   },
    OPEN:      { c: "var(--green)", bg: "var(--greenDim)", label: "● OPEN"       },
    COMPLETED: { c: "var(--text2)", bg: "var(--bg4)",      label: "✓ DONE"       },
    CANCELLED: { c: "var(--muted)", bg: "var(--bg4)",      label: "✕ CANCELLED"  },
    REJECTED:  { c: "var(--red)",   bg: "var(--redDim)",   label: "✗ REJECTED"   },
  }[trade.status] || {};
  const exitBadge = { SL_TRIGGERED: ["🔴 SL Hit", "var(--red)"], CLOSED_EXTERNALLY: ["⚡ Auto-Closed", "var(--gold)"], MANUAL_EXIT: ["✓ Manual", "var(--text2)"] }[trade.exit_reason];

  const handleExit = async () => {
    if (!window.confirm("Exit position at current market price?")) return;
    try { await axios.post(`/trade/exit/${trade.trade_id}`, {}); onRefresh(); }
    catch (e) { alert(e.response?.data?.error || e.message); }
  };
  const handleCancel = async () => {
    if (!window.confirm("Cancel this pending order?")) return;
    try { await axios.post(`/trade/cancel/${trade.trade_id}`); onRefresh(); }
    catch (e) { alert(e.response?.data?.error || e.message); }
  };

  const Chip = ({ label, val, c }) => (
    <div style={{ background: "var(--bg4)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", minWidth: 75 }}>
      <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: c || "var(--text)", fontFamily: T.mono }}>
        {val ?? <span style={{ color: "var(--muted)" }}>—</span>}
      </div>
    </div>
  );

  return (
    <div style={{
      background: "var(--glass)", border: `1px solid ${isOpen && trade.sl_breached ? "rgba(245,65,93,.4)" : "var(--border)"}`,
      borderRadius: 12, padding: "12px 14px", marginBottom: 8, opacity: isClosed ? .75 : 1,
      boxShadow: isOpen ? "var(--shadow)" : "none",
      borderLeft: `3px solid ${isCE ? "var(--green)" : "var(--red)"}`,
    }}>
      {/* Row 1 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
          <span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{trade.symbol}</span>
          <span style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 6, fontWeight: 700,
            background: isCE ? "var(--greenDim)" : "var(--redDim)",
            color: isCE ? "var(--green)" : "var(--red)",
          }}>{trade.type}</span>
          <span style={{ fontSize: 10, color: "var(--text2)" }}>{trade.lots}L · {trade.qty} qty</span>
          <span style={{ fontSize: 10, padding: "2px 9px", borderRadius: 20, fontWeight: 600, background: statusStyle.bg, color: statusStyle.c }}>{statusStyle.label}</span>
          {exitBadge && <span style={{ fontSize: 10, color: exitBadge[1] }}>{exitBadge[0]}</span>}
          {trade.limit_price && <span style={{ fontSize: 10, color: "var(--text2)", fontFamily: T.mono }}>Lmt ₹{trade.limit_price}</span>}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {isPending && <>
            <button onClick={() => setShowMod(m => !m)} style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid var(--gold)", background: showMod ? "var(--goldDim)" : "transparent", color: "var(--gold)", fontSize: 11, fontWeight: 600 }}>✎ Modify</button>
            <button onClick={handleCancel} style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", fontSize: 11 }}>✕ Cancel</button>
          </>}
          {isOpen && <button onClick={handleExit} style={{ padding: "4px 12px", borderRadius: 7, border: "1px solid var(--red)", background: "var(--redDim)", color: "var(--red)", fontSize: 11, fontWeight: 600 }}>✕ Exit Trade</button>}
        </div>
      </div>

      {isPending && showMod && <ModifyForm trade={trade} onDone={() => { setShowMod(false); onRefresh(); }} />}

      {!["CANCELLED", "REJECTED"].includes(trade.status) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: showMod ? 10 : 0 }}>
          <Chip label={isPending ? "Suggested" : "Fill Price"} val={`₹${trade.entry_price}`} />
          {trade.suggested_entry && isOpen && trade.entry_price !== trade.suggested_entry && (
            <Chip label="Suggested" val={`₹${trade.suggested_entry}`} c="var(--muted)" />
          )}
          {isOpen && <Chip label="Current LTP" val={trade.current_ltp ? `₹${trade.current_ltp}` : "—"} c="var(--accent)" />}
          {!isOpen && trade.exit_price && <Chip label="Exit LTP" val={`₹${trade.exit_price}`} />}
          <Chip label={`SL ${trade.sl_pct}%`} val={`₹${trade.sl_price}`} c="var(--red)" />
          {isOpen && trade.trailing_sl && <Chip label={`Trail ${trade.trailing_sl_pct}%`} val={`₹${trade.trailing_sl}`} c="var(--gold)" />}
          <Chip label="Target" val={`₹${trade.target_ltp}`} c="var(--green)" />
          <Chip label="Idx Tgt" val={trade.target_index?.toFixed(0)} c="var(--gold)" />
          <Chip label={isOpen ? "Unreal P&L" : "P&L"} val={pnl != null ? `${pnl >= 0 ? "+" : ""}₹${Math.abs(pnl).toFixed(2)}` : null} c={pc} />
          <Chip label="P&L %" val={trade.pnl_pct != null ? (trade.pnl_pct >= 0 ? "+" : "") + trade.pnl_pct.toFixed(1) + "%" : null} c={pnlColor(trade.pnl_pct)} />
        </div>
      )}
      {isOpen && <PBar pct={trade.pnl_vs_target} sl={trade.sl_breached} entry={trade.entry_price} target={trade.target_ltp} />}

      <div style={{ marginTop: 8, fontSize: 9, color: "var(--muted)", display: "flex", justifyContent: "space-between" }}>
        <span>
          Placed {new Date(trade.entered_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: true })} IST
          {trade.filled_at && ` · Filled ${new Date(trade.filled_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: true })}`}
          {trade.exited_at && ` · Closed ${new Date(trade.exited_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: true })}`}
        </span>
        {trade.pnl_updated_at && isOpen && <span>upd {new Date(trade.pnl_updated_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: true })}</span>}
      </div>
    </div>
  );
}

export default function TradeBox({ onUpdate }) {
  const [trades, setTrades] = useState([]);
  const [summary, setSummary] = useState({});
  const [totalPnl, setTotal] = useState(null);
  const [showHist, setShowHist] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await axios.get("/trade/refresh");
      setTrades(r.data.trades || []); setSummary(r.data); setTotal(r.data.total_pnl ?? null); onUpdate?.();
    } catch {}
  }, [onUpdate]);

  useEffect(() => { refresh(); const id = setInterval(refresh, 5000); return () => clearInterval(id); }, [refresh]);

  const active = trades.filter(t => ["PENDING", "OPEN"].includes(t.status));
  const hist = trades.filter(t => ["COMPLETED", "CANCELLED", "REJECTED"].includes(t.status));
  if (!trades.length) return null;

  const tc = pnlColor(totalPnl);

  return (
    <div style={{ background: "var(--glass2)", border: "1px solid var(--border)", borderRadius: "var(--radius2)", overflow: "hidden", backdropFilter: "blur(12px)" }}>
      <div style={{ padding: "12px 16px", background: "var(--bg3)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, color: "var(--text)", fontSize: 14 }}>Open Positions</span>
          {summary.pending > 0 && <Tag l={`${summary.pending} Pending`} c="var(--gold)" />}
          {summary.open > 0 && <Tag l={`${summary.open} Open`} c="var(--green)" />}
          {summary.completed > 0 && <Tag l={`${summary.completed} Done`} c="var(--muted)" />}
          {totalPnl != null && (
            <div style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, padding: "3px 12px", borderRadius: 20, color: tc, background: `${tc}18`, border: `1px solid ${tc}33` }}>
              {totalPnl >= 0 ? "+" : ""}₹{Math.abs(totalPnl).toFixed(2)}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={refresh} style={{ fontSize: 11, color: "var(--text2)", background: "var(--bg4)", border: "1px solid var(--border)", borderRadius: 7, padding: "3px 10px" }}>↺</button>
          {hist.length > 0 && <button onClick={() => setShowHist(h => !h)} style={{ fontSize: 11, color: "var(--text2)", background: "var(--bg4)", border: "1px solid var(--border)", borderRadius: 7, padding: "3px 10px" }}>{showHist ? "▲" : "▼"} History</button>}
        </div>
      </div>
      <div style={{ padding: "12px 16px" }}>
        {active.map(t => <TradeCard key={t.trade_id} trade={t} onRefresh={refresh} />)}
        {!active.length && <div style={{ fontSize: 12, color: "var(--muted)", padding: "12px 0", textAlign: "center" }}>No active positions</div>}
        {showHist && hist.length > 0 && <>
          <div style={{ fontSize: 9, color: "var(--muted)", margin: "10px 0 6px", textTransform: "uppercase", letterSpacing: ".07em" }}>History</div>
          {hist.map(t => <TradeCard key={t.trade_id} trade={t} onRefresh={refresh} />)}
        </>}
      </div>
    </div>
  );
}
function Tag({ l, c }) {
  return <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 600, background: `${c}18`, border: `1px solid ${c}33`, color: c }}>{l}</span>;
}
