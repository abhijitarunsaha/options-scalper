import React from "react";
import { T } from "../theme";

/**
 * Sigmatics emblem — "Signals through Mathematics".
 * The mark is a sigma (Σ) drawn as three angular strokes, echoing a
 * candlestick's up-down-up path, with a small solid dot standing in for
 * a live signal ping at the sigma's open end.
 */
export function LogoMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="var(--bg4)" />
      <path d="M15 18h34l-15 14 15 14H15l13-14z"
        stroke="var(--brand)" strokeWidth="4.2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="47" cy="18" r="3.4" fill="var(--bull)" />
    </svg>
  );
}

export default function Logo({ size = 28, showWord = true, wordSize = 17 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <LogoMark size={size} />
      {showWord && (
        <span style={{ fontFamily: T.display, fontWeight: 700, fontSize: wordSize, color: T.text, letterSpacing: "-.02em" }}>
          Sigmatics
        </span>
      )}
    </div>
  );
}
