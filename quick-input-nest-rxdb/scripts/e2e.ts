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
const inputsFile = join(tempDir, "inputs.txt");
const todosFile = join(tempDir, "todo.json");
const generalDbFile = join(tempDir, "general_db.json");

process.env.INPUTS_FILE = inputsFile;
process.env.TODOS_FILE = todosFile;
process.env.GENERAL_DB_FILE = generalDbFile;

const [{ bootstrap }] = await Promise.all([import("../src/server/main")]);

await writeFile(inputsFile, "", "utf-8");
await writeFile(todosFile, "[]\n", "utf-8");
await writeFile(generalDbFile, '{"notes":[],"bookmarks":[],"contacts":[]}\n', "utf-8");

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

  const createTodo = await request(app.getHttpServer())
    .post("/api/todos/create")
    .send({ title: "Write docs", details: "Document sync sources", state: "Created" });
  assert(createTodo.status === 201 || createTodo.status === 200, `Expected todo create to succeed, got ${createTodo.status}`);
  const todoId = createTodo.body.id as string | undefined;
  assert(Boolean(todoId), "Expected created todo id");

  const updateTodo = await request(app.getHttpServer())
    .post("/api/todos/update")
    .send({ id: todoId, title: "Write docs", details: "Document sync sources", state: "Done" });
  assert(updateTodo.status === 201 || updateTodo.status === 200, `Expected todo update to succeed, got ${updateTodo.status}`);

  const todoList = await request(app.getHttpServer()).get("/api/todos/list");
  assert(todoList.status === 200, `Expected todo list to succeed, got ${todoList.status}`);
  assert(todoList.body.some((todo: { id: string; state: string }) => todo.id === todoId && todo.state === "Done"), "Expected updated todo in list output");

  const deleteTodo = await request(app.getHttpServer()).post("/api/todos/delete").send({ id: todoId });
  assert(deleteTodo.status === 201 || deleteTodo.status === 200, `Expected todo delete to succeed, got ${deleteTodo.status}`);

  const createNote = await request(app.getHttpServer())
    .post("/api/notes/create")
    .send({ name: "Demo note", body: "Shared general db", color: "green" });
  assert(createNote.status === 201 || createNote.status === 200, `Expected note create to succeed, got ${createNote.status}`);

  const createBookmark = await request(app.getHttpServer())
    .post("/api/bookmarks/create")
    .send({ name: "Solid", url: "https://www.solidjs.com", category: "Framework" });
  assert(createBookmark.status === 201 || createBookmark.status === 200, `Expected bookmark create to succeed, got ${createBookmark.status}`);

  const createContact = await request(app.getHttpServer())
    .post("/api/contacts/create")
    .send({ name: "Support", email: "support@example.com", company: "Acme" });
  assert(createContact.status === 201 || createContact.status === 200, `Expected contact create to succeed, got ${createContact.status}`);

  const notesList = await request(app.getHttpServer()).get("/api/notes/list");
  const bookmarksList = await request(app.getHttpServer()).get("/api/bookmarks/list");
  const contactsList = await request(app.getHttpServer()).get("/api/contacts/list");
  assert(notesList.body.length === 1, "Expected one note in shared general_db source");
  assert(bookmarksList.body.length === 1, "Expected one bookmark in shared general_db source");
  assert(contactsList.body.length === 1, "Expected one contact in shared general_db source");

  console.log("E2E test passed");
} finally {
  await app.close();
  await rm(tempDir, { recursive: true, force: true });
}

