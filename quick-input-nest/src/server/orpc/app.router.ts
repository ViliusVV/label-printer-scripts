import { z } from "zod";
import { ORPCError, base } from "./orpc";

const list = base.handler(({ context }) => context.inputs.listLatest());

const add = base
  .input(z.object({ text: z.string() }))
  .handler(async ({ input, context }) => {
    await context.inputs.add(input.text);
    return { ok: true as const };
  });

const remove = base
  .input(z.object({ index: z.number().int().nonnegative() }))
  .handler(async ({ input, context }) => {
    const removed = await context.inputs.deleteByAbsoluteIndex(input.index);
    if (!removed) {
      throw new ORPCError("NOT_FOUND", { message: "Entry not found" });
    }
    return { ok: true as const };
  });

const clear = base.handler(async ({ context }) => {
  await context.inputs.clear();
  return { ok: true as const };
});

export const appRouter = {
  inputs: {
    list,
    add,
    delete: remove,
    clear,
  },
};

export type AppRouter = typeof appRouter;
