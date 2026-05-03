import { Link, Outlet } from "@tanstack/solid-router";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { entityTabs } from "../shared/contracts";
import { startSyncEngine, watchSyncState } from "./rxdb";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function App() {
  const [installPrompt, setInstallPrompt] = createSignal<BeforeInstallPromptEvent | null>(null);
  const [online, setOnline] = createSignal(true);
  const [pending, setPending] = createSignal(0);
  const [processing, setProcessing] = createSignal(false);
  const [syncError, setSyncError] = createSignal<string | null>(null);

  onMount(() => {
    startSyncEngine();
    const stopSyncWatch = watchSyncState((state) => {
      setOnline(state.online);
      setPending(state.pending);
      setProcessing(state.processing);
      setSyncError(state.lastError);
    });

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    onCleanup(() => {
      stopSyncWatch();
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    });
  });

  const promptInstall = async () => {
    const prompt = installPrompt();
    if (!prompt) {
      return;
    }

    await prompt.prompt();
    await prompt.userChoice;
    setInstallPrompt(null);
  };

  return (
    <main class="min-h-screen bg-gray-50 text-gray-900">
      <div class="mx-auto max-w-6xl p-4">
        <header class="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h1 class="text-3xl font-semibold">Quick Input RxDB Sync Playground</h1>
          <p class="mt-2 text-sm text-gray-600">
            Compare how RxDB-powered UI handles a text file source, a dedicated JSON source, and
            several collections stored inside one shared JSON database.
          </p>
          <div class="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span classList={{ "rounded-full px-3 py-1 font-medium": true, "bg-emerald-100 text-emerald-800": online(), "bg-amber-100 text-amber-800": !online() }}>
              {online() ? "Online" : "Offline"}
            </span>
            <span class="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
              {pending()} pending mutation{pending() === 1 ? "" : "s"}
            </span>
            <Show when={processing()}>
              <span class="rounded-full bg-blue-100 px-3 py-1 font-medium text-blue-700">Syncing…</span>
            </Show>
            <Show when={installPrompt()}>
              <button type="button" class="rounded-full bg-blue-600 px-4 py-1.5 font-medium text-white hover:bg-blue-700" onClick={() => void promptInstall()}>
                Install app
              </button>
            </Show>
          </div>
          <Show when={syncError()}>
            {(message) => (
              <div class="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Sync queue paused: {message()}
              </div>
            )}
          </Show>
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

