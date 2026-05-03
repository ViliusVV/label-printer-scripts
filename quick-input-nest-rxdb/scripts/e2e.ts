import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import request from "supertest";

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const tempDir = await mkdtemp(join(tmpdir(), "quick-input-nest-rxdb-e2e-"));
const filePath = join(tempDir, "inputs.txt");

process.env.INPUTS_FILE = filePath;

const [{ bootstrap }] = await Promise.all([import("../src/server/main")]);

await writeFile(filePath, "", "utf-8");

const app = await bootstrap({ host: "127.0.0.1", port: 3301 });

try {
  const root = await request(app.getHttpServer()).get("/");
  assert(root.status === 200, `Expected root route to succeed, got ${root.status}`);
  assert(root.text.includes("<div id=\"root\"></div>"), "Expected built client index.html");

  const add = await request(app.getHttpServer()).post("/api/inputs/add").send({ text: "nest-rxdb-e2e-entry" });
  assert(add.status === 201 || add.status === 200, `Expected add to succeed, got ${add.status}`);

  const list = await request(app.getHttpServer()).get("/api/inputs/list");
  assert(list.status === 200, `Expected list to succeed, got ${list.status}`);
  assert(Array.isArray(list.body), "Expected list response body to be an array");
  assert(list.body.some((entry: { text: string }) => entry.text === "nest-rxdb-e2e-entry"), "Expected created entry in list output");

  const created = list.body.find((entry: { text: string }) => entry.text === "nest-rxdb-e2e-entry") as { index: number } | undefined;
  if (!created) {
    throw new Error("Expected to locate the inserted entry for cleanup");
  }

  const remove = await request(app.getHttpServer()).post("/api/inputs/delete").send({ index: created.index });
  assert(remove.status === 201 || remove.status === 200, `Expected delete to succeed, got ${remove.status}`);

  console.log("E2E test passed");
} finally {
  await app.close();
  await rm(tempDir, { recursive: true, force: true });
}

