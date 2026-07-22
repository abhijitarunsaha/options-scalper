import React from "react";
import { T, tierMeta } from "../theme";

const GROUPS = [
  { label: "Trend", icon: "📈", ids: [0, 1, 2] },
  { label: "Momentum", icon: "⚡", ids: [3] },
  { label: "Structure", icon: "🏗", ids: [4, 5, 6] },
  { label: "Volume", icon: "📊", ids: [7] },
  { label: "Pattern", icon: "🕯", ids: [8] },
  { label: "Context", icon: "🌐", ids: [9, 10, 11, 12] },
];

function MiniPill({ label, value, color }) {
  return (
    <div style={{
      background: "var(--bg4)", border: "1px solid var(--border)",
      borderRadius: 8, padding: "6px 10px", minWidth: 70,
    }}>
      <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: color || "var(--text)", fontFamily: T.mono }}>
        {value ?? <span style={{ color: "var(--muted)" }}>—</span>}
      </div>
    </div>
  );
}

function RefreshSelect({ value, onChange }) {
  if (!onChange) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>Pattern refresh</span>
      <select value={value} onChange={e => onChange(parseInt(e.target.value))} style={{
        padding: "3px 8px", background: "var(--bg4)", border: "1px solid var(--border)",
        borderRadius: 7, color: "var(--text)", fontSize: 11, fontFamily: T.mono,
      }}>
        <option value={5}>5s</option>
        <option value={10}>10s</option>
      </select>
    </div>
  );
}

export default function SignalCard({ signal, indicators, fiiDii, refreshSeconds, onSetRefreshSeconds }) {
  const isCE = signal?.signal === "CE_BUY", isPE = signal?.signal === "PE_BUY";
  const isWait = !isCE && !isPE;
  const tier = signal?.tier;
  const tm = tierMeta(tier);
  const conds = signal?.conditions || [];
  const sigColor = isCE ? "var(--green)" : isPE ? "var(--red)" : "var(--muted)";
  const sigBg = isCE ? "var(--greenDim)" : isPE ? "var(--redDim)" : "var(--bg4)";
  const sigBorder = isCE ? "rgba(34,212,131,.2)" : isPE ? "rgba(245,65,93,.2)" : "var(--border)";
  const score = signal?.score || 0;
  const total = signal?.total || 12;
  const fd = fiiDii || {};
  const trn = signal?.trend || indicators?.trend || "RANGING";
  const trendColor = trn.includes("BULL") ? "var(--green)" : trn.includes("BEAR") ? "var(--red)" : "var(--text2)";

  return (
    <div style={{
      background: "var(--glass2)", border: `1px solid ${sigBorder}`,
      borderRadius: "var(--radius2)", overflow: "hidden",
      backdropFilter: "blur(12px)", boxShadow: "var(--shadow)",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 16px", background: sigBg,
        borderBottom: `1px solid ${sigBorder}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: isCE ? "var(--greenDim)" : isPE ? "var(--redDim)" : "var(--bg4)",
            border: `1px solid ${sigBorder}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18,
          }}>{isCE ? "▲" : isPE ? "▼" : "⏸"}</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: sigColor }}>
              {isCE ? "CE BUY" : isPE ? "PE BUY" : "WAIT"}
            </div>
            {tier && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                  background: tm.bg, color: tm.color,
                }}>{tm.icon} {tm.label}</span>
                <span style={{ fontSize: 10, color: "var(--text2)", fontFamily: T.mono }}>{score}/{total}</span>
              </div>
            )}
          </div>
        </div>
        {/* Score bar */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
          <div style={{ display: "flex", gap: 3 }}>
            {Array.from({ length: total }).map((_, i) => (
              <div key={i} style={{
                width: 12, height: 5, borderRadius: 3, transition: "background .3s",
                background: i < score ? sigColor : "var(--border2)",
              }} />
            ))}
          </div>
          <span style={{ fontSize: 10, color: "var(--text2)" }}>{score} of {total} matched</span>
        </div>
      </div>

      {/* Trend banner */}
      <div style={{
        padding: "8px 16px", background: "var(--bg3)",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: "var(--muted)" }}>MARKET</span>
          <span style={{
            fontSize: 11, fontWeight: 600, color: trendColor,
            background: `${trendColor}18`, border: `1px solid ${trendColor}33`,
            borderRadius: 6, padding: "1px 8px",
          }}>{trn}</span>
        </div>
        {signal?.ema_slope != null && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 10, color: "var(--muted)" }}>EMA SLOPE</span>
            <span style={{ fontSize: 11, fontFamily: T.mono, fontWeight: 600,
              color: signal.ema_slope > 0 ? "var(--green)" : signal.ema_slope < 0 ? "var(--red)" : "var(--text2)" }}>
              {signal.ema_slope > 0 ? "+" : ""}{signal.ema_slope?.toFixed(1)}
            </span>
          </div>
        )}
        {fd.bias && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
            <span style={{ fontSize: 10, color: "var(--muted)" }}>FII/DII</span>
            <span style={{
              fontSize: 11, fontWeight: 600,
              color: fd.bias === "BULLISH" ? "var(--green)" : fd.bias === "BEARISH" ? "var(--red)" : "var(--text2)"
            }}>{fd.bias}</span>
            {fd.as_of && <span style={{ fontSize: 9, color: "var(--muted)" }}>@{fd.as_of}</span>}
          </div>
        )}
        {signal?.reason && <span style={{ fontSize: 10, color: "var(--muted)" }}>{signal.reason}</span>}
        <div style={{ marginLeft: "auto" }}><RefreshSelect value={refreshSeconds || 5} onChange={onSetRefreshSeconds} /></div>
      </div>

      <div style={{ padding: "12px 16px" }}>
        {/* Condition groups */}
        {conds.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            {GROUPS.map(g => {
              const items = g.ids.map(i => conds[i]).filter(Boolean);
              if (!items.length) return null;
              const matched = items.filter(c => isCE ? c.ce : isPE ? c.pe : c.ce || c.pe).length;
              return (
                <div key={g.label} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 11 }}>{g.icon}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text2)", textTransform: "uppercase", letterSpacing: ".06em" }}>{g.label}</span>
                    <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                    <span style={{
                      fontSize: 10, fontWeight: 600,
                      color: matched > 0 ? sigColor : "var(--muted)",
                      background: matched > 0 ? `${sigColor}15` : "transparent",
                      borderRadius: 4, padding: "0 5px",
                    }}>{matched}/{items.length}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 10px", paddingLeft: 4 }}>
                    {items.map((c, i) => {
                      const m = isWait ? (c.ce || c.pe) : isCE ? c.ce : c.pe;
                      const lbl = isWait ? (c.ce ? c.label_ce : c.label_pe) : isCE ? c.label_ce : c.label_pe;
                      return (
                        <div key={i} style={{ display: "flex", gap: 5, alignItems: "flex-start", padding: "2px 0" }}>
                          <span style={{
                            width: 14, height: 14, borderRadius: 4, flexShrink: 0, marginTop: 1,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 9, fontWeight: 700,
                            background: m ? `${sigColor}20` : "var(--bg4)",
                            color: m ? sigColor : "var(--muted)",
                            border: `1px solid ${m ? `${sigColor}40` : "var(--border)"}`,
                          }}>{m ? "✓" : "○"}</span>
                          <span style={{ fontSize: 11, color: m ? "var(--text)" : "var(--muted)", lineHeight: 1.4 }}>{lbl}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Indicator pills */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <MiniPill label="LTP"    value={indicators?.ltp?.toFixed(2)} />
          <MiniPill label="VWAP"   value={indicators?.vwap?.toFixed(2)} />
          <MiniPill label="RSI"    value={indicators?.rsi?.toFixed(1)}
            color={!indicators?.rsi ? undefined : indicators.rsi < 35 ? "var(--green)" : indicators.rsi > 65 ? "var(--red)" : "var(--text)"} />
          <MiniPill label="ATR"    value={indicators?.atr?.toFixed(1)} />
          <MiniPill label="MACD"   value={indicators?.macd_hist != null ? (indicators.macd_hist >= 0 ? "▲" : "▼") + " " + Math.abs(indicators.macd_hist).toFixed(2) : null}
            color={indicators?.macd_hist > 0 ? "var(--green)" : indicators?.macd_hist < 0 ? "var(--red)" : undefined} />
          <MiniPill label="BB%"    value={indicators?.bb_pct != null ? (indicators.bb_pct * 100).toFixed(0) + "%" : null}
            color={indicators?.bb_pct < 0.2 ? "var(--green)" : indicators?.bb_pct > 0.8 ? "var(--red)" : undefined} />
          <MiniPill label="Vol×"   value={indicators?.volume_ratio?.toFixed(1) + "×"}
            color={indicators?.volume_spike ? "var(--green)" : undefined} />
          <MiniPill label="VIX"    value={indicators?.vix?.toFixed(2)}
            color={!indicators?.vix ? undefined : indicators.vix <= 15 ? "var(--green)" : indicators.vix >= 20 ? "var(--red)" : "var(--gold)"} />
          <MiniPill label="Pattern"
            value={indicators?.bullish_engulfing ? "Bull Engulf" : indicators?.bearish_engulfing ? "Bear Engulf" : indicators?.hammer ? "Hammer" : indicators?.shooting_star ? "Shoot ★" : indicators?.three_white ? "3 White" : indicators?.three_black ? "3 Black" : "None"}
            color={(indicators?.bullish_engulfing || indicators?.hammer || indicators?.three_white) ? "var(--green)" : (indicators?.bearish_engulfing || indicators?.shooting_star || indicators?.three_black) ? "var(--red)" : "var(--muted)"} />
          {fd.fii_net != null && <MiniPill label="FII" value={(fd.fii_net >= 0 ? "+" : "") + fd.fii_net.toFixed(0) + "Cr"} color={fd.fii_net >= 0 ? "var(--green)" : "var(--red)"} />}
          {fd.dii_net != null && <MiniPill label="DII" value={(fd.dii_net >= 0 ? "+" : "") + fd.dii_net.toFixed(0) + "Cr"} color={fd.dii_net >= 0 ? "var(--green)" : "var(--red)"} />}
        </div>
      </div>
    </div>
  );
}
