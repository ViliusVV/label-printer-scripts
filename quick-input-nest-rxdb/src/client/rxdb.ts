import { addRxPlugin, createRxDatabase, type RxCollection, type RxDatabase } from "rxdb";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import {
  addInput,
  deleteInput,
  listInputs,
  pullJsonEntity,
  pushJsonEntity,
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
  type JsonEntityKey,
  type JsonPushMutation,
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
type CrudEntityKey = JsonEntityKey;
type MutationAction = JsonPushMutation<JsonEntityKey>["op"];

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

type AppDatabase = RxDatabase<AppCollections>;

declare global {
  interface Window {
    __quickInputRxdbPromise__?: Promise<AppDatabase>;
    __quickInputRxdbDevModePromise__?: Promise<void>;
  }
}

type CollectionMap = {
  inputs: InputItem;
  todos: TodoItem;
  notes: NoteItem;
  bookmarks: BookmarkItem;
  contacts: ContactItem;
};

type CrudItemMap = {
  todos: TodoItem;
  notes: NoteItem;
  bookmarks: BookmarkItem;
  contacts: ContactItem;
};

const outboxCollectionSchema = {
  title: "Mutation outbox",
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 128 },
    entity: { type: "string", enum: ["todos", "notes", "bookmarks", "contacts"] },
    action: { type: "string", enum: ["upsert", "delete"] },
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

const getGlobalDbPromise = (): Promise<AppDatabase> | undefined => {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.__quickInputRxdbPromise__;
};

const setGlobalDbPromise = (promise: Promise<AppDatabase>): Promise<AppDatabase> => {
  if (typeof window !== "undefined") {
    window.__quickInputRxdbPromise__ = promise;
  }
  return promise;
};

const ensureRxdbDevMode = async (): Promise<void> => {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return;
  }

  if (!window.__quickInputRxdbDevModePromise__) {
    window.__quickInputRxdbDevModePromise__ = (async () => {
      const { RxDBDevModePlugin } = await import("rxdb/plugins/dev-mode");
      addRxPlugin(RxDBDevModePlugin);
    })();
  }

  await window.__quickInputRxdbDevModePromise__;
};

const getDatabase = async (): Promise<AppDatabase> => {
  await ensureRxdbDevMode();

  const existingPromise = getGlobalDbPromise();
  if (existingPromise) {
    return existingPromise;
  }

  const dbPromise = setGlobalDbPromise(
    (async () => {
      const db = await createRxDatabase<AppCollections>({
        name: "quick-input-nest-rxdb",
        storage: getRxStorageDexie(),
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
    })(),
  );

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
  payload: JsonPushMutation<JsonEntityKey>,
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

const replicationSorts: Record<CrudEntityKey, SortSpec> = {
  todos: [{ updatedAt: "desc" }],
  notes: [{ updatedAt: "desc" }],
  bookmarks: [{ updatedAt: "desc" }],
  contacts: [{ updatedAt: "desc" }],
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
  createDraft: (body: CreateBody) => CollectionMap[K] & CreateBody;
  updateDraft: (current: CollectionMap[K], body: UpdateBody) => CollectionMap[K] & UpdateBody;
}) => ({
  sync: config.sync,
  watch: config.watch,
  createEntry: async (body: CreateBody): Promise<void> => {
    const collection = (await getCollection(config.name)) as unknown as RxCollection<Record<string, unknown>>;
    const draft = config.createDraft(body);
    await collection.upsert(draft as Record<string, unknown>);
    await enqueueMutation(config.name, "upsert", {
      op: "upsert",
      doc: draft as CrudItemMap[Extract<K, CrudEntityKey>],
    } as unknown as JsonPushMutation<JsonEntityKey>);
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
    await enqueueMutation(config.name, "upsert", {
      op: "upsert",
      doc: draft as CrudItemMap[Extract<K, CrudEntityKey>],
    } as unknown as JsonPushMutation<JsonEntityKey>);
    void flushOutbox();
  },
  deleteEntry: async (id: string): Promise<void> => {
    const collection = await getCollection(config.name);
    const current = await collection.findOne(id).exec();
    if (current) {
      await current.remove();
    }
    await enqueueMutation(config.name, "delete", { op: "delete", id });
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
  const payload = JSON.parse(mutation.payloadJson) as JsonPushMutation<typeof mutation.entity>;
  await pushJsonEntity(mutation.entity, [payload]);
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
const todosSync = createSyncHelpers({ name: "todos", list: () => pullJsonEntity("todos"), sort: replicationSorts.todos, isOfflineFirst: true });
const notesSync = createSyncHelpers({ name: "notes", list: () => pullJsonEntity("notes"), sort: replicationSorts.notes, isOfflineFirst: true });
const bookmarksSync = createSyncHelpers({ name: "bookmarks", list: () => pullJsonEntity("bookmarks"), sort: replicationSorts.bookmarks, isOfflineFirst: true });
const contactsSync = createSyncHelpers({ name: "contacts", list: () => pullJsonEntity("contacts"), sort: replicationSorts.contacts, isOfflineFirst: true });

const inputsEntity = createTextEntityHelpers({
  ...inputsSync,
  create: (text: string) => addInput({ text }),
  remove: (index: number) => deleteInput({ index }),
});

const todosEntity = createCrudEntityHelpers<"todos", CreateTodoBody, UpdateTodoBody>({
  name: "todos",
  ...todosSync,
  createDraft: createOfflineTodoDraft,
  updateDraft: updateOfflineTodoDraft,
});

const notesEntity = createCrudEntityHelpers<"notes", CreateNoteBody, UpdateNoteBody>({
  name: "notes",
  ...notesSync,
  createDraft: createOfflineNoteDraft,
  updateDraft: updateOfflineNoteDraft,
});

const bookmarksEntity = createCrudEntityHelpers<"bookmarks", CreateBookmarkBody, UpdateBookmarkBody>({
  name: "bookmarks",
  ...bookmarksSync,
  createDraft: createOfflineBookmarkDraft,
  updateDraft: updateOfflineBookmarkDraft,
});

const contactsEntity = createCrudEntityHelpers<"contacts", CreateContactBody, UpdateContactBody>({
  name: "contacts",
  ...contactsSync,
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

