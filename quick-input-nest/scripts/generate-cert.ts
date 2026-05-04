import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import selfsigned from "selfsigned";

const here = dirname(fileURLToPath(import.meta.url));
const certDir = join(here, "..", "certs");
const certPath = join(certDir, "cert.pem");
const keyPath = join(certDir, "key.pem");

function lanIPv4s(): string[] {
  const ips = new Set<string>(["127.0.0.1"]);
  for (const ifaces of Object.values(networkInterfaces())) {
    if (!ifaces) continue;
    for (const iface of ifaces) {
      if (iface.family === "IPv4" && !iface.internal) {
        ips.add(iface.address);
      }
    }
  }
  return [...ips];
}

export async function ensureCert(): Promise<{ cert: string; key: string }> {
  if (existsSync(certPath) && existsSync(keyPath)) {
    return {
      cert: readFileSync(certPath, "utf8"),
      key: readFileSync(keyPath, "utf8"),
    };
  }

  const ips = lanIPv4s();
  const altNames: { type: 1 | 2 | 6 | 7; value?: string; ip?: string }[] = [
    { type: 2, value: "localhost" },
    ...ips.map((ip) => ({ type: 7 as const, ip })),
  ];

  const pems = await selfsigned.generate(
    [{ name: "commonName", value: "quick-input-nest dev" }],
    {
      keySize: 2048,
      algorithm: "sha256",
      extensions: [
        { name: "basicConstraints", cA: false },
        { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
        { name: "extKeyUsage", serverAuth: true },
        { name: "subjectAltName", altNames },
      ],
    },
  );

  mkdirSync(certDir, { recursive: true });
  writeFileSync(certPath, pems.cert);
  writeFileSync(keyPath, pems.private);

  console.log(`[generate-cert] wrote ${certPath}`);
  console.log(`[generate-cert] SANs: localhost, ${ips.join(", ")}`);
  console.log("[generate-cert] delete certs/ and rerun if your LAN IP changes.");

  return { cert: pems.cert, key: pems.private };
}

if (import.meta.main) {
  await ensureCert();
}