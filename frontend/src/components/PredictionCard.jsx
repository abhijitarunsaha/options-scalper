import React from "react";
import { T } from "../theme";

export default function PredictionCard({ prediction }) {
  if (!prediction) return null;
  const { bias, confidence, target, invalidation, mtf_aligned, rationale = [] } = prediction;
  const isUp = bias === "UP", isDown = bias === "DOWN";
  const color = isUp ? "var(--bull)" : isDown ? "var(--bear)" : "var(--muted)";
  const bg    = isUp ? "var(--bullDim)" : isDown ? "var(--bearDim)" : "var(--bg4)";

  return (
    <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--radius2)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
      <div style={{ padding: "12px 16px", background: bg, borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: T.display, fontWeight: 600, fontSize: 13, color: T.text }}>Near-Term Read</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 6, background: bg, color, border: `1px solid ${color}33` }}>
            {isUp ? "▲ UP" : isDown ? "▼ DOWN" : "— NEUTRAL"}
          </span>
          <span style={{ fontSize: 10, color: "var(--text2)" }}>Horizon {prediction.horizon_minutes}m</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: "var(--muted)" }}>Confidence</span>
          <div style={{ width: 60, height: 5, borderRadius: 3, background: "var(--bg4)", overflow: "hidden" }}>
            <div style={{ width: `${confidence || 0}%`, height: "100%", background: color }} />
          </div>
          <span style={{ fontSize: 11, fontFamily: T.mono, fontWeight: 600, color }}>{confidence}%</span>
        </div>
      </div>

      <div style={{ padding: "12px 16px" }}>
        {(target || invalidation) && (
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            {target != null && (
              <div style={{ background: "var(--bg4)", border: `1px solid ${color}33`, borderRadius: 8, padding: "6px 12px" }}>
                <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>Projected touch (index)</div>
                <div style={{ fontFamily: T.mono, fontWeight: 600, fontSize: 13, color }}>{target.toLocaleString("en-IN")}</div>
              </div>
            )}
            {invalidation != null && (
              <div style={{ background: "var(--bg4)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px" }}>
                <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>Invalidation (index)</div>
                <div style={{ fontFamily: T.mono, fontWeight: 600, fontSize: 13, color: "var(--text2)" }}>{invalidation.toLocaleString("en-IN")}</div>
              </div>
            )}
            {!mtf_aligned && (
              <div style={{ background: "var(--watchDim)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", display: "flex", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "var(--watch)", fontWeight: 600 }}>⚠ 5-min conflicts with 1-min</span>
              </div>
            )}
          </div>
        )}

        {rationale.length > 0 && (
          <div style={{ display: "grid", gap: 3 }}>
            {rationale.map((r, i) => (
              <div key={i} style={{ fontSize: 11, color: "var(--text2)", display: "flex", gap: 6 }}>
                <span style={{ color: "var(--muted)" }}>·</span>{r}
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
          Structured multi-factor read (trend, BB, RSI divergence, OI momentum, VIX, 5-min confluence, S/R target room) — not a trained/backtested ML model. Validate against history with backend/backtest.py before trusting it as more than a second opinion.
        </div>
      </div>
    </div>
  );
}
