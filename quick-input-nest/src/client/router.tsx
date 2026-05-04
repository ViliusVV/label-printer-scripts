import { createRootRoute, createRoute, createRouter } from "@tanstack/solid-router";
import RootLayout from "./RootLayout";
import InputPage from "./pages/InputPage";
import PrintPage from "./pages/PrintPage";
import SqlitePage from "./pages/SqlitePage";

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: InputPage,
});

const sqliteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sqlite",
  component: SqlitePage,
});

const printRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/print",
  component: PrintPage,
});

const routeTree = rootRoute.addChildren([indexRoute, sqliteRoute, printRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/solid-router" {
  interface Register {
    router: typeof router;
  }
}
