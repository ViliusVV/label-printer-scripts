import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GeneralDbService } from "../src/server/general-db/general-db.service";
import { InputsController } from "../src/server/inputs/inputs.controller";
import { InputStorageService } from "../src/server/inputs/input-storage.service";
import { JsonReplicationController } from "../src/server/replication/json-replication.controller";
import { JsonReplicationService } from "../src/server/replication/json-replication.service";
import { TodosController } from "../src/server/todos/todos.controller";
import { TodosService } from "../src/server/todos/todos.service";

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const tempDir = await mkdtemp(join(tmpdir(), "quick-input-nest-rxdb-"));
const inputsFile = join(tempDir, "inputs.txt");
const todosFile = join(tempDir, "todo.json");
const generalDbFile = join(tempDir, "general_db.json");

try {
  const inputStorage = new InputStorageService(inputsFile, 10);
  const inputs = new InputsController(inputStorage);
  const todosService = new TodosService(todosFile);
  const todos = new TodosController(todosService);
  const generalDb = new GeneralDbService(generalDbFile);
  const replication = new JsonReplicationController(new JsonReplicationService(todosService, generalDb));

  await inputs.add({ text: "  first  " });
  await inputs.add({ text: "   " });
  await inputs.add({ text: "second" });

  let entries = await inputs.list();
  assert(entries.length === 2, `Expected 2 entries, received ${entries.length}`);
  assert(entries[0]?.text === "second", "Newest entry should be first");
  assert(entries[1]?.text === "first", "Trimmed text should be persisted");

  await inputs.delete({ index: 0 });
  entries = await inputs.list();
  assert(entries.length === 1, `Expected 1 entry after deletion, received ${entries.length}`);
  assert(entries[0]?.text === "second", "Deleting absolute index 0 should keep the second row");

  const raw = await readFile(inputsFile, "utf-8");
  assert(raw === "second\n", `Unexpected file contents: ${JSON.stringify(raw)}`);

  let notFound = false;
  try {
    await inputs.delete({ index: 9 });
  } catch {
    notFound = true;
  }
  assert(notFound, "Expected missing delete to throw");

  const createdTodo = await todos.create({ title: "Ship PWA", details: "Make offline first work", state: "Created" });
  await replication.push("todos", { mutations: [{ op: "upsert", doc: { ...createdTodo, state: "InProgress" as const } }] });
  const todoPull = (await replication.pull("todos", {})) as { items: Array<{ state: string }> };
  assert(todoPull.items[0]?.state === "InProgress", "Todo push upsert should change state");
  await replication.push("todos", { mutations: [{ op: "delete", id: createdTodo.id }] });
  assert(((await replication.pull("todos", {})) as { items: unknown[] }).items.length === 0, "Expected todo delete mutation to empty the list");

  await replication.push("notes", { mutations: [{ op: "upsert", doc: { id: "note_1", name: "Idea", body: "Shared general db", color: "violet", createdAt: "2026-05-03T12:00:00.000Z", updatedAt: "2026-05-03T12:00:00.000Z" } }] });
  await replication.push("notes", { mutations: [{ op: "upsert", doc: { id: "note_1", name: "Idea", body: "Updated body", color: "violet", createdAt: "2026-05-03T12:00:00.000Z", updatedAt: "2026-05-03T12:05:00.000Z" } }] });
  assert(((await replication.pull("notes", {})) as { items: Array<{ body: string }> }).items[0]?.body === "Updated body", "Note upsert should persist");
  await replication.push("notes", { mutations: [{ op: "delete", id: "note_1" }] });
  assert(((await replication.pull("notes", {})) as { items: unknown[] }).items.length === 0, "Expected note deletion to empty the list");

  await replication.push("bookmarks", { mutations: [{ op: "upsert", doc: { id: "bookmark_1", name: "RxDB", url: "https://rxdb.info", category: "Docs", createdAt: "2026-05-03T12:00:00.000Z", updatedAt: "2026-05-03T12:00:00.000Z" } }] });
  await replication.push("bookmarks", { mutations: [{ op: "upsert", doc: { id: "bookmark_1", name: "RxDB Docs", url: "https://rxdb.info", category: "Docs", createdAt: "2026-05-03T12:00:00.000Z", updatedAt: "2026-05-03T12:05:00.000Z" } }] });
  assert(((await replication.pull("bookmarks", {})) as { items: Array<{ name: string }> }).items[0]?.name === "RxDB Docs", "Bookmark upsert should persist");
  await replication.push("bookmarks", { mutations: [{ op: "delete", id: "bookmark_1" }] });
  assert(((await replication.pull("bookmarks", {})) as { items: unknown[] }).items.length === 0, "Expected bookmark deletion to empty the list");

  await replication.push("contacts", { mutations: [{ op: "upsert", doc: { id: "contact_1", name: "Vilius", email: "vilius@example.com", company: "Label Printer", createdAt: "2026-05-03T12:00:00.000Z", updatedAt: "2026-05-03T12:00:00.000Z" } }] });
  await replication.push("contacts", { mutations: [{ op: "upsert", doc: { id: "contact_1", name: "Vilius L.", email: "vilius@example.com", company: "Label Printer", createdAt: "2026-05-03T12:00:00.000Z", updatedAt: "2026-05-03T12:05:00.000Z" } }] });
  assert(((await replication.pull("contacts", {})) as { items: Array<{ name: string }> }).items[0]?.name === "Vilius L.", "Contact upsert should persist");
  await replication.push("contacts", { mutations: [{ op: "delete", id: "contact_1" }] });
  assert(((await replication.pull("contacts", {})) as { items: unknown[] }).items.length === 0, "Expected contact deletion to empty the list");

  console.log("Smoke test passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

