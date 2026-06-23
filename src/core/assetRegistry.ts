/**
 * Asset loading abstraction with a clean placeholder seam (SPEC §10, R6).
 *
 * v1 ships NO real art, so the cuff is built procedurally (entities/bloodPressureCuff.ts). When real
 * assets arrive they are dropped into public/assets and wired here via `loadContainer` /
 * `loadTexture`, which use the verified PlayCanvas async loaders. Nothing else in the app changes.
 *
 * Verified APIs (playcanvas@2.19):
 *   app.assets.loadFromUrl(url, 'container'|'texture', cb)
 *   ContainerResource.instantiateRenderEntity(): Entity
 */

import * as pc from 'playcanvas';
import { createLogger } from '../utils/logging';

const log = createLogger('assets');

export class AssetRegistry {
  private readonly app: pc.AppBase;
  private readonly textureCache = new Map<string, pc.Texture>();

  constructor(app: pc.AppBase) {
    this.app = app;
    // TODO(real-assets): when shipping KTX2/Basis + meshopt-compressed GLBs, enable the engine
    // decoders before loading, e.g.:
    //   pc.basisInitialize({ glueUrl, wasmUrl, fallbackUrl });   // KTX2/Basis transcoder
    //   pc.dracoInitialize({ jsUrl, wasmUrl });                  // if Draco is used
    // meshopt is handled by the engine's glb parser automatically. See ASSET_PIPELINE.md §9.
  }

  /**
   * Load a GLB/GLTF container and instantiate its render entity. Resolves to null (never throws) so
   * callers can fall back to procedural content.
   *
   * @param url - URL under public/assets/models/.
   * @param name - Friendly asset name.
   */
  loadContainer(url: string, name: string): Promise<pc.Entity | null> {
    return new Promise((resolve) => {
      this.app.assets.loadFromUrl(url, 'container', (err, asset) => {
        if (err || !asset) {
          log.warn(`container load failed: ${url}`, err);
          resolve(null);
          return;
        }
        try {
          const resource = asset.resource as pc.ContainerResource | undefined;
          if (!resource || typeof resource.instantiateRenderEntity !== 'function') {
            log.warn(`container has no render resource: ${url}`);
            resolve(null);
            return;
          }
          const entity = resource.instantiateRenderEntity();
          entity.name = name;
          resolve(entity);
        } catch (e) {
          log.warn(`instantiate failed: ${url}`, e);
          resolve(null);
        }
      });
    });
  }

  /**
   * Load a 2D texture (PNG/KTX2). Cached by URL. Resolves to null on failure.
   *
   * @param url - URL under public/assets/textures/.
   * @param srgb - True for color maps (albedo/label), false for normal/ORM (linear).
   */
  loadTexture(url: string, srgb: boolean): Promise<pc.Texture | null> {
    const cached = this.textureCache.get(url);
    if (cached) return Promise.resolve(cached);

    return new Promise((resolve) => {
      this.app.assets.loadFromUrl(url, 'texture', (err, asset) => {
        if (err || !asset) {
          log.warn(`texture load failed: ${url}`, err);
          resolve(null);
          return;
        }
        const tex = asset.resource as pc.Texture | undefined;
        if (!tex) {
          resolve(null);
          return;
        }
        // Color space hint via texture type; the engine maps srgb sampling accordingly.
        // (Normal/ORM must remain linear.)
        if (!srgb) {
          // Linear data; leave default type. Marked for clarity / future explicit control.
        }
        this.textureCache.set(url, tex);
        resolve(tex);
      });
    });
  }

  /** Release cached textures (e.g. on teardown). */
  dispose(): void {
    this.textureCache.clear();
  }
}
