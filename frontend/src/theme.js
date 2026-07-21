// CSS variable accessors — works with both dark and light mode
export const T = {
  bg:"var(--bg)", bg2:"var(--bg2)", bg3:"var(--bg3)", bg4:"var(--bg4)", bg5:"var(--bg5)",
  panel:"var(--panel)", panel2:"var(--panel2)",
  border:"var(--border)", border2:"var(--border2)",
  brand:"var(--brand)", accent:"var(--accent)", accent2:"var(--accent2)", accent3:"var(--accent3)",
  bull:"var(--bull)", bullDim:"var(--bullDim)", bullGlow:"var(--bullGlow)",
  bear:"var(--bear)", bearDim:"var(--bearDim)", bearGlow:"var(--bearGlow)",
  watch:"var(--watch)", watchDim:"var(--watchDim)",
  green:"var(--green)", red:"var(--red)", gold:"var(--gold)",
  text:"var(--text)", text2:"var(--text2)", muted:"var(--muted)", muted2:"var(--muted2)",
  shadow:"var(--shadow)", shadow2:"var(--shadow2)",
  r:"var(--radius)", r2:"var(--radius2)", r3:"var(--radius3)",
  display:"var(--font-display)", body:"var(--font-body)", mono:"var(--mono)",
};

// Signal tier -> color/label/glyph. Glyphs are plain geometric marks, not emoji —
// keeps the terminal register consistent instead of reading as decorative.
export const tierMeta = (tier) => ({
  STRONG:      { color:"var(--bull)",  bg:"var(--bullDim)",  label:"STRONG",   glyph:"●●●", icon:"●●●" },
  MODERATE:    { color:"var(--watch)", bg:"var(--watchDim)", label:"MODERATE", glyph:"●●○", icon:"●●○" },
  SCOUT:       { color:"var(--brand)", bg:"var(--brandDim)", label:"SCOUT",    glyph:"●○○", icon:"●○○" },
  OR_BREAKOUT: { color:"var(--accent2)", bg:"rgba(139,108,240,0.14)", label:"OR BREAK", glyph:"◆", icon:"◆" },
}[tier] || { color:"var(--muted)", bg:"transparent", label:"—", glyph:"", icon:"" });

// Regime -> color/label, drives the confirmation-ring signature element.
export const regimeMeta = (mode) => ({
  OPENING_RANGE: { color:"var(--watch)", label:"Opening Range", desc:"Fast lane — first move of the day" },
  COMPRESSION:   { color:"var(--accent2)", label:"Compression",  desc:"Range squeeze — pre-move watch" },
  STEADY_STATE:  { color:"var(--brand)", label:"Steady State",  desc:"Confirmation + cooldown gating" },
}[mode] || { color:"var(--muted)", label:"—", desc:"" });

export const pnlColor = (v) =>
  v == null ? "var(--text2)" : v > 0 ? "var(--bull)" : v < 0 ? "var(--bear)" : "var(--text2)";

// Panel style — flat terminal panel with a hairline border, not heavy glassmorphism
export const card = (extra = {}) => ({
  background: "var(--bg2)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius2)",
  boxShadow: "var(--shadow)",
  ...extra,
});

// Kept for any legacy call sites — now maps onto the flatter card style
export const glassCard = card;

export const gradientText = (color1, color2) => ({
  background: `linear-gradient(135deg, ${color1}, ${color2})`,
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
});

export {
    useTheme,
    ThemeProvider
} from "./ThemeContext";
