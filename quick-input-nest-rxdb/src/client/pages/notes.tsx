import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { NoteItem } from "../../shared/contracts";
import { createNoteEntry, deleteNoteEntry, syncNotes, updateNoteEntry, watchNotes } from "../rxdb";
import { PageShell } from "./page-shell";

const getErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : "Unexpected error");

export function NotesPage() {
  const [notes, setNotes] = createSignal<NoteItem[]>([]);
  const [name, setName] = createSignal("");
  const [body, setBody] = createSignal("");
  const [color, setColor] = createSignal("amber");
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(true);
  let stopWatching: (() => void) | undefined;

  const resetForm = () => {
    setName("");
    setBody("");
    setColor("amber");
    setEditingId(null);
  };

  onMount(async () => {
    stopWatching = await watchNotes(setNotes);
    try {
      await syncNotes();
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
        await updateNoteEntry({ id: editingId()!, name: name(), body: body(), color: color() });
      } else {
        await createNoteEntry({ name: name(), body: body(), color: color() });
      }
      resetForm();
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  };

  const startEdit = (item: NoteItem) => {
    setEditingId(item.id);
    setName(item.name);
    setBody(item.body);
    setColor(item.color);
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await deleteNoteEntry(id);
      if (editingId() === id) {
        resetForm();
      }
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  };

  return (
    <PageShell title="Notes" description="Source: data/general_db.json. This entity shares one JSON source with other collections. ">
      <form onSubmit={submit} class="mb-5 grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 md:grid-cols-[1fr_1.5fr_auto_auto]">
        <input value={name()} onInput={(e) => setName(e.currentTarget.value)} placeholder="Note title" class="rounded border border-gray-300 px-3 py-2" />
        <input value={body()} onInput={(e) => setBody(e.currentTarget.value)} placeholder="Note body" class="rounded border border-gray-300 px-3 py-2" />
        <input value={color()} onInput={(e) => setColor(e.currentTarget.value)} placeholder="Color" class="rounded border border-gray-300 px-3 py-2" />
        <div class="flex gap-2">
          <button type="submit" class="rounded bg-blue-600 px-3 py-2 text-white">{editingId() ? "Update" : "Create"}</button>
          <Show when={editingId()}><button type="button" class="rounded border border-gray-300 px-3 py-2" onClick={resetForm}>Cancel</button></Show>
        </div>
      </form>

      <Show when={error()}>{(message) => <div class="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{message()}</div>}</Show>
      <Show when={!loading()} fallback={<div class="px-3 py-2 text-gray-500">Loading…</div>}>
        <Show when={notes().length > 0} fallback={<div class="px-3 py-2 italic text-gray-500">No notes yet</div>}>
          <div class="grid gap-3">
            <For each={notes()}>
              {(item) => (
                <article class="rounded-lg border border-gray-200 p-3">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <h3 class="font-medium">{item.name}</h3>
                      <p class="mt-1 text-sm text-gray-600">{item.body}</p>
                      <p class="mt-2 text-xs text-gray-500">Color: {item.color}</p>
                    </div>
                    <div class="flex gap-2">
                      <button type="button" class="rounded border border-gray-300 px-2 py-1 text-sm" onClick={() => startEdit(item)}>Edit</button>
                      <button type="button" class="rounded border border-red-300 px-2 py-1 text-sm text-red-700" onClick={() => void remove(item.id)}>Delete</button>
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

