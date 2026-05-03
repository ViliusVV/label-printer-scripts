import { spawn, type Subprocess } from "bun";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dir = resolve(fileURLToPath(import.meta.url), "..");
const projectDir = resolve(__dir, "..");

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

function waitForProcess(proc: Subprocess, label: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    proc.exited.then((code) => {
      if (code !== 0) reject(new Error(`${label} exited with code ${code}`));
      else resolve();
    });
  });
}

async function waitForUrl(url: string, timeoutMs = 15_000): Promise<void> {
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
const NEST_TRPC_URL = `http://127.0.0.1:${NEST_PORT}/trpc/inputs.list`;

console.log("=== dev-e2e: Starting dev server ===");

const dev = spawn(["bun", "run", "dev"], {
  cwd: projectDir,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, FORCE_COLOR: "0" },
});

const output: string[] = [];
const stderr: string[] = [];

dev.stdout.pipeTo(
  new WritableStream({
    write(chunk) {
      const text = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
      output.push(text);
    },
  }),
);
dev.stderr.pipeTo(
  new WritableStream({
    write(chunk) {
      const text = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
      stderr.push(text);
    },
  }),
);

try {
  const serverReady = waitForUrl(NEST_TRPC_URL);
  const clientReady = waitForUrl(VITE_URL);

  await Promise.all([serverReady, clientReady]);

  // Give a tiny extra moment for Solid to mount
  await new Promise((r) => setTimeout(r, 1500));

  const trpcResponse = await fetch(NEST_TRPC_URL);
  assert(trpcResponse.ok, `Nest tRPC endpoint returned status ${trpcResponse.status}`);
  const trpcJson = await trpcResponse.json();
  const trpcOk = trpcJson && "result" in trpcJson;
  console.log(`PASS: Nest tRPC endpoint OK, result=${JSON.stringify(trpcJson.result?.data ? `[...${trpcJson.result.data.length} entries]` : trpcJson.result)}`);

  const htmlResponse = await fetch(VITE_URL);
  assert(htmlResponse.ok, `Vite HTML page returned status ${htmlResponse.status}`);
  const html = await htmlResponse.text();
  assert(html.includes('<div id="root"></div>'), "Vite HTML missing #root div");

  // HMR check: Vite injects its client script for HMR
  const hasHmrClient = html.includes("@vite/client") || html.includes("vite/client");
  console.log(`HMR client in HTML: ${hasHmrClient ? "YES" : "NO"}`);

  console.log("PASS: Vite serves index.html with #root div");

  // === Browser test ===
  console.log("\n=== Starting browser test ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture console errors from the page
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  const pageConsole: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") pageConsole.push(`[${msg.type()}] ${msg.text()}`);
  });

  await page.goto(VITE_URL, { waitUntil: "networkidle", timeout: 10_000 });

  const title = await page.title();
  console.log(`Page title: "${title}"`);

  // Check for key elements
  const inputEl = page.locator('input[placeholder="Type and press Enter"]');
  const inputCount = await inputEl.count();
  console.log(`Input field found: ${inputCount > 0 ? "YES" : "NO"}`);
  assert(inputCount > 0, "Input field not found");

  // Check for "No entries yet" fallback
  const noEntriesEl = page.getByText("No entries yet");
  const loadingEl = page.getByText("Loading…");
  const hasNoEntries = (await noEntriesEl.count()) > 0;
  const hasLoading = (await loadingEl.count()) > 0;
  console.log(`"No entries yet" text: ${hasNoEntries ? "YES" : "NO"}`);
  console.log(`"Loading…" text: ${hasLoading ? "YES" : "NO"}`);

  if (pageErrors.length > 0) {
    console.error(`\nPAGE ERRORS (${pageErrors.length}):`);
    for (const err of pageErrors) console.error(`  - ${err}`);
  }
  if (pageConsole.length > 0) {
    console.log(`\nPAGE CONSOLE ERRORS (${pageConsole.length}):`);
    for (const msg of pageConsole) console.log(`  - ${msg}`);
  }

  // Try adding an entry
  console.log("\n=== Testing add entry ===");
  await inputEl.fill("dev-e2e test entry");
  await inputEl.press("Enter");
  await page.waitForTimeout(1000);

  // Check if entry appeared
  const entryText = page.getByText("dev-e2e test entry");
  const entryCount = await entryText.count();
  console.log(`Entry appeared in list: ${entryCount > 0 ? "YES" : "NO"}`);

  // Verify via tRPC
  const listResponse = await fetch(NEST_TRPC_URL);
  const listJson = await listResponse.json();
  const entries = listJson?.result?.data ?? [];
  const hasEntry = entries.some((e: any) => e.text === "dev-e2e test entry");
  console.log(`Entry confirmed via tRPC: ${hasEntry ? "YES" : "NO"} (${entries.length} total)`);

  if (hasEntry) {
    // Clean up
    const entry = entries.find((e: any) => e.text === "dev-e2e test entry");
    const deleteRes = await fetch(`http://127.0.0.1:${NEST_PORT}/trpc/inputs.delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index: entry.index }),
    });
    console.log(`Cleanup delete: ${deleteRes.ok ? "OK" : "FAILED"}`);
  }

  await browser.close();

  console.log("\n=== Summary ===");
  const failures: string[] = [];
  if (inputCount === 0) failures.push("Input field not found in browser");
  if (!hasHmrClient) failures.push("Vite HMR client script missing from HTML");
  if (pageErrors.length > 0) failures.push(`Page had ${pageErrors.length} JS errors`);
  if (entryCount === 0) failures.push("Adding entry via UI failed");
  if (trpcOk === false) failures.push("tRPC endpoint not working");

  if (failures.length === 0) {
    console.log("ALL CHECKS PASSED - dev mode is working correctly");
  } else {
    console.error("FAILURES DETECTED:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  }
} catch (err) {
  console.error("FATAL ERROR:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
} finally {
  dev.kill();
  await new Promise((r) => setTimeout(r, 500));
}
