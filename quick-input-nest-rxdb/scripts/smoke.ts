import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BookmarksController } from "../src/server/general-db/bookmarks.controller";
import { ContactsController } from "../src/server/general-db/contacts.controller";
import { GeneralDbService } from "../src/server/general-db/general-db.service";
import { NotesController } from "../src/server/general-db/notes.controller";
import { InputsController } from "../src/server/inputs/inputs.controller";
import { InputStorageService } from "../src/server/inputs/input-storage.service";
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
  const todos = new TodosController(new TodosService(todosFile));
  const generalDb = new GeneralDbService(generalDbFile);
  const notes = new NotesController(generalDb);
  const bookmarks = new BookmarksController(generalDb);
  const contacts = new ContactsController(generalDb);

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
  const updatedTodo = await todos.update({ id: createdTodo.id, title: "Ship PWA", details: "Wire service worker later", state: "InProgress" });
  assert(updatedTodo.state === "InProgress", "Todo update should change state");
  assert((await todos.list()).length === 1, "Expected a todo to be listed");
  await todos.delete({ id: createdTodo.id });
  assert((await todos.list()).length === 0, "Expected todo deletion to empty the list");

  const createdNote = await notes.create({ name: "Idea", body: "Use one shared json file", color: "violet" });
  const updatedNote = await notes.update({ id: createdNote.id, name: "Idea", body: "Updated body", color: "violet" });
  assert(updatedNote.body === "Updated body", "Note update should persist");
  await notes.delete({ id: createdNote.id });
  assert((await notes.list()).length === 0, "Expected note deletion to empty the list");

  const createdBookmark = await bookmarks.create({ name: "RxDB", url: "https://rxdb.info", category: "Docs" });
  const updatedBookmark = await bookmarks.update({ id: createdBookmark.id, name: "RxDB Docs", url: "https://rxdb.info", category: "Docs" });
  assert(updatedBookmark.name === "RxDB Docs", "Bookmark update should persist");
  await bookmarks.delete({ id: createdBookmark.id });
  assert((await bookmarks.list()).length === 0, "Expected bookmark deletion to empty the list");

  const createdContact = await contacts.create({ name: "Vilius", email: "vilius@example.com", company: "Label Printer" });
  const updatedContact = await contacts.update({ id: createdContact.id, name: "Vilius L.", email: "vilius@example.com", company: "Label Printer" });
  assert(updatedContact.name === "Vilius L.", "Contact update should persist");
  await contacts.delete({ id: createdContact.id });
  assert((await contacts.list()).length === 0, "Expected contact deletion to empty the list");

  console.log("Smoke test passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

