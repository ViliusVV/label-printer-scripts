import { createRootRoute, createRoute, createRouter } from "@tanstack/solid-router";
import App from "./App";
import { BookmarksPage } from "./pages/bookmarks";
import { ContactsPage } from "./pages/contacts";
import { InputsPage } from "./pages/inputs";
import { NotesPage } from "./pages/notes";
import { TodosPage } from "./pages/todos";

const rootRoute = createRootRoute({
  component: App,
});

const inputsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: InputsPage,
});

const todosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/todos",
  component: TodosPage,
});

const notesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notes",
  component: NotesPage,
});

const bookmarksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/bookmarks",
  component: BookmarksPage,
});

const contactsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/contacts",
  component: ContactsPage,
});

const routeTree = rootRoute.addChildren([inputsRoute, todosRoute, notesRoute, bookmarksRoute, contactsRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/solid-router" {
  interface Register {
    router: typeof router;
  }
}

