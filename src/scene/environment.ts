/**
 * Environment / image-based lighting (IBL) seam (SPEC §4/§7).
 *
 * Provides ambient reflection for PBR realism. This is an OPTIONAL, capability-guarded seam — the app
 * never depends on an IBL asset (R6): with no atlas it falls back to the constant ambient + key light
 * from the lighting rig.
 *
 * Seam (drop either file into `public/assets/env/`):
 *   - `env_atlas.ktx2` — a PREFILTERED environment-lighting atlas (the format PlayCanvas'
 *     `scene.envAtlas` expects). Assigned directly for reflections + ambient. Requires the Basis
 *     transcoder to be initialized (see core/assetRegistry.ts `basisReady`), else it is skipped.
 *   - `env.hdr` — a raw EQUIRECT HDR. Converted at load via `EnvLighting.generateLightingSource` +
 *     `generateAtlas` into a prefiltered atlas, then assigned. (The .ktx2 path is preferred — it
 *     skips the runtime prefilter cost.)
 *
 * ROBUSTNESS (runtime-verified): optional IBL must NEVER block startup. We (a) skip KTX2 when the
 * transcoder isn't initialized (that load would hang), and (b) probe each file with a HEAD request
 * first, so a missing file — or a dev SPA server's 200-HTML fallback — is never handed to the binary
 * texture parser and never wedges `start()`.
 *
 * OPTICAL SEE-THROUGH RULE (CLAUDE.md / SPEC §4): in AR we must NOT render a skybox/background. We
 * keep only REFLECTIONS (envAtlas) and never set `scene.skybox`; additionally `skyboxIntensity` is
 * forced to 0 in AR (belt-and-suspenders alongside the camera's `clearColorBuffer = false`).
 *
 * Verified APIs (playcanvas@2.19): scene.envAtlas, scene.skybox, scene.skyboxIntensity, scene.exposure,
 * EnvLighting.generateLightingSource/generateAtlas.
 */

import * as pc from 'playcanvas';
import { createLogger } from '../utils/logging';
import type { AssetRegistry } from '../core/assetRegistry';

const log = createLogger('environment');

/** Preferred (prefiltered) IBL atlas seam. */
const ENV_ATLAS_URL = 'assets/env/env_atlas.ktx2';
/** Fallback raw equirect HDR seam (prefiltered at runtime if present). */
const ENV_HDR_URL = 'assets/env/env.hdr';

export class Environment {
  private readonly app: pc.AppBase;
  private readonly assets: AssetRegistry;
  /** The env-atlas texture actually applied for reflections (null = constant-ambient fallback). */
  private envAtlas: pc.Texture | null = null;

  constructor(app: pc.AppBase, assets: AssetRegistry) {
    this.app = app;
    this.assets = assets;
  }

  /** True if an IBL atlas was loaded/derived (vs the constant-ambient fallback). Informational. */
  get hasIbl(): boolean {
    return this.envAtlas !== null;
  }

  /**
   * Attempt to load an optional IBL source. Order: prefiltered `env_atlas.ktx2` (used directly), then
   * raw `env.hdr` (prefiltered at runtime). Never required and never throws — any failure (or missing
   * file, or uninitialized Basis transcoder) leaves the constant-ambient fallback in place and returns
   * promptly so startup is never blocked.
   * TODO(real-assets): drop `assets/env/env_atlas.ktx2` (preferred, + init Basis) or `assets/env/env.hdr`.
   */
  async load(): Promise<void> {
    // 1) Preferred: a ready prefiltered atlas. KTX2 needs the Basis transcoder AND the file must
    //    actually exist — a dev SPA server returns 200 HTML for missing files; never feed that to the
    //    texture parser and never block startup on an optional asset.
    if (this.assets.canDecodeBasis && (await assetPresent(ENV_ATLAS_URL))) {
      const atlas = await this.assets.loadTexture(ENV_ATLAS_URL, false);
      if (atlas) {
        this.envAtlas = atlas;
        log.info('IBL: env atlas (.ktx2) loaded');
        return;
      }
    }

    // 2) Fallback: a raw equirect HDR, prefiltered at runtime (capability-guarded).
    if (await assetPresent(ENV_HDR_URL)) {
      const hdr = await this.assets.loadTexture(ENV_HDR_URL, false);
      if (hdr) {
        const derived = this.prefilterEquirect(hdr);
        if (derived) {
          this.envAtlas = derived;
          log.info('IBL: env atlas derived from equirect HDR');
          return;
        }
        log.warn('IBL: HDR present but prefilter failed; using constant ambient');
        return;
      }
    }

    log.debug('IBL: no env atlas/HDR (or Basis not initialized); using constant ambient');
  }

  /**
   * Convert a raw equirect source texture into a prefiltered env-lighting atlas. Wrapped so any engine
   * incompatibility degrades gracefully to the constant-ambient fallback (returns null).
   */
  private prefilterEquirect(source: pc.Texture): pc.Texture | null {
    try {
      const lightingSource = pc.EnvLighting.generateLightingSource(source);
      const atlas = pc.EnvLighting.generateAtlas(lightingSource);
      return atlas ?? null;
    } catch (e) {
      log.warn('IBL: prefilter threw; falling back to constant ambient', e);
      return null;
    }
  }

  /** Configure scene reflections + exposure. Skybox is never set (no painted background, ever). */
  configure(): void {
    const scene = this.app.scene;
    if (!scene) return;
    if (this.envAtlas) {
      scene.envAtlas = this.envAtlas;
    }
    // Never paint a visible sky: leave scene.skybox unset; only the envAtlas drives reflections.
    scene.exposure = 1.0;
    scene.skyboxIntensity = 1.0;
  }

  /**
   * AR vs inspect: in AR we must not render a skybox. Reflections (envAtlas) are kept; visible sky is
   * suppressed (skyboxIntensity 0). With `clearColorBuffer` off on the camera, nothing paints the
   * background, so this is belt-and-suspenders.
   */
  setArMode(arActive: boolean): void {
    const scene = this.app.scene;
    if (!scene) return;
    scene.skyboxIntensity = arActive ? 0 : 1.0;
  }
}

/**
 * Lightweight existence probe for an OPTIONAL asset, so a missing file never blocks startup and a dev
 * SPA server's 200-HTML fallback is never handed to a binary texture parser. Resolves false on any
 * error (offline, blocked, etc.) — the caller then uses the constant-ambient fallback.
 */
async function assetPresent(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) return false;
    const ct = res.headers.get('content-type') ?? '';
    return !ct.includes('text/html');
  } catch {
    return false;
  }
}
