# Unity — Android XR (Samsung / Google) — recommended path

This is the **recommended workflow** for putting a realistic 3D blood‑pressure
device into AR on **Samsung Galaxy XR / Google Android XR** glasses & headset,
optimized for your two priorities: **development speed** and **visual reality**.

## Why Unity (and not another vendor)

Android XR officially supports five paths — **Jetpack XR (native), Unity, Unreal,
Godot, WebXR**. Scored against *speed + reality* for glasses:

| Stack | Dev speed | Visual reality | Android XR maturity | Verdict |
|---|---|---|---|---|
| **Unity 6 + AR Foundation + Android XR OpenXR** | ★★★★ | ★★★★ | ★★★★ (Google co‑developed) | **Chosen** — best balance |
| Unreal Engine | ★★ | ★★★★★ | ★★★ (newer) | Higher ceiling, heavier, slower iteration |
| Jetpack XR (native Kotlin) | ★★ | ★★★ (you build rendering) | ★★★★★ (lowest overhead) | Best runtime, slowest to build |
| Godot | ★★★ | ★★★ | ★★ (just added) | Promising, less proven |
| WebXR (PlayCanvas) | ★★★★★ | ★★ | ★★★ | Fastest to ship, lowest fidelity, no image tracking → see `../web-ar` |

Unity gives fast iteration (visual editor, asset ecosystem, hot‑reload) **and**
strong realism on mobile‑class XR GPUs (URP PBR, post‑processing, baked lighting,
runtime **light estimation**). Google positions Unity as the path for rich 3D
experiences, and OpenXR projects port to Android XR with limited rework.

## What's here (a starter scaffold — scripts + manifest)

```
Packages/manifest.json                     AR Foundation 6 + Android XR OpenXR provider deps
Assets/Scripts/
  ARPlacementController.cs                  Markerless: hit-test a surface, place + ANCHOR the model
  ARLightEstimationController.cs            Match virtual lighting to the real room (reality boost)
  ARScenePermissionRequester.cs            Requests the SCENE_UNDERSTANDING permission planes need
SETUP.md                                    Exact Unity Editor steps: packages, XR, URP, scene, build
.gitignore                                  Standard Unity ignores
```

> This is intentionally a **scripts + manifest** starter, not a one‑click binary
> project. Unity's `ProjectSettings` (XR plug‑in enablement, the scene, URP asset)
> must be configured in the Editor — those are environment‑specific and can't be
> reliably hand‑authored. `SETUP.md` is the exact, ordered checklist to finish it,
> and it's ~20 minutes.

## The model

Bring the device in as a **GLB** (see `../docs/3d-model-pipeline.md`) and import it
with **glTFast** (`com.unity.cloud.gltfast`). Keep it glasses‑friendly:
≤ ~100k triangles, ≤ 2k textures, PBR materials. Realism tips are in `SETUP.md`.

See `SETUP.md` to build and deploy to a Galaxy XR device or the Android XR emulator.
