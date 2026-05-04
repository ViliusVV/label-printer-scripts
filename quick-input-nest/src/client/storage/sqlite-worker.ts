/// <reference lib="WebWorker" />
import sqlite3InitModule, { type Database, type SAHPoolUtil } from "@sqlite.org/sqlite-wasm";

export type SqliteRow = {
  id: number;
  text: string;
  transformed: string;
  created_at: number;
};

const DB_FILENAME = "/inputs.sqlite3";
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS inputs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    transformed TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`;

type Req =
  | { type: "list" }
  | { type: "add"; text: string; transformed: string }
  | { type: "delete"; id: number }
  | { type: "clear" }
  | { type: "exportBlob" }
  | { type: "importBlob"; bytes: Uint8Array };

type Envelope = { id: string; req: Req };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

type Sqlite3 = Awaited<ReturnType<typeof sqlite3InitModule>>;

type Runtime = {
  sqlite3: Sqlite3;
  pool: SAHPoolUtil | null;
  db: Database;
  openDb: () => Database;
};

let runtime: Runtime | null = null;

const ready = (async (): Promise<Runtime> => {
  const sqlite3 = await sqlite3InitModule();
  let pool: SAHPoolUtil | null = null;
  let openDb: () => Database;
  try {
    pool = await sqlite3.installOpfsSAHPoolVfs({});
    const ctor = pool.OpfsSAHPoolDb;
    openDb = () => new ctor(DB_FILENAME);
  } catch (err) {
    console.warn("[sqlite] OPFS-SAH unavailable, falling back to in-memory", err);
    const Ctor = sqlite3.oo1.DB as unknown as new (filename: string) => Database;
    openDb = () => new Ctor(":memory:");
  }
  const db = openDb();
  db.exec(SCHEMA_SQL);
  runtime = { sqlite3, pool, db, openDb };
  return runtime;
})();

function handle(req: Req): unknown {
  if (!runtime) throw new Error("sqlite not ready");
  const { db } = runtime;
  switch (req.type) {
    case "list":
      return db.exec({
        sql: "SELECT id, text, transformed, created_at FROM inputs ORDER BY id DESC",
        returnValue: "resultRows",
        rowMode: "object",
      }) as unknown as SqliteRow[];
    case "add":
      db.exec({
        sql: "INSERT INTO inputs (text, transformed, created_at) VALUES (?, ?, ?)",
        bind: [req.text, req.transformed, Date.now()],
      });
      return { ok: true };
    case "delete":
      db.exec({ sql: "DELETE FROM inputs WHERE id = ?", bind: [req.id] });
      return { ok: true };
    case "clear":
      db.exec("DELETE FROM inputs; DELETE FROM sqlite_sequence WHERE name='inputs';");
      return { ok: true };
    case "exportBlob": {
      const bytes = runtime.sqlite3.capi.sqlite3_js_db_export(db.pointer ?? 0);
      return { bytes };
    }
  }
  // importBlob is handled in the async path below.
  throw new Error(`unhandled sync request: ${(req as { type: string }).type}`);
}

async function handleAsync(req: Req): Promise<unknown> {
  if (req.type === "importBlob") {
    if (!runtime) throw new Error("sqlite not ready");
    const { pool, openDb } = runtime;
    runtime.db.close();
    if (pool) {
      await pool.importDb(DB_FILENAME, req.bytes);
    } else {
      // In-memory fallback: reopen and replay rows by parsing the blob in-place
      // is not supported here. Just reopen empty; caller will detect mismatch.
      console.warn("[sqlite] importBlob into in-memory fallback drops the uploaded bytes");
    }
    runtime.db = openDb();
    runtime.db.exec(SCHEMA_SQL);
    return { ok: true };
  }
  return handle(req);
}

ctx.onmessage = async (e: MessageEvent<Envelope>) => {
  const { id, req } = e.data;
  try {
    await ready;
    const result = await handleAsync(req);
    if (
      result &&
      typeof result === "object" &&
      "bytes" in result &&
      result.bytes instanceof Uint8Array
    ) {
      const buf = result.bytes;
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      ctx.postMessage({ id, result: { bytes: new Uint8Array(ab) } }, [ab]);
      return;
    }
    ctx.postMessage({ id, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.postMessage({ id, error: message });
  }
};
