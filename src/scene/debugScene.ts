/**
 * Debug + minimal world helpers (SPEC §7 "minimal, readable; no decorative geometry").
 *
 * Provides:
 *   - createReticle(): a flat ring shown while targeting a surface for placement.
 *   - formatCapabilityDebug(): a compact text summary of capability state for the status panel.
 *
 * No decorative scenery is added in AR — only the reticle, which is functional.
 */

import * as pc from 'playcanvas';
import { createPbrMaterial } from '../core/materialFactory';
import type { EnvironmentCapabilities, XrFeatureCapabilities } from '../config/capabilities';
import type { InteractionLayer } from '../core/featureFlags';
import { describeLayer } from '../ar/fallbackModes';

/**
 * Build a thin ring reticle (torus) laid flat (XZ plane) to mark a placement target. Unlit-ish,
 * subtle, readable on an additive display.
 */
export function createReticle(device: pc.GraphicsDevice): pc.Entity {
  const entity = new pc.Entity('placement-reticle');
  const mesh = pc.createTorus(device, { tubeRadius: 0.004, ringRadius: 0.06, sectorAngle: 360 });
  const material = createPbrMaterial({
    diffuse: new pc.Color(0.5, 0.85, 1.0),
    metalness: 0,
    roughness: 0.5,
  });
  // A touch of emissive so the reticle reads against varied real-world backgrounds (functional UI,
  // not decorative — kept small).
  material.emissive.set(0.15, 0.3, 0.4);
  material.update();
  const mi = new pc.MeshInstance(mesh, material);
  entity.addComponent('render', { meshInstances: [mi] });
  // Lay flat on the ground plane.
  entity.setLocalEulerAngles(90, 0, 0);
  return entity;
}

/**
 * Build a translucent "target" marker (flat disc + ring) showing where the learner should position
 * the cuff during the placement step. Functional training UI, kept subtle for the additive display.
 * Disabled by default; the training controller toggles it.
 */
export function createTargetMarker(device: pc.GraphicsDevice): pc.Entity {
  const entity = new pc.Entity('placement-target');

  const ringMesh = pc.createTorus(device, { tubeRadius: 0.005, ringRadius: 0.08, sectorAngle: 360 });
  const ringMat = createPbrMaterial({
    diffuse: new pc.Color(0.45, 1.0, 0.6),
    metalness: 0,
    roughness: 0.5,
    opacity: 0.5,
  });
  ringMat.emissive.set(0.1, 0.25, 0.14);
  ringMat.update();
  const ring = new pc.Entity('target-ring');
  ring.addComponent('render', { meshInstances: [new pc.MeshInstance(ringMesh, ringMat)] });
  ring.setLocalEulerAngles(90, 0, 0);
  entity.addChild(ring);

  return entity;
}

/** Compact multi-line capability/interaction summary for the status panel + debug output. */
export function formatCapabilityDebug(
  env: EnvironmentCapabilities | null,
  feats: XrFeatureCapabilities,
  layer: InteractionLayer,
  sessionActive: boolean,
): string {
  const yn = (b: boolean): string => (b ? 'yes' : 'no');
  const lines: string[] = [];
  lines.push(`session: ${sessionActive ? 'active' : 'inactive'}`);
  lines.push(`interaction: ${describeLayer(layer)}`);
  if (env) {
    lines.push(`secure: ${yn(env.secureContext)}  webxr: ${yn(env.webxrPresent)}`);
    lines.push(`AR available: ${yn(env.immersiveArSupported)}  webgl2: ${yn(env.webgl2)}`);
  } else {
    lines.push('environment: detecting...');
  }
  lines.push(
    `hands:${yn(feats.handTracking)} hit:${yn(feats.hitTest)} anchors:${yn(feats.anchors)} ` +
      `depth:${yn(feats.depthSensing)} light:${yn(feats.lightEstimation)} img:${yn(feats.imageTracking)}`,
  );
  return lines.join('\n');
}
