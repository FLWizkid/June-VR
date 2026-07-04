/**
 * Procedural stethoscope (foreground training prop, SHOWN in AR like the patient arm).
 *
 * BENDABLE design: the instrument has a fixed "head" (binaural fork + earpieces + a short upper tube
 * stub) and a MOVABLE round end (the chest piece). A flexible tube connects them and is RE-LAID
 * (segment transforms only, event-rate — no per-frame allocation) whenever the chest piece moves, so
 * the tube bends to follow. The chest piece can be dragged and placed anywhere (e.g. onto the arm).
 *
 *   - Grab the CHEST PIECE (round end) → it moves, the tube bends to follow (interaction/
 *     partsController.ts, CuffPart.StethChest).
 *   - Grab the head/earpieces → the whole instrument moves (CuffPart.Stethoscope).
 *
 * Mounted under the cuff root by the training scene, so it rides whole-assembly moves and the
 * placement floor clamp.
 *
 * SME-REVIEW: a prop only — no training step validates stethoscope placement yet (the taught site,
 * over the brachial artery at the antecubital fossa, is a future curriculum item). See
 * TRAINING_LOGIC.md §7.
 *
 * TODO(real-assets): replace with a real stethoscope GLB through the same seam when art is
 * delivered (drop-in at `assets/models/stethoscope.glb`).
 */

import * as pc from 'playcanvas';
import { createPbrMaterial } from '../core/materialFactory';

/** Default resting offset of the stethoscope root (cuff-root local, m). Cosmetic. */
export const STETHOSCOPE_HOME = { x: -0.3, y: -0.18, z: 0.14 } as const;

/** Chest piece's default local position (stethoscope-root space): resting out in front of the head. */
const CHEST_HOME = { x: 0.02, y: 0.0, z: 0.12 } as const;
/** Where the flexible tube leaves the head, in stethoscope-root space. */
const HEAD_PORT = { x: 0.0, y: 0.11, z: 0.0 } as const;

const TUBE_RADIUS = 0.004;
const TUBE_SEGMENTS = 20;

export class Stethoscope {
  /** Root entity; the training scene parents this under the cuff root. */
  readonly root: pc.Entity;
  /** The movable round end (chest piece) — dragged independently; the tube bends to follow. */
  readonly chestPiece: pc.Entity;

  private readonly device: pc.GraphicsDevice;
  /** All mesh instances (for the whole-instrument AABB). */
  private readonly meshInstances: pc.MeshInstance[] = [];
  /** Just the chest-piece mesh instances (for grabbing the round end). */
  private readonly chestMeshInstances: pc.MeshInstance[] = [];
  private readonly tubeSegments: pc.Entity[] = [];
  private readonly aabb = new pc.BoundingBox();
  private readonly chestAabb = new pc.BoundingBox();

  // Re-lay scratch (event-rate; allocation-free).
  private readonly tmpP0 = new pc.Vec3();
  private readonly tmpP1 = new pc.Vec3();
  private readonly tmpDir = new pc.Vec3();
  private readonly tmpAxis = new pc.Vec3();
  private readonly tmpQuat = new pc.Quat();

  constructor(device: pc.GraphicsDevice) {
    this.device = device;
    this.root = new pc.Entity('stethoscope');
    this.chestPiece = new pc.Entity('steth-chest');
    this.build();
  }

  /** World AABB of the whole instrument (reused box; do not retain). */
  worldAabb(): pc.BoundingBox | null {
    return union(this.meshInstances, this.aabb);
  }

  /** World AABB of just the round chest piece (for grabbing/placing the round end). */
  chestWorldAabb(): pc.BoundingBox | null {
    return union(this.chestMeshInstances, this.chestAabb);
  }

  /** Chest-piece position in stethoscope-root local space. */
  get chestLocalPosition(): pc.Vec3 {
    return this.chestPiece.getLocalPosition();
  }

  /** Move the chest piece (stethoscope-root local) and bend the tube to follow. Allocation-free. */
  setChestLocalPosition(x: number, y: number, z: number): void {
    this.chestPiece.setLocalPosition(x, y, z);
    this.updateTube();
  }

  private build(): void {
    const chrome = createPbrMaterial({ diffuse: new pc.Color(0.78, 0.79, 0.81), metalness: 1.0, roughness: 0.25 });
    const rubber = createPbrMaterial({ diffuse: new pc.Color(0.12, 0.13, 0.15), metalness: 0.0, roughness: 0.6 });
    const diaphragmMat = createPbrMaterial({ diffuse: new pc.Color(0.9, 0.9, 0.88), metalness: 0.0, roughness: 0.5 });

    // --- Head: binaural fork + earpieces + short upper stub (anchored at the root) ---
    const forkBase = { x: 0, y: HEAD_PORT.y, z: 0 };
    const forkL = { x: -0.035, y: 0.17, z: -0.01 };
    const forkR = { x: 0.035, y: 0.17, z: -0.01 };
    this.staticTube(forkBase, { x: -0.02, y: 0.15, z: -0.005 }, forkL, chrome, 'binaural-l', 6);
    this.staticTube(forkBase, { x: 0.02, y: 0.15, z: -0.005 }, forkR, chrome, 'binaural-r', 6);
    for (const [name, p] of [['ear-l', forkL], ['ear-r', forkR]] as const) {
      const tip = this.meshEntity(
        pc.createSphere(this.device, { radius: 0.009, latitudeBands: 16, longitudeBands: 16 }),
        rubber,
        `steth-${name}`,
        this.root,
      );
      tip.setLocalPosition(p.x, p.y, p.z);
    }

    // --- Chest piece (movable round end): chrome body + white diaphragm + stem ---
    this.root.addChild(this.chestPiece);
    this.chestPiece.setLocalPosition(CHEST_HOME.x, CHEST_HOME.y, CHEST_HOME.z);
    const body = this.meshEntity(
      pc.createCylinder(this.device, { radius: 0.026, height: 0.012, capSegments: 32 }),
      chrome,
      'steth-chestpiece',
      this.chestPiece,
    );
    body.setLocalEulerAngles(90, 0, 0); // lie face-down (diaphragm toward the arm)
    this.chestMeshInstances.push(...renderMis(body));
    const diaphragm = this.meshEntity(
      pc.createCylinder(this.device, { radius: 0.023, height: 0.002, capSegments: 32 }),
      diaphragmMat,
      'steth-diaphragm',
      this.chestPiece,
    );
    diaphragm.setLocalPosition(0, -0.007, 0);
    diaphragm.setLocalEulerAngles(90, 0, 0);
    this.chestMeshInstances.push(...renderMis(diaphragm));
    const stem = this.meshEntity(
      pc.createCylinder(this.device, { radius: 0.005, height: 0.016, capSegments: 16 }),
      chrome,
      'steth-stem',
      this.chestPiece,
    );
    stem.setLocalPosition(0, 0.012, 0);
    this.chestMeshInstances.push(...renderMis(stem));

    // --- Flexible tube: segments created once; laid between the head port and the chest piece ---
    for (let i = 0; i < TUBE_SEGMENTS; i++) {
      const seg = this.meshEntity(
        pc.createCylinder(this.device, { radius: TUBE_RADIUS, height: 1, capSegments: 10 }),
        rubber,
        `steth-tube-${i}`,
        this.root,
      );
      this.tubeSegments.push(seg);
    }
    this.updateTube();
  }

  /**
   * Lay the flexible tube along a sagging quadratic curve from the head port to the chest piece
   * (both in stethoscope-root space). Segment transforms only — no allocation, event-rate.
   */
  private updateTube(): void {
    if (this.tubeSegments.length === 0) return;
    const a = HEAD_PORT;
    const cp = this.chestPiece.getLocalPosition();
    // Control point: midway, sagging downward so the tube drapes like real rubber tubing.
    const mx = (a.x + cp.x) / 2;
    const my = (a.y + cp.y) / 2 - 0.06;
    const mz = (a.z + cp.z) / 2;
    const at = (t: number, out: pc.Vec3): void => {
      const u = 1 - t;
      out.set(
        u * u * a.x + 2 * u * t * mx + t * t * cp.x,
        u * u * a.y + 2 * u * t * my + t * t * cp.y,
        u * u * a.z + 2 * u * t * mz + t * t * cp.z,
      );
    };
    const n = this.tubeSegments.length;
    for (let i = 0; i < n; i++) {
      at(i / n, this.tmpP0);
      at((i + 1) / n, this.tmpP1);
      const seg = this.tubeSegments[i];
      if (!seg) continue;
      this.tmpDir.sub2(this.tmpP1, this.tmpP0);
      const len = this.tmpDir.length();
      if (len < 1e-6) continue;
      this.tmpDir.mulScalar(1 / len);
      const dot = Math.max(-1, Math.min(1, this.tmpDir.y)); // dot(Y, dir)
      this.tmpAxis.set(this.tmpDir.z, 0, -this.tmpDir.x); // Y × dir
      if (this.tmpAxis.lengthSq() < 1e-8) this.tmpAxis.set(1, 0, 0);
      else this.tmpAxis.normalize();
      this.tmpQuat.setFromAxisAngle(this.tmpAxis, (Math.acos(dot) * 180) / Math.PI);
      seg.setLocalRotation(this.tmpQuat);
      seg.setLocalPosition(
        (this.tmpP0.x + this.tmpP1.x) / 2,
        (this.tmpP0.y + this.tmpP1.y) / 2,
        (this.tmpP0.z + this.tmpP1.z) / 2,
      );
      seg.setLocalScale(1, len * 1.2, 1);
    }
  }

  /** Static curved tube (build-time; fixed geometry) for the head fork. */
  private staticTube(
    p0: { x: number; y: number; z: number },
    c: { x: number; y: number; z: number },
    p1: { x: number; y: number; z: number },
    mat: pc.StandardMaterial,
    name: string,
    n: number,
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
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const len = Math.hypot(dx, dy, dz);
      if (len < 1e-6) continue;
      const seg = this.meshEntity(
        pc.createCylinder(this.device, { radius: TUBE_RADIUS, height: 1, capSegments: 10 }),
        mat,
        `steth-${name}-${i}`,
        this.root,
      );
      seg.setLocalPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      const inv = 1 / len;
      const ny = dy * inv;
      let ax = dz * inv, az = -dx * inv;
      const al = Math.hypot(ax, az);
      if (al < 1e-6) { ax = 1; az = 0; } else { ax /= al; az /= al; }
      this.tmpQuat.setFromAxisAngle(this.tmpAxis.set(ax, 0, az), (Math.acos(Math.max(-1, Math.min(1, ny))) * 180) / Math.PI);
      seg.setLocalRotation(this.tmpQuat);
      seg.setLocalScale(1, len * 1.15, 1);
    }
  }

  private meshEntity(mesh: pc.Mesh, mat: pc.StandardMaterial, name: string, parent: pc.Entity): pc.Entity {
    const e = new pc.Entity(name);
    const mi = new pc.MeshInstance(mesh, mat);
    e.addComponent('render', { meshInstances: [mi] });
    this.meshInstances.push(mi);
    parent.addChild(e);
    return e;
  }

  dispose(): void {
    this.root.destroy();
  }
}

/** Union of mesh-instance world AABBs into `out` (reused). Null if empty. */
function union(instances: readonly pc.MeshInstance[], out: pc.BoundingBox): pc.BoundingBox | null {
  let init = false;
  for (const mi of instances) {
    if (!init) { out.copy(mi.aabb); init = true; } else out.add(mi.aabb);
  }
  return init ? out : null;
}

/** The render mesh instances of an entity (helper for the chest-piece AABB list). */
function renderMis(e: pc.Entity): pc.MeshInstance[] {
  return [...(e.render?.meshInstances ?? [])];
}
