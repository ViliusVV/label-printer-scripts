import { Elysia, t } from "elysia";
import type { InputItem } from "./inputs.storage";
import { InputStorage } from "./inputs.storage";

type AddInputBody = { text: string };
type DeleteInputBody = { index: number };
type ResponseStatus = { status?: number | string };

export class InputController {
  static readonly addBody = t.Object({ text: t.String() });
  static readonly deleteBody = t.Object({ index: t.Number({ minimum: 0 }) });

  constructor(private readonly storage: InputStorage) {}

  readonly routes = new Elysia()
    .post("/add", async ({ body }) => this.add(body), { body: InputController.addBody })
    .get("/list", async () => this.list())
    .post(
      "/delete",
      async ({ body, set }) => this.delete(body, set),
      { body: InputController.deleteBody },
    );

  async add(body: AddInputBody): Promise<{ ok: true }> {
    await this.storage.add(body.text);
    return { ok: true };
  }

  async list(): Promise<InputItem[]> {
    return this.storage.listLatest();
  }

  async delete(body: DeleteInputBody, set: ResponseStatus): Promise<{ ok: true } | { ok: false; message: string }> {
    const removed = await this.storage.deleteByAbsoluteIndex(body.index);
    if (!removed) {
      set.status = 404;
      return { ok: false, message: "Entry not found" };
    }
    return { ok: true };
  }
}

