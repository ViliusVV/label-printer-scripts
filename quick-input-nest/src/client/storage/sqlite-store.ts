import { transformInput } from "../../shared/transform";
import { orpc } from "../orpc";
import {
  type SqliteRow,
  sqliteAdd,
  sqliteClear,
  sqliteDelete,
  sqliteExportBlob,
  sqliteImportBlob,
  sqliteList,
} from "./sqlite-client";

export type SqliteEntry = SqliteRow;

export const listEntries = (): Promise<SqliteEntry[]> => sqliteList();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, Math.min(i + chunk, bytes.length)) as unknown as number[],
    );
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function syncFromServer(): Promise<SqliteEntry[]> {
  const { blob } = await orpc.inputs.sync.download();
  const bytes = base64ToBytes(blob);
  await sqliteImportBlob(bytes);
  return sqliteList();
}

async function pushBlobToServer(): Promise<void> {
  const bytes = await sqliteExportBlob();
  await orpc.inputs.sync.upload({ blob: bytesToBase64(bytes) });
}

export async function addEntry(rawText: string): Promise<void> {
  const text = rawText.trim();
  if (!text) return;
  const transformed = transformInput(text);
  if (transformed === null) {
    throw new Error("Cant transform");
  }
  await sqliteAdd(text, transformed);
  await pushBlobToServer();
}

export async function deleteEntry(id: number): Promise<void> {
  await sqliteDelete(id);
  await pushBlobToServer();
}

export async function clearEntries(): Promise<void> {
  await sqliteClear();
  await pushBlobToServer();
}
