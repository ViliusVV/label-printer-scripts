import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { InputItem } from "../../shared/contracts";
import { createInputEntry, removeInputEntry, syncInputs, watchInputs } from "../rxdb";
import { PageShell } from "./page-shell";

const getErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : "Unexpected error");

export function InputsPage() {
  const [text, setText] = createSignal("");
  const [entries, setEntries] = createSignal<InputItem[]>([]);
  const [highlightFirst, setHighlightFirst] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(true);

  let inputRef: HTMLInputElement | undefined;
  let stopWatching: (() => void) | undefined;

  onMount(async () => {
    stopWatching = await watchInputs(setEntries);
    try {
      await syncInputs();
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  });

  onCleanup(() => stopWatching?.());

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    const value = text().trim();
    if (!value) return;

    setError(null);
    setText("");
    inputRef?.focus();

    try {
      await createInputEntry(value);
      setHighlightFirst(true);
      setTimeout(() => setHighlightFirst(false), 2500);
    } catch (caught) {
      setText(value);
      setError(getErrorMessage(caught));
    }
  };

  const remove = async (index: number) => {
    setError(null);
    try {
      await removeInputEntry(index);
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  };

  return (
    <PageShell title="Inputs" description="Source: data/inputs.txt. This tab shows a line-based text source synced into RxDB.">
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
          class="flex-1 rounded-lg border-2 border-gray-300 px-3 py-3 text-xl outline-none focus:border-blue-600"
        />
      </form>

      <Show when={error()}>{(message) => <div class="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{message()}</div>}</Show>
      <Show when={!loading()} fallback={<div class="px-3 py-2 text-gray-500">Loading…</div>}>
        <Show when={entries().length > 0} fallback={<div class="px-3 py-2 italic text-gray-500">No entries yet</div>}>
          <ul class="divide-y divide-gray-200">
            <For each={entries()}>
              {(entry, i) => (
                <li classList={{ "flex items-center justify-between gap-3 rounded px-3 py-3": true, "animate-flash": highlightFirst() && i() === 0 }}>
                  <span class="truncate">{entry.text}</span>
                  <button type="button" class="rounded border border-red-300 px-2 py-1 text-sm text-red-700 hover:bg-red-50" onClick={() => void remove(entry.index)}>
                    Delete
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </PageShell>
  );
}

