/**
 * Unit conversions and clinical constants.
 *
 * World unit convention: 1 PlayCanvas/WebXR world unit = 1 meter (see SPEC.md A6).
 * Cuff geometry is authored/placed in meters; clinical readouts use mmHg.
 */

/** Meters per inch. */
export const METERS_PER_INCH = 0.0254;
/** Meters per centimeter. */
export const METERS_PER_CM = 0.01;

/** Convert inches to meters (world units). */
export function inchesToMeters(inches: number): number {
  return inches * METERS_PER_INCH;
}

/** Convert centimeters to meters (world units). */
export function cmToMeters(cm: number): number {
  return cm * METERS_PER_CM;
}

/** Convert meters to centimeters. */
export function metersToCm(m: number): number {
  return m / METERS_PER_CM;
}

/**
 * Close-up inspection distance range from the eyes, expressed in meters.
 * Derived from the ~6–12 inch requirement (SPEC.md §2/§6).
 */
export const INSPECTION_RANGE_METERS = {
  near: inchesToMeters(6),
  far: inchesToMeters(12),
} as const;

/** Clinical pressure bounds for the gauge model (mmHg). */
export const PRESSURE_MMHG = {
  min: 0,
  max: 300,
  /** Typical inflation target during a manual reading. */
  typicalInflate: 180,
} as const;

/** Convert a pressure in mmHg into a normalized [0,1] dial fraction. */
export function pressureToDialFraction(mmHg: number): number {
  const span = PRESSURE_MMHG.max - PRESSURE_MMHG.min;
  if (span <= 0) return 0;
  const f = (mmHg - PRESSURE_MMHG.min) / span;
  return f < 0 ? 0 : f > 1 ? 1 : f;
}
