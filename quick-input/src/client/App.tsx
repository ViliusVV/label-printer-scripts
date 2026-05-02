import { createResource, createSignal, For, Show } from "solid-js";
import { treaty } from "@elysiajs/eden";
import type { App as ServerApp } from "../shared/api.ts";

const api = treaty<ServerApp>(window.location.origin);

export default function App() {
  const [text, setText] = createSignal("");
  const [highlightFirst, setHighlightFirst] = createSignal(false);
  const [entries, { refetch }] = createResource(async () => {
    const { data } = await api.api.list.get();
    return data ?? [];
  });

  let inputRef: HTMLInputElement | undefined;

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    const v = text().trim();
    if (!v) return;
    setText("");
    inputRef?.focus();
    await api.api.add.post({ text: v });
    await refetch();
    setHighlightFirst(true);
    setTimeout(() => setHighlightFirst(false), 2500);
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
            {(line, i) => (
              <li
                classList={{
                  "px-3 py-3 text-lg rounded": true,
                  "animate-flash": highlightFirst() && i() === 0,
                }}
              >
                {line}
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
