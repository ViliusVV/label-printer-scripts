// Raw TCP-level WS handshake — bypasses any WebSocket client library.
// Sends an HTTP upgrade and reads bytes; prints whatever comes back.
// Usage: bun run scripts/adhoc/raw-ws-probe.ts <host> <port> [path]
import { connect } from "node:net";
import { randomBytes } from "node:crypto";

const host = process.argv[2] ?? "127.0.0.1";
const port = Number.parseInt(process.argv[3] ?? "3399", 10);
const path = process.argv[4] ?? "/test";
const key = randomBytes(16).toString("base64");

const t0 = Date.now();
const sock = connect(port, host, () => {
  console.log(`[${Date.now() - t0}ms] tcp connected`);
  const handshake = [
    `GET ${path} HTTP/1.1`,
    `Host: ${host}:${port}`,
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Key: ${key}`,
    "Sec-WebSocket-Version: 13",
    "",
    "",
  ].join("\r\n");
  sock.write(handshake);
});
sock.on("data", (b) => console.log(`[${Date.now() - t0}ms] data ${b.length}B:\n${b.toString()}`));
sock.on("error", (e) => console.log(`[${Date.now() - t0}ms] error: ${e.message}`));
sock.on("close", () => {
  console.log(`[${Date.now() - t0}ms] closed`);
  process.exit(0);
});
setTimeout(() => {
  console.log(`[${Date.now() - t0}ms] timeout, closing`);
  sock.destroy();
}, 4000);
