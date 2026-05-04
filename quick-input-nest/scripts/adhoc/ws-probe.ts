// Probe WSS endpoint through Vite -> Nest -> Streamlit chain.

// Usage: NODE_TLS_REJECT_UNAUTHORIZED=0 bun run scripts/ws-probe.ts
const url = process.argv[2] ?? "wss://localhost:5174/streamlit/_stcore/stream";

const ws = new WebSocket(url);
const t0 = Date.now();
const timer = setTimeout(() => {
  console.log(`[${Date.now() - t0}ms] timeout`);
  ws.close();
  process.exit(1);
}, 8000);

ws.onopen = () => {
  console.log(`[${Date.now() - t0}ms] open`);
};
ws.onmessage = (e) => {
  console.log(`[${Date.now() - t0}ms] message`, typeof e.data, (e.data as string).slice?.(0, 80));
};
ws.onerror = (e) => {
  console.log(`[${Date.now() - t0}ms] error`, e);
};
ws.onclose = (e) => {
  console.log(`[${Date.now() - t0}ms] close code=${e.code} reason=${e.reason}`);
  clearTimeout(timer);
  process.exit(0);
};
