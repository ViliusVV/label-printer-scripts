import { ORPCError } from "@orpc/client";
import Dexie, { type Table } from "dexie";
import { createSignal } from "solid-js";
import type { RouterOutputs } from "../../shared/api";
import { orpc } from "../orpc";

export type ServerEntry = RouterOutputs["inputs"]["list"][number];

export type OutboxOp =
  | { id: string; kind: "add"; text: string; createdAt: number }
  | { id: string; kind: "delete"; text: string; createdAt: number }
  | { id: string; kind: "clear"; createdAt: number };

class InputsDexieDb extends Dexie {
  cache!: Table<ServerEntry, number>;
  outbox!: Table<OutboxOp, string>;

  constructor() {
    super("quick-input-dexie");
    this.version(1).stores({
      cache: "&index",
      outbox: "&id, createdAt",
    });
  }
}

export const db = new InputsDexieDb();

export type DisplayEntry = ServerEntry & {
  pending?: boolean;
  outboxId?: string;
};

const [lastServerSyncAtSignal, setLastServerSyncAt] = createSignal(0);
export const lastServerSyncAt = lastServerSyncAtSignal;

export type SyncError = { message: string; source: string; at: number };
const [lastErrorSignal, setLastErrorInternal] = createSignal<SyncError | null>(null);
export const lastError = lastErrorSignal;
export const clearLastError = (): void => {
  setLastErrorInternal(null);
};
const recordError = (source: string, err: unknown): void => {
  const message = err instanceof Error ? err.message : String(err);
  setLastErrorInternal({ message, source, at: Date.now() });
};

export type ReplayResult = { replayed: number; remaining: number; at: number };
const [lastReplaySignal, setLastReplay] = createSignal<ReplayResult | null>(null);
export const lastReplay = lastReplaySignal;

export const isNetworkError = (err: unknown): boolean => !(err instanceof ORPCError);

const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

let syntheticIndex = -1;
const nextSyntheticIndex = (): number => syntheticIndex--;

async function readState(): Promise<{ cache: ServerEntry[]; outbox: OutboxOp[] }> {
  const [cache, outbox] = await Promise.all([
    db.cache.toArray(),
    db.outbox.orderBy("createdAt").toArray(),
  ]);
  // server `list` returns newest-first; keep that order in cache too
  cache.sort((a, b) => b.index - a.index);
  return { cache, outbox };
}

function applyOutbox(cache: ServerEntry[], outbox: OutboxOp[]): DisplayEntry[] {
  let entries: DisplayEntry[] = cache.map((e) => ({ ...e }));
  for (const op of outbox) {
    if (op.kind === "clear") {
      entries = [];
    } else if (op.kind === "delete") {
      const idx = entries.findIndex((e) => e.text === op.text);
      if (idx >= 0) entries.splice(idx, 1);
    } else {
      entries = [
        { index: nextSyntheticIndex(), text: op.text, pending: true, outboxId: op.id },
        ...entries,
      ];
    }
  }
  return entries;
}

async function rewriteCache(items: ServerEntry[]): Promise<void> {
  await db.transaction("rw", db.cache, async () => {
    await db.cache.clear();
    if (items.length > 0) await db.cache.bulkAdd(items);
  });
}

export async function replayOutbox(): Promise<void> {
  const ops = await db.outbox.orderBy("createdAt").toArray();
  if (ops.length === 0) return;

  let serverList: ServerEntry[] | null = null;
  let replayed = 0;

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    try {
      if (op.kind === "add") {
        await orpc.inputs.add({ text: op.text });
        await db.outbox.delete(op.id);
        replayed++;
        serverList = null;
      } else if (op.kind === "clear") {
        await orpc.inputs.clear();
        await db.outbox.delete(op.id);
        replayed++;
        serverList = null;
      } else {
        if (!serverList) serverList = await orpc.inputs.list();
        const found = serverList.find((e) => e.text === op.text);
        if (found) {
          try {
            await orpc.inputs.delete({ index: found.index });
          } catch (err) {
            if (!(err instanceof ORPCError && err.code === "NOT_FOUND")) throw err;
          }
        }
        await db.outbox.delete(op.id);
        replayed++;
        serverList = null;
      }
    } catch (err) {
      if (isNetworkError(err)) {
        // Offline — leave the rest of the outbox for later.
        break;
      }
      recordError(`replay:${op.kind}`, err);
      // App-level error: drop the op so we don't loop forever on it.
      await db.outbox.delete(op.id);
    }
  }

  const remaining = await db.outbox.count();
  setLastReplay({ replayed, remaining, at: Date.now() });
}

export async function fetchView(): Promise<DisplayEntry[]> {
  try {
    await replayOutbox();
    const fresh = await orpc.inputs.list();
    await rewriteCache(fresh);
    setLastServerSyncAt(Date.now());
    const { outbox } = await readState();
    return applyOutbox(fresh, outbox);
  } catch (err) {
    if (!isNetworkError(err)) {
      recordError("fetchView", err);
      throw err;
    }
    const { cache, outbox } = await readState();
    return applyOutbox(cache, outbox);
  }
}

export async function addEntry(text: string): Promise<void> {
  try {
    await orpc.inputs.add({ text });
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    await db.outbox.add({ id: newId(), kind: "add", text, createdAt: Date.now() });
  }
}

export async function deleteEntry(entry: DisplayEntry): Promise<void> {
  if (entry.pending && entry.outboxId) {
    await db.outbox.delete(entry.outboxId);
    return;
  }
  try {
    await orpc.inputs.delete({ index: entry.index });
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    await db.outbox.add({
      id: newId(),
      kind: "delete",
      text: entry.text,
      createdAt: Date.now(),
    });
  }
}

export async function clearEntries(): Promise<void> {
  try {
    await orpc.inputs.clear();
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    await db.outbox.add({ id: newId(), kind: "clear", createdAt: Date.now() });
  }
}
