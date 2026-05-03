import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  root: "src/client",
  plugins: [
    solid(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Quick Input RxDB Sync Playground",
        short_name: "Quick Input",
        description: "Offline-first RxDB playground comparing multiple backend sync sources.",
        theme_color: "#2563eb",
        background_color: "#f9fafb",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
  },
  server: {
    host: "0.0.0.0",
    proxy: {
      "/api": "http://127.0.0.1:3300",
    },
  },
});

