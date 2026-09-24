import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    // three.js alone is ~700 kB minified; it lives in its own long-cached chunk.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Engine libraries change rarely; keep them in their own cacheable chunk.
        manualChunks: (id) => (id.includes("node_modules/three") || id.includes("node_modules/cannon-es") ? "engine" : undefined),
      },
    },
  },
});
