import React, { useEffect, useRef } from "react";
import { createChart, CrosshairMode, LineStyle } from "lightweight-charts";

const FIB_COLORS = {
  "0":"#7A7061","23.6":"#8A7F69","38.2":"#D4AF37",
  "50.0":"#B4A890","61.8":"#D4AF37","78.6":"#8A7F69","100":"#7A7061"
};

// IST offset: UTC+5:30 = 19800 seconds
const IST_OFFSET_SEC = 5.5 * 3600;

function toISTTimestamp(isoString) {
  const utcMs = new Date(isoString).getTime();
  // Shift the unix timestamp so lightweight-charts renders it as IST
  return Math.floor(utcMs / 1000) + IST_OFFSET_SEC;
}

function formatIST(unixSec) {
  // Reverse the shift to get real UTC, then display as IST
  const realUtcMs = (unixSec - IST_OFFSET_SEC) * 1000;
  return new Date(realUtcMs).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata", hour12: false,
    hour: "2-digit", minute: "2-digit",
  });
}

function formatISTDate(unixSec) {
  const realUtcMs = (unixSec - IST_OFFSET_SEC) * 1000;
  return new Date(realUtcMs).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short",
  });
}

export default function CandleChart({ candles, fibonacci, showOverlays = true }) {
  const ref       = useRef(null);
  const chart     = useRef(null);
  const series    = useRef({});
  const fibLines  = useRef([]);

  useEffect(() => {
    if (!ref.current) return;

    const isDark = !document.body.classList.contains("light-mode");
    const bgColor    = isDark ? "#171310" : "#FAF6EC";
    const textColor  = isDark ? "#B4A890" : "#5C5340";
    const gridColor  = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
    const borderCol  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)";

    const c = createChart(ref.current, {
      width:  ref.current.clientWidth,
      height: 340,
      layout: { background: { color: bgColor }, textColor },
      grid:   { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: borderCol },
      timeScale: {
        borderColor:    borderCol,
        timeVisible:    true,
        secondsVisible: false,
        // Custom tick formatter — shows IST time labels on x-axis
        tickMarkFormatter: (unixSec, tickMarkType) => {
          // tickMarkType: 0=Year,1=Month,2=Day,3=Hour,4=Minute
          if (tickMarkType <= 2) return formatISTDate(unixSec);
          return formatIST(unixSec);
        },
      },
      localization: {
        // Tooltip / crosshair time label
        timeFormatter: (unixSec) => {
          const realUtcMs = (unixSec - IST_OFFSET_SEC) * 1000;
          return new Date(realUtcMs).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata", hour12: false,
            day: "2-digit", month: "short",
            hour: "2-digit", minute: "2-digit",
          }) + " IST";
        },
      },
    });

    chart.current = c;

    series.current.candle = c.addCandlestickSeries({
      upColor: "#00E67E", downColor: "#E1476B",
      borderUpColor: "#00E67E", borderDownColor: "#E1476B",
      wickUpColor: "#00E67E", wickDownColor: "#E1476B",
    });
    series.current.bbUpper = c.addLineSeries({ color: "rgba(124,111,247,0.5)", lineWidth: 1, lineStyle: LineStyle.Dashed, title: "BB↑" });
    series.current.bbMid   = c.addLineSeries({ color: "rgba(124,111,247,0.25)", lineWidth: 1, lineStyle: LineStyle.Dotted, title: "BB" });
    series.current.bbLower = c.addLineSeries({ color: "rgba(124,111,247,0.5)", lineWidth: 1, lineStyle: LineStyle.Dashed, title: "BB↓" });
    series.current.ema9    = c.addLineSeries({ color: "#2962FF", lineWidth: 1.5, title: "EMA9" });
    series.current.ema21   = c.addLineSeries({ color: "#D4AF37", lineWidth: 1.5, title: "EMA21" });
    series.current.vwap    = c.addLineSeries({ color: "rgba(255,255,255,0.45)", lineWidth: 1, lineStyle: LineStyle.Dashed, title: "VWAP" });

    const ro = new ResizeObserver(() => {
      if (ref.current) c.applyOptions({ width: ref.current.clientWidth });
    });
    ro.observe(ref.current);

    // Re-theme on body class change (light/dark toggle)
    const mo = new MutationObserver(() => {
      const isD = !document.body.classList.contains("light-mode");
      c.applyOptions({
        layout: { background: { color: isD ? "#171310" : "#FAF6EC" }, textColor: isD ? "#B4A890" : "#5C5340" },
        grid:   { vertLines: { color: isD ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)" }, horzLines: { color: isD ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)" } },
      });
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });

    return () => { ro.disconnect(); mo.disconnect(); c.remove(); };
  }, []);

  // Update candle data — use IST-shifted timestamps
  useEffect(() => {
    ["bbUpper","bbMid","bbLower","ema9","ema21","vwap"].forEach(k =>
      series.current[k]?.applyOptions({ visible: showOverlays }));
  }, [showOverlays]);

  useEffect(() => {
    if (!series.current.candle || !candles?.length) return;
    const ts = c => toISTTimestamp(c.time);

    series.current.candle.setData(
      candles.map(c => ({ time: ts(c), open: c.open, high: c.high, low: c.low, close: c.close }))
    );
    const mk = (field) => candles.filter(c => c[field] != null).map(c => ({ time: ts(c), value: c[field] }));
    series.current.bbUpper.setData(mk("bb_upper"));
    series.current.bbMid.setData(mk("bb_mid"));
    series.current.bbLower.setData(mk("bb_lower"));
    series.current.ema9.setData(mk("ema9"));
    series.current.ema21.setData(mk("ema21"));
    series.current.vwap.setData(mk("vwap"));
  }, [candles]);

  // Draw Fibonacci lines
  useEffect(() => {
    if (!chart.current || !fibonacci || !Object.keys(fibonacci).length) return;
    fibLines.current.forEach(l => { try { series.current.candle?.removePriceLine(l); } catch {} });
    fibLines.current = [];
    Object.entries(fibonacci).forEach(([lvl, price]) => {
      const line = series.current.candle?.createPriceLine({
        price, color: FIB_COLORS[lvl] || "#8A7F69", lineWidth: 1,
        lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Fib ${lvl}%`,
      });
      if (line) fibLines.current.push(line);
    });
  }, [fibonacci]);

  return (
    <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--radius2)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
      <div style={{ padding: "10px 14px 0", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>1-min Chart</span>
        {[["EMA9", "#2962FF"], ["EMA21", "#D4AF37"], ["VWAP", "rgba(230,220,200,0.6)"], ["BB", "rgba(139,108,240,0.7)"]].map(([l, c]) => (
          <span key={l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--text2)" }}>
            <span style={{ width: 20, height: 2, background: c, display: "inline-block", borderRadius: 1 }} />{l}
          </span>
        ))}
      </div>
      <div ref={ref} style={{ width: "100%", height: 340 }} />
    </div>
  );
}
