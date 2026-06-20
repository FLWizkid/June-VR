/**
 * Anchor abstraction (SPEC §7, R1).
 *
 * Wraps `app.xr.anchors` so a placed cuff can be world-anchored for drift-resistant stability over a
 * session. Fully capability-gated: if anchors are unavailable the caller simply keeps the cuff at a
 * fixed world transform (still correct, just less drift-resistant).
 *
 * Verified APIs (playcanvas@2.19): app.xr.anchors.supported/available,
 * app.xr.anchors.create(position: Vec3, rotation: Quat, callback), XrAnchor.getPosition()/
 * getRotation(), events 'destroy'.
 */

import * as pc from 'playcanvas';
import { createLogger } from '../utils/logging';

const log = createLogger('anchors');

export class AnchorManager {
  private readonly app: pc.AppBase;
  private current: pc.XrAnchor | null = null;

  constructor(app: pc.AppBase) {
    this.app = app;
  }

  get supported(): boolean {
    const a = this.app.xr?.anchors;
    return !!a && (a.supported || a.available);
  }

  get hasAnchor(): boolean {
    return this.current !== null;
  }

  /**
   * Create (or replace) a single anchor at a world pose. Resolves true on success. Never throws.
   */
  anchorAt(position: pc.Vec3, rotation: pc.Quat): Promise<boolean> {
    const anchors = this.app.xr?.anchors;
    if (!anchors || !this.supported) return Promise.resolve(false);

    this.clear();

    return new Promise((resolve) => {
      anchors.create(position, rotation, (err: Error | null, anchor: pc.XrAnchor | null) => {
        if (err || !anchor) {
          log.warn('anchor create failed', err);
          resolve(false);
          return;
        }
        this.current = anchor;
        anchor.once('destroy', () => {
          if (this.current === anchor) this.current = null;
        });
        resolve(true);
      });
    });
  }

  /**
   * Read the current anchor pose into the provided out-params. Returns true if a pose was written.
   * Allocation-free (writes into caller buffers).
   */
  readPose(outPos: pc.Vec3, outRot: pc.Quat): boolean {
    if (!this.current) return false;
    const p = this.current.getPosition();
    const r = this.current.getRotation();
    outPos.copy(p);
    outRot.copy(r);
    return true;
  }

  /** Forget the current anchor. */
  clear(): void {
    this.current = null;
  }
}
