# AR Blood‑Pressure Device — PlayCanvas / Android XR

A corrected, glasses‑aware blueprint and runnable prototype for putting a 3D
model of a blood‑pressure meter into an AR scene, targeting **Samsung / Google
(Android XR)** hardware as well as phones.

This repo exists to answer one question: *is the PlayCanvas WebXR **image‑tracking**
approach the most efficient, accurate, and compatible way to do this on
Samsung/Google glasses?* Short answer below, full reasoning in
[`docs/platform-compatibility.md`](docs/platform-compatibility.md).

---

## TL;DR verdict

**No — not as proposed.** The advice you were given (PlayCanvas + WebXR
*image tracking*, with the photo as the marker) is a reasonable recipe for
**phone** web‑AR, but it is the *wrong primitive* for Samsung/Google glasses,
and the chosen marker is weak. Three problems:

| Your goal | The image‑tracking plan | Reality (verified June 2026) |
|---|---|---|
| **Compatible with Samsung/Google glasses** | Relies on WebXR image tracking | **Android XR's browser does not support image tracking at all.** Its WebXR modules are Device, AR, Gamepads, Hit Test, Hand Input, Anchors, Depth Sensing, Light Estimation — no image/marker tracking. So the plan literally cannot run on the glasses. |
| **Image accuracy / stable tracking** | Use the attached photo as the marker | The attached photo is a **poor marker**: hands, skin, and a soft out‑of‑focus background give few stable, unique features. Even on a phone it will flicker. |
| **"Identical, 3D"** | Optionally reconstruct from the photo | A single photo → 3D gives a plausible *front* but a **hallucinated back**; it will not be "identical." Identical‑3D needs a real model (CAD/multi‑photo), or the photo shown as a flat textured plane (2.5D, not true 3D). |

WebXR image tracking is also still **experimental** in 2026 — Chrome‑on‑Android
only, behind `chrome://flags#webxr-incubations`. It is not a production‑grade,
cross‑device feature even before you get to glasses.

---

## The efficient approach instead

Decouple the two things you actually want — **(A) an accurate 3D model** and
**(B) a way to anchor it in AR** — and pick the anchoring primitive that the
target hardware actually supports.

### B) Anchoring — use what Android XR supports
- **On glasses / headset (Android XR):** place the model **markerless** using
  **WebXR Hit Test + Anchors** (detect a real surface, drop the model, anchor it).
  This is first‑class on Android XR and is the natural interaction model for
  glasses anyway (you don't want to hold a printed card in front of smart
  glasses). **You can keep PlayCanvas** — it supports hit test/anchors.
- **On phones, if you specifically need the printed photo to be the anchor:**
  WebXR image tracking *can* work (Chrome/Android, flag enabled) — the corrected
  code is in [`web-ar/image-tracking-phone.js`](web-ar/image-tracking-phone.js).
  Treat it as a phone‑only fallback, and use a *designed* high‑contrast marker,
  not the hands photo.
- **★ Chosen path for Samsung/Google glasses (speed + reality): Unity 6 +
  AR Foundation + the Android XR OpenXR provider.** It's the best balance of fast
  iteration and visual fidelity, and Google co‑developed the integration. The
  full scaffold (scripts, package manifest, and an exact Editor setup checklist)
  is in **[`unity-android-xr/`](unity-android-xr/)**. Unreal has a higher fidelity
  ceiling but is heavier/slower; native Jetpack XR is leanest at runtime but
  slowest to build. See [`unity-android-xr/README.md`](unity-android-xr/README.md)
  for the scored comparison.

### A) The model — get something genuinely "identical"
Don't reconstruct the device live in the browser. Produce a clean **GLB** once,
then load it. Options, fastest → most accurate, in
[`docs/3d-model-pipeline.md`](docs/3d-model-pipeline.md):
single‑image AI (TRELLIS / Hunyuan3D / Stable Fast 3D) → multi‑photo
photogrammetry → CAD. GLB is the right runtime format for both PlayCanvas and
Android XR.

---

## Updated step‑by‑step

1. **Decide the anchor model by target.** Glasses → markerless (hit test +
   anchors). Phone‑with‑printed‑photo → image tracking fallback.
2. **Get the GLB** (see `docs/3d-model-pipeline.md`). Keep it
   glasses‑friendly: ≤ ~100k triangles, ≤ 2k textures, Draco/meshopt compressed.
3. **Drop it in** at `web-ar/assets/model.glb`. (A primitive placeholder renders
   if it's missing, so the app runs immediately.)
4. **Serve `web-ar/` over HTTPS** (WebXR requires a secure context). Quick local
   option in the folder: `npx serve` or `python3 -m http.server`, then tunnel
   with HTTPS, or host on any static HTTPS host.
5. **Open on the device** (Galaxy XR / Android XR browser, or Chrome on Android),
   tap **Start AR**, look at a surface, and **pinch/tap to place** the model.
6. **(Phone image‑tracking only)** print a designed marker at a known width, set
   that width in meters in the script, enable the Chrome flag.
7. **Tune.** Adjust scale/offset so the device sits *on* the surface; add a
   shadow/reticle for grounding.

---

## What's in here

```
unity-android-xr/            ★ RECOMMENDED for glasses (speed + reality)
  README.md                  Why Unity, scored vs Unreal/Jetpack XR/WebXR
  SETUP.md                   Exact Unity 6 Editor steps: packages, XR, URP, scene, build
  Packages/manifest.json     AR Foundation 6 + Android XR OpenXR provider deps
  Assets/Scripts/            Placement+anchor, light estimation, scene permission
web-ar/                      Quick web demo / phone fallback
  index.html                 Runnable PlayCanvas WebXR app (loads engine from CDN)
  app.js                     Markerless placement: hit test + anchors (glasses-ready)
  image-tracking-phone.js    Corrected, phone-only image-tracking fallback (experimental)
  assets/README.md           Where to put model.glb + marker guidance
docs/
  3d-model-pipeline.md       How to produce an "identical" GLB (AI / photogrammetry / CAD)
  platform-compatibility.md  Verified support matrix + sources
```

## How to run (local)

```bash
cd web-ar
python3 -m http.server 8080      # or: npx serve
# then open over HTTPS on the headset/phone (WebXR needs a secure context)
```

> Note: I scaffolded this without your actual GLB or the original JPG (neither
> was available as a file in this environment). The app runs with a placeholder
> box until you drop a real `model.glb` into `web-ar/assets/`.

See `docs/platform-compatibility.md` for the sources behind every claim above.
