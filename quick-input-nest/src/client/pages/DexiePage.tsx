import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { createMutation, createQuery, onlineManager, useQueryClient } from "@tanstack/solid-query";
import { transformInput } from "../../shared/transform";
import { getErrorMessage } from "../orpc";
import * as store from "../storage/dexie-store";
import type { DisplayEntry } from "../storage/dexie-store";

const QUERY_KEY = ["dexie-inputs"] as const;

export default function DexiePage() {
  const queryClient = useQueryClient();
  const [text, setText] = createSignal("");
  const [highlightFirst, setHighlightFirst] = createSignal(false);
  const [isOnline, setIsOnline] = createSignal(onlineManager.isOnline());
  const [now, setNow] = createSignal(Date.now());

  const entriesQuery = createQuery(() => ({
    queryKey: QUERY_KEY,
    queryFn: () => store.fetchView(),
    refetchOnWindowFocus: true,
  }));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  onMount(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    onCleanup(() => clearInterval(tick));

    const unsubscribe = onlineManager.subscribe((online) => {
      setIsOnline(online);
      if (online) invalidate();
    });
    onCleanup(unsubscribe);
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
    mutationFn: (entry: DisplayEntry) => store.deleteEntry(entry),
    onSuccess: invalidate,
  }));

  const clearMutation = createMutation(() => ({
    mutationFn: () => store.clearEntries(),
    onSuccess: invalidate,
  }));

  const entries = (): DisplayEntry[] => entriesQuery.data ?? [];
  const pendingCount = () => entries().filter((e) => e.pending).length;
  const cacheCount = () => entries().filter((e) => !e.pending).length;

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
    if (entriesQuery.isError) return getErrorMessage(entriesQuery.error);
    return null;
  };

  const formatAgo = (then: number): string => {
    if (!then) return "never";
    const sec = Math.max(0, Math.round((now() - then) / 1000));
    if (sec < 60) return `${sec}s ago`;
    if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
    return `${Math.round(sec / 3600)}h ago`;
  };

  return (
    <div class="mx-auto max-w-xl p-4 text-gray-900 dark:text-gray-100">
      <div class="mb-3 rounded border border-gray-200 bg-gray-50 px-3 py-1.5 font-mono text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>Dexie · IndexedDB</span>
          <span
            class={
              isOnline()
                ? "text-green-700 dark:text-green-400"
                : "text-amber-700 dark:text-amber-400"
            }
          >
            {isOnline() ? "● online" : "○ offline"}
          </span>
          <span>cache: {cacheCount()}</span>
          <span>pending: {pendingCount()}</span>
          <span>synced {formatAgo(store.lastServerSyncAt())}</span>
          <Show when={store.lastReplay()}>
            {(replay) => (
              <span>
                replay: {replay().replayed}✓
                <Show when={replay().remaining > 0}> {replay().remaining}↻</Show> ·{" "}
                {formatAgo(replay().at)}
              </span>
            )}
          </Show>
        </div>
        <Show when={store.lastError()}>
          {(err) => (
            <div class="mt-1 flex items-start gap-2 text-red-700 dark:text-red-300">
              <span class="break-all">
                err [{err().source}, {formatAgo(err().at)}]: {err().message}
              </span>
              <button
                type="button"
                class="rounded border border-red-300 px-1.5 text-[10px] hover:bg-red-50 dark:border-red-800/60 dark:hover:bg-red-950/40"
                onClick={store.clearLastError}
              >
                clear
              </button>
            </div>
          )}
        </Show>
      </div>

      <Show when={!isOnline() || pendingCount() > 0}>
        <div class="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
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
                    "opacity-60 italic": entry.pending,
                  }}
                >
                  <span class="truncate text-lg">{transformInput(entry.text) ?? entry.text}</span>
                  <span class="block text-sm text-gray-500 mt-1 dark:text-gray-400">
                    {entry.text}
                  </span>
                  <button
                    type="button"
                    class="rounded border border-red-300 px-2 py-1 text-sm text-red-700 hover:bg-red-50 dark:border-red-800/60 dark:text-red-300 dark:hover:bg-red-950/40"
                    onClick={() => deleteMutation.mutate(entry)}
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
