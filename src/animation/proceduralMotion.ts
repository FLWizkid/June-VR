/**
 * Procedural motion primitives (SPEC STEP 7).
 *
 * GROUND TRUTH: the cuff GLB ships with NO animations/skins, so ALL training motion is procedural.
 * These are small, pure, allocation-free helpers the animator/timeline compose into realistic,
 * legible motion. Ranges are deliberately conservative — "training-grade", not game-like (CLAUDE.md).
 *
 * Nothing here allocates; callers pass in scratch where a vector result is needed.
 */

import * as pc from 'playcanvas';
import { clamp, lerp } from '../utils/math';

/** Smoothstep easing (C1), 0..1. */
export function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** Smootherstep easing (C2), 0..1 — gentler in/out for close inspection legibility. */
export function smootherstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** Ease-out cubic, 0..1. */
export function easeOutCubic(t: number): number {
  const x = 1 - clamp(t, 0, 1);
  return 1 - x * x * x;
}

/**
 * Small settle/overshoot used when an object reaches a target pose (subtle, training-appropriate).
 * Returns a multiplier near 1.0 that briefly overshoots then settles. Damped sinusoid.
 */
export function settleOvershoot(t: number, amplitude = 0.04, frequency = 2.2): number {
  const x = clamp(t, 0, 1);
  if (x >= 1) return 1;
  const decay = Math.exp(-4 * x);
  return 1 + Math.sin(x * Math.PI * 2 * frequency) * amplitude * decay;
}

/** Low-amplitude breathing/idle bob factor for subtle life on a held object (meters). */
export function idleBob(timeSec: number, amplitude = 0.0015, period = 3.5): number {
  return Math.sin((timeSec / period) * Math.PI * 2) * amplitude;
}

/**
 * Linear-to-eased remap of a value from [inMin,inMax] to [outMin,outMax] with smoothstep shaping.
 * Used e.g. to map pressure → bladder swell, keeping ends flat. Pure scalar; no allocation.
 */
export function easedRemap(
  v: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  const span = inMax - inMin;
  const t = span === 0 ? 0 : (v - inMin) / span;
  return lerp(outMin, outMax, smoothstep(t));
}

/**
 * Write a position along a straight line a→b at parameter t (eased) into `out`. Allocation-free.
 */
export function lerpPosEased(a: pc.Vec3, b: pc.Vec3, t: number, out: pc.Vec3): void {
  const e = smootherstep(t);
  out.set(lerp(a.x, b.x, e), lerp(a.y, b.y, e), lerp(a.z, b.z, e));
}
