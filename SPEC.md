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
Android XR's browser lists these WebXR modules: **Device API, AR Module, Gamepads, Hit Test,
Hand Input, Anchors, Depth Sensing, Light Estimation**. Its published list does **not** currently
enumerate WebXR **image/marker tracking**. **Hand Input is the default interaction.**
Source: <https://developer.android.com/develop/xr/web>

Implications folded into this spec:
- We **do** use `imageTracking` as a **first-class, ungated** feature per the resolved conflict
  decision in **CLAUDE.md §4.1**: it is built directly against the engine (`src/ar/imageTracking.ts`)
  and is **not** wrapped in the `.supported`/fallback discipline the other features use. Marker
  images are sourced from the **Room environment assets** (`public/assets/tracking/`); a placeholder
  descriptor ships until the real bytes are wired. Because the Android XR docs don't yet list this
  module, on-device support is **pending confirmation in QA** (verification reminder, not a gate).
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

## 6.5 Training, Animation & Environment (this extension)

The cuff and the BP teaching content are combined into **one AR training experience** (`scene/
trainingScene.ts`): the **existing** cuff (with its grab/inspection/placement/inflation/gauge
controllers) plus an **environment seam** mounted under the same world root with an **independent
transform**, hidden in AR (optical see-through — never paint over the real world). Full design lives
in **`TRAINING_LOGIC.md`**; key points:

- **Procedural motion only** (no baked clips): `animation/` drives the existing cuff — wrap
  translate/tighten, bladder swell from pressure, subtle pickup settle + idle bob, and a hands-off
  **Demonstration timeline**. Conservative, AR-legible ranges; no game-like motion.
- **Procedure state machine** (`training/`): an **engine-free** brain consuming a plain observation
  and emitting prompts/step events. Modes: **guided, placement, inspection, demonstration**. Steps:
  select size → inspect → orient → position → confirm fit → inflate → observe gauge → complete, each
  with an observable success condition and non-blocking corrective feedback.
- **Realism vs. correctness are separated:** realism is in materials/animation; correctness is in
  editable, **`SME-REVIEW:`-flagged** logic centralized in `config/trainingConfig.ts`. **No
  unverified clinical claim is asserted** — see `TRAINING_LOGIC.md` §7 for the SME validation list.
- **Reuse, not fork:** the training/animation layer drives the **existing** `BloodPressureCuff` and
  its controllers via the existing `CuffScene`; the inflation cycle has a **single owner** (ticked
  once per frame) and the animator only **reads** its pressure.

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
| R3 | **Feature gaps vs native Android XR SDK / Unity** (fewer toggles than native; image tracking implemented ungated but not yet listed by Android XR docs, so on-device support is **pending QA**). | High | Med | Scope v1 to WebXR modules; image/marker tracking is built first-class & ungated (CLAUDE.md §4.1) and verified on-device in QA; document gaps; isolate behind capability layer so a native bridge could be added later. |
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
- **A4.** WebXR **image/marker tracking is a first-class, UNGATED feature** (CLAUDE.md §4.1): built
  directly against the engine `imageTracking` API in `src/ar/imageTracking.ts`, requested via
  `optionalFeatures: ['image-tracking']` + `imageTracking: true`, and **not** wrapped in the
  `.supported`/fallback discipline the other WebXR features use. Marker images come from the Room
  environment assets (`public/assets/tracking/`); a placeholder descriptor ships until the real bytes
  are supplied. Android XR docs don't yet list this module, so on-device support is **pending QA**
  (verification reminder, not a gate). See A27.
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

### Training / animation / environment extension assumptions (this change)

- **A13.** **No environment asset is present** (`public/assets/env/` is empty). `entities/
  environmentRoot.ts` is the integration **seam**: it tries to load `assets/env/training_room.glb`
  (absent in v1) and otherwise builds a **minimal procedural stand-in** (neutral floor + faint grid +
  low backdrop) for **non-AR preview only**. Per the optical see-through rule, the whole environment
  root is **disabled while an XR/AR session is active** (`setArMode(true)` hides it) and restored on
  session end. Its transform is **independent of the cuff**. Drop a real env GLB at the seam path to
  replace the stand-in with no code change.
- **A14.** **No source animations exist** (the GLB is static, no skins). **All training motion is
  procedural** (`animation/proceduralMotion.ts` + `cuffAnimator.ts` + `timelineController.ts`),
  driving the **existing** cuff entity (wrap translate/tighten, bladder swell, pickup settle, idle
  bob) and the **existing** inflation/gauge controllers — **no second cuff is forked**. Motion ranges
  are conservative/legible (no game-like motion). Every procedural-motion choice that implies a
  clinical claim is flagged `SME-REVIEW:`.
- **A15.** **Bladder swell** is represented by scaling the procedural fabric body's thickness up to
  ~+45% at full inflation (`bloodPressureCuff.setBladderSwell`), mapped from the live inflation
  pressure. This is an **illustrative** affordance, not a measured deformation (SME-REVIEW).
- **A16.** The **training state machine** (`training/procedureStateMachine.ts`) is **engine-free**: it
  consumes a plain `TrainingObservation` and emits prompts/step events, so clinical logic
  (`config/trainingConfig.ts`, `training/stepDefinitions.ts`, `errorStates.ts`, `validationRules.ts`)
  is reviewable by an SME without reading 3D/WebXR code. **Visual realism and procedure correctness
  are deliberately separated.** All thresholds (pressures, rates, tolerances) are **simulator
  scaffolding** centralized in `trainingConfig.ts` and flagged `SME-REVIEW:` — none is asserted as
  validated clinical guidance (see `TRAINING_LOGIC.md` §7).
- **A17.** The "**correct**" cuff size for the demo patient arm is treated as **Adult/Medium**
  (`trainingStepController.notifySizeChosen`); other sizes raise a non-blocking `WrongSize` hint.
  Real sizing is bladder-vs-circumference; flagged for SME review.
- **A18.** Placement correctness is validated against a **captured target pose** (the cuff's pose when
  the position step begins), not against an arm/anatomy model (none shipped). A translucent target
  marker shows the goal during the position step. Orientation/position tolerances are XR-interaction
  affordances, not clinical bands (SME-REVIEW). The training/animation tick is **allocation-free**
  (reused observation + validation-result structs, scratch math), consistent with §7.
### Patient-arm / cuff-on-arm / IBL / tuning assumptions (this change)

- **A19.** **No patient-arm asset is present** (`assets/models/patient_arm.glb` absent).
  `entities/patientArm.ts` is the seam: it tries to load that GLB and otherwise builds a **procedural
  arm** (tapered upper-arm + elbow + flexed forearm + hand, single matte skin PBR — no game-gloss),
  built **once**, allocation-free. Dimensions/pose come from `ARM_POSE` in `config/trainingConfig.ts`.
  Unlike the environment, the arm is **FOREGROUND content and IS shown in AR** (it is the limb the
  cuff wraps onto); it is **toggleable** (`TrainingScene.setArmVisible` / `PatientArm.setVisible`) for
  sites with a real manikin/arm. The arm exposes `root`, a `setVisible(bool)`, and placement frames
  (`cuffFrame` on the upper arm — the clinically-correct site — and `forearmFrame`). **Anatomy and the
  relaxed bent-elbow rest pose are teaching affordances, NOT anthropometrically validated and NOT
  asserted as the correct measurement posture** — flagged `SME-REVIEW:` and listed in
  `TRAINING_LOGIC.md` §7.
- **A20.** **Cuff-on-arm composition.** The cuff's **procedural fabric wrap** is reshaped from a flat
  slab into a **curved band** that hugs a limb of the arm's measured radius (`BloodPressureCuff.
  setArmWrap` → `buildCurvedBand`; a few flat fabric "staves" tangent to the wrap circle approximate
  the curve while reusing the existing fabric material — **no second cuff is forked**, no custom mesh,
  no runtime allocation). The arm is mounted **under the cuff root** via a small mount node so it
  **rides with the cuff** and always reads as "a cuff on an arm" through placement/grab in every mode;
  the arm remains its **own entity** (distinct geometry/material, toggleable, shown in AR) and is not
  fused into the cuff mesh. The gauge **device GLB is offset beside the arm** (`setDeviceOffset`, value
  from `CUFF_ON_ARM.deviceBesideOffset`), tube implied. **Bladder swell** on a band bulges **radially**
  (vs the slab's thickness) so inflation reads correctly. The clinical placement on the arm
  (`CUFF_ON_ARM.alongUpperArm01`, artery-marker orientation) is centralized in `trainingConfig.ts`,
  flagged `SME-REVIEW:`; the band's curvature constants are cosmetic and live in the entity.
- **A21.** **IBL seam.** `scene/environment.ts` optionally loads `assets/env/env_atlas.ktx2` (a ready
  **prefiltered** atlas, used directly) or, failing that, `assets/env/env.hdr` (a raw equirect,
  prefiltered at runtime via `EnvLighting.generateLightingSource` + `generateAtlas`). Used for
  **reflections only** — `scene.skybox` is **never set** and `skyboxIntensity` is forced to 0 in AR
  (optical see-through; belt-and-suspenders with the camera's `clearColorBuffer = false`). Fully
  capability-guarded (try/catch); any absence/failure degrades to the existing constant ambient + key
  light. The app never depends on an IBL asset.
- **A22.** **Tuning centralization + on-device finalization.** New placement/pose constants live in
  `config/trainingConfig.ts` (`ARM_POSE`, `CUFF_ON_ARM` — clinical-adjacent, flagged `SME-REVIEW:`),
  and the **cosmetic** interaction tunables (pinch close/open + hysteresis, proximity-highlight radius,
  release damping, fallback placement distance, default quality tier) are gathered in
  `config/appConfig.ts` `INTERACTION_TUNABLES` (a documented view aliasing the authoritative
  `APP_CONFIG` fields the controllers read). Clinical-vs-cosmetic separation (CLAUDE.md rule 8) is
  preserved. All such values are **defaults finalized on-device** — pinch/proximity depend on the
  headset's hand-tracking precision; arm pose / cuff-on-arm offsets are confirmed against the real
  see-through framing.
- **A23.** **Runtime verification + fixes (headless smoke test).** `tsc`/Vite/CI never *run* the app,
  so a headless-browser smoke test of the non-AR inspect mode is used to catch runtime-only bugs. It
  found + we fixed two startup-blocking bugs: (1) `LightComponent.type` must be the **string**
  `'directional'` — the numeric `pc.LIGHTTYPE_*` left the internal light type `undefined` and threw in
  the cull loop; (2) the optional **IBL** load hung `start()` — KTX2 needs the **Basis transcoder**
  (`assetRegistry.basisReady`, not yet wired), so `.ktx2` loads now **fail-fast to null**, and optional
  IBL files are **HEAD-probed** first so a missing file / dev-server 200-HTML fallback never blocks
  startup. Anchor creation is now gated on an **active XR session** (it errors outside one). With these,
  inspect-mode startup completes (~0.2 s) and renders the scene; real WebXR/AR + hand-tracking remain
  an on-device check. **Known limitation:** KTX2 texture seams (IBL atlas + file-mode cuff textures)
  stay inert until `pc.basisInitialize(...)` is wired in `assetRegistry.ts`.
- **A24.** **Inspect-mode readability tuning (background + cuff not-too-dark).** The non-AR inspect view
  is a deliberate **close-up** (6–12 in, `INSPECTION_RANGE_METERS`), so a navy cuff fills the frame; it
  was reading too dark (near-black fabric walls, dim/blue-cast background). Tuned, verified against the
  headless smoke render: (1) the **visible background** is the procedural stand-in surfaces (the camera
  `clearColor` is occluded by the backdrop plane), so **floor/backdrop/grid albedos were lifted and
  neutralized** rather than the clear color; (2) the cuff's outward-/side-facing **fabric walls** get
  ~0 direct light from the steep key and constant `scene.ambientLight` is too weak to lift them, so a
  small **shadowless studio "fill dome"** (camera-axis + two ±X side fills) was added and the **fabric
  base albedo raised** off deep navy to a readable medium navy (still not a toy blue — CLAUDE.md rule 2);
  (3) `DEFAULT_AMBIENT` raised and the fills **neutralized toward white** to kill a cold blue cast.
  UI panels keep their own dark backdrop + shadow, so text contrast is preserved against the brighter
  scene. **Best-practice follow-up:** the fill dome is a **no-asset stand-in for the intended "one key
  + IBL"** (CLAUDE.md rule 3); dropping a real/prefiltered **env atlas** into the `scene.envAtlas` seam
  (A21) — or generating a procedural one via `pc.EnvLighting.generateAtlas` — would light the cuff
  omnidirectionally and let the extra fills be retired. **Caveat:** the headless SwiftShader render is
  only a proxy; on-device GPU PBR + WebXR **light estimation** (which overrides the key/ambient in AR)
  is the real appearance and remains an on-device check.
- **A25.** **Scene polish: floor clamp + rounded/high-poly procedural geometry.** (1) Placement now
  **clamps the placed content above the floor plane** (`FLOOR_PLANE_Y = 0`, clearance 0.01 m, in
  `interaction/placementController.ts`): the patient arm hangs ~0.45 m below the cuff origin and was
  poking through the preview floor stand-in. y=0 is assumed to be the floor in BOTH the non-AR preview
  (environmentRoot's plane) and a `local-floor` AR reference space; the clamp only ever LIFTS (a
  hit-test placement on an elevated surface is left where it landed) and runs at placement time only
  (plus one re-clamp after the arm is mounted) — never per frame. (2) The procedural arm is **rounded
  and higher-poly** (48 radial segments, 32-band joint spheres, shoulder/wrist caps, capsule hand
  replacing the block), the cuff band uses **21 staves** (was 9), and the fallback aneroid **gauge slab
  is 3× thicker** (0.054 m, was 0.018) with 48-segment discs/bezel — all BUILD-TIME geometry cost only
  (a few thousand extra triangles, zero per-frame allocations); the real device GLB path is unchanged.
  Cosmetic/spatial only — no clinical value, threshold, or step order touched.
- **A26.** **Bendable elbow, starting folded at 90°.** The procedural arm's elbow pivot is retained
  after build so `PatientArm.setElbowFlexion(deg)` can bend the forearm+hand at runtime (clamped to
  `ARM_POSE.elbowFlexionRangeDeg`, 0–100° — the max is a mesh-clearance cap: the cuff band's lower
  edge is ~5 cm above the elbow and the rigid forearm visibly clips into it past ~100°, verified in
  the headless smoke render), driven by an "Elbow" slider in the Controls panel via
  `TrainingScene.setElbowFlexion`. The default rest pose changed 18° → **90°** (forearm horizontal,
  reading as resting on a surface) — an `SME-REVIEW`-flagged ARM_POSE data change logged in
  TRAINING_LOGIC.md §7 item 10, NOT a validated posture claim. Bending rotates only the elbow pivot
  (allocation-free; UI-event rate); the cuff site on the upper arm never moves, so the wrapped cuff
  and its captured target pose are unaffected. Each bend re-runs the placement floor clamp (A25) —
  the clamp only lifts, so straightening the arm can raise the scene but bending it back never
  lowers it (conservative; re-place to settle). A real arm GLB has no procedural pivot: bending is a
  recorded no-op there until a rigged arm supplies its own elbow. **Startup facing:**
  `ARM_POSE.rootEulerDeg` yaw is −90° so the folded forearm points to the **viewer's left** at
  placement (with yaw 0 it pointed at the camera and read foreshortened); the upper-arm axis stays
  vertical, so the cuff-frame alignment, band wrap, and elbow clearance cap are unaffected.
- **A27.** **Decision (CLAUDE.md §4.1):** the prior ban on WebXR image/marker tracking (old A4/R3) is
  lifted; it is now implemented as a **first-class, ungated** feature (`src/ar/imageTracking.ts`,
  wired through `core/xrBootstrap.ts` + `core/app.ts`) — no `.supported`/fallback gate, allocation-free
  per-frame tick, reusing engine-native `imageTracking.add`. `config/capabilities.ts.imageTracking`
  is informational-only and never used as a gate. A placeholder marker ships; real bytes come from the
  Room environment assets. On-device support on Android XR is **pending QA** (their docs don't yet
  list the module). (Renumbered from a duplicate A19 when merging with the scene-polish entries.)
- **A28.** **Per-part interaction + manual pump/valve + live composite gauge.** (1) The shipped
  device GLB is **one merged mesh** (gauge, coiled hose, bulb — verified from its primitive table),
  so "move the bulb/hose/gauge" moves the WHOLE unit (connected by construction; leashed within
  0.6 m of the cuff, floor-clamped), and the bulb/screen are addressed as **mesh-local pick regions**
  measured from the GLB bounds. (2) `interaction/partsController.ts` classifies pointer rays
  (desktop/phone preview) and hand-pinch points into parts: **arm/assembly** (moves everything
  together), **band** (slides along the upper-arm segment only — clamped so the cuff never leaves
  the arm; slide does not affect the scored target pose), **device unit** (drag), **bulb press**
  (pump squeeze), **screen press** (valve cycle). Ray layer keeps whole-assembly grab.
  (3) The composite gauge previously NEVER moved (the GLB dial is a static baked texture with no
  needle node): a procedural **live dial + needle overlay** is now mounted on the device panel
  (mesh-local placement verified against the runtime graph — the render-entity root carries the GLB
  node's +90° X rotation) and driven by the existing GaugeController; needle sweep sense was
  calibrated against renders (art-perfect alignment awaits the real gauge art asset — the baked art
  is mirrored by the cap UVs and its text is illegible at this size regardless). (4) Manual
  pump/valve piggyback on the SAME inflation owner and surface the SAME phases the training brain
  already observes (pump→inflating, reserve empty→holding, valve→deflating), so no state-machine or
  scoring change; the heartbeat bounce is displayed-value-only (TRAINING_LOGIC §7 item 16).
  (5) The preview orbit camera now also clamps above the floor (a low target + long zoom could put
  the eye under y=0, where a grazing grid line rendered as a huge dark wedge — root cause of the
  artifact first seen after the arm-yaw change), and its orbit target is smoothed so assembly drags
  read as the object moving rather than the world sliding. All per-frame paths stay allocation-free;
  picking/drag math runs at input-event rate.
- **A29.** **Guided-practice completeness + cuff↔gauge hose (screenshot-driven gap fixes).**
  (1) **Connecting hose**: a procedural coiled hose (stretched helix of fixed cylinder segments;
  transform-only updates at event rate) now runs from the band's upper rim to a device-local port,
  visually matching the GLB's baked bulb coil; it re-lays on band slide / device drag / build, and
  it is grabbable (drags the device unit — the shipped GLB being one mesh, gauge/hose/bulb stay one
  connected apparatus). The device-side port is a mesh-local constant, finalized on-device.
  (2) **Confirm-fit was unsatisfiable**: guided mode re-applied the step's wrap state EVERY frame,
  pinning snugness at the step target (1.0 = permanently "too tight", outside the 0.15–0.45 pass
  band) with no learner control. Wrap state is now a baseline applied on step ENTRY only, and the
  band drag gained a TIGHTEN gesture (sideways component = pull the strap around the arm; along-limb
  component still slides), so the learner can actually reach the pass band.
  (3) **Artery index marker**: the inspect/orient steps name it; a red printed strip now sits at the
  band's lower edge, arc-center (SME-REVIEW: illustrative landmark, TRAINING_LOGIC §7 items 10–11).
  (4) **Dial markers**: the observe step says "watch the needle fall through the systolic and
  diastolic markers on the dial" — the procedural dial art now draws red/green markers at the demo
  systolic/diastolic values (from TRAINING_CLINICAL) plus the red 260–300 danger zone from the
  CLAUDE.md gauge spec. (5) **AR permanence**: CLAUDE.md §4 + §7 item 9 (mirrored in AGENTS.md /
  .cursorrules) now record the standing owner order that immersive-AR support may never be removed,
  disabled, or made non-default; preview modes support AR and the terminal mirror, never replace it.
- **A30.** **Orient exercise, rotatable band, stethoscope, torso, furniture, size-swap fix.**
  (1) The band is now ROTATABLE around the limb (`setWrapRotation`; the artery marker, Velcro, label
  and the hose exit all swing with it), and the band's sideways drag is STEP-CONTEXTUAL: 'tighten'
  during confirm-fit, 'rotate' otherwise (set per frame by CuffScene from the machine's step).
  (2) The orient step became a real exercise: entry applies `orientStartOffsetDeg` (+120°,
  SME-flagged), the learner rotates back within `orientationToleranceDeg`, and orientation error is
  measured from the band's rotation (replacing the trivially-satisfied captured-pose comparison) —
  TRAINING_LOGIC §7 item 14. Verified end-to-end (enter 120° misoriented → drag → 10° → advance).
  (3) NEW `entities/stethoscope.ts`: procedural chrome/rubber stethoscope prop, grabbable +
  placeable (leash + floor clamp), mounted under the cuff root; presentational only until an
  auscultation step exists (§7 item 15). (4) The patient arm gained a gowned TORSO + neck + head
  (cosmetic, rides the limb root, hidden with `setArmVisible`). (5) Exam-room furniture stand-ins
  (exam table + equipment cart) live inside the environment root — PREVIEW ONLY, auto-hidden in AR
  like the rest of the stand-in. (6) **Size-swap destruction fix**: `cuff.build()` clears the cuff
  root's children, so cycling size DESTROYED the mounted arm (and would have destroyed the
  stethoscope); size changes now route through `TrainingScene.setSize`, which detaches and
  re-mounts both around the rebuild, re-aligns the arm, re-runs the floor clamp — and re-applies the
  orient offset if the learner is mid-orient (a rebuild zeroes band rotation, which would silently
  pass the step). All new geometry is build-time; drags/relays stay event-rate and allocation-free.
- **A31.** **Torso/furniture removed; bulb animates with pressure.** The patient torso (A30) and the
  exam-room furniture (A30) were removed at owner request. The inflation bulb now EXPANDS as the
  cuff is pumped up and CONTRACTS as pressure is released: since the shipped device GLB is one merged
  mesh (the artist's bulb is the `Platic_Grey_2` primitive and can't be transformed alone), a
  procedural blue ellipsoid — mesh-local, sized from the baked bulb's vertex bounds and coloured to
  its base factor `[0, 0.075, 0.314]` — is overlaid to ENVELOPE the static bulb (hiding it) and
  scaled by the live inflation fraction (rest radii + up to +26%). The animator drives it from the
  same eased pressure→swell value that feeds the bladder, so bulb and band inflate together. Verified
  in the headless render: bulb silhouette rest→pumped +54% area, contracting back on release. No-op
  in full-procedural fallback (no device GLB). Cosmetic; build-time geometry, event-rate scale.
- **A32.** **Gauge face rotated 180° + numeric labels.** (Owner request.) The procedural dial art
  (`materials/textureSets.ts dialTexture`) is rotated 180° (`dialAngle += π`) and the live-needle
  overlay carries the matching +180° (needle-trim yaw 90°→270°), so the needle still lands on the
  correct value — a matched rotation preserves the earlier needle↔art calibration by construction
  (re-verified in renders at 0/120/240 mmHg). Numeric labels are drawn at every major tick (0…300 by
  20) plus the "mmHg" units. The dial art lands VERTICALLY MIRRORED on the GLB gauge cap (established
  with a test pattern: an `scale(-1,1)` pre-flip produced a pure 180° result ⇒ cap = `scale(1,-1)`),
  so tick/marker geometry is left in canvas space (keeping the needle calibration valid) and only the
  TEXT is pre-flipped per-label (`scale(1,-1)`) so it reads upright on the gauge. Cosmetic; the dial
  is procedural placeholder art behind the `gaugeFace` texture seam until real gauge art is supplied.
- **A33.** **Dial text upright; coil tube culled; bendable stethoscope; bulb squeezes with the pump.**
  (Owner request; four scene-polish changes in one batch.) All cosmetic/interaction; the engine-free
  training brain and `config/trainingConfig.ts` clinical values are untouched.
  1. **Dial text upright.** A32's `scale(1,-1)` per-label pre-flip still rendered the numbers
     upside-down on-device. A four-way on-gauge test pattern established the cap transform is a pure
     **180° rotation** (not a vertical mirror), so each label is now drawn with a per-label
     `ctx.rotate(π)` (`uprightText` in `materials/textureSets.ts`) — numbers and "mmHg" read upright.
     Tick/marker geometry is still left in canvas space, preserving the needle calibration by
     construction. Re-verified in headless renders.
  2. **Hanging coil tube removed.** The device GLB's `Plastic_Grey` primitive contained a decorative
     coil that hangs from the gauge and loops back to it (distinct from the cuff→gauge hose and the
     bulb→gauge tube, which are retained). At load, `bloodPressureCuff.ts cullDeviceCoil` removes only
     the coil's triangles via a runtime index-buffer edit bounded to a 2D mesh-local box
     (`x < 0.04 ∧ z > −0.26`, isolated by vertex-density analysis so the bulb tube at x≈0.05–0.09 is
     kept). The GLB file itself is unchanged (reversible, in-memory); owner explicitly authorized the
     edit. Licensed-mesh node structure (§7.7) is preserved — no mesh is merged, renamed, or collapsed.
  3. **Bendable stethoscope with a movable round end.** `entities/stethoscope.ts` now has a fixed head
     (binaural fork + earpieces) and a **movable chest piece**; a 20-segment flexible tube is re-laid
     along a sagging quadratic bezier (transform-only, allocation-free, event-rate) whenever the chest
     moves. A new `CuffPart.StethChest` is picked before the whole-instrument AABB, so grabbing the
     round end drags it alone (leashed to 0.4 m of tube reach) and the tube bends to follow; grabbing
     the head still moves the whole instrument. Verified end-to-end headless: dragging the projected
     chest point moved the chest local pos while the root stayed fixed, and the tube re-bent.
  4. **Bulb squeezes with the pump (supersedes A31's bulb-expand).** Per owner, the bulb should
     CONSTRICT on each pump and relax on release — mirroring a real sphygmomanometer — **independent**
     of the cuff's pumped size. The baked bulb is hidden (`hideBakedBulb`) and the procedural overlay
     is driven by a squeeze envelope, not the pressure fraction: `inflationController` exposes
     `bulbSqueeze` (eased from the pump reserve), `cuffAnimator` feeds it to `cuff.setBulbSqueeze` in
     the same tick it feeds bladder swell from pressure — so cuff and bulb always act together, driven
     by the one pump action (single inflation owner preserved). Verified headless: bulb narrows
     mid-pump and returns to rest on release. No-op in full-procedural fallback (no device GLB).
- **A34.** **Learner-adjustable cuff diameter around the arm (visible fit).** (Owner request.) The
  curved fabric band's DIAMETER now opens and cinches around the limb as the learner adjusts fit —
  wide/open when loose, hugging when snug — so the cuff visibly expands and contracts in
  circumference. Cosmetic/interaction only; the engine-free training brain and
  `config/trainingConfig.ts` clinical values (snugness pass/fail band `0.15–0.45`, step order,
  tolerances) are **untouched**, and fit is still validated exactly as before (`snugness =
  animator.tightenAmount`). Mechanism: `bloodPressureCuff.setWrapCinch(cinch∈[0,1])` scales the wrap
  body RADIALLY (local X+Z, equal so the arc stays circular) by an openness factor — cinch 1 → ×1.0
  (snug, band inner face ≈ arm surface + clearance), cinch 0 → ×`WRAP_OPEN_DIAMETER_FACTOR` (1.18,
  a slightly loosened cuff). This composes with bladder swell on the **one** wrap-body node via
  `applyWrapBodyScale` (no second cuff forked, no per-frame allocation). The `CuffAnimator` drives
  `setWrapCinch(tightenDisplayed)` each frame from the already-eased tighten fraction — the SAME value
  the confirm-fit guided step reads — so the on-arm fit read is the band diameter (single owner; direct
  injection loses to the animator by design). `WRAP_OPEN_DIAMETER_FACTOR` is a cosmetic interaction
  affordance, NOT a clinical value. On the flat-slab preview (off-arm) cinch is ignored (a diameter has
  no meaning) and the original beside-the-device tighten translate remains; on the arm the wrap rest
  offset is ≈0 so that translate is inert.
  **Follow-up correction (owner screenshot):** the band is now a **CLOSED collar** — `CUFF_BAND_ARC_DEG`
  was raised 300° → **360°** so the fabric encircles the limb ALL the way around (a real cuff wraps
  fully and closes with Velcro), and the open factor was reduced 1.6 → 1.18 so the loosened cuff still
  hugs the arm rather than gaping off it. Together these fix the earlier look where the ~60° arc opening
  plus a wide-open diameter read as the cuff not wrapping around. Verified headless (front + both sides +
  back): the collar fully encircles the arm at every fit and viewing angle; band world-AABB radial
  extent 0.183 m (open) → 0.174 (mid) → 0.155 (snug), still monotonic, axial width preserved; confirm-fit
  still enters TOO-TIGHT and is satisfied by loosening (`ix-fit`), and pump/valve (`ix-full`) unaffected.
  On-device AR framing still pending.
- **A35.** **Preview zoom no longer enters the cuff (collar always reads closed).** (Owner screenshot:
  the cuff still looked "open" — arm visible between the side walls — even after A34's 360° collar.)
  Root cause was NOT geometry: the preview/inspect zoom floor was `INSPECTION_RANGE_METERS.near * 0.6`
  ≈ 0.091 m from the cuff center, INSIDE the ~0.10 m band ring, so at maximum zoom-in the camera sat
  inside the collar — the near wall fell behind it and only the left/right walls rendered, reading as a
  gap. Verified: at the default framing (~0.23 m) and any distance outside the ring the collar is fully
  closed; only zooming inside produced the gap. Fix (`interaction/inspectionController.ts zoom`): raise
  the floor to `INSPECTION_RANGE_METERS.near` (the 6-inch SPEC §6 close-inspection bound), keeping the
  camera outside the ring at all times so the cuff always reads as fully wrapping the arm, while still
  allowing 6-inch close gauge inspection. Preview/inspect only — AR uses the headset pose, unaffected.
  Verified headless: at max zoom-in (clamped to 0.152 m) the front is fully covered by band fabric with
  the label/marker readable, at both loose and snug fit. (If the cuff still appears open in a browser,
  it is a stale cached preview of a pre-360° build — hard-reload.)
- **A36.** **Learner-resizable closed-collar diameter.** (Owner request: make the cuff adjustable
  larger/smaller in diameter around the arm, staying closed, per how/where it is placed.) Adds a
  learner-driven coarse diameter on top of the fine fit cinch: `bloodPressureCuff.setWrapSize(t01)`
  maps 0→1 to a radial scale `WRAP_SIZE_RANGE` (1.0 snug → 1.5 largest) that composes with the fit
  cinch + bladder swell in the single `applyWrapBodyScale` node (no forked cuff, allocation-free). X
  and Z scale equally on the full-circle (360°) band, so the collar stays a CLOSED ring at every size —
  it only grows/shrinks in diameter. Exposed as a **"Cuff size" slider** in the controls panel
  (mirroring the "Elbow" slider), wired `qualityPanel → app.onDiameter → trainingScene.setCuffDiameter
  → cuffScene.cuff.setWrapSize`. Cosmetic interaction affordance — NOT a clinical value; the cuff
  sizing rule and the snugness pass band stay SME-governed in trainingConfig.ts, and this does not feed
  scoring. Verified headless: the real slider is present; `setCuffDiameter` scales the band world-AABB
  radial extent 0.18 m (100%) → 0.23 (125%) → 0.27 (150%), monotonic; renders show a fully closed
  collar hugging the arm at the smallest and a larger-but-still-closed ring at the largest; confirm-fit
  (`ix-fit`) and pump/valve (`ix-full`) still pass. On-device AR framing still pending.
