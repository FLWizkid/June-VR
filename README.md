# AR Blood Pressure Cuff (WebXR · PlayCanvas · No Unity)

Production-grade **optical see-through AR** blood pressure cuff for **training-grade medical
visualization**, built for first-edition **Android XR glasses** (Chrome / Comet). The cuff is
rendered with realistic PBR materials and can be placed, grabbed, and inspected up close, and a
**guided nurse-training sequence** (procedural animation + a step-by-step state machine) teaches
sizing, orientation, placement, fit, inflation, and gauge reading.

**Stack:** PlayCanvas (standalone) · TypeScript (strict) · ES modules · Vite. **No Unity anywhere.**

See also: [`SPEC.md`](./SPEC.md) (authoritative spec), [`TRAINING_LOGIC.md`](./TRAINING_LOGIC.md)
(training design + **SME-review list**), [`RUNBOOK.md`](./RUNBOOK.md) (ops),
[`ASSET_PIPELINE.md`](./ASSET_PIPELINE.md) (assets), [`CLAUDE.md`](./CLAUDE.md) (rules for future
Claude Code sessions).

> **Clinical honesty:** the training logic is a **simulator scaffold built for SME validation**, not
> a validated curriculum. Visual realism and procedure correctness are kept separate; every clinical
> assumption is flagged `SME-REVIEW:` in code and listed in `TRAINING_LOGIC.md` §7. Do not treat any
> clinical value as authoritative until a nurse-educator / clinical SME signs off.

---

## Installation

Requirements: **Node v22**, **npm 10**.

```bash
npm install
```

The only runtime dependency is `playcanvas`. Dev tooling is `typescript`, `vite`, `@types/node`.

## Dev commands

```bash
npm run dev        # Vite dev server with HMR (http://localhost:5173)
npm run typecheck  # tsc --noEmit (strict)
```

In dev you get a **desktop inspect mode** (cuff on a neutral background) plus an `Enter AR` button
when the browser reports immersive-AR.

## Build commands

```bash
npm run build      # tsc --noEmit && vite build  ->  dist/
```

## Preview commands

```bash
npm run preview            # serve built dist/ locally (production-like)
npm run preview -- --host  # expose on LAN (for tunneling to a headset)
```

---

## HTTPS / secure-context note for WebXR

**WebXR requires a secure context.** Two hard rules:

1. The page must be served over **HTTPS** (an `https://` origin). `http://localhost` is treated as
   secure for local dev, but a **headset loading a remote URL needs real HTTPS** — tunnel
   (ngrok/cloudflared) or host `dist/` on an HTTPS static host.
2. The XR session can only start **from a user gesture** (the `Enter AR` button tap). It cannot be
   auto-started on load or by a timer.

The app checks `window.isSecureContext` and the availability of immersive-AR before enabling
`Enter AR`, and shows a clear message when either is missing.

---

## Browser compatibility notes

- **Targets:** Chrome and Comet on **Android XR** glasses (Samsung/Google first edition), **optical
  see-through**.
- **WebXR modules used (capability-gated):** Device API, AR module, **Hit Test, Hand Input, Anchors,
  Depth Sensing, Light Estimation**. Every feature is detected at runtime and degrades gracefully.
- **Not used:** WebXR **image/marker tracking** — **unsupported on Android XR**, so it is omitted.
- **Interaction:** **hand tracking is primary** (Android XR default). Falls back to **ray**, then to
  a **place/inspect** mode, depending on what the device/browser exposes.
- Desktop browsers without immersive-AR still load the **inspect mode** (no AR), which is also how
  you develop.

---

## Known risks

(Full register in [`SPEC.md`](./SPEC.md) §9.) Top items:

- **WebXR feature variability** across device/browser combinations — the biggest non-Unity risk.
  Mitigated by capability detection + fallbacks everywhere.
- **Hand-tracking availability** (may be absent/weak/intermittent) — 3-layer interaction with live
  re-selection on track loss/regain.
- **Feature gaps vs native Android XR SDK / Unity** (e.g. no WebXR marker tracking) — scoped to
  supported modules; isolated behind a capability layer.
- **Optical see-through display** physics (additive: black is invisible, bright washes out) — no
  background/skybox in AR, no emissive on physical surfaces, contrast tuned for additive blend.
- **Thermal/battery** on mobile XR — stable-first budget, adaptive quality, foveation, shadows off
  by default.

---

## Assets: detected vs. NOT detected

**Detected (wired, in the repo):**
- `public/assets/models/blood_pressure_device.glb` — the real aneroid device (gauge head + coiled
  tube + inflation bulb), static (no animations), real metres. Wired as the model for **all three
  sizes** in `entities/cuffVariants.ts`; composited with a procedural fabric wrap by
  `entities/bloodPressureCuff.ts`. (See `SPEC.md` §12 A11/A12.)

**NOT detected (seam + stand-in in place):**
- **Patient arm** (`public/assets/models/patient_arm.glb` absent) → `entities/patientArm.ts` builds a
  **procedural forearm + upper-arm + hand** (tapered cones, matte skin PBR) in a relaxed bent-elbow
  rest. It is **FOREGROUND training content and IS shown in AR** (it is the target the cuff wraps
  onto) and is **toggleable** (`TrainingScene.setArmVisible`) for sites using a real manikin/arm. Drop
  a real arm GLB at the seam to replace it (no code change). Anatomy/pose are **SME-REVIEW** teaching
  affordances. (`SPEC.md` §12 A19; `TRAINING_LOGIC.md` §7.)
- **Real fabric-cuff mesh** (still missing) → the deployable cuff body is the **procedural fabric
  wrap** composited onto the real gauge device, now shaped as a **curved band** hugging the arm. The
  gauge/tube/bulb come from `blood_pressure_device.glb`; the fabric band + Velcro + label are
  procedural. Point `cuffVariants.ts` `modelUrl` at a real cuff mesh when delivered. (`SPEC.md` §12
  A12/A20.)
- **Environment** (`public/assets/env/` empty) → `entities/environmentRoot.ts` builds a **minimal
  procedural stand-in** (floor + grid + backdrop) for **non-AR preview only**, and is **hidden in
  AR**. Drop `assets/env/training_room.glb` to replace it (no code change). (`SPEC.md` §12 A13.)
- **Source animations** (none anywhere) → **all training motion is procedural** (`animation/`).
  (`SPEC.md` §12 A14.)
- **Optional IBL** (`assets/env/env_atlas.ktx2` preferred, or raw `assets/env/env.hdr`) is not
  present; reflections fall back to the constant ambient + key light. The HDR path is prefiltered at
  runtime; the `.ktx2` path is a ready atlas. No skybox is ever painted (AR see-through). (`SPEC.md`
  §12 A21.) The **per-surface texture sets** below are likewise absent; materials run on procedural
  defaults.

To reach final realism, supply (names are what the code's seam expects — see `TODO:` markers in
`src/materials/textureSets.ts`, `src/entities/cuffVariants.ts`, `src/entities/environmentRoot.ts`):

**Textures** → `public/assets/textures/` (KTX2 preferred; PNG accepted)
- `fabric_albedo.*`, `fabric_normal.*`, `fabric_orm.*`
- `velcro_albedo.*`, `velcro_normal.*`, `velcro_orm.*`
- `tube_albedo.*`, `tube_normal.*`, `tube_orm.*`
- `gauge_dial.*`, `label_albedo.*`  (ORM = R:AO, G:Roughness, B:Metalness)

**Environment (optional)** → `public/assets/env/`
- `training_room.glb` (preview-only environment), and/or `env_atlas.ktx2` (preferred prefiltered IBL
  atlas) **or** `env.hdr` (raw equirect, prefiltered at runtime) for reflections.

**Patient arm (optional foreground)** → `public/assets/models/`
- `patient_arm.glb` — a real forearm/upper-arm/manikin mesh (meters; +Y up / −Z forward). Replaces the
  procedural arm stand-in; **shown in AR** (it is the cuff target). A delivered mesh should tag
  landmark nodes for the cuff site; until then the configured site/pose are used.

**Not needed:** any marker/QR/image-tracking images (WebXR image tracking is unsupported on
Android XR).

## What still needs SME (clinical) review

The procedure logic is structured for validation, not asserted as correct. See `TRAINING_LOGIC.md`
§7 for the full list; highlights: target inflation pressure, controlled deflation rate, demo
systolic/diastolic markers, the "correct" demo cuff size, fit/orientation/position tolerances, and
all step wording/ordering. All are centralized in `src/config/trainingConfig.ts` and flagged
`SME-REVIEW:`.

---

## How to replace placeholders with real assets

The placeholder system is isolated behind one seam so swapping in real art needs **no architecture
change**:

1. **Drop files** into `public/assets/...` using the names above.
2. **Flip the source** in `src/materials/textureSets.ts`: set the texture-set provider from
   `procedural` to `file` (a single flag / map of URLs). The `TODO:` markers show each URL slot.
3. **Point the model** in `src/entities/cuffVariants.ts`: fill the `modelUrl` (and per-size scale or
   per-size URLs) in the `CuffVariantSpec`s; the loader in `core/assetRegistry.ts` will
   `loadFromUrl(..., 'container')` and instantiate the render entity, binding `StandardMaterial`s to
   submeshes by slot name. Enable the KTX2/meshopt decoders where the `TODO:` indicates.
4. `npm run build` and re-test on device per [`RUNBOOK.md`](./RUNBOOK.md).

Materials (`src/materials/cuffMaterials.ts`), interaction, quality profiles, and AR logic are
asset-agnostic and remain unchanged.

---

## Project layout (high level)

```
public/assets/{models,textures,env,tracking,ui,training}   static assets (tracking/ unused in v1)
src/
  main.ts                       entry
  config/                       appConfig, qualityProfiles, capabilities, trainingConfig
  core/                         app, assetRegistry, sceneFactory, xrBootstrap, perf, materialFactory, featureFlags
  ar/                           sessionManager, handTracking, gestureInterpreter, rayInteraction, hitTestPlacement, anchors, fallbackModes
  scene/                        lightingRig, environment, cuffScene, trainingScene, debugScene
  entities/                     bloodPressureCuff, cuffVariants, patientArm, environmentRoot
  materials/                    cuffMaterials, textureSets
  animation/                    cuffAnimator, timelineController, proceduralMotion
  interaction/                  grab, inspection, placement, inflation, gauge, trainingStep controllers
  training/                     procedureStateMachine, stepDefinitions, validationRules, instructionalPrompts, errorStates
  ui/                           overlay, statusPanel, loadingScreen, qualityPanel, arEntryButton, unsupportedMessage, trainingPanel
  utils/                        logging, math, units, profiling
```

### Training controls (UI)

The **Training** panel (top-left) selects the mode (**Guided / Placement / Inspect / Demo**) and
shows the current step, instruction, a progress bar, and corrective guidance, with **Next** /
**Restart**. The **Controls** panel (bottom-left) still cycles quality tier, cuff size, and triggers
an inflation cycle.

License/owner: internal training tool. Continue development with Claude Code per
[`CLAUDE.md`](./CLAUDE.md).
