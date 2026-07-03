/**
 * Training scene (SPEC STEP 6 — "attach both to a common scene hierarchy").
 *
 * Composes the training content into ONE hierarchy under the world root:
 *   - the EXISTING `CuffScene` (cuff entity + all interaction/animation/training controllers),
 *   - the `PatientArm` (the FOREGROUND target the trainee wraps the cuff onto — SHOWN in AR), and
 *   - the `EnvironmentRoot` (env GLB seam + procedural stand-in), whose transform is INDEPENDENT of
 *     the cuff and which is HIDDEN in AR (optical see-through — never paint over the real world).
 *
 * Cuff-on-arm composition (SPEC item 7): the patient arm is mounted under the CUFF ROOT via a small
 * mount node, positioned so the cuff's curved fabric band lands on the arm's upper-arm cuff site
 * (`CUFF_ON_ARM.alongUpperArm01`). The arm is its OWN entity (distinct geometry/material, toggleable,
 * shown in AR) — the cuff is NOT forked and the arm is NOT fused into the cuff mesh; the arm simply
 * RIDES with the cuff so it always reads as "a cuff on an arm" through placement/grab in every mode.
 * This is the deliberate composition choice recorded in SPEC §12 A20.
 *
 * This is a thin orchestrator: it does not duplicate cuff/interaction logic (that stays in CuffScene)
 * and does not duplicate session logic (that stays in core/xrBootstrap + app).
 */

import * as pc from 'playcanvas';
import type { QualityProfile } from '../config/qualityProfiles';
import type { AssetRegistry } from '../core/assetRegistry';
import type { CuffMaterialLibrary } from '../materials/cuffMaterials';
import { CuffSize } from '../entities/cuffVariants';
import { EnvironmentRoot } from '../entities/environmentRoot';
import { PatientArm } from '../entities/patientArm';
import { ARM_POSE, CUFF_ON_ARM } from '../config/trainingConfig';
import { CuffScene, type CuffSceneDeps } from './cuffScene';

export interface TrainingSceneDeps extends CuffSceneDeps {
  readonly materials: CuffMaterialLibrary;
  readonly assets: AssetRegistry;
}

export class TrainingScene {
  /** The composited cuff sub-scene (cuff + controllers + training). */
  readonly cuffScene: CuffScene;
  /** The patient arm (foreground target; shown in AR; toggleable). */
  readonly patientArm: PatientArm;
  /** The environment seam/stand-in (independent transform; hidden in AR). */
  readonly environment: EnvironmentRoot;

  /** Mount node under the cuff root that carries the arm at the cuff-on-arm offset. */
  private readonly armMount: pc.Entity;

  constructor(deps: TrainingSceneDeps) {
    // Cuff + controllers (mounts the cuff under worldRoot itself).
    this.cuffScene = new CuffScene(deps);

    // Patient arm: foreground target. The mount node is parented under the cuff root AFTER the cuff is
    // built (cuff.build() clears its children), so the arm rides with the cuff and always reads as
    // wrapped; its geometry/transform are still its own (independent of the cuff mesh, toggleable,
    // shown in AR).
    this.patientArm = new PatientArm(deps.device, deps.assets);
    this.armMount = new pc.Entity('arm-mount');
    this.armMount.addChild(this.patientArm.root);

    // Environment mounted under the SAME world root, independent of the cuff transform.
    this.environment = new EnvironmentRoot(deps.device, deps.assets);
    deps.worldRoot.addChild(this.environment.root);
  }

  /** Build cuff (as a curved band on the arm) + arm + environment. Await before first frame. */
  async initialize(size: CuffSize = CuffSize.Medium): Promise<void> {
    // Build the arm first so we know the limb radius at the cuff site, then shape the cuff's fabric
    // wrap into a curved band hugging that limb and stand the gauge device beside the arm. This
    // reshapes the EXISTING cuff wrap (no second cuff) — see bloodPressureCuff.setArmWrap.
    await this.patientArm.build();

    const frame = this.patientArm.cuffFrame;
    const wrapOnArm = this.patientArm.isVisible;
    if (wrapOnArm) {
      this.cuffScene.cuff.setArmWrap(frame.radiusM);
      const d = CUFF_ON_ARM.deviceBesideOffset;
      this.cuffScene.cuff.setDeviceOffset(d.x, d.y, d.z);
    }

    // Environment stand-in (cheap; non-blocking on failure).
    await this.environment.build();

    // Cuff + controllers (builds the cuff with the band wrap if configured above). cuff.build()
    // clears the cuff root's children, so we mount the arm AFTERWARD.
    await this.cuffScene.initialize(size);

    if (wrapOnArm) {
      this.cuffScene.cuff.root.addChild(this.armMount);
      this.positionArmUnderCuff(frame.node);
      // The arm hangs below the cuff, so re-clamp the placed content above the floor plane now that
      // the full cuff-on-arm extent is known (initial placement ran before the arm was mounted).
      this.cuffScene.reclampPlacement();
    }
  }

  /**
   * Position the arm (via its mount) so the cuff site frame coincides with the cuff root origin — i.e.
   * the curved band wraps the upper arm at `CUFF_ON_ARM.alongUpperArm01`. Done once at build time.
   *
   * The procedural arm's cuff frame is a pure translation down the (vertical) upper-arm segment with
   * identity rotation, so aligning it to the cuff origin is a translation: shift the arm up by the
   * frame's local offset. (A real arm GLB defines its own anatomy; the same mount still co-locates
   * the configured frame with the cuff.)
   */
  private positionArmUnderCuff(frameNode: pc.Entity): void {
    // Frame local position within the arm root (the arm root sits directly under armMount).
    const fp = frameNode.getLocalPosition();
    // Place the arm root so the frame lands at the mount origin (cuff root origin).
    this.patientArm.root.setLocalPosition(-fp.x, -fp.y, -fp.z);
    this.patientArm.root.setLocalEulerAngles(
      ARM_POSE.rootEulerDeg.x,
      ARM_POSE.rootEulerDeg.y,
      ARM_POSE.rootEulerDeg.z,
    );
    this.armMount.setLocalPosition(0, 0, 0);
    this.armMount.setLocalEulerAngles(0, 0, 0);
  }

  /** Apply a quality profile to the composited content. */
  applyProfile(profile: QualityProfile): void {
    this.cuffScene.applyProfile(profile);
  }

  /**
   * AR vs preview: hide the ENVIRONMENT in AR (optical see-through). The patient ARM is foreground
   * training content and STAYS VISIBLE in AR (it is the thing the cuff is on). The cuff sub-scene
   * handles its own AR lifecycle.
   */
  setArMode(arActive: boolean): void {
    this.environment.setArMode(arActive);
    // Arm intentionally NOT hidden in AR.
  }

  /** Show/hide the patient arm (sites that use a real manikin/arm hide it). */
  setArmVisible(visible: boolean): void {
    this.patientArm.setVisible(visible);
  }

  /** True if a real environment GLB loaded (vs procedural stand-in) — for status/README. */
  get environmentIsReal(): boolean {
    return this.environment.isRealModel;
  }

  /** True if a real patient-arm GLB loaded (vs procedural stand-in) — for status/README. */
  get armIsReal(): boolean {
    return this.patientArm.isRealModel;
  }

  dispose(): void {
    this.cuffScene.dispose();
    this.patientArm.dispose();
    this.environment.dispose();
  }
}
