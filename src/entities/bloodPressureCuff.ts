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
import { tmp } from '../utils/math';
import { createLogger } from '../utils/logging';

const log = createLogger('cuff');

/**
 * Where the procedural fabric wrap sits relative to the real gauge device in composite mode
 * (metres, in the cuff's local space). Default lays it flat on the surface beside the device.
 * This is the single knob to reposition the wrap. Note the device GLB also carries the artist's
 * rolled-up cuff at the back of the gauge; this procedural wrap is the deployable training cuff.
 */
const WRAP_OFFSET = new pc.Vec3(0.22, 0, 0.02);

/**
 * Curved-band wrap tunables (cosmetic; finalized on-device). Used only when the wrap is configured
 * to hug an arm via `setArmWrap`. The clinical placement (where on the arm) lives in
 * `config/trainingConfig.ts` (`CUFF_ON_ARM`); these shape the band geometry itself.
 */
const CUFF_BAND_CLEARANCE = 0.004; // radial gap (m) between limb surface and band inner face
const CUFF_BAND_ARC_DEG = 300; // arc (deg) the band wraps around the limb
// Staves approximating the curve. 21 (up from 9) reads as a smooth band at inspection distance while
// staying a build-time-only cost (a few hundred extra triangles, zero per-frame work).
const CUFF_BAND_STAVES = 21;

/**
 * Procedural aneroid gauge tunables (cosmetic; the full-procedural fallback only — the real device
 * GLB supplies the gauge in composite mode). The slab is 3× the original 0.018 m wafer so the gauge
 * head reads as a solid device body, not a thin disc, when seen edge-on up close. Radial segments
 * smooth the disc/bezel rims; geometry is built once (no per-frame cost).
 */
const GAUGE_SLAB_THICKNESS = 0.054;
const GAUGE_RADIAL_SEGMENTS = 48;

/**
 * Live gauge overlay placement on the REAL device GLB (composite mode). The shipped GLB is ONE
 * merged mesh whose dial is a static baked texture — it has no needle node to drive — so a small
 * procedural dial face + needle is overlaid on the device's screen panel and driven by the existing
 * GaugeController. Coordinates are in the render entity's LOCAL (= glTF mesh) space: the entity
 * root carries the GLB node's +90° X rotation (verified in the runtime graph), so mesh-space
 * "screen panel" bounds are x ±0.081, z −0.402→−0.26, surface facing +Y. Cosmetic; finalized
 * on-device.
 */
const DEVICE_DIAL = { x: 0, y: 0.004, z: -0.331, radius: 0.062 } as const;

/**
 * Interaction pick regions on the device, in the SAME mesh-local space (from the GLB primitive
 * bounds). The GLB is one mesh (no bulb/tube nodes), so the bulb and the gauge screen are addressed
 * as spatial regions: clicking/pinching the bulb region pumps; the screen region works the valve.
 * Used by interaction/partsController.ts.
 */
export const DEVICE_BULB_REGION = { x: 0.079, y: -0.007, z: -0.049, radius: 0.055 } as const;
export const DEVICE_SCREEN_REGION = {
  min: { x: -0.09, y: -0.05, z: -0.41 },
  max: { x: 0.09, y: 0.05, z: -0.25 },
} as const;

/**
 * Animated bulb overlay (composite mode). The shipped device GLB is one merged mesh, so the artist's
 * blue bulb (the `Platic_Grey_2` primitive) cannot be transformed on its own. We overlay a
 * procedural ellipsoid on top of it, sized to ENVELOPE the baked bulb at rest so the static one is
 * hidden, and scale it with the live pressure — it expands as the trainee pumps up and contracts as
 * the pressure is released. Center + rest radii are mesh-local, from the baked bulb's vertex bounds
 * (center ≈ (0.0785,−0.0075,−0.0485); half-extents ≈ (0.025,0.025,0.049)). Colour matches the baked
 * bulb's base factor. Cosmetic; finalized on-device.
 */
const BULB_OVERLAY_CENTER = { x: 0.0785, y: -0.0075, z: -0.0485 } as const;
const BULB_OVERLAY_REST_RADII = { x: 0.03, y: 0.03, z: 0.057 } as const;
const BULB_OVERLAY_MAX_GROWTH = 0.26; // +26% at full inflation
const BULB_OVERLAY_COLOR = { r: 0.0, g: 0.075, b: 0.314 } as const;

/**
 * Procedural coiled hose connecting the CUFF BAND to the GAUGE DEVICE (composite mode) — the
 * counterpart of the GLB's baked bulb coil, so the cuff visibly plumbs into the meter. Geometry is
 * a stretched helix between two ports; segment TRANSFORMS (never geometry) are recomputed whenever
 * an endpoint moves (band slide / device drag / build) — event-rate only, allocation-free.
 * The device port is in the GLB's mesh-local space (where the baked coil meets the housing);
 * cosmetic, finalized on-device.
 */
const HOSE_SEGMENTS = 72;
const HOSE_COIL_TURNS = 8;
const HOSE_COIL_RADIUS = 0.009;
const HOSE_TUBE_RADIUS = 0.0045;
const HOSE_DEVICE_PORT_MESH = { x: -0.055, y: -0.01, z: -0.25 } as const;

export class BloodPressureCuff {
  /** Root entity; parent this under the world/anchor root. */
  readonly root: pc.Entity;

  private readonly device: pc.GraphicsDevice;
  private readonly materials: CuffMaterialLibrary;
  private readonly assets: AssetRegistry;

  /** Sub-entity that holds the gauge needle (rotated by the gauge controller). */
  private needle: pc.Entity | null = null;
  /**
   * The procedural fabric wrap node (body + Velcro + label). Exposed (read-only intent) so the
   * cuff animator can drive wrap/tighten/swell without forking a second cuff. Null until built.
   */
  private wrapNode: pc.Entity | null = null;
  /** The fabric body sub-entity inside the wrap (scaled to suggest bladder swell on inflation). */
  private wrapBody: pc.Entity | null = null;
  /** Base local scale of the wrap body, captured at build time so swell is relative + reversible. */
  private readonly wrapBodyBaseScale = new pc.Vec3(1, 1, 1);
  /** Mesh instances that should receive the hover highlight (the fabric/body). */
  private readonly highlightTargets: pc.MeshInstance[] = [];
  /**
   * Flat list of ALL mesh instances, cached at build time. Iterated each frame by recomputeAabb()
   * so the hot path never calls `findComponents` (which allocates via find().map()).
   */
  private readonly allMeshInstances: pc.MeshInstance[] = [];

  private size: CuffSize = CuffSize.Medium;
  private highlighted = false;
  /**
   * When non-null, the next build makes the fabric wrap a CURVED BAND hugging a limb of this radius
   * (m) instead of a flat slab — so the cuff reads as wrapped around an arm. Set via `setArmWrap`
   * BEFORE build()/setSize(); null restores the flat-slab body. This reshapes the EXISTING wrap on
   * the EXISTING cuff (no second cuff is forked).
   */
  private armWrapRadius: number | null = null;
  /** True when the current wrap body was built as a curved band (selects swell axis). */
  private wrapIsBand = false;
  /** Local offset for the real device GLB (so it stands beside an arm). Default: no offset. */
  private readonly deviceLocalOffset = new pc.Vec3(0, 0, 0);

  /** The instantiated device GLB entity (composite mode), for per-part interaction. Null until built. */
  private deviceEntityRef: pc.Entity | null = null;
  /** Procedural bulb overlay node scaled by live pressure (composite mode). Null until built. */
  private bulbNode: pc.Entity | null = null;
  /** Mesh instances of the fabric band (wrap body subtree) / device, for part AABBs. Build-time. */
  private readonly bandMeshInstances: pc.MeshInstance[] = [];
  private readonly deviceMeshInstances: pc.MeshInstance[] = [];
  /** Reused boxes for part AABB queries (recomputed on demand; allocation-free for callers). */
  private readonly bandAabb = new pc.BoundingBox();
  private readonly deviceAabb = new pc.BoundingBox();
  /** Current band slide offset (m) along the limb axis (cuff-local Y). */
  private wrapSlideY = 0;
  /** Current band rotation (deg) around the limb axis (0 = built orientation, marker at +Z). */
  private wrapRotDeg = 0;

  // --- cuff↔device connecting hose (composite mode) ---
  private hoseRoot: pc.Entity | null = null;
  private readonly hoseSegments: pc.Entity[] = [];
  private readonly hoseMeshInstancesList: pc.MeshInstance[] = [];
  private readonly hoseAabb = new pc.BoundingBox();
  /** Band dimensions captured at build (for the hose's band-side port). */
  private bandOuterRadius = 0;
  private bandWidthAlong = 0;
  /** Private hose-math scratch (event-rate transform updates; no allocation). */
  private readonly hoseTmpA = new pc.Vec3();
  private readonly hoseTmpB = new pc.Vec3();
  private readonly hoseTmpT = new pc.Vec3();
  private readonly hoseTmpSide = new pc.Vec3();
  private readonly hoseTmpUp = new pc.Vec3();
  private readonly hoseTmpP0 = new pc.Vec3();
  private readonly hoseTmpP1 = new pc.Vec3();
  private readonly hoseTmpDir = new pc.Vec3();
  private readonly hoseTmpAxis = new pc.Vec3();
  private readonly hoseTmpQuat = new pc.Quat();

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

  /**
   * The procedural fabric wrap node, for the animator to translate/rotate during the wrap/position
   * training motion. Null until built; null is safe (animator guards it).
   */
  get wrap(): pc.Entity | null {
    return this.wrapNode;
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
    this.bandMeshInstances.length = 0;
    this.deviceMeshInstances.length = 0;
    this.hoseMeshInstancesList.length = 0;
    this.hoseSegments.length = 0;
    this.hoseRoot = null;
    this.deviceEntityRef = null;
    this.bulbNode = null;
    this.wrapSlideY = 0;
    this.wrapRotDeg = 0;
    this.needle = null;
    this.wrapNode = null;
    this.wrapBody = null;
    this.wrapBodyBaseScale.set(1, 1, 1);

    let deviceLoaded = false;
    if (variant.modelUrl) {
      deviceLoaded = await this.buildFromModel(variant);
      if (!deviceLoaded) log.warn(`device model load failed for ${size}; using full procedural placeholder`);
    }

    // When the wrap is a curved arm-band, it must be centered on the wrap-node origin so it wraps the
    // limb axis (the training scene mounts the whole cuff onto the arm frame). The flat-slab body,
    // by contrast, is laid out BESIDE the device via WRAP_OFFSET in composite mode.
    const wrapOffset = this.armWrapRadius !== null ? null : WRAP_OFFSET;
    if (deviceLoaded) {
      // Composite: real gauge device + procedural, size-specific fabric arm wrap + connecting hose.
      this.buildCuffWrap(variant, wrapOffset);
      this.buildConnectingHose();
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
   * Configure the fabric wrap to hug an arm of `radiusM` (curved band) on the NEXT build, or pass
   * null to restore the flat slab. Call BEFORE `build()`/`setSize()`. Reshapes the EXISTING wrap on
   * the EXISTING cuff — it does NOT create a second cuff. The clinical placement of the cuff on the
   * arm is owned by the training scene (`CUFF_ON_ARM` in trainingConfig); this only sets the band's
   * curvature to match the limb so it reads as wrapped, not floating.
   */
  setArmWrap(radiusM: number | null): void {
    this.armWrapRadius = radiusM !== null && radiusM > 0 ? radiusM : null;
  }

  /**
   * Local offset (cuff-root space) applied to the real gauge DEVICE GLB on the next build, so it can
   * stand BESIDE the arm (tube implied) instead of overlapping it when the wrap is mounted on a limb.
   * No-op in full-procedural mode (the procedural hardware has its own layout). Call BEFORE build().
   */
  setDeviceOffset(x: number, y: number, z: number): void {
    this.deviceLocalOffset.set(x, y, z);
  }

  /** The device GLB entity (composite mode) for per-part interaction; null in full-procedural mode. */
  get deviceEntity(): pc.Entity | null {
    return this.deviceEntityRef;
  }

  /**
   * Slide the fabric band along the limb axis (cuff-local Y, 0 = the built cuff site). Range
   * clamping is owned by the caller (interaction/partsController.ts derives it from the arm
   * segment). Moves the swell group, so swell/velcro/label ride along. Allocation-free.
   */
  setWrapSlide(y: number): void {
    const body = this.wrapBody;
    if (!body) return;
    this.wrapSlideY = y;
    const p = body.getLocalPosition();
    body.setLocalPosition(p.x, y, p.z);
    this.refreshHose();
    this.aabbDirty = true;
  }

  /** Current band slide offset (m) along the limb axis. */
  get wrapSlide(): number {
    return this.wrapSlideY;
  }

  /**
   * Rotate the band around the limb axis (deg; 0 = built orientation with the artery marker at
   * local +Z). Drives the orient-the-cuff exercise: the marker, Velcro, label, and the hose exit
   * all swing with it. Allocation-free; event-rate.
   */
  setWrapRotation(deg: number): void {
    const body = this.wrapBody;
    if (!body) return;
    this.wrapRotDeg = deg;
    body.setLocalEulerAngles(0, deg, 0);
    this.refreshHose();
    this.aabbDirty = true;
  }

  /** Current band rotation (deg) around the limb axis. */
  get wrapRotation(): number {
    return this.wrapRotDeg;
  }

  /** World AABB of the fabric band (for part picking). Reuses a private box; do not retain. */
  bandWorldAabb(): pc.BoundingBox | null {
    return unionAabb(this.bandMeshInstances, this.bandAabb);
  }

  /** World AABB of the device GLB (for part picking). Reuses a private box; do not retain. */
  deviceWorldAabb(): pc.BoundingBox | null {
    return unionAabb(this.deviceMeshInstances, this.deviceAabb);
  }

  /** World AABB of the cuff↔device hose (grabbable: drags the device unit). Null when absent. */
  hoseWorldAabb(): pc.BoundingBox | null {
    return unionAabb(this.hoseMeshInstancesList, this.hoseAabb);
  }

  /**
   * Re-lay the connecting hose after an endpoint moved (band slide does this itself; the parts
   * controller calls it after device drags). Event-rate only; transform updates, no allocation.
   */
  refreshHose(): void {
    this.updateHosePath();
  }

  /**
   * Build the cuff↔device coiled hose: fixed segment ENTITIES once; their transforms are laid along
   * a stretched helix between the band port and the device port by updateHosePath(). Composite +
   * arm-band mode only (the full-procedural fallback has its own tubing).
   */
  private buildConnectingHose(): void {
    if (!this.deviceEntityRef || !this.wrapIsBand || this.bandOuterRadius <= 0) return;
    const root = new pc.Entity('cuff-hose');
    this.root.addChild(root);
    this.hoseRoot = root;
    for (let i = 0; i < HOSE_SEGMENTS; i++) {
      const seg = this.makeMeshEntity(
        `hose-seg-${i}`,
        this.cylinderMesh(HOSE_TUBE_RADIUS, 1, 10),
        'stitching', // light-grey matte — matches the GLB's baked bulb coil
      );
      root.addChild(seg);
      this.hoseSegments.push(seg);
      const render = seg.render;
      if (render) for (const mi of render.meshInstances ?? []) this.hoseMeshInstancesList.push(mi);
    }
    this.updateHosePath();
  }

  /** Point on the stretched helix at fraction s ∈ [0,1] (writes `out`). Allocation-free. */
  private hosePointAt(s: number, length: number, out: pc.Vec3): void {
    // Coil radius ramps to 0 near the ports so the hose visually meets both ends.
    const ramp = Math.min(1, Math.min(s, 1 - s) / 0.08);
    const r = HOSE_COIL_RADIUS * ramp;
    const theta = s * HOSE_COIL_TURNS * Math.PI * 2;
    const c = Math.cos(theta) * r;
    const k = Math.sin(theta) * r;
    const d = length * s;
    out.set(
      this.hoseTmpA.x + this.hoseTmpT.x * d + this.hoseTmpSide.x * c + this.hoseTmpUp.x * k,
      this.hoseTmpA.y + this.hoseTmpT.y * d + this.hoseTmpSide.y * c + this.hoseTmpUp.y * k,
      this.hoseTmpA.z + this.hoseTmpT.z * d + this.hoseTmpSide.z * c + this.hoseTmpUp.z * k,
    );
  }

  /** Recompute all hose segment transforms between the current band/device ports. */
  private updateHosePath(): void {
    const device = this.deviceEntityRef;
    if (!this.hoseRoot || !device || this.hoseSegments.length === 0) return;

    // Band port (cuff-local): top rim of the band at the tubing-exit side (the marker face),
    // riding both the slide offset and the band's rotation around the limb.
    const rotRad = (this.wrapRotDeg * Math.PI) / 180;
    this.hoseTmpA.set(
      Math.sin(rotRad) * this.bandOuterRadius * 0.9,
      this.wrapSlideY + this.bandWidthAlong * 0.5,
      Math.cos(rotRad) * this.bandOuterRadius * 0.9,
    );
    // Device port (cuff-local): mesh-local port transformed by the device's local pose.
    this.hoseTmpB.set(HOSE_DEVICE_PORT_MESH.x, HOSE_DEVICE_PORT_MESH.y, HOSE_DEVICE_PORT_MESH.z);
    device.getLocalRotation().transformVector(this.hoseTmpB, this.hoseTmpB);
    this.hoseTmpB.add(device.getLocalPosition());

    // Chord frame: tangent + two perpendiculars for the helix plane.
    this.hoseTmpT.sub2(this.hoseTmpB, this.hoseTmpA);
    const length = this.hoseTmpT.length();
    if (length < 1e-4) return;
    this.hoseTmpT.mulScalar(1 / length);
    // side = tangent × worldY (fall back to X when near-vertical).
    this.hoseTmpSide.set(this.hoseTmpT.z, 0, -this.hoseTmpT.x);
    if (this.hoseTmpSide.lengthSq() < 1e-6) this.hoseTmpSide.set(1, 0, 0);
    this.hoseTmpSide.normalize();
    this.hoseTmpUp.cross(this.hoseTmpT, this.hoseTmpSide).normalize();

    const n = this.hoseSegments.length;
    for (let i = 0; i < n; i++) {
      this.hosePointAt(i / n, length, this.hoseTmpP0);
      this.hosePointAt((i + 1) / n, length, this.hoseTmpP1);
      const seg = this.hoseSegments[i];
      if (!seg) continue;
      this.hoseTmpDir.sub2(this.hoseTmpP1, this.hoseTmpP0);
      const segLen = this.hoseTmpDir.length();
      if (segLen < 1e-6) continue;
      this.hoseTmpDir.mulScalar(1 / segLen);
      // Orient the (Y-axis) cylinder along the segment direction.
      const dot = Math.max(-1, Math.min(1, this.hoseTmpDir.y)); // dot(Y, dir)
      this.hoseTmpAxis.set(this.hoseTmpDir.z, 0, -this.hoseTmpDir.x); // Y × dir
      if (this.hoseTmpAxis.lengthSq() < 1e-8) {
        this.hoseTmpAxis.set(1, 0, 0);
      } else {
        this.hoseTmpAxis.normalize();
      }
      this.hoseTmpQuat.setFromAxisAngle(this.hoseTmpAxis, (Math.acos(dot) * 180) / Math.PI);
      seg.setLocalRotation(this.hoseTmpQuat);
      seg.setLocalPosition(
        (this.hoseTmpP0.x + this.hoseTmpP1.x) * 0.5,
        (this.hoseTmpP0.y + this.hoseTmpP1.y) * 0.5,
        (this.hoseTmpP0.z + this.hoseTmpP1.z) * 0.5,
      );
      seg.setLocalScale(1, segLen * 1.15, 1); // slight overlap hides the joints
    }
    this.aabbDirty = true;
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
    entity.setLocalPosition(this.deviceLocalOffset.x, this.deviceLocalOffset.y, this.deviceLocalOffset.z);
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

    // The shipped GLB is one merged mesh (no tagged needle node), so a live procedural dial +
    // needle is overlaid on its screen panel instead — see buildGaugeOverlay.
    this.deviceEntityRef = entity;
    this.deviceMeshInstances.length = 0;
    for (const render of renders) {
      for (const mi of render.meshInstances ?? []) this.deviceMeshInstances.push(mi);
    }
    this.buildGaugeOverlay(entity);
    this.buildBulbOverlay(entity);
    return true;
  }

  /**
   * Procedural bulb ellipsoid overlaid on the device's baked bulb (see BULB_OVERLAY_* constants).
   * Built once at rest size (envelopes the static bulb); `setBulbInflation` scales it each time the
   * pressure changes. Build-time only.
   */
  private buildBulbOverlay(device: pc.Entity): void {
    const mat = createBulbMaterial();
    const sphere = pc.createSphere(this.device, { radius: 1, latitudeBands: 24, longitudeBands: 24 });
    const bulb = new pc.Entity('bulb-overlay');
    bulb.addComponent('render', { meshInstances: [new pc.MeshInstance(sphere, mat)] });
    bulb.setLocalPosition(BULB_OVERLAY_CENTER.x, BULB_OVERLAY_CENTER.y, BULB_OVERLAY_CENTER.z);
    bulb.setLocalScale(BULB_OVERLAY_REST_RADII.x, BULB_OVERLAY_REST_RADII.y, BULB_OVERLAY_REST_RADII.z);
    device.addChild(bulb);
    this.bulbNode = bulb;
  }

  /**
   * Scale the bulb overlay with the live inflation fraction [0,1]: it EXPANDS as the cuff is pumped
   * up and CONTRACTS as pressure is released. Rest radii envelope the baked bulb, so it only ever
   * grows from there (the static bulb stays hidden). Allocation-free; reuses a scratch. No-op in
   * full-procedural mode (no device GLB).
   */
  setBulbInflation(fraction: number): void {
    const bulb = this.bulbNode;
    if (!bulb) return;
    const f = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
    const s = 1 + BULB_OVERLAY_MAX_GROWTH * f;
    bulb.setLocalScale(
      BULB_OVERLAY_REST_RADII.x * s,
      BULB_OVERLAY_REST_RADII.y * s,
      BULB_OVERLAY_REST_RADII.z * s,
    );
    this.aabbDirty = true;
  }

  /**
   * Live aneroid dial overlaid on the device GLB's (static, baked) screen panel: procedural dial
   * face + bezel + needle, with the needle pivot exposed as `gaugeNeedle` so the EXISTING
   * GaugeController drives it in composite mode too (previously the composite gauge never moved).
   * The carrier orients the pivot so its local +Y is the panel normal (device +Z); the controller
   * spins the pivot about local Y across the dial sweep. Build-time only.
   */
  private buildGaugeOverlay(device: pc.Entity): void {
    // Mesh space: the panel lies in the XZ plane facing +Y, so the default cylinder/torus axis (+Y)
    // already matches the dial normal — no child rotations needed.
    const overlay = new pc.Entity('gauge-overlay');
    overlay.setLocalPosition(DEVICE_DIAL.x, DEVICE_DIAL.y, DEVICE_DIAL.z);
    device.addChild(overlay);

    const face = this.makeMeshEntity(
      'overlay-face',
      this.cylinderMesh(DEVICE_DIAL.radius, 0.0015, GAUGE_RADIAL_SEGMENTS),
      'gaugeFace',
    );
    overlay.addChild(face);

    const bezel = this.makeMeshEntity(
      'overlay-bezel',
      this.torusMesh(0.0035, DEVICE_DIAL.radius + 0.002, 360, GAUGE_RADIAL_SEGMENTS),
      'metalTrim',
    );
    bezel.setLocalPosition(0, 0.001, 0);
    overlay.addChild(bezel);

    // The pivot is what the gauge controller rotates (setLocalEulerAngles(0, angle, 0)). Two fixed
    // frames between overlay and pivot align the needle with the dial art AS RENDERED: the art
    // canvas lands mirrored on the cylinder cap. The 180° roll flips the pivot's sweep to match the
    // art's clockwise sense; the trim yaw aligns the zero tick. The dial face carries a +180° art
    // rotation (owner request; see textureSets.dialTexture), so the trim yaw carries the matching
    // +180° (90° → 270°) — the needle still lands on the correct number. Verified against renders at
    // 0 and 120 mmHg (needle on the "120"/systolic marker).
    const carrier = new pc.Entity('overlay-needle-carrier');
    carrier.setLocalPosition(0, 0.003, 0);
    carrier.setLocalEulerAngles(0, 0, 180);
    overlay.addChild(carrier);
    const trim = new pc.Entity('overlay-needle-trim');
    trim.setLocalEulerAngles(0, 270, 0);
    carrier.addChild(trim);
    const pivot = new pc.Entity('needle');
    trim.addChild(pivot);
    const needleMesh = this.makeMeshEntity(
      'overlay-needle-mesh',
      this.boxMesh(0.0028, 0.0012, DEVICE_DIAL.radius * 0.85),
      'needle',
    );
    // Local −y: the carrier's 180° roll mirrors it back above the face in overlay space.
    needleMesh.setLocalPosition(0, -0.0012, DEVICE_DIAL.radius * 0.33);
    pivot.addChild(needleMesh);
    this.needle = pivot;

    const hub = this.makeMeshEntity('overlay-hub', this.cylinderMesh(0.005, 0.004, 24), 'metalTrim');
    hub.setLocalPosition(0, 0.004, 0);
    overlay.addChild(hub);
  }

  /**
   * Procedural fabric arm wrap (body + Velcro + label), sized from the variant. In composite mode
   * `offset` lays it on the surface beside the real device; in full-procedural mode `offset` is null
   * so it sits at the origin alongside the procedural hardware. All units in meters.
   *
   * Two body styles share the SAME wrap node + swell pipeline (no second cuff is forked):
   *   - CURVED BAND (when `armWrapRadius` was set via `setArmWrap`): the fabric reads as a band
   *     hugging a limb of that radius, so tightening/swell reads as a cuff wrapping an arm.
   *   - FLAT SLAB (default / no arm): the original thin-box body, used in the full-procedural fallback
   *     and any preview where the cuff is laid out on a surface beside the device.
   */
  private buildCuffWrap(variant: CuffVariantSpec, offset: pc.Vec3 | null): void {
    // Always create a dedicated wrap node so the animator has a stable handle to drive (wrap/tighten/
    // position), in BOTH composite and full-procedural modes. At `offset` beside the device when
    // compositing; at the origin otherwise.
    const parent = new pc.Entity('cuff-wrap');
    if (offset) parent.setLocalPosition(offset.x, offset.y, offset.z);
    this.root.addChild(parent);
    this.wrapNode = parent;

    // The swell group ALWAYS wraps the fabric body pieces, so `setBladderSwell` can scale one node
    // regardless of body style. The Velcro/label ride along inside it.
    const bodyGroup = new pc.Entity('cuff-body');
    parent.addChild(bodyGroup);
    this.wrapBody = bodyGroup;

    if (this.armWrapRadius !== null) {
      this.wrapIsBand = true;
      this.buildCurvedBand(variant, bodyGroup, this.armWrapRadius);
    } else {
      this.wrapIsBand = false;
      this.buildFlatSlab(variant, bodyGroup);
    }

    this.wrapBodyBaseScale.copy(bodyGroup.getLocalScale());

    // Snapshot the band's mesh instances (build-time) so part picking can query its world AABB
    // without walking the hierarchy per frame.
    this.bandMeshInstances.length = 0;
    const renders = bodyGroup.findComponents('render') as pc.RenderComponent[];
    for (const render of renders) {
      for (const mi of render.meshInstances ?? []) this.bandMeshInstances.push(mi);
    }
  }

  /**
   * Original flat fabric slab + Velcro + label (full-procedural fallback / surface layout). Pieces are
   * added under `group` (the swell group). Local +Y is "up off the surface".
   */
  private buildFlatSlab(variant: CuffVariantSpec, group: pc.Entity): void {
    const b = variant.bladder;
    const body = this.makeMeshEntity('cuff-body-slab', this.boxMesh(b.width, b.thickness, b.height), 'fabric');
    body.setLocalPosition(0, b.thickness * 0.5, 0);
    group.addChild(body);
    this.collectHighlight(body);

    const velcro = this.makeMeshEntity(
      'velcro',
      this.boxMesh(b.width * 0.96, b.thickness * 0.4, b.height * 0.22),
      'velcroHook',
    );
    velcro.setLocalPosition(0, b.thickness + 0.001, b.height * 0.36);
    group.addChild(velcro);

    const label = this.makeMeshEntity(
      'label',
      this.boxMesh(b.width * 0.5, 0.0015, b.height * 0.3),
      'label',
    );
    label.setLocalPosition(0, b.thickness + 0.002, -b.height * 0.18);
    group.addChild(label);
  }

  /**
   * Curved fabric band hugging a limb of radius `armRadius`. The band wraps around the wrap node's
   * local +Y axis (the limb axis when mounted on an arm frame): the strip lies in the local XZ plane
   * and spans `b.width` ALONG the axis (limb-length direction = local Y) and an arc AROUND it.
   *
   * Geometry: a handful of thin flat "staves" placed tangent to the wrap circle approximate a smooth
   * curved band while reusing the flat fabric material (a few primitives, no custom mesh, no runtime
   * allocation). Velcro + label are short staves on the outer face. Allocation is build-time only.
   */
  private buildCurvedBand(variant: CuffVariantSpec, group: pc.Entity, armRadius: number): void {
    const b = variant.bladder;
    const bandWidth = b.width; // along the limb axis (local Y)
    const bandThickness = b.thickness; // radial fabric thickness
    const innerR = armRadius + CUFF_BAND_CLEARANCE;
    const midR = innerR + bandThickness * 0.5;

    // Number of staves + the total arc they cover. More staves = smoother; keep modest for perf.
    const staves = CUFF_BAND_STAVES;
    const arcRad = (CUFF_BAND_ARC_DEG * Math.PI) / 180;
    const start = -arcRad * 0.5;
    // Each stave is a chord; width so adjacent staves touch around the arc.
    const staveChord = 2 * midR * Math.tan(arcRad / (2 * staves)) * 1.02;

    for (let i = 0; i < staves; i++) {
      const a = start + (arcRad * (i + 0.5)) / staves;
      const sinA = Math.sin(a);
      const cosA = Math.cos(a);
      const stave = this.makeMeshEntity(
        `cuff-band-${i}`,
        // box: x = chord (around arc), y = bandWidth (along limb), z = radial thickness
        this.boxMesh(staveChord, bandWidth, bandThickness),
        'fabric',
      );
      // Place tangent to the circle at angle a in the XZ plane (limb axis = Y).
      stave.setLocalPosition(sinA * midR, 0, cosA * midR);
      // Rotate about Y so the box's thin (z) face points radially outward.
      stave.setLocalEulerAngles(0, (a * 180) / Math.PI, 0);
      group.addChild(stave);
      this.collectHighlight(stave);
    }

    // Velcro closure: a couple of staves on the OUTER face near the band's free end (top of arc).
    const outerR = innerR + bandThickness + 0.001;
    const velcroChord = staveChord * 0.96;
    for (let k = 0; k < 2; k++) {
      const a = start + arcRad * (k === 0 ? 0.06 : 0.16);
      const sinA = Math.sin(a);
      const cosA = Math.cos(a);
      const velcro = this.makeMeshEntity(
        `velcro-${k}`,
        this.boxMesh(velcroChord, bandWidth * 0.5, bandThickness * 0.35),
        'velcroHook',
      );
      velcro.setLocalPosition(sinA * outerR, 0, cosA * outerR);
      velcro.setLocalEulerAngles(0, (a * 180) / Math.PI, 0);
      group.addChild(velcro);
    }

    // Printed label patch on the outer face, centered on the arc.
    const label = this.makeMeshEntity(
      'label',
      this.boxMesh(staveChord * 1.1, bandWidth * 0.5, 0.0015),
      'label',
    );
    label.setLocalPosition(0, 0, outerR + 0.001);
    group.addChild(label);

    // Artery index marker: a small bright strip at the band's LOWER edge, arc-center (+Z). Teaching
    // affordance for the inspect/orient steps ("artery marker toward the brachial artery").
    // SME-REVIEW: the marker's position/orientation is illustrative, not a validated landmark
    // (TRAINING_LOGIC.md §7 items 10–11).
    const marker = this.makeMeshEntity(
      'artery-marker',
      this.boxMesh(staveChord * 0.35, bandWidth * 0.28, 0.0018),
      'arteryMarker',
    );
    marker.setLocalPosition(0, -bandWidth * 0.34, outerR + 0.0015);
    group.addChild(marker);

    // Remember band dimensions for the connecting hose's band-side port.
    this.bandOuterRadius = outerR;
    this.bandWidthAlong = bandWidth;
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

    // Bezel/face/needle/lens stack off the slab's top half, preserving the original layering gaps.
    const slabHalf = GAUGE_SLAB_THICKNESS * 0.5;
    const gaugeBody = this.makeMeshEntity(
      'gauge-body',
      this.cylinderMesh(0.03, GAUGE_SLAB_THICKNESS, GAUGE_RADIAL_SEGMENTS),
      'gaugeBody',
    );
    gaugeBody.setLocalEulerAngles(90, 0, 0);
    gauge.addChild(gaugeBody);

    const bezel = this.makeMeshEntity(
      'gauge-bezel',
      this.torusMesh(0.004, 0.03, 360, GAUGE_RADIAL_SEGMENTS),
      'metalTrim',
    );
    bezel.setLocalPosition(0, slabHalf, 0);
    bezel.setLocalEulerAngles(90, 0, 0);
    gauge.addChild(bezel);

    const face = this.makeMeshEntity(
      'gauge-face',
      this.cylinderMesh(0.028, 0.001, GAUGE_RADIAL_SEGMENTS),
      'gaugeFace',
    );
    face.setLocalPosition(0, slabHalf + 0.0005, 0);
    face.setLocalEulerAngles(90, 0, 0);
    gauge.addChild(face);

    // Needle: thin box pivoting at the gauge center. Parent node is what the gauge controller spins.
    const needlePivot = new pc.Entity('needle');
    needlePivot.setLocalPosition(0, slabHalf + 0.002, 0);
    gauge.addChild(needlePivot);
    const needleMesh = this.makeMeshEntity('needle-mesh', this.boxMesh(0.0015, 0.0008, 0.022), 'needle');
    needleMesh.setLocalPosition(0, 0, 0.009);
    needlePivot.addChild(needleMesh);
    this.needle = needlePivot;

    const lens = this.makeMeshEntity(
      'gauge-lens',
      this.cylinderMesh(0.028, 0.0008, GAUGE_RADIAL_SEGMENTS),
      'lens',
    );
    lens.setLocalPosition(0, slabHalf + 0.003, 0);
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

  /**
   * Suggest bladder inflation by swelling the fabric body about its base scale. `fraction` in [0,1]
   * (0 = resting, 1 = fully inflated). Allocation-free; reuses a scratch. Driven by the cuff animator
   * from the inflation pressure. No-op if the wrap body is absent.
   *
   * The swell AXIS depends on the body style so it reads correctly either way:
   *   - CURVED BAND: bulge RADIALLY (local X+Z) so the band visibly puffs outward around the limb,
   *     while the along-limb width (local Y) stays ~constant (training-plausible).
   *   - FLAT SLAB: bulge in THICKNESS (local Y), width/length barely change (original behaviour).
   */
  setBladderSwell(fraction: number): void {
    const body = this.wrapBody;
    if (!body) return;
    const f = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
    if (this.wrapIsBand) {
      // Radial puff up to +18% outward; small length change. (Less than the slab's +45% because the
      // band's whole radius scales, which is visually stronger.)
      const sRadial = 1 + 0.18 * f;
      const sAxial = 1 + 0.02 * f;
      tmp.vecA.set(
        this.wrapBodyBaseScale.x * sRadial,
        this.wrapBodyBaseScale.y * sAxial,
        this.wrapBodyBaseScale.z * sRadial,
      );
    } else {
      // Up to +45% thickness at full inflation; width/length barely change.
      const sy = 1 + 0.45 * f;
      const sxz = 1 + 0.03 * f;
      tmp.vecA.set(
        this.wrapBodyBaseScale.x * sxz,
        this.wrapBodyBaseScale.y * sy,
        this.wrapBodyBaseScale.z * sxz,
      );
    }
    body.setLocalScale(tmp.vecA.x, tmp.vecA.y, tmp.vecA.z);
    this.aabbDirty = true;
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

  private cylinderMesh(radius: number, height: number, capSegments = 20): pc.Mesh {
    return pc.createCylinder(this.device, { radius, height, capSegments });
  }

  private torusMesh(
    tubeRadius: number,
    ringRadius: number,
    sectorAngle: number,
    segments = 30,
  ): pc.Mesh {
    return pc.createTorus(this.device, { tubeRadius, ringRadius, sectorAngle, segments });
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

/** Blue rubber material for the procedural bulb overlay (matches the baked bulb's base colour). */
function createBulbMaterial(): pc.StandardMaterial {
  const m = new pc.StandardMaterial();
  m.diffuse.set(BULB_OVERLAY_COLOR.r, BULB_OVERLAY_COLOR.g, BULB_OVERLAY_COLOR.b);
  m.metalness = 0;
  m.useMetalness = true;
  m.gloss = 0.35;
  m.name = 'cuff:bulb-overlay';
  m.update();
  return m;
}

/** Union of mesh-instance world AABBs into `out` (reused). Returns null when the list is empty. */
function unionAabb(instances: readonly pc.MeshInstance[], out: pc.BoundingBox): pc.BoundingBox | null {
  let initialized = false;
  for (let i = 0; i < instances.length; i++) {
    const mi = instances[i];
    if (!mi) continue;
    if (!initialized) {
      out.copy(mi.aabb);
      initialized = true;
    } else {
      out.add(mi.aabb);
    }
  }
  return initialized ? out : null;
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
