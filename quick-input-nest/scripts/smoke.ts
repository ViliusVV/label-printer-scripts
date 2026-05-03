import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { InputStorageService } from "../src/server/inputs/input-storage.service";
import { createAppRouter } from "../src/server/trpc/app.router";

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const tempDir = await mkdtemp(join(tmpdir(), "quick-input-nest-"));
const filePath = join(tempDir, "inputs.txt");

try {
  const storage = new InputStorageService(filePath, 10);
  const caller = createAppRouter(storage).createCaller({});

  await caller.inputs.add({ text: "  first  " });
  await caller.inputs.add({ text: "   " });
  await caller.inputs.add({ text: "second" });

  let entries = await caller.inputs.list();
  assert(entries.length === 2, `Expected 2 entries, received ${entries.length}`);
  assert(entries[0]?.text === "second", "Newest entry should be first");
  assert(entries[1]?.text === "first", "Trimmed text should be persisted");

  await caller.inputs.delete({ index: 0 });
  entries = await caller.inputs.list();
  assert(entries.length === 1, `Expected 1 entry after deletion, received ${entries.length}`);
  assert(entries[0]?.text === "second", "Deleting absolute index 0 should keep the second row");

  const raw = await readFile(filePath, "utf-8");
  assert(raw === "second\n", `Unexpected file contents: ${JSON.stringify(raw)}`);

  let notFound = false;
  try {
    await caller.inputs.delete({ index: 9 });
  } catch {
    notFound = true;
  }
  assert(notFound, "Expected missing delete to throw");

  console.log("Smoke test passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

