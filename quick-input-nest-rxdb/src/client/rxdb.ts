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
  createId,
  nowIso,
} from "../shared/contracts";

type SortSpec = Array<Record<string, "asc" | "desc">>;
type CrudEntityKey = "todos" | "notes" | "bookmarks" | "contacts";
type MutationAction = "create" | "update" | "delete";

type SyncState = {
  online: boolean;
  pending: number;
  processing: boolean;
  lastError: string | null;
};

type OutboxMutation = {
  id: string;
  entity: CrudEntityKey;
  action: MutationAction;
  payloadJson: string;
  enqueuedAt: string;
  attempts: number;
  lastError: string;
};

type AppCollections = {
  inputs: RxCollection<InputItem>;
  todos: RxCollection<TodoItem>;
  notes: RxCollection<NoteItem>;
  bookmarks: RxCollection<BookmarkItem>;
  contacts: RxCollection<ContactItem>;
  outbox: RxCollection<OutboxMutation>;
};

type CollectionMap = {
  inputs: InputItem;
  todos: TodoItem;
  notes: NoteItem;
  bookmarks: BookmarkItem;
  contacts: ContactItem;
};

type CrudCreateBodyMap = {
  todos: CreateTodoBody;
  notes: CreateNoteBody;
  bookmarks: CreateBookmarkBody;
  contacts: CreateContactBody;
};

type CrudUpdateBodyMap = {
  todos: UpdateTodoBody;
  notes: UpdateNoteBody;
  bookmarks: UpdateBookmarkBody;
  contacts: UpdateContactBody;
};

const outboxCollectionSchema = {
  title: "Mutation outbox",
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 128 },
    entity: { type: "string", enum: ["todos", "notes", "bookmarks", "contacts"] },
    action: { type: "string", enum: ["create", "update", "delete"] },
    payloadJson: { type: "string" },
    enqueuedAt: { type: "string", format: "date-time" },
    attempts: { type: "number", minimum: 0, multipleOf: 1 },
    lastError: { type: "string" },
  },
  required: ["id", "entity", "action", "payloadJson", "enqueuedAt", "attempts", "lastError"],
  additionalProperties: false,
} as const;

const syncStateListeners = new Set<(state: SyncState) => void>();
let syncState: SyncState = {
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  pending: 0,
  processing: false,
  lastError: null,
};

let syncEngineStarted = false;
let flushPromise: Promise<void> | undefined;

const getErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : "Unexpected sync error");

const emitSyncState = () => {
  for (const listener of syncStateListeners) {
    listener(syncState);
  }
};

const setSyncState = (patch: Partial<SyncState>) => {
  syncState = { ...syncState, ...patch };
  emitSyncState();
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
        outbox: { schema: outboxCollectionSchema },
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

const getOutboxCollection = async (): Promise<RxCollection<OutboxMutation>> => {
  const db = await getDatabase();
  return db.collections.outbox;
};

const getLocalItems = async <K extends keyof CollectionMap>(name: K, sort: SortSpec): Promise<CollectionMap[K][]> => {
  const collection = await getCollection(name);
  const docs = await collection.find({ sort: sort as never }).exec();
  return docs.map((doc) => doc.toJSON() as CollectionMap[K]);
};

const refreshPendingCount = async (): Promise<void> => {
  const outbox = await getOutboxCollection();
  const docs = await outbox.find().exec();
  setSyncState({ pending: docs.length });
};

const enqueueMutation = async <K extends CrudEntityKey>(
  entity: K,
  action: MutationAction,
  payload: CrudCreateBodyMap[K] | CrudUpdateBodyMap[K] | { id: string },
): Promise<void> => {
  const outbox = await getOutboxCollection();
  await outbox.insert({
    id: createId("mutation"),
    entity,
    action,
    payloadJson: JSON.stringify(payload),
    enqueuedAt: nowIso(),
    attempts: 0,
    lastError: "",
  });
  await refreshPendingCount();
};

const getPendingMutations = async (entity?: CrudEntityKey): Promise<OutboxMutation[]> => {
  const outbox = await getOutboxCollection();
  const docs = await outbox.find({ sort: [{ enqueuedAt: "asc" }] as never }).exec();
  return docs.map((doc) => doc.toJSON() as OutboxMutation).filter((mutation) => !entity || mutation.entity === entity);
};

const hasPendingMutations = async (entity: CrudEntityKey): Promise<boolean> => {
  const pending = await getPendingMutations(entity);
  return pending.length > 0;
};

const replaceCollection = async <K extends keyof CollectionMap>(name: K, items: CollectionMap[K][]): Promise<void> => {
  const collection = await getCollection(name);
  const docs = await collection.find().exec();
  await Promise.all(docs.map((doc) => doc.remove()));
  if (items.length > 0) {
    await collection.bulkInsert(items);
  }
};

const flushOutbox = async (): Promise<void> => {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    setSyncState({ online: false });
    return;
  }

  if (flushPromise) {
    return flushPromise;
  }

  flushPromise = (async () => {
    setSyncState({ online: typeof navigator === "undefined" ? true : navigator.onLine, processing: true, lastError: null });
    const outbox = await getOutboxCollection();
    const docs = await outbox.find({ sort: [{ enqueuedAt: "asc" }] as never }).exec();

    for (const doc of docs) {
      const mutation = doc.toJSON() as OutboxMutation;
      try {
        await dispatchMutation(mutation);
        await doc.remove();
      } catch (error) {
        const message = getErrorMessage(error);
        await outbox.upsert({
          ...mutation,
          attempts: mutation.attempts + 1,
          lastError: message,
        });
        setSyncState({ lastError: message, processing: false });
        await refreshPendingCount();
        return;
      }
    }

    await refreshPendingCount();
    setSyncState({ processing: false, lastError: null });
  })().finally(() => {
    flushPromise = undefined;
  });

  return flushPromise;
};

const createSyncHelpers = <K extends keyof CollectionMap>(config: {
  name: K;
  list: () => Promise<CollectionMap[K][]>;
  sort: SortSpec;
  isOfflineFirst?: boolean;
}) => ({
  sync: async (): Promise<CollectionMap[K][]> => {
    if (config.isOfflineFirst) {
      if (typeof navigator !== "undefined" && navigator.onLine) {
        await flushOutbox();
        const stillPending = await hasPendingMutations(config.name as CrudEntityKey);
        if (stillPending) {
          return getLocalItems(config.name, config.sort);
        }
        const items = await config.list();
        await replaceCollection(config.name, items);
        return items;
      }
      return getLocalItems(config.name, config.sort);
    }

    const items = await config.list();
    await replaceCollection(config.name, items);
    return items;
  },
  watch: (onItems: (items: CollectionMap[K][]) => void) => watchCollection(config.name, config.sort, onItems),
});

const createCrudEntityHelpers = <K extends keyof CollectionMap, CreateBody, UpdateBody>(config: {
  name: Extract<K, CrudEntityKey>;
  sync: () => Promise<CollectionMap[K][]>;
  watch: (onItems: (items: CollectionMap[K][]) => void) => Promise<() => void>;
  create: (body: CreateBody) => Promise<unknown>;
  update: (body: UpdateBody) => Promise<unknown>;
  remove: (id: string) => Promise<void>;
  createDraft: (body: CreateBody) => CollectionMap[K] & CreateBody;
  updateDraft: (current: CollectionMap[K], body: UpdateBody) => CollectionMap[K] & UpdateBody;
}) => ({
  sync: config.sync,
  watch: config.watch,
  createEntry: async (body: CreateBody): Promise<void> => {
    const collection = (await getCollection(config.name)) as unknown as RxCollection<Record<string, unknown>>;
    const draft = config.createDraft(body);
    await collection.upsert(draft as Record<string, unknown>);
    await enqueueMutation(config.name, "create", draft);
    void flushOutbox();
  },
  updateEntry: async (body: UpdateBody): Promise<void> => {
    const collection = (await getCollection(config.name)) as unknown as RxCollection<Record<string, unknown>>;
    const current = await collection.findOne((body as { id: string }).id).exec();
    if (!current) {
      throw new Error(`Cannot update missing ${config.name} entry`);
    }
    const draft = config.updateDraft(current.toJSON() as CollectionMap[K], body);
    await collection.upsert(draft as Record<string, unknown>);
    await enqueueMutation(config.name, "update", draft);
    void flushOutbox();
  },
  deleteEntry: async (id: string): Promise<void> => {
    const collection = await getCollection(config.name);
    const current = await collection.findOne(id).exec();
    if (current) {
      await current.remove();
    }
    await enqueueMutation(config.name, "delete", { id });
    void flushOutbox();
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

const dispatchMutation = async (mutation: OutboxMutation): Promise<void> => {
  const payload = JSON.parse(mutation.payloadJson) as unknown;
  switch (mutation.entity) {
    case "todos":
      if (mutation.action === "create") {
        await createTodo(payload as CreateTodoBody);
      } else if (mutation.action === "update") {
        await updateTodo(payload as UpdateTodoBody);
      } else {
        await deleteTodo(payload as { id: string });
      }
      return;
    case "notes":
      if (mutation.action === "create") {
        await createNote(payload as CreateNoteBody);
      } else if (mutation.action === "update") {
        await updateNote(payload as UpdateNoteBody);
      } else {
        await deleteNote(payload as { id: string });
      }
      return;
    case "bookmarks":
      if (mutation.action === "create") {
        await createBookmark(payload as CreateBookmarkBody);
      } else if (mutation.action === "update") {
        await updateBookmark(payload as UpdateBookmarkBody);
      } else {
        await deleteBookmark(payload as { id: string });
      }
      return;
    case "contacts":
      if (mutation.action === "create") {
        await createContact(payload as CreateContactBody);
      } else if (mutation.action === "update") {
        await updateContact(payload as UpdateContactBody);
      } else {
        await deleteContact(payload as { id: string });
      }
  }
};

const createOfflineTodoDraft = (body: CreateTodoBody): TodoItem & CreateTodoBody => {
  const createdAt = body.createdAt ?? nowIso();
  return {
    id: body.id ?? createId("todo"),
    title: body.title.trim(),
    details: body.details,
    state: body.state,
    createdAt,
    updatedAt: body.updatedAt ?? createdAt,
  };
};

const updateOfflineTodoDraft = (current: TodoItem, body: UpdateTodoBody): TodoItem & UpdateTodoBody => ({
  ...current,
  title: body.title.trim(),
  details: body.details,
  state: body.state,
  updatedAt: body.updatedAt ?? nowIso(),
});

const createOfflineNoteDraft = (body: CreateNoteBody): NoteItem & CreateNoteBody => {
  const createdAt = body.createdAt ?? nowIso();
  return {
    id: body.id ?? createId("note"),
    name: body.name.trim(),
    body: body.body,
    color: body.color,
    createdAt,
    updatedAt: body.updatedAt ?? createdAt,
  };
};

const updateOfflineNoteDraft = (current: NoteItem, body: UpdateNoteBody): NoteItem & UpdateNoteBody => ({
  ...current,
  name: body.name.trim(),
  body: body.body,
  color: body.color,
  updatedAt: body.updatedAt ?? nowIso(),
});

const createOfflineBookmarkDraft = (body: CreateBookmarkBody): BookmarkItem & CreateBookmarkBody => {
  const createdAt = body.createdAt ?? nowIso();
  return {
    id: body.id ?? createId("bookmark"),
    name: body.name.trim(),
    url: body.url,
    category: body.category,
    createdAt,
    updatedAt: body.updatedAt ?? createdAt,
  };
};

const updateOfflineBookmarkDraft = (
  current: BookmarkItem,
  body: UpdateBookmarkBody,
): BookmarkItem & UpdateBookmarkBody => ({
  ...current,
  name: body.name.trim(),
  url: body.url,
  category: body.category,
  updatedAt: body.updatedAt ?? nowIso(),
});

const createOfflineContactDraft = (body: CreateContactBody): ContactItem & CreateContactBody => {
  const createdAt = body.createdAt ?? nowIso();
  return {
    id: body.id ?? createId("contact"),
    name: body.name.trim(),
    email: body.email,
    company: body.company,
    createdAt,
    updatedAt: body.updatedAt ?? createdAt,
  };
};

const updateOfflineContactDraft = (current: ContactItem, body: UpdateContactBody): ContactItem & UpdateContactBody => ({
  ...current,
  name: body.name.trim(),
  email: body.email,
  company: body.company,
  updatedAt: body.updatedAt ?? nowIso(),
});

const inputsSync = createSyncHelpers({ name: "inputs", list: listInputs, sort: [{ index: "desc" }] });
const todosSync = createSyncHelpers({ name: "todos", list: listTodos, sort: [{ updatedAt: "desc" }], isOfflineFirst: true });
const notesSync = createSyncHelpers({ name: "notes", list: listNotes, sort: [{ updatedAt: "desc" }], isOfflineFirst: true });
const bookmarksSync = createSyncHelpers({ name: "bookmarks", list: listBookmarks, sort: [{ updatedAt: "desc" }], isOfflineFirst: true });
const contactsSync = createSyncHelpers({ name: "contacts", list: listContacts, sort: [{ updatedAt: "desc" }], isOfflineFirst: true });

const inputsEntity = createTextEntityHelpers({
  ...inputsSync,
  create: (text: string) => addInput({ text }),
  remove: (index: number) => deleteInput({ index }),
});

const todosEntity = createCrudEntityHelpers<"todos", CreateTodoBody, UpdateTodoBody>({
  name: "todos",
  ...todosSync,
  create: createTodo,
  update: updateTodo,
  remove: (id: string) => deleteTodo({ id }),
  createDraft: createOfflineTodoDraft,
  updateDraft: updateOfflineTodoDraft,
});

const notesEntity = createCrudEntityHelpers<"notes", CreateNoteBody, UpdateNoteBody>({
  name: "notes",
  ...notesSync,
  create: createNote,
  update: updateNote,
  remove: (id: string) => deleteNote({ id }),
  createDraft: createOfflineNoteDraft,
  updateDraft: updateOfflineNoteDraft,
});

const bookmarksEntity = createCrudEntityHelpers<"bookmarks", CreateBookmarkBody, UpdateBookmarkBody>({
  name: "bookmarks",
  ...bookmarksSync,
  create: createBookmark,
  update: updateBookmark,
  remove: (id: string) => deleteBookmark({ id }),
  createDraft: createOfflineBookmarkDraft,
  updateDraft: updateOfflineBookmarkDraft,
});

const contactsEntity = createCrudEntityHelpers<"contacts", CreateContactBody, UpdateContactBody>({
  name: "contacts",
  ...contactsSync,
  create: createContact,
  update: updateContact,
  remove: (id: string) => deleteContact({ id }),
  createDraft: createOfflineContactDraft,
  updateDraft: updateOfflineContactDraft,
});

export const watchSyncState = (listener: (state: SyncState) => void): (() => void) => {
  syncStateListeners.add(listener);
  listener(syncState);
  return () => syncStateListeners.delete(listener);
};

export const startSyncEngine = (): void => {
  if (syncEngineStarted || typeof window === "undefined") {
    return;
  }

  syncEngineStarted = true;
  const updateOnline = () => setSyncState({ online: navigator.onLine });

  window.addEventListener("online", () => {
    updateOnline();
    void flushOutbox();
  });
  window.addEventListener("offline", updateOnline);
  void refreshPendingCount();
  void flushOutbox();
};

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

