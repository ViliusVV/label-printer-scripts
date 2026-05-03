import { spawn, type Subprocess } from "bun";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dir = resolve(fileURLToPath(import.meta.url), "..");
const projectDir = resolve(__dir, "..");

function drainProc(proc: Subprocess, label: string) {
  const decoder = new TextDecoder();
  proc.stdout.pipeTo(new WritableStream({
    write(chunk) { process.stdout.write(`[${label}] ${typeof chunk === 'string' ? chunk : decoder.decode(chunk)}`); }
  })).catch(() => {});
  proc.stderr.pipeTo(new WritableStream({
    write(chunk) { process.stderr.write(`[${label}] ${typeof chunk === 'string' ? chunk : decoder.decode(chunk)}`); }
  })).catch(() => {});
}

async function waitForUrl(url: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 304) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

const VITE_PORT = 5173;
const NEST_PORT = 3333;
const VITE_URL = `http://127.0.0.1:${VITE_PORT}`;

let serverProc: Subprocess | null = null;
let clientProc: Subprocess | null = null;

async function cleanup() {
  if (serverProc) { serverProc.kill(); await new Promise(r => setTimeout(r, 500)); }
  if (clientProc) { clientProc.kill(); await new Promise(r => setTimeout(r, 500)); }
}

try {
  console.log("=== Starting dev:server (NestJS) ===");
  serverProc = spawn(["bun", "run", "dev:server"], {
    cwd: projectDir,
    stdio: ["ignore", "pipe", "pipe"],
  });
  drainProc(serverProc, "server");
  await waitForUrl(`http://127.0.0.1:${NEST_PORT}/trpc/inputs.list`);
  console.log("PASS: NestJS server started\n");

  console.log("=== Starting dev:client (Vite) ===");
  clientProc = spawn(["bun", "run", "dev:client"], {
    cwd: projectDir,
    stdio: ["ignore", "pipe", "pipe"],
  });
  drainProc(clientProc, "client");
  await waitForUrl(VITE_URL);
  console.log("PASS: Vite dev server started\n");

  await new Promise(r => setTimeout(r, 1000));

  const htmlRes = await fetch(VITE_URL);
  const html = await htmlRes.text();
  const hasHmr = html.includes("@vite/client");
  console.log(`HMR client in HTML: ${hasHmr ? "YES" : "NO"}`);

  // === Browser test ===
  console.log("\n=== Launching Chromium ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  try {
    console.log(`Navigating to ${VITE_URL} ...`);
    await page.goto(VITE_URL, { waitUntil: "networkidle", timeout: 15_000 });
    console.log(`Page title: "${await page.title()}"`);

    const inputEl = page.locator('input[placeholder="Type and press Enter"]');
    const inputCount = await inputEl.count();
    console.log(`Input field: ${inputCount > 0 ? "FOUND" : "NOT FOUND"}`);

    const noEntriesEl = page.getByText("No entries yet");
    const loadingEl = page.getByText("Loading…");
    console.log(`"No entries yet": ${await noEntriesEl.count() > 0 ? "YES" : "NO"}`);
    console.log(`"Loading…": ${await loadingEl.count() > 0 ? "YES" : "NO"}`);

    if (inputCount > 0) {
      console.log("\n=== Testing add entry via UI ===");
      await inputEl.fill("dev-e2e-browser-test");
      await inputEl.press("Enter");
      await page.waitForTimeout(1500);

      const entryText = page.getByText("dev-e2e-browser-test");
      const entryFound = await entryText.count() > 0;
      console.log(`Entry appeared in UI: ${entryFound ? "YES" : "NO"}`);

      const trpcRes = await fetch(`http://127.0.0.1:${NEST_PORT}/trpc/inputs.list`);
      const trpcJson = await trpcRes.json();
      const entries = trpcJson?.result?.data ?? [];
      const serverHas = entries.some((e: any) => e.text === "dev-e2e-browser-test");
      console.log(`Entry confirmed via tRPC: ${serverHas ? "YES" : "NO"} (${entries.length} total)`);

      if (serverHas) {
        const entry = entries.find((e: any) => e.text === "dev-e2e-browser-test");
        await fetch(`http://127.0.0.1:${NEST_PORT}/trpc/inputs.delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ index: entry.index }),
        });
      }
    }

    console.log("\n=== Summary ===");
    const failures: string[] = [];
    if (inputCount === 0) failures.push("Input field not rendered");
    if (!hasHmr) failures.push("No HMR client script in HTML");
    if (pageErrors.length > 0) {
      console.log(`Page JS errors (${pageErrors.length}):`);
      for (const e of pageErrors) console.log(`  - ${e}`);
      failures.push(`${pageErrors.length} JS error(s) on page`);
    }
    if (consoleErrors.length > 0) {
      console.log(`Console errors (${consoleErrors.length}):`);
      for (const e of consoleErrors) console.log(`  - ${e}`);
    }

    if (failures.length === 0) {
      console.log("ALL CHECKS PASSED — dev mode is working correctly");
    } else {
      console.log("FAILURES DETECTED:");
      for (const f of failures) console.log(`  - ${f}`);
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
} catch (err) {
  console.error("FATAL:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
} finally {
  await cleanup();
}
