import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRouterClient } from "@orpc/server";
import request from "supertest";

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const tempDir = await mkdtemp(join(tmpdir(), "quick-input-nest-e2e-"));
const filePath = join(tempDir, "inputs.txt");

process.env.INPUTS_FILE = filePath;

const [{ InputStorageService }, { bootstrap }, { appRouter }] = await Promise.all([
  import("../src/server/inputs/input-storage.service"),
  import("../src/server/main"),
  import("../src/server/orpc/app.router"),
]);

await writeFile(filePath, "", "utf-8");

const app = await bootstrap({ host: "127.0.0.1", port: 3301 });

try {
  const root = await request(app.getHttpServer()).get("/");
  assert(root.status === 200, `Expected root route to succeed, got ${root.status}`);
  assert(root.text.includes("<div id=\"root\"></div>"), "Expected built client index.html");

  const storage = app.get(InputStorageService);
  const client = createRouterClient(appRouter, { context: { inputs: storage } });

  await client.inputs.add({ text: "nest-e2e-entry" });

  const entries = await client.inputs.list();
  assert(Array.isArray(entries), "Expected oRPC list to return an array of entries");
  assert(entries.some((entry) => entry.text === "nest-e2e-entry"), "Expected new entry in list output");

  const created = entries.find((entry) => entry.text === "nest-e2e-entry");
  if (!created) {
    throw new Error("Expected to locate the inserted entry for cleanup");
  }

  await client.inputs.delete({ index: created.index });

  console.log("E2E test passed");
} finally {
  await app.close();
  await rm(tempDir, { recursive: true, force: true });
}
