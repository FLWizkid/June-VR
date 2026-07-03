import { defineConfig } from 'vite';

// Minimal Vite config.
// - `base: './'` makes built asset paths RELATIVE, so the contents of `dist/` work no matter where
//   they are hosted (root domain, a project sub-path like GitHub Pages, or opened via `npm run serve`).
// - `server.host: true` also exposes the dev server on your LAN; the recommended headset path is still
//   `adb reverse` (see RUNBOOK.md), because WebXR immersive sessions require a secure context and
//   `localhost` counts as secure while a bare `http://<lan-ip>` does not.
export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    port: 4173,
  },
});
