import { createResource, createSignal, For, Show } from "solid-js";
import { treaty } from "@elysiajs/eden";
import type { App as ServerApp } from "../shared/api.ts";

const app = treaty<ServerApp>(window.location.origin);
type InputEntry = { index: number; text: string };

export default function App() {
  const [text, setText] = createSignal("");
  const [highlightFirst, setHighlightFirst] = createSignal(false);
  const [entries, { refetch }] = createResource(async () => {
    const { data } = await app.api.inputs.list.get();
    return (data ?? []) as InputEntry[];
  });

  let inputRef: HTMLInputElement | undefined;

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    const v = text().trim();
    if (!v) return;
    setText("");
    inputRef?.focus();
    await app.api.inputs.add.post({ text: v });
    await refetch();
    setHighlightFirst(true);
    setTimeout(() => setHighlightFirst(false), 2500);
  };

  const remove = async (index: number) => {
    await app.api.inputs.delete.post({ index });
    await refetch();
  };

  return (
    <div class="mx-auto max-w-xl p-4 text-gray-900">
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
          class="flex-1 rounded-lg border-2 border-gray-300 px-3 py-3 text-2xl outline-none focus:border-blue-600"
        />
      </form>
      <Show
        when={(entries() ?? []).length > 0}
        fallback={<div class="px-3 py-2 italic text-gray-500">No entries yet</div>}
      >
        <ul class="divide-y divide-gray-200">
          <For each={entries()}>
            {(entry, i) => (
              <li
                classList={{
                  "px-3 py-3 text-lg rounded flex items-center justify-between gap-3": true,
                  "animate-flash": highlightFirst() && i() === 0,
                }}
              >
                <span class="truncate">{entry.text}</span>
                <button
                  type="button"
                  class="rounded border border-red-300 px-2 py-1 text-sm text-red-700 hover:bg-red-50"
                  onClick={() => void remove(entry.index)}
                >
                  Delete
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
