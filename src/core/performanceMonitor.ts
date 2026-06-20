/**
 * Adaptive performance monitor (SPEC §7/§8, R5).
 *
 * Samples per-frame time, and steps the active quality tier DOWN when sustained frame time exceeds
 * budget (and cautiously back UP when there is comfortable headroom), with a cooldown to avoid
 * oscillation. It never changes cuff identity — only the quality profile knobs.
 *
 * Allocation-free per frame: only number math + a pre-allocated rolling average.
 */

import { RollingAverage, frameTimeToFps } from '../utils/profiling';
import { APP_CONFIG } from '../config/appConfig';
import { QualityTier, getProfile, tierBelow, tierAbove } from '../config/qualityProfiles';

export interface PerfSnapshot {
  readonly avgFrameMs: number;
  readonly fps: number;
  readonly tier: QualityTier;
}

export type TierChangeHandler = (next: QualityTier, prev: QualityTier) => void;

export class PerformanceMonitor {
  private readonly avg: RollingAverage;
  private tier: QualityTier;
  private secondsSinceChange = 0;
  private onChange: TierChangeHandler | null = null;

  constructor(initialTier: QualityTier) {
    this.tier = initialTier;
    this.avg = new RollingAverage(APP_CONFIG.perf.sampleWindow);
  }

  /** Register a callback fired when the tier steps up or down. */
  setTierChangeHandler(handler: TierChangeHandler): void {
    this.onChange = handler;
  }

  /** Current tier. */
  get currentTier(): QualityTier {
    return this.tier;
  }

  /**
   * Force the tier (e.g. from the quality panel). Resets the cooldown but does not fire the change
   * handler differently from an adaptive change.
   */
  forceTier(tier: QualityTier): void {
    this.applyTier(tier);
  }

  /**
   * Per-frame update. Must be called once per rendered frame with `dt` in seconds and the raw frame
   * time in ms. Allocation-free.
   */
  update(dt: number, frameMs: number): void {
    this.secondsSinceChange += dt;
    const average = this.avg.add(frameMs);

    // Wait until the window is warm and the cooldown has elapsed before acting.
    if (!this.avg.isWarm) return;
    if (this.secondsSinceChange < APP_CONFIG.perf.changeCooldownSeconds) return;

    const profile = getProfile(this.tier);

    if (average > APP_CONFIG.perf.downgradeFrameMs && profile.allowAdaptiveDowngrade) {
      const lower = tierBelow(this.tier);
      if (lower !== null) {
        this.applyTier(lower);
        return;
      }
    }

    if (average < APP_CONFIG.perf.upgradeFrameMs) {
      const higher = tierAbove(this.tier);
      if (higher !== null) {
        this.applyTier(higher);
      }
    }
  }

  /** Current performance snapshot for the status panel. */
  snapshot(): PerfSnapshot {
    const avgFrameMs = this.avg.average;
    return {
      avgFrameMs,
      fps: frameTimeToFps(avgFrameMs),
      tier: this.tier,
    };
  }

  private applyTier(next: QualityTier): void {
    const prev = this.tier;
    if (next === prev) return;
    this.tier = next;
    this.secondsSinceChange = 0;
    this.avg.reset();
    if (this.onChange) this.onChange(next, prev);
  }
}
