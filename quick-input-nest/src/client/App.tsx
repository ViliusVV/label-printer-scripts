import { createSignal, For, Show } from "solid-js";
import { createMutation, createQuery, useQueryClient } from "@tanstack/solid-query";
import type { RouterOutputs } from "../shared/api";
import { transformInput } from "../shared/transform";
import { getErrorMessage, trpc } from "./trpc";

type InputEntry = RouterOutputs["inputs"]["list"][number];

export default function App() {
  const queryClient = useQueryClient();
  const [text, setText] = createSignal("");
  const [highlightFirst, setHighlightFirst] = createSignal(false);

  const entriesQuery = createQuery(() => ({
    queryKey: ["inputs"],
    queryFn: () => trpc.inputs.list.query(),
  }));

  const addMutation = createMutation(() => ({
    mutationFn: (value: string) => trpc.inputs.add.mutate({ text: value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inputs"] });
      setHighlightFirst(true);
      setTimeout(() => setHighlightFirst(false), 2500);
    },
  }));

  const deleteMutation = createMutation(() => ({
    mutationFn: (index: number) => trpc.inputs.delete.mutate({ index }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inputs"] });
    },
  }));

  const displayEntries = () => entriesQuery.data ?? [];

  let inputRef: HTMLInputElement | undefined;

  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    const value = text().trim();
    if (!value) return;
    setText("");
    inputRef?.focus();
    addMutation.mutate(value);
  };

  const remove = (index: number) => {
    deleteMutation.mutate(index);
  };

  const errorMessage = () => {
    if (addMutation.isError) return getErrorMessage(addMutation.error);
    if (deleteMutation.isError) return getErrorMessage(deleteMutation.error);
    if (entriesQuery.isError) return getErrorMessage(entriesQuery.error);
    return null;
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
                  }}
                >
                  <span class="block text-sm text-gray-500 mt-1">{entry.text}</span>
                  <span class="truncate text-lg">{transformInput(entry.text)}</span>
                  <button
                    type="button"
                    class="rounded border border-red-300 px-2 py-1 text-sm text-red-700 hover:bg-red-50"
                    onClick={() => remove(entry.index)}
                  >
                    Delete
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </div>
  );
}
