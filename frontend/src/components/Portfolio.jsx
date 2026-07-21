import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { T, pnlColor } from "../theme";
import StatCard from "./StatCard";
import PortfolioTable from "./PortfolioTable";
import ExposureGauge from "./ExposureGauge";

const DONUT_COLORS = ["var(--brand)", "var(--bull)", "var(--watch)", "var(--accent2)", "var(--bear)", "#6C7A99"];

export default function Portfolio() {
  const [data, setData]         = useState(null);
  const [exposure, setExposure] = useState(null);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const [h, e] = await Promise.all([
        axios.get(`/data/portfolio/holdings${refresh ? "?refresh=true" : ""}`),
        axios.get("/data/portfolio/exposure"),
      ]);
      setData(h.data); setExposure(e.data);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const id = setInterval(() => load(), 5 * 60 * 1000); return () => clearInterval(id); }, [load]);

  const donutData = (data?.holdings || []).slice(0, 6).map(h => ({ name: h.symbol, value: h.current_value }));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 12, alignItems: "start" }}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: T.display, fontWeight: 700, fontSize: 18, color: T.text }}>Portfolio</span>
          <button onClick={() => load(true)} style={{
            fontSize: 11, color: "var(--brand)", background: "var(--brandDim)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "5px 12px", fontWeight: 600,
          }}>Refresh</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8 }}>
          <StatCard label="Invested" value={data ? `₹${data.total_invested.toLocaleString("en-IN")}` : null} color="var(--brand)" />
          <StatCard label="Current Value" value={data ? `₹${data.total_current_value.toLocaleString("en-IN")}` : null} color="var(--accent2)" />
          <StatCard label="Total P&L" value={data ? `${data.total_pnl >= 0 ? "+" : ""}${data.total_pnl_pct.toFixed(1)}%` : null} color={pnlColor(data?.total_pnl)} />
          <StatCard label="Day P&L" value={data ? `${data.total_day_pnl >= 0 ? "+" : ""}₹${Math.abs(data.total_day_pnl).toFixed(0)}` : null} color={pnlColor(data?.total_day_pnl)} />
        </div>

        <PortfolioTable data={data} loading={loading} />
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <ExposureGauge exposure={exposure} />

        <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--radius2)", padding: "16px 18px", boxShadow: "var(--shadow)" }}>
          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 600, marginBottom: 10 }}>Allocation</div>
          {donutData.length ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 110, height: 110 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={32} outerRadius={52} paddingAngle={2}>
                      {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, display: "grid", gap: 4 }}>
                {donutData.map((d, i) => (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                    <span style={{ color: T.text2, flex: 1 }}>{d.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <div style={{ fontSize: 11, color: "var(--muted)" }}>No holdings to allocate.</div>}
        </div>
      </div>
    </div>
  );
}
