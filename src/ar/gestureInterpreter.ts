/**
 * Gesture interpretation from tracked hand joints (SPEC §5 primary, R2).
 *
 * Computes a stable pinch state per hand from thumb-tip ↔ index-tip distance with hysteresis
 * (separate close/open thresholds) so the grab does not flicker. Allocation-free: reads joint
 * world positions into scratch vectors.
 *
 * Verified APIs (playcanvas@2.19): XrHand.getJointById(id), XrJoint.getPosition(): Vec3,
 * XrHand.tracking. WebXR joint ids: 'thumb-tip', 'index-finger-tip'.
 */

import * as pc from 'playcanvas';
import { APP_CONFIG } from '../config/appConfig';
import { tmp } from '../utils/math';

const THUMB_TIP = 'thumb-tip';
const INDEX_TIP = 'index-finger-tip';

export interface PinchState {
  /** True while the hand is pinching (after hysteresis). */
  pinching: boolean;
  /** World-space midpoint between thumb and index tips (valid when joints are tracked). */
  readonly position: pc.Vec3;
  /** True if both tip joints reported valid poses this frame. */
  valid: boolean;
}

/** Tracks pinch state for a single hand across frames. */
export class HandGesture {
  private pinching = false;
  readonly state: PinchState;

  constructor() {
    this.state = { pinching: false, position: new pc.Vec3(), valid: false };
  }

  /**
   * Update from an XrHand. Returns the (mutated, owned) PinchState. Allocation-free.
   */
  update(hand: pc.XrHand): PinchState {
    const s = this.state;
    if (!hand.tracking) {
      s.valid = false;
      // Keep last pinching=false to release cleanly on track loss.
      this.pinching = false;
      s.pinching = false;
      return s;
    }

    const thumb = hand.getJointById(THUMB_TIP);
    const index = hand.getJointById(INDEX_TIP);
    if (!thumb || !index) {
      s.valid = false;
      this.pinching = false;
      s.pinching = false;
      return s;
    }

    const a = thumb.getPosition(); // engine returns owned Vec3 refs; copy into scratch
    const b = index.getPosition();
    tmp.vecA.copy(a);
    tmp.vecB.copy(b);

    const dist = tmp.vecA.distance(tmp.vecB);

    // Hysteresis: close below closeDistance, release only above openDistance.
    if (this.pinching) {
      if (dist > APP_CONFIG.pinch.openDistance) this.pinching = false;
    } else {
      if (dist < APP_CONFIG.pinch.closeDistance) this.pinching = true;
    }

    // Midpoint for grab anchor.
    s.position.add2(tmp.vecA, tmp.vecB).mulScalar(0.5);
    s.valid = true;
    s.pinching = this.pinching;
    return s;
  }

  reset(): void {
    this.pinching = false;
    this.state.pinching = false;
    this.state.valid = false;
  }
}
