import React from "react";
import { regimeMeta } from "../theme";

/**
 * ConfirmationRing — the one signature visual of this redesign.
 * It doesn't decorate the signal, it explains it: the ring's motion IS the
 * anti-overtrading state from signal_engine.py, made visible.
 *
 *  OPENING_RANGE : ring sweeps fast, full circle — "fast lane, no wait"
 *  COMPRESSION   : ring pulses tight/squeezed — the range squeeze itself
 *  STEADY_STATE  : ring fills in discrete segments as confirmation bars
 *                  accumulate, then glows solid + steady once actionable
 */
export default function ConfirmationRing({ regime, actionable, size = 64, tierColor }) {
  const meta = regimeMeta(regime);
  const color = actionable ? (tierColor || meta.color) : meta.color;
  const strokeWidth = Math.max(2, size * 0.045);
  const r = size / 2 - strokeWidth * 1.6;
  const c = 2 * Math.PI * r;
  const cx = size / 2, cy = size / 2;

  let dash = c, dashoffset = 0, animName = "none", animDur = "0s";
  if (regime === "OPENING_RANGE") {
    dash = c * 0.28; dashoffset = 0; animName = "ringRotate"; animDur = "1.4s";
  } else if (regime === "COMPRESSION") {
    dash = c * 0.75; dashoffset = c * 0.1; animName = "ringBreathe"; animDur = "1.1s";
  } else {
    // steady state: solid ring, opacity communicates actionable vs building
    dash = c; dashoffset = 0;
  }

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} />
        <circle
          cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`} strokeDashoffset={dashoffset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{
            opacity: regime === "STEADY_STATE" ? (actionable ? 1 : 0.4) : 1,
            transformOrigin: "center",
            animation: animName !== "none" ? `${animName} ${animDur} linear infinite` : "none",
            transition: "opacity .3s, stroke .3s",
          }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--mono)", fontSize: size * 0.16, fontWeight: 600, color,
      }}>
        {actionable ? "●" : "…"}
      </div>
      <style>{`
        @keyframes ringRotate { from{ transform:rotate(-90deg);} to{ transform:rotate(270deg);} }
        @keyframes ringBreathe { 0%,100%{ opacity:.5; } 50%{ opacity:1; } }
      `}</style>
    </div>
  );
}
