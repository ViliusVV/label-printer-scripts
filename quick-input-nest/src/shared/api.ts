import type { InferRouterInputs, InferRouterOutputs } from "@orpc/server";
import type { AppRouter as ServerAppRouter } from "../server/orpc/app.router";

export type AppRouter = ServerAppRouter;
export type RouterInputs = InferRouterInputs<AppRouter>;
export type RouterOutputs = InferRouterOutputs<AppRouter>;
