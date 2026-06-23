/**
 * Grab controller (SPEC §5). Attach-on-pinch / select, follow, stable release.
 *
 * Works for both primary (hand pinch) and secondary (ray select) layers: the caller feeds it a grab
 * point + active flag, and it moves the cuff to follow with light smoothing, then damps residual
 * velocity on release so the object settles instead of flying off.
 *
 * Allocation-free per frame: uses scratch vectors and a private velocity accumulator.
 */

import * as pc from 'playcanvas';
import { tmp, smoothingAlpha, dampVec3 } from '../utils/math';
import { APP_CONFIG } from '../config/appConfig';
import type { BloodPressureCuff } from '../entities/bloodPressureCuff';

export class GrabController {
  private readonly cuff: BloodPressureCuff;

  private grabbing = false;
  /** Offset from grab point to cuff origin at the moment of grab (keeps relative pose). */
  private readonly grabOffset = new pc.Vec3();
  /** Residual velocity used to settle the cuff after release. */
  private readonly velocity = new pc.Vec3();
  private readonly lastPos = new pc.Vec3();
  private settling = false;

  constructor(cuff: BloodPressureCuff) {
    this.cuff = cuff;
  }

  get isGrabbing(): boolean {
    return this.grabbing;
  }

  /**
   * Per-frame update.
   *
   * @param active - True while the grab gesture is held (pinch or select).
   * @param grabPoint - World-space point of the gesture (null if not available this frame).
   * @param dt - Delta seconds.
   */
  update(active: boolean, grabPoint: pc.Vec3 | null, dt: number): void {
    if (active && grabPoint) {
      if (!this.grabbing) this.beginGrab(grabPoint);
      this.followGrab(grabPoint, dt);
      this.settling = false;
      return;
    }

    if (this.grabbing) this.endGrab();
    if (this.settling) this.settle(dt);
  }

  private beginGrab(grabPoint: pc.Vec3): void {
    this.grabbing = true;
    const pos = this.cuff.root.getPosition();
    // offset = cuffPos - grabPoint
    this.grabOffset.sub2(pos, grabPoint);
    this.lastPos.copy(pos);
    this.velocity.set(0, 0, 0);
  }

  private followGrab(grabPoint: pc.Vec3, dt: number): void {
    // target = grabPoint + grabOffset
    tmp.vecA.add2(grabPoint, this.grabOffset);
    const current = this.cuff.root.getPosition();
    tmp.vecB.copy(current);

    // Smooth toward target for stability.
    const alpha = smoothingAlpha(dt, 0.05);
    tmp.vecB.lerp(tmp.vecB, tmp.vecA, alpha);
    this.cuff.root.setPosition(tmp.vecB);
    this.cuff.invalidateAabb();

    // Track velocity for release settle (per-second).
    if (dt > 0) {
      tmp.vecC.sub2(tmp.vecB, this.lastPos).mulScalar(1 / dt);
      this.velocity.copy(tmp.vecC);
    }
    this.lastPos.copy(tmp.vecB);
  }

  private endGrab(): void {
    this.grabbing = false;
    this.settling = true;
  }

  private settle(dt: number): void {
    // Apply damped residual velocity so the cuff eases to rest (does not fly off).
    dampVec3(this.velocity, APP_CONFIG.releaseDamping, dt);
    const speedSq = this.velocity.lengthSq();
    if (speedSq < 1e-6) {
      this.settling = false;
      this.velocity.set(0, 0, 0);
      return;
    }
    const pos = this.cuff.root.getPosition();
    tmp.vecA.copy(this.velocity).mulScalar(dt);
    tmp.vecB.add2(pos, tmp.vecA);
    this.cuff.root.setPosition(tmp.vecB);
    this.cuff.invalidateAabb();
  }

  /** Force-release (e.g. on session end). */
  reset(): void {
    this.grabbing = false;
    this.settling = false;
    this.velocity.set(0, 0, 0);
  }
}
