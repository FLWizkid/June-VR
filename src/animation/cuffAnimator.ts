/**
 * Cuff animator (SPEC STEP 7).
 *
 * Drives the EXISTING `BloodPressureCuff` entity procedurally (GROUND TRUTH: the GLB has no baked
 * animation). It does NOT own the cuff and does NOT fork a second one — it nudges the wrap node and
 * bladder swell, and delegates inflation/gauge to the EXISTING controllers so all behaviour stays in
 * one place.
 *
 * Responsibilities:
 *   - pickup/release accents (subtle settle/idle bob) layered on the held pose,
 *   - wrap/tighten representation (translate + tighten the procedural fabric wrap),
 *   - bladder swell driven by the live inflation pressure,
 *   - inflation/gauge hooks (start a cycle, read phase/pressure) via the existing controllers.
 *
 * Motion is conservative and legible for close AR inspection (CLAUDE.md: no game-like motion).
 * Allocation-free per frame: only scratch vectors + private temporaries.
 */

import * as pc from 'playcanvas';
import { idleBob, settleOvershoot, easedRemap } from './proceduralMotion';
import { PRESSURE_MMHG } from '../utils/units';
import type { BloodPressureCuff } from '../entities/bloodPressureCuff';
import type { InflationController } from '../interaction/inflationController';
import { InflationPhase } from '../interaction/inflationController';

/** Wrap representation states the training timeline drives the cuff through. */
export const enum WrapState {
  /** Wrap laid out/open, beside or off the arm. */
  Open = 'open',
  /** Wrap positioned but not yet tightened. */
  Positioned = 'positioned',
  /** Wrap tightened/snug. */
  Tightened = 'tightened',
}

export class CuffAnimator {
  private readonly cuff: BloodPressureCuff;
  private readonly inflation: InflationController;

  /** Captured rest local position of the wrap node (so tighten/position is relative + reversible). */
  private readonly wrapRestPos = new pc.Vec3();
  private wrapRestCaptured = false;

  /** Target + displayed tighten fraction [0,1] (0 = open, 1 = fully tightened/snug). */
  private tightenTarget = 0;
  private tightenDisplayed = 0;

  /** Pickup accent timer (seconds since last pickup); negative = inactive. */
  private pickupAccentT = -1;
  /** Accumulated time for idle bob. */
  private clock = 0;
  /** Whether the cuff is currently "held" (drives idle bob + pickup accent). */
  private held = false;

  constructor(cuff: BloodPressureCuff, inflation: InflationController) {
    this.cuff = cuff;
    this.inflation = inflation;
  }

  /** Re-capture the wrap rest pose after a (re)build/size-swap. Safe to call when wrap is null. */
  syncToCuff(): void {
    const wrap = this.cuff.wrap;
    this.wrapRestCaptured = false;
    if (wrap) {
      this.wrapRestPos.copy(wrap.getLocalPosition());
      this.wrapRestCaptured = true;
    }
    // Reset visible state to match.
    this.cuff.setBladderSwell(0);
  }

  /** Set the desired wrap state (eased toward over subsequent frames). */
  setWrapState(state: WrapState): void {
    switch (state) {
      case WrapState.Open:
        this.tightenTarget = 0;
        break;
      case WrapState.Positioned:
        this.tightenTarget = 0.5;
        break;
      case WrapState.Tightened:
        this.tightenTarget = 1;
        break;
    }
  }

  /** Directly set the tighten fraction target [0,1] (used by demonstration scrubbing). */
  setTightenTarget(fraction: number): void {
    this.tightenTarget = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
  }

  /** Mark the cuff as held/released (drives subtle idle bob + a pickup accent). */
  setHeld(held: boolean): void {
    if (held && !this.held) this.pickupAccentT = 0; // entering hold → accent
    this.held = held;
  }

  /** Start an inflate→hold→deflate cycle on the EXISTING inflation controller (no fork). */
  startInflationCycle(): void {
    this.inflation.startCycle();
  }

  /** Current inflation phase (for the training state machine to observe). */
  get inflationPhase(): InflationPhase {
    return this.inflation.currentPhase;
  }

  /** Current pressure mmHg (for prompts/validation). */
  get pressureMmHg(): number {
    return this.inflation.currentPressure;
  }

  /** Normalized tighten amount actually displayed [0,1] (for fit validation/feedback). */
  get tightenAmount(): number {
    return this.tightenDisplayed;
  }

  /**
   * Per-frame update. `dt` seconds. Allocation-free.
   * Eases tighten state, applies wrap translation, bladder swell from pressure, and held accents.
   * Note: the inflation controller itself is ticked by CuffScene (single owner); we only READ it here
   * and apply its pressure to the visual swell so we don't double-advance the cycle.
   */
  update(dt: number): void {
    this.clock += dt;

    // Ease the displayed tighten toward target (snug motion is smooth, not snappy).
    const rate = 1 - Math.exp(-dt * 5);
    this.tightenDisplayed += (this.tightenTarget - this.tightenDisplayed) * rate;

    this.applyWrap();
    this.applyBladderFromPressure();
    this.applyHeldAccent(dt);
  }

  /**
   * Translate the wrap toward the device (tighten) and lower it slightly, proportional to the
   * displayed tighten fraction. Subtle: a few centimetres at most. Allocation-free.
   */
  private applyWrap(): void {
    const wrap = this.cuff.wrap;
    if (!wrap || !this.wrapRestCaptured) return;
    const f = this.tightenDisplayed;
    // Move the open wrap (at rest, offset +X beside the device) inward toward x≈0 as it tightens,
    // and settle it down a touch in Y. These are small, plausible adjustments.
    const x = this.wrapRestPos.x * (1 - 0.85 * f);
    const y = this.wrapRestPos.y - 0.004 * f;
    const z = this.wrapRestPos.z;
    wrap.setLocalPosition(x, y, z);
  }

  /**
   * Cuff bladder swells with live pressure; the bulb CONSTRICTS with the live squeeze action. Both
   * respond to pumping, so they animate together in sync — the cuff firms up a step and the bulb
   * pinches in on each squeeze, then the bulb relaxes on release while the cuff holds. The bulb
   * squeeze is independent of how far the cuff is pumped (a hand squeeze, not a pressure readout).
   */
  private applyBladderFromPressure(): void {
    const swell = easedRemap(this.pressureMmHg, 0, PRESSURE_MMHG.typicalInflate, 0, 1);
    this.cuff.setBladderSwell(swell);
    this.cuff.setBulbSqueeze(this.inflation.bulbSqueeze);
  }

  /**
   * Layer a subtle idle bob (while held) and a brief settle overshoot right after pickup onto the
   * wrap's local Y. Kept tiny so close inspection is steady. Allocation-free.
   */
  private applyHeldAccent(dt: number): void {
    const wrap = this.cuff.wrap;
    if (!wrap || !this.wrapRestCaptured) return;

    let dy = 0;
    if (this.held) dy += idleBob(this.clock);

    if (this.pickupAccentT >= 0) {
      this.pickupAccentT += dt;
      const dur = 0.5;
      const t = this.pickupAccentT / dur;
      if (t >= 1) {
        this.pickupAccentT = -1;
      } else {
        // settleOvershoot returns ~1±amp; convert to a small +/- offset in metres.
        dy += (settleOvershoot(t) - 1) * 0.01;
      }
    }

    if (dy !== 0) {
      const p = wrap.getLocalPosition();
      wrap.setLocalPosition(p.x, p.y + dy, p.z);
    }
  }
}
