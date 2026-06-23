/**
 * Central application configuration: tunable constants in one place so behavior is easy to adjust
 * without hunting through modules. Values are chosen for stable XR + close-up medical inspection.
 */

import { QualityTier } from './qualityProfiles';
import { inchesToMeters } from '../utils/units';

export interface AppConfig {
  /** Quality tier chosen before adaptive monitoring settles it. */
  readonly defaultQualityTier: QualityTier;
  /** Target frame rate to hold; we request the closest supported XR rate. */
  readonly targetFps: number;
  /** Camera near clip (meters). Small to allow ~6 inch inspection without clipping. */
  readonly cameraNearClip: number;
  /** Camera far clip (meters). AR scenes are small; keep modest for depth precision. */
  readonly cameraFarClip: number;
  /** Distance in front of the viewer to place the cuff when no hit test is available (meters). */
  readonly fallbackPlacementDistance: number;
  /** Comfortable resting height of the placed cuff above its anchor (meters). */
  readonly placementRestHeight: number;
  /** Pinch open/close thresholds (meters) with hysteresis to avoid flicker (R2). */
  readonly pinch: {
    readonly closeDistance: number;
    readonly openDistance: number;
  };
  /** Proximity radius (meters) for hover highlight from a fingertip. */
  readonly hoverProximity: number;
  /** Released-object velocity damping (1/s); higher settles faster. */
  readonly releaseDamping: number;
  /** First-load budget bounds (seconds) for logging/telemetry against SPEC §7. */
  readonly loadBudgetSeconds: { readonly min: number; readonly max: number };
  /** Performance monitor settings. */
  readonly perf: {
    /** Frame-time samples to average. */
    readonly sampleWindow: number;
    /** Step quality DOWN when avg frame time exceeds this (ms). */
    readonly downgradeFrameMs: number;
    /** Allow stepping quality UP when avg frame time is below this (ms). */
    readonly upgradeFrameMs: number;
    /** Minimum seconds between adaptive quality changes (debounce). */
    readonly changeCooldownSeconds: number;
  };
}

export const APP_CONFIG: AppConfig = {
  defaultQualityTier: QualityTier.High,
  targetFps: 90,
  cameraNearClip: 0.02, // ~0.8 inch; safely inside the 6-inch inspection distance
  cameraFarClip: 50,
  fallbackPlacementDistance: 0.6, // ~24 inches in front
  placementRestHeight: 0.0,
  pinch: {
    closeDistance: 0.025, // pinch considered "closed" under 2.5 cm
    openDistance: 0.045, // released once above 4.5 cm (hysteresis gap)
  },
  hoverProximity: 0.08, // 8 cm fingertip proximity for hover
  releaseDamping: 8,
  loadBudgetSeconds: { min: 2, max: 5 },
  perf: {
    sampleWindow: 90,
    downgradeFrameMs: 16.7, // below ~60 fps sustained -> shed quality
    upgradeFrameMs: 11.0, // comfortably above ~90 fps -> allow stepping up
    changeCooldownSeconds: 4,
  },
};

/** Inspection distance band (meters), surfaced for the inspection controller. */
export const INSPECTION_DISTANCE = {
  near: inchesToMeters(6),
  far: inchesToMeters(12),
  default: inchesToMeters(9),
} as const;

/**
 * COSMETIC interaction tunables, gathered in one labeled place (these are NOT clinical — clinical
 * values live in `config/trainingConfig.ts` flagged `SME-REVIEW`). They alias the authoritative
 * `APP_CONFIG` fields so there is still a single source of truth for the values the controllers read
 * (the controllers intentionally read `APP_CONFIG.*` directly to stay allocation-free and avoid an
 * extra import hop); this view exists for discoverability + documentation.
 *
 * IMPORTANT: every value here is a sensible default chosen for legible XR interaction. Final values
 * are FINALIZED ON-DEVICE (SPEC item 1) — pinch distances, hysteresis, and proximity radius depend
 * on the headset's hand-tracking precision and comfortable reach, so expect to retune on hardware.
 */
export const INTERACTION_TUNABLES = {
  /** Pinch close/open thresholds + the hysteresis gap that prevents grab flicker (meters). */
  pinch: APP_CONFIG.pinch,
  /** Hysteresis gap (m) between close and open thresholds (derived; documents the anti-flicker band). */
  pinchHysteresisM: APP_CONFIG.pinch.openDistance - APP_CONFIG.pinch.closeDistance,
  /** Proximity-highlight radius (m) from a fingertip to the cuff for the hover lift. */
  proximityHighlightRadiusM: APP_CONFIG.hoverProximity,
  /** Released-grab velocity damping (1/s); higher settles a thrown cuff faster. */
  releaseDamping: APP_CONFIG.releaseDamping,
  /** Fallback placement distance (m) in front of the viewer when no hit-test surface is available. */
  fallbackPlacementDistanceM: APP_CONFIG.fallbackPlacementDistance,
  /** Default quality tier before the adaptive PerformanceMonitor settles it. */
  defaultQualityTier: APP_CONFIG.defaultQualityTier,
} as const;
