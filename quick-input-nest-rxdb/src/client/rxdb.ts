import { createRxDatabase, type RxCollection, type RxDatabase } from "rxdb";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import {
  addInput,
  createBookmark,
  createContact,
  createNote,
  createTodo,
  deleteBookmark,
  deleteContact,
  deleteInput,
  deleteNote,
  deleteTodo,
  listBookmarks,
  listContacts,
  listInputs,
  listNotes,
  listTodos,
  updateBookmark,
  updateContact,
  updateNote,
  updateTodo,
} from "./api";
import {
  bookmarkCollectionSchema,
  type BookmarkItem,
  type ContactItem,
  contactCollectionSchema,
  type CreateBookmarkBody,
  type CreateContactBody,
  type CreateNoteBody,
  type CreateTodoBody,
  inputCollectionSchema,
  type InputItem,
  noteCollectionSchema,
  type NoteItem,
  todoCollectionSchema,
  type TodoItem,
  type UpdateBookmarkBody,
  type UpdateContactBody,
  type UpdateNoteBody,
  type UpdateTodoBody,
} from "../shared/contracts";

type AppCollections = {
  inputs: RxCollection<InputItem>;
  todos: RxCollection<TodoItem>;
  notes: RxCollection<NoteItem>;
  bookmarks: RxCollection<BookmarkItem>;
  contacts: RxCollection<ContactItem>;
};

type CollectionMap = {
  inputs: InputItem;
  todos: TodoItem;
  notes: NoteItem;
  bookmarks: BookmarkItem;
  contacts: ContactItem;
};

let dbPromise: Promise<RxDatabase<AppCollections>> | undefined;

const getDatabase = async (): Promise<RxDatabase<AppCollections>> => {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await createRxDatabase<AppCollections>({
        name: "quick-input-nest-rxdb",
        storage: getRxStorageDexie(),
        ignoreDuplicate: true,
      });

      await db.addCollections({
        inputs: { schema: inputCollectionSchema },
        todos: { schema: todoCollectionSchema },
        notes: { schema: noteCollectionSchema },
        bookmarks: { schema: bookmarkCollectionSchema },
        contacts: { schema: contactCollectionSchema },
      });

      return db;
    })();
  }

  return dbPromise;
};

const getCollection = async <K extends keyof CollectionMap>(name: K): Promise<RxCollection<CollectionMap[K]>> => {
  const db = await getDatabase();
  return db.collections[name] as unknown as RxCollection<CollectionMap[K]>;
};

const replaceCollection = async <K extends keyof CollectionMap>(name: K, items: CollectionMap[K][]): Promise<void> => {
  const collection = await getCollection(name);
  const docs = await collection.find().exec();
  await Promise.all(docs.map((doc) => doc.remove()));
  if (items.length > 0) {
    await collection.bulkInsert(items);
  }
};

const watchCollection = async <K extends keyof CollectionMap>(
  name: K,
  sort: Array<Record<string, "asc" | "desc">>,
  onItems: (items: CollectionMap[K][]) => void,
): Promise<() => void> => {
  const collection = await getCollection(name);
  const query = collection.find({ sort: sort as never });
  const subscription = query.$.subscribe((docs) => {
    onItems(docs.map((doc) => doc.toJSON() as CollectionMap[K]));
  });
  return () => subscription.unsubscribe();
};

export const syncInputs = async (): Promise<InputItem[]> => {
  const items = await listInputs();
  await replaceCollection("inputs", items);
  return items;
};

export const syncTodos = async (): Promise<TodoItem[]> => {
  const items = await listTodos();
  await replaceCollection("todos", items);
  return items;
};

export const syncNotes = async (): Promise<NoteItem[]> => {
  const items = await listNotes();
  await replaceCollection("notes", items);
  return items;
};

export const syncBookmarks = async (): Promise<BookmarkItem[]> => {
  const items = await listBookmarks();
  await replaceCollection("bookmarks", items);
  return items;
};

export const syncContacts = async (): Promise<ContactItem[]> => {
  const items = await listContacts();
  await replaceCollection("contacts", items);
  return items;
};

export const watchInputs = (onItems: (items: InputItem[]) => void) => watchCollection("inputs", [{ index: "desc" }], onItems);
export const watchTodos = (onItems: (items: TodoItem[]) => void) => watchCollection("todos", [{ updatedAt: "desc" }], onItems);
export const watchNotes = (onItems: (items: NoteItem[]) => void) => watchCollection("notes", [{ updatedAt: "desc" }], onItems);
export const watchBookmarks = (onItems: (items: BookmarkItem[]) => void) => watchCollection("bookmarks", [{ updatedAt: "desc" }], onItems);
export const watchContacts = (onItems: (items: ContactItem[]) => void) => watchCollection("contacts", [{ updatedAt: "desc" }], onItems);

export const createInputEntry = async (text: string): Promise<void> => {
  await addInput({ text });
  await syncInputs();
};

export const removeInputEntry = async (index: number): Promise<void> => {
  await deleteInput({ index });
  await syncInputs();
};

export const createTodoEntry = async (body: CreateTodoBody): Promise<void> => {
  await createTodo(body);
  await syncTodos();
};

export const updateTodoEntry = async (body: UpdateTodoBody): Promise<void> => {
  await updateTodo(body);
  await syncTodos();
};

export const deleteTodoEntry = async (id: string): Promise<void> => {
  await deleteTodo({ id });
  await syncTodos();
};

export const createNoteEntry = async (body: CreateNoteBody): Promise<void> => {
  await createNote(body);
  await syncNotes();
};

export const updateNoteEntry = async (body: UpdateNoteBody): Promise<void> => {
  await updateNote(body);
  await syncNotes();
};

export const deleteNoteEntry = async (id: string): Promise<void> => {
  await deleteNote({ id });
  await syncNotes();
};

export const createBookmarkEntry = async (body: CreateBookmarkBody): Promise<void> => {
  await createBookmark(body);
  await syncBookmarks();
};

export const updateBookmarkEntry = async (body: UpdateBookmarkBody): Promise<void> => {
  await updateBookmark(body);
  await syncBookmarks();
};

export const deleteBookmarkEntry = async (id: string): Promise<void> => {
  await deleteBookmark({ id });
  await syncBookmarks();
};

export const createContactEntry = async (body: CreateContactBody): Promise<void> => {
  await createContact(body);
  await syncContacts();
};

export const updateContactEntry = async (body: UpdateContactBody): Promise<void> => {
  await updateContact(body);
  await syncContacts();
};

export const deleteContactEntry = async (id: string): Promise<void> => {
  await deleteContact({ id });
  await syncContacts();
};

