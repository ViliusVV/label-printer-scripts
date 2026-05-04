import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { ORPCError, base } from "../orpc/orpc";
import { InputStorageService } from "./input-storage.service";

@Injectable()
export class InputsController {
  constructor(private readonly inputs: InputStorageService) {}

  list = base.handler(() => this.inputs.listLatest());

  add = base
    .input(z.object({ text: z.string() }))
    .handler(async ({ input }) => {
      await this.inputs.add(input.text);
      return { ok: true as const };
    });

  delete = base
    .input(z.object({ index: z.number().int().nonnegative() }))
    .handler(async ({ input }) => {
      const removed = await this.inputs.deleteByAbsoluteIndex(input.index);
      if (!removed) {
        throw new ORPCError("NOT_FOUND", { message: "Entry not found" });
      }
      return { ok: true as const };
    });

  clear = base.handler(async () => {
    await this.inputs.clear();
    return { ok: true as const };
  });
}
