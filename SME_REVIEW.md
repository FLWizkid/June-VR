# Clinical SME Review — AR Blood-Pressure Cuff Trainer

**Purpose.** This sheet lists every clinically-meaningful value and behavior in the trainer so a
**nurse educator / clinical SME** can validate or correct it **without reading any code**. Each item
traces to exactly one place in the code (the `config key`), so an approved change is a one-line edit.

> **Clinical honesty.** The application asserts **nothing** as clinically correct. Every value below is
> a *simulator placeholder* chosen to be plausible and to drive legible on-screen motion/feedback.
> **Do not use for instruction until signed off.** Validate against current **AHA/ACC blood-pressure
> measurement guidance**, **AAMI / ISO 81060-2** cuff sizing, and the **manufacturer IFU** for the
> specific cuff. Source of truth in code: `src/config/trainingConfig.ts` + `TRAINING_LOGIC.md §7`.

**How to use.** For each row, mark **Approved** or write the **Correct value / change**, then initial
and date. Return the sheet (or comment on the PR). We apply approved changes in `trainingConfig.ts`
(one file; wording lives in three `training/*` text files) and you re-review.

---

## Sign-off summary

| Domain | Items | Status (SME fills) |
|---|---|---|
| Inflation / deflation | 1–3 | ☐ approved  ☐ changes noted |
| Measurement markers | 4 | ☐ approved  ☐ changes noted |
| Cuff sizing | 5 | ☐ approved  ☐ changes noted |
| Fit & placement tolerances | 6–7 | ☐ approved  ☐ changes noted |
| Patient-arm anatomy & pose | 8 | ☐ approved  ☐ changes noted |
| Cuff-on-arm placement landmark | 9 | ☐ approved  ☐ changes noted |
| Procedure steps & wording | 10–11 | ☐ approved  ☐ changes noted |

**Reviewer:** __________________________  **Role / credentials:** ______________________  **Date:** ____________

---

## 1 · Inflation / deflation

| # | Item | Current value | Config key | Question for the SME | Correct value / approved? |
|---|---|---|---|---|---|
| 1 | Target inflation pressure (demo) | **180 mmHg** (fixed) | `TRAINING_CLINICAL.targetInflateMmHg` → `utils/units PRESSURE_MMHG.typicalInflate` | Real practice inflates to ~30 mmHg **above the palpated/estimated systolic** — not a fixed number. Keep a fixed demo value (and which), or drive it from an estimated systolic? | |
| 2 | Controlled deflation rate | **3 mmHg/sec** | `TRAINING_CLINICAL.controlledDeflateMmHgPerSec` | Commonly taught ~**2–3 mmHg/sec** (or per beat). Confirm the rate and the "deflating too fast" flag threshold (a multiple of this). | |
| 3 | Hold at target before deflation | **1.0 s** | `TRAINING_CLINICAL.holdSeconds` | Presentation pacing only (not a clinical hold requirement). OK as-is? | |

## 2 · Measurement markers

| # | Item | Current value | Config key | Question for the SME | Correct value / approved? |
|---|---|---|---|---|---|
| 4 | Demo systolic / diastolic markers on the dial | **120 / 80 mmHg** | `TRAINING_CLINICAL.demoSystolicMmHg` / `demoDiastolicMmHg` | Illustrative only (a real reading is auscultated/oscillometric, not scripted). Are 120/80 acceptable teaching cues, or prefer a different illustrative pair? | |

## 3 · Cuff sizing

| # | Item | Current value | Config key | Question for the SME | Correct value / approved? |
|---|---|---|---|---|---|
| 5 | "Correct" size for the simulated arm | **Adult / Medium** | `interaction/trainingStepController.ts → notifySizeChosen`; sizes in `entities/cuffVariants.ts` | The real rule is bladder width/length vs. arm circumference (≈80% encirclement, ≈40% width). Confirm which size is correct for the sim arm (upper-arm radius ≈ 4.5–5.5 cm) and the sizing guidance to teach. | |

## 4 · Fit & placement tolerances *(simulator affordances, not measured thresholds)*

| # | Item | Current value | Config key | Question for the SME | Correct value / approved? |
|---|---|---|---|---|---|
| 6 | Snugness band ("~1–2 fingers") | **0.15 – 0.45** (normalized) | `TRAINING_TOLERANCES.snugness` | Chosen for legible XR interaction. Is "snug, admits ~1–2 fingers" the right fit target + feedback (too-loose / too-tight flags)? | |
| 7 | Orientation & position tolerance | **25°** / **0.06 m** | `TRAINING_TOLERANCES.orientationToleranceDeg` / `positionToleranceM` | Affordances for XR hand precision. Confirm placement landmarks and acceptable error. | |

## 5 · Patient arm — anatomy & pose *(procedural stand-in)*

| # | Item | Current value | Config key | Question for the SME | Correct value / approved? |
|---|---|---|---|---|---|
| 8 | Adult arm dimensions + rest pose | upper arm **L 0.30 m, r 0.055→0.045 m**; forearm **L 0.27, r 0.045→0.032**; elbow flex **18°** | `ARM_POSE` (`config/trainingConfig.ts`; `entities/patientArm.ts`) | Plausible-adult affordance, **not** validated; the relaxed bent-elbow pose is **not** asserted as the correct measurement posture (**arm supported at heart level, palm up**). Confirm dimensions/pose, and whether a supported / heart-level posture should be **taught or enforced**. | |

## 6 · Cuff-on-arm placement landmark

| # | Item | Current value | Config key | Question for the SME | Correct value / approved? |
|---|---|---|---|---|---|
| 9 | Where the cuff sits on the upper arm | **0.62** along upper arm (shoulder→elbow); band arc 300° | `CUFF_ON_ARM.alongUpperArm01` (+ `bandArcDeg`, `radialClearanceM`) | Confirm the landmark: **artery marker over the brachial artery**, **lower cuff edge ~2–3 cm above the antecubital fossa**, and the acceptable band. *(Placement is currently scored vs. a captured target pose, not arm anatomy — TRAINING_LOGIC §8.)* | |

## 7 · Procedure — steps & wording

| # | Item | Current value | Config key | Question for the SME | Correct value / approved? |
|---|---|---|---|---|---|
| 10 | Step sequence | Select size → Inspect → Orient → Position → Confirm fit → Inflate → Observe gauge → Complete | `TRAINING_STEP_ORDER`; `training/stepDefinitions.ts` | Confirm this ordering matches taught practice (e.g. size selection driven by arm measurement first). | |
| 11 | Instruction & corrective wording | see files | `training/instructionalPrompts.ts`, `training/errorStates.ts` | Confirm each step's instruction text and each error's corrective text against an authoritative source **and the device IFU**. | |

> *Demonstration segment durations (`DEMO_SEGMENTS`) are presentation pacing only — no clinical review needed.*

---

## Applying decisions
1. SME marks each row (approve / correct value) and signs the summary above.
2. We edit **only** `src/config/trainingConfig.ts` (and the three `training/*` text files for wording) — no engine/3D code.
3. `npm run build`; the change is one commit per item/batch; the SME re-confirms the affected row.

## Explicitly NOT claimed *(context — no review needed)*
- No real BP **reading** is computed; the systolic/diastolic markers are scripted teaching cues.
- The patient arm is a **visual stand-in** with unvalidated anatomy; placement is scored against a **captured target pose**, not the arm's anatomy. A real arm/manikin GLB + landmark-based validation can replace both later.
- **No scoring / credentialing** — this is familiarization, structured so scoring *could* be layered onto the existing `ValidationResult` once an SME defines passing criteria.

---
*Generated from the `SME-REVIEW:` flags in `src/config/trainingConfig.ts` and `TRAINING_LOGIC.md §7`. Keep this sheet and those flags in sync when clinical logic changes (CLAUDE.md rule 8).*
