import React from "react";
import { T } from "../theme";

/**
 * Sigmatics mark — a sigma inside a gold ring, crossed by an emerald
 * "rising market" line that breaks past the ring at both ends.
 * Transparent background: safe to place on both Warm Ink dark and light.
 */
export function LogoMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="sgGoldRing" x1="10" y1="10" x2="90" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#D4AF37" /><stop offset="1" stopColor="#B8860B" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="41" stroke="url(#sgGoldRing)" strokeWidth="5" />
      <path d="M36 32h28l-16.5 18L64 68H36" stroke="url(#sgGoldRing)" strokeWidth="6" strokeLinejoin="round" strokeLinecap="round" fill="none" />
      <path d="M16 72 L34 52 L46 60 L66 30 L86 16" stroke="#00E67E" strokeWidth="6.5" strokeLinejoin="round" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** Icon on a rounded dark backdrop — for tight/compact UI slots and the favicon. */
export function LogoCompact({ size = 40 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.26, background: "#0D0B08", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <LogoMark size={size * 0.78} />
    </div>
  );
}

/** Full lockup — mark + "SIGMATICS" wordmark + "SIGNALS, QUANTIFIED" tagline. */
export default function Logo({ size = 30, showWord = true, wordSize = 18, stacked = true }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <LogoMark size={size} />
      {showWord && (
        <div style={{ display: "flex", flexDirection: stacked ? "column" : "row", gap: stacked ? 0 : 8, lineHeight: 1.1 }}>
          <span style={{ fontFamily: T.display, fontWeight: 700, fontSize: wordSize, color: "#D4AF37", letterSpacing: ".02em" }}>
            SIGMATICS
          </span>
          <span style={{ fontFamily: T.body, fontWeight: 600, fontSize: Math.max(8, wordSize * 0.4), color: "#00E67E", letterSpacing: ".12em" }}>
            SIGNALS, QUANTIFIED
          </span>
        </div>
      )}
    </div>
  );
}
