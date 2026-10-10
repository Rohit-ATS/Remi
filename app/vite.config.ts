import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages serves this repo under /Remi/, so a Pages build sets
  // BASE_PATH=/Remi/app/. Local dev and any root-hosted deploy leave it alone.
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  server: {
    port: 5173,
    // The browser talks to the API on the same origin, so passkeys stay scoped
    // to one rpId in development and in production alike.
    proxy: { "/api": { target: "http://127.0.0.1:8787", changeOrigin: true } },
  },
  build: { outDir: "dist", sourcemap: true },
});
