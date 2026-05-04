import { ORPCError, os } from "@orpc/server";
import type { InputStorageService } from "../inputs/input-storage.service";

export type ORPCContext = {
  inputs: InputStorageService;
};

export const base = os.$context<ORPCContext>().use(async ({ next }) => {
  try {
    return await next();
  } catch (err) {
    if (err instanceof ORPCError) throw err;
    throw new ORPCError("BAD_REQUEST", {
      message: err instanceof Error ? err.message : "Unexpected error",
      cause: err,
    });
  }
});

export { ORPCError };
