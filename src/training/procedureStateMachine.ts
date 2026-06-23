/**
 * Procedure state machine (SPEC STEP 8).
 *
 * The training "brain". Walks the learner through the ordered step sequence, evaluating the active
 * step against an observation snapshot each tick and advancing when the criterion is satisfied (with
 * a short dwell so transitions are not twitchy). It is ENGINE-FREE: it consumes a plain
 * `TrainingObservation` and emits a composed `InstructionalPrompt` + step-change events. The training
 * scene adapts engine state ↔ observation and applies wrap/animation per the active step.
 *
 * Modes (SPEC STEP 8):
 *   - Guided: full ordered sequence, auto-advance on satisfied+dwell.
 *   - Placement: subset (orient → position → fit) for placement drills.
 *   - Inspection: free look; no gating (sits on the inspect step, never auto-advances).
 *   - Demonstration: driven externally by the timeline; the machine just reflects the shown step.
 *
 * Allocation-free per tick (numbers/enums + reused prompt struct via a small cache is unnecessary;
 * the composed prompt is only produced on change or on demand).
 */

import {
  TrainingMode,
  TrainingStepId,
  TRAINING_STEP_ORDER,
  TRAINING_TOLERANCES,
  DEFAULT_TRAINING_MODE,
} from '../config/trainingConfig';
import { getStepDefinition } from './stepDefinitions';
import {
  evaluateStep,
  createValidationResult,
  type TrainingObservation,
  type ValidationResult,
} from './validationRules';
import { composePrompt, type InstructionalPrompt } from './instructionalPrompts';
import { TrainingError } from './errorStates';
import { createLogger } from '../utils/logging';

const log = createLogger('training');

/** Step sequence used by the Placement drill mode. */
const PLACEMENT_SEQUENCE: readonly TrainingStepId[] = [
  TrainingStepId.OrientCuff,
  TrainingStepId.PositionCuff,
  TrainingStepId.ConfirmFit,
] as const;

export interface TrainingStatus {
  readonly mode: TrainingMode;
  readonly stepId: TrainingStepId;
  readonly stepIndex: number;
  readonly stepCount: number;
  readonly prompt: InstructionalPrompt;
  readonly error: TrainingError;
  readonly complete: boolean;
}

export type StepChangeListener = (status: TrainingStatus) => void;

export class ProcedureStateMachine {
  private mode: TrainingMode = DEFAULT_TRAINING_MODE;
  private sequence: readonly TrainingStepId[] = TRAINING_STEP_ORDER;
  private index = 0;

  /** Dwell accumulator: how long the active step has been continuously satisfied. */
  private satisfiedDwell = 0;
  /** Reused validation result (mutated each tick; no per-frame allocation). */
  private readonly lastResult: ValidationResult = createValidationResult();

  private listener: StepChangeListener | null = null;

  /** Subscribe to step/status changes. Fires immediately with the current status. */
  setListener(listener: StepChangeListener): void {
    this.listener = listener;
    listener(this.status());
  }

  get currentStep(): TrainingStepId {
    return this.sequence[this.index] ?? TrainingStepId.Complete;
  }

  get currentMode(): TrainingMode {
    return this.mode;
  }

  /** Select a training mode; resets to the first step of that mode's sequence. */
  setMode(mode: TrainingMode): void {
    this.mode = mode;
    switch (mode) {
      case TrainingMode.Placement:
        this.sequence = PLACEMENT_SEQUENCE;
        break;
      case TrainingMode.Inspection:
        this.sequence = [TrainingStepId.InspectComponents];
        break;
      case TrainingMode.Guided:
      case TrainingMode.Demonstration:
      default:
        this.sequence = TRAINING_STEP_ORDER;
        break;
    }
    this.index = 0;
    this.satisfiedDwell = 0;
    log.info(`training mode -> ${mode}`);
    this.emit();
  }

  /** Restart the current mode from its first step. */
  restart(): void {
    this.index = 0;
    this.satisfiedDwell = 0;
    this.emit();
  }

  /** Manually advance to the next step (UI "Next" / non-auto steps). Clamped at the end. */
  next(): void {
    if (this.index < this.sequence.length - 1) {
      this.index++;
      this.satisfiedDwell = 0;
      this.emit();
    }
  }

  /** Manually go to the previous step. */
  previous(): void {
    if (this.index > 0) {
      this.index--;
      this.satisfiedDwell = 0;
      this.emit();
    }
  }

  /** Jump the machine to a specific step (used by Demonstration to mirror the timeline). */
  goToStep(stepId: TrainingStepId): void {
    const i = this.sequence.indexOf(stepId);
    if (i >= 0 && i !== this.index) {
      this.index = i;
      this.satisfiedDwell = 0;
      this.emit();
    }
  }

  /**
   * Per-frame tick. Evaluates the active step and auto-advances in Guided/Placement modes once the
   * criterion has held for the confirm dwell. `dt` seconds. Returns the latest validation result so
   * the scene can drive feedback (highlights, reticle color). Allocation-free.
   *
   * In Demonstration mode the machine does not self-advance (the timeline calls goToStep); in
   * Inspection mode there is nothing to satisfy.
   */
  tick(obs: TrainingObservation, dt: number): ValidationResult {
    const stepId = this.currentStep;
    const prevError = this.lastResult.error;
    const result = evaluateStep(stepId, obs, this.lastResult); // mutates lastResult in place

    const def = getStepDefinition(stepId);
    const canAuto =
      def.autoAdvance &&
      (this.mode === TrainingMode.Guided || this.mode === TrainingMode.Placement);

    if (canAuto && result.satisfied) {
      this.satisfiedDwell += dt;
      if (this.satisfiedDwell >= TRAINING_TOLERANCES.confirmDwellSeconds) {
        this.advanceFromAuto();
      }
    } else if (this.satisfiedDwell !== 0 && !result.satisfied) {
      this.satisfiedDwell = 0;
    }

    // Emit if the error state changed (so corrective prompts appear/clear promptly).
    if (result.error !== prevError) this.emit();

    return result;
  }

  /** Advance after an auto-satisfied step; emits the new status (or completion). */
  private advanceFromAuto(): void {
    this.satisfiedDwell = 0;
    if (this.index < this.sequence.length - 1) {
      this.index++;
      this.emit();
    } else {
      // Already at the terminal step; just re-emit (complete).
      this.emit();
    }
  }

  /** True when the active step is the terminal Complete step. */
  get isComplete(): boolean {
    return this.currentStep === TrainingStepId.Complete;
  }

  /** Build a status snapshot for the UI. */
  status(): TrainingStatus {
    const stepId = this.currentStep;
    const prompt = composePrompt(stepId, this.lastResult);
    return {
      mode: this.mode,
      stepId,
      stepIndex: this.index,
      stepCount: this.sequence.length,
      prompt,
      error: this.lastResult.error,
      complete: stepId === TrainingStepId.Complete,
    };
  }

  private emit(): void {
    if (this.listener) this.listener(this.status());
  }
}
