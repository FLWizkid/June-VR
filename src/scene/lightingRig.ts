/**
 * Lighting rig (SPEC §7 robust-under-varied-lighting, R4).
 *
 * One key directional light + image-based/constant ambient. When WebXR light estimation is
 * available, the key light's intensity/color/rotation follow the real-world estimate so the cuff
 * stays believable as lighting changes; otherwise sensible neutral defaults are used.
 *
 * Real-time shadows are gated by the quality profile (off except Ultra) — low payoff on additive
 * displays and expensive on mobile XR.
 *
 * Allocation-free per frame: light estimate is copied into existing color/quat objects.
 *
 * Verified APIs (playcanvas@2.19): light component (type, color, intensity, castShadows),
 * app.xr.lightEstimation.{available,intensity,color,rotation}, scene.ambientLight.
 */

import * as pc from 'playcanvas';
import { createLogger } from '../utils/logging';
import type { QualityProfile } from '../config/qualityProfiles';

const log = createLogger('lighting');

/** Neutral defaults used when no light estimation is available. */
const DEFAULT_KEY_INTENSITY = 1.3;
const DEFAULT_KEY_COLOR = new pc.Color(1.0, 0.98, 0.95);
// Moderate ambient floor so surfaces never fall to pure black. NOTE: constant ambientLight has a
// small absolute contribution here (no env atlas), so it alone can't rescue the cuff's camera-facing
// walls — that's the camera-direction FILL light's job below. Kept moderate so distinct PBR
// materials still read (no washout, CLAUDE.md rule 2). In AR *with* light estimation this is
// overridden by the real-world estimate; it only sets the baseline for inspect + AR-without-
// estimation, so no additive-display washout risk.
const DEFAULT_AMBIENT = new pc.Color(0.55, 0.55, 0.56);

export class LightingRig {
  private readonly app: pc.AppBase;
  private readonly keyLight: pc.Entity;

  constructor(app: pc.AppBase, lightRoot: pc.Entity) {
    this.app = app;

    this.keyLight = new pc.Entity('key-light');
    this.keyLight.addComponent('light', {
      // PlayCanvas LightComponent.type is a STRING enum ('directional' | 'omni' | 'spot'). Passing
      // the numeric `pc.LIGHTTYPE_*` leaves the internal light type `undefined` and throws every frame
      // in the shadow/cull loop (`splitLights[undefined].push`). Runtime-verified fix.
      type: 'directional',
      color: DEFAULT_KEY_COLOR.clone(),
      intensity: DEFAULT_KEY_INTENSITY,
      castShadows: false,
      shadowBias: 0.05,
      normalOffsetBias: 0.05,
      shadowResolution: 1024,
    });
    // A pleasant default key direction (down-forward from upper-left).
    this.keyLight.setLocalEulerAngles(55, 30, 0);
    lightRoot.addChild(this.keyLight);

    // Soft STUDIO FILL DOME (no-asset stand-in for the "key + IBL" ideal; a real/procedural env atlas
    // via scene.envAtlas is the documented follow-up — SPEC §12). Constant scene.ambientLight is too
    // weak here to lift the cuff's outward-/side-facing fabric walls (they read near-black under key
    // alone), so three cool, shadowless directional fills bracket the product the way a softbox rig
    // would: one down the camera axis, and one from each side aimed at the ±X flanks the close-up
    // inspection camera actually sees. Kept well below the warm key so it lifts the darks toward a
    // readable navy without flattening form or washing the material out (CLAUDE.md rules 2 & 3). Light
    // estimation steers only the key, so AR realism is unaffected.
    // Near-neutral (barely cool) fill — three of these were stacking a noticeable cold-blue cast onto
    // the floor and cuff; pulled toward white so the scene reads neutral, not cold (cold reads "dark").
    const FILL_COLOR = new pc.Color(0.97, 0.98, 1.0);
    const addFill = (name: string, pitch: number, yaw: number, intensity: number): void => {
      const fill = new pc.Entity(name);
      fill.addComponent('light', {
        type: 'directional',
        color: FILL_COLOR.clone(),
        intensity,
        castShadows: false,
      });
      fill.setLocalEulerAngles(pitch, yaw, 0);
      lightRoot.addChild(fill);
    };
    // Camera-axis fill: lifts the big camera-facing fabric walls the steep key rakes past.
    addFill('fill-front', 18, 12, 0.6);
    // Side fills from ±X (traveling inward): catch the left/right flanks curving away from the camera.
    addFill('fill-left', 15, -90, 0.4);
    addFill('fill-right', 15, 90, 0.35);

    this.applyAmbient(DEFAULT_AMBIENT);
  }

  /** Apply quality-profile-driven settings (shadows on/off). */
  applyProfile(profile: QualityProfile): void {
    const light = this.keyLight.light;
    if (light) light.castShadows = profile.realtimeShadows;
  }

  /**
   * Per-frame light estimation sync. Safe no-op when unavailable. Allocation-free.
   * Reads estimate into the existing light component fields.
   */
  update(): void {
    const est = this.app.xr?.lightEstimation;
    if (!est || !est.available) return;

    const light = this.keyLight.light;
    if (!light) return;

    const intensity = est.intensity;
    if (intensity !== null && intensity !== undefined) {
      // Clamp to keep additive display readable (avoid blowing out or going dark).
      light.intensity = intensity < 0.15 ? 0.15 : intensity > 3 ? 3 : intensity;
    }

    const color = est.color;
    if (color) light.color = color;

    const rotation = est.rotation;
    if (rotation) this.keyLight.setRotation(rotation);

    const sh = est.sphericalHarmonics;
    if (sh && sh.length >= 3) {
      // Use the SH DC term as a cheap ambient approximation.
      tmpColorFromSh(sh, AMBIENT_SCRATCH);
      this.applyAmbient(AMBIENT_SCRATCH);
    }
  }

  private applyAmbient(color: pc.Color): void {
    const scene = this.app.scene;
    if (scene && scene.ambientLight) {
      scene.ambientLight.copy(color);
    }
  }

  /** Reset to neutral defaults (e.g. on session end). */
  resetToDefaults(): void {
    const light = this.keyLight.light;
    if (light) {
      light.intensity = DEFAULT_KEY_INTENSITY;
      light.color = DEFAULT_KEY_COLOR;
    }
    this.keyLight.setLocalEulerAngles(55, 30, 0);
    this.applyAmbient(DEFAULT_AMBIENT);
    log.debug('lighting reset to defaults');
  }
}

/** Scratch ambient color reused by the SH approximation (no per-frame allocation). */
const AMBIENT_SCRATCH = new pc.Color(0.3, 0.3, 0.3);

/** Approximate an ambient color from the DC term of L2 spherical harmonics. */
function tmpColorFromSh(sh: Float32Array, out: pc.Color): void {
  // sh[0..2] are the RGB DC coefficients; scale by the SH constant for irradiance-ish ambient.
  const k = 0.282095 * Math.PI; // Y0 * pi normalization, clamped below
  const r = (sh[0] ?? 0) * k;
  const g = (sh[1] ?? 0) * k;
  const b = (sh[2] ?? 0) * k;
  out.set(clamp01(r), clamp01(g), clamp01(b));
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
