# CLAUDE.md — Rules for future Claude Code sessions

This file governs how Claude Code (and any agent/dev) extends this project. Read it before editing.

## Non-negotiables

1. **Keep the project Unity-free.** No Unity, Unity WebGL, Unity runtime concepts, or Unity-specific
   asset settings anywhere. Everything Unity would have done is done in **PlayCanvas + web-native**.
2. **Preserve cuff realism.** The blood pressure cuff is the product. Spend the fidelity budget on it
   and cut it there last. Training-grade medical realism — **no toy-demo aesthetics**: no bloom,
   glow, exaggerated reflections, or generic glossy "game" plastic. Distinct PBR materials per
   surface (fabric, Velcro, stitching, label, tubing, connector, gauge body/face/needle, lens,
   metal).
3. **Optimize for stable XR performance.** Highest **stable** frame rate beats ornamental effects;
   never sacrifice smooth interaction. Respect the 2–5 s first-load budget. One key light + IBL;
   shadows off by default (Ultra only); use foveation and `framebufferScaleFactor`; let the
   `PerformanceMonitor` adapt quality while keeping cuff identity intact.
4. **Prefer modular TypeScript.** Strict mode (`strict: true`) stays on. ESM only. Small, single-
   responsibility modules matching the existing `src/` structure. Type everything; don't reach for
   `any` (narrow/guard instead). Public seams stay stable.
5. **Avoid unnecessary dependencies.** Runtime deps: **`playcanvas` only.** Dev: `typescript`,
   `vite`, `@types/node`. Do not add libraries for things the engine or a few lines of TS can do.
6. **Avoid per-frame allocations.** **No `new` (Vec3/Quat/Mat4), array, or object literals inside any
   `update`/tick/event-loop callback.** Reuse the scratch temporaries in `src/utils/math.ts` (and
   per-controller private temporaries). This is enforced by review — keep hot paths allocation-free.
7. **Document assumptions.** When something is unknown, **assume + continue** (don't block), and
   record the assumption in `SPEC.md` §12 and inline where relevant.
8. **Preserve training-logic integrity & clinical honesty.** Keep **visual realism** and **procedure
   correctness** separate: the training "brain" (`training/`) stays **engine-free**, and all
   clinically-meaningful values stay centralized in `config/trainingConfig.ts`. **Do not assert
   unverified clinical claims** — every clinical assumption is flagged `SME-REVIEW:` in code and
   listed in `TRAINING_LOGIC.md` §7. New clinical logic must be reviewable without reading 3D/WebXR
   code, and added review items must be appended there.
9. **Drive the EXISTING cuff; never fork a second one.** The animation/training layer drives the
   existing `BloodPressureCuff` + its controllers through `CuffScene`. The inflation cycle has a
   single owner (ticked once/frame); animators **read** pressure, they don't re-advance it.
10. **Environment is preview-only.** `entities/environmentRoot.ts` (env GLB seam + procedural
    stand-in) is **disabled while an XR/AR session is active** (optical see-through — no
    floor/backdrop over the real world) and only shown in non-AR preview; its transform is
    independent of the cuff.
11. **Run build checks before stopping.** Both must pass and you should not stop until they do:
    ```bash
    npm run build       # tsc --noEmit && vite build
    npx tsc --noEmit    # strict typecheck
    ```

## WebXR / capability rules

- Treat **every** WebXR feature (hit test, hand input, anchors, depth sensing, light estimation) as
  **capability-gated**: detect at runtime via `app.xr` and the subsystem `.supported`/`.available`
  flags, and provide a fallback. `app.xr` may be **`null`** — always guard it.
- **`app.xr.start()` is callback-based and returns `void`** in the installed PlayCanvas version; it
  must be called from a **user gesture**. Verify any XR API against the real `.d.ts` in
  `node_modules/playcanvas/` before using it.
- **No WebXR image/marker tracking** — unsupported on Android XR. Don't add it.
- Interaction order is **hands → ray → place/inspect**; re-select live on capability change.
- AR camera uses **`clearColorBuffer = false`** (optical see-through); no skybox/background in AR.

## Asset rules

- Real assets replace procedural placeholders **only** through the documented seam
  (`materials/textureSets.ts`, `entities/cuffVariants.ts`, **`entities/environmentRoot.ts`**,
  `public/assets/...`). Follow `ASSET_PIPELINE.md` (meters; +Y up / −Z fwd; metalness workflow; ORM
  packing; material slot names). The environment GLB seam is `assets/env/training_room.glb`.
- Put `TODO:` markers **only** where a real asset file is genuinely required — not on architecture.

## Definition of done for a change

- Strict `tsc --noEmit` clean; `npm run build` succeeds.
- No new runtime deps; no per-frame allocations introduced.
- Cuff realism preserved; XR features still gated with fallbacks; `app.xr` still null-guarded.
- **Training-logic integrity preserved**: `training/` stays engine-free; clinical values stay in
  `config/trainingConfig.ts` and flagged `SME-REVIEW:`; new clinical assumptions appended to
  `TRAINING_LOGIC.md` §7. No second cuff forked; inflation has a single owner.
- **Environment hidden in AR** (preview-only), transform independent of the cuff.
- New assumptions recorded in `SPEC.md`. Docs updated if behavior/commands changed.
