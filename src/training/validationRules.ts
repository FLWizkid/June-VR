/**
 * Validation rules (SPEC STEP 8 / TRAINING_LOGIC.md "procedure correctness").
 *
 * PURE functions that decide whether a step's success criterion is satisfied, and whether any error
 * state applies, from a plain observation snapshot. Kept free of engine objects so the *logic* is
 * unit-reviewable and clearly SEPARATE from visual realism.
 *
 * SME-REVIEW (aggregated in TRAINING_LOGIC.md): every threshold/decision below is simulator
 * scaffolding tuned for legible XR interaction, NOT a validated clinical measurement. The functions
 * are structured so an educator can adjust the bands (in trainingConfig) and the pass/fail shape here
 * without touching the rest of the app.
 *
 * No allocation concerns: these run on discrete events / low frequency, not in the hot render path,
 * but they still avoid allocation (plain numbers/enums) so they are cheap to call per frame if needed.
 */

import { TRAINING_TOLERANCES, TRAINING_CLINICAL, TrainingStepId } from '../config/trainingConfig';
import { StepCriterion, getStepDefinition } from './stepDefinitions';
import { TrainingError } from './errorStates';
import { InflationPhase } from '../interaction/inflationController';

/**
 * Observation snapshot fed to the validators. All spatial values are simulator-space scalars the
 * training scene computes from the live cuff (it never leaks engine types into this module).
 */
export interface TrainingObservation {
  /** True once the learner has changed/confirmed a size at least once this session. */
  readonly sizeChosen: boolean;
  /** Whether the chosen size matches the (simulated) target arm. */
  readonly sizeMatchesArm: boolean;
  /** Seconds the learner has dwelt in close inspection of the cuff. */
  readonly inspectionDwellSec: number;
  /** Orientation error (degrees) from the taught orientation. */
  readonly orientationErrorDeg: number;
  /** Distance (meters) from the cuff to the target placement pose. */
  readonly positionErrorM: number;
  /** Simulated snugness [0,1] from the wrap tighten amount. */
  readonly snugness: number;
  /** Live inflation phase. */
  readonly inflationPhase: InflationPhase;
  /** Live pressure (mmHg). */
  readonly pressureMmHg: number;
  /** Peak pressure reached this cycle (mmHg). */
  readonly peakPressureMmHg: number;
  /** True once deflation has passed below the demo diastolic marker (full observe). */
  readonly observedThroughDiastolic: boolean;
  /** Measured average deflation rate this cycle (mmHg/sec); 0 if not deflating yet. */
  readonly deflationRateMmHgPerSec: number;
}

/**
 * Result of evaluating the active step. Mutable so callers can reuse one instance per frame (no
 * per-frame allocation — matches the codebase's out-param idiom, e.g. RayInteraction's RayHit).
 */
export interface ValidationResult {
  /** True when the active step's success criterion is met. */
  satisfied: boolean;
  /** A currently-applicable error (or None). Non-blocking; for corrective prompts. */
  error: TrainingError;
  /** Normalized progress toward satisfying the step [0,1] (for a progress bar). */
  progress: number;
}

const OK: TrainingError = TrainingError.None;

/** Create a fresh zeroed result (for owners to hold and reuse). */
export function createValidationResult(): ValidationResult {
  return { satisfied: false, error: OK, progress: 0 };
}

/**
 * Evaluate the active step against an observation, writing into `out` (reused; allocation-free) and
 * returning it. Pure aside from mutating `out`.
 */
export function evaluateStep(
  stepId: TrainingStepId,
  obs: TrainingObservation,
  out: ValidationResult,
): ValidationResult {
  const criterion = getStepDefinition(stepId).criterion;
  switch (criterion) {
    case StepCriterion.SizeSelected:
      out.satisfied = obs.sizeChosen;
      out.error = obs.sizeChosen && !obs.sizeMatchesArm ? TrainingError.WrongSize : OK;
      out.progress = obs.sizeChosen ? 1 : 0;
      break;

    case StepCriterion.Inspected: {
      const need = TRAINING_TOLERANCES.confirmDwellSeconds * 3; // a little longer to "inspect"
      const p = clamp01(obs.inspectionDwellSec / need);
      out.satisfied = p >= 1;
      out.error = OK;
      out.progress = p;
      break;
    }

    case StepCriterion.Oriented: {
      const tol = TRAINING_TOLERANCES.orientationToleranceDeg;
      const within = obs.orientationErrorDeg <= tol;
      const p = clamp01(1 - (obs.orientationErrorDeg - tol) / tol);
      out.satisfied = within;
      out.error = within ? OK : TrainingError.Misoriented;
      out.progress = within ? 1 : p;
      break;
    }

    case StepCriterion.Positioned: {
      const tol = TRAINING_TOLERANCES.positionToleranceM;
      const within = obs.positionErrorM <= tol;
      const p = clamp01(1 - (obs.positionErrorM - tol) / tol);
      out.satisfied = within;
      out.error = within ? OK : TrainingError.Mispositioned;
      out.progress = within ? 1 : p;
      break;
    }

    case StepCriterion.FitConfirmed: {
      const band = TRAINING_TOLERANCES.snugness;
      const tooLoose = obs.snugness < band.min;
      const tooTight = obs.snugness > band.max;
      const within = !tooLoose && !tooTight;
      const mid = (band.min + band.max) / 2;
      const half = (band.max - band.min) / 2;
      out.satisfied = within;
      out.error = tooLoose ? TrainingError.TooLoose : tooTight ? TrainingError.TooTight : OK;
      out.progress = within ? 1 : clamp01(1 - Math.abs(obs.snugness - mid) / (half * 3));
      break;
    }

    case StepCriterion.InflatedToTarget: {
      const target = TRAINING_CLINICAL.targetInflateMmHg;
      out.satisfied = obs.peakPressureMmHg >= target * 0.98;
      out.error = OK;
      out.progress = clamp01(obs.peakPressureMmHg / target);
      break;
    }

    case StepCriterion.GaugeObserved: {
      const tooFast =
        obs.inflationPhase === InflationPhase.Deflating &&
        obs.deflationRateMmHgPerSec > TRAINING_CLINICAL.controlledDeflateMmHgPerSec * 2.5;
      out.satisfied = obs.observedThroughDiastolic;
      out.error = tooFast ? TrainingError.DeflatedTooFast : OK;
      out.progress = obs.observedThroughDiastolic ? 1 : pressureObserveProgress(obs);
      break;
    }

    case StepCriterion.Done:
    default:
      out.satisfied = false;
      out.error = OK;
      out.progress = 1;
      break;
  }
  return out;
}

/** Progress for the observe-gauge step: how far deflation has descended from target toward diastolic. */
function pressureObserveProgress(obs: TrainingObservation): number {
  const top = TRAINING_CLINICAL.targetInflateMmHg;
  const bottom = TRAINING_CLINICAL.demoDiastolicMmHg;
  if (top <= bottom) return 0;
  // Only meaningful once deflating.
  if (obs.inflationPhase !== InflationPhase.Deflating) return 0;
  const descended = top - obs.pressureMmHg;
  return clamp01(descended / (top - bottom));
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
