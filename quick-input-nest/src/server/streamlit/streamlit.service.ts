import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";

import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  LABEL_PRINTER_DIR,
  STREAMLIT_BASE_PATH,
  STREAMLIT_HOST,
  STREAMLIT_IDLE_MS,
  STREAMLIT_PORT,
  STREAMLIT_READY_TIMEOUT_MS,
} from "../config";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function venvPython(): string {
  if (process.env.STREAMLIT_PYTHON) return process.env.STREAMLIT_PYTHON;
  const winPath = join(LABEL_PRINTER_DIR, ".venv", "Scripts", "python.exe");
  const nixPath = join(LABEL_PRINTER_DIR, ".venv", "bin", "python");
  if (process.platform === "win32" && existsSync(winPath)) return winPath;
  if (existsSync(nixPath)) return nixPath;
  return process.platform === "win32" ? winPath : nixPath;
}

@Injectable()
export class StreamlitManagerService implements OnModuleDestroy {
  private readonly log = new Logger("StreamlitManager");
  private process: ChildProcessByStdio<null, Readable, Readable> | null = null;
  private startingPromise: Promise<void> | null = null;
  private activeSessions = 0;
  private idleTimer: NodeJS.Timeout | null = null;

  readonly target = `http://${STREAMLIT_HOST}:${STREAMLIT_PORT}`;
  readonly basePath = `/${STREAMLIT_BASE_PATH}`;

  async ensureStarted(): Promise<void> {
    if (this.process && !this.startingPromise) return;
    if (this.startingPromise) return this.startingPromise;
    this.startingPromise = this.start().finally(() => {
      this.startingPromise = null;
    });
    return this.startingPromise;
  }

  acquire(): void {
    this.activeSessions += 1;
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.log.debug(`acquire -> active=${this.activeSessions}`);
  }

  release(): void {
    this.activeSessions = Math.max(0, this.activeSessions - 1);
    this.log.debug(`release -> active=${this.activeSessions}`);
    if (this.activeSessions === 0 && this.process) {
      this.scheduleStop();
    }
  }

  private scheduleStop(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.log.log(`No active sessions; will stop Streamlit in ${STREAMLIT_IDLE_MS}ms`);
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.activeSessions === 0) {
        void this.stop("idle");
      }
    }, STREAMLIT_IDLE_MS);
  }

  private async start(): Promise<void> {
    const python = venvPython();
    const args = [
      "-m",
      "streamlit",
      "run",
      "src/label_printer/app/main.py",
      "--server.port",
      String(STREAMLIT_PORT),
      "--server.address",
      STREAMLIT_HOST,
      "--server.headless",
      "true",
      "--server.enableXsrfProtection",
      "false",
      "--server.enableCORS",
      "false",
      "--server.baseUrlPath",
      STREAMLIT_BASE_PATH,
      "--browser.gatherUsageStats",
      "false",
    ];

    this.log.log(`Spawning Streamlit: ${python} ${args.join(" ")} (cwd=${LABEL_PRINTER_DIR})`);

    const proc = spawn(python, args, {
      cwd: LABEL_PRINTER_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }) as ChildProcessByStdio<null, Readable, Readable>;

    proc.stdout.on("data", (chunk: Buffer) => {
      const msg = chunk.toString().trim();
      if (msg) this.log.log(msg);
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      const msg = chunk.toString().trim();
      if (msg) this.log.warn(msg);
    });
    proc.on("exit", (code, signal) => {
      this.log.log(`Streamlit exited (code=${code} signal=${signal})`);
      if (this.process === proc) this.process = null;
    });
    proc.on("error", (err) => {
      this.log.error(`Streamlit spawn error: ${err.message}`);
      if (this.process === proc) this.process = null;
    });

    this.process = proc;

    try {
      await this.waitForReady();
    } catch (err) {
      this.log.error(`Streamlit not ready: ${(err as Error).message}`);
      await this.stop("start-failed");
      throw err;
    }

    // No iframe attached yet — schedule an idle shutdown so a stray HTTP probe
    // doesn't keep the process alive. acquire() will cancel this on first WS.
    if (this.activeSessions === 0) this.scheduleStop();
  }

  private async waitForReady(): Promise<void> {
    const deadline = Date.now() + STREAMLIT_READY_TIMEOUT_MS;
    const url = `${this.target}${this.basePath}/_stcore/health`;
    while (Date.now() < deadline) {
      if (!this.process) throw new Error("Streamlit process exited before ready");
      try {
        const res = await fetch(url);
        if (res.ok) return;
      } catch {
        // not yet listening
      }
      await sleep(300);
    }
    throw new Error(`Streamlit health check timed out at ${url}`);
  }

  private async stop(reason: string): Promise<void> {
    const proc = this.process;
    if (!proc) return;
    this.process = null;
    this.log.log(`Stopping Streamlit (${reason}, pid=${proc.pid})`);

    if (process.platform === "win32" && proc.pid !== undefined) {
      try {
        spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { windowsHide: true });
      } catch (err) {
        this.log.warn(`taskkill failed: ${(err as Error).message}`);
      }
    } else {
      try {
        proc.kill("SIGTERM");
      } catch (err) {
        this.log.warn(`SIGTERM failed: ${(err as Error).message}`);
      }
      setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {
          // already dead
        }
      }, 5000);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    await this.stop("shutdown");
  }
}
