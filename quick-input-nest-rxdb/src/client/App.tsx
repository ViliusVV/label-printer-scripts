import { Link, Outlet } from "@tanstack/solid-router";
import { For } from "solid-js";
import { entityTabs } from "../shared/contracts";

export default function App() {
  return (
    <main class="min-h-screen bg-gray-50 text-gray-900">
      <div class="mx-auto max-w-6xl p-4">
        <header class="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h1 class="text-3xl font-semibold">Quick Input RxDB Sync Playground</h1>
          <p class="mt-2 text-sm text-gray-600">
            Compare how RxDB-powered UI handles a text file source, a dedicated JSON source, and
            several collections stored inside one shared JSON database.
          </p>
          <nav class="mt-4 flex flex-wrap gap-2">
            <For each={entityTabs}>
              {(tab) => (
                <Link
                  to={tab.path}
                  activeProps={{ class: "rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white" }}
                  inactiveProps={{ class: "rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100" }}
                >
                  {tab.label}
                </Link>
              )}
            </For>
          </nav>
        </header>
        <Outlet />
      </div>
    </main>
  );
}

