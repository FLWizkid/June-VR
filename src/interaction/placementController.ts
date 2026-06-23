/**
 * Placement controller (SPEC §5/§7). Positions the cuff when entering AR / when not grabbed.
 *
 * Priority: hit-test result (snap to a real surface) → fixed distance in front of the viewer.
 * Optionally world-anchors the placed pose for drift resistance. Drives a small reticle while a
 * surface is being targeted.
 *
 * Allocation-free per frame.
 */

import * as pc from 'playcanvas';
import { tmp } from '../utils/math';
import { APP_CONFIG } from '../config/appConfig';
import type { HitTestPlacement } from '../ar/hitTestPlacement';
import type { AnchorManager } from '../ar/anchors';
import type { BloodPressureCuff } from '../entities/bloodPressureCuff';

export class PlacementController {
  private readonly cuff: BloodPressureCuff;
  private readonly hitTest: HitTestPlacement;
  private readonly anchors: AnchorManager;
  private readonly camera: pc.Entity;
  private readonly reticle: pc.Entity;

  private placed = false;

  constructor(
    cuff: BloodPressureCuff,
    hitTest: HitTestPlacement,
    anchors: AnchorManager,
    camera: pc.Entity,
    reticle: pc.Entity,
  ) {
    this.cuff = cuff;
    this.hitTest = hitTest;
    this.anchors = anchors;
    this.camera = camera;
    this.reticle = reticle;
  }

  get isPlaced(): boolean {
    return this.placed;
  }

  /** Reset placement state (e.g. on session start) so the cuff is re-placed. */
  reset(): void {
    this.placed = false;
    this.anchors.clear();
  }

  /**
   * Per-frame update for the placement phase. Shows the reticle at the best target and, once the
   * cuff is not yet placed, drops it there. After placement the reticle hides.
   *
   * @param allowPlace - True when the app is in the placement phase (not grabbing/inspecting).
   */
  update(allowPlace: boolean): void {
    if (this.placed || !allowPlace) {
      this.reticle.enabled = false;
      return;
    }

    if (this.hitTest.supported && this.hitTest.hasResult) {
      this.reticle.enabled = true;
      this.reticle.setPosition(this.hitTest.position);
      this.reticle.setRotation(this.hitTest.rotation);
      // Auto-place on first valid surface (a real app would confirm via gesture; kept simple here).
      this.placeAt(this.hitTest.position, this.hitTest.rotation);
    } else {
      // No surface info: place at a fixed comfortable distance in front of the camera.
      this.computeFrontOfCamera(tmp.vecA);
      tmp.quatA.copy(this.camera.getRotation());
      this.reticle.enabled = false;
      this.placeAt(tmp.vecA, tmp.quatA);
    }
  }

  /** Force a placement directly in front of the viewer (fallback/inspect entry). */
  placeInFront(): void {
    this.computeFrontOfCamera(tmp.vecA);
    tmp.quatA.copy(this.camera.getRotation());
    this.placeAt(tmp.vecA, tmp.quatA);
  }

  private placeAt(position: pc.Vec3, rotation: pc.Quat): void {
    this.cuff.root.setPosition(position);
    this.cuff.root.setRotation(rotation);
    this.cuff.invalidateAabb();
    this.placed = true;
    this.reticle.enabled = false;

    // Best-effort anchor for drift resistance (non-blocking; cuff already positioned).
    if (this.anchors.supported) {
      void this.anchors.anchorAt(position, rotation);
    }
  }

  /**
   * If an anchor exists, keep the cuff aligned to it (drift correction). Call each frame after
   * placement. Allocation-free.
   */
  syncToAnchor(): void {
    if (!this.placed) return;
    if (this.anchors.readPose(tmp.vecA, tmp.quatA)) {
      this.cuff.root.setPosition(tmp.vecA);
      this.cuff.root.setRotation(tmp.quatA);
      this.cuff.invalidateAabb();
    }
  }

  /** Compute a point `fallbackPlacementDistance` in front of the camera, at rest height. */
  private computeFrontOfCamera(out: pc.Vec3): void {
    const camPos = this.camera.getPosition();
    const fwd = this.camera.forward; // owned Vec3
    tmp.vecB.copy(fwd).mulScalar(APP_CONFIG.fallbackPlacementDistance);
    out.add2(camPos, tmp.vecB);
    out.y += APP_CONFIG.placementRestHeight;
  }
}
