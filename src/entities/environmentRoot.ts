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
      // Lighter, neutral floor — this is the visible "background" at the bottom of the inspect frame,
      // which the brief called out as too dark. Neutral (not blue) so the cool fills don't tint it.
      diffuse: new pc.Color(0.46, 0.47, 0.48),
      metalness: 0,
      roughness: 0.95,
    });
    const floorMi = new pc.MeshInstance(floorMesh, floorMat);
    floor.addComponent('render', { meshInstances: [floorMi] });
    this.root.addChild(floor);

    // Faint grid lines (thin boxes) for spatial reference. Built once; cheap, static.
    const gridMat = createPbrMaterial({
      diffuse: new pc.Color(0.58, 0.59, 0.61),
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

    // Simple exam-room furniture stand-ins (PREVIEW ONLY — the whole environment root is disabled in
    // AR, so none of this is ever painted over the real world). Neutral, low-poly, static.
    this.buildFurniture();

    // Subtle low backdrop wall behind the cuff's default framing (-Z), for depth in preview only.
    const backdrop = new pc.Entity('env-backdrop');
    const backMesh = pc.createPlane(this.device, {
      halfExtents: new pc.Vec2(FLOOR_HALF, 0.9),
    });
    const backMat = createPbrMaterial({
      // Calm, near-neutral studio gray. The camera clear color is OCCLUDED by this backdrop plane,
      // so the visible "background" is this surface — it (not INSPECT_CLEAR) sets the background
      // brightness. The key light rakes across it, so a modest albedo lands as a light-gray wall
      // without blowing to white; neutralized off the previous blue cast. Dark UI panels carry their
      // own backdrop, so they stay high-contrast against it.
      diffuse: new pc.Color(0.4, 0.4, 0.41),
      metalness: 0,
      roughness: 1.0,
    });
    backdrop.addComponent('render', { meshInstances: [new pc.MeshInstance(backMesh, backMat)] });
    // Stand it up at the back, facing the camera.
    backdrop.setLocalPosition(0, 0.9, -FLOOR_HALF);
    backdrop.setLocalEulerAngles(90, 0, 0);
    this.root.addChild(backdrop);
  }

  /** Exam table + equipment cart stand-ins for the preview room. Build-time boxes only. */
  private buildFurniture(): void {
    const frameMat = createPbrMaterial({
      diffuse: new pc.Color(0.62, 0.63, 0.65),
      metalness: 0.6,
      roughness: 0.5,
    });
    const padMat = createPbrMaterial({
      diffuse: new pc.Color(0.5, 0.62, 0.68),
      metalness: 0,
      roughness: 0.9,
    });

    const box = (
      name: string,
      sx: number,
      sy: number,
      sz: number,
      mat: pc.StandardMaterial,
    ): pc.Entity => {
      const e = new pc.Entity(name);
      const mesh = pc.createBox(this.device, { halfExtents: new pc.Vec3(sx / 2, sy / 2, sz / 2) });
      e.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, mat)] });
      return e;
    };

    // Exam table (back-left): padded top on four legs.
    const table = new pc.Entity('env-exam-table');
    table.setLocalPosition(-1.25, 0, -1.25);
    table.setLocalEulerAngles(0, 20, 0);
    const top = box('table-top', 0.7, 0.06, 1.9, frameMat);
    top.setLocalPosition(0, 0.72, 0);
    table.addChild(top);
    const pad = box('table-pad', 0.66, 0.05, 1.84, padMat);
    pad.setLocalPosition(0, 0.775, 0);
    table.addChild(pad);
    for (const [lx, lz] of [[-0.3, -0.85], [0.3, -0.85], [-0.3, 0.85], [0.3, 0.85]] as const) {
      const leg = box('table-leg', 0.05, 0.72, 0.05, frameMat);
      leg.setLocalPosition(lx, 0.36, lz);
      table.addChild(leg);
    }
    this.root.addChild(table);

    // Equipment cart (right): body + top slab, where instruments would rest.
    const cart = new pc.Entity('env-cart');
    cart.setLocalPosition(1.35, 0, -0.9);
    cart.setLocalEulerAngles(0, -15, 0);
    const cartBody = box('cart-body', 0.52, 0.7, 0.45, frameMat);
    cartBody.setLocalPosition(0, 0.4, 0);
    cart.addChild(cartBody);
    const cartTop = box('cart-top', 0.58, 0.04, 0.5, padMat);
    cartTop.setLocalPosition(0, 0.77, 0);
    cart.addChild(cartTop);
    this.root.addChild(cart);
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
