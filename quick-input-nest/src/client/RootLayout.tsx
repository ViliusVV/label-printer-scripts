import type { JSX } from "solid-js";
import { Link, Outlet } from "@tanstack/solid-router";
import { ThemeToggle } from "./ThemeToggle";

export default function RootLayout() {
  return (
    <div class="flex min-h-screen flex-col bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header class="sticky top-0 z-10 border-b border-gray-200/70 bg-white/70 backdrop-blur-md supports-[backdrop-filter]:bg-white/60 dark:border-gray-800/70 dark:bg-gray-950/70 dark:supports-[backdrop-filter]:bg-gray-950/60">
        <nav class="mx-auto flex h-12 w-full max-w-5xl items-center gap-1 px-4 text-sm">
          <span class="mr-3 font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            Quick Input
          </span>
          <NavLink to="/">Input</NavLink>
          <NavLink to="/print">Print</NavLink>
          <div class="ml-auto">
            <ThemeToggle />
          </div>
        </nav>
      </header>
      <main class="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

function NavLink(props: { to: string; children: JSX.Element }) {
  const base =
    "rounded-md px-3 py-1.5 font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100";
  const active =
    "bg-gray-900 text-white hover:bg-gray-900 hover:text-white dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-100 dark:hover:text-gray-900";
  return (
    <Link to={props.to} class={base} activeProps={{ class: active }}>
      {props.children}
    </Link>
  );
}
