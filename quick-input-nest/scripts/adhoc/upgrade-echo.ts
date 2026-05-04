import { createHash } from "node:crypto";
import { createServer } from "node:http";

const server = createServer();
server.on("upgrade", (req, socket) => {
  console.log("upgrade:", req.url, "headers:", req.headers["sec-websocket-key"]);
  const key = req.headers["sec-websocket-key"] as string;
  const accept = createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  const resp = [
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    "",
  ].join("\r\n");
  console.log("writing 101");
  socket.write(resp, (err) => {
    console.log("write callback err=", err, "writable=", socket.writable, "destroyed=", socket.destroyed);
  });
});
server.listen(3399, () => console.log("upgrade-echo on 3399"));
