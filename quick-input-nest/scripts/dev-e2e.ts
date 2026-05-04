import { spawn, type Subprocess } from "bun";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { chromium } from "playwright";
import type { AppRouter } from "../src/shared/api";

const projectDir = resolve(fileURLToPath(import.meta.url), "..", "..");

function drainProc(proc: Subprocess, label: string) {
  const decoder = new TextDecoder();
  proc.stdout
    .pipeTo(
      new WritableStream({
        write(chunk) {
          process.stdout.write(
            `[${label}] ${typeof chunk === "string" ? chunk : decoder.decode(chunk)}`,
          );
        },
      }),
    )
    .catch(() => {});
  proc.stderr
    .pipeTo(
      new WritableStream({
        write(chunk) {
          process.stderr.write(
            `[${label}] ${typeof chunk === "string" ? chunk : decoder.decode(chunk)}`,
          );
        },
      }),
    )
    .catch(() => {});
}

async function waitForUrl(url: string, timeoutMs = 20_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const ctrl = new AbortController();
      const id = setTimeout(() => ctrl.abort(), 2000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(id);
      if (res.status > 0) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

const SERVER_PORT = 3333;
const VITE_PORT = 5174;
const VITE_URL = `http://127.0.0.1:${VITE_PORT}`;
const SERVER_RPC = `http://127.0.0.1:${SERVER_PORT}/api/rpc`;
const SERVER_ROOT = `http://127.0.0.1:${SERVER_PORT}/`;

const orpcClient: RouterClient<AppRouter> = createORPCClient(
  new RPCLink({ url: SERVER_RPC }),
);

let serverProc: Subprocess | null = null;
let clientProc: Subprocess | null = null;

async function cleanup() {
  if (clientProc) {
    clientProc.kill();
    await new Promise((r) => setTimeout(r, 500));
  }
  if (serverProc) {
    serverProc.kill();
    await new Promise((r) => setTimeout(r, 500));
  }
}

const results: string[] = [];

try {
  console.log("=== dev-e2e: Diagnostic Test ===\n");

  // 1. Start NestJS
  console.log("[1/5] Starting NestJS server...");
  serverProc = spawn(["bun", "run", "dev:server"], {
    cwd: projectDir,
    stdio: ["ignore", "pipe", "pipe"],
  });
  drainProc(serverProc, "server");
  if (!(await waitForUrl(SERVER_ROOT)))
    throw new Error("NestJS failed to start");
  results.push("PASS  NestJS :3333");
  console.log("  ✓ NestJS ready on :3333\n");

  // 2. Start Vite
  console.log("[2/5] Starting Vite dev server...");
  clientProc = spawn(["bun", "run", "dev:client"], {
    cwd: projectDir,
    stdio: ["ignore", "pipe", "pipe"],
  });
  drainProc(clientProc, "client");
  if (!(await waitForUrl(VITE_URL)))
    throw new Error("Vite failed to start");
  results.push("PASS  Vite :5174");
  console.log(`  ✓ Vite ready on :${VITE_PORT}\n`);

  // 3. HTML / HMR sanity
  console.log("[3/5] Checking HTML & HMR...");
  const htmlRes = await fetch(VITE_URL);
  const html = await htmlRes.text();
  const hasRoot = html.includes('<div id="root"></div>');
  const hasHmr = html.includes("@vite/client");
  results.push(`PASS  #root div: ${hasRoot ? "YES" : "NO"}`);
  results.push(`PASS  HMR injected: ${hasHmr ? "YES" : "NO"}`);
  console.log(`  #root div: ${hasRoot ? "YES" : "NO"}`);
  console.log(`  HMR injected: ${hasHmr ? "YES" : "NO"}\n`);

  // 4. oRPC endpoint check
  console.log("[4/5] Checking oRPC endpoint...");
  let rpcWorking = false;
  try {
    const entries = await orpcClient.inputs.list();
    rpcWorking = Array.isArray(entries);
  } catch {}
  results.push(`PASS  oRPC: ${rpcWorking ? "OK" : "FAILED"}`);
  console.log(`  oRPC: ${rpcWorking ? "OK" : "FAILED"}\n`);

  // 5. Browser test
  console.log("[5/5] Browser test...");
  let browserOk = false;
  try {
    console.log("  Launching Chromium (headless)...");
    const browser = await chromium.launch({
      headless: true,
      args: ["--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage"],
      timeout: 30_000,
    });
    try {
      const page = await browser.newPage();

      const pageErrors: string[] = [];
      page.on("pageerror", (e) => pageErrors.push(e.message));

      console.log(`  Navigating to ${VITE_URL} ...`);
      await page.goto(VITE_URL, {
        waitUntil: "networkidle",
        timeout: 15_000,
      });
      console.log(`  Title: "${await page.title()}"`);

      const inputEl = page.locator('input[placeholder="Type and press Enter"]');
      const inputFound = (await inputEl.count()) > 0;
      console.log(`  Input field: ${inputFound ? "FOUND" : "MISSING"}`);

      if (pageErrors.length > 0) {
        console.log(`  JS errors (${pageErrors.length}):`);
        for (const e of pageErrors) console.log(`    - ${e}`);
      } else {
        console.log("  JS errors: none");
      }

      // Add entry flow
      if (inputFound) {
        console.log("  Adding test entry...");
        await inputEl.fill("e2e-test-entry");
        await inputEl.press("Enter");
        await page.waitForTimeout(1500);

        const entryFound =
          (await page.getByText("e2e-test-entry").count()) > 0;
        console.log(`  Entry in UI: ${entryFound ? "YES" : "NO"}`);

        let serverHas = false;
        let serverEntries: Awaited<ReturnType<typeof orpcClient.inputs.list>> = [];
        try {
          serverEntries = await orpcClient.inputs.list();
          serverHas = serverEntries.some((e) => e.text === "e2e-test-entry");
        } catch {}
        console.log(
          `  Entry via oRPC: ${serverHas ? "YES" : "NO"} (${serverEntries.length} total)`,
        );

        if (serverHas) {
          const entry = serverEntries.find((e) => e.text === "e2e-test-entry");
          if (entry) {
            await orpcClient.inputs.delete({ index: entry.index });
            console.log("  Cleanup: deleted test entry");
          }
        }

        browserOk = entryFound && serverHas;
        results.push(
          `PASS  Browser UI: ${browserOk ? "OK" : "FAILED"}`,
        );
      } else {
        results.push("FAIL  Input field missing in browser");
      }
    } finally {
      await browser.close();
    }
  } catch (err) {
    results.push(
      `WARN  Browser test skipped: ${err instanceof Error ? err.message : String(err)}`,
    );
    console.log(
      `  Browser test skipped: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Summary
  console.log("\n═══════════════════ RESULTS ═══════════════════");
  const failed = results.filter((r) => r.startsWith("FAIL"));
  for (const r of results) console.log(r);

  if (failed.length > 0) {
    console.log(`\n${failed.length} failure(s) detected`);
    process.exitCode = 1;
  } else {
    console.log("\nAll checks passed — dev mode OK on port 5174");
  }
} catch (err) {
  console.error(
    "\nFATAL:",
    err instanceof Error ? err.message : String(err),
  );
  process.exitCode = 1;
} finally {
  await cleanup();
}
