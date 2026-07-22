import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
const WS = "ws://localhost:8000/ws/live";

export default function useLiveData(activeIndex) {
  const [candles,    setCandles]    = useState([]);
  const [signal,     setSignal]     = useState({ signal:"WAIT" });
  const [indicators, setIndicators] = useState({});
  const [fibonacci,  setFibonacci]  = useState({});
  const [trend,      setTrend]      = useState({});
  const [fiiDii,     setFiiDii]     = useState({});
  const [connected,  setConnected]  = useState(false);
  const [authError,  setAuthError]  = useState(null);
  const [refreshSeconds, setRefreshSecondsState] = useState(5);
  const alive = useRef(true);
  const wsRef = useRef(null);
  const pingRef = useRef(null);

  const connect = useCallback(() => {
    if (!alive.current) return;
    axios.get("/auth/status").then(r => {
      if (!r.data.authenticated) { setAuthError(r.data); return; }
      setAuthError(null); openWs();
    }).catch(openWs);
  }, []); // eslint-disable-line

  function openWs() {
    const ws = new WebSocket(WS); wsRef.current = ws;
    ws.onopen  = () => { setConnected(true); pingRef.current = setInterval(() => ws.readyState===1&&ws.send("ping"),25000); };
    ws.onclose = () => { setConnected(false); clearInterval(pingRef.current); if(alive.current) setTimeout(connect,3000); };
    ws.onerror = () => setConnected(false);
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        // Closed-candle broadcasts append to history; partial (fast-refresh)
        // broadcasts only refresh the live signal/indicator readout so the
        // pattern/signal checklist doesn't wait on the full 1-min bar.
        if (d.candle && !d.partial) setCandles(prev => { const ex=prev.some(c=>c.time===d.candle.time); return ex?prev.map(c=>c.time===d.candle.time?d.candle:c):[...prev,d.candle]; });
        if (d.signal)     setSignal(d.signal);
        if (d.indicators) setIndicators(d.indicators);
        if (d.fibonacci)  setFibonacci(d.fibonacci);
        if (d.trend)      setTrend(d.trend);
        if (d.fii_dii)    setFiiDii(d.fii_dii);
        if (d.refresh_seconds) setRefreshSecondsState(d.refresh_seconds);
      } catch {}
    };
  }

  useEffect(() => {
    axios.get("/data/indicators").then(r => {
      if (r.data.candles?.length) setCandles(r.data.candles);
      if (r.data.fibonacci) setFibonacci(r.data.fibonacci);
      if (r.data.trend)     setTrend(r.data.trend);
    }).catch(()=>{});
    axios.get("/data/refresh-interval").then(r => {
      if (r.data.refresh_seconds) setRefreshSecondsState(r.data.refresh_seconds);
    }).catch(()=>{});
  }, [activeIndex]);

  useEffect(() => {
    alive.current = true; connect();
    return () => { alive.current=false; clearInterval(pingRef.current); wsRef.current?.close(); };
  }, [connect]);

  const setRefreshSeconds = useCallback(async (secs) => {
    setRefreshSecondsState(secs);
    try { await axios.post(`/data/refresh-interval?seconds=${secs}`); } catch {}
  }, []);

  return { candles, signal, indicators, fibonacci, trend, fiiDii, connected, authError, refreshSeconds, setRefreshSeconds };
}
