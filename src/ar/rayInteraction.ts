/**
 * Ray-based interaction (SPEC §5 secondary, R2).
 *
 * Used when hand joints are unavailable but an input source exposes a target ray
 * (tracked-pointer / gaze / transient screen). Provides hover (ray vs cuff AABB) and a select-driven
 * grab via the input source's select state.
 *
 * Verified APIs (playcanvas@2.19): XrInputSource.getOrigin()/getDirection(): Vec3,
 * XrInputSource.selecting: boolean, BoundingBox.intersectsRay(ray, point?), pc.Ray.set(origin, dir).
 */

import * as pc from 'playcanvas';
import { tmp } from '../utils/math';

export interface RayHit {
  /** True if the active ray currently intersects the target box. */
  hovering: boolean;
  /** True if a source is selecting (pinch/trigger/tap equivalent). */
  selecting: boolean;
  /** World hit point (valid when hovering). */
  readonly point: pc.Vec3;
  /** The source driving the ray, if any. */
  source: pc.XrInputSource | null;
}

export class RayInteraction {
  private readonly app: pc.AppBase;
  private readonly ray = new pc.Ray();
  private readonly hit: RayHit = {
    hovering: false,
    selecting: false,
    point: new pc.Vec3(),
    source: null,
  };

  constructor(app: pc.AppBase) {
    this.app = app;
  }

  /** True if any input source exposes a usable target ray (no hands required). */
  hasRaySource(): boolean {
    const sources = this.app.xr?.input?.inputSources ?? [];
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      if (s && !s.hand) return true; // controllers / gaze / transient
    }
    return false;
  }

  /**
   * Update hover/select against the cuff's world AABB. Allocation-free.
   *
   * @param targetBox - The cuff's world-space AABB.
   */
  update(targetBox: pc.BoundingBox): RayHit {
    const h = this.hit;
    h.hovering = false;
    h.selecting = false;
    h.source = null;

    const sources = this.app.xr?.input?.inputSources ?? [];
    // Prefer a selecting source; otherwise the first ray source.
    let chosen: pc.XrInputSource | null = null;
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      if (!s || s.hand) continue;
      if (!chosen) chosen = s;
      if (s.selecting) {
        chosen = s;
        break;
      }
    }
    if (!chosen) return h;

    h.source = chosen;
    h.selecting = chosen.selecting;

    const origin = chosen.getOrigin();
    const dir = chosen.getDirection();
    tmp.vecA.copy(origin);
    tmp.vecB.copy(dir);
    this.ray.set(tmp.vecA, tmp.vecB);

    if (targetBox.intersectsRay(this.ray, tmp.vecC)) {
      h.hovering = true;
      h.point.copy(tmp.vecC);
    }
    return h;
  }

  /** Compute a placement point along the current ray at a fixed distance (for ray placement). */
  pointAtDistance(distance: number, out: pc.Vec3): boolean {
    const src = this.hit.source;
    if (!src) return false;
    const origin = src.getOrigin();
    const dir = src.getDirection();
    tmp.vecA.copy(origin);
    tmp.vecB.copy(dir).normalize().mulScalar(distance);
    out.add2(tmp.vecA, tmp.vecB);
    return true;
  }
}
