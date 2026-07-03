/**
 * Procedural stethoscope (foreground training prop, SHOWN in AR like the patient arm).
 *
 * A simple, recognizable stand-in: chrome chest piece (bell + diaphragm), a curved dark tube rising
 * to a binaural fork with two earpieces. Built ONCE from primitives; the whole instrument moves
 * rigidly (grab + place via interaction/partsController.ts — dragging it repositions the unit).
 *
 * It is mounted under the cuff root by the training scene (like the arm and the gauge device), so
 * it rides whole-assembly moves and participates in the placement floor clamp.
 *
 * SME-REVIEW: a prop only — no training step validates stethoscope placement yet (the taught site,
 * over the brachial artery at the antecubital fossa, is a future curriculum item). See
 * TRAINING_LOGIC.md §7.
 *
 * TODO(real-assets): replace with a real stethoscope GLB through the same seam when art is
 * delivered (drop-in at `assets/models/stethoscope.glb`; loader wiring mirrors patientArm's).
 */

import * as pc from 'playcanvas';
import { createPbrMaterial } from '../core/materialFactory';

/** Default resting offset (cuff-root local, m): beside the arm at graspable height. Cosmetic. */
export const STETHOSCOPE_HOME = { x: -0.3, y: -0.18, z: 0.14 } as const;

const TUBE_RADIUS = 0.004;
const TUBE_SEGMENTS = 14;

export class Stethoscope {
  /** Root entity; the training scene parents this under the cuff root. */
  readonly root: pc.Entity;

  private readonly device: pc.GraphicsDevice;
  private readonly meshInstances: pc.MeshInstance[] = [];
  private readonly aabb = new pc.BoundingBox();

  constructor(device: pc.GraphicsDevice) {
    this.device = device;
    this.root = new pc.Entity('stethoscope');
    this.build();
  }

  /** World AABB for part picking (reused box; do not retain). Null before build. */
  worldAabb(): pc.BoundingBox | null {
    let initialized = false;
    for (const mi of this.meshInstances) {
      if (!initialized) {
        this.aabb.copy(mi.aabb);
        initialized = true;
      } else {
        this.aabb.add(mi.aabb);
      }
    }
    return initialized ? this.aabb : null;
  }

  private build(): void {
    const chrome = createPbrMaterial({
      diffuse: new pc.Color(0.78, 0.79, 0.81),
      metalness: 1.0,
      roughness: 0.25,
    });
    const rubber = createPbrMaterial({
      diffuse: new pc.Color(0.12, 0.13, 0.15),
      metalness: 0.0,
      roughness: 0.6,
    });
    const diaphragmMat = createPbrMaterial({
      diffuse: new pc.Color(0.9, 0.9, 0.88),
      metalness: 0.0,
      roughness: 0.5,
    });

    // Chest piece: chrome body disc + white diaphragm face + short stem, lying face-up.
    const body = this.meshEntity(
      pc.createCylinder(this.device, { radius: 0.026, height: 0.012, capSegments: 32 }),
      chrome,
      'steth-chestpiece',
    );
    this.root.addChild(body);
    const diaphragm = this.meshEntity(
      pc.createCylinder(this.device, { radius: 0.023, height: 0.002, capSegments: 32 }),
      diaphragmMat,
      'steth-diaphragm',
    );
    diaphragm.setLocalPosition(0, 0.007, 0);
    this.root.addChild(diaphragm);
    const stem = this.meshEntity(
      pc.createCylinder(this.device, { radius: 0.006, height: 0.02, capSegments: 16 }),
      chrome,
      'steth-stem',
    );
    stem.setLocalPosition(0.028, 0.002, 0);
    stem.setLocalEulerAngles(0, 0, 90);
    this.root.addChild(stem);

    // Main tube: a fixed quadratic curve from the stem up toward the binaural fork.
    const p0 = { x: 0.038, y: 0.002, z: 0 };
    const c = { x: 0.14, y: 0.05, z: 0.02 };
    const p1 = { x: 0.16, y: 0.2, z: 0.0 };
    this.tubeAlong(p0, c, p1, rubber, 'tube');

    // Binaural fork: two short arcs from the tube top to the earpieces.
    const forkL = { x: 0.145, y: 0.26, z: -0.035 };
    const forkR = { x: 0.185, y: 0.26, z: 0.035 };
    this.tubeAlong(p1, { x: 0.15, y: 0.24, z: -0.02 }, forkL, chrome, 'binaural-l', 6);
    this.tubeAlong(p1, { x: 0.19, y: 0.24, z: 0.02 }, forkR, chrome, 'binaural-r', 6);
    for (const [name, p] of [
      ['ear-l', forkL],
      ['ear-r', forkR],
    ] as const) {
      const tip = this.meshEntity(
        pc.createSphere(this.device, { radius: 0.008, latitudeBands: 16, longitudeBands: 16 }),
        rubber,
        `steth-${name}`,
      );
      tip.setLocalPosition(p.x, p.y, p.z);
      this.root.addChild(tip);
    }
  }

  /** Lay `n` fixed cylinder segments along a quadratic bezier. Build-time only. */
  private tubeAlong(
    p0: { x: number; y: number; z: number },
    c: { x: number; y: number; z: number },
    p1: { x: number; y: number; z: number },
    mat: pc.StandardMaterial,
    name: string,
    n: number = TUBE_SEGMENTS,
  ): void {
    const at = (t: number): { x: number; y: number; z: number } => {
      const u = 1 - t;
      return {
        x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
        y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
        z: u * u * p0.z + 2 * u * t * c.z + t * t * p1.z,
      };
    };
    for (let i = 0; i < n; i++) {
      const a = at(i / n);
      const b = at((i + 1) / n);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dy, dz);
      if (len < 1e-6) continue;
      const seg = this.meshEntity(
        pc.createCylinder(this.device, { radius: TUBE_RADIUS, height: 1, capSegments: 10 }),
        mat,
        `steth-${name}-${i}`,
      );
      seg.setLocalPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      // Align the (Y-axis) cylinder with the segment direction: axis = Y × dir, angle = acos(Y·dir).
      const inv = 1 / len;
      const ny = dy * inv;
      let ax = dz * inv;
      let az = -dx * inv;
      const axisLen = Math.hypot(ax, az);
      if (axisLen < 1e-6) {
        ax = 1;
        az = 0;
      } else {
        ax /= axisLen;
        az /= axisLen;
      }
      const angle = (Math.acos(Math.max(-1, Math.min(1, ny))) * 180) / Math.PI;
      tmpQuat.setFromAxisAngle(tmpAxis.set(ax, 0, az), angle);
      seg.setLocalRotation(tmpQuat);
      seg.setLocalScale(1, len * 1.15, 1);
      this.root.addChild(seg);
    }
  }

  private meshEntity(mesh: pc.Mesh, mat: pc.StandardMaterial, name: string): pc.Entity {
    const e = new pc.Entity(name);
    const mi = new pc.MeshInstance(mesh, mat);
    e.addComponent('render', { meshInstances: [mi] });
    this.meshInstances.push(mi);
    return e;
  }

  dispose(): void {
    this.root.destroy();
  }
}

/** Build-time scratch for segment orientation. */
const tmpAxis = new pc.Vec3();
const tmpQuat = new pc.Quat();
