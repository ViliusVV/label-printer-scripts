import { RouterProvider } from "@tanstack/solid-router";
import { render } from "solid-js/web";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import { router } from "./router";

const isLocalhost =
  typeof location !== "undefined" &&
  ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
const canUseServiceWorker =
  typeof navigator !== "undefined" && "serviceWorker" in navigator && (window.isSecureContext || isLocalhost);

if (import.meta.env.DEV && "serviceWorker" in navigator) {
  void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  });
} else if (canUseServiceWorker) {
  registerSW({
    immediate: true,
  });
}

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");
render(() => <RouterProvider router={router} />, root);

