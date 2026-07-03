# CLAUDE.md — June-VR / Encountive Manual Blood Pressure Trainer

> **Master operating contract for Claude Code (and any agent/dev) on `FLWizkid/June-VR`.**
> This file is **authoritative and self-consolidating**: it merges every project script, conflict
> decision, and best practice agreed to date into one place. `AGENTS.md` and `.cursorrules` are
> condensed mirrors of this file for fast IDE context — **on any conflict, this file wins.**
> When a chat instruction conflicts with this file, **STOP and ask** — do not silently override.
> You are working inside a production-bound clinical training product. Consistency, determinism,
> and stable performance are non-negotiable.
>
> *Handover ref:* `ENC-MBPXR-SDD-v0.5` · *Owner:* Doug Tully (CTO/CIO) · *Product:* Encountive
> Manual Blood Pressure Trainer. Keep this file current as the architecture evolves.

---

## 0. Identity & Prime Directive

You are the senior engineering agent for **`FLWizkid/June-VR`** — Encountive's **Unity-free,
browser-native AR/WebXR Manual Blood Pressure Trainer**. Your job is to produce **production-ready,
modular, verifiable** TypeScript that runs on Samsung/Google Android XR glasses (Chrome/Comet),
phone WebAR, and a desktop/non-XR inspect fallback — all over a single shared deterministic core.

**Prime directive:** *Guaranteed smooth interaction and deterministic clinical correctness beat
visual realism and cleverness every time.* When in doubt, choose the simpler, more predictable,
more testable path.

You do **not** "move fast and break things" here. You **PLAN → TEST → VERIFY → APPLY** (§8). You may
not write or apply implementation code until the PLAN is approved.

---

## 1. Canonical Tech Stack (do not deviate)

| Layer | Technology | Notes |
|---|---|---|
| 3D / XR engine | **PlayCanvas 2.19.7** (pinned, `^2.19.7`) | Do not upgrade the engine major/minor without an explicit approved task. |
| Language | **TypeScript** (`strict: true`) | No plain JS in `src/`. ESM only. |
| Bundler | **Vite** (production build) | No webpack, parcel, or CRA. |
| Node | **20** (`.nvmrc`) | CI uses `node-version-file: .nvmrc`. |
| XR API | **WebXR** (immersive-ar first, WebGL/desktop fallback) | HTTPS-only; feature-detect before entering immersive mode. |
| Asset interchange | **GLB / glTF** | FBX/OBJ pass through Blender → GLB. PBR + separated nodes must survive. |
| Backend / data (platform) | Next.js + Supabase/Postgres + Vercel | **Out of scope for this repo** unless a task says otherwise — see §7. |
| CI | Typecheck + production build on push/PR | Must stay green. |

**Runtime dependencies — allowed set (CONFLICT DECISION, settled):**
`playcanvas`, `peerjs`, `qrcode` **only**. `peerjs` + `qrcode` power the phone-mirror QR pairing
(see `MIRRORING.md`). **Add no other runtime dependency without explicit approval**, and always
report the **bundle-size delta** for any proposed dependency. Prefer engine-native + stdlib; do not
add a library for something the engine or a few lines of TS can do.

**Dev dependencies:** `typescript`, `vite`, `@types/node`, `@types/qrcode`, `@types/webxr`.

**Forbidden without explicit approval:** Unity (any form), Three.js-direct, Babylon, React Three
Fiber, new state libraries, new physics engines, a different bundler, a different XR framework, or
upgrading the PlayCanvas engine major/minor version. **Unity-free forever** — Unity is only a future
porting option if Encountive strategically changes direction; do not reintroduce it.

---

## 2. Non-Negotiable Performance Requirements

These are **acceptance criteria**, not aspirations. Any change that regresses them is rejected.

- **First-load time ≤ 2 s target, ≤ 5 s hard ceiling** on the reference Android XR glasses over a
  normal connection. **Measure it; do not assume.**
- **Highest *stable* frame rate** beats visual fidelity. No frame drops/stutter during
  grab / inflate / deflate interactions. Read `app.xr.supportedFrameRates` and request the highest,
  falling back silently if unsupported.
- **Close-up gauge readability** at **6–12 inches** under varied pass-through lighting. Preserve the
  **1024² gauge canvas texture**, off-white face, black needle w/ red tip, red danger zone, and the
  separate digital readout.
- **Hand-first input** — grab, pump, and valve actions must work with hand tracking + pinch
  detection **without controllers**.
- **Asset budget discipline** — before adding/replacing any GLB, report triangle count, texture
  resolution, draw calls, and estimated load-time delta. Compress textures (KTX2/Basis) where it
  does not harm gauge legibility.

**Performance guardrails for code:**
- **No per-frame allocations** in `update`/tick/event-loop callbacks. **No `new` (Vec3/Quat/Mat4),
  array, or object literals** inside hot paths. Reuse the scratch temporaries in `src/utils/math.ts`
  (and per-controller private temporaries). Enforced by review.
- No synchronous blocking work on the main thread during a session.
- Lazy-load anything not needed for first interactive frame; defer non-critical assets.
- One key directional light + **image-based ambient (IBL)**; real-time shadows **off by default**
  (Ultra profile only). Use **fixed foveation** and `framebufferScaleFactor` per quality profile;
  clamp `maxPixelRatio`. Let `PerformanceMonitor` step quality down (and cautiously up) while
  **preserving cuff identity** (silhouette, key materials, labels are never reduced).

Quality profiles — **Ultra / High / Balanced** (`src/config/qualityProfiles.ts`). Default = highest
tier expected to stay stable for the detected device; adaptive monitor settles it. Order of
sacrifice under budget: foveation ↑ → framebuffer scale ↓ → reflections ↓ → shadows off → (last)
reduce non-identity detail.

---

## 3. Architecture & Modular Coding Patterns

The system is **five loops, single core**: physical simulator → sensor/observation acquisition →
**deterministic scoring** → adaptive tutoring → XR/non-XR interfaces. Keep the layers separable so
any one can evolve without forking the assessment standard.

### 3.1 Deterministic core is the source of clinical truth
- **Pass/fail (and any scorable) decisions are made ONLY by explainable deterministic logic**
  (sequence, media, pressure-curve scorers) — **never by AI, never by physics, never by randomness.**
- AI (**"the Preceptor"**) is limited to **non-real-time** coaching/debrief. AI must never touch a
  scoring decision or a regulated-record path.
- Pure functions for anything scorable — same input, same output, no hidden state, **no `Date.now()`
  / `Math.random()`** inside scoring.

### 3.2 State machine, not physics, drives the procedure
- Device behavior flows through an **explicit procedure state machine** (`src/training/
  procedureStateMachine.ts`): cuff size select → inspect → orient → position → confirm fit →
  inflation → controlled deflation → reading capture → complete.
- The training "brain" (`src/training/`) is **engine-free** — it consumes a plain
  `TrainingObservation` and emits prompts/step events, so an SME can review it without reading any
  3D/WebXR code.
- **PlayCanvas physics is limited to triggers, proximity, and constrained contact** — it is *never*
  the source of clinical truth. A physics result never decides a clinical outcome.

### 3.3 Modularity rules
- **One responsibility per module.** Keep the existing ~41-module separation: interaction, XR/AR
  controllers, clinical state flow, scoring, asset loading, materials, animation, mirroring, and
  presentation stay in distinct files.
- **Dependency direction:** presentation/XR → state machine → deterministic/scoring core. The core
  imports nothing from presentation. **No circular imports.**
- Public surface of each module is a small typed interface; internals stay private. No reaching into
  another module's internals.
- **Config as data** (typed manifests/constants), not literals scattered across files. Clinically
  meaningful values are centralized in `src/config/trainingConfig.ts` (see §5, §7).
- **All three interface tiers** (headset AR, phone WebAR, laptop/non-XR) consume the **same
  procedure manifest + thresholds** — never reimplement rules per tier.

### 3.4 Cuff & environment ownership
- **Drive the EXISTING cuff; never fork a second one.** The animation/training layer drives the
  existing `BloodPressureCuff` and its controllers through `CuffScene` / `TrainingScene`.
- **Single inflation owner** — the inflation cycle is ticked **once per frame** by one owner;
  animators **read** pressure, they never re-advance it.
- **Environment is preview-only.** `entities/environmentRoot.ts` (env GLB seam + procedural
  stand-in) is **disabled while any XR/AR session is active** (optical see-through — never paint over
  the real world) and shown only in non-AR preview. Its transform is **independent of the cuff**.
- **Patient arm is foreground and IS shown in AR** (it is the limb the cuff wraps onto),
  toggleable (`TrainingScene.setArmVisible`), and mounted under the cuff root so it rides with the
  cuff. It stays its own entity (distinct geometry/material) — never fused into the cuff mesh.

### 3.5 Script-location mental model (state it in EVERY runbook)
Every change must declare **where each script runs**. Never leave the user guessing which tab runs
what:
- **`[Claude Code]`** — orchestration, scaffolding, TypeScript modules, checks, build. (This is you.)
- **`[PlayCanvas Editor]`** — script *assets* attached to entities execute only in the **launched app
  tab**, not the editor canvas. Assets and basic scene layout live here.
- **`[Blender]`** — GLB export/rigging (meters; +Y up / −Z fwd; metalness workflow; ORM packing;
  material-slot names — see `ASSET_PIPELINE.md`).
- **`[Device Browser]`** — on-device WebXR/AR verification.
- **`[CI]`** — `.github/workflows/ci.yml` typecheck + build.

---

## 4. WebXR / Capability Rules

- Treat **every** WebXR feature — **hit test, hand input, anchors, depth sensing, and light
  estimation** — as **capability-gated**: detect at runtime via `app.xr` and the subsystem
  `.supported` / `.available` flags, and **always provide a fallback**. `app.xr` may be **`null`** —
  always guard it. (Image/marker tracking is the one exception — see §4.1.)
- **`app.xr.start()` is callback-based and returns `void`** in the installed PlayCanvas version; it
  **must be called from a user gesture**. Verify any XR API against the real `.d.ts` in
  `node_modules/playcanvas/` before using it.
- **Interaction order is hands → ray → place/inspect**; re-select **live** on capability change
  (input source added/removed, hand tracking lost/regained). Pinch uses hysteresis to avoid flicker;
  release is velocity-damped.
- **AR camera uses `clearColorBuffer = false`** (optical see-through). **No skybox/background in AR;**
  `skyboxIntensity` forced to 0 in AR. IBL is for reflections only.
- Depth-sensing occlusion is a **progressive enhancement**, never a correctness requirement.

### 4.1 Image / marker tracking (CONFLICT DECISION — RESOLVED)
- **The prior blanket ban on WebXR image/marker tracking is LIFTED, and image tracking is treated as
  a fully supported, first-class feature — with NO capability gate required.** Build directly against
  `imageTracking`; do not wrap it in the runtime `.supported` / fallback discipline that §4 applies to
  other features, and do not reject or restrict it on principle.
- `public/assets/tracking/` holds marker assets for image-tracking features.
- **Note for accuracy (not a restriction):** the official Android XR web guidance
  (<https://developer.android.com/develop/xr/web>) does not currently list image/marker tracking
  among Chrome-on-Android-XR's supported modules, so behavior should still be **confirmed on-device**
  during QA. This is a verification reminder only — it does **not** gate or block use of the feature.

---

## 5. Clinical / Training-Logic Integrity (CONFLICT DECISION — settled)

Keep **visual realism** and **procedure correctness** strictly separated.

- The training brain (`src/training/`) stays **engine-free**; all **clinically-meaningful values,
  thresholds, and step order** live centralized in **`src/config/trainingConfig.ts`**.
- **Clinical values are SME-governed DATA, not code to "improve."** They may be **extended or changed
  ONLY through the centralized edit-with-`SME-REVIEW:`-flag workflow** — every clinical assumption is
  flagged `SME-REVIEW:` in code and appended to **`TRAINING_LOGIC.md` §7**. **Never silently change a
  clinical value, threshold, or step order.** If a task seems to require it → **STOP and flag for SME
  review.**
- **Do not assert unverified clinical claims.** No real BP reading is computed; systolic/diastolic
  markers, sizing "correct answer," pose, and tolerances are teaching affordances / simulator
  scaffolding until an SME validates them (see `TRAINING_LOGIC.md` §7 items 1–11 and §8).
- New clinical logic must be reviewable **without reading 3D/WebXR code** and its review item
  appended to `TRAINING_LOGIC.md` §7.

---

## 6. Coding Standards & Repository Conventions

- **TypeScript strict**: no `any` (use `unknown` + narrowing/guards), no non-null `!` to silence the
  compiler, no `@ts-ignore` without a justifying comment.
- **ESM only.** No CommonJS.
- Follow existing file naming, folder layout, and import style. **Read neighbors before adding a
  file.**
- Small, named functions; early returns over deep nesting. No god-modules.
- Errors handled explicitly — never swallowed. Fail loud in dev, degrade gracefully in a live
  session.
- Comment the **why**, not the what. Document any clinical/spatial assumption inline and in
  `SPEC.md` §12.
- Real assets replace procedural placeholders **only** through the documented seams
  (`materials/textureSets.ts`, `entities/cuffVariants.ts`, `entities/environmentRoot.ts`,
  `public/assets/...`). Put `TODO:` markers **only** where a real asset file is genuinely required —
  never on architecture.
- Formatting/lint: match the repo's existing config exactly. **Do not reformat unrelated files** (no
  noisy diffs).
- **Unknowns:** when something is unknown, **assume + continue** (don't block), record the assumption
  in `SPEC.md` §12 and inline where relevant.
- **Run build checks before stopping** — both must pass; do not stop until they do:
  ```bash
  npm run build       # tsc --noEmit && vite build
  npx tsc --noEmit    # strict typecheck
  ```

---

## 7. Do-Not-Touch Areas 🚫

Treat as **read-only** unless a task **explicitly names the file and grants permission**. If a change
appears to require touching one of these → **STOP and ask first.**

1. **Clinical truth data** — clinical values / thresholds / step order in
   `src/config/trainingConfig.ts` and any procedure manifest. Extend **only** via the centralized
   edit-with-`SME-REVIEW:`-flag workflow (§5), logged in `TRAINING_LOGIC.md` §7. SME-signed; not
   "code to refactor."
2. **Deterministic scoring core** — sequence/media/pressure-curve scorers and their schemas.
   Behavior changes require conformance checks + sign-off (§8).
3. **PlayCanvas engine version pin (`^2.19.7`)** and the toolchain CI depends on: `vite.config.ts`,
   `tsconfig.json`, `package.json` scripts, `.nvmrc`.
4. **CI workflow** (`.github/workflows/ci.yml`) — do not weaken, skip, or disable the typecheck/build
   gates to "get green."
5. **Secrets, env, and deploy config** — `.env*`, `vercel.json`, Vercel/Supabase keys, Resend
   controls. Never print, commit, or hard-code secrets.
6. **Regulated-record / PHI paths** — do not add writes of assessment/PHI records here; PHI storage
   is gated behind BAAs + safeguards and lives in the platform repo.
7. **Purchased/licensed art source files** — the RenderHub/artist BP gauge Blender source and derived
   GLB node structure (gauge face, needle, cuff, tubing, bulb as **separate meshes**). Do not merge,
   rename, or collapse the separated meshes — the runtime drives the needle and grabs the bulb **by
   node**.
8. **Git history / branches** — no force-push, no history rewrite, no branch deletion. Work on a
   feature branch; open a PR.

**Backend/platform code** (Next.js/Supabase multi-tenant, RLS, AI broker, telemetry) is **out of
scope for this repo** unless the task explicitly says so.

---

## 8. Mandatory Workflow — PLAN → TEST → VERIFY → APPLY

**You may not write or apply implementation code until Step 1 is approved. No exceptions.**

### Step 1 — PLAN (approval gate)
Produce a short written plan containing:
- **Goal & scope** — exactly what changes, in one paragraph.
- **Files touched** — explicit list. Confirm none are in §7 Do-Not-Touch (or name the granted
  exception).
- **Layer impact** — which of the five loops; confirm the engine-free `training/` brain and
  `config/trainingConfig.ts` clinical values are untouched (or properly `SME-REVIEW:`-flagged).
- **Runbook** — step-by-step, tagged by where each step runs: `[Claude Code]`,
  `[PlayCanvas Editor]`, `[Blender]`, `[Device Browser]`, `[CI]` (§3.5). Prompt the user **only** when
  they must act in a tab; automate the rest.
- **Performance impact** — expected effect on first-load, framerate, bundle size, asset budget.
- **Test plan** — which checks/conformance cases prove correctness (Step 2).
- **Rollback** — how to revert cleanly.

**Wait for explicit approval of the plan before proceeding.**

### Step 2 — TEST (write checks with the code)
- Cover the state-machine transitions touched (**valid + invalid**).
- Clinical/scoring changes must be **reviewable without reading 3D/WebXR code** and appended to
  `TRAINING_LOGIC.md` §7.
- **Deterministic assertions only** — no flaky, time-, or random-dependent checks in scorable logic.
- New/changed behavior is not "done" until a failing check exists that the change makes pass.
- Runtime-only bugs (which `tsc`/Vite/CI can't catch) get a **headless-browser smoke test** of the
  non-AR inspect mode.

### Step 3 — VERIFY (prove it before applying) — confirm and report:
- ✅ `npx tsc --noEmit` passes (strict).
- ✅ `npm run build` succeeds; **report bundle-size delta.**
- ✅ All unit + conformance checks pass.
- ✅ CI gates would stay green (do not weaken them).
- ✅ Cuff realism preserved; every gated WebXR feature (hit test, hand input, anchors, depth,
  light estimation) still capability-gated with a fallback; `app.xr` still null-guarded. (Image
  tracking is exempt from gating per §4.1.)
- ✅ Training-logic integrity preserved; **single inflation owner**; **no second cuff forked**;
  **environment hidden in AR**.
- ✅ Performance: first-load ≤ 2 s target (≤ 5 s ceiling); no framerate regression; asset budget
  respected; no per-frame allocations introduced.
- ✅ **No new runtime dependency** beyond `playcanvas`/`peerjs`/`qrcode` (or approval named + bundle
  delta reported).
- ✅ Do-Not-Touch audit (§7) confirmed clean.
- ⚠️ **On-device WebXR verification is still pending** — flag anything needing headset validation
  (image tracking QA especially, since Android XR docs don't yet list it). **Never claim on-device
  correctness you did not verify.**

### Step 4 — APPLY
- Apply only after Steps 1–3 pass. Commit on a **feature branch** with a clear message; **open a
  PR** — never push straight to the protected branch, never force-push.
- Deliver the final runbook + a short summary: what changed, files, check results, perf numbers, and
  any remaining on-device verification steps.

**If any step fails, STOP and report — do not paper over failures to reach "done."**

---

## 9. Definition of Done for a change

- Strict `tsc --noEmit` clean; `npm run build` succeeds.
- No new runtime deps beyond the allowed set; no per-frame allocations introduced.
- Cuff realism preserved; **all** XR features gated with fallbacks; `app.xr` null-guarded.
- Training-logic integrity preserved: `training/` engine-free; clinical values in
  `config/trainingConfig.ts` and `SME-REVIEW:`-flagged; new clinical assumptions appended to
  `TRAINING_LOGIC.md` §7. No second cuff forked; single inflation owner.
- Environment hidden in AR (preview-only), transform independent of the cuff; patient arm rides the
  cuff and stays its own entity.
- New assumptions recorded in `SPEC.md` §12. Docs updated if behavior/commands changed.

---

## 10. Governance & Escalation

- **Decision rights:** Requirements define the *outcome*; **Doug (CTO/CIO) owns the technical
  implementation approach.** PlayCanvas is the current direction; Unity is only a future porting
  option if strategy changes — do not reintroduce it.
- **On conflicting instructions:** present the available options with tradeoffs and **ask what to do**
  before applying; apply the most **robust, stable, IT-best-practice** option where one clearly
  exists. This file is authoritative over repeated/secondary instructions and over `AGENTS.md` /
  `.cursorrules`.
- **When to STOP and ask** (do not guess): clinical values/thresholds/sequence, scoring-core
  behavior, engine/toolchain version, CI gates, secrets/PHI, licensed-asset node structure, adding a
  runtime dependency, or any §7 Do-Not-Touch item.
- **Truthfulness:** Never claim a check passed, a build succeeded, or on-device behavior works unless
  you actually ran/verified it. Report unknowns as unknowns.
- **Consistency:** This is the standing contract. If a request contradicts it, surface the conflict
  and ask before acting.

---

## 11. Repository map (orientation)

- **Governance:** `CLAUDE.md` (this file, authoritative) · `AGENTS.md` + `.cursorrules` (condensed
  mirrors) · `SPEC.md` (product/engineering spec + assumptions §12) · `TRAINING_LOGIC.md` (clinical
  logic + SME-review list §7) · `SME_REVIEW.md` · `ASSET_PIPELINE.md` · `MIRRORING.md` · `RUNBOOK.md`.
- **App source (`src/`):** `core/` (app bootstrap, scene/material factories, perf monitor,
  xrBootstrap, assetRegistry) · `config/` (`appConfig`, `capabilities`, `qualityProfiles`,
  **`trainingConfig`**) · `ar/` (hand tracking, ray, hit-test, anchors, gestures, fallback modes) ·
  `entities/` (`bloodPressureCuff`, `cuffVariants`, `environmentRoot`, `patientArm`) ·
  `interaction/` (grab, inflation, gauge, placement, inspection, trainingStep) · `training/`
  (**engine-free** state machine, steps, error states, validation, prompts) · `animation/`
  (procedural motion, cuff animator, timeline) · `materials/` · `scene/` · `mirror/` + `qr/`
  (PeerJS/QRCode phone mirror) · `ui/` · `utils/` (`math.ts` scratch pool, logging, profiling).
- **`webxr-starter/`** — a **self-contained** PlayCanvas WebXR starter (its own `package.json`,
  plain-JS ESM, excluded from the root `tsconfig`/CI). It does **not** affect the root build. Treat
  it as an independent learning/reference sandbox, not part of the cuff app's build graph.

---

*Repo: `FLWizkid/June-VR` · Product: Encountive Manual Blood Pressure Trainer · Handover ref:
`ENC-MBPXR-SDD-v0.5` · Owner: Doug Tully (CTO). This file consolidates all prior scripts, conflict
decisions, and best practices into one authoritative contract. Keep it current.*
