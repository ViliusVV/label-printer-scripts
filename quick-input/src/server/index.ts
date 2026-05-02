import { Elysia, t } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import { appendFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(__dir, "..", "..", "..", "data", "inputs.txt");
const CLIENT_DIR = resolve(__dir, "..", "..", "dist", "client");
const INDEX_HTML = resolve(CLIENT_DIR, "index.html");
const PORT = 3300;

export const app = new Elysia()
  .post(
    "/api/add",
    async ({ body }) => {
      const text = body.text.trim();
      if (text) await appendFile(FILE, text + "\n", "utf-8");
      return { ok: true as const };
    },
    { body: t.Object({ text: t.String() }) },
  )
  .get("/api/list", async () => {
    try {
      const data = await readFile(FILE, "utf-8");
      return data.split("\n").filter(Boolean).reverse().slice(0, 10);
    } catch {
      return [] as string[];
    }
  })
  .use(staticPlugin({ assets: resolve(CLIENT_DIR, "assets"), prefix: "/assets" }))
  .get("/", () => Bun.file(INDEX_HTML))
  .listen({ hostname: "0.0.0.0", port: PORT });

export type App = typeof app;

console.log(`Quick Input listening on http://0.0.0.0:${PORT}  →  writing to ${FILE}`);
