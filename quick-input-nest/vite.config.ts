import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: "src/client",
  plugins: [solid(), tailwindcss()],
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
  },
  server: {
    host: "0.0.0.0",
    hmr: {
      host: "127.0.0.1",
    },
    proxy: {
      "/trpc": "http://127.0.0.1:3333",
    },
  },
});

