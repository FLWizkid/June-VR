/**
 * FeatureFlags: a small observable store of current capability + interaction state.
 *
 * It is the single source of truth that UI (status/quality panels, AR button, unsupported message)
 * and controllers read, so capability changes propagate without tight coupling.
 */

import type { EnvironmentCapabilities, XrFeatureCapabilities } from '../config/capabilities';
import { DEFAULT_XR_FEATURES } from '../config/capabilities';
import { QualityTier } from '../config/qualityProfiles';

/** Which interaction layer is currently active (SPEC §5). */
export const enum InteractionLayer {
  /** Not in an interactive AR/inspect state yet. */
  None = 'none',
  /** WebXR hand tracking (primary). */
  Hands = 'hands',
  /** Ray-based selection (secondary). */
  Ray = 'ray',
  /** Simplified place/inspect (fallback / desktop). */
  PlaceInspect = 'place-inspect',
}

export interface FeatureState {
  environment: EnvironmentCapabilities | null;
  xrFeatures: XrFeatureCapabilities;
  sessionActive: boolean;
  interactionLayer: InteractionLayer;
  qualityTier: QualityTier;
}

type Listener = (state: Readonly<FeatureState>) => void;

export class FeatureFlags {
  private state: FeatureState = {
    environment: null,
    xrFeatures: DEFAULT_XR_FEATURES,
    sessionActive: false,
    interactionLayer: InteractionLayer.None,
    qualityTier: QualityTier.High,
  };

  private readonly listeners = new Set<Listener>();

  /** Current immutable snapshot. */
  get(): Readonly<FeatureState> {
    return this.state;
  }

  /** Subscribe to state changes; returns an unsubscribe function. Fires once immediately. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setEnvironment(environment: EnvironmentCapabilities): void {
    this.patch({ environment });
  }

  setXrFeatures(xrFeatures: XrFeatureCapabilities): void {
    this.patch({ xrFeatures });
  }

  setSessionActive(sessionActive: boolean): void {
    this.patch({ sessionActive });
  }

  setInteractionLayer(interactionLayer: InteractionLayer): void {
    if (interactionLayer !== this.state.interactionLayer) this.patch({ interactionLayer });
  }

  setQualityTier(qualityTier: QualityTier): void {
    if (qualityTier !== this.state.qualityTier) this.patch({ qualityTier });
  }

  private patch(partial: Partial<FeatureState>): void {
    this.state = { ...this.state, ...partial };
    for (const l of this.listeners) l(this.state);
  }
}
