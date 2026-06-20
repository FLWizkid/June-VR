/**
 * Shared scratch-math temporaries and small helpers.
 *
 * CRITICAL (see CLAUDE.md): update/tick loops must NOT allocate. Hot paths borrow from the
 * pre-allocated `tmp` pool below and from per-controller private temporaries — never `new pc.Vec3`
 * inside a frame callback.
 *
 * Scratch values are caller-scoped: a function may use `tmp.vecA`..`tmp.vecD` etc. for the duration
 * of its own synchronous work. Do not hold a scratch reference across an `await` or store it.
 */

import * as pc from 'playcanvas';

/** Pre-allocated scratch temporaries for allocation-free frame math. */
export const tmp = {
  vecA: new pc.Vec3(),
  vecB: new pc.Vec3(),
  vecC: new pc.Vec3(),
  vecD: new pc.Vec3(),
  vecE: new pc.Vec3(),
  quatA: new pc.Quat(),
  quatB: new pc.Quat(),
  matA: new pc.Mat4(),
  matB: new pc.Mat4(),
} as const;

/** Clamp `v` into the inclusive range [min, max]. */
export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Linear interpolation between `a` and `b` by `t` (t is not clamped). */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Frame-rate-independent exponential smoothing factor.
 *
 * Returns an alpha in [0,1] such that `value += (target - value) * alpha` decays toward the target
 * with the given time constant regardless of frame time.
 *
 * @param dt - Delta time in seconds.
 * @param timeConstant - Seconds to reach ~63% of the way to the target. Smaller = snappier.
 */
export function smoothingAlpha(dt: number, timeConstant: number): number {
  if (timeConstant <= 0) return 1;
  return 1 - Math.exp(-dt / timeConstant);
}

/**
 * Squared distance between two points. Avoids a sqrt; use for threshold comparisons.
 * Allocation-free.
 */
export function distanceSq(a: pc.Vec3, b: pc.Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Damp a velocity vector in-place by an exponential factor over `dt` (used to settle a released
 * grabbed object so it does not fly away). Mutates and returns `velocity`.
 */
export function dampVec3(velocity: pc.Vec3, damping: number, dt: number): pc.Vec3 {
  const factor = Math.exp(-damping * dt);
  velocity.x *= factor;
  velocity.y *= factor;
  velocity.z *= factor;
  return velocity;
}
