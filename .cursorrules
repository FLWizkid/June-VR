# June-VR — Encountive Manual BP Trainer · agent rules (condensed)
# Full contract: CLAUDE.md (authoritative). This is the fast IDE context. On conflict, CLAUDE.md wins.

## Stack (do not deviate)
- PlayCanvas 2.19.7 (pinned) · TypeScript strict · Vite · WebXR (immersive-ar, WebGL fallback) · GLB/glTF assets.
- Unity-free forever. No Unity, Three.js-direct, Babylon, R3F, new bundlers, new state libs, new physics engines.
- Runtime deps: playcanvas, peerjs, qrcode ONLY. Add nothing else without approval; report bundle-size delta.

## Performance = acceptance criteria (reject regressions)
- First load ≤ 2s target, ≤ 5s hard ceiling on Android XR glasses. Measure, don't assume.
- Highest STABLE framerate beats visual fidelity. No stutter during grab/inflate/deflate.
- Gauge legible at 6–12in under varied pass-through light. Keep 1024² gauge texture, off-white face, black needle/red tip, red danger zone, separate digital readout.
- Hand-first input: grab/pump/valve via hand tracking + pinch, no controllers.
- No per-frame allocations in update/tick/event loops — reuse scratch temporaries in src/utils/math.ts. Lazy-load non-critical assets.

## Architecture / modularity
- Deterministic scoring is the only source of clinical truth — never AI, physics, or randomness. AI ("Preceptor") = non-real-time coaching only.
- State machine drives the procedure: placement → seal → inflation → controlled deflation → reading → scoring. Physics = triggers/proximity/contact only.
- One responsibility per module (keep the ~41-module split). Dep direction: presentation/XR → state machine → scoring core. No circular imports.
- All 3 tiers (headset AR / phone WebAR / non-XR) share the same manifest + thresholds. Never reimplement rules per tier.
- Drive the EXISTING BloodPressureCuff via CuffScene; never fork a 2nd cuff. Single inflation owner; animators READ pressure.
- Environment is preview-only: disabled during any XR/AR session (optical see-through). AR camera uses clearColorBuffer=false; no skybox in AR.

## WebXR / capability rules
- Every WebXR feature (hit test, hand input, anchors, depth, light estimation) is capability-gated: detect via app.xr + .supported/.available, always provide a fallback. app.xr may be null — guard it.
- app.xr.start() is callback-based, returns void, must be called from a user gesture. Verify XR APIs against node_modules/playcanvas/*.d.ts before use.
- Interaction order: hands → ray → place/inspect; re-select live on capability change.

## Do-not-touch 🚫 (STOP and ask; name the file + get permission)
- Clinical values/thresholds/step order in config/trainingConfig.ts — extend ONLY via SME-REVIEW: flag + log in TRAINING_LOGIC.md §7. Never change a clinical value silently.
- Engine pin (^2.19.7), vite.config.ts, tsconfig, package.json scripts.
- CI (.github/workflows/ci.yml) — never weaken/skip to "get green".
- Secrets/env/deploy: .env*, vercel.json, Vercel/Supabase keys. Never print or commit secrets.
- Regulated-record/PHI writes (belong in the platform repo, gated by BAAs).
- Licensed BP-gauge Blender source + GLB node structure (gauge/needle/cuff/tubing/bulb as SEPARATE meshes — runtime drives needle & grabs bulb by node). Don't merge/rename/collapse.
- Git history/branches: no force-push, no history rewrite, no branch deletion.
- Backend/platform code (React/Supabase) is out of scope here unless the task says so.

## Workflow — PLAN → TEST → VERIFY → APPLY
1. PLAN first, get approval before implementation code: goal+scope, files touched (confirm none are do-not-touch), layer impact, runbook tagged [Claude Code]/[PlayCanvas Editor]/[Blender]/[Device Browser]/[CI], perf impact, test plan, rollback.
2. TEST: cover state-machine transitions (valid+invalid); clinical changes reviewable without 3D/WebXR code + logged in TRAINING_LOGIC.md §7; deterministic assertions only.
3. VERIFY: `npx tsc --noEmit` clean; `npm run build` succeeds (report bundle delta); cuff realism + XR fallbacks + null-guards intact; single inflation owner; env hidden in AR; perf budget met; do-not-touch audit clean. ⚠️ On-device WebXR verification still pending — never claim on-device correctness you didn't verify.
4. APPLY only after 1–3 pass. Deliver runbook + summary. If any step fails: STOP and report — never paper over failures.

## Governance
- Requirements define the outcome; Doug (CTO/CIO) owns the implementation approach. PlayCanvas is the direction; Unity only if strategy changes.
- Truthfulness: never claim a check/build/on-device result you didn't run. Report unknowns as unknowns.
- This file + CLAUDE.md are the standing contract. If a request conflicts, surface it and ask.
