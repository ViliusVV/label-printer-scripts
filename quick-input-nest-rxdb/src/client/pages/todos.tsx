import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { TodoItem, TodoState } from "../../shared/contracts";
import { createTodoEntry, deleteTodoEntry, syncTodos, updateTodoEntry, watchTodos } from "../rxdb";
import { PageShell } from "./page-shell";

const todoStates: TodoState[] = ["Created", "InProgress", "Done"];
const getErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : "Unexpected error");

export function TodosPage() {
  const [todos, setTodos] = createSignal<TodoItem[]>([]);
  const [title, setTitle] = createSignal("");
  const [details, setDetails] = createSignal("");
  const [state, setState] = createSignal<TodoState>("Created");
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(true);
  let stopWatching: (() => void) | undefined;

  const resetForm = () => {
    setTitle("");
    setDetails("");
    setState("Created");
    setEditingId(null);
  };

  onMount(async () => {
    stopWatching = await watchTodos(setTodos);
    try {
      await syncTodos();
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  });

  onCleanup(() => stopWatching?.());

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (editingId()) {
        await updateTodoEntry({ id: editingId()!, title: title(), details: details(), state: state() });
      } else {
        await createTodoEntry({ title: title(), details: details(), state: state() });
      }
      resetForm();
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  };

  const startEdit = (todo: TodoItem) => {
    setEditingId(todo.id);
    setTitle(todo.title);
    setDetails(todo.details);
    setState(todo.state);
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await deleteTodoEntry(id);
      if (editingId() === id) {
        resetForm();
      }
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  };

  return (
    <PageShell title="Todos" description="Source: data/todo.json. This tab shows full CRUD against a dedicated JSON file.">
      <form onSubmit={submit} class="mb-5 grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 md:grid-cols-[1.2fr_1.6fr_auto]">
        <input value={title()} onInput={(e) => setTitle(e.currentTarget.value)} placeholder="Todo title" class="rounded border border-gray-300 px-3 py-2" />
        <input value={details()} onInput={(e) => setDetails(e.currentTarget.value)} placeholder="Details" class="rounded border border-gray-300 px-3 py-2" />
        <div class="flex gap-2">
          <select value={state()} onChange={(e) => setState(e.currentTarget.value as TodoState)} class="rounded border border-gray-300 px-3 py-2">
            <For each={todoStates}>{(option) => <option value={option}>{option}</option>}</For>
          </select>
          <button type="submit" class="rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700">{editingId() ? "Update" : "Create"}</button>
          <Show when={editingId()}>
            <button type="button" class="rounded border border-gray-300 px-3 py-2" onClick={resetForm}>Cancel</button>
          </Show>
        </div>
      </form>

      <Show when={error()}>{(message) => <div class="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{message()}</div>}</Show>
      <Show when={!loading()} fallback={<div class="px-3 py-2 text-gray-500">Loading…</div>}>
        <Show when={todos().length > 0} fallback={<div class="px-3 py-2 italic text-gray-500">No todos yet</div>}>
          <div class="grid gap-3">
            <For each={todos()}>
              {(todo) => (
                <article class="rounded-lg border border-gray-200 p-3">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <h3 class="font-medium text-gray-900">{todo.title}</h3>
                      <p class="mt-1 text-sm text-gray-600">{todo.details || "No details"}</p>
                      <p class="mt-2 text-xs text-gray-500">State: {todo.state} · Updated {new Date(todo.updatedAt).toLocaleString()}</p>
                    </div>
                    <div class="flex gap-2">
                      <button type="button" class="rounded border border-gray-300 px-2 py-1 text-sm" onClick={() => startEdit(todo)}>Edit</button>
                      <button type="button" class="rounded border border-red-300 px-2 py-1 text-sm text-red-700" onClick={() => void remove(todo.id)}>Delete</button>
                    </div>
                  </div>
                </article>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </PageShell>
  );
}

