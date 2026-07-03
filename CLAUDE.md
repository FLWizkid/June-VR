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
5. **Avoid unnecessary dependencies.** Runtime deps: **`playcanvas`, `peerjs`, `qrcode`** (peerjs +
   qrcode power the phone-mirror QR pairing). Dev: `typescript`, `vite`, `@types/node`,
   `@types/qrcode`, `@types/webxr`. **Add nothing else without explicit approval**, and report the
   bundle-size delta for any proposed new dependency. Do not add libraries for things the engine or a
   few lines of TS can do.
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

---

## Mandatory workflow — PLAN → TEST → VERIFY → APPLY

Applies to any non-trivial change. **Do not write or apply implementation code until the PLAN is approved.**

**1. PLAN (approval gate).** Produce a short written plan before coding:
- **Goal & scope** — what changes, in one paragraph.
- **Files touched** — explicit list; confirm none are in "Do-not-touch" (or name the granted exception).
- **Layer impact** — which loop(s); confirm the engine-free `training/` brain and `config/trainingConfig.ts` clinical values are untouched (or flagged `SME-REVIEW:`).
- **Runbook** — step-by-step, tagged by where each step runs: `[Claude Code]`, `[PlayCanvas Editor]`, `[Blender]`, `[Device Browser]`, `[CI]`. Prompt the user **only** when they must act in a tab; automate the rest.
- **Performance impact** — expected effect on first-load, framerate, bundle size, asset budget.
- **Test plan** — which checks/cases prove correctness.
- **Rollback** — how to revert cleanly.

Wait for explicit approval before proceeding.

**2. TEST (write checks with the code).**
- Cover the state-machine transitions touched (valid + invalid).
- Clinical/scoring changes must be reviewable without reading 3D/WebXR code and appended to `TRAINING_LOGIC.md` §7.
- Deterministic assertions only — no time- or random-dependent checks in scorable logic.

**3. VERIFY (prove it before applying).** Confirm and report:
- ✅ `npx tsc --noEmit` passes (strict).
- ✅ `npm run build` succeeds; report bundle-size delta.
- ✅ Cuff realism preserved; XR features still capability-gated with fallbacks; `app.xr` still null-guarded.
- ✅ Training-logic integrity preserved; single inflation owner; no second cuff forked; environment hidden in AR.
- ✅ Performance: first-load ≤ 2 s target (≤ 5 s ceiling); no framerate regression; asset budget respected.
- ✅ Do-not-touch audit (below) confirmed clean.
- ⚠️ **On-device WebXR verification is still pending** — flag anything needing headset validation; never claim on-device correctness you did not verify.

**4. APPLY.** Only after 1–3 pass. Deliver the final runbook + a short summary: what changed, files, check results, perf numbers, and remaining on-device steps. **If any step fails, stop and report — never paper over failures to reach "done."**

## Do-not-touch areas 🚫

Treat as read-only unless a task **explicitly names the file and grants permission**. If a change appears to require touching one of these, **STOP and ask first**.

1. **Clinical truth data** — clinical values / thresholds / step order in `config/trainingConfig.ts` and any procedure manifest may be extended **only** via the centralized edit-with-`SME-REVIEW:`-flag workflow (non-negotiable #8), logged in `TRAINING_LOGIC.md` §7. Never silently change a clinical value.
2. **PlayCanvas engine version pin (`^2.19.7`)** and the bundler/toolchain config CI depends on (`vite.config.ts`, `tsconfig.json`, `package.json` scripts).
3. **CI workflow** (`.github/workflows/ci.yml`) — do not weaken, skip, or disable the typecheck/build gates to "get green."
4. **Secrets, env, and deploy config** — `.env*`, Vercel/Supabase keys, Resend controls, `vercel.json`. Never print, commit, or hard-code secrets.
5. **Regulated-record / PHI paths** — do not add writes of assessment/PHI records here; PHI storage is gated behind BAAs + safeguards and lives in the platform repo.
6. **Purchased/licensed art source files** — the RenderHub BP gauge Blender source and derived GLB node structure (gauge face, needle, cuff, tubing, bulb as separate meshes). Do not merge, rename, or collapse the separated meshes — the runtime drives the needle and grabs the bulb by node.
7. **Git history / branches** — no force-push, no history rewrite, no branch deletion.

Backend/platform code (Next.js/Supabase multi-tenant, RLS, AI broker, telemetry) is **out of scope for this repo** unless the task explicitly says so.

## Governance & escalation

- **Decision rights** — Requirements define the *outcome*; Doug (CTO/CIO) owns the *technical implementation approach*. PlayCanvas is the current direction; Unity is only a future porting option if Encountive strategically changes direction — do not reintroduce it.
- **When to STOP and ask** (do not guess) — clinical values/thresholds/sequence, scoring-core behavior, engine/toolchain version, CI gates, secrets/PHI, licensed-asset node structure, or any do-not-touch item.
- **Truthfulness** — Never claim a check passed, a build succeeded, or on-device behavior works unless you actually ran/verified it. Report unknowns as unknowns.
- **Consistency** — This file is the standing contract. If a request contradicts it, surface the conflict and ask before acting.

---

*Repo: `FLWizkid/June-VR` · Product: Encountive Manual Blood Pressure Trainer · Handover ref: `ENC-MBPXR-SDD-v0.5` · Owner: Doug Tully (CTO). Keep this file current as the architecture evolves.*
