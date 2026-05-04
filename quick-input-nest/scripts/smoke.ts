import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRouterClient } from "@orpc/server";
import { InputStorageService } from "../src/server/inputs/input-storage.service";
import { InputsController } from "../src/server/inputs/inputs.controller";
import { createAppRouter } from "../src/server/orpc/app.router";

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const tempDir = await mkdtemp(join(tmpdir(), "quick-input-nest-"));
const filePath = join(tempDir, "inputs.txt");

try {
  const storage = new InputStorageService(filePath, join(tempDir, "transformed.txt"), 10);
  const controller = new InputsController(storage);
  const client = createRouterClient(createAppRouter(controller));

  await client.inputs.add({ text: "  first  " });
  await client.inputs.add({ text: "   " });
  await client.inputs.add({ text: "second" });

  let entries = await client.inputs.list();
  assert(entries.length === 2, `Expected 2 entries, received ${entries.length}`);
  assert(entries[0]?.text === "second", "Newest entry should be first");
  assert(entries[1]?.text === "first", "Trimmed text should be persisted");

  await client.inputs.delete({ index: 0 });
  entries = await client.inputs.list();
  assert(entries.length === 1, `Expected 1 entry after deletion, received ${entries.length}`);
  assert(entries[0]?.text === "second", "Deleting absolute index 0 should keep the second row");

  const raw = await readFile(filePath, "utf-8");
  assert(raw === "second\n", `Unexpected file contents: ${JSON.stringify(raw)}`);

  let notFound = false;
  try {
    await client.inputs.delete({ index: 9 });
  } catch {
    notFound = true;
  }
  assert(notFound, "Expected missing delete to throw");

  console.log("Smoke test passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
