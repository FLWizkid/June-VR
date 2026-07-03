/**
 * Environment root entity (SPEC STEP 6 / GROUND TRUTH: no env asset detected).
 *
 * This is the integration SEAM for the "existing 3D environment" the brief assumes. No environment
 * GLB is present in the repo, so this entity:
 *   1. ATTEMPTS to load an environment GLB from the documented path (none ships in v1), and
 *   2. otherwise builds a MINIMAL PROCEDURAL STAND-IN (neutral floor grid + a faint backdrop) so the
 *      non-AR preview has spatial context.
 *
 * CRITICAL — optical see-through rule (CLAUDE.md / SPEC §4):
 *   In an immersive AR session the real world IS the environment. We MUST NOT paint a floor/backdrop
 *   over it. Therefore the whole environment root is DISABLED while an XR (AR) session is active and
 *   only shown in non-AR preview/debug. `setArMode(true)` hides it; `setArMode(false)` restores it.
 *
 * The environment transform is INDEPENDENT of the cuff (separate entity under the world root), so
 * moving/placing the cuff never moves the environment and vice-versa.
 *
 * Verified APIs (playcanvas@2.19): pc.Entity, entity.enabled, createPlane/createBox, MeshInstance,
 * RenderComponent, ContainerResource.instantiateRenderEntity (via AssetRegistry.loadContainer).
 */

import * as pc from 'playcanvas';
import { createPbrMaterial } from '../core/materialFactory';
import type { AssetRegistry } from '../core/assetRegistry';
import { createLogger } from '../utils/logging';

const log = createLogger('environment-root');

/**
 * Documented seam path for a real environment GLB. None ships in v1 (GROUND TRUTH / SPEC §12 A13).
 * TODO(real-assets): drop an environment GLB here and it will be loaded + composited automatically,
 * replacing the procedural stand-in. Keep it modelled in meters, +Y up / −Z forward.
 */
const ENV_MODEL_URL = 'assets/env/training_room.glb';

/** Half-size (m) of the procedural floor plane stand-in. */
const FLOOR_HALF = 2.0;

export class EnvironmentRoot {
  /** Root entity; parent this under the world root (independent of the cuff). */
  readonly root: pc.Entity;

  private readonly device: pc.GraphicsDevice;
  private readonly assets: AssetRegistry;

  /** True once a real env GLB loaded (vs the procedural stand-in). */
  private usingRealModel = false;
  /** Remembered last non-AR visibility so AR toggling restores the right state. */
  private previewVisible = true;
  private arActive = false;

  constructor(device: pc.GraphicsDevice, assets: AssetRegistry) {
    this.device = device;
    this.assets = assets;
    this.root = new pc.Entity('environment-root');
  }

  /** True if a real environment GLB was loaded (informational / status). */
  get isRealModel(): boolean {
    return this.usingRealModel;
  }

  /**
   * Build the environment: try the real GLB seam, else the procedural stand-in. Await before use.
   * Never throws — a missing/!failed env never blocks startup (env is non-essential, esp. in AR).
   */
  async build(): Promise<void> {
    const model = await this.assets.loadContainer(ENV_MODEL_URL, 'training-room');
    if (model) {
      this.root.addChild(model);
      this.usingRealModel = true;
      log.info('environment GLB loaded');
      return;
    }
    log.debug('no environment GLB; building procedural stand-in (preview only)');
    this.buildProceduralStandIn();
  }

  /**
   * Minimal neutral stand-in for NON-AR preview only: a matte floor + a faint grid of thin lines +
   * a subtle low backdrop wall. Tuned to a light studio gray so the preview reads clearly without
   * competing with the cuff, and it is hidden entirely in AR.
   */
  private buildProceduralStandIn(): void {
    // Matte neutral floor. createPlane takes a Vec2 halfExtents (X, Z) — verified against the .d.ts.
    const floor = new pc.Entity('env-floor');
    const floorMesh = pc.createPlane(this.device, {
      halfExtents: new pc.Vec2(FLOOR_HALF, FLOOR_HALF),
    });
    const floorMat = createPbrMaterial({
      diffuse: new pc.Color(0.34, 0.36, 0.4),
      metalness: 0,
      roughness: 0.95,
    });
    const floorMi = new pc.MeshInstance(floorMesh, floorMat);
    floor.addComponent('render', { meshInstances: [floorMi] });
    this.root.addChild(floor);

    // Faint grid lines (thin boxes) for spatial reference. Built once; cheap, static.
    const gridMat = createPbrMaterial({
      diffuse: new pc.Color(0.5, 0.53, 0.58),
      metalness: 0,
      roughness: 0.9,
    });
    const lines = 9;
    const step = (FLOOR_HALF * 2) / (lines - 1);
    const lineThickness = 0.004;
    const grid = new pc.Entity('env-grid');
    for (let i = 0; i < lines; i++) {
      const offset = -FLOOR_HALF + i * step;

      const lineX = new pc.Entity('grid-x');
      const meshX = pc.createBox(this.device, {
        halfExtents: new pc.Vec3(FLOOR_HALF, lineThickness, lineThickness),
      });
      lineX.addComponent('render', { meshInstances: [new pc.MeshInstance(meshX, gridMat)] });
      lineX.setLocalPosition(0, 0.001, offset);
      grid.addChild(lineX);

      const lineZ = new pc.Entity('grid-z');
      const meshZ = pc.createBox(this.device, {
        halfExtents: new pc.Vec3(lineThickness, lineThickness, FLOOR_HALF),
      });
      lineZ.addComponent('render', { meshInstances: [new pc.MeshInstance(meshZ, gridMat)] });
      lineZ.setLocalPosition(offset, 0.001, 0);
      grid.addChild(lineZ);
    }
    this.root.addChild(grid);

    // Subtle low backdrop wall behind the cuff's default framing (-Z), for depth in preview only.
    const backdrop = new pc.Entity('env-backdrop');
    const backMesh = pc.createPlane(this.device, {
      halfExtents: new pc.Vec2(FLOOR_HALF, 0.9),
    });
    const backMat = createPbrMaterial({
      diffuse: new pc.Color(0.28, 0.3, 0.34),
      metalness: 0,
      roughness: 1.0,
    });
    backdrop.addComponent('render', { meshInstances: [new pc.MeshInstance(backMesh, backMat)] });
    // Stand it up at the back, facing the camera.
    backdrop.setLocalPosition(0, 0.9, -FLOOR_HALF);
    backdrop.setLocalEulerAngles(90, 0, 0);
    this.root.addChild(backdrop);
  }

  /**
   * AR vs preview visibility. In AR the real world is the environment, so the whole stand-in/GLB is
   * disabled (never painted over the see-through view). In preview it is shown (subject to
   * `setPreviewVisible`).
   */
  setArMode(arActive: boolean): void {
    this.arActive = arActive;
    this.applyVisibility();
  }

  /** Toggle preview-mode visibility (e.g. a debug switch). Ignored while AR is active (always off). */
  setPreviewVisible(visible: boolean): void {
    this.previewVisible = visible;
    this.applyVisibility();
  }

  private applyVisibility(): void {
    // Hidden whenever AR is active; otherwise follow the preview flag.
    this.root.enabled = !this.arActive && this.previewVisible;
  }

  dispose(): void {
    this.root.destroy();
  }
}
