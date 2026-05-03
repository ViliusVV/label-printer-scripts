import { TRPCClientError, createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../shared/api";

export const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${window.location.origin}/trpc`,
    }),
  ],
});

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof TRPCClientError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error";
};

