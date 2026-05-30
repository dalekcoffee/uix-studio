import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  publicDir: "Images",
  optimizeDeps: {
    // brotli-wasm loads its .wasm via import.meta.url; pre-bundling breaks that URL
    exclude: ["brotli-wasm"],
  },
  server: {
    watch: {
      // Windows paths with spaces can break native fs events; polling is reliable
      usePolling: true,
      interval: 300,
    },
  },
});
