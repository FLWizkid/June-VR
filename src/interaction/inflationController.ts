/**
 * Inflation controller (SPEC §6 interaction completeness).
 *
 * Models a simple inflate/deflate cycle: pressure ramps toward a target while "pumping", then bleeds
 * down. It feeds the gauge controller and (optionally) scales the cuff body slightly to suggest
 * bladder inflation. Purely illustrative training behavior; no physics dependency.
 *
 * Allocation-free per frame.
 */

import { clamp } from '../utils/math';
import { PRESSURE_MMHG } from '../utils/units';
import type { GaugeController } from './gaugeController';

export const enum InflationPhase {
  Idle = 'idle',
  Inflating = 'inflating',
  Holding = 'holding',
  Deflating = 'deflating',
}

export class InflationController {
  private readonly gauge: GaugeController;

  private pressure = 0;
  private phase: InflationPhase = InflationPhase.Idle;
  /** mmHg per second rates. */
  private readonly inflateRate = 60;
  private readonly deflateRate = 30;
  private holdTimer = 0;

  constructor(gauge: GaugeController) {
    this.gauge = gauge;
  }

  get currentPhase(): InflationPhase {
    return this.phase;
  }

  get currentPressure(): number {
    return this.pressure;
  }

  /** Begin an inflate→hold→deflate cycle to the typical target. */
  startCycle(): void {
    this.phase = InflationPhase.Inflating;
    this.holdTimer = 0;
  }

  /** Immediately bleed the cuff to zero. */
  release(): void {
    this.phase = InflationPhase.Deflating;
  }

  reset(): void {
    this.pressure = 0;
    this.phase = InflationPhase.Idle;
    this.holdTimer = 0;
    this.gauge.set(0);
  }

  /** Per-frame update. Advances the cycle and drives the gauge. */
  update(dt: number): void {
    switch (this.phase) {
      case InflationPhase.Inflating:
        this.pressure += this.inflateRate * dt;
        if (this.pressure >= PRESSURE_MMHG.typicalInflate) {
          this.pressure = PRESSURE_MMHG.typicalInflate;
          this.phase = InflationPhase.Holding;
          this.holdTimer = 0;
        }
        break;
      case InflationPhase.Holding:
        this.holdTimer += dt;
        if (this.holdTimer >= 1.5) this.phase = InflationPhase.Deflating;
        break;
      case InflationPhase.Deflating:
        this.pressure -= this.deflateRate * dt;
        if (this.pressure <= 0) {
          this.pressure = 0;
          this.phase = InflationPhase.Idle;
        }
        break;
      case InflationPhase.Idle:
      default:
        break;
    }

    this.pressure = clamp(this.pressure, PRESSURE_MMHG.min, PRESSURE_MMHG.max);
    this.gauge.update(this.pressure, dt);
  }
}
