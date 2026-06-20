/**
 * Hit-test placement abstraction (SPEC §7, R11).
 *
 * Starts a viewer-space hit test (against detected planes) when supported, and exposes the latest
 * hit pose for a placement reticle. When hit test is unavailable, callers fall back to fixed-distance
 * placement (placementController). Fully capability-gated; never throws.
 *
 * Verified APIs (playcanvas@2.19): app.xr.hitTest.supported/available, app.xr.hitTest.start({
 * spaceType, entityTypes, callback }), hitTestSource 'result' event (position, rotation), .remove().
 */

import * as pc from 'playcanvas';
import { createLogger } from '../utils/logging';

const log = createLogger('hittest');

export class HitTestPlacement {
  private readonly app: pc.AppBase;
  private source: pc.XrHitTestSource | null = null;

  /** Latest hit pose (valid only when `hasResult` is true). */
  readonly position = new pc.Vec3();
  readonly rotation = new pc.Quat();
  private resultValid = false;

  private boundResult = (position: pc.Vec3, rotation: pc.Quat): void => {
    this.position.copy(position);
    this.rotation.copy(rotation);
    this.resultValid = true;
  };

  constructor(app: pc.AppBase) {
    this.app = app;
  }

  get supported(): boolean {
    const ht = this.app.xr?.hitTest;
    return !!ht && (ht.supported || ht.available);
  }

  get hasResult(): boolean {
    return this.resultValid;
  }

  /** Start a viewer-anchored hit test against planes. Safe no-op if unsupported. */
  start(): void {
    const xr = this.app.xr;
    const ht = xr?.hitTest;
    if (!xr || !ht) return;
    if (this.source) return;

    ht.start({
      spaceType: pc.XRSPACE_VIEWER,
      entityTypes: [pc.XRTRACKABLE_PLANE],
      callback: (err: Error | null, source: pc.XrHitTestSource | null) => {
        if (err || !source) {
          log.warn('hit test start failed', err);
          return;
        }
        this.source = source;
        source.on('result', this.boundResult);
        source.once('remove', () => {
          this.source = null;
          this.resultValid = false;
        });
        log.info('hit test source started');
      },
    });
  }

  /** Stop the hit test (call on session end). */
  stop(): void {
    if (this.source) {
      this.source.off('result', this.boundResult);
      this.source.remove();
      this.source = null;
    }
    this.resultValid = false;
  }
}
