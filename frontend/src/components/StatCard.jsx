import React from "react";
import { T } from "../theme";
export default function StatCard({ icon, label, value, sub, color }) {
  const c = color || "var(--accent)";
  return (
    <div style={{ background:"var(--glass2)", border:"1px solid var(--border)", borderRadius:"var(--radius2)", padding:"14px 16px", backdropFilter:"blur(12px)", boxShadow:"var(--shadow)", position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", top:-24, left:-24, width:80, height:80, borderRadius:"50%", background:`${c}18`, filter:"blur(24px)", pointerEvents:"none" }} />
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
        {icon && <div style={{ width:32, height:32, borderRadius:9, background:`${c}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15 }}>{icon}</div>}
        {sub && <span style={{ fontSize:10, color:"var(--text2)" }}>{sub}</span>}
      </div>
      <div style={{ fontSize:9, color:"var(--muted)", textTransform:"uppercase", letterSpacing:".08em", marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:18, fontWeight:700, color, fontFamily:T.mono }}>{value ?? <span style={{color:"var(--muted)"}}>—</span>}</div>
    </div>
  );
}
