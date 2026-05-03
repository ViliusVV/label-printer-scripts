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
  assert(root.text.includes("manifest.webmanifest"), "Expected built client html to reference the PWA manifest");

  const manifest = await request(app.getHttpServer()).get("/manifest.webmanifest");
  assert(manifest.status === 200, `Expected manifest to be served, got ${manifest.status}`);

  const serviceWorker = await request(app.getHttpServer()).get("/sw.js");
  assert(serviceWorker.status === 200, `Expected service worker asset to be served, got ${serviceWorker.status}`);

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

  const queuedTodoId = "todo_e2e_client_generated";
  const queuedTimestamp = "2026-05-03T12:00:00.000Z";
  const createTodo = await request(app.getHttpServer())
    .post("/api/replication/todos/push")
    .send({
      mutations: [
        {
          op: "upsert",
          doc: {
            id: queuedTodoId,
            title: "Write docs",
            details: "Document sync sources",
            state: "Created",
            createdAt: queuedTimestamp,
            updatedAt: queuedTimestamp,
          },
        },
      ],
    });
  assert(createTodo.status === 201 || createTodo.status === 200, `Expected todo create to succeed, got ${createTodo.status}`);
  const todoId = queuedTodoId;

  const updateTodo = await request(app.getHttpServer())
    .post("/api/replication/todos/push")
    .send({
      mutations: [
        {
          op: "upsert",
          doc: {
            id: todoId,
            title: "Write docs",
            details: "Document sync sources",
            state: "Done",
            createdAt: queuedTimestamp,
            updatedAt: "2026-05-03T12:05:00.000Z",
          },
        },
      ],
    });
  assert(updateTodo.status === 201 || updateTodo.status === 200, `Expected todo update to succeed, got ${updateTodo.status}`);

  const todoList = await request(app.getHttpServer()).post("/api/replication/todos/pull").send({});
  assert(todoList.status === 201 || todoList.status === 200, `Expected todo list to succeed, got ${todoList.status}`);
  assert(todoList.body.items.some((todo: { id: string; state: string }) => todo.id === todoId && todo.state === "Done"), "Expected updated todo in list output");

  const deleteTodo = await request(app.getHttpServer()).post("/api/replication/todos/push").send({ mutations: [{ op: "delete", id: todoId }] });
  assert(deleteTodo.status === 201 || deleteTodo.status === 200, `Expected todo delete to succeed, got ${deleteTodo.status}`);

  const createNote = await request(app.getHttpServer())
    .post("/api/replication/notes/push")
    .send({ mutations: [{ op: "upsert", doc: { id: "note_e2e", name: "Demo note", body: "Shared general db", color: "green", createdAt: queuedTimestamp, updatedAt: queuedTimestamp } }] });
  assert(createNote.status === 201 || createNote.status === 200, `Expected note create to succeed, got ${createNote.status}`);

  const createBookmark = await request(app.getHttpServer())
    .post("/api/replication/bookmarks/push")
    .send({ mutations: [{ op: "upsert", doc: { id: "bookmark_e2e", name: "Solid", url: "https://www.solidjs.com", category: "Framework", createdAt: queuedTimestamp, updatedAt: queuedTimestamp } }] });
  assert(createBookmark.status === 201 || createBookmark.status === 200, `Expected bookmark create to succeed, got ${createBookmark.status}`);

  const createContact = await request(app.getHttpServer())
    .post("/api/replication/contacts/push")
    .send({ mutations: [{ op: "upsert", doc: { id: "contact_e2e", name: "Support", email: "support@example.com", company: "Acme", createdAt: queuedTimestamp, updatedAt: queuedTimestamp } }] });
  assert(createContact.status === 201 || createContact.status === 200, `Expected contact create to succeed, got ${createContact.status}`);

  const notesList = await request(app.getHttpServer()).post("/api/replication/notes/pull").send({});
  const bookmarksList = await request(app.getHttpServer()).post("/api/replication/bookmarks/pull").send({});
  const contactsList = await request(app.getHttpServer()).post("/api/replication/contacts/pull").send({});
  assert(notesList.status === 201 || notesList.status === 200, `Expected notes pull to succeed, got ${notesList.status}`);
  assert(bookmarksList.status === 201 || bookmarksList.status === 200, `Expected bookmarks pull to succeed, got ${bookmarksList.status}`);
  assert(contactsList.status === 201 || contactsList.status === 200, `Expected contacts pull to succeed, got ${contactsList.status}`);
  assert(notesList.body.items.length === 1, "Expected one note in shared general_db source");
  assert(bookmarksList.body.items.length === 1, "Expected one bookmark in shared general_db source");
  assert(contactsList.body.items.length === 1, "Expected one contact in shared general_db source");

  console.log("E2E test passed");
} finally {
  await app.close();
  await rm(tempDir, { recursive: true, force: true });
}

