/**
 * Cuff scene orchestrator (SPEC §5/§6/§7).
 *
 * Owns the cuff entity, the placement reticle, and every interaction controller, and runs the
 * per-frame interaction tick by dispatching to the active interaction layer:
 *   - Hands: gesture pinch → grab; proximity → hover highlight.
 *   - Ray: ray hover/select → grab; select to place.
 *   - PlaceInspect: fixed placement + orbit/zoom inspection.
 *
 * It also exposes hooks the app uses to push capability/quality changes down. All per-frame work is
 * allocation-free (scratch vectors only).
 */

import * as pc from 'playcanvas';
import { tmp, distanceSq } from '../utils/math';
import { APP_CONFIG } from '../config/appConfig';
import { InteractionLayer } from '../core/featureFlags';
import type { QualityProfile } from '../config/qualityProfiles';
import type { AssetRegistry } from '../core/assetRegistry';

import { BloodPressureCuff } from '../entities/bloodPressureCuff';
import { CuffSize } from '../entities/cuffVariants';
import { CuffMaterialLibrary } from '../materials/cuffMaterials';

import { HandTracking, type HandFrame } from '../ar/handTracking';
import { RayInteraction } from '../ar/rayInteraction';
import { HitTestPlacement } from '../ar/hitTestPlacement';
import { AnchorManager } from '../ar/anchors';

import { GrabController } from '../interaction/grabController';
import { PlacementController } from '../interaction/placementController';
import { InspectionController } from '../interaction/inspectionController';
import { GaugeController } from '../interaction/gaugeController';
import { InflationController } from '../interaction/inflationController';
import { TrainingStepController } from '../interaction/trainingStepController';

import { CuffAnimator } from '../animation/cuffAnimator';
import { ProcedureStateMachine } from '../training/procedureStateMachine';

import { createReticle, createTargetMarker } from './debugScene';

export interface CuffSceneDeps {
  readonly app: pc.AppBase;
  readonly device: pc.GraphicsDevice;
  readonly camera: pc.Entity;
  readonly worldRoot: pc.Entity;
  readonly materials: CuffMaterialLibrary;
  readonly assets: AssetRegistry;
}

export class CuffScene {
  readonly cuff: BloodPressureCuff;
  private readonly reticle: pc.Entity;

  private readonly hands: HandTracking;
  private readonly ray: RayInteraction;
  private readonly hitTest: HitTestPlacement;
  private readonly anchors: AnchorManager;

  private readonly grab: GrabController;
  private readonly placement: PlacementController;
  private readonly inspection: InspectionController;
  private readonly gauge: GaugeController;
  private readonly inflation: InflationController;

  // Animation + training layer (procedural — no baked clips in the GLB).
  private readonly animator: CuffAnimator;
  private readonly machine: ProcedureStateMachine;
  private readonly training: TrainingStepController;
  private readonly targetMarker: pc.Entity;
  /** Whether the training layer drives the cuff (vs free grab/inspect). Default on. */
  private trainingEnabled = true;

  private layer: InteractionLayer = InteractionLayer.PlaceInspect;
  private arActive = false;

  /** Callback fired when the set of tracked inputs changes (for layer re-selection by the app). */
  private onInputChange: (() => void) | null = null;

  constructor(deps: CuffSceneDeps) {
    this.cuff = new BloodPressureCuff(deps.device, deps.materials, deps.assets);
    deps.worldRoot.addChild(this.cuff.root);

    this.reticle = createReticle(deps.device);
    this.reticle.enabled = false;
    deps.worldRoot.addChild(this.reticle);

    this.hands = new HandTracking(deps.app);
    this.ray = new RayInteraction(deps.app);
    this.hitTest = new HitTestPlacement(deps.app);
    this.anchors = new AnchorManager(deps.app);

    this.grab = new GrabController(this.cuff);
    this.placement = new PlacementController(
      this.cuff,
      this.hitTest,
      this.anchors,
      deps.camera,
      this.reticle,
    );
    this.inspection = new InspectionController(this.cuff, deps.materials, deps.camera);
    this.gauge = new GaugeController(this.cuff);
    this.inflation = new InflationController(this.gauge);

    // Procedural animation + training scaffolding driving the EXISTING cuff (no second cuff).
    this.animator = new CuffAnimator(this.cuff, this.inflation);
    this.machine = new ProcedureStateMachine();
    this.targetMarker = createTargetMarker(deps.device);
    deps.worldRoot.addChild(this.targetMarker);
    this.training = new TrainingStepController(
      this.cuff,
      this.animator,
      this.inflation,
      deps.camera,
      this.targetMarker,
      this.machine,
    );

    this.hands.setOnChange(() => {
      if (this.onInputChange) this.onInputChange();
    });
  }

  /** Access the procedure state machine (for the app to wire the training panel). */
  get procedure(): ProcedureStateMachine {
    return this.machine;
  }

  /** Build the cuff geometry/materials for the initial size. Await before first frame. */
  async initialize(size: CuffSize = CuffSize.Medium): Promise<void> {
    await this.cuff.build(size);
    this.animator.syncToCuff();
    this.training.reset();
    this.training.setActive(this.trainingEnabled);
    this.inspection.setActive(true);
    this.placement.placeInFront();
  }

  /** Register a callback for input-presence changes (used to re-select interaction layer). */
  setOnInputChange(cb: () => void): void {
    this.onInputChange = cb;
  }

  /**
   * Re-run the placement floor clamp. Called once by the training scene after it mounts the patient
   * arm under the cuff root (the arm hangs below the cuff and extends the content's lower bound).
   * Build-time only — never per frame (the clamp walks the render hierarchy).
   */
  reclampPlacement(): void {
    this.placement.clampAboveFloor();
    this.cuff.invalidateAabb();
  }

  /** Swap the cuff size variant. Re-syncs the animator and informs the training layer. */
  async setSize(size: CuffSize): Promise<void> {
    await this.cuff.setSize(size);
    this.animator.syncToCuff();
    this.training.notifySizeChosen(size);
  }

  /** Cycle a demonstration inflation cycle (UI hook). */
  triggerInflationCycle(): void {
    this.animator.startInflationCycle();
  }

  // --- training layer hooks (used by the app to wire the training panel) ---

  /** Subscribe to training status changes for the UI. */
  onTrainingStatus(listener: Parameters<ProcedureStateMachine['setListener']>[0]): void {
    this.machine.setListener(listener);
  }

  /** Select a training mode. */
  setTrainingMode(mode: Parameters<TrainingStepController['setMode']>[0]): void {
    this.training.setMode(mode);
  }

  /** Manually advance the training step. */
  trainingNext(): void {
    this.machine.next();
  }

  /** Restart the current training mode. */
  trainingRestart(): void {
    this.machine.restart();
    this.training.reset();
  }

  /** Enable/disable the training modality (vs free inspect). */
  setTrainingEnabled(enabled: boolean): void {
    this.trainingEnabled = enabled;
    this.training.setActive(enabled);
  }

  /** Inspection input passthrough (UI / pointer). */
  orbit(dx: number, dy: number): void {
    this.inspection.orbit(dx, dy);
  }

  zoom(delta: number): void {
    this.inspection.zoom(delta);
  }

  // --- lifecycle from app ---

  onSessionStart(): void {
    this.arActive = true;
    this.hands.attach();
    this.hitTest.start();
    this.placement.reset();
    this.grab.reset();
    this.inspection.setActive(false);
  }

  onSessionEnd(): void {
    this.arActive = false;
    this.hands.detach();
    this.hitTest.stop();
    this.anchors.clear();
    this.grab.reset();
    this.inflation.reset();
    this.training.reset();
    this.inspection.setActive(true);
    this.placement.reset();
    this.placement.placeInFront();
  }

  /** Push the active interaction layer (decided by the app from capabilities). */
  setLayer(layer: InteractionLayer): void {
    if (layer === this.layer) return;
    this.layer = layer;
    // Inspection orbit is only meaningful in the place/inspect layer.
    this.inspection.setActive(layer === InteractionLayer.PlaceInspect);
    if (layer !== InteractionLayer.PlaceInspect) {
      this.grab.reset();
    }
  }

  /** Apply quality profile (anisotropy base + any layer effects). */
  applyProfile(profile: QualityProfile): void {
    this.inspection.setBaseAnisotropy(profile.anisotropy);
  }

  /** Report whether hands are currently tracked (for the app's layer selection). */
  handsTracked(): boolean {
    return this.hands.hasHands();
  }

  /** Report whether a usable ray source exists. */
  raySourcePresent(): boolean {
    return this.ray.hasRaySource();
  }

  /**
   * Per-frame update. `dt` in seconds. Allocation-free.
   * Dispatches to the active interaction layer and always advances gauge/inflation/inspection.
   */
  update(dt: number): void {
    switch (this.layer) {
      case InteractionLayer.Hands:
        this.updateHands(dt);
        break;
      case InteractionLayer.Ray:
        this.updateRay(dt);
        break;
      case InteractionLayer.PlaceInspect:
      default:
        this.updatePlaceInspect(dt);
        break;
    }

    // Anchor drift correction (if anchored) only while placed and not grabbing.
    if (!this.grab.isGrabbing) this.placement.syncToAnchor();

    this.inspection.update(this.arActive);

    // Inflation is ticked ONCE here (single owner). The animator READS its pressure for swell.
    this.inflation.update(dt);

    // Training observation/step progression (engine state -> machine), then procedural motion.
    this.animator.setHeld(this.grab.isGrabbing);
    this.training.update(dt);
    this.animator.update(dt);
  }

  private updateHands(dt: number): void {
    const frame: HandFrame = this.hands.update();

    // Determine an active pinch and its grab point; prefer the right hand if both pinch.
    let grabPoint: pc.Vec3 | null = null;
    let active = false;
    if (frame.right && frame.right.valid && frame.right.pinching) {
      grabPoint = frame.right.position;
      active = true;
    } else if (frame.left && frame.left.valid && frame.left.pinching) {
      grabPoint = frame.left.position;
      active = true;
    }

    // Placement phase until the user first grabs; afterwards grab drives the pose.
    if (!active && !this.grab.isGrabbing) {
      this.placement.update(true);
    } else {
      this.placement.update(false);
    }

    this.grab.update(active, grabPoint, dt);

    // Hover highlight: any tracked fingertip within proximity of the cuff.
    this.updateHoverFromHands(frame);
  }

  private updateHoverFromHands(frame: HandFrame): void {
    if (this.grab.isGrabbing) {
      this.cuff.setHighlight(true);
      return;
    }
    const box = this.cuff.worldAabb();
    const center = box.center;
    const proximitySq = APP_CONFIG.hoverProximity * APP_CONFIG.hoverProximity;

    let near = false;
    if (frame.right && frame.right.valid) {
      if (distanceSq(frame.right.position, center) < proximitySq) near = true;
    }
    if (!near && frame.left && frame.left.valid) {
      if (distanceSq(frame.left.position, center) < proximitySq) near = true;
    }
    this.cuff.setHighlight(near);
  }

  private updateRay(dt: number): void {
    const box = this.cuff.worldAabb();
    const hit = this.ray.update(box);

    this.cuff.setHighlight(hit.hovering || this.grab.isGrabbing);

    if (hit.selecting && (hit.hovering || this.grab.isGrabbing)) {
      // Grab: follow the ray hit point (or a point along the ray if we lost the box this frame).
      let grabPoint: pc.Vec3 | null = null;
      if (hit.hovering) {
        grabPoint = hit.point;
      } else if (this.ray.pointAtDistance(APP_CONFIG.fallbackPlacementDistance, tmp.vecD)) {
        grabPoint = tmp.vecD;
      }
      this.placement.update(false);
      this.grab.update(true, grabPoint, dt);
    } else {
      // Not grabbing: allow placement (reticle/hit-test) until placed.
      this.placement.update(!this.placement.isPlaced);
      this.grab.update(false, null, dt);
    }
  }

  private updatePlaceInspect(dt: number): void {
    // Ensure placed; then inspection controller handles orbit/zoom in its update().
    if (!this.placement.isPlaced) this.placement.placeInFront();
    this.placement.update(false);
    this.grab.update(false, null, dt);
    this.cuff.setHighlight(false);
  }

  dispose(): void {
    this.hands.detach();
    this.hitTest.stop();
    this.cuff.dispose();
    this.reticle.destroy();
    this.targetMarker.destroy();
  }
}
