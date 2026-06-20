/**
 * Cuff size variants (SPEC: pediatric/small, medium, large). ASSET_PIPELINE §12.
 *
 * Variants are data. By default they describe scale + label differences applied to the shared
 * procedural model. When a real model is supplied, fill `modelUrl` (single model + scale, or one
 * URL per size) at the TODO markers — the entity builder consumes either path unchanged.
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
   * Uniform scale applied to the shared model for this size (used in the single-model strategy).
   * 1.0 = author size (medium).
   */
  readonly modelScale: number;
  /**
   * Optional per-size model URL. Null = use the shared/procedural model + `modelScale`.
   * TODO(real-assets): set to e.g. 'assets/models/cuff_large.glb' if shipping distinct meshes.
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
    modelScale: 0.72,
    modelUrl: null, // TODO(real-assets): optional 'assets/models/cuff_small.glb'
  },
  [CuffSize.Medium]: {
    size: CuffSize.Medium,
    label: 'Adult / Medium',
    armCircumferenceText: '22 - 32 cm',
    circumferenceRange: { min: cmToMeters(22), max: cmToMeters(32) },
    bladder: { width: cmToMeters(13), height: cmToMeters(24), thickness: cmToMeters(2.4) },
    modelScale: 1.0,
    modelUrl: null, // TODO(real-assets): 'assets/models/cuff_medium.glb' (primary source model)
  },
  [CuffSize.Large]: {
    size: CuffSize.Large,
    label: 'Large Adult',
    armCircumferenceText: '32 - 43 cm',
    circumferenceRange: { min: cmToMeters(32), max: cmToMeters(43) },
    bladder: { width: cmToMeters(16), height: cmToMeters(30), thickness: cmToMeters(2.8) },
    modelScale: 1.28,
    modelUrl: null, // TODO(real-assets): optional 'assets/models/cuff_large.glb'
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
