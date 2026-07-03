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

/**
 * Floor plane (m, world space) the placed content is clamped ABOVE, plus the clearance kept over it.
 * y=0 is the preview stand-in floor (entities/environmentRoot.ts) AND the physical floor in a
 * `local-floor` AR reference space, so the clamp keeps the hanging patient arm from poking through
 * either. Clearance clears the preview grid lines (top ≈ 0.005). Cosmetic/spatial, not clinical.
 */
const FLOOR_PLANE_Y = 0;
const FLOOR_CLEARANCE_M = 0.01;

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
    // Clamp BEFORE anchoring so the anchor holds the clamped pose (syncToAnchor re-applies it).
    this.clampAboveFloor();
    this.cuff.invalidateAabb();
    this.placed = true;
    this.reticle.enabled = false;

    // Best-effort anchor for drift resistance (non-blocking; cuff already positioned).
    if (this.anchors.supported) {
      void this.anchors.anchorAt(this.cuff.root.getPosition(), rotation);
    }
  }

  /**
   * Lift the placed cuff — and everything mounted under its root, i.e. the patient arm riding it —
   * so the content's lowest point rests above the floor plane. Never lowers (a hit-test surface
   * placement above the floor is left where it landed). PLACEMENT-TIME ONLY: findComponents
   * allocates, so this must never run per frame. Public so the training scene can re-clamp once
   * after mounting the arm under the cuff root (which extends the content's lower bound).
   */
  clampAboveFloor(): void {
    const renders = this.cuff.root.findComponents('render') as pc.RenderComponent[];
    let minY = Infinity;
    for (const render of renders) {
      const instances = render.meshInstances ?? [];
      for (const mi of instances) {
        const box = mi.aabb; // world-space AABB of this mesh instance
        const bottom = box.center.y - box.halfExtents.y;
        if (bottom < minY) minY = bottom;
      }
    }
    if (!Number.isFinite(minY)) return;

    const lift = FLOOR_PLANE_Y + FLOOR_CLEARANCE_M - minY;
    if (lift <= 0) return;
    const p = this.cuff.root.getPosition();
    this.cuff.root.setPosition(p.x, p.y + lift, p.z);
    this.cuff.invalidateAabb();
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
