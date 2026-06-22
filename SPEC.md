# SPEC — AR Blood Pressure Cuff (WebXR / PlayCanvas, No Unity)

> Authoritative product + engineering specification for **v1**.
> Stack: **PlayCanvas (standalone) + TypeScript (strict) + ESM + Vite**. **No Unity anywhere.**

---

## 1. Product Goal

Deliver a **medically credible, close-inspection-capable AR training object**: a blood pressure
(BP) cuff rendered with training-grade realism that a user wearing optical see-through AR glasses
can summon into their real environment, place, walk around, pick up, and inspect from ~6–12 inches.

The application is a **simulation-quality medical product visualization**, not a game. The visual
target is realism + readability + stable performance, explicitly **not** toy-demo aesthetics
(no bloom, no glow, no exaggerated reflections).

Primary use: clinical/medical training and product familiarization (sizing, component
identification, tubing/gauge/Velcro inspection) on first-edition Android XR glasses.

---

## 2. Target Device Assumptions

- **Device family:** Samsung / Google **first-edition intelligent (Android XR) glasses**.
- **Display:** **optical see-through** AR (additive display — black renders as transparent; the real
  world is always visible behind the rendered content). There is **no camera passthrough composite**
  to render into; we render lit geometry on a transparent buffer.
- **Tracking:** 6DoF inside-out world tracking provided by the platform via WebXR reference spaces
  (`local-floor` preferred, `local` fallback).
- **Primary interaction:** **WebXR Hand Input** (hand tracking is the default interaction model on
  Android XR). Controllers are not assumed to exist.
- **Compute/thermal:** mobile-class XR SoC. Thermal throttling and battery are real constraints →
  we bias toward a high but **stable** frame rate over ornamental fidelity.

### Verified platform facts (June 2026)
Android XR's browser supports these WebXR modules: **Device API, AR Module, Gamepads, Hit Test,
Hand Input, Anchors, Depth Sensing, Light Estimation**. It does **NOT** support WebXR
**image/marker tracking**. **Hand Input is the default interaction.**
Source: <https://developer.android.com/develop/xr/web>

Implications folded into this spec:
- We **do not** use `imageTracking` (unsupported). No marker assets are shipped.
- We treat Hit Test, Hand Input, Anchors, Depth Sensing, Light Estimation as **available but
  capability-gated** — every one is detected at runtime and has a fallback.

---

## 3. Browser / Runtime Assumptions

- **Target browsers:** **Chrome** and **Comet** on Android XR.
- **WebXR session start requires a user gesture** (button press) — cannot be auto-started.
- **Secure context (HTTPS) is mandatory** for WebXR (localhost is treated as secure for dev).
- Engine API used is **WebXR Device API via PlayCanvas `app.xr`** (verified against the installed
  `playcanvas@2.19.x` `.d.ts`). No reliance on browser-specific non-standard APIs.
- WebGL2 is assumed as the graphics backend (PlayCanvas default device). WebGPU is **not** required
  and not assumed available in the XR browser; the build does not depend on it.

---

## 4. Optical See-Through AR Assumptions

- The camera that renders the XR view has **`clearColorBuffer = false`** so the real world shows
  through. We never draw a fullscreen background/skybox in AR.
- **No decorative world geometry.** The only rendered content is the cuff, a minimal placement
  reticle/footprint, and a small amount of world-anchored UI.
- Because the display is additive, **pure black is invisible** and **bright/large emissive areas
  wash out** against the real world. Material strategy avoids large flat blacks for silhouette-
  critical parts and avoids unnecessary emissive.
- Depth occlusion of virtual-by-real is only possible where **Depth Sensing** is available; we treat
  real-world occlusion as a progressive enhancement, never a correctness requirement.
- A non-AR **"inspect" desktop/preview mode** exists (skybox + neutral background) for development
  and for devices/browsers without immersive AR.

---

## 5. Interaction Model

Three layered interaction strategies, selected at runtime by capability detection. The selection
logic is centralized (`src/config/capabilities.ts` + `src/ar/fallbackModes.ts`) and logged.

### Layer Selection Logic
```
if (session is immersive-ar AND hand input present AND joints tracked)  -> PRIMARY  (hands)
else if (session active AND any input source with target ray)           -> SECONDARY (ray)
else                                                                     -> FALLBACK  (place/inspect)
```
Selection is re-evaluated when input sources are added/removed and when hand tracking is lost/regained
so that the app degrades and recovers cleanly mid-session.

### Primary — WebXR Hand Tracking (default on Android XR)
- Near-object **pinch-to-grab** (thumb-tip ↔ index-tip distance threshold, with hysteresis to avoid
  flicker). On pinch over/near the cuff → **attach-on-pinch**; cuff follows the pinch midpoint.
- **Stable release** on un-pinch; velocity is damped to avoid the object flying off.
- **Subtle hover/proximity highlight** (small emissive/rim bump) when a fingertip is within the
  proximity radius — readable but not glowy.

### Secondary — Ray Interaction
- Used when hand joints are unavailable but an input source exposes a target ray
  (`tracked-pointer`/`gaze`/transient screen tap).
- Ray from `inputSource.getOrigin()/getDirection()` → ray/bounds intersection for hover + select.
- Select to place (via hit test if available, else fixed distance in front), select-hold to carry.

### Fallback — Simplified Place / Inspect
- For unsupported capability sets (no hands, no usable ray, or non-immersive preview): the cuff is
  placed at a fixed comfortable distance in front of the viewer and can be **orbited/zoomed** for
  inspection. Guarantees the core value (look at a realistic cuff up close) always works.

---

## 6. Cuff Realism Requirements

The cuff is the one object that must look real. Realism budget is spent here first and cut here last.

Required materially-distinct surfaces (separate PBR materials, see `src/materials/cuffMaterials.ts`):
- **Woven cuff body** — fabric: high roughness, subtle normal/weave, low/no metalness.
- **Velcro surfaces** — hook vs loop differentiated by roughness + normal detail.
- **Stitching** — via normal/AO detail and/or thin geometry; readable seams.
- **Printed labels / markings** — albedo decals; crisp at close range; correct sizing text.
- **Rubber tubing** — soft sheen dielectric, mid roughness, slight subsurface-like warmth.
- **Connectors** — rigid plastic/metal; lower roughness than tubing.
- **Gauge body** — housing (metal/plastic) + **dial face** (printed) + **needle**.
- **Transparent lens** (if present) — thin transparent dielectric over the gauge face.
- **Metallic details** (if present) — chrome/steel bezel, valve, ferrules.

PBR requirements: high-quality metalness-workflow PBR, **realistic roughness variation**,
**normal maps**, **ambient occlusion**, configurable texture sets, **size variants**, and a
**close-up inspection mode** that raises anisotropy/mip bias and keeps texel density high.

**Anti-requirements:** no generic glossy "game" plastic; no mirror-like reflections; no emissive
on physical surfaces; no bloom/glow.

---

## 7. Performance Strategy

Goal: **highest *stable* frame rate**, never sacrificing smooth interaction. Acceptable first load
**2–5 s**.

- **Stable-first:** interaction + tracking smoothness outrank ornamental effects. We cap dynamic
  cost and prefer baked/cheap approximations (AO maps over SSAO, IBL over many real-time lights).
- **One key directional light + image-based ambient** (env atlas). Real-time shadows are **off by
  default** in AR (expensive, low payoff on additive displays) and gated behind the Ultra profile.
- **No per-frame heap allocations** in update/tick loops. All hot paths reuse pooled
  `Vec3/Quat/Mat4` temporaries (`src/utils/math.ts` scratch pool; enforced by code review + this
  spec). Verified by inspection of every `app.on('update')` / controller `update()`.
- **Resolution control:** `framebufferScaleFactor` chosen per quality profile; `maxPixelRatio`
  clamped. **Fixed foveation** enabled in-session when supported to recover edge fill cost.
- **Adaptive quality:** `PerformanceMonitor` tracks a rolling frame-time average and can step the
  active quality profile **down** (and cautiously back up) to hold the target frame rate. Cuff
  identity is preserved across all steps; we shed effects, scale, and foveation first.
- **Load budget:** minimal dependency surface (`playcanvas` only at runtime), procedural placeholders
  so first paint never blocks on large downloads, async GLB/texture loading with a loading screen,
  and a path to **KTX2/Basis + meshopt** compression for real assets (see `ASSET_PIPELINE.md`).

---

## 8. Quality Profile Strategy

Three profiles — **Ultra**, **High**, **Balanced** — defined in `src/config/qualityProfiles.ts`.

| Knob | Balanced | High | Ultra |
| --- | --- | --- | --- |
| `framebufferScaleFactor` | 0.8 | 1.0 | 1.0 |
| `maxPixelRatio` | 1.0 | 1.0 | 2.0 |
| Anisotropy | 4 | 8 | 16 |
| Real-time shadows | off | off | on (1 light) |
| Fixed foveation | high | medium | low |
| Env reflections | low mip | mid | high |
| Adaptive downgrade target | hold | hold | may drop to High |

**Default selection:** choose the **highest tier that is expected to stay stable** for the detected
device, then let the adaptive monitor settle it. Order of sacrifice when under budget:
foveation ↑ → framebuffer scale ↓ → reflections ↓ → shadows off → (only last) reduce non-identity
detail. **Cuff identity (silhouette, key materials, labels) is never reduced.**

---

## 9. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| R1 | **WebXR feature variability** across device/browser (Chrome vs Comet; first-edition HW). *Biggest non-Unity risk.* | High | High | Capability detection for every feature; graceful fallback; nothing is assumed present. |
| R2 | **Hand tracking unavailable/weak/intermittent.** | High | High | 3-layer interaction (hands → ray → place/inspect); live re-selection on track loss/regain; hysteresis on pinch. |
| R3 | **Feature gaps vs native Android XR SDK / Unity** (no marker tracking in WebXR; fewer toggles than native). | High | Med | Scope v1 to supported WebXR modules; document gaps; isolate behind capability layer so native bridge could be added later. |
| R4 | **Optical see-through additive display** washes out bright/large emissive; black is invisible. | High | Med | No skybox/background in AR; avoid emissive on physical surfaces; tune albedo/contrast for additive blend. |
| R5 | **Thermal throttling / battery** on mobile XR SoC. | Med | High | Stable-first budget; adaptive quality; foveation; shadows off by default; clamp resolution. |
| R6 | **No real assets yet** (model/textures pending from user). | High | Med | Procedural placeholders behind an isolated seam; `TODO:` only where a real file is required; swap-in documented. |
| R7 | **Per-frame GC stalls** from allocations in hot loops. | Med | High | Mandatory scratch-temporary reuse; no `new` in update/tick; reviewed per file. |
| R8 | **WebXR requires HTTPS + user gesture**; misconfig blocks AR entirely. | Med | High | AR entry button (gesture); secure-context check + clear messaging; HTTPS guidance in README/RUNBOOK. |
| R9 | **GLB authored in Unity scale/orientation conventions** imports wrong. | Med | Med | Strict scale/orientation/material-separation rules in `ASSET_PIPELINE.md`; validation checklist. |
| R10 | **PlayCanvas XR API drift** vs this spec. | Low | Med | Code written against the *installed* `.d.ts`; all feature use capability-gated so version differences degrade, not break. |
| R11 | **Depth sensing absent** → no real-world occlusion of the cuff. | Med | Low | Treated as progressive enhancement only; never required for correctness. |
| R12 | **Comet browser parity unknown** for some modules. | Med | Med | Same capability gates as Chrome; no Chrome-only assumptions; unsupported message path. |

---

## 10. Acceptance Criteria

1. **No Unity** in the repo or runtime; stack is PlayCanvas standalone + TS (strict) + ESM + Vite.
2. `npm run build` (Vite production build, includes `tsc --noEmit`) **passes**.
3. `npx tsc --noEmit` (strict) **passes**.
4. App boots to an interactive state with **procedural placeholders** (no real assets required) and
   reaches first interactive paint within the **2–5 s** budget on target-class hardware.
5. An **AR entry button** appears only when immersive-AR is reported available; otherwise a clear
   **unsupported** message and the desktop inspect mode are shown.
6. AR session starts **only on user gesture**, requests features **capability-gated**, and ends cleanly.
7. **Interaction degrades** hands → ray → place/inspect with no crash and recovers on capability change.
8. The cuff renders with **distinct PBR materials**, **size variants** (pediatric/small, medium,
   large), and a **close-up inspection** path; no toy-demo effects.
9. **Quality profiles** (Ultra/High/Balanced) exist; default picks the highest stable tier; adaptive
   monitor can step down/up while preserving cuff identity.
10. **No per-frame heap allocations** in update/tick loops (scratch temporaries reused).
11. Replacing placeholders with real assets requires touching only the documented seam
    (`materials/textureSets.ts`, `entities/cuffVariants.ts`, `public/assets/...`), no architecture change.

---

## 11. Verification Checklist

Static / build (runnable here):
- [ ] `npm install` succeeds.
- [ ] `npm run build` succeeds (Vite prod build + `tsc`).
- [ ] `npx tsc --noEmit` succeeds with `strict: true`.
- [ ] No `new pc.Vec3/Quat/Mat4` (or array/object literals) inside any `update`/tick callback.
- [ ] Only runtime dep is `playcanvas`; dev deps limited to `typescript`, `vite`, `@types/node`.
- [ ] `node_modules/`, `dist/`, vite cache are git-ignored.

Runtime (requires WebXR device/browser — **cannot be verified in this environment**, listed for device test):
- [ ] Loads over HTTPS; secure-context check passes.
- [ ] `Enter AR` appears when immersive-AR available; unsupported message otherwise.
- [ ] AR starts on tap; world tracking stable; real world visible (clearColorBuffer off).
- [ ] Hand pinch grab/release works; hover highlight subtle.
- [ ] Disabling hands falls back to ray; removing ray falls back to place/inspect.
- [ ] Hit-test placement works where supported; fixed-distance placement otherwise.
- [ ] Light estimation (when available) drives key light; scene stays readable in varied lighting.
- [ ] Frame rate stable; adaptive monitor steps quality without changing cuff identity.
- [ ] Close-up (6–12 in) inspection stays crisp.

---

## 12. Assumptions (documented per EXECUTION MODE)

- **A1.** Installed `playcanvas@2.19.x`: `app.xr.start()` is **callback-based and returns `void`**
  (not a Promise); `app.xr` may be **`null`**; tonemapping/gamma are **CameraComponent** properties.
  All code is written against these installed types.
- **A2.** `app.xr.start()` accepts `{ optionalFeatures, anchors, depthSensing, callback }`. Hand
  input, hit test, and light estimation are requested via `optionalFeatures` strings and/or their
  subsystem `start()`/availability, then **gated on `*.supported`/`*.available`**. Depth sensing is
  requested via the `depthSensing` option and treated as a **capability flag only** (no required
  per-frame depth read in v1).
- **A3.** Optical see-through ⇒ **no camera passthrough texture** to composite; we render lit geometry
  on a transparent buffer with `clearColorBuffer = false`. `requestSceneColorMap` is **not** used.
- **A4.** WebXR **image/marker tracking is unsupported** on Android XR ⇒ omitted entirely; no marker
  assets. `public/assets/tracking/` is retained for structure but unused in v1.
- **A5.** No real cuff model/textures are present yet ⇒ **procedural placeholder cuff** (boxes/cylinder/
  torus primitives + procedurally generated textures) standing in, behind an isolated seam, with the
  exact same material/variant interfaces the real asset will use.
- **A6.** Cuff dimensions for placeholders use realistic adult/pediatric arm circumferences (see
  `cuffVariants.ts`); real values come from the supplied model. Units are **meters** (WebXR/PlayCanvas
  world unit = 1 m).
- **A7.** Reference photos exist but are **not embedded**; they inform material/label tuning only and
  are not required at runtime.
- **A8.** `gltfpack`/KTX2 tooling is **documented but not run** here (not installed); asset compression
  is a device-prep step.
- **A9.** Target frame rate is whatever the device reports as highest stable (commonly 72/90); we read
  `app.xr.supportedFrameRates` and request the highest, falling back silently if unsupported.
- **A10.** "Comet" is treated as a Chromium-class WebXR browser; same capability gates apply, no
  Comet-specific code.
- **A11.** The supplied artist asset (`Blood Pressure.blend`, Blender 2.91) is the **aneroid gauge
  head + coiled tube + inflation bulb** — *not* the fabric arm cuff (a separate asset, still pending
  from the artist's other format folders). It was converted headlessly (bpy 5.0): default cube /
  camera / light stripped; it was modelled in **millimetres** (scene `scale_length = 0.001`), so the
  geometry was baked ×0.001 to real metres (~0.185 × 0.40 × 0.049 m); the 2560² `Screen clock.tif`
  dial was relinked and resized to 1024 (gltf-transform), giving `public/assets/models/
  blood_pressure_device.glb` (~2.4 MB, 43k tris, geometry **uncompressed** so no Draco/KTX2 decoder
  set-up is required). It is wired as the **Medium** variant's `modelUrl`; its PBR material names
  (Glass/Plastic_Grey/Matte_Black/Screen) don't collide with the cuff slot names, so `buildFromModel`
  keeps the artist materials. Pediatric/Large stay procedural until the fabric cuff lands. The
  `forest.exr` world HDRI and reference JPGs were absent and are not required (the app lights the
  scene itself).
- **A12.** The real device is **shared across all three sizes** (`modelUrl` → the same GLB,
  `modelScale = 1.0`); size variation comes from the **procedural fabric wrap** (`bladder` dims),
  which is **composited** onto the device by `BloodPressureCuff` (gauge/tube/bulb from the GLB; wrap
  + Velcro + label procedural). The wrap's position relative to the device is the single tunable
  `WRAP_OFFSET` in `bloodPressureCuff.ts`. The GLB also carries the artist's **rolled-up cuff at the
  back of the gauge**; the procedural wrap is the deployable training cuff until a real cuff mesh is
  supplied. The procedural gauge needle is absent on the real device (static dial) — the gauge and
  inflation controllers already null-guard `gaugeNeedle`, so the cycle drives the value without it.
