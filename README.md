# AR Blood Pressure Cuff (WebXR · PlayCanvas · No Unity)

Production-grade **optical see-through AR** blood pressure cuff for **training-grade medical
visualization**, built for first-edition **Android XR glasses** (Chrome / Comet). The cuff is
rendered with realistic PBR materials and can be placed, grabbed, and inspected up close.

**Stack:** PlayCanvas (standalone) · TypeScript (strict) · ES modules · Vite. **No Unity anywhere.**

See also: [`SPEC.md`](./SPEC.md) (authoritative spec), [`RUNBOOK.md`](./RUNBOOK.md) (ops),
[`ASSET_PIPELINE.md`](./ASSET_PIPELINE.md) (assets), [`CLAUDE.md`](./CLAUDE.md) (rules for future
Claude Code sessions).

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

## Exact user files still needed

The app runs **now** with procedural placeholders. To reach final realism, supply (drop into the
listed folders; names are what the code's seam expects — see `TODO:` markers in
`src/materials/textureSets.ts` and `src/entities/cuffVariants.ts`):

**Model** → `public/assets/models/`
- `cuff_medium.glb` (required; single source model, metallic-roughness, meters, +Y up / −Z fwd,
  material slots named per `ASSET_PIPELINE.md` §5). Optionally `cuff_small.glb`, `cuff_large.glb`
  if sizes differ in shape rather than scale.

**Textures** → `public/assets/textures/` (KTX2 preferred; PNG accepted)
- `fabric_albedo.*`, `fabric_normal.*`, `fabric_orm.*`
- `velcro_albedo.*`, `velcro_normal.*`, `velcro_orm.*`
- `tube_albedo.*`, `tube_normal.*`, `tube_orm.*`
- `gauge_dial.*`, `label_albedo.*`
- (ORM = R:AO, G:Roughness, B:Metalness)

**Environment (optional)** → `public/assets/env/`
- `env.hdr` or prefiltered `env_atlas.ktx2` for image-based lighting.

**Not needed:** any marker/QR/image-tracking images (WebXR image tracking is unsupported on
Android XR).

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
public/assets/{models,textures,env,tracking,ui}   static assets (tracking/ unused in v1)
src/
  main.ts                       entry
  config/                       appConfig, qualityProfiles, capabilities
  core/                         app, assetRegistry, sceneFactory, xrBootstrap, perf, materialFactory, featureFlags
  ar/                           sessionManager, handTracking, gestureInterpreter, rayInteraction, hitTestPlacement, anchors, fallbackModes
  scene/                        lightingRig, environment, cuffScene, debugScene
  entities/                     bloodPressureCuff, cuffVariants
  materials/                    cuffMaterials, textureSets
  interaction/                  grab, inspection, placement, inflation, gauge controllers
  ui/                           overlay, statusPanel, loadingScreen, qualityPanel, arEntryButton, unsupportedMessage
  utils/                        logging, math, units, profiling
```

License/owner: internal training tool. Continue development with Claude Code per
[`CLAUDE.md`](./CLAUDE.md).
