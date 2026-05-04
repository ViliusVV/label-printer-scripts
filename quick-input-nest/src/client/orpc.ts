import { ORPCError, createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import type { AppRouter } from "../shared/api";

const link = new RPCLink({
  url: `${window.location.origin}/api/rpc`,
});

export const orpc: RouterClient<AppRouter> = createORPCClient(link);

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof ORPCError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error";
};
