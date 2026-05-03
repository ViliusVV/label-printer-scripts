import {
  addInputBodySchema,
  deleteInputBodySchema,
  errorResponseSchema,
  inputListSchema,
  okResponseSchema,
  type AddInputBody,
  type DeleteInputBody,
  type InputItem,
} from "../shared/inputs";

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

