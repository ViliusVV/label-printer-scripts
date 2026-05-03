import {
  addInputBodySchema,
  deleteInputBodySchema,
  errorResponseSchema,
  inputListSchema,
  jsonEntityPullResponseSchemas,
  jsonEntityPushBodySchemas,
  okResponseSchema,
  type AddInputBody,
  type DeleteInputBody,
  type InputItem,
  type JsonEntityKey,
  type JsonEntityMap,
  type JsonPullResponse,
  type JsonPushMutation,
} from "../shared/contracts";

type Parser<T> = { parse: (value: unknown) => T };

type TextCollectionApiConfig<Item, CreateBody, DeleteBody> = {
  basePath: string;
  listSchema: Parser<Item[]>;
  createSchema: Parser<CreateBody>;
  deleteSchema: Parser<DeleteBody>;
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

const inputsApi = createTextCollectionApi<InputItem, AddInputBody, DeleteInputBody>({
  basePath: "/api/inputs",
  listSchema: inputListSchema,
  createSchema: addInputBodySchema,
  deleteSchema: deleteInputBodySchema,
});

const pullJsonEntity = async <K extends JsonEntityKey>(entity: K): Promise<JsonEntityMap[K][]> => {
  const response = await postJson(
    `/api/replication/${entity}/pull`,
    {},
    jsonEntityPullResponseSchemas[entity] as Parser<JsonPullResponse<K>>,
  );
  return response.items as JsonEntityMap[K][];
};

const pushJsonEntity = async <K extends JsonEntityKey>(entity: K, mutations: JsonPushMutation<K>[]): Promise<void> => {
  const body = jsonEntityPushBodySchemas[entity].parse({ mutations });
  await postJson(`/api/replication/${entity}/push`, body, okResponseSchema);
};

export const listInputs = inputsApi.list;
export const addInput = async (body: AddInputBody): Promise<void> => {
  await inputsApi.create(body);
};
export const deleteInput = async (body: DeleteInputBody): Promise<void> => {
  await inputsApi.delete(body);
};

export { pullJsonEntity, pushJsonEntity };

