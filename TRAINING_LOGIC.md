# TRAINING_LOGIC — AR Blood Pressure Cuff (Nurse Training)

> Educational design + procedure logic for the AR BP-cuff trainer.
> Stack: **PlayCanvas standalone + TypeScript (strict) + ESM + Vite. No Unity.**
>
> **CLINICAL HONESTY (read first).** This document and the code it describes are a **simulator
> scaffold built for SME validation**, not a validated curriculum. The app deliberately **separates
> "visual realism" from "procedure correctness"**: the realism is in the rendered cuff; the
> correctness is in editable, clearly-flagged logic. Every clinically-meaningful claim is marked
> `SME-REVIEW:` in code and aggregated in §7 below. **No unverified clinical assertion should be
> treated as authoritative** until a nurse-educator / clinical SME signs off.

---

## 1. Educational purpose

Teach a learner to **recognize, handle, orient, place, fit, inflate, and read** a manual aneroid
blood-pressure cuff, at training-grade visual fidelity, in optical see-through AR. The app targets
**familiarization and procedural sequencing** — the *shape* of correct practice — not measurement
certification.

What "accurate movement and usage" means **in this app**:
- Motion ranges are **realistic and legible**, never game-like (no spin, no exaggerated bounce).
- The cuff is **handled as one object**: pick up, orient, place on the (implied) upper arm, tighten
  to a snug fit, inflate (bladder firms, needle rises), then a **slow controlled deflation**.
- Each step has an **observable success condition** and **non-blocking corrective feedback** when the
  learner does something the simulator flags as incorrect (loose fit, fast deflation, etc.).

---

## 2. Architecture: realism vs. correctness (kept separate on purpose)

| Concern | Where it lives | Reviewed by |
| --- | --- | --- |
| **Visual realism** (materials, gauge, tube, bulb, fabric, swell) | `materials/`, `entities/bloodPressureCuff.ts`, `animation/` | Technical artist |
| **Procedure correctness** (steps, pass/fail, errors, prompts) | `config/trainingConfig.ts`, `training/*` | **Clinical SME** |
| **Interaction glue** (engine state ↔ training observation) | `interaction/trainingStepController.ts` | Engineer |

The training "brain" (`training/procedureStateMachine.ts`) is **engine-free**: it consumes a plain
`TrainingObservation` (numbers/enums) and emits prompts + step events. This means a nurse-educator can
review **`config/trainingConfig.ts`**, **`training/stepDefinitions.ts`**, **`training/errorStates.ts`**,
and **`training/validationRules.ts`** as plain logic, without reading any 3D/WebXR code.

---

## 3. Cuff handling sequence (the guided path)

Defined in `training/stepDefinitions.ts`, ordered by `config/trainingConfig.ts → TRAINING_STEP_ORDER`:

1. **Select cuff size** — choose pediatric/small, adult, or large for the arm. *(SME-REVIEW: sizing
   rule; the demo treats Adult/Medium as the "correct" arm — see §7.)*
2. **Inspect the cuff** — bring it close; identify gauge, tubing, bulb+valve, bladder, artery marker,
   Velcro. Satisfied by **dwelling in close-up** for a short time.
3. **Orient the cuff** — artery marker toward the brachial artery; tubing toward the antecubital
   side. Satisfied when orientation error is within tolerance.
4. **Position on the arm** — lower edge ~2–3 cm above the elbow crease, at heart level. Satisfied when
   the cuff is within position tolerance of the highlighted **target marker**.
5. **Confirm the fit** — tighten to snug (~1–2 fingers). Satisfied when simulated snugness is inside
   the acceptable band (too loose / too tight are flagged).
6. **Inflate** — close valve, pump to target; the **bladder visibly firms** and the **needle rises**.
   Satisfied when peak pressure reaches target.
7. **Observe the gauge** — slow, controlled deflation; watch the needle fall through the systolic /
   diastolic markers. Fast deflation is flagged.
8. **Complete** — fully deflate; summary; restart to practice again.

---

## 4. Training modes (`config/trainingConfig.ts → TrainingMode`)

- **Guided** — full ordered sequence; auto-advances on a satisfied step after a short dwell.
- **Placement** — subset (orient → position → fit) for placement drills.
- **Inspection** — free close-up look; no step gating.
- **Demonstration** — **hands-off** walkthrough driven by `animation/timelineController.ts`: it scrubs
  the wrap tighten, triggers one inflation cycle, and mirrors the state machine to the shown step.

The state machine never self-advances in Demonstration or Inspection mode.

---

## 5. Validation rules (procedure correctness)

Pure functions in `training/validationRules.ts`, fed by a `TrainingObservation` built each frame by
`interaction/trainingStepController.ts` from the **existing** cuff/animator/inflation/camera state:

| Step | Success condition (simulator) | Error(s) it can raise |
| --- | --- | --- |
| Select size | a size has been chosen | `WrongSize` (chosen ≠ demo arm) |
| Inspect | close-up dwell ≥ threshold | — |
| Orient | orientation error ≤ `orientationToleranceDeg` | `Misoriented` |
| Position | distance to target ≤ `positionToleranceM` | `Mispositioned` |
| Confirm fit | snugness within `snugness` band | `TooLoose` / `TooTight` |
| Inflate | peak pressure ≥ ~target | — |
| Observe | deflation passed below diastolic marker | `DeflatedTooFast` |

All thresholds live in `config/trainingConfig.ts` (`TRAINING_TOLERANCES`, `TRAINING_CLINICAL`) so an
SME can tune them in one place. Errors are **non-blocking**: the app teaches, it does not punish; the
panel shows a corrective line (`training/errorStates.ts`) and the learner can keep adjusting.

---

## 6. Visual + interaction cues

- **Proximity / hover highlight** on the cuff body (subtle emissive lift — additive-display safe).
- **Translucent target marker** (green ring) during the Position step shows where to place the cuff.
- **Bladder swell**: the fabric body thickens with pressure (`bloodPressureCuff.setBladderSwell`).
- **Gauge needle** rises/falls with pressure (existing `interaction/gaugeController.ts`).
- **Training panel** (`ui/trainingPanel.ts`): mode buttons, step header, instruction, **progress bar**,
  corrective guidance, Next / Restart.
- Motion is procedural and conservative (`animation/proceduralMotion.ts`): smoothstep easing, a small
  settle on pickup, a low-amplitude idle bob while held — nothing flashy.

---

## 7. SME review items (MUST be validated before instructional use)

Each item is also flagged `SME-REVIEW:` at its source. None is asserted as clinically correct here.

1. **Target inflation pressure** (`TRAINING_CLINICAL.targetInflateMmHg`, default 180 mmHg). Real
   practice inflates to ~30 mmHg above palpated/estimated systolic, **not** a fixed number.
2. **Controlled deflation rate** (`controlledDeflateMmHgPerSec`, default 3). Commonly taught as
   ~2–3 mmHg/sec (or per beat). Confirm and tune; the "too fast" threshold is a multiple of this.
3. **Hold time at target** (`holdSeconds`) — presentation pacing only, not a clinical requirement.
4. **Demo systolic/diastolic markers** (`demoSystolicMmHg` / `demoDiastolicMmHg`, 120/80). Illustrative
   only; a real reading is auscultated/oscillometric, not scripted.
5. **"Correct" cuff size for the demo arm** = Adult/Medium (`trainingStepController.notifySizeChosen`).
   The actual rule is bladder length/width vs. arm circumference (~80% encirclement). Confirm the
   sizing guidance and which size is "right" for the simulated patient.
6. **Fit tolerance / snugness band** (`TRAINING_TOLERANCES.snugness`) — a simulator affordance chosen
   for legible XR interaction, not a measured threshold. Confirm acceptable fit feedback.
7. **Orientation & position tolerances** (`orientationToleranceDeg`, `positionToleranceM`) — affordances
   for XR hand precision, not clinical bands. Confirm placement landmarks (artery marker, 2–3 cm above
   the antecubital fossa, heart level) and acceptable error.
8. **Step ordering & wording** (`training/stepDefinitions.ts`, `training/errorStates.ts`,
   `training/instructionalPrompts.ts`) — written to be plausible; confirm the sequence, the
   instructional text, and the corrective text against an authoritative source (e.g. AHA measurement
   guidance) **and the specific device's IFU**.
9. **Demonstration pacing** (`DEMO_SEGMENTS` durations) — presentation only.
10. **Procedural patient-arm anatomy & pose** (`ARM_POSE` in `config/trainingConfig.ts`;
    `entities/patientArm.ts`). The upper-arm/forearm dimensions and the relaxed **bent-elbow rest
    pose** are plausible-adult teaching affordances, **not** anthropometrically validated and **not**
    the asserted clinically-correct measurement posture (arm supported at **heart level, palm up**).
    Confirm acceptable dimensions, pose, and whether a supported/heart-level posture should be taught
    or enforced. (The arm is a stand-in until a real arm/manikin GLB is supplied.)
11. **Cuff-on-arm placement** (`CUFF_ON_ARM` in `config/trainingConfig.ts`). The wrap is centered at
    `alongUpperArm01` of the upper arm with an implied artery-marker orientation. Confirm the correct
    **landmark** (artery marker over the **brachial artery**; lower cuff edge **~2–3 cm above the
    antecubital fossa**) and acceptable placement band. Currently a visual affordance only — placement
    correctness is still scored against a **captured target pose**, not arm anatomy (see §8).

> Recommended sources for the SME to validate against: current **AHA/ACC blood-pressure measurement
> guidance**, **AAMI/ISO 81060** cuff sizing, and the **manufacturer IFU** for the specific cuff.

---

## 8. What is intentionally NOT claimed

- No real blood-pressure **reading** is computed; systolic/diastolic markers are scripted teaching
  cues, not measurements.
- A **procedural patient arm** is now shown (foreground, also in AR) as the cuff target, but it is a
  **visual stand-in with unvalidated anatomy/pose** (§7 items 10–11); placement is still validated
  against a **captured target pose**, **not** the arm's anatomy. A real arm/manikin GLB
  (`assets/models/patient_arm.glb`) can replace the stand-in, and landmark-based validation can replace
  the captured-pose seam, later.
- No assessment/scoring/credentialing — this is familiarization, structured so scoring **could** be
  layered on the existing `ValidationResult` once an SME defines passing criteria.
