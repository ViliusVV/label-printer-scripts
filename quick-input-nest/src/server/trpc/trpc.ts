import { TRPCError, initTRPC } from "@trpc/server";

type TRPCContext = Record<string, never>;

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export { TRPCError };

