import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { T, tierMeta } from "../theme";

export default function RecommendPanel({ signal, index, defaultBudget }) {
  const [budget,  setBudget]  = useState(defaultBudget || 2500);
  const [lots,    setLots]    = useState("1");
  const [limit,   setLimit]   = useState("");
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [msg,     setMsg]     = useState(null);

  const load = useCallback(() => {
    if (!signal || signal.signal === "WAIT" || !signal.actionable) { setData(null); return; }
    setLoading(true);
    axios.get(`/data/options?budget=${budget}&index=${index || "NIFTY"}`)
      .then(r => {
        setData(r.data);
        if (r.data?.best?.entry_ltp) setLimit((r.data.best.entry_ltp * 1.005).toFixed(1));
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [signal?.signal, signal?.actionable, signal?.ltp, budget, index]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  const execute = async () => {
    const lp = parseFloat(limit), ln = parseInt(lots);
    if (!lp || lp <= 0) { setMsg({ e: true, t: "Enter a valid limit price" }); return; }
    if (!data?.best) return;
    if (!window.confirm(`LIMIT BUY\n${data.best.symbol}\n${ln} lot(s) · ${ln * data.best.lot_size} qty @ ₹${lp}\nSL: ₹${data.best.sl_ltp}`)) return;
    setPlacing(true); setMsg(null);
    try {
      const r = await axios.post("/trade/execute", { option: data.best, lots: ln, index: index || "NIFTY", limit_price: lp });
      setMsg({ e: false, t: `✓ Order placed! ID: ${r.data.trade.trade_id} · SL ₹${r.data.trade.sl_price}` });
    } catch (e) {
      setMsg({ e: true, t: "✗ " + (e.response?.data?.error || e.message) });
    } finally { setPlacing(false); }
  };

  if (!signal || signal.signal === "WAIT") return null;
  const isCE = signal.signal === "CE_BUY";
  const sigColor = isCE ? "var(--green)" : "var(--red)";
  const sigBg    = isCE ? "var(--greenDim)" : "var(--redDim)";

  if (!signal.actionable) {
    return (
      <div style={{ background: "var(--glass2)", border: `1px solid ${isCE ? "rgba(47,190,131,.2)" : "rgba(225,73,95,.2)"}`, borderRadius: "var(--radius2)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: sigColor, opacity: 0.6, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: sigColor }}>{isCE ? "CE" : "PE"} setup forming — not confirmed yet</div>
          <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}>{signal.confirm_reason || "Waiting for confirmation"}</div>
        </div>
      </div>
    );
  }
  const best = data?.best;
  const all  = data?.all_opts || [];
  const tm   = tierMeta(signal.tier);

  const MetricBox = ({ label, value, color }) => (
    <div style={{ background: "var(--bg4)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: color || "var(--text)", fontFamily: T.mono }}>{value}</div>
    </div>
  );

  return (
    <div style={{ background: "var(--glass2)", border: `1px solid ${isCE ? "rgba(34,212,131,.2)" : "rgba(245,65,93,.2)"}`, borderRadius: "var(--radius2)", overflow: "hidden", backdropFilter: "blur(12px)", boxShadow: "var(--shadow)" }}>
      {/* Header */}
      <div style={{ padding: "12px 16px", background: sigBg, borderBottom: `1px solid ${isCE ? "rgba(34,212,131,.15)" : "rgba(245,65,93,.15)"}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: sigBg, border: `1px solid ${sigColor}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
            {isCE ? "▲" : "▼"}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: sigColor }}>{isCE ? "CE BUY" : "PE BUY"} Recommendation</div>
            {signal.tier && <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 5, background: tm.bg, color: tm.color }}>{tm.icon} {tm.label}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ fontSize: 10, color: "var(--text2)" }}>Max Budget (₹)</label>
            <input type="number" value={budget} onChange={e => setBudget(+e.target.value)} onBlur={load}
              style={{ width: 85, padding: "5px 9px", background: "var(--bg)", border: "1px solid var(--border2)", borderRadius: 8, color: "var(--text)", fontSize: 12, fontFamily: T.mono }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ fontSize: 10, color: "var(--text2)" }}>Lots</label>
            <select value={lots} onChange={e => setLots(e.target.value)}
              style={{ padding: "5px 9px", background: "var(--bg)", border: "1px solid var(--border2)", borderRadius: 8, color: "var(--text)", fontSize: 12, cursor: "pointer" }}>
              <option value="1">1 lot{best ? ` (${best.lot_size} qty)` : ""}</option>
              <option value="2">2 lots{best ? ` (${best.lot_size * 2} qty)` : ""}</option>
            </select>
          </div>
        </div>
      </div>

      <div style={{ padding: "14px 16px" }}>
        {/* Budget band info */}
        {data && (
          <div style={{ fontSize: 11, color: "var(--text2)", marginBottom: 12, padding: "8px 12px", background: "var(--bg4)", borderRadius: 8, border: "1px solid var(--border)", display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span>Lot size: <b style={{ color: "var(--text)", fontFamily: T.mono }}>{data.lot_size}</b></span>
            <span>Valid premium: <b style={{ color: "var(--gold)", fontFamily: T.mono }}>₹{data.min_premium}–₹{data.max_premium}</b></span>
            <span>Your cost: <b style={{ color: sigColor, fontFamily: T.mono }}>₹{best ? (best.entry_ltp * best.lot_size * parseInt(lots)).toFixed(0) : "—"}</b></span>
          </div>
        )}

        {msg && (
          <div style={{ padding: "9px 12px", borderRadius: 8, marginBottom: 12, fontSize: 11, fontWeight: 500, background: msg.e ? "var(--redDim)" : "var(--greenDim)", border: `1px solid ${msg.e ? "rgba(245,65,93,.25)" : "rgba(34,212,131,.25)"}`, color: msg.e ? "var(--red)" : "var(--green)" }}>
            {msg.t}
          </div>
        )}

        {loading && <div style={{ fontSize: 12, color: "var(--muted)", padding: "20px 0", textAlign: "center" }}>Scanning option chain…</div>}
        {!loading && !best && <div style={{ fontSize: 12, color: "var(--muted)", padding: "20px 0", textAlign: "center" }}>No options within ₹{budget}/lot budget</div>}

        {!loading && best && (
          <>
            <div style={{ background: "var(--bg3)", border: `1px solid ${sigColor}33`, borderRadius: 12, padding: "14px", marginBottom: 12 }}>
              {/* Symbol row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap", gap: 6 }}>
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{best.symbol}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: "var(--text2)" }}>Expiry: {best.expiry}</span>
                    <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 5, fontWeight: 600, background: best.moneyness === "ATM" ? "var(--goldDim)" : "var(--bg4)", color: best.moneyness === "ATM" ? "var(--gold)" : "var(--text2)", border: `1px solid ${best.moneyness === "ATM" ? "rgba(245,166,35,.3)" : "var(--border)"}` }}>{best.moneyness}</span>
                  </div>
                </div>
                <div style={{ textAlign: "right", fontSize: 10, color: "var(--text2)" }}>
                  <div>Score: <b style={{ color: sigColor }}>{best.score?.toFixed(1)}</b></div>
                  <div>Δ Delta: <b style={{ color: "var(--text)" }}>{best.delta}</b></div>
                </div>
              </div>

              {/* Trade levels */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))", gap: 7, marginBottom: 14 }}>
                <MetricBox label="Entry LTP"    value={`₹${best.entry_ltp}`} color="var(--accent)" />
                <MetricBox label={`SL −${best.sl_pct}%`} value={`₹${best.sl_ltp}`} color="var(--red)" />
                <MetricBox label="Take Profit"  value={`₹${best.target_ltp}`} color="var(--green)" />
                <MetricBox label="Index Target" value={best.target_index?.toFixed(0)} color="var(--gold)" />
                <MetricBox label={`${parseInt(lots)}L Cost`} value={`₹${parseInt(lots) === 1 ? best.lot_cost_1 : best.lot_cost_2}`} color="var(--text2)" />
                <MetricBox label="OI" value={(best.oi / 100000).toFixed(1) + "L"} color="var(--text2)" />
              </div>

              {/* Limit price input */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--goldDim)", border: "1px solid rgba(245,166,35,.2)", borderRadius: 9, marginBottom: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--gold)", marginBottom: 2 }}>LIMIT ORDER</div>
                  <div style={{ fontSize: 10, color: "var(--text2)" }}>Pre-filled at LTP +0.5%. Adjust if needed.</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: 10, color: "var(--text2)", whiteSpace: "nowrap" }}>Limit ₹</label>
                  <input type="number" step=".05" value={limit} onChange={e => setLimit(e.target.value)}
                    style={{ width: 90, padding: "7px 10px", background: "var(--bg)", border: `1px solid ${parseFloat(limit) > 0 ? "var(--border2)" : "var(--red)"}`, borderRadius: 8, color: "var(--text)", fontSize: 14, fontFamily: T.mono, fontWeight: 700 }} />
                </div>
              </div>

              <button onClick={execute} disabled={placing} style={{
                width: "100%", padding: "12px", borderRadius: 10, border: "none", fontWeight: 700,
                fontSize: 13, cursor: placing ? "not-allowed" : "pointer", color: "#fff", letterSpacing: ".02em",
                background: placing ? "var(--muted)" : isCE ? "linear-gradient(135deg,#15803d,#22d483)" : "linear-gradient(135deg,#b91c1c,#f5415d)",
                boxShadow: placing ? "none" : isCE ? "0 4px 16px rgba(34,212,131,0.3)" : "0 4px 16px rgba(245,65,93,0.3)",
                transition: "all .2s",
              }}>
                {placing ? "Placing order…" : `⚡ Execute — ${lots} lot${parseInt(lots) > 1 ? "s" : ""} (${best.lot_size * parseInt(lots)} qty) @ ₹${limit || "?"}`}
              </button>
            </div>

            {/* All options table */}
            {all.length > 1 && (
              <details>
                <summary style={{ fontSize: 11, color: "var(--text2)", cursor: "pointer", marginBottom: 8, userSelect: "none" }}>All {all.length} options within budget ▾</summary>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead><tr style={{ borderBottom: "1px solid var(--border)" }}>{["Symbol","Strike","Money","LTP","1L","2L","Δ","OI","Score"].map(h => (
                      <th key={h} style={{ padding: "5px 7px", textAlign: "left", color: "var(--muted)", fontSize: 9, textTransform: "uppercase", letterSpacing: ".05em" }}>{h}</th>
                    ))}</tr></thead>
                    <tbody>{all.map((o, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid var(--bg4)`, background: i === 0 ? `${sigColor}06` : "transparent" }}>
                        <td style={{ padding: "5px 7px", fontFamily: T.mono, color: "var(--text)", fontSize: 11 }}>{o.symbol}</td>
                        <td style={{ padding: "5px 7px", color: "var(--text)" }}>{o.strike}</td>
                        <td style={{ padding: "5px 7px", color: o.moneyness === "ATM" ? "var(--gold)" : "var(--text2)" }}>{o.moneyness}</td>
                        <td style={{ padding: "5px 7px", fontFamily: T.mono, color: "var(--text)" }}>₹{o.premium}</td>
                        <td style={{ padding: "5px 7px", fontFamily: T.mono, color: "var(--gold)" }}>₹{o.lot_cost_1}</td>
                        <td style={{ padding: "5px 7px", fontFamily: T.mono, color: "var(--text2)" }}>₹{o.lot_cost_2}</td>
                        <td style={{ padding: "5px 7px", color: "var(--text2)" }}>{o.delta}</td>
                        <td style={{ padding: "5px 7px", color: "var(--muted)" }}>{(o.oi / 100000).toFixed(1)}L</td>
                        <td style={{ padding: "5px 7px", fontWeight: 600, color: i === 0 ? sigColor : "var(--muted)" }}>{o.score?.toFixed(1)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}
