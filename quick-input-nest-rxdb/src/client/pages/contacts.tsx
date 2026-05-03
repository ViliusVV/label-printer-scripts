import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { ContactItem } from "../../shared/contracts";
import { createContactEntry, deleteContactEntry, syncContacts, updateContactEntry, watchContacts } from "../rxdb";
import { PageShell } from "./page-shell";

const getErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : "Unexpected error");

export function ContactsPage() {
  const [items, setItems] = createSignal<ContactItem[]>([]);
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [company, setCompany] = createSignal("");
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(true);
  let stopWatching: (() => void) | undefined;

  const resetForm = () => {
    setName("");
    setEmail("");
    setCompany("");
    setEditingId(null);
  };

  onMount(async () => {
    stopWatching = await watchContacts(setItems);
    try {
      await syncContacts();
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
        await updateContactEntry({ id: editingId()!, name: name(), email: email(), company: company() });
      } else {
        await createContactEntry({ name: name(), email: email(), company: company() });
      }
      resetForm();
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  };

  const startEdit = (item: ContactItem) => {
    setEditingId(item.id);
    setName(item.name);
    setEmail(item.email);
    setCompany(item.company);
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await deleteContactEntry(id);
      if (editingId() === id) {
        resetForm();
      }
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  };

  return (
    <PageShell title="Contacts" description="Source: data/general_db.json. This tab demonstrates another collection sharing the same sync source.">
      <form onSubmit={submit} class="mb-5 grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 md:grid-cols-[1fr_1.2fr_1fr_auto]">
        <input value={name()} onInput={(e) => setName(e.currentTarget.value)} placeholder="Name" class="rounded border border-gray-300 px-3 py-2" />
        <input value={email()} onInput={(e) => setEmail(e.currentTarget.value)} placeholder="Email" class="rounded border border-gray-300 px-3 py-2" />
        <input value={company()} onInput={(e) => setCompany(e.currentTarget.value)} placeholder="Company" class="rounded border border-gray-300 px-3 py-2" />
        <div class="flex gap-2">
          <button type="submit" class="rounded bg-blue-600 px-3 py-2 text-white">{editingId() ? "Update" : "Create"}</button>
          <Show when={editingId()}><button type="button" class="rounded border border-gray-300 px-3 py-2" onClick={resetForm}>Cancel</button></Show>
        </div>
      </form>

      <Show when={error()}>{(message) => <div class="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{message()}</div>}</Show>
      <Show when={!loading()} fallback={<div class="px-3 py-2 text-gray-500">Loading…</div>}>
        <Show when={items().length > 0} fallback={<div class="px-3 py-2 italic text-gray-500">No contacts yet</div>}>
          <div class="grid gap-3">
            <For each={items()}>
              {(item) => (
                <article class="rounded-lg border border-gray-200 p-3">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <h3 class="font-medium">{item.name}</h3>
                      <p class="mt-1 text-sm text-gray-600">{item.email}</p>
                      <p class="mt-2 text-xs text-gray-500">Company: {item.company}</p>
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

