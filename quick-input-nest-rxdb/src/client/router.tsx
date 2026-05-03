import { createRootRoute, createRoute, createRouter } from "@tanstack/solid-router";
import App from "./App";
import { BookmarksPage } from "./pages/bookmarks";
import { ContactsPage } from "./pages/contacts";
import { InputsPage } from "./pages/inputs";
import { NotesPage } from "./pages/notes";
import { TodosPage } from "./pages/todos";
import {entityTabs, RouteKeys} from "../shared/contracts";
import {JSX} from "solid-js";

const rootRoute = createRootRoute({
  component: App,
});

const inputsRoute = createRouteHelper("inputs", InputsPage);
const todosRoute = createRouteHelper("todos", TodosPage);
const notesRoute = createRouteHelper("notes", NotesPage);
const bookmarksRoute = createRouteHelper("bookmarks", BookmarksPage);
const contactsRoute = createRouteHelper("contacts", ContactsPage);

function createRouteHelper(routeKey: RouteKeys, component: () => JSX.Element) {
  return createRoute({
    getParentRoute: () => rootRoute,
    path: entityTabs.find((tab) => tab.key === routeKey)?.path ?? "/",
    component: component
  });
}

const routeTree = rootRoute.addChildren([inputsRoute, todosRoute, notesRoute, bookmarksRoute, contactsRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/solid-router" {
  interface Register {
    router: typeof router;
  }
}

