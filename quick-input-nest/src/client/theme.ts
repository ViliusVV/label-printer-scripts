import { createSignal } from "solid-js";

export type Theme = "light" | "dark";

const initial: Theme = document.documentElement.classList.contains("dark") ? "dark" : "light";
const [theme, setThemeSignal] = createSignal<Theme>(initial);

export { theme };

export function setTheme(next: Theme): void {
  document.documentElement.classList.toggle("dark", next === "dark");
  try {
    localStorage.setItem("theme", next);
  } catch (_) {
    // localStorage may be unavailable (private mode, etc.); ignore.
  }
  setThemeSignal(next);
}

export function toggleTheme(): void {
  setTheme(theme() === "dark" ? "light" : "dark");
}
