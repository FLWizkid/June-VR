/**
 * Scene factory: builds the camera and the persistent scene roots.
 *
 * Camera is configured for both modes:
 *   - AR (optical see-through): `clearColorBuffer = false` so the real world shows through.
 *   - Inspect (desktop/preview): clears to a neutral background.
 *
 * Tonemapping/gamma live on the CameraComponent in playcanvas@2.19 (verified). We use a neutral
 * tonemap + sRGB output for predictable, non-stylized color (medical realism, no look).
 */

import * as pc from 'playcanvas';
import { APP_CONFIG } from '../config/appConfig';

export interface SceneRoots {
  /** Camera entity used for both inspect and XR rendering. */
  readonly camera: pc.Entity;
  /** Parent for content that is world/anchor-locked (the cuff, reticle). */
  readonly worldRoot: pc.Entity;
  /** Parent for lighting rig entities. */
  readonly lightRoot: pc.Entity;
}

/**
 * Neutral inspect-mode background: a mid **studio gray** — bright enough to read the scene and let
 * the product stand out, calm enough not to distract. Inspect/preview ONLY; AR turns the color clear
 * off entirely (`setArMode`), so this never paints over the see-through view.
 */
const INSPECT_CLEAR = new pc.Color(0.46, 0.47, 0.5, 1);

export function createScene(app: pc.AppBase): SceneRoots {
  const camera = new pc.Entity('camera');
  camera.addComponent('camera', {
    clearColor: INSPECT_CLEAR,
    nearClip: APP_CONFIG.cameraNearClip,
    farClip: APP_CONFIG.cameraFarClip,
    // Inspect mode default; AR mode flips clearColorBuffer off in setArMode().
    clearColorBuffer: true,
  });

  const cam = camera.camera;
  if (cam) {
    // Neutral, predictable color pipeline — no stylization.
    cam.gammaCorrection = pc.GAMMA_SRGB;
    cam.toneMapping = pc.TONEMAP_NEUTRAL;
  }

  // A gentle inspect-mode framing position; overridden by XR pose when a session is active.
  camera.setLocalPosition(0, 0.2, 0.6);
  camera.lookAt(0, 0.05, 0);

  const worldRoot = new pc.Entity('world-root');
  const lightRoot = new pc.Entity('light-root');

  app.root.addChild(camera);
  app.root.addChild(worldRoot);
  app.root.addChild(lightRoot);

  return { camera, worldRoot, lightRoot };
}

/**
 * Switch the camera between AR (see-through) and inspect (clears background).
 * In AR we must not clear color or the real world would be painted over.
 */
export function setArMode(roots: SceneRoots, arActive: boolean): void {
  const cam = roots.camera.camera;
  if (!cam) return;
  cam.clearColorBuffer = !arActive;
}
