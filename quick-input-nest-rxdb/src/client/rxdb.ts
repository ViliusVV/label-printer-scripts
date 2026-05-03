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

type SortSpec = Array<Record<string, "asc" | "desc">>;

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

const createSyncHelpers = <K extends keyof CollectionMap>(config: {
  name: K;
  list: () => Promise<CollectionMap[K][]>;
  sort: SortSpec;
}) => ({
  sync: async (): Promise<CollectionMap[K][]> => {
    const items = await config.list();
    await replaceCollection(config.name, items);
    return items;
  },
  watch: (onItems: (items: CollectionMap[K][]) => void) => watchCollection(config.name, config.sort, onItems),
});

const createCrudEntityHelpers = <K extends keyof CollectionMap, CreateBody, UpdateBody>(config: {
  sync: () => Promise<CollectionMap[K][]>;
  watch: (onItems: (items: CollectionMap[K][]) => void) => Promise<() => void>;
  create: (body: CreateBody) => Promise<unknown>;
  update: (body: UpdateBody) => Promise<unknown>;
  remove: (id: string) => Promise<void>;
}) => ({
  sync: config.sync,
  watch: config.watch,
  createEntry: async (body: CreateBody): Promise<void> => {
    await config.create(body);
    await config.sync();
  },
  updateEntry: async (body: UpdateBody): Promise<void> => {
    await config.update(body);
    await config.sync();
  },
  deleteEntry: async (id: string): Promise<void> => {
    await config.remove(id);
    await config.sync();
  },
});

const createTextEntityHelpers = <K extends keyof CollectionMap>(config: {
  sync: () => Promise<CollectionMap[K][]>;
  watch: (onItems: (items: CollectionMap[K][]) => void) => Promise<() => void>;
  create: (text: string) => Promise<unknown>;
  remove: (index: number) => Promise<void>;
}) => ({
  sync: config.sync,
  watch: config.watch,
  createEntry: async (text: string): Promise<void> => {
    await config.create(text);
    await config.sync();
  },
  removeEntry: async (index: number): Promise<void> => {
    await config.remove(index);
    await config.sync();
  },
});

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

const inputsSync = createSyncHelpers({ name: "inputs", list: listInputs, sort: [{ index: "desc" }] });
const todosSync = createSyncHelpers({ name: "todos", list: listTodos, sort: [{ updatedAt: "desc" }] });
const notesSync = createSyncHelpers({ name: "notes", list: listNotes, sort: [{ updatedAt: "desc" }] });
const bookmarksSync = createSyncHelpers({ name: "bookmarks", list: listBookmarks, sort: [{ updatedAt: "desc" }] });
const contactsSync = createSyncHelpers({ name: "contacts", list: listContacts, sort: [{ updatedAt: "desc" }] });

const inputsEntity = createTextEntityHelpers({
  ...inputsSync,
  create: (text: string) => addInput({ text }),
  remove: (index: number) => deleteInput({ index }),
});

const todosEntity = createCrudEntityHelpers<"todos", CreateTodoBody, UpdateTodoBody>({
  ...todosSync,
  create: createTodo,
  update: updateTodo,
  remove: (id: string) => deleteTodo({ id }),
});

const notesEntity = createCrudEntityHelpers<"notes", CreateNoteBody, UpdateNoteBody>({
  ...notesSync,
  create: createNote,
  update: updateNote,
  remove: (id: string) => deleteNote({ id }),
});

const bookmarksEntity = createCrudEntityHelpers<"bookmarks", CreateBookmarkBody, UpdateBookmarkBody>({
  ...bookmarksSync,
  create: createBookmark,
  update: updateBookmark,
  remove: (id: string) => deleteBookmark({ id }),
});

const contactsEntity = createCrudEntityHelpers<"contacts", CreateContactBody, UpdateContactBody>({
  ...contactsSync,
  create: createContact,
  update: updateContact,
  remove: (id: string) => deleteContact({ id }),
});

export const syncInputs = inputsEntity.sync;
export const watchInputs = inputsEntity.watch;
export const createInputEntry = inputsEntity.createEntry;
export const removeInputEntry = inputsEntity.removeEntry;

export const syncTodos = todosEntity.sync;
export const watchTodos = todosEntity.watch;
export const createTodoEntry = todosEntity.createEntry;
export const updateTodoEntry = todosEntity.updateEntry;
export const deleteTodoEntry = todosEntity.deleteEntry;

export const syncNotes = notesEntity.sync;
export const watchNotes = notesEntity.watch;
export const createNoteEntry = notesEntity.createEntry;
export const updateNoteEntry = notesEntity.updateEntry;
export const deleteNoteEntry = notesEntity.deleteEntry;

export const syncBookmarks = bookmarksEntity.sync;
export const watchBookmarks = bookmarksEntity.watch;
export const createBookmarkEntry = bookmarksEntity.createEntry;
export const updateBookmarkEntry = bookmarksEntity.updateEntry;
export const deleteBookmarkEntry = bookmarksEntity.deleteEntry;

export const syncContacts = contactsEntity.sync;
export const watchContacts = contactsEntity.watch;
export const createContactEntry = contactsEntity.createEntry;
export const updateContactEntry = contactsEntity.updateEntry;
export const deleteContactEntry = contactsEntity.deleteEntry;

