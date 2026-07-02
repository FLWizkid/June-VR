import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * Vite configuration for the AR Blood Pressure Cuff app.
 *
 * - ESM-only, PlayCanvas standalone (no Editor, no PlayCanvas CLI).
 * - `playcanvas` is a large library; we let Vite/Rollup tree-shake and emit a single chunk.
 * - WebXR requires HTTPS on remote origins. For local dev, `localhost` is a secure context, so
 *   plain HTTP dev is fine; to test on a headset, build and serve `dist/` over HTTPS (see RUNBOOK).
 */
export default defineConfig({
  // Served at site root; assets in /public are copied verbatim to dist/.
  base: './',
  publicDir: 'public',

  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    // PlayCanvas is sizable; raise the warning limit so the build stays clean.
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      // Multi-page: main app at /, mirror viewer at /mirror.html.
      input: {
        main: resolve(__dirname, 'index.html'),
        mirror: resolve(__dirname, 'mirror.html'),
      },
      output: {
        // Keep PlayCanvas in its own chunk for cacheability and clearer load timing.
        manualChunks: {
          playcanvas: ['playcanvas'],
        },
      },
    },
  },

  server: {
    host: true,
    port: 5173,
  },

  preview: {
    host: true,
    port: 4173,
  },
});
