/**
 * Training configuration (SPEC STEP 8 / TRAINING_LOGIC.md).
 *
 * Central, data-only tuning for the procedural BP-cuff teaching sequence. Kept separate from the
 * runtime so a nurse-educator / clinical SME can review and adjust every clinically-meaningful value
 * in ONE place without touching engine code.
 *
 * IMPORTANT — clinical honesty (CLAUDE.md / SPEC STEP 8):
 *   The values below are *scaffolding for a simulator*, NOT validated clinical guidance. Each value
 *   that encodes a procedure claim (target pressure, deflation rate, hold time, ordering) is flagged
 *   `SME-REVIEW:` here and aggregated in TRAINING_LOGIC.md §"SME review items". They drive plausible
 *   on-screen motion/feedback only; they must be confirmed against an authoritative source (e.g. AHA
 *   measurement guidance + the device's own IFU) before any real instructional use.
 *
 * No engine imports here — this stays a pure data module so it is trivially reviewable.
 */

import { PRESSURE_MMHG } from '../utils/units';

/** A single ordered training step the procedure state machine walks through. */
export const enum TrainingStepId {
  /** Pick the correct cuff size for the (simulated) patient arm. */
  SelectSize = 'select-size',
  /** Inspect the cuff: identify gauge, tubing, bulb, bladder, artery marker, Velcro. */
  InspectComponents = 'inspect-components',
  /** Orient the cuff (artery marker toward the brachial artery; tubing routed correctly). */
  OrientCuff = 'orient-cuff',
  /** Position / wrap the cuff on the upper arm at the correct height and snugness. */
  PositionCuff = 'position-cuff',
  /** Confirm fit (snug, ~1–2 fingers; lower edge above the antecubital fossa). */
  ConfirmFit = 'confirm-fit',
  /** Inflate to the target, demonstrating the pump phase. */
  Inflate = 'inflate',
  /** Observe the gauge / controlled deflation and the (simulated) readout. */
  ObserveGauge = 'observe-gauge',
  /** Complete — fully deflate, summary. */
  Complete = 'complete',
}

/** High-level training session mode (SPEC STEP 8). */
export const enum TrainingMode {
  /** Step-by-step, prompts + validation, advances on correct action. */
  Guided = 'guided',
  /** Free close-up inspection; no step gating. */
  Inspection = 'inspection',
  /** Placement-focused practice (orient + position + fit). */
  Placement = 'placement',
  /** Hands-off animated walkthrough of the whole sequence. */
  Demonstration = 'demonstration',
}

/**
 * Clinical tuning constants for the simulated inflation/deflation behaviour.
 *
 * SME-REVIEW: every field below is a procedure claim. Confirm against AHA/AAMI guidance + device IFU.
 */
export const TRAINING_CLINICAL = {
  /**
   * Target cuff pressure for the demonstration inflation (mmHg).
   * SME-REVIEW: real practice inflates to ~30 mmHg above the palpated/estimated systolic, not a
   * fixed number. We use a fixed plausible value for the demo only.
   */
  targetInflateMmHg: PRESSURE_MMHG.typicalInflate,
  /**
   * Controlled deflation rate shown during the observe phase (mmHg per second).
   * SME-REVIEW: commonly taught as ~2–3 mmHg/sec (or per beat). Confirm and tune.
   */
  controlledDeflateMmHgPerSec: 3,
  /**
   * Seconds to hold at target before controlled deflation begins (demonstration pacing only).
   * SME-REVIEW: not a clinical hold requirement; presentation pacing.
   */
  holdSeconds: 1.0,
  /**
   * Plausible simulated systolic/diastolic shown as teaching markers on the dial during deflation.
   * SME-REVIEW: illustrative values; a real reading is auscultated/oscillometric, not scripted.
   */
  demoSystolicMmHg: 120,
  demoDiastolicMmHg: 80,
} as const;

/**
 * Fit / placement tolerances used by the (illustrative) validation rules. Distances in meters.
 *
 * SME-REVIEW: these tolerances are simulator affordances chosen for legible interaction on XR
 * hardware, not measured clinical thresholds. Confirm acceptable placement bands with an educator.
 */
export const TRAINING_TOLERANCES = {
  /** How close (m) the cuff must be to the target placement pose to count as "positioned". */
  positionToleranceM: 0.06,
  /** Max orientation error (degrees) from the taught orientation to count as "oriented". */
  orientationToleranceDeg: 25,
  /** Snugness band: simulated wrap gap that reads as a correct ~1–2 finger fit (normalized 0..1). */
  snugness: { min: 0.15, max: 0.45 },
  /** Dwell (seconds) the user must satisfy a condition before a step auto-confirms in guided mode. */
  confirmDwellSeconds: 0.6,
} as const;

/** Default mode when the training scene starts. */
export const DEFAULT_TRAINING_MODE: TrainingMode = TrainingMode.Guided;

/** Ordered canonical step sequence (the guided path). Other modes select a subset. */
export const TRAINING_STEP_ORDER: readonly TrainingStepId[] = [
  TrainingStepId.SelectSize,
  TrainingStepId.InspectComponents,
  TrainingStepId.OrientCuff,
  TrainingStepId.PositionCuff,
  TrainingStepId.ConfirmFit,
  TrainingStepId.Inflate,
  TrainingStepId.ObserveGauge,
  TrainingStepId.Complete,
] as const;
