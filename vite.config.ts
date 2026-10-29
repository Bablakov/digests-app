import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";
import { VitePWA } from "vite-plugin-pwa";
import pkg from "./package.json" with { type: "json" };

// Сайт живёт на GitHub Pages в подпапке публичного репозитория-витрины digests-app.
const base = process.env.BASE_PATH ?? "/digests-app/";

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    preact(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      manifest: {
        name: "Дайджест",
        short_name: "Дайджест",
        description: "Еженедельные дайджесты Telegram-каналов с отметками",
        lang: "ru",
        start_url: base,
        scope: base,
        display: "standalone",
        orientation: "portrait",
        background_color: "#121212",
        theme_color: "#121212",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,webmanifest}"],
        navigateFallback: `${base}index.html`,
      },
    }),
  ],
  build: { target: "es2022", sourcemap: false },
  test: { include: ["src/**/*.test.ts"] },
});
