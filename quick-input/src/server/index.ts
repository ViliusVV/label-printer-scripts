import { Elysia } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInputsPlugin } from "./inputs.plugin";
import { InputStorage } from "./inputs.storage";

const __dir = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(__dir, "..", "..", "..", "data", "inputs.txt");
const CLIENT_DIR = resolve(__dir, "..", "..", "dist", "client");
const INDEX_HTML = resolve(CLIENT_DIR, "index.html");
const PORT = 3300;
const storage = new InputStorage(FILE, 10);

export const app = new Elysia()
  .use(createInputsPlugin(storage))
  .use(staticPlugin({ assets: resolve(CLIENT_DIR, "assets"), prefix: "/assets" }))
  .get("/", () => Bun.file(INDEX_HTML))
  .listen({ hostname: "0.0.0.0", port: PORT });

export type App = typeof app;

console.log(`Quick Input listening on http://0.0.0.0:${PORT} -> writing to ${FILE}`);
