/**
 * Environment / image-based lighting (SPEC §4/§7).
 *
 * Provides ambient reflection for PBR realism. In INSPECT mode a subtle skybox/ambient is fine; in
 * AR the skybox is disabled (optical see-through must not paint a background). If a prefiltered env
 * atlas asset is supplied it is used; otherwise we rely on the constant ambient from the lighting
 * rig (no hard dependency on an asset — R6).
 *
 * Verified APIs (playcanvas@2.19): scene.envAtlas, scene.skyboxIntensity, scene.exposure.
 */

import * as pc from 'playcanvas';
import { createLogger } from '../utils/logging';
import type { AssetRegistry } from '../core/assetRegistry';

const log = createLogger('environment');

export class Environment {
  private readonly app: pc.AppBase;
  private readonly assets: AssetRegistry;
  private envAtlas: pc.Texture | null = null;

  constructor(app: pc.AppBase, assets: AssetRegistry) {
    this.app = app;
    this.assets = assets;
  }

  /**
   * Attempt to load an optional prefiltered env atlas for reflections. Never required.
   * TODO(real-assets): drop 'assets/env/env_atlas.ktx2' to enable richer reflections.
   */
  async load(): Promise<void> {
    const url = 'assets/env/env_atlas.ktx2'; // TODO(real-assets): optional IBL atlas
    const tex = await this.assets.loadTexture(url, false);
    if (tex) {
      this.envAtlas = tex;
      log.info('env atlas loaded');
    } else {
      log.debug('no env atlas; using constant ambient');
    }
  }

  /** Configure scene reflections + exposure. */
  configure(): void {
    const scene = this.app.scene;
    if (!scene) return;
    if (this.envAtlas) {
      scene.envAtlas = this.envAtlas;
    }
    scene.exposure = 1.0;
    scene.skyboxIntensity = 1.0;
  }

  /**
   * AR vs inspect: in AR we must not render a skybox. The engine renders the skybox only if a
   * skybox/envAtlas-derived sky is set; we keep reflections (envAtlas) but suppress visible sky by
   * leaving the skybox layer empty. With clearColorBuffer off (set on the camera), nothing paints
   * the background, so this is mostly belt-and-suspenders.
   */
  setArMode(arActive: boolean): void {
    const scene = this.app.scene;
    if (!scene) return;
    // Keep reflections; just ensure no bright sky washes the see-through view.
    scene.skyboxIntensity = arActive ? 0 : 1.0;
  }
}
