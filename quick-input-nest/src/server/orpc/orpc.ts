import { ORPCError, os } from "@orpc/server";

export const base = os.use(async ({ next }) => {
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
