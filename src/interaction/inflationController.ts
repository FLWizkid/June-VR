/**
 * Inflation controller (SPEC §6 interaction completeness). SINGLE inflation owner — ticked once per
 * frame by CuffScene; everything else READS pressure from here.
 *
 * Two ways to drive the same pressure model (no second cycle is forked):
 *   - DEMO CYCLE (`startCycle`): scripted inflate → hold → deflate, unchanged legacy behavior.
 *   - MANUAL (`pumpSqueeze` / `cycleValve`): the trainee pumps the bulb (each squeeze feeds a small
 *     reservoir that ramps into the cuff) and works the release valve (closed → controlled release
 *     at the SME-flagged taught rate → full-open dump → closed).
 *
 * Both paths surface through the SAME observable phases (inflating/holding/deflating/idle), so the
 * training brain sees manual operation exactly like the demo — no state-machine changes.
 *
 * PRESENTATION-ONLY pulse: while pressure is falling between the demo systolic/diastolic markers,
 * the DISPLAYED gauge value bounces with a simulated heartbeat (oscillometric teaching cue,
 * SME-REVIEW in config/trainingConfig.ts). The pulse never feeds back into the pressure model or
 * any observation/validation — `currentPressure` stays the clean value.
 *
 * Deterministic (accumulated dt only; no Date.now/random) and allocation-free per frame.
 */

import { clamp } from '../utils/math';
import { PRESSURE_MMHG } from '../utils/units';
import { TRAINING_CLINICAL, PUMP_INTERACTION } from '../config/trainingConfig';
import type { GaugeController } from './gaugeController';

export const enum InflationPhase {
  Idle = 'idle',
  Inflating = 'inflating',
  Holding = 'holding',
  Deflating = 'deflating',
}

/** Release-valve state for the manual path. Cycled closed → controlled → open → closed. */
export const enum ValveState {
  Closed = 'closed',
  /** Cracked for controlled release at the taught rate (TRAINING_CLINICAL). */
  Controlled = 'controlled',
  /** Fully open — dumps pressure quickly. */
  Open = 'open',
}

export class InflationController {
  private readonly gauge: GaugeController;

  private pressure = 0;
  private phase: InflationPhase = InflationPhase.Idle;
  /** mmHg per second rates for the scripted demo cycle. */
  private readonly inflateRate = 60;
  private readonly deflateRate = 30;
  private holdTimer = 0;

  /** True while the scripted demo cycle owns the phase flow; manual input clears it. */
  private auto = false;
  /** Un-transferred bulb-squeeze pressure (mmHg) still ramping into the cuff. */
  private pumpReserve = 0;
  private valve: ValveState = ValveState.Closed;
  /** Accumulated time base for the deterministic heartbeat bounce (presentation only). */
  private pulseClock = 0;
  /**
   * Eased bulb-squeeze amount [0,1] for the VISUAL bulb (0 = relaxed/full, 1 = constricted). Rises
   * while air is still being pushed from the bulb into the cuff (reserve pending) and eases back as
   * the reserve drains — so each pump reads as a constrict → release, independent of cuff pressure.
   */
  private bulbSqueezeEnv = 0;

  constructor(gauge: GaugeController) {
    this.gauge = gauge;
  }

  get currentPhase(): InflationPhase {
    return this.phase;
  }

  get currentPressure(): number {
    return this.pressure;
  }

  get valveState(): ValveState {
    return this.valve;
  }

  /** Visual bulb-squeeze amount [0,1] (0 = relaxed/full, 1 = constricted). Presentation only. */
  get bulbSqueeze(): number {
    return this.bulbSqueezeEnv;
  }

  /** Begin a scripted inflate→hold→deflate demo cycle to the typical target. */
  startCycle(): void {
    this.auto = true;
    this.valve = ValveState.Closed;
    this.pumpReserve = 0;
    this.phase = InflationPhase.Inflating;
    this.holdTimer = 0;
  }

  /**
   * One full manual bulb squeeze: adds a fixed pressure quantum that ramps into the cuff over the
   * next fraction of a second (reads as a squeeze, not a step). Pumping implies the valve is closed
   * first (as taught), and takes the cycle out of demo mode.
   */
  pumpSqueeze(): void {
    this.auto = false;
    this.valve = ValveState.Closed;
    this.pumpReserve += PUMP_INTERACTION.squeezeMmHg;
    this.phase = InflationPhase.Inflating;
  }

  /** Cycle the release valve: closed → controlled release → full open → closed. Manual mode. */
  cycleValve(): ValveState {
    this.auto = false;
    this.valve =
      this.valve === ValveState.Closed
        ? ValveState.Controlled
        : this.valve === ValveState.Controlled
          ? ValveState.Open
          : ValveState.Closed;
    return this.valve;
  }

  /** Immediately bleed the cuff to zero (legacy hook; used on session teardown paths). */
  release(): void {
    this.phase = InflationPhase.Deflating;
  }

  reset(): void {
    this.pressure = 0;
    this.phase = InflationPhase.Idle;
    this.holdTimer = 0;
    this.auto = false;
    this.pumpReserve = 0;
    this.valve = ValveState.Closed;
    this.pulseClock = 0;
    this.bulbSqueezeEnv = 0;
    this.gauge.set(0);
  }

  /** Per-frame update (single owner). Advances the cycle and drives the gauge. */
  update(dt: number): void {
    // An open valve always drains — it overrides holding/pumping intent (air simply escapes).
    if (this.valve !== ValveState.Closed && this.pressure > 0) {
      this.phase = InflationPhase.Deflating;
      this.pumpReserve = 0;
    }

    switch (this.phase) {
      case InflationPhase.Inflating:
        if (this.auto) {
          this.pressure += this.inflateRate * dt;
          if (this.pressure >= PRESSURE_MMHG.typicalInflate) {
            this.pressure = PRESSURE_MMHG.typicalInflate;
            this.phase = InflationPhase.Holding;
            this.holdTimer = 0;
          }
        } else {
          // Manual: drain the squeeze reservoir into the cuff quickly (one squeeze ≈ 0.25 s).
          const step = Math.min(this.pumpReserve, PUMP_INTERACTION.squeezeMmHg * 4 * dt);
          this.pressure += step;
          this.pumpReserve -= step;
          if (this.pumpReserve <= 0) {
            this.pumpReserve = 0;
            this.phase = InflationPhase.Holding;
          }
        }
        break;
      case InflationPhase.Holding:
        if (this.auto) {
          this.holdTimer += dt;
          if (this.holdTimer >= 1.5) this.phase = InflationPhase.Deflating;
        }
        // Manual hold: pressure sits until the trainee pumps again or opens the valve.
        break;
      case InflationPhase.Deflating:
        this.pressure -= this.currentDeflateRate() * dt;
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

    // Bulb squeeze envelope: constricted while a squeeze's air is still flowing into the cuff
    // (reserve pending), relaxing as it drains. Fast attack so a pump reads crisply; deterministic.
    const squeezeTarget = clamp(this.pumpReserve / PUMP_INTERACTION.squeezeMmHg, 0, 1);
    const rate = 1 - Math.exp(-dt * 14);
    this.bulbSqueezeEnv += (squeezeTarget - this.bulbSqueezeEnv) * rate;

    this.gauge.update(this.pressure + this.pulseOffset(dt), dt);
  }

  /** Deflate rate (mmHg/s) for the current mode/valve. */
  private currentDeflateRate(): number {
    if (this.auto) return this.deflateRate;
    if (this.valve === ValveState.Open) return PUMP_INTERACTION.dumpDeflateMmHgPerSec;
    if (this.valve === ValveState.Controlled) return TRAINING_CLINICAL.controlledDeflateMmHgPerSec;
    // Valve closed but legacy release() put us here: use the demo rate.
    return this.deflateRate;
  }

  /**
   * Heartbeat bounce added to the DISPLAYED gauge value only (never to `pressure`): active while
   * pressure is falling through the demo systolic→diastolic window, with smooth edges so the
   * oscillation fades in/out rather than snapping (SME-REVIEW: teaching cue, trainingConfig).
   * Deterministic: driven by accumulated dt.
   */
  private pulseOffset(dt: number): number {
    if (this.phase !== InflationPhase.Deflating) return 0;
    const sys = TRAINING_CLINICAL.demoSystolicMmHg;
    const dia = TRAINING_CLINICAL.demoDiastolicMmHg;
    const edge = 6; // mmHg fade band at each end of the window
    const p = this.pressure;
    if (p > sys + edge || p < dia - edge) return 0;

    this.pulseClock += dt;
    // Envelope: 0→1 over the entry edge, 1 inside the window, 1→0 over the exit edge.
    const inEdge = smooth01((sys + edge - p) / edge);
    const outEdge = smooth01((p - (dia - edge)) / edge);
    const envelope = Math.min(1, inEdge, outEdge);

    // Beat-shaped kick: rectified sine squared reads as a per-beat needle bump, not a smooth wave.
    const beatsPerSec = PUMP_INTERACTION.pulse.rateBpm / 60;
    const s = Math.sin(this.pulseClock * beatsPerSec * Math.PI * 2);
    const kick = s > 0 ? s * s : 0;
    return envelope * PUMP_INTERACTION.pulse.needleAmplitudeMmHg * kick;
  }
}

/** Clamped smoothstep on [0,1]. */
function smooth01(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}
