/**
 * Blood pressure cuff entity (SPEC §6/§10).
 *
 * Two build paths behind one interface:
 *   - PROCEDURAL (default, no assets): assembled from primitives with the distinct cuff materials so
 *     the object reads as a real BP cuff (fabric body, Velcro, tubing, bulb, gauge with needle).
 *   - REAL MODEL: when a variant supplies `modelUrl`, the GLB render entity is instantiated and its
 *     submeshes bound to `CuffMaterialLibrary` by slot name. (Wired via AssetRegistry; see TODO.)
 *
 * The entity exposes a stable API (root, worldAabb, setHighlight, gaugeNeedle, setSize) so all
 * interaction/inspection/gauge controllers are asset-agnostic.
 *
 * Allocation discipline: geometry/materials are built once. `worldAabb()` reuses a private box and
 * the math scratch pool — no per-call allocation.
 */

import * as pc from 'playcanvas';
import { CuffMaterialLibrary, type CuffMaterialId } from '../materials/cuffMaterials';
import { CuffSize, getVariant, type CuffVariantSpec } from './cuffVariants';
import type { AssetRegistry } from '../core/assetRegistry';
import { createLogger } from '../utils/logging';

const log = createLogger('cuff');

/**
 * Where the procedural fabric wrap sits relative to the real gauge device in composite mode
 * (metres, in the cuff's local space). Default lays it flat on the surface beside the device.
 * This is the single knob to reposition the wrap. Note the device GLB also carries the artist's
 * rolled-up cuff at the back of the gauge; this procedural wrap is the deployable training cuff.
 */
const WRAP_OFFSET = new pc.Vec3(0.22, 0, 0.02);

export class BloodPressureCuff {
  /** Root entity; parent this under the world/anchor root. */
  readonly root: pc.Entity;

  private readonly device: pc.GraphicsDevice;
  private readonly materials: CuffMaterialLibrary;
  private readonly assets: AssetRegistry;

  /** Sub-entity that holds the gauge needle (rotated by the gauge controller). */
  private needle: pc.Entity | null = null;
  /** Mesh instances that should receive the hover highlight (the fabric/body). */
  private readonly highlightTargets: pc.MeshInstance[] = [];
  /**
   * Flat list of ALL mesh instances, cached at build time. Iterated each frame by recomputeAabb()
   * so the hot path never calls `findComponents` (which allocates via find().map()).
   */
  private readonly allMeshInstances: pc.MeshInstance[] = [];

  private size: CuffSize = CuffSize.Medium;
  private highlighted = false;

  /** Cached world-space AABB and the parameters it was computed for. */
  private readonly cachedAabb = new pc.BoundingBox();
  private aabbDirty = true;

  constructor(device: pc.GraphicsDevice, materials: CuffMaterialLibrary, assets: AssetRegistry) {
    this.device = device;
    this.materials = materials;
    this.assets = assets;
    this.root = new pc.Entity('blood-pressure-cuff');
  }

  /** Expose the needle entity (may be null for real models without a tagged needle node). */
  get gaugeNeedle(): pc.Entity | null {
    return this.needle;
  }

  get currentSize(): CuffSize {
    return this.size;
  }

  /**
   * Build the cuff for a given size.
   *   - If the variant supplies a real device model, load it and COMPOSITE the procedural fabric arm
   *     wrap on top (gauge/tube/bulb come from the GLB; the size-specific wrap is procedural).
   *   - Otherwise build the full procedural placeholder (wrap + hardware) at the origin.
   * Must be awaited before use.
   */
  async build(size: CuffSize): Promise<void> {
    this.size = size;
    const variant = getVariant(size);

    this.clearChildren();
    this.highlightTargets.length = 0;
    this.allMeshInstances.length = 0;
    this.needle = null;

    let deviceLoaded = false;
    if (variant.modelUrl) {
      deviceLoaded = await this.buildFromModel(variant);
      if (!deviceLoaded) log.warn(`device model load failed for ${size}; using full procedural placeholder`);
    }

    if (deviceLoaded) {
      // Composite: real gauge device + procedural, size-specific fabric arm wrap (offset beside it).
      this.buildCuffWrap(variant, WRAP_OFFSET);
    } else {
      // Full procedural fallback (no real asset): wrap + hardware together at the origin.
      this.buildCuffWrap(variant, null);
      this.buildHardware(variant);
    }

    this.cacheMeshInstances();
    this.aabbDirty = true;
  }

  /**
   * Snapshot all mesh instances under the root into `allMeshInstances`. Called once per build (not
   * per frame), so the per-frame AABB recompute can iterate a plain array.
   */
  private cacheMeshInstances(): void {
    this.allMeshInstances.length = 0;
    const renders = this.root.findComponents('render') as pc.RenderComponent[];
    for (const render of renders) {
      const instances = render.meshInstances;
      for (const mi of instances) this.allMeshInstances.push(mi);
    }
  }

  /** Re-build for a new size (size variant swap). */
  async setSize(size: CuffSize): Promise<void> {
    if (size === this.size && this.root.children.length > 0) return;
    await this.build(size);
  }

  /**
   * REAL-ASSET PATH. Instantiates the GLB and binds materials by submesh/material slot name.
   * Returns false if loading/instantiation failed so the caller can fall back to procedural.
   */
  private async buildFromModel(variant: CuffVariantSpec): Promise<boolean> {
    if (!variant.modelUrl) return false;
    const entity = await this.assets.loadContainer(variant.modelUrl, `cuff-${variant.size}`);
    if (!entity) return false;

    entity.setLocalScale(variant.modelScale, variant.modelScale, variant.modelScale);
    this.root.addChild(entity);

    // Bind materials by name and collect highlight targets (fabric/body).
    const renders = entity.findComponents('render') as pc.RenderComponent[];
    for (const render of renders) {
      const instances = render.meshInstances ?? [];
      for (const mi of instances) {
        const slot = (mi.material ? mi.material.name : '').toLowerCase();
        const id = matchMaterialId(slot);
        if (id) {
          mi.material = this.materials.get(id);
          if (id === 'fabric') this.highlightTargets.push(mi);
        }
      }
    }

    // TODO(real-assets): if the model tags a needle node (e.g. named "needle"), capture it:
    //   this.needle = entity.findByName('needle') as pc.Entity | null;
    return true;
  }

  /**
   * Procedural fabric arm wrap (body + Velcro + label), sized from the variant. In composite mode
   * `offset` lays it on the surface beside the real device; in full-procedural mode `offset` is null
   * so it sits at the origin alongside the procedural hardware. All units in meters.
   */
  private buildCuffWrap(variant: CuffVariantSpec, offset: pc.Vec3 | null): void {
    const b = variant.bladder;
    let parent: pc.Entity = this.root;
    if (offset) {
      parent = new pc.Entity('cuff-wrap');
      parent.setLocalPosition(offset.x, offset.y, offset.z);
      this.root.addChild(parent);
    }

    // Cuff body: a flat curved-ish fabric slab. We model it as a thin box laid horizontally.
    const body = this.makeMeshEntity('cuff-body', this.boxMesh(b.width, b.thickness, b.height), 'fabric');
    body.setLocalPosition(0, b.thickness * 0.5, 0);
    parent.addChild(body);
    this.collectHighlight(body);

    // Velcro strip across one end of the body.
    const velcro = this.makeMeshEntity(
      'velcro',
      this.boxMesh(b.width * 0.96, b.thickness * 0.4, b.height * 0.22),
      'velcroHook',
    );
    velcro.setLocalPosition(0, b.thickness + 0.001, b.height * 0.36);
    parent.addChild(velcro);

    // Printed label patch on top of the fabric.
    const label = this.makeMeshEntity(
      'label',
      this.boxMesh(b.width * 0.5, 0.0015, b.height * 0.3),
      'label',
    );
    label.setLocalPosition(0, b.thickness + 0.002, -b.height * 0.18);
    parent.addChild(label);
  }

  /**
   * Procedural BP hardware (tubing, bulb, valve, aneroid gauge with a live needle). Used only in the
   * full-procedural fallback; in composite mode the real GLB supplies the hardware instead.
   * All units in meters.
   */
  private buildHardware(variant: CuffVariantSpec): void {
    const b = variant.bladder;

    // Rubber tubing: a short torus arc leaving the bladder, then a straight segment to the bulb.
    const tubeRadius = 0.004;
    const arc = this.makeMeshEntity(
      'tube-arc',
      this.torusMesh(tubeRadius, b.width * 0.18, 120),
      'rubberTube',
    );
    arc.setLocalPosition(b.width * 0.35, b.thickness + 0.02, -b.height * 0.3);
    arc.setLocalEulerAngles(90, 0, 0);
    this.root.addChild(arc);

    const tubeStraight = this.makeMeshEntity(
      'tube-straight',
      this.cylinderMesh(tubeRadius, 0.16),
      'rubberTube',
    );
    tubeStraight.setLocalPosition(b.width * 0.5, b.thickness + 0.02, -b.height * 0.42);
    tubeStraight.setLocalEulerAngles(0, 0, 70);
    this.root.addChild(tubeStraight);

    // Inflation bulb (sphere) + valve connector (small cylinder).
    const bulb = this.makeMeshEntity('bulb', this.sphereMesh(0.028), 'connector');
    bulb.setLocalPosition(b.width * 0.62, b.thickness + 0.02, -b.height * 0.56);
    this.root.addChild(bulb);

    const valve = this.makeMeshEntity('valve', this.cylinderMesh(0.006, 0.03), 'metalTrim');
    valve.setLocalPosition(b.width * 0.62, b.thickness + 0.055, -b.height * 0.52);
    this.root.addChild(valve);

    // Gauge assembly (body + bezel + face + needle + lens), parented so the whole gauge moves.
    const gauge = new pc.Entity('gauge');
    gauge.setLocalPosition(-b.width * 0.4, b.thickness + 0.05, -b.height * 0.38);
    gauge.setLocalEulerAngles(-25, 0, 0);
    this.root.addChild(gauge);

    const gaugeBody = this.makeMeshEntity('gauge-body', this.cylinderMesh(0.03, 0.018), 'gaugeBody');
    gaugeBody.setLocalEulerAngles(90, 0, 0);
    gauge.addChild(gaugeBody);

    const bezel = this.makeMeshEntity('gauge-bezel', this.torusMesh(0.004, 0.03, 360), 'metalTrim');
    bezel.setLocalPosition(0, 0.009, 0);
    bezel.setLocalEulerAngles(90, 0, 0);
    gauge.addChild(bezel);

    const face = this.makeMeshEntity('gauge-face', this.cylinderMesh(0.028, 0.001), 'gaugeFace');
    face.setLocalPosition(0, 0.0095, 0);
    face.setLocalEulerAngles(90, 0, 0);
    gauge.addChild(face);

    // Needle: thin box pivoting at the gauge center. Parent node is what the gauge controller spins.
    const needlePivot = new pc.Entity('needle');
    needlePivot.setLocalPosition(0, 0.011, 0);
    gauge.addChild(needlePivot);
    const needleMesh = this.makeMeshEntity('needle-mesh', this.boxMesh(0.0015, 0.0008, 0.022), 'needle');
    needleMesh.setLocalPosition(0, 0, 0.009);
    needlePivot.addChild(needleMesh);
    this.needle = needlePivot;

    const lens = this.makeMeshEntity('gauge-lens', this.cylinderMesh(0.028, 0.0008), 'lens');
    lens.setLocalPosition(0, 0.012, 0);
    lens.setLocalEulerAngles(90, 0, 0);
    gauge.addChild(lens);
  }

  /**
   * World-space AABB of the cuff, recomputed lazily when geometry/transform may have changed.
   * Reuses `cachedAabb`; allocation-free for callers.
   */
  worldAabb(): pc.BoundingBox {
    if (this.aabbDirty) {
      this.recomputeAabb();
      this.aabbDirty = false;
    }
    return this.cachedAabb;
  }

  /** Mark the cached AABB stale (call after moving/scaling the cuff externally). */
  invalidateAabb(): void {
    this.aabbDirty = true;
  }

  private recomputeAabb(): void {
    // Iterate the cached flat list (no findComponents on the frame path — that allocates).
    const instances = this.allMeshInstances;
    let initialized = false;
    for (let i = 0; i < instances.length; i++) {
      const mi = instances[i];
      if (!mi) continue;
      const box = mi.aabb; // world-space AABB of this mesh instance
      if (!initialized) {
        this.cachedAabb.copy(box);
        initialized = true;
      } else {
        this.cachedAabb.add(box);
      }
    }
    if (!initialized) {
      // Fallback: a small box at the root position.
      const p = this.root.getPosition();
      this.cachedAabb.center.copy(p);
      this.cachedAabb.halfExtents.set(0.05, 0.05, 0.05);
    }
  }

  /** Toggle a subtle hover/proximity highlight on the body (SPEC §5). No allocation. */
  setHighlight(on: boolean): void {
    if (on === this.highlighted) return;
    this.highlighted = on;
    for (const mi of this.highlightTargets) {
      const mat = mi.material as pc.StandardMaterial | undefined;
      if (!mat) continue;
      // Subtle: a small emissive lift only while hovered — readable, not glowy (additive display).
      if (on) {
        mat.emissive.set(0.04, 0.05, 0.07);
      } else {
        mat.emissive.set(0, 0, 0);
      }
      mat.update();
    }
  }

  // --- primitive + entity helpers ---

  private makeMeshEntity(name: string, mesh: pc.Mesh, materialId: CuffMaterialId): pc.Entity {
    const e = new pc.Entity(name);
    const mi = new pc.MeshInstance(mesh, this.materials.get(materialId));
    e.addComponent('render', { meshInstances: [mi] });
    return e;
  }

  private collectHighlight(entity: pc.Entity): void {
    const render = entity.render;
    if (render && render.meshInstances) {
      for (const mi of render.meshInstances) this.highlightTargets.push(mi);
    }
  }

  private boxMesh(x: number, y: number, z: number): pc.Mesh {
    return pc.createBox(this.device, { halfExtents: new pc.Vec3(x * 0.5, y * 0.5, z * 0.5) });
  }

  private cylinderMesh(radius: number, height: number): pc.Mesh {
    return pc.createCylinder(this.device, { radius, height });
  }

  private torusMesh(tubeRadius: number, ringRadius: number, sectorAngle: number): pc.Mesh {
    return pc.createTorus(this.device, { tubeRadius, ringRadius, sectorAngle });
  }

  private sphereMesh(radius: number): pc.Mesh {
    return pc.createSphere(this.device, { radius });
  }

  private clearChildren(): void {
    const children = [...this.root.children];
    for (const c of children) {
      this.root.removeChild(c);
      if (c instanceof pc.Entity) c.destroy();
    }
  }

  /** Destroy the entity and its children. */
  dispose(): void {
    this.clearChildren();
    this.root.destroy();
  }
}

/** Match a GLB material/slot name to a known cuff material id. */
function matchMaterialId(slot: string): CuffMaterialId | null {
  const known: CuffMaterialId[] = [
    'fabric',
    'velcroHook',
    'velcroLoop',
    'stitching',
    'label',
    'rubberTube',
    'connector',
    'gaugeBody',
    'gaugeFace',
    'needle',
    'lens',
    'metalTrim',
  ];
  for (const id of known) {
    if (slot === id.toLowerCase()) return id;
  }
  // Loose contains-match for convenience (e.g. "fabric_main").
  for (const id of known) {
    if (slot.includes(id.toLowerCase())) return id;
  }
  return null;
}
