import {
  addInputBodySchema,
  bookmarkListSchema,
  bookmarkItemSchema,
  contactListSchema,
  contactItemSchema,
  createBookmarkBodySchema,
  createContactBodySchema,
  createNoteBodySchema,
  createTodoBodySchema,
  deleteByIdBodySchema,
  deleteInputBodySchema,
  errorResponseSchema,
  inputListSchema,
  noteListSchema,
  noteItemSchema,
  okResponseSchema,
  todoListSchema,
  todoItemSchema,
  updateBookmarkBodySchema,
  updateContactBodySchema,
  updateNoteBodySchema,
  updateTodoBodySchema,
  type AddInputBody,
  type BookmarkItem,
  type ContactItem,
  type CreateBookmarkBody,
  type CreateContactBody,
  type CreateNoteBody,
  type CreateTodoBody,
  type DeleteByIdBody,
  type DeleteInputBody,
  type InputItem,
  type NoteItem,
  type TodoItem,
  type UpdateBookmarkBody,
  type UpdateContactBody,
  type UpdateNoteBody,
  type UpdateTodoBody,
} from "../shared/contracts";

type Parser<T> = { parse: (value: unknown) => T };

type TextCollectionApiConfig<Item, CreateBody, DeleteBody> = {
  basePath: string;
  listSchema: Parser<Item[]>;
  createSchema: Parser<CreateBody>;
  deleteSchema: Parser<DeleteBody>;
};

type CrudCollectionApiConfig<Item, CreateBody, UpdateBody> = {
  basePath: string;
  listSchema: Parser<Item[]>;
  itemSchema: Parser<Item>;
  createSchema: Parser<CreateBody>;
  updateSchema: Parser<UpdateBody>;
};

const readErrorMessage = async (response: Response): Promise<string> => {
  try {
    const body = await response.json();
    const parsed = errorResponseSchema.safeParse(body);
    if (parsed.success) {
      return parsed.data.message;
    }
  } catch {
    // ignore malformed JSON error bodies
  }

  return response.statusText || "Request failed";
};

const expectOk = async (response: Response) => {
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return okResponseSchema.parse(await response.json());
};

const getJson = async <T>(url: string, parser: { parse: (value: unknown) => T }): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return parser.parse(await response.json());
};

const postJson = async <TBody, TResult>(
  url: string,
  body: TBody,
  parser: { parse: (value: unknown) => TResult },
): Promise<TResult> => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return parser.parse(await response.json());
};

const createTextCollectionApi = <Item, CreateBody, DeleteBody>(config: TextCollectionApiConfig<Item, CreateBody, DeleteBody>) => ({
  list: () => getJson(`${config.basePath}/list`, config.listSchema),
  create: (body: CreateBody) => postJson(`${config.basePath}/add`, config.createSchema.parse(body), okResponseSchema),
  delete: (body: DeleteBody) => postJson(`${config.basePath}/delete`, config.deleteSchema.parse(body), okResponseSchema),
});

const createCrudCollectionApi = <Item, CreateBody, UpdateBody>(config: CrudCollectionApiConfig<Item, CreateBody, UpdateBody>) => ({
  list: () => getJson(`${config.basePath}/list`, config.listSchema),
  create: (body: CreateBody) => postJson(`${config.basePath}/create`, config.createSchema.parse(body), config.itemSchema),
  update: (body: UpdateBody) => postJson(`${config.basePath}/update`, config.updateSchema.parse(body), config.itemSchema),
  delete: (body: DeleteByIdBody) => postJson(`${config.basePath}/delete`, deleteByIdBodySchema.parse(body), okResponseSchema),
});

const inputsApi = createTextCollectionApi<InputItem, AddInputBody, DeleteInputBody>({
  basePath: "/api/inputs",
  listSchema: inputListSchema,
  createSchema: addInputBodySchema,
  deleteSchema: deleteInputBodySchema,
});

const todosApi = createCrudCollectionApi<TodoItem, CreateTodoBody, UpdateTodoBody>({
  basePath: "/api/todos",
  listSchema: todoListSchema,
  itemSchema: todoItemSchema,
  createSchema: createTodoBodySchema,
  updateSchema: updateTodoBodySchema,
});

const notesApi = createCrudCollectionApi<NoteItem, CreateNoteBody, UpdateNoteBody>({
  basePath: "/api/notes",
  listSchema: noteListSchema,
  itemSchema: noteItemSchema,
  createSchema: createNoteBodySchema,
  updateSchema: updateNoteBodySchema,
});

const bookmarksApi = createCrudCollectionApi<BookmarkItem, CreateBookmarkBody, UpdateBookmarkBody>({
  basePath: "/api/bookmarks",
  listSchema: bookmarkListSchema,
  itemSchema: bookmarkItemSchema,
  createSchema: createBookmarkBodySchema,
  updateSchema: updateBookmarkBodySchema,
});

const contactsApi = createCrudCollectionApi<ContactItem, CreateContactBody, UpdateContactBody>({
  basePath: "/api/contacts",
  listSchema: contactListSchema,
  itemSchema: contactItemSchema,
  createSchema: createContactBodySchema,
  updateSchema: updateContactBodySchema,
});

export const listInputs = inputsApi.list;
export const addInput = async (body: AddInputBody): Promise<void> => {
  await inputsApi.create(body);
};
export const deleteInput = async (body: DeleteInputBody): Promise<void> => {
  await inputsApi.delete(body);
};

export const listTodos = todosApi.list;
export const createTodo = todosApi.create;
export const updateTodo = todosApi.update;
export const deleteTodo = async (body: DeleteByIdBody): Promise<void> => {
  await todosApi.delete(body);
};

export const listNotes = notesApi.list;
export const createNote = notesApi.create;
export const updateNote = notesApi.update;
export const deleteNote = async (body: DeleteByIdBody): Promise<void> => {
  await notesApi.delete(body);
};

export const listBookmarks = bookmarksApi.list;
export const createBookmark = bookmarksApi.create;
export const updateBookmark = bookmarksApi.update;
export const deleteBookmark = async (body: DeleteByIdBody): Promise<void> => {
  await bookmarksApi.delete(body);
};

export const listContacts = contactsApi.list;
export const createContact = contactsApi.create;
export const updateContact = contactsApi.update;
export const deleteContact = async (body: DeleteByIdBody): Promise<void> => {
  await contactsApi.delete(body);
};

