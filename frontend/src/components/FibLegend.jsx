import React from "react";
import { T } from "../theme";
const META = [
  { l:"100",  label:"Session High",    c:"#64748b" },
  { l:"78.6", label:"78.6%",           c:"#94a3b8" },
  { l:"61.8", label:"61.8%  Golden",   c:"#f5a623" },
  { l:"50.0", label:"50.0%",           c:"#cbd5e1" },
  { l:"38.2", label:"38.2%  Golden",   c:"#f5a623" },
  { l:"23.6", label:"23.6%",           c:"#64748b" },
  { l:"0",    label:"Session Low",     c:"#475569" },
];
export default function FibLegend({ fibonacci }) {
  if (!fibonacci || !Object.keys(fibonacci).length) return null;
  return (
    <div style={{ background:"var(--glass2)", border:"1px solid var(--border)", borderRadius:"var(--radius2)", padding:"12px 14px", backdropFilter:"blur(12px)", boxShadow:"var(--shadow)" }}>
      <div style={{ fontSize:9, color:"var(--muted)", textTransform:"uppercase", letterSpacing:".08em", marginBottom:10, fontWeight:600 }}>Fibonacci Retracements</div>
      {META.map(({ l, label, c }) => (
        <div key={l} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"5px 0", borderBottom:"1px solid var(--bg4)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:7 }}>
            <div style={{ width:18, height:2, background:c, borderRadius:1 }} />
            <span style={{ fontSize:11, color:"var(--text2)" }}>{label}</span>
          </div>
          <span style={{ fontFamily:T.mono, fontSize:11, color:c, fontWeight:600 }}>
            {fibonacci[l] ? `₹${fibonacci[l].toLocaleString("en-IN")}` : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}
