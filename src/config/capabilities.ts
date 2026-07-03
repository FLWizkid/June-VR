/**
 * Runtime capability detection (SPEC.md §5/§9, R1/R2).
 *
 * Everything WebXR is treated as capability-gated. This module answers two questions:
 *   1. Pre-session: is the environment secure, is WebXR present, is immersive-AR available?
 *   2. In-session: which XR feature subsystems actually came up (hit test, hands, anchors, depth,
 *      light estimation)?
 *
 * Nothing here throws; missing APIs resolve to `false`. `app.xr` may be null (installed PlayCanvas
 * types allow it) and is always guarded.
 */

import * as pc from 'playcanvas';
import { createLogger } from '../utils/logging';

const log = createLogger('capabilities');

/** Static (pre-session) environment capabilities. */
export interface EnvironmentCapabilities {
  /** `window.isSecureContext` — required for WebXR. */
  readonly secureContext: boolean;
  /** `navigator.xr` exists. */
  readonly webxrPresent: boolean;
  /** Immersive AR session is reported supported by the UA. */
  readonly immersiveArSupported: boolean;
  /** Immersive VR session supported (informational; app targets AR). */
  readonly immersiveVrSupported: boolean;
  /** WebGL2 graphics backend in use. */
  readonly webgl2: boolean;
}

/** In-session XR feature availability (only meaningful while a session is active). */
export interface XrFeatureCapabilities {
  readonly hitTest: boolean;
  readonly handTracking: boolean;
  readonly anchors: boolean;
  readonly depthSensing: boolean;
  readonly lightEstimation: boolean;
  /**
   * Whether the UA reports image tracking. INFORMATIONAL / diagnostics ONLY — per CLAUDE.md §4.1
   * image tracking is a first-class, UNGATED feature, so this flag MUST NOT be used anywhere to
   * decide whether image tracking runs or to select a fallback. It exists purely for the status
   * panel / logs. (Every other flag here does gate its feature; this one does not.)
   */
  readonly imageTracking: boolean;
}

export const DEFAULT_XR_FEATURES: XrFeatureCapabilities = {
  hitTest: false,
  handTracking: false,
  anchors: false,
  depthSensing: false,
  lightEstimation: false,
  imageTracking: false,
};

/**
 * Detect static environment capabilities. Async because `navigator.xr.isSessionSupported` is a
 * promise. Safe to call before the PlayCanvas app fully starts.
 */
export async function detectEnvironment(device?: pc.GraphicsDevice | null): Promise<EnvironmentCapabilities> {
  const secureContext = typeof window !== 'undefined' && window.isSecureContext === true;
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const xr = nav?.xr;
  const webxrPresent = !!xr;

  let immersiveArSupported = false;
  let immersiveVrSupported = false;

  if (xr && typeof xr.isSessionSupported === 'function') {
    immersiveArSupported = await safeIsSupported(xr, 'immersive-ar');
    immersiveVrSupported = await safeIsSupported(xr, 'immersive-vr');
  }

  // WebGL2 detection: prefer the engine device flag, fall back to a probe.
  let webgl2 = false;
  if (device && typeof (device as { isWebGL2?: boolean }).isWebGL2 === 'boolean') {
    webgl2 = (device as { isWebGL2: boolean }).isWebGL2;
  } else {
    webgl2 = probeWebGl2();
  }

  const caps: EnvironmentCapabilities = {
    secureContext,
    webxrPresent,
    immersiveArSupported,
    immersiveVrSupported,
    webgl2,
  };
  log.info('environment capabilities', caps);
  return caps;
}

async function safeIsSupported(xr: XRSystem, mode: XRSessionMode): Promise<boolean> {
  try {
    return await xr.isSessionSupported(mode);
  } catch (err) {
    log.warn(`isSessionSupported(${mode}) threw`, err);
    return false;
  }
}

function probeWebGl2(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return !!canvas.getContext('webgl2');
  } catch {
    return false;
  }
}

/**
 * Read in-session feature availability from `app.xr`. Each subsystem exposes `.supported` (device
 * can do it) and most expose `.available` (it actually came up this session). We report the
 * stronger of the meaningful signals, guarding every access.
 */
export function readXrFeatures(app: pc.AppBase): XrFeatureCapabilities {
  const xr = app.xr;
  if (!xr || !xr.active) return DEFAULT_XR_FEATURES;

  const hitTest = boolOf(xr.hitTest?.available) || boolOf(xr.hitTest?.supported);
  const anchors = boolOf(xr.anchors?.available) || boolOf(xr.anchors?.supported);
  const lightEstimation =
    boolOf(xr.lightEstimation?.available) || boolOf(xr.lightEstimation?.supported);

  // Hand tracking: at least one active input source exposes a tracked hand.
  let handTracking = false;
  const sources = xr.input?.inputSources ?? [];
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    if (src && src.hand) {
      handTracking = true;
      break;
    }
  }

  // Depth sensing has no PlayCanvas subsystem object in this version; infer from the active
  // WebXR session's depth API surface if present.
  const depthSensing = sessionHasDepth(xr.session);

  // Informational only (CLAUDE.md §4.1): image tracking is ungated. Reading this flag never gates
  // the feature — it feeds the status panel/logs alongside the gated capabilities.
  const imageTracking = boolOf(xr.imageTracking?.available) || boolOf(xr.imageTracking?.supported);

  return { hitTest, handTracking, anchors, depthSensing, lightEstimation, imageTracking };
}

function boolOf(v: boolean | undefined | null): boolean {
  return v === true;
}

function sessionHasDepth(session: XRSession | null): boolean {
  if (!session) return false;
  // `depthUsage`/`depthDataFormat` exist on the session only when depth sensing was granted.
  const s = session as unknown as { depthUsage?: string; depthDataFormat?: string };
  return typeof s.depthUsage === 'string' && typeof s.depthDataFormat === 'string';
}
