# HOSTING

You only need hosting to open the app on the headset **without** a USB cable, or to share a link. For
solo development, USB + `adb reverse` (RUNBOOK Path A) needs no hosting at all.

---

## The one rule: the headset needs a reachable, secure URL

- WebXR immersive sessions require a **secure context**.
- That means the headset must open the page over **`https://`** — or **`http://localhost`** (which is
  what `adb reverse` gives you).
- A plain `http://192.168.x.x` LAN address will load the page but **cannot start immersive VR**.

## Step 1 — Build the static files (on your PC)

1. From `webxr-starter`, run:
   ```bash
   npm run build
   ```
2. This produces a **`dist/`** folder containing plain static files (HTML, JS, CSS).
3. There is no server code and no backend — `dist/` is just files.

## Step 2 — Put `dist/` on an HTTPS host

Any static host with HTTPS works. Simplest options:

- **Netlify (drag-and-drop):** open the Netlify dashboard and drag the `dist/` folder onto it. You get
  an `https://…netlify.app` URL immediately.
- **Vercel:** import the project (or drag `dist/`); it serves over HTTPS automatically.
- **GitHub Pages:** push `dist/` to a `gh-pages` branch (or a `/docs` folder) and enable Pages. Because
  Pages serves from a sub-path, the build already uses **relative asset paths** (`base: './'` in
  `vite.config.js`), so it works in a sub-folder.
- **Cloudflare Pages** or any static bucket (S3+CloudFront, Firebase Hosting) also work.

## Step 3 — Open the URL on the headset

1. Copy the `https://…` URL from your host.
2. On the headset, open **Chrome** and go to that URL.
3. Press **Enter VR**, then select the cube.

**Success:** the hosted page loads over `https://` and enters VR from the button.

---

## Permissions are per-origin (per domain)

- WebXR permission is remembered **per site (origin)**. Granting it on one domain does **not** grant it
  on another.
- If you move from a preview URL to a production URL, the headset may prompt for permission **again** on
  the new domain. Accept it.
- Keep a **stable** URL for repeated testing so you are not re-approving permissions every time.

## Local alternative: plain Node static server

If you just want to preview the build locally without Vite:

```bash
npm run build
npm run serve        # serves ./dist at http://localhost:8080
```

For a headset over USB you can then run `adb reverse tcp:8080 tcp:8080` and open
`http://localhost:8080` on the headset.

## What you do NOT need

- No backend server.
- No database.
- No login/auth.
- No environment variables or secrets.

This is a static front-end app; hosting is just "serve these files over HTTPS."
