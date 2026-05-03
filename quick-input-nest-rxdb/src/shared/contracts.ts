import { z } from "zod";

const isoDateString = z.string().datetime({ offset: true });

export const okResponseSchema = z.object({ ok: z.literal(true) });
export const errorResponseSchema = z.object({ ok: z.literal(false), message: z.string() });
export type OkResponse = z.infer<typeof okResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const inputItemSchema = z.object({
  id: z.string(),
  index: z.number().int().nonnegative(),
  text: z.string(),
});
export const inputListSchema = z.array(inputItemSchema);
export const addInputBodySchema = z.object({ text: z.string() });
export const deleteInputBodySchema = z.object({ index: z.number().int().nonnegative() });
export type InputItem = z.infer<typeof inputItemSchema>;
export type AddInputBody = z.infer<typeof addInputBodySchema>;
export type DeleteInputBody = z.infer<typeof deleteInputBodySchema>;

export const todoStateSchema = z.enum(["Created", "InProgress", "Done"]);
export const todoItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  details: z.string(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
  state: todoStateSchema,
});
export const createTodoBodySchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  details: z.string(),
  state: todoStateSchema,
  createdAt: isoDateString.optional(),
  updatedAt: isoDateString.optional(),
});
export const updateTodoBodySchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  details: z.string(),
  state: todoStateSchema,
  updatedAt: isoDateString.optional(),
});
export type TodoState = z.infer<typeof todoStateSchema>;
export type TodoItem = z.infer<typeof todoItemSchema>;
export type CreateTodoBody = z.infer<typeof createTodoBodySchema>;
export type UpdateTodoBody = z.infer<typeof updateTodoBodySchema>;

const namedEntityBaseSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

export const noteItemSchema = namedEntityBaseSchema.extend({
  body: z.string(),
  color: z.string(),
});
export const createNoteBodySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  body: z.string(),
  color: z.string().min(1),
  createdAt: isoDateString.optional(),
  updatedAt: isoDateString.optional(),
});
export const updateNoteBodySchema = createNoteBodySchema.extend({ id: z.string(), updatedAt: isoDateString.optional() });
export type NoteItem = z.infer<typeof noteItemSchema>;
export type CreateNoteBody = z.infer<typeof createNoteBodySchema>;
export type UpdateNoteBody = z.infer<typeof updateNoteBodySchema>;

export const bookmarkItemSchema = namedEntityBaseSchema.extend({
  url: z.string().url(),
  category: z.string(),
});
export const createBookmarkBodySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  url: z.string().url(),
  category: z.string(),
  createdAt: isoDateString.optional(),
  updatedAt: isoDateString.optional(),
});
export const updateBookmarkBodySchema = createBookmarkBodySchema.extend({ id: z.string(), updatedAt: isoDateString.optional() });
export type BookmarkItem = z.infer<typeof bookmarkItemSchema>;
export type CreateBookmarkBody = z.infer<typeof createBookmarkBodySchema>;
export type UpdateBookmarkBody = z.infer<typeof updateBookmarkBodySchema>;

export const contactItemSchema = namedEntityBaseSchema.extend({
  email: z.string().email(),
  company: z.string(),
});
export const createContactBodySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  email: z.string().email(),
  company: z.string(),
  createdAt: isoDateString.optional(),
  updatedAt: isoDateString.optional(),
});
export const updateContactBodySchema = createContactBodySchema.extend({ id: z.string(), updatedAt: isoDateString.optional() });
export type ContactItem = z.infer<typeof contactItemSchema>;
export type CreateContactBody = z.infer<typeof createContactBodySchema>;
export type UpdateContactBody = z.infer<typeof updateContactBodySchema>;

export const jsonEntityKeySchema = z.enum(["todos", "notes", "bookmarks", "contacts"]);
export type JsonEntityKey = z.infer<typeof jsonEntityKeySchema>;

export type JsonEntityMap = {
  todos: TodoItem;
  notes: NoteItem;
  bookmarks: BookmarkItem;
  contacts: ContactItem;
};

const buildPullResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({ items: z.array(itemSchema) });

const buildPushBodySchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    mutations: z.array(
      z.discriminatedUnion("op", [
        z.object({ op: z.literal("upsert"), doc: itemSchema }),
        z.object({ op: z.literal("delete"), id: z.string() }),
      ]),
    ),
  });

export const jsonPullBodySchema = z.object({});

export const jsonEntityItemSchemas = {
  todos: todoItemSchema,
  notes: noteItemSchema,
  bookmarks: bookmarkItemSchema,
  contacts: contactItemSchema,
} as const;

export const jsonEntityPullResponseSchemas = {
  todos: buildPullResponseSchema(todoItemSchema),
  notes: buildPullResponseSchema(noteItemSchema),
  bookmarks: buildPullResponseSchema(bookmarkItemSchema),
  contacts: buildPullResponseSchema(contactItemSchema),
} as const;

export const jsonEntityPushBodySchemas = {
  todos: buildPushBodySchema(todoItemSchema),
  notes: buildPushBodySchema(noteItemSchema),
  bookmarks: buildPushBodySchema(bookmarkItemSchema),
  contacts: buildPushBodySchema(contactItemSchema),
} as const;

export type JsonPullResponse<K extends JsonEntityKey> = z.infer<(typeof jsonEntityPullResponseSchemas)[K]>;
export type JsonPushBody<K extends JsonEntityKey> = z.infer<(typeof jsonEntityPushBodySchemas)[K]>;
export type JsonPushMutation<K extends JsonEntityKey> = JsonPushBody<K>["mutations"][number];

const baseRxDocSchema = {
  version: 0,
  primaryKey: "id",
  type: "object",
  required: ["id", "createdAt", "updatedAt"],
  additionalProperties: false,
} as const;

export const inputCollectionSchema = {
  title: "Inputs",
  ...baseRxDocSchema,
  properties: {
    id: { type: "string", maxLength: 128 },
    index: { type: "number", minimum: 0, multipleOf: 1 },
    text: { type: "string" },
  },
  required: ["id", "index", "text"],
} as const;

export const todoCollectionSchema = {
  title: "Todos",
  ...baseRxDocSchema,
  properties: {
    id: { type: "string", maxLength: 128 },
    title: { type: "string" },
    details: { type: "string" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
    state: { type: "string", enum: todoStateSchema.options },
  },
  required: ["id", "title", "details", "createdAt", "updatedAt", "state"],
} as const;

export const noteCollectionSchema = {
  title: "Notes",
  ...baseRxDocSchema,
  properties: {
    id: { type: "string", maxLength: 128 },
    name: { type: "string" },
    body: { type: "string" },
    color: { type: "string" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
  required: ["id", "name", "body", "color", "createdAt", "updatedAt"],
} as const;

export const bookmarkCollectionSchema = {
  title: "Bookmarks",
  ...baseRxDocSchema,
  properties: {
    id: { type: "string", maxLength: 128 },
    name: { type: "string" },
    url: { type: "string" },
    category: { type: "string" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
  required: ["id", "name", "url", "category", "createdAt", "updatedAt"],
} as const;

export const contactCollectionSchema = {
  title: "Contacts",
  ...baseRxDocSchema,
  properties: {
    id: { type: "string", maxLength: 128 },
    name: { type: "string" },
    email: { type: "string" },
    company: { type: "string" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
  required: ["id", "name", "email", "company", "createdAt", "updatedAt"],
} as const;

export const entityTabs = [
  { key: "inputs", label: "Inputs", path: "/", source: "text-file" as const, description: "Synced from data/inputs.txt as a line-based text source." },
  { key: "todos", label: "Todos", path: "/todos", source: "json-file" as const, description: "Full CRUD stored in data/todo.json." },
  { key: "notes", label: "Notes", path: "/notes", source: "shared-json-file" as const, description: "CRUD documents stored inside the shared data/general_db.json source." },
  { key: "bookmarks", label: "Bookmarks", path: "/bookmarks", source: "shared-json-file" as const, description: "CRUD documents stored inside the shared data/general_db.json source." },
  { key: "contacts", label: "Contacts", path: "/contacts", source: "shared-json-file" as const, description: "CRUD documents stored inside the shared data/general_db.json source." },
] as const;

export type RouteKeys = typeof entityTabs[number]["key"];

export const nowIso = (): string => new Date().toISOString();
export const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;
export const toInputItem = (index: number, text: string): InputItem => ({ id: String(index), index, text });

