/**
 * Gauge controller (SPEC §6). Rotates the gauge needle to reflect a pressure value.
 *
 * The needle pivot (from the cuff entity) is spun about its local axis across the dial sweep
 * (−135° at 0 mmHg to +135° at 300 mmHg, matching the procedural dial art). Pure presentation;
 * pressure is supplied by the inflation controller. Allocation-free.
 */

import * as pc from 'playcanvas';
import { pressureToDialFraction } from '../utils/units';
import { lerp } from '../utils/math';
import type { BloodPressureCuff } from '../entities/bloodPressureCuff';

/** Dial sweep endpoints in degrees (must match the dial art in textureSets.ts). */
const SWEEP_START_DEG = -135;
const SWEEP_END_DEG = 135;

export class GaugeController {
  private readonly cuff: BloodPressureCuff;
  private displayedMmHg = 0;

  constructor(cuff: BloodPressureCuff) {
    this.cuff = cuff;
  }

  /**
   * Smoothly move the needle toward a target pressure.
   *
   * @param targetMmHg - Desired reading.
   * @param dt - Delta seconds.
   */
  update(targetMmHg: number, dt: number): void {
    const needle = this.cuff.gaugeNeedle;
    if (!needle) return;

    // Ease the displayed value toward target (needle has a little inertia).
    const rate = 1 - Math.exp(-dt * 6);
    this.displayedMmHg = lerp(this.displayedMmHg, targetMmHg, rate);

    const frac = pressureToDialFraction(this.displayedMmHg);
    const angle = lerp(SWEEP_START_DEG, SWEEP_END_DEG, frac);

    // Needle pivots about the gauge face normal (local Y after the gauge's -25deg tilt setup).
    needle.setLocalEulerAngles(0, angle, 0);
  }

  /** Snap the needle to a value immediately (no easing). */
  set(mmHg: number): void {
    this.displayedMmHg = mmHg;
    const needle = this.cuff.gaugeNeedle;
    if (!needle) return;
    const angle = lerp(SWEEP_START_DEG, SWEEP_END_DEG, pressureToDialFraction(mmHg));
    needle.setLocalEulerAngles(0, angle, 0);
  }
}

// Keep pc import meaningful for type clarity in case the needle type is referenced downstream.
export type GaugeNeedle = pc.Entity;
