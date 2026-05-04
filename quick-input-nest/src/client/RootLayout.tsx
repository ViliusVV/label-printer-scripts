import { Link, Outlet } from "@tanstack/solid-router";

export default function RootLayout() {
  return (
    <div class="flex min-h-screen flex-col">
      <nav class="flex items-center gap-2 border-b border-gray-200 bg-white px-3 py-2 text-sm">
        <Link
          to="/"
          class="rounded px-2 py-1 text-gray-700 hover:bg-gray-100"
          activeProps={{ class: "rounded px-2 py-1 bg-blue-600 text-white" }}
        >
          Input
        </Link>
        <Link
          to="/print"
          class="rounded px-2 py-1 text-gray-700 hover:bg-gray-100"
          activeProps={{ class: "rounded px-2 py-1 bg-blue-600 text-white" }}
        >
          Print
        </Link>
      </nav>
      <main class="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
