# RUNBOOK — AR Blood Pressure Cuff

Operational guide: who runs what, how to set up, build, test, and deploy to Android XR glasses.
Stack: **PlayCanvas standalone + TypeScript + ESM + Vite. No Unity.**

---

## What runs in Claude Code

Use Claude Code (or any agent/dev) for **source-level work that does not require a browser/headset**:

- Edit/extend TypeScript in `src/` (architecture, interaction, materials, UI).
- Add/adjust quality profiles, capability gates, fallback logic.
- Wire **placeholder seams** and later swap in real assets.
- Run **static verification** that works headless:
  - `npm install`
  - `npm run build`  (Vite production build — also runs `tsc`)
  - `npx tsc --noEmit`  (strict typecheck)
- Maintain docs (`SPEC.md`, this file, `ASSET_PIPELINE.md`, `README.md`, `CLAUDE.md`).

Claude Code **cannot**: open a real WebXR session, validate hand tracking, or measure on-device
frame rate. Those are device tasks below. Keep `CLAUDE.md` rules in force (Unity-free, no per-frame
allocations, run build checks before stopping).

---

## What runs in the local terminal

On a normal dev machine (Node v22, npm 10):

```bash
npm install        # install deps (playcanvas + dev tooling)
npm run dev        # Vite dev server (HMR) at http://localhost:5173
npm run build      # tsc --noEmit && vite build  -> dist/
npm run preview    # serve the built dist/ for a production-like check
npm run typecheck  # tsc --noEmit only
```

For **on-device testing** you also serve over **HTTPS** (WebXR requirement). Options:
- `npm run preview -- --host` then tunnel with HTTPS (e.g. an ngrok/cloudflared tunnel), **or**
- serve `dist/` from any HTTPS static host, **or**
- run the dev/preview server behind a local HTTPS reverse proxy.
`localhost` is treated as secure, but the headset is a *remote* origin, so it needs real HTTPS.

---

## What runs in the PlayCanvas app (in-headset / in-browser)

The running app (`src/main.ts` → `core/app.ts`) is responsible for:

- Creating the PlayCanvas `Application`, graphics device, render loop.
- **Capability detection** (`config/capabilities.ts`) and **quality profile selection**.
- Showing the **AR entry button** (only when immersive-AR is available) and the **unsupported**
  message otherwise.
- Starting/ending the **WebXR session on user gesture** with capability-gated features.
- Running the **interaction layer** actually selected (hands → ray → place/inspect).
- Driving **light estimation** into the key light; running the **performance monitor**.
- Rendering the **cuff** (placeholder or real) with size variants and inspection mode.

No build tools, asset compression, or Unity run inside the app.

---

## Optional tools and when to use them

| Tool | When | Notes |
| --- | --- | --- |
| **gltfpack** (meshoptimizer) | Preparing a real GLB for shipping | Quantize + meshopt compress geometry, optional KTX2. **Not installed here**; commands in `ASSET_PIPELINE.md`. Run on your machine. |
| **KTX2 / Basis (`toktx`/`basisu`)** | Compress textures for GPU + small download | Big load-time win at close-up quality. PlayCanvas decodes KTX2 at runtime. |
| **Blender** | Inspect/repair/re-export a Unity-origin or vendor model | Fix scale (meters), +Y up / -Z forward, separate materials, sane UVs. |
| **ngrok / cloudflared** | Quick HTTPS tunnel to the headset | Required because WebXR needs HTTPS on a remote origin. |
| **Chrome DevTools (remote)** | Debug the in-headset browser | `chrome://inspect` style remote debugging where supported. |
| **WebXR emulator** | Desktop sanity check of XR flow | Approximation only; **does not** validate real hand tracking. |

---

## Step-by-step setup

1. **Install Node v22 + npm 10.**
2. `git clone <repo>` and `cd` into it.
3. `npm install`.
4. `npm run dev` → open `http://localhost:5173`. You should see the **desktop inspect mode** (the
   cuff on a neutral background) plus an `Enter AR` button if your browser reports immersive-AR.
5. Verify static health: `npm run build` and `npx tsc --noEmit` both pass.

No PlayCanvas Editor, account, or cloud project is required — this is **standalone**.

---

## Build and test procedure

1. **Typecheck:** `npm run typecheck` (strict, must be clean).
2. **Build:** `npm run build` → emits `dist/` (this also runs `tsc --noEmit` first).
3. **Preview:** `npm run preview -- --host` and load the printed URL.
4. **Static checks (see `SPEC.md` §11):** only `playcanvas` as runtime dep; `node_modules/`,
   `dist/`, vite cache git-ignored; no allocations in update loops.
5. Commit only after build + typecheck are green (git is handled outside this app).

---

## Device test procedure (Android XR glasses — Chrome / Comet)

> Requires HTTPS and a user gesture. Cannot be done from Claude Code.

1. Build and serve `dist/` over **HTTPS** reachable from the glasses.
2. On the glasses, open the URL in **Chrome** or **Comet**.
3. Confirm the page reports a **secure context**; the `Enter AR` button should be enabled if
   immersive-AR is available. If you see the **unsupported** message, the browser/device lacks
   immersive-AR — verify you are on a supported Android XR browser and HTTPS.
4. **Tap `Enter AR`** (user gesture). The real world should remain visible (optical see-through);
   the cuff and a placement reticle appear.
5. **Placement:** look at a surface; if hit test is available a reticle snaps to it — confirm/place.
   Otherwise the cuff is placed at a fixed comfortable distance.
6. **Hand interaction (primary):** pinch (thumb+index) near the cuff to grab; move; un-pinch to
   release. Hover should show a subtle highlight.
7. **Fallback checks:** if hands are unavailable the app should switch to **ray** selection; with no
   usable ray it should switch to **place/inspect** (orbit/zoom). Confirm no crash on transitions.
8. **Close-up:** bring the cuff to ~6–12 inches; verify materials/labels stay crisp (inspection mode).
9. **Lighting:** move between bright/dim areas; with light estimation available the cuff’s key light
   should track real lighting and stay readable.
10. **Performance:** watch for stable frame rate; the status panel exposes the active quality profile
    and frame timing. Confirm adaptive downgrade keeps motion smooth without changing the cuff’s look.
11. **Exit:** end the session (system gesture / `Esc` where available) — app returns to inspect mode
    cleanly.

Record: device, browser+version, which capabilities reported available, which interaction layer was
active, frame rate, and any feature that fell back.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Enter AR` missing / disabled | Not HTTPS, or immersive-AR not available | Serve over HTTPS; use a supported Android XR browser; check the on-screen capability/debug readout. |
| Session won’t start on tap | Start not from a user gesture, or feature request rejected | Ensure start is triggered by the button tap; features are optional + gated, so this usually means the gesture path; check console. |
| Real world not visible (black) | `clearColorBuffer` left on / skybox in AR | AR camera must have `clearColorBuffer = false` and no background; verify scene/AR mode. |
| No hand interaction | Hand tracking unsupported/lost | App should auto-fall back to ray, then place/inspect; confirm capability log; this is expected on devices without hands. |
| Placement reticle never appears | Hit test unsupported | Fixed-distance placement is used instead; not an error. |
| Cuff looks flat/dim in AR | Additive display washes contrast; lighting low | Light estimation + ambient drive readability; avoid emissive; this is display physics, tuned in materials. |
| Stutter / frame drops | Thermal throttle or quality too high | Adaptive monitor should step down; you can force **Balanced**; reduce framebuffer scale; enable foveation. |
| Blurry close-up | Anisotropy/mip too low or low texel density | Use a higher quality profile; ship higher-tier textures (`ASSET_PIPELINE.md`). |
| Big first-load delay | Large uncompressed assets | Use procedural placeholders for first paint; compress real assets to KTX2 + meshopt. |
| `tsc` errors after edits | Strict-mode violation | Fix types; do not loosen `strict`; re-run `npm run typecheck`. |
| Real asset imported wrong (scale/orientation) | Unity-origin conventions | Follow `ASSET_PIPELINE.md` scale (meters)/orientation (+Y up, -Z fwd)/material-separation rules. |
