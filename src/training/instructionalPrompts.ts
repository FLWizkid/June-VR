/**
 * Instructional prompts (SPEC STEP 8).
 *
 * Pure composition of the learner-facing text for the training panel from: the active step, the
 * validation result (satisfied?), and any error state. Keeping this pure + separate makes the
 * wording trivially reviewable by an SME (TRAINING_LOGIC.md) and easy to localize later.
 */

import { TrainingMode } from '../config/trainingConfig';
import type { TrainingStepId } from '../config/trainingConfig';
import { getStepDefinition } from './stepDefinitions';
import { getErrorInfo } from './errorStates';
import type { TrainingError } from './errorStates';
import type { ValidationResult } from './validationRules';

/** A fully-composed prompt for the UI. */
export interface InstructionalPrompt {
  readonly title: string;
  readonly instruction: string;
  /** Corrective line if an error applies, else ''. */
  readonly correction: string;
  /** Short positive confirmation when the step is satisfied, else ''. */
  readonly confirmation: string;
  /** [0,1] progress toward the step's criterion. */
  readonly progress: number;
}

/** Confirmation lines per step keyed loosely by title intent. Kept generic + encouraging. */
const CONFIRMATION = 'Looks correct — ready for the next step.';

/** Compose the prompt for the active step. Pure. */
export function composePrompt(
  stepId: TrainingStepId,
  result: ValidationResult,
): InstructionalPrompt {
  const def = getStepDefinition(stepId);
  const errInfo = getErrorInfo(result.error);
  return {
    title: def.title,
    instruction: def.instruction,
    correction: errInfo.correction,
    confirmation: result.satisfied ? CONFIRMATION : '',
    progress: result.progress,
  };
}

/** A short banner describing the active mode (for the panel header). */
export function describeMode(mode: TrainingMode): string {
  switch (mode) {
    case TrainingMode.Guided:
      return 'Guided practice';
    case TrainingMode.Inspection:
      return 'Free inspection';
    case TrainingMode.Placement:
      return 'Placement practice';
    case TrainingMode.Demonstration:
      return 'Demonstration';
    default:
      return 'Training';
  }
}

/** Human-readable error label (for logs / accessibility). */
export function describeError(error: TrainingError): string {
  return getErrorInfo(error).error;
}
