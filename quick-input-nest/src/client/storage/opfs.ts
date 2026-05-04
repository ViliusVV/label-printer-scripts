import type { RouterOutputs } from "../../shared/api";

export type ServerEntry = RouterOutputs["inputs"]["list"][number];

export type OutboxOp =
  | { id: string; kind: "add"; text: string }
  | { id: string; kind: "delete"; text: string }
  | { id: string; kind: "clear" };

const CACHE_FILE = "server-cache.json";
const OUTBOX_FILE = "outbox.json";

const dir = (): Promise<FileSystemDirectoryHandle> => navigator.storage.getDirectory();

async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    const handle = await (await dir()).getFileHandle(name);
    const file = await handle.getFile();
    const text = await file.text();
    return text ? (JSON.parse(text) as T) : fallback;
  } catch (err) {
    if (err instanceof DOMException && err.name === "NotFoundError") return fallback;
    throw err;
  }
}

async function writeJson(name: string, value: unknown): Promise<void> {
  const handle = await (await dir()).getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(value));
  await writable.close();
}

export const readCache = (): Promise<ServerEntry[]> => readJson(CACHE_FILE, []);
export const writeCache = (items: ServerEntry[]): Promise<void> => writeJson(CACHE_FILE, items);

export const readOutbox = (): Promise<OutboxOp[]> => readJson(OUTBOX_FILE, []);
export const writeOutbox = (ops: OutboxOp[]): Promise<void> => writeJson(OUTBOX_FILE, ops);

export async function appendOutbox(op: OutboxOp): Promise<void> {
  const ops = await readOutbox();
  ops.push(op);
  await writeOutbox(ops);
}

export async function removeOutboxById(id: string): Promise<void> {
  const ops = await readOutbox();
  await writeOutbox(ops.filter((op) => op.id !== id));
}
