/**
 * Quality profiles: Ultra / High / Balanced (SPEC.md §8).
 *
 * Default selection picks the highest tier expected to stay stable; the PerformanceMonitor may step
 * down (and cautiously back up) at runtime. Cuff identity (silhouette, key materials, labels) is
 * NEVER reduced — only the knobs below change.
 */

export const enum QualityTier {
  Balanced = 'balanced',
  High = 'high',
  Ultra = 'ultra',
}

/** Ordered low → high; used for stepping the active tier. */
export const QUALITY_ORDER: readonly QualityTier[] = [
  QualityTier.Balanced,
  QualityTier.High,
  QualityTier.Ultra,
] as const;

export interface QualityProfile {
  readonly tier: QualityTier;
  /** Human-readable label for the UI. */
  readonly label: string;
  /** WebXR framebuffer scale factor (>0). Lower = cheaper, blurrier. */
  readonly framebufferScaleFactor: number;
  /** Clamp for the graphics device pixel ratio (desktop/inspect mode). */
  readonly maxPixelRatio: number;
  /** Anisotropic filtering level for cuff textures (close-up sharpness). */
  readonly anisotropy: number;
  /** Enable real-time shadows from the single key light. Off except Ultra (additive AR payoff low). */
  readonly realtimeShadows: boolean;
  /**
   * Requested fixed-foveation level [0..1] when supported in-session. Higher recovers edge fill cost
   * at the expense of peripheral sharpness.
   */
  readonly fixedFoveation: number;
  /** Environment reflection mip bias hint (higher = blurrier/cheaper reflections). */
  readonly reflectionMipBias: number;
  /** Whether the adaptive monitor is allowed to drop below this tier. */
  readonly allowAdaptiveDowngrade: boolean;
}

const BALANCED: QualityProfile = {
  tier: QualityTier.Balanced,
  label: 'Balanced',
  framebufferScaleFactor: 0.8,
  maxPixelRatio: 1.0,
  anisotropy: 4,
  realtimeShadows: false,
  fixedFoveation: 0.6,
  reflectionMipBias: 2,
  allowAdaptiveDowngrade: false,
};

const HIGH: QualityProfile = {
  tier: QualityTier.High,
  label: 'High',
  framebufferScaleFactor: 1.0,
  maxPixelRatio: 1.0,
  anisotropy: 8,
  realtimeShadows: false,
  fixedFoveation: 0.3,
  reflectionMipBias: 1,
  allowAdaptiveDowngrade: true,
};

const ULTRA: QualityProfile = {
  tier: QualityTier.Ultra,
  label: 'Ultra',
  framebufferScaleFactor: 1.0,
  maxPixelRatio: 2.0,
  anisotropy: 16,
  realtimeShadows: true,
  fixedFoveation: 0.15,
  reflectionMipBias: 0,
  allowAdaptiveDowngrade: true,
};

export const QUALITY_PROFILES: Readonly<Record<QualityTier, QualityProfile>> = {
  [QualityTier.Balanced]: BALANCED,
  [QualityTier.High]: HIGH,
  [QualityTier.Ultra]: ULTRA,
};

/** Look up a profile by tier. */
export function getProfile(tier: QualityTier): QualityProfile {
  return QUALITY_PROFILES[tier];
}

/**
 * Return the tier one step below `tier`, or null if already at the lowest.
 */
export function tierBelow(tier: QualityTier): QualityTier | null {
  const i = QUALITY_ORDER.indexOf(tier);
  if (i <= 0) return null;
  return QUALITY_ORDER[i - 1] ?? null;
}

/**
 * Return the tier one step above `tier`, or null if already at the highest.
 */
export function tierAbove(tier: QualityTier): QualityTier | null {
  const i = QUALITY_ORDER.indexOf(tier);
  if (i < 0 || i >= QUALITY_ORDER.length - 1) return null;
  return QUALITY_ORDER[i + 1] ?? null;
}
