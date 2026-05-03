import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { BookmarkItem } from "../../shared/contracts";
import { createBookmarkEntry, deleteBookmarkEntry, syncBookmarks, updateBookmarkEntry, watchBookmarks } from "../rxdb";
import { PageShell } from "./page-shell";

const getErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : "Unexpected error");

export function BookmarksPage() {
  const [items, setItems] = createSignal<BookmarkItem[]>([]);
  const [name, setName] = createSignal("");
  const [url, setUrl] = createSignal("https://");
  const [category, setCategory] = createSignal("Reference");
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(true);
  let stopWatching: (() => void) | undefined;

  const resetForm = () => {
    setName("");
    setUrl("https://");
    setCategory("Reference");
    setEditingId(null);
  };

  onMount(async () => {
    stopWatching = await watchBookmarks(setItems);
    try {
      await syncBookmarks();
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
        await updateBookmarkEntry({ id: editingId()!, name: name(), url: url(), category: category() });
      } else {
        await createBookmarkEntry({ name: name(), url: url(), category: category() });
      }
      resetForm();
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  };

  const startEdit = (item: BookmarkItem) => {
    setEditingId(item.id);
    setName(item.name);
    setUrl(item.url);
    setCategory(item.category);
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await deleteBookmarkEntry(id);
      if (editingId() === id) {
        resetForm();
      }
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  };

  return (
    <PageShell title="Bookmarks" description="Source: data/general_db.json. Another collection in the shared JSON data source.">
      <form onSubmit={submit} class="mb-5 grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 md:grid-cols-[1fr_1.3fr_1fr_auto]">
        <input value={name()} onInput={(e) => setName(e.currentTarget.value)} placeholder="Bookmark name" class="rounded border border-gray-300 px-3 py-2" />
        <input value={url()} onInput={(e) => setUrl(e.currentTarget.value)} placeholder="URL" class="rounded border border-gray-300 px-3 py-2" />
        <input value={category()} onInput={(e) => setCategory(e.currentTarget.value)} placeholder="Category" class="rounded border border-gray-300 px-3 py-2" />
        <div class="flex gap-2">
          <button type="submit" class="rounded bg-blue-600 px-3 py-2 text-white">{editingId() ? "Update" : "Create"}</button>
          <Show when={editingId()}><button type="button" class="rounded border border-gray-300 px-3 py-2" onClick={resetForm}>Cancel</button></Show>
        </div>
      </form>

      <Show when={error()}>{(message) => <div class="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{message()}</div>}</Show>
      <Show when={!loading()} fallback={<div class="px-3 py-2 text-gray-500">Loading…</div>}>
        <Show when={items().length > 0} fallback={<div class="px-3 py-2 italic text-gray-500">No bookmarks yet</div>}>
          <div class="grid gap-3">
            <For each={items()}>
              {(item) => (
                <article class="rounded-lg border border-gray-200 p-3">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <h3 class="font-medium">{item.name}</h3>
                      <a href={item.url} target="_blank" rel="noreferrer" class="mt-1 block text-sm text-blue-700 underline">{item.url}</a>
                      <p class="mt-2 text-xs text-gray-500">Category: {item.category}</p>
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

