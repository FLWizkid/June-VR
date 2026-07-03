# DEPENDENCY-ORDER

The strict order of operations. Each step must finish before the next begins.

```
1. Install Node.js 18+            ──►  required by everything below
2. cd webxr-starter               ──►  you must be in the project folder
3. npm install                    ──►  must finish before any npm run … command
4. npm run dev                    ──►  needs step 3
5. Test on PC (click the cube)    ──►  needs step 4; must pass before headset
6. Choose a headset path          ──►  A (USB+adb) or B (HTTPS host)
        ├─ Path A: adb reverse    ──►  needs step 4 still running + USB debugging on
        └─ Path B: npm run build  ──►  needs step 3; then host dist/ on HTTPS
7. Open on headset in Chrome      ──►  needs step 6
8. Click "Enter VR" (user gesture)──►  needs step 7; XR will NOT start on its own
9. Select the cube (trigger/pinch)──►  needs an active XR session from step 8
```

## Hard rules

- **Node before npm.** No `npm` command works without Node.js installed.
- **`npm install` before `npm run …`.** The dev server and build need `node_modules/`.
- **PC test before headset.** If the cube does not toggle on your PC, fix that first — the headset
  will not be any different.
- **Secure context before immersive VR.** The headset page must be on `https://` **or**
  `http://localhost` (via `adb reverse`). A plain `http://<lan-ip>` page cannot start immersive VR.
- **User gesture before XR.** The immersive session only starts from the **Enter VR** button click.

## What does NOT depend on anything special

- Editing `src/scene-builder.js` and other source files — just save while `npm run dev` runs.
- There is **no backend, database, or login** to set up for v1.
