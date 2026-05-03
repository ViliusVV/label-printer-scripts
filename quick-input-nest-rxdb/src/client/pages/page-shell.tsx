import type { JSX } from "solid-js";

export function PageShell(props: { title: string; description: string; children: JSX.Element }) {
  return (
    <section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <header class="mb-4 border-b border-gray-100 pb-3">
        <h2 class="text-2xl font-semibold text-gray-900">{props.title}</h2>
        <p class="mt-1 text-sm text-gray-600">{props.description}</p>
      </header>
      {props.children}
    </section>
  );
}

