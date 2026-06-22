/**
 * Cuff size variants (SPEC: pediatric/small, medium, large). ASSET_PIPELINE §12.
 *
 * Variants are data. The shared real device GLB (the aneroid gauge + tube + bulb) is the same for
 * every size — `modelUrl` points all sizes at it and `modelScale` stays 1.0 (the gauge is one
 * physical size). What varies per size is the procedural fabric arm WRAP, driven by `bladder` below
 * and composited onto the device by the entity builder. Drop a real per-size cuff mesh in later by
 * pointing `modelUrl` at distinct files (the builder consumes either path unchanged).
 */

import { cmToMeters } from '../utils/units';

export const enum CuffSize {
  PediatricSmall = 'pediatric-small',
  Medium = 'medium',
  Large = 'large',
}

export const CUFF_SIZE_ORDER: readonly CuffSize[] = [
  CuffSize.PediatricSmall,
  CuffSize.Medium,
  CuffSize.Large,
] as const;

/** Shared real device model (gauge head + coiled tube + inflation bulb). Same for all sizes. */
const DEVICE_MODEL_URL = 'assets/models/blood_pressure_device.glb';

export interface CuffVariantSpec {
  readonly size: CuffSize;
  readonly label: string;
  /** Printed sizing range text (informational / label art). */
  readonly armCircumferenceText: string;
  /** Arm circumference range in meters (drives placeholder bladder geometry). */
  readonly circumferenceRange: { readonly min: number; readonly max: number };
  /** Bladder body dimensions in meters (width = along arm, height = around arm wrap, used by mesh). */
  readonly bladder: { readonly width: number; readonly height: number; readonly thickness: number };
  /**
   * Uniform scale applied to the loaded `modelUrl`. For the shared device this stays 1.0 (one
   * physical gauge); size differences live in `bladder` (the procedural wrap), not here.
   */
  readonly modelScale: number;
  /**
   * Model to load for this size. All sizes share the real device GLB; the size-specific fabric wrap
   * is composited procedurally on top. TODO(real-assets): point at a distinct per-size cuff mesh if
   * one is delivered (e.g. 'assets/models/cuff_large.glb').
   */
  readonly modelUrl: string | null;
}

const VARIANTS: Record<CuffSize, CuffVariantSpec> = {
  [CuffSize.PediatricSmall]: {
    size: CuffSize.PediatricSmall,
    label: 'Pediatric / Small',
    armCircumferenceText: '12 - 19 cm',
    circumferenceRange: { min: cmToMeters(12), max: cmToMeters(19) },
    bladder: { width: cmToMeters(8), height: cmToMeters(15), thickness: cmToMeters(2.0) },
    modelScale: 1.0,
    modelUrl: DEVICE_MODEL_URL,
  },
  [CuffSize.Medium]: {
    size: CuffSize.Medium,
    label: 'Adult / Medium',
    armCircumferenceText: '22 - 32 cm',
    circumferenceRange: { min: cmToMeters(22), max: cmToMeters(32) },
    bladder: { width: cmToMeters(13), height: cmToMeters(24), thickness: cmToMeters(2.4) },
    modelScale: 1.0,
    modelUrl: DEVICE_MODEL_URL,
  },
  [CuffSize.Large]: {
    size: CuffSize.Large,
    label: 'Large Adult',
    armCircumferenceText: '32 - 43 cm',
    circumferenceRange: { min: cmToMeters(32), max: cmToMeters(43) },
    bladder: { width: cmToMeters(16), height: cmToMeters(30), thickness: cmToMeters(2.8) },
    modelScale: 1.0,
    modelUrl: DEVICE_MODEL_URL,
  },
};

export function getVariant(size: CuffSize): CuffVariantSpec {
  return VARIANTS[size];
}

/** Next size in the cycle (for a UI toggle). */
export function nextSize(size: CuffSize): CuffSize {
  const i = CUFF_SIZE_ORDER.indexOf(size);
  const next = CUFF_SIZE_ORDER[(i + 1) % CUFF_SIZE_ORDER.length];
  return next ?? CuffSize.Medium;
}
