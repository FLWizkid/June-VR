/**
 * Interaction-layer selection logic (SPEC §5, R1/R2). Centralized + pure so it is easy to reason
 * about and unit-test mentally.
 *
 *   hands   if: AR session active AND a hand is tracked
 *   ray     if: AR session active AND a usable target-ray source exists (no hands)
 *   place   otherwise (unsupported set, or desktop/inspect)
 *
 * Re-evaluated whenever inputs change or hand tracking is lost/regained, so the app degrades and
 * recovers cleanly mid-session.
 */

import { InteractionLayer } from '../core/featureFlags';

export interface LayerInputs {
  /** Is an immersive AR session currently active? */
  readonly sessionActive: boolean;
  /** Is at least one hand currently tracked with valid joints? */
  readonly handsTracked: boolean;
  /** Is at least one non-hand target-ray source present? */
  readonly raySourcePresent: boolean;
}

/** Decide which interaction layer should be active. Pure. */
export function selectInteractionLayer(inputs: LayerInputs): InteractionLayer {
  if (!inputs.sessionActive) {
    // Desktop / preview / between sessions: simplified place + inspect.
    return InteractionLayer.PlaceInspect;
  }
  if (inputs.handsTracked) return InteractionLayer.Hands;
  if (inputs.raySourcePresent) return InteractionLayer.Ray;
  return InteractionLayer.PlaceInspect;
}

/** Human-readable explanation for logs/status panel. */
export function describeLayer(layer: InteractionLayer): string {
  switch (layer) {
    case InteractionLayer.Hands:
      return 'Hand tracking (pinch to grab)';
    case InteractionLayer.Ray:
      return 'Ray pointer (select to place/grab)';
    case InteractionLayer.PlaceInspect:
      return 'Place & inspect (orbit / zoom)';
    case InteractionLayer.None:
    default:
      return 'Initializing';
  }
}
