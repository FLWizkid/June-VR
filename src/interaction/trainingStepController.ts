/**
 * Training step controller (SPEC STEP 9).
 *
 * The bridge that ties live INTERACTION + ANIMATION state to the engine-free
 * `ProcedureStateMachine`. Each frame it:
 *   1. builds a `TrainingObservation` from the existing cuff/animator/inflation/camera state,
 *   2. ticks the state machine (which may auto-advance the step),
 *   3. applies the active step's wrap state to the `CuffAnimator`,
 *   4. drives a translucent target marker + step-aware feedback for placement.
 *
 * It REUSES the existing cuff, controllers, and camera — it does not own gameplay objects beyond the
 * target marker. Allocation-free per frame (scratch vectors + private temporaries only).
 */

import * as pc from 'playcanvas';
import { tmp } from '../utils/math';
import {
  TRAINING_CLINICAL,
  TrainingStepId,
  TrainingMode,
} from '../config/trainingConfig';
import { INSPECTION_RANGE_METERS } from '../utils/units';

import type { BloodPressureCuff } from '../entities/bloodPressureCuff';
import { CuffSize } from '../entities/cuffVariants';
import type { CuffAnimator } from '../animation/cuffAnimator';
import { InflationPhase, type InflationController } from './inflationController';
import { TimelineController, type TimelineSegment } from '../animation/timelineController';

import { ProcedureStateMachine } from '../training/procedureStateMachine';
import { getStepDefinition } from '../training/stepDefinitions';
import type { TrainingObservation } from '../training/validationRules';

/** The (simulated) ideal placement pose, relative to where the cuff was first placed. */
const TARGET_LOCAL_OFFSET = new pc.Vec3(0, 0.0, 0);

/**
 * Demonstration timeline segments (hands-off walkthrough). Each id maps to a training step the
 * machine mirrors; durations are presentation pacing only. SME-REVIEW: pacing, not clinical timing.
 */
const DEMO_SEGMENTS: readonly TimelineSegment[] = [
  { id: TrainingStepId.SelectSize, durationSec: 2.0 },
  { id: TrainingStepId.InspectComponents, durationSec: 3.0 },
  { id: TrainingStepId.OrientCuff, durationSec: 2.5 },
  { id: TrainingStepId.PositionCuff, durationSec: 2.5 },
  { id: TrainingStepId.ConfirmFit, durationSec: 2.5 },
  { id: TrainingStepId.Inflate, durationSec: 3.5 },
  { id: TrainingStepId.ObserveGauge, durationSec: 4.0 },
  { id: TrainingStepId.Complete, durationSec: 1.5 },
] as const;

/** Mutable mirror of `TrainingObservation` so we can reuse one instance (no per-frame allocation). */
type MutableObservation = { -readonly [K in keyof TrainingObservation]: TrainingObservation[K] };

export class TrainingStepController {
  private readonly cuff: BloodPressureCuff;
  private readonly animator: CuffAnimator;
  private readonly inflation: InflationController;
  private readonly camera: pc.Entity;
  private readonly machine: ProcedureStateMachine;
  private readonly targetMarker: pc.Entity;
  /** Hands-off demonstration timeline (only driven in Demonstration mode). */
  private readonly timeline = new TimelineController();
  private demoActive = false;
  private demoInflateTriggered = false;

  /** Whether training is the active interaction modality (vs raw inspect). */
  private active = false;

  /**
   * Last step whose wrap state was applied. The step's wrap state is a baseline applied ON STEP
   * ENTRY only — never re-applied per frame — so the learner's own tighten adjustments (the band
   * tighten gesture that satisfies the confirm-fit step) are not stomped every frame. Previously the
   * per-frame re-apply pinned snugness at the step target, making confirm-fit unsatisfiable.
   */
  private lastWrapStep: TrainingStepId | null = null;

  // --- observation accumulators ---
  private sizeChosen = false;
  private sizeMatchesArm = true; // medium is the assumed-correct demo size (SME-REVIEW)
  private inspectionDwellSec = 0;
  private peakPressureMmHg = 0;
  private observedThroughDiastolic = false;
  private lastPressureForRate = 0;
  private deflationRate = 0;

  /** Target world pose captured when the cuff is first positioned/placed. */
  private readonly targetPos = new pc.Vec3();
  private readonly targetRot = new pc.Quat();
  private targetCaptured = false;

  /** Reused observation struct — mutated each frame to avoid per-frame allocation. */
  private readonly obs: MutableObservation = {
    sizeChosen: false,
    sizeMatchesArm: true,
    inspectionDwellSec: 0,
    orientationErrorDeg: 0,
    positionErrorM: 0,
    snugness: 0,
    inflationPhase: InflationPhase.Idle,
    pressureMmHg: 0,
    peakPressureMmHg: 0,
    observedThroughDiastolic: false,
    deflationRateMmHgPerSec: 0,
  };

  constructor(
    cuff: BloodPressureCuff,
    animator: CuffAnimator,
    inflation: InflationController,
    camera: pc.Entity,
    targetMarker: pc.Entity,
    machine: ProcedureStateMachine,
  ) {
    this.cuff = cuff;
    this.animator = animator;
    this.inflation = inflation;
    this.camera = camera;
    this.targetMarker = targetMarker;
    this.machine = machine;
    this.targetMarker.enabled = false;

    this.timeline.setSegments(DEMO_SEGMENTS);
    this.timeline.setListener((_i, segmentId, local) => this.onDemoSegment(segmentId, local));
    this.timeline.setOnComplete(() => {
      this.demoActive = false;
    });
  }

  /**
   * Demonstration timeline tick: mirror the machine to the shown step, scrub the wrap tighten across
   * the position/fit segments, and trigger one inflation cycle at the inflate segment. Allocation-free.
   */
  private onDemoSegment(segmentId: string, local: number): void {
    // Mirror the state machine to the demonstrated step.
    this.machine.goToStep(segmentId as TrainingStepId);

    switch (segmentId) {
      case TrainingStepId.PositionCuff:
        this.animator.setTightenTarget(0.5 * local);
        break;
      case TrainingStepId.ConfirmFit:
        this.animator.setTightenTarget(0.5 + 0.5 * local); // 0.5 -> 1.0
        break;
      case TrainingStepId.Inflate:
        this.animator.setTightenTarget(1);
        if (!this.demoInflateTriggered) {
          this.demoInflateTriggered = true;
          this.animator.startInflationCycle();
        }
        break;
      default:
        break;
    }
  }

  get stateMachine(): ProcedureStateMachine {
    return this.machine;
  }

  /** Enable/disable the training modality. When disabled, the target marker hides. */
  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.targetMarker.enabled = false;
  }

  /** Notify that the learner changed the cuff size (and whether it matches the demo arm). */
  notifySizeChosen(size: CuffSize): void {
    this.sizeChosen = true;
    // SME-REVIEW: the demo "correct" arm is the Adult/Medium range; others are flagged WrongSize.
    this.sizeMatchesArm = size === CuffSize.Medium;
  }

  /** Capture the current cuff pose as the placement target (call when entering the position step). */
  captureTargetFromCuff(): void {
    const p = this.cuff.root.getPosition();
    const r = this.cuff.root.getRotation();
    // Target = current pose + a small local offset (kept zero by default; tunable).
    this.targetPos.set(p.x + TARGET_LOCAL_OFFSET.x, p.y + TARGET_LOCAL_OFFSET.y, p.z + TARGET_LOCAL_OFFSET.z);
    this.targetRot.copy(r);
    this.targetCaptured = true;
  }

  /** Reset accumulators (e.g. on session change / restart). */
  reset(): void {
    this.sizeChosen = false;
    this.sizeMatchesArm = true;
    this.inspectionDwellSec = 0;
    this.peakPressureMmHg = 0;
    this.observedThroughDiastolic = false;
    this.lastPressureForRate = 0;
    this.deflationRate = 0;
    this.targetCaptured = false;
    this.demoInflateTriggered = false;
    this.lastWrapStep = null;
    this.animator.syncToCuff();
    // Restart the demo timeline if we are in demonstration mode.
    if (this.demoActive) {
      this.demoInflateTriggered = false;
      this.timeline.play(false);
    }
  }

  /**
   * Per-frame update. `dt` seconds. Allocation-free.
   * Only does work when training is active; otherwise it leaves the cuff to other controllers.
   */
  update(dt: number): void {
    if (!this.active) return;

    // Demonstration mode is driven by the timeline (which scrubs tighten + mirrors the step). In all
    // other modes the active step's wrap state is the single motion source.
    if (this.demoActive) {
      this.timeline.update(dt);
    } else {
      const stepId = this.machine.currentStep;
      if (stepId !== this.lastWrapStep) {
        this.lastWrapStep = stepId;
        this.animator.setWrapState(getStepDefinition(stepId).wrapState);
      }
    }

    const stepId = this.machine.currentStep;

    // On entering the position step, capture the target if we have not yet.
    if (stepId === TrainingStepId.PositionCuff && !this.targetCaptured) {
      this.captureTargetFromCuff();
    }

    this.accumulate(dt, stepId);

    // Build the observation and tick the machine (no auto-advance in demo/inspection modes).
    const obs = this.buildObservation();
    this.machine.tick(obs, dt);

    this.updateTargetMarker(stepId);
  }

  /** Update time/pressure accumulators that feed the observation. */
  private accumulate(dt: number, stepId: TrainingStepId): void {
    // Inspection dwell: count time while the camera is within the close-up band AND on inspect step.
    if (stepId === TrainingStepId.InspectComponents) {
      const camPos = this.camera.getPosition();
      const center = this.cuff.worldAabb().center;
      tmp.vecA.copy(camPos);
      const dist = tmp.vecA.distance(center);
      if (dist <= INSPECTION_RANGE_METERS.far * 1.3) this.inspectionDwellSec += dt;
    }

    // Track peak pressure + deflation rate + diastolic crossing.
    const pressure = this.inflation.currentPressure;
    if (pressure > this.peakPressureMmHg) this.peakPressureMmHg = pressure;

    if (this.inflation.currentPhase === InflationPhase.Deflating && dt > 0) {
      const drop = this.lastPressureForRate - pressure; // positive while deflating
      // Smooth the instantaneous rate a little.
      const inst = drop / dt;
      this.deflationRate += (inst - this.deflationRate) * (1 - Math.exp(-dt * 4));
      if (pressure <= TRAINING_CLINICAL.demoDiastolicMmHg && this.peakPressureMmHg > TRAINING_CLINICAL.demoSystolicMmHg) {
        this.observedThroughDiastolic = true;
      }
    } else {
      this.deflationRate = 0;
    }
    this.lastPressureForRate = pressure;

    // Reset the cycle trackers when fully idle at zero (ready for another inflate).
    if (this.inflation.currentPhase === InflationPhase.Idle && pressure <= 0.01) {
      // keep observedThroughDiastolic/peak for the observe step; they reset on machine restart.
    }
  }

  /**
   * Compose the engine-free observation snapshot by MUTATING the reused `obs` struct (no per-frame
   * allocation). Returns it typed as the readonly `TrainingObservation`.
   */
  private buildObservation(): TrainingObservation {
    const o = this.obs;
    o.sizeChosen = this.sizeChosen;
    o.sizeMatchesArm = this.sizeMatchesArm;
    o.inspectionDwellSec = this.inspectionDwellSec;
    o.orientationErrorDeg = this.computeOrientationError();
    o.positionErrorM = this.computePositionError();
    o.snugness = this.animator.tightenAmount;
    o.inflationPhase = this.inflation.currentPhase;
    o.pressureMmHg = this.inflation.currentPressure;
    o.peakPressureMmHg = this.peakPressureMmHg;
    o.observedThroughDiastolic = this.observedThroughDiastolic;
    o.deflationRateMmHgPerSec = this.deflationRate;
    return o;
  }

  /**
   * Orientation error (degrees) between the cuff and the captured target rotation. If no target is
   * captured yet, report 0 (treated as aligned) so the orient step is satisfiable from a fresh place.
   *
   * SME-REVIEW: with no patient-arm/anatomy model shipped, "correct orientation" cannot be truly
   * validated; this measures deviation from a captured reference pose and is a teaching affordance for
   * the *concept* (artery marker toward the brachial artery). See TRAINING_LOGIC.md §7/§8.
   * Allocation-free (scratch quats).
   */
  private computeOrientationError(): number {
    if (!this.targetCaptured) return 0;
    const cur = this.cuff.root.getRotation();
    // relative = inverse(target) * current
    tmp.quatA.copy(this.targetRot).invert();
    tmp.quatB.mul2(tmp.quatA, cur);
    // Angle of the relative quaternion: 2*acos(|w|).
    const w = Math.min(1, Math.abs(tmp.quatB.w));
    return (2 * Math.acos(w) * 180) / Math.PI;
  }

  /** Position error (meters) between the cuff and the captured target. */
  private computePositionError(): number {
    if (!this.targetCaptured) return 0;
    const p = this.cuff.root.getPosition();
    tmp.vecA.copy(p);
    return tmp.vecA.distance(this.targetPos);
  }

  /** Show the target marker only during the position step (when a target exists). */
  private updateTargetMarker(stepId: TrainingStepId): void {
    const show = this.active && stepId === TrainingStepId.PositionCuff && this.targetCaptured;
    this.targetMarker.enabled = show;
    if (show) {
      this.targetMarker.setPosition(this.targetPos);
      this.targetMarker.setRotation(this.targetRot);
    }
  }

  /** Switch training mode and re-sync. Starts/stops the demonstration timeline. */
  setMode(mode: TrainingMode): void {
    this.machine.setMode(mode);
    this.demoActive = mode === TrainingMode.Demonstration;
    if (!this.demoActive) this.timeline.stop();
    // reset() restarts the timeline when demoActive (after clearing accumulators).
    this.reset();
  }
}
