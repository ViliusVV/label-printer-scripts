import SqliteWorker from "./sqlite-worker?worker";

export type SqliteRow = {
  id: number;
  text: string;
  transformed: string;
  created_at: number;
};

type PendingResolver = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

let worker: Worker | null = null;
let counter = 0;
const pending = new Map<string, PendingResolver>();

function ensureWorker(): Worker {
  if (worker) return worker;
  const w = new SqliteWorker();
  w.onmessage = (e: MessageEvent<{ id: string; result?: unknown; error?: string }>) => {
    const { id, result, error } = e.data;
    const r = pending.get(id);
    if (!r) return;
    pending.delete(id);
    if (error !== undefined) r.reject(new Error(error));
    else r.resolve(result);
  };
  w.onerror = (e) => {
    const message = e.message || "sqlite worker error";
    for (const [id, r] of pending) {
      pending.delete(id);
      r.reject(new Error(message));
    }
  };
  worker = w;
  return w;
}

function call<T>(req: unknown, transfer: Transferable[] = []): Promise<T> {
  const w = ensureWorker();
  const id = `${++counter}`;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    w.postMessage({ id, req }, transfer);
  });
}

export const sqliteList = (): Promise<SqliteRow[]> => call({ type: "list" });

export const sqliteAdd = (text: string, transformed: string): Promise<{ ok: true }> =>
  call({ type: "add", text, transformed });

export const sqliteDelete = (id: number): Promise<{ ok: true }> =>
  call({ type: "delete", id });

export const sqliteClear = (): Promise<{ ok: true }> => call({ type: "clear" });

export async function sqliteExportBlob(): Promise<Uint8Array> {
  const result = await call<{ bytes: Uint8Array }>({ type: "exportBlob" });
  return result.bytes;
}

export const sqliteImportBlob = (bytes: Uint8Array): Promise<{ ok: true }> =>
  call({ type: "importBlob", bytes }, [bytes.buffer]);
