import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { createMutation, createQuery, onlineManager, useQueryClient } from "@tanstack/solid-query";
import { transformInput } from "../shared/transform";
import { getErrorMessage } from "./orpc";
import * as sync from "./sync";
import type { DisplayEntry } from "./sync";

export default function App() {
  const queryClient = useQueryClient();
  const [text, setText] = createSignal("");
  const [highlightFirst, setHighlightFirst] = createSignal(false);
  const [isOnline, setIsOnline] = createSignal(onlineManager.isOnline());

  const entriesQuery = createQuery(() => ({
    queryKey: ["inputs"],
    queryFn: () => sync.fetchView(),
  }));

  onMount(() => {
    const unsubscribe = onlineManager.subscribe((online) => {
      setIsOnline(online);
      if (online) queryClient.invalidateQueries({ queryKey: ["inputs"] });
    });
    onCleanup(unsubscribe);
  });

  const addMutation = createMutation(() => ({
    mutationFn: (value: string) => sync.addEntry(value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inputs"] });
      setHighlightFirst(true);
      setTimeout(() => setHighlightFirst(false), 2500);
    },
  }));

  const deleteMutation = createMutation(() => ({
    mutationFn: (entry: DisplayEntry) => sync.deleteEntry(entry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inputs"] });
    },
  }));

  const clearMutation = createMutation(() => ({
    mutationFn: () => sync.clearEntries(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inputs"] });
    },
  }));

  const displayEntries = (): DisplayEntry[] => entriesQuery.data ?? [];
  const pendingCount = () => displayEntries().filter((e) => e.pending).length;

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

  const remove = (entry: DisplayEntry) => {
    deleteMutation.mutate(entry);
  };

  const clearAll = () => {
    clearMutation.mutate();
  };

  const errorMessage = () => {
    if (addMutation.isError) return getErrorMessage(addMutation.error);
    if (deleteMutation.isError) return getErrorMessage(deleteMutation.error);
    if (clearMutation.isError) return getErrorMessage(clearMutation.error);
    if (entriesQuery.isError) return getErrorMessage(entriesQuery.error);
    return null;
  };

  return (
    <div class="mx-auto max-w-xl p-4 text-gray-900">
      <Show when={!isOnline() || pendingCount() > 0}>
        <div class="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <Show when={!isOnline()} fallback={`${pendingCount()} pending — syncing…`}>
            Offline · changes will sync when reconnected
            <Show when={pendingCount() > 0}> ({pendingCount()} queued)</Show>
          </Show>
        </div>
      </Show>

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
          class="flex-1 rounded-lg border-2 px-3 py-3 text-2xl outline-none"
          classList={{
            "border-gray-300 focus:border-blue-600": !isInvalid(),
            "border-red-500 focus:border-red-600": isInvalid(),
          }}
        />
      </form>

      <Show when={errorMessage()}>
        {(message) => (
          <div class="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {message()}
          </div>
        )}
      </Show>

      <Show when={!entriesQuery.isLoading} fallback={<div class="px-3 py-2 text-gray-500">Loading…</div>}>
        <Show
          when={displayEntries().length > 0}
          fallback={<div class="px-3 py-2 italic text-gray-500">No entries yet</div>}
        >
          <ul class="divide-y divide-gray-200">
            <For each={displayEntries()}>
              {(entry, i) => (
                <li
                  classList={{
                    "px-3 py-3 text-lg rounded flex items-center justify-between gap-3": true,
                    "animate-flash": highlightFirst() && i() === 0,
                    "opacity-60 italic": entry.pending,
                  }}
                >
                  <span class="truncate text-lg">{transformInput(entry.text) ?? entry.text}</span>
                  <span class="block text-sm text-gray-500 mt-1">{entry.text}</span>

                  <button
                    type="button"
                    class="rounded border border-red-300 px-2 py-1 text-sm text-red-700 hover:bg-red-50"
                    onClick={() => remove(entry)}
                  >
                    Delete
                  </button>
                </li>
              )}
            </For>
          </ul>
          <button
            type="button"
            class="mt-3 rounded border border-red-300 px-2 py-1 text-sm text-red-700 hover:bg-red-50"
            onClick={clearAll}
          >
            Clear
          </button>
        </Show>
      </Show>
    </div>
  );
}
