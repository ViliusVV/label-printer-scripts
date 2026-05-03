import {
  addInputBodySchema,
  bookmarkListSchema,
  contactListSchema,
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

export async function listInputs(): Promise<InputItem[]> {
  const response = await fetch("/api/inputs/list");
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return inputListSchema.parse(await response.json());
}

export async function addInput(body: AddInputBody): Promise<void> {
  const parsed = addInputBodySchema.parse(body);
  const response = await fetch("/api/inputs/add", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(parsed),
  });

  await expectOk(response);
}

export async function deleteInput(body: DeleteInputBody): Promise<void> {
  const parsed = deleteInputBodySchema.parse(body);
  const response = await fetch("/api/inputs/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(parsed),
  });

  await expectOk(response);
}

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

export const listTodos = async (): Promise<TodoItem[]> => getJson("/api/todos/list", todoListSchema);
export const createTodo = async (body: CreateTodoBody): Promise<TodoItem> =>
  postJson("/api/todos/create", createTodoBodySchema.parse(body), todoItemSchema);
export const updateTodo = async (body: UpdateTodoBody): Promise<TodoItem> =>
  postJson("/api/todos/update", updateTodoBodySchema.parse(body), todoItemSchema);
export const deleteTodo = async (body: DeleteByIdBody): Promise<void> => {
  await postJson("/api/todos/delete", deleteByIdBodySchema.parse(body), okResponseSchema);
};

export const listNotes = async (): Promise<NoteItem[]> => getJson("/api/notes/list", noteListSchema);
export const createNote = async (body: CreateNoteBody): Promise<NoteItem> =>
  postJson("/api/notes/create", createNoteBodySchema.parse(body), noteItemSchema);
export const updateNote = async (body: UpdateNoteBody): Promise<NoteItem> =>
  postJson("/api/notes/update", updateNoteBodySchema.parse(body), noteItemSchema);
export const deleteNote = async (body: DeleteByIdBody): Promise<void> => {
  await postJson("/api/notes/delete", deleteByIdBodySchema.parse(body), okResponseSchema);
};

export const listBookmarks = async (): Promise<BookmarkItem[]> =>
  getJson("/api/bookmarks/list", bookmarkListSchema);
export const createBookmark = async (body: CreateBookmarkBody): Promise<BookmarkItem> =>
  postJson("/api/bookmarks/create", createBookmarkBodySchema.parse(body), bookmarkListSchema.element);
export const updateBookmark = async (body: UpdateBookmarkBody): Promise<BookmarkItem> =>
  postJson("/api/bookmarks/update", updateBookmarkBodySchema.parse(body), bookmarkListSchema.element);
export const deleteBookmark = async (body: DeleteByIdBody): Promise<void> => {
  await postJson("/api/bookmarks/delete", deleteByIdBodySchema.parse(body), okResponseSchema);
};

export const listContacts = async (): Promise<ContactItem[]> => getJson("/api/contacts/list", contactListSchema);
export const createContact = async (body: CreateContactBody): Promise<ContactItem> =>
  postJson("/api/contacts/create", createContactBodySchema.parse(body), contactListSchema.element);
export const updateContact = async (body: UpdateContactBody): Promise<ContactItem> =>
  postJson("/api/contacts/update", updateContactBodySchema.parse(body), contactListSchema.element);
export const deleteContact = async (body: DeleteByIdBody): Promise<void> => {
  await postJson("/api/contacts/delete", deleteByIdBodySchema.parse(body), okResponseSchema);
};

