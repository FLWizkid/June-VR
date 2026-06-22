/**
 * Training step definitions (SPEC STEP 8 / TRAINING_LOGIC.md).
 *
 * Declarative description of each step in the BP-cuff teaching sequence: title, learner-facing
 * instruction, the success criterion's nature, and which wrap/animation state it expects. This is
 * DATA so a nurse-educator SME can review wording and ordering without reading engine code.
 *
 * SME-REVIEW (aggregated in TRAINING_LOGIC.md): the instructional text and the *implied* correctness
 * of each step are simulator scaffolding. They are written to be clinically plausible but are NOT a
 * validated curriculum. Confirm wording, ordering, and pass criteria with a clinical educator.
 */

import { TrainingStepId } from '../config/trainingConfig';
import { WrapState } from '../animation/cuffAnimator';

/** How a step is satisfied — drives which validation path the state machine runs. */
export const enum StepCriterion {
  /** Learner chooses a cuff size (any selection advances; correctness is informational). */
  SizeSelected = 'size-selected',
  /** Learner dwells in close inspection (looks at the cuff) long enough. */
  Inspected = 'inspected',
  /** Cuff orientation is within tolerance of the taught orientation. */
  Oriented = 'oriented',
  /** Cuff is within position tolerance of the target placement pose. */
  Positioned = 'positioned',
  /** Simulated snugness is within the acceptable fit band. */
  FitConfirmed = 'fit-confirmed',
  /** An inflation cycle has been started and reached/passed target. */
  InflatedToTarget = 'inflated-to-target',
  /** Controlled deflation has been observed through the systolic/diastolic band. */
  GaugeObserved = 'gauge-observed',
  /** Terminal — no further criterion. */
  Done = 'done',
}

export interface StepDefinition {
  readonly id: TrainingStepId;
  /** Short title for the panel header. */
  readonly title: string;
  /** Learner-facing instruction (one or two sentences). */
  readonly instruction: string;
  /** What satisfies this step. */
  readonly criterion: StepCriterion;
  /** Wrap/animation state the cuff should present while this step is active. */
  readonly wrapState: WrapState;
  /** Whether the step can auto-advance on dwell once its condition holds (guided mode). */
  readonly autoAdvance: boolean;
}

/**
 * The canonical step table. Order here matches TRAINING_STEP_ORDER. Text deliberately teaches the
 * *shape* of the task; precise clinical thresholds live in trainingConfig + validationRules and are
 * SME-gated.
 */
export const STEP_DEFINITIONS: Readonly<Record<TrainingStepId, StepDefinition>> = {
  [TrainingStepId.SelectSize]: {
    id: TrainingStepId.SelectSize,
    title: 'Select cuff size',
    instruction:
      'Choose the cuff size that matches the patient’s upper-arm circumference. The bladder should ' +
      'encircle ~80% of the arm. Use the size control to compare pediatric/small, adult, and large.',
    criterion: StepCriterion.SizeSelected,
    wrapState: WrapState.Open,
    autoAdvance: false,
  },
  [TrainingStepId.InspectComponents]: {
    id: TrainingStepId.InspectComponents,
    title: 'Inspect the cuff',
    instruction:
      'Bring the cuff close and identify each part: the aneroid gauge, rubber tubing, inflation ' +
      'bulb with valve, the bladder inside the fabric, the artery index marker, and the Velcro.',
    criterion: StepCriterion.Inspected,
    wrapState: WrapState.Open,
    autoAdvance: true,
  },
  [TrainingStepId.OrientCuff]: {
    id: TrainingStepId.OrientCuff,
    title: 'Orient the cuff',
    instruction:
      'Orient the cuff so the artery marker points toward the brachial artery and the tubing exits ' +
      'toward the hand/antecubital side. Rotate the cuff until it is aligned.',
    criterion: StepCriterion.Oriented,
    wrapState: WrapState.Open,
    autoAdvance: true,
  },
  [TrainingStepId.PositionCuff]: {
    id: TrainingStepId.PositionCuff,
    title: 'Position on the arm',
    instruction:
      'Place the cuff on the upper arm with its lower edge about 2–3 cm above the elbow crease, at ' +
      'heart level. Move the cuff to the highlighted target position.',
    criterion: StepCriterion.Positioned,
    wrapState: WrapState.Positioned,
    autoAdvance: true,
  },
  [TrainingStepId.ConfirmFit]: {
    id: TrainingStepId.ConfirmFit,
    title: 'Confirm the fit',
    instruction:
      'Tighten the cuff so it is snug — about one to two fingers should fit underneath. Adjust until ' +
      'the fit indicator reads correct (not loose, not over-tight).',
    criterion: StepCriterion.FitConfirmed,
    wrapState: WrapState.Tightened,
    autoAdvance: true,
  },
  [TrainingStepId.Inflate]: {
    id: TrainingStepId.Inflate,
    title: 'Inflate',
    instruction:
      'Close the valve and pump to inflate the bladder to the target pressure. Watch the bladder ' +
      'firm up and the gauge needle rise.',
    criterion: StepCriterion.InflatedToTarget,
    wrapState: WrapState.Tightened,
    autoAdvance: true,
  },
  [TrainingStepId.ObserveGauge]: {
    id: TrainingStepId.ObserveGauge,
    title: 'Observe the gauge',
    instruction:
      'Open the valve slightly for a slow, controlled deflation. Observe the needle fall through the ' +
      'systolic and diastolic markers on the dial.',
    criterion: StepCriterion.GaugeObserved,
    wrapState: WrapState.Tightened,
    autoAdvance: true,
  },
  [TrainingStepId.Complete]: {
    id: TrainingStepId.Complete,
    title: 'Complete',
    instruction:
      'Fully deflate and remove the cuff. Review: correct size, orientation, placement, snug fit, ' +
      'controlled inflation and deflation. Restart to practice again.',
    criterion: StepCriterion.Done,
    wrapState: WrapState.Open,
    autoAdvance: false,
  },
};

/** Look up a step definition. */
export function getStepDefinition(id: TrainingStepId): StepDefinition {
  return STEP_DEFINITIONS[id];
}
