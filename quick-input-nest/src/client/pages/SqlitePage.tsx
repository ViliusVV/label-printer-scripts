import { createSignal, For, onMount, Show } from "solid-js";
import { createMutation, createQuery, useQueryClient } from "@tanstack/solid-query";
import { transformInput } from "../../shared/transform";
import { getErrorMessage } from "../orpc";
import * as store from "../storage/sqlite-store";
import type { SqliteEntry } from "../storage/sqlite-store";

const QUERY_KEY = ["sqlite-inputs"] as const;

export default function SqlitePage() {
  const queryClient = useQueryClient();
  const [text, setText] = createSignal("");
  const [highlightFirst, setHighlightFirst] = createSignal(false);

  const entriesQuery = createQuery(() => ({
    queryKey: QUERY_KEY,
    queryFn: () => store.listEntries(),
  }));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  onMount(() => {
    void store.syncFromServer().then(invalidate).catch(() => {
      // sync error surfaces via the query / mutation error UI on next attempt
    });
  });

  const addMutation = createMutation(() => ({
    mutationFn: (value: string) => store.addEntry(value),
    onSuccess: () => {
      invalidate();
      setHighlightFirst(true);
      setTimeout(() => setHighlightFirst(false), 2500);
    },
  }));

  const deleteMutation = createMutation(() => ({
    mutationFn: (id: number) => store.deleteEntry(id),
    onSuccess: invalidate,
  }));

  const clearMutation = createMutation(() => ({
    mutationFn: () => store.clearEntries(),
    onSuccess: invalidate,
  }));

  const refreshMutation = createMutation(() => ({
    mutationFn: () => store.syncFromServer(),
    onSuccess: invalidate,
  }));

  const entries = (): SqliteEntry[] => entriesQuery.data ?? [];

  const isInvalid = () => {
    const trimmed = text().trim();
    if (!trimmed) return false;
    return transformInput(trimmed) === null;
  };

  let inputRef: HTMLInputElement | undefined;

  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    const value = text().trim();
    if (!value) return;
    setText("");
    inputRef?.focus();
    addMutation.mutate(value);
  };

  const errorMessage = () => {
    if (addMutation.isError) return getErrorMessage(addMutation.error);
    if (deleteMutation.isError) return getErrorMessage(deleteMutation.error);
    if (clearMutation.isError) return getErrorMessage(clearMutation.error);
    if (refreshMutation.isError) return getErrorMessage(refreshMutation.error);
    if (entriesQuery.isError) return getErrorMessage(entriesQuery.error);
    return null;
  };

  return (
    <div class="mx-auto max-w-xl p-4 text-gray-900 dark:text-gray-100">
      <div class="mb-3 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
        <span>
          SQLite WASM · {entries().length} row{entries().length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          class="rounded border border-gray-300 px-2 py-1 text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
        >
          {refreshMutation.isPending ? "Syncing…" : "Sync from server"}
        </button>
      </div>

      <form onSubmit={submit} autocomplete="off" class="mb-4 flex gap-2">
        <input
          ref={inputRef}
          value={text()}
          onInput={(e) => setText(e.currentTarget.value)}
          autofocus
          enterkeyhint="send"
          autocapitalize="off"
          autocorrect="off"
          spellcheck={false}
          placeholder="Type and press Enter"
          class="flex-1 rounded-lg border-2 bg-white px-3 py-3 text-2xl text-gray-900 outline-none placeholder:text-gray-400 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
          classList={{
            "border-gray-300 focus:border-blue-600 dark:border-gray-700 dark:focus:border-blue-500":
              !isInvalid(),
            "border-red-500 focus:border-red-600 dark:border-red-500 dark:focus:border-red-400":
              isInvalid(),
          }}
        />
      </form>

      <Show when={errorMessage()}>
        {(message) => (
          <div class="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300">
            {message()}
          </div>
        )}
      </Show>

      <Show
        when={!entriesQuery.isLoading}
        fallback={<div class="px-3 py-2 text-gray-500 dark:text-gray-400">Loading…</div>}
      >
        <Show
          when={entries().length > 0}
          fallback={
            <div class="px-3 py-2 italic text-gray-500 dark:text-gray-400">No entries yet</div>
          }
        >
          <ul class="divide-y divide-gray-200 dark:divide-gray-800">
            <For each={entries()}>
              {(entry, i) => (
                <li
                  classList={{
                    "px-3 py-3 text-lg rounded flex items-center justify-between gap-3": true,
                    "animate-flash": highlightFirst() && i() === 0,
                  }}
                >
                  <span class="truncate text-lg">{entry.transformed || entry.text}</span>
                  <span class="block text-sm text-gray-500 mt-1 dark:text-gray-400">
                    {entry.text}
                  </span>
                  <button
                    type="button"
                    class="rounded border border-red-300 px-2 py-1 text-sm text-red-700 hover:bg-red-50 dark:border-red-800/60 dark:text-red-300 dark:hover:bg-red-950/40"
                    onClick={() => deleteMutation.mutate(entry.id)}
                  >
                    Delete
                  </button>
                </li>
              )}
            </For>
          </ul>
          <button
            type="button"
            class="mt-3 rounded border border-red-300 px-2 py-1 text-sm text-red-700 hover:bg-red-50 dark:border-red-800/60 dark:text-red-300 dark:hover:bg-red-950/40"
            onClick={() => clearMutation.mutate()}
          >
            Clear
          </button>
        </Show>
      </Show>
    </div>
  );
}
