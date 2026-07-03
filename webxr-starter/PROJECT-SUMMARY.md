# PROJECT-SUMMARY

One page. What you run, where, what matters, and what to test first.

---

## In one sentence

A PlayCanvas WebXR starter that runs immersive **VR in Chrome on Android XR** and falls back to a
normal mouse-driven page on a PC — managed entirely from your PC with one dev command.

## What I run (on the PC)

```bash
npm install      # one time
npm run dev      # every day
```

- First command to run: **`npm install`**, then **`npm run dev`**.
- First URL to open: **http://localhost:5173**

## Where things run

- **PC browser:** the whole app runs here for development; the mouse selects the cube.
- **Android XR headset (Chrome):** the same app, entered as immersive VR via the **Enter VR** button.

## The file that matters most

- **`src/scene-builder.js`** — the room. Edit this first to change the cube, sign, lights, and to add
  new objects. It is engine-only (no UI code), so it stays clean as you grow the scene.

Supporting files:
- `src/main.js` — boot + interaction wiring (mouse, touch, XR select).
- `src/xr-manager.js` — WebXR checks + start/exit session.
- `src/ui-overlay.js` / `src/styles.css` — the DOM panel + button.

## What to test first (in order)

1. **PC render:** open http://localhost:5173 — you should see a red cube, a floating sign, and a status
   panel.
2. **PC interaction:** click the cube — it toggles **red ↔ green** and the sign updates.
3. **Headset load:** via `adb reverse` (USB) or an HTTPS host, open the page in Chrome on the headset.
4. **Enter VR:** the button is enabled on the headset; click it to open immersive VR.
5. **XR interaction:** pull the trigger / pinch to select the cube in 3D.

## Guardrails baked in

- XR only starts from a **user gesture** (the button) — required by browsers.
- Every WebXR capability is **checked** before use; missing device → graceful desktop fallback.
- Immersive VR needs a **secure context** (`https://` or `http://localhost`).
- Runs directly in the browser (no native-engine pipeline). No backend, database, or auth. Runtime
  dependency is **PlayCanvas** only.

## Where to grow it (healthcare simulation)

- Add props/room detail in `src/scene-builder.js`.
- Add "hotspots" as extra entities with the same select pattern used for the cube.
- Add a training flow/state machine module and call it from `main.js`.
- Add scoring/telemetry hooks around the select handlers.

## Full docs

`README.md` · `RUNBOOK.md` · `DEPENDENCY-ORDER.md` · `HOSTING.md` · `TROUBLESHOOTING.md`
