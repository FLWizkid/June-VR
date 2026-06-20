/**
 * XR session bootstrap (SPEC §3/§7, R8/R10).
 *
 * Wraps `app.xr.start()` with:
 *   - capability-gated optional features (hit test, hand input, anchors, depth, light estimation),
 *   - user-gesture entry (caller must invoke from a click/tap),
 *   - highest-supported frame rate request,
 *   - fixed foveation per quality profile,
 *   - clean start/end lifecycle events.
 *
 * Verified against playcanvas@2.19:
 *   - `app.xr` may be null.
 *   - `app.xr.start(camera, type, spaceType, options)` returns void and reports via `options.callback`.
 *   - options: { optionalFeatures?: string[]; anchors?: boolean; depthSensing?: {...}; callback }.
 *   - `app.xr.supportedFrameRates`, `app.xr.updateTargetFrameRate`, `app.xr.fixedFoveation` (setter).
 */

import * as pc from 'playcanvas';
import { createLogger } from '../utils/logging';
import { APP_CONFIG } from '../config/appConfig';
import type { QualityProfile } from '../config/qualityProfiles';

const log = createLogger('xr');

/** Optional WebXR feature strings we *request* (subject to UA support; all are then gated). */
const OPTIONAL_FEATURES: readonly string[] = [
  'hand-tracking',
  'hit-test',
  'anchors',
  'light-estimation',
  'depth-sensing',
  'local-floor',
  'bounded-floor',
];

export interface XrStartResult {
  readonly ok: boolean;
  readonly error?: Error;
}

export class XrBootstrap {
  private readonly app: pc.AppBase;

  constructor(app: pc.AppBase) {
    this.app = app;
  }

  /** True if the engine reports XR support at all. */
  get supported(): boolean {
    return !!this.app.xr && this.app.xr.supported;
  }

  /** True if an immersive-AR session is currently reported available. */
  isArAvailable(): boolean {
    const xr = this.app.xr;
    return !!xr && xr.isAvailable(pc.XRTYPE_AR);
  }

  /** True while a session is active. */
  get active(): boolean {
    return !!this.app.xr && this.app.xr.active;
  }

  /**
   * Start an immersive-AR session. MUST be called from a user gesture.
   *
   * Tries `local-floor` first and falls back to `local` if the floor space is rejected.
   *
   * @param camera - The camera component to drive from pose.
   * @param profile - Active quality profile (frame scale + foveation).
   */
  async startAr(camera: pc.CameraComponent, profile: QualityProfile): Promise<XrStartResult> {
    const xr = this.app.xr;
    if (!xr) {
      return { ok: false, error: new Error('XR not supported in this browser') };
    }
    if (xr.active) {
      return { ok: true };
    }

    const spaceFirst = pc.XRSPACE_LOCALFLOOR;
    const spaceFallback = pc.XRSPACE_LOCAL;

    const first = await this.tryStart(camera, spaceFirst, profile);
    if (first.ok) return first;

    log.warn('local-floor start failed, retrying with local space', first.error);
    return this.tryStart(camera, spaceFallback, profile);
  }

  private tryStart(
    camera: pc.CameraComponent,
    spaceType: string,
    profile: QualityProfile,
  ): Promise<XrStartResult> {
    const xr = this.app.xr;
    if (!xr) return Promise.resolve({ ok: false, error: new Error('XR unavailable') });

    return new Promise((resolve) => {
      xr.start(camera, pc.XRTYPE_AR, spaceType, {
        framebufferScaleFactor: profile.framebufferScaleFactor,
        optionalFeatures: [...OPTIONAL_FEATURES],
        anchors: true,
        // Request depth sensing (capability flag only in v1). Preferences are best-effort.
        depthSensing: {
          usagePreference: pc.XRDEPTHSENSINGUSAGE_CPU,
          dataFormatPreference: pc.XRDEPTHSENSINGFORMAT_L8A8,
        },
        callback: (err: Error | null) => {
          if (err) {
            resolve({ ok: false, error: err });
            return;
          }
          this.onSessionStarted(profile);
          resolve({ ok: true });
        },
      });
    });
  }

  /** End the active session. */
  end(): Promise<void> {
    const xr = this.app.xr;
    if (!xr || !xr.active) return Promise.resolve();
    return new Promise((resolve) => {
      xr.end(() => resolve());
    });
  }

  private onSessionStarted(profile: QualityProfile): void {
    const xr = this.app.xr;
    if (!xr) return;

    // Request the highest supported frame rate at/under our target (R5 stability).
    const rates = xr.supportedFrameRates;
    if (rates && rates.length > 0) {
      let best = rates[0] ?? 0;
      for (let i = 1; i < rates.length; i++) {
        const r = rates[i] ?? 0;
        if (r > best && r <= APP_CONFIG.targetFps + 1) best = r;
      }
      if (best > 0) {
        try {
          xr.updateTargetFrameRate(best);
          log.info(`requested XR frame rate ${best}`);
        } catch (e) {
          log.warn('updateTargetFrameRate failed', e);
        }
      }
    }

    // Apply fixed foveation (recovers peripheral fill cost) if supported.
    try {
      xr.fixedFoveation = profile.fixedFoveation;
    } catch {
      // Not supported on this device; ignore.
    }

    // Start light estimation if the subsystem is present; availability fires later (gated on read).
    try {
      if (xr.lightEstimation && xr.lightEstimation.supported) {
        xr.lightEstimation.start();
      }
    } catch (e) {
      log.warn('lightEstimation.start failed', e);
    }
  }

  /** Apply a (possibly changed) quality profile to the live session. */
  applyProfile(profile: QualityProfile): void {
    const xr = this.app.xr;
    if (!xr || !xr.active) return;
    try {
      xr.fixedFoveation = profile.fixedFoveation;
    } catch {
      // ignore
    }
  }
}
