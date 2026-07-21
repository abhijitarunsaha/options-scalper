import React from "react";
import { RadialBarChart, RadialBar, PolarAngleAxis } from "recharts";
import { T } from "../theme";

export default function ExposureGauge({ exposure }) {
  const util = exposure?.utilization_pct ?? 0;
  const mult = exposure?.lot_multiplier ?? 1;
  const color = util >= 80 ? "var(--bear)" : util >= 60 ? "var(--watch)" : "var(--bull)";
  const data = [{ value: util, fill: color }];

  return (
    <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--radius2)", padding: "16px 18px", boxShadow: "var(--shadow)" }}>
      <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 600, marginBottom: 4 }}>Margin Exposure</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 96, height: 96, position: "relative" }}>
          <RadialBarChart width={96} height={96} innerRadius={34} outerRadius={46} data={data} startAngle={90} endAngle={-270}>
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar background={{ fill: "var(--bg4)" }} dataKey="value" cornerRadius={8} />
          </RadialBarChart>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: T.mono, fontSize: 16, fontWeight: 600, color }}>
              {exposure?.utilization_pct != null ? `${util.toFixed(0)}%` : "—"}
            </span>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: "var(--text2)", marginBottom: 4 }}>Lot-size multiplier</div>
          <div style={{ fontFamily: T.mono, fontSize: 20, fontWeight: 600, color }}>{mult}×</div>
          <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 6, lineHeight: 1.4 }}>{exposure?.reason || "—"}</div>
        </div>
      </div>
    </div>
  );
}
