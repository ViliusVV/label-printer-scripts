import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter as ServerAppRouter } from "../server/trpc/app.router";

export type AppRouter = ServerAppRouter;
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

