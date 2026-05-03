import { RouterProvider } from "@tanstack/solid-router";
import { render } from "solid-js/web";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import { router } from "./router";

registerSW({
  immediate: true,
});

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");
render(() => <RouterProvider router={router} />, root);

