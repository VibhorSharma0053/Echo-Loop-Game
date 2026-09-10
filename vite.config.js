import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Echo Loop — Phase 0
// Vanilla JS, Canvas 2D, no backend, no network calls.
// viteSingleFile inlines the bundle into dist/index.html so the built
// game can be served from anywhere as one static file.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: "es2022",
  },
});
