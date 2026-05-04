import { z } from "zod";
import { InputStorageService } from "../inputs/input-storage.service";
import { TRPCError, publicProcedure, router } from "./trpc";

export const createAppRouter = (inputs: InputStorageService) =>
  router({
    inputs: router({
      list: publicProcedure.query(() => inputs.listLatest()),
      add: publicProcedure
        .input(z.object({ text: z.string() }))
        .mutation(async ({ input }) => {
          await inputs.add(input.text);
          return { ok: true as const };
        }),
      delete: publicProcedure
        .input(z.object({ index: z.number().int().nonnegative() }))
        .mutation(async ({ input }) => {
          const removed = await inputs.deleteByAbsoluteIndex(input.index);
          if (!removed) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Entry not found" });
          }
          return { ok: true as const };
        }),
      clear: publicProcedure.mutation(async () => {
        await inputs.clear();
        return { ok: true as const };
      }),
    }),
  });

export type AppRouter = ReturnType<typeof createAppRouter>;

