import { ORPCError } from "@orpc/client";
import { createSignal } from "solid-js";
import { orpc } from "./orpc";
import * as storage from "./storage/opfs";
import type { OutboxOp, ServerEntry } from "./storage/opfs";

const [lastServerSyncAtSignal, setLastServerSyncAt] = createSignal(0);
export const lastServerSyncAt = lastServerSyncAtSignal;

export type DisplayEntry = ServerEntry & {
  pending?: boolean;
  outboxId?: string;
};

const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const isNetworkError = (err: unknown): boolean => !(err instanceof ORPCError);

let syntheticIndex = -1;
const nextSyntheticIndex = (): number => syntheticIndex--;

export function applyOutbox(cache: ServerEntry[], outbox: OutboxOp[]): DisplayEntry[] {
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

export async function replayOutbox(): Promise<void> {
  const ops = await storage.readOutbox();
  if (ops.length === 0) return;

  const remaining: OutboxOp[] = [];
  let serverList: ServerEntry[] | null = null;

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    try {
      if (op.kind === "add") {
        await orpc.inputs.add({ text: op.text });
        serverList = null;
      } else if (op.kind === "clear") {
        await orpc.inputs.clear();
        serverList = null;
      } else {
        if (!serverList) serverList = await orpc.inputs.list();
        const found = serverList.find((e) => e.text === op.text);
        if (found) {
          try {
            await orpc.inputs.delete({ index: found.index });
            serverList = null;
          } catch (err) {
            if (err instanceof ORPCError && err.code === "NOT_FOUND") {
              serverList = null;
            } else {
              throw err;
            }
          }
        }
      }
    } catch (err) {
      if (isNetworkError(err)) {
        remaining.push(...ops.slice(i));
        break;
      }
    }
  }

  await storage.writeOutbox(remaining);
}

export async function fetchView(): Promise<DisplayEntry[]> {
  try {
    await replayOutbox();
    const fresh = await orpc.inputs.list();
    await storage.writeCache(fresh);
    return applyOutbox(fresh, await storage.readOutbox());
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    const [cache, outbox] = await Promise.all([storage.readCache(), storage.readOutbox()]);
    return applyOutbox(cache, outbox);
  }
}

export async function addEntry(text: string): Promise<void> {
  try {
    await orpc.inputs.add({ text });
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    await storage.appendOutbox({ id: newId(), kind: "add", text });
  }
}

export async function deleteEntry(entry: DisplayEntry): Promise<void> {
  if (entry.pending && entry.outboxId) {
    await storage.removeOutboxById(entry.outboxId);
    return;
  }
  try {
    await orpc.inputs.delete({ index: entry.index });
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    await storage.appendOutbox({ id: newId(), kind: "delete", text: entry.text });
  }
}

export async function clearEntries(): Promise<void> {
  try {
    await orpc.inputs.clear();
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    await storage.appendOutbox({ id: newId(), kind: "clear" });
  }
}
