/**
 * Procedural patient arm (the key optional FOREGROUND training asset).
 *
 * This is the target the trainee wraps the cuff onto. Two build paths behind one interface:
 *   - REAL MODEL: when `assets/models/patient_arm.glb` is present it is loaded (via
 *     AssetRegistry.loadContainer) and used as-is. Drop a real arm/manikin mesh there and it
 *     replaces the procedural stand-in with no other code change.
 *   - PROCEDURAL (default, no assets): a plausible upper-arm + elbow + forearm + hand built once from
 *     tapered cones/spheres with a single matte skin-tone PBR material (no game-gloss). Pose +
 *     dimensions come from `ARM_POSE` in config/trainingConfig.ts.
 *
 * CRITICAL — this is FOREGROUND content and IS shown in AR (unlike `environmentRoot`, which is hidden
 * in AR). It is the physical thing the cuff goes on. `setVisible(false)` lets sites that use a real
 * manikin/arm hide it.
 *
 * SME-REVIEW: anatomy/dimensions and the relaxed rest pose are teaching affordances, NOT
 * anthropometrically validated and NOT asserted as the clinically-correct measurement posture (arm
 * supported at heart level, palm up). See config/trainingConfig.ts `ARM_POSE` + TRAINING_LOGIC.md §7.
 *
 * Allocation discipline: geometry/materials/frames are built ONCE. No per-frame work happens here.
 *
 * Verified APIs (playcanvas@2.19): pc.Entity, createCone(baseRadius/peakRadius/height), createSphere,
 * createBox, MeshInstance, RenderComponent, ContainerResource.instantiateRenderEntity (via
 * AssetRegistry.loadContainer).
 */

import * as pc from 'playcanvas';
import { createPbrMaterial } from '../core/materialFactory';
import type { AssetRegistry } from '../core/assetRegistry';
import { ARM_POSE, CUFF_ON_ARM } from '../config/trainingConfig';
import { createLogger } from '../utils/logging';

const log = createLogger('patient-arm');

/**
 * Documented seam path for a real patient-arm/manikin GLB. None ships in v1.
 * TODO(real-assets): drop a real arm mesh here (meters; +Y up / −Z forward) and it loads + replaces
 * the procedural stand-in automatically.
 */
const ARM_MODEL_URL = 'assets/models/patient_arm.glb';

/**
 * Matte skin tone (linear-ish). Deliberately desaturated + high-roughness so it never reads as
 * glossy "game" plastic on the additive see-through display (CLAUDE.md rule 2).
 * SME-REVIEW (cosmetic): a single neutral mid skin tone; real training may want selectable tones.
 */
const SKIN_DIFFUSE = new pc.Color(0.76, 0.6, 0.52);

/**
 * A placement frame: a world-space position + the local arm-axis direction at that point, so the
 * cuff can be positioned/oriented onto the limb. `axis` is unit-length and points along the limb
 * (shoulder→wrist). Both are owned, stable references (built once) — callers may read but not retain
 * across an arm rebuild.
 */
export interface ArmFrame {
  /** The node whose world transform IS the frame (its +Y points along the limb segment). */
  readonly node: pc.Entity;
  /** Approximate limb radius (m) at the frame center, for snug cuff-band sizing. */
  readonly radiusM: number;
}

export class PatientArm {
  /** Root entity; parent this under the world root (independent of the cuff). */
  readonly root: pc.Entity;

  private readonly device: pc.GraphicsDevice;
  private readonly assets: AssetRegistry;

  /** True once a real arm GLB loaded (vs the procedural stand-in). */
  private usingRealModel = false;
  private visible = true;

  /** The pivot the procedural geometry hangs under (so a real GLB can replace it cleanly). */
  private readonly limbRoot: pc.Entity;

  /**
   * Frame on the UPPER ARM where the cuff is clinically placed (~2–3 cm above the elbow crease). Its
   * local +Y axis runs along the upper-arm segment. This is the frame the training scene mounts the
   * cuff onto. Built once.
   */
  private readonly upperArmFrameNode: pc.Entity;
  private upperArmRadius: number = ARM_POSE.upperArm.radiusBottom;

  /**
   * Frame on the FOREARM (requested by the task seam). Exposed for completeness/alternative
   * placements; the default cuff placement uses the upper-arm frame (clinically correct site).
   */
  private readonly forearmFrameNode: pc.Entity;
  private forearmRadius: number = ARM_POSE.forearm.radiusBottom;

  private skinMaterial: pc.StandardMaterial | null = null;

  constructor(device: pc.GraphicsDevice, assets: AssetRegistry) {
    this.device = device;
    this.assets = assets;
    this.root = new pc.Entity('patient-arm');
    this.limbRoot = new pc.Entity('patient-arm-limb');
    this.root.addChild(this.limbRoot);
    this.upperArmFrameNode = new pc.Entity('cuff-site-upper-arm');
    this.forearmFrameNode = new pc.Entity('cuff-site-forearm');
    // Frames live under the limb root so they move with the limb (real or procedural).
    this.limbRoot.addChild(this.upperArmFrameNode);
    this.limbRoot.addChild(this.forearmFrameNode);
  }

  /** True if a real arm GLB was loaded (informational / status / README). */
  get isRealModel(): boolean {
    return this.usingRealModel;
  }

  /**
   * The cuff placement frame on the upper arm (the clinically-correct site). Read its world
   * transform to place the cuff; its +Y runs along the limb.
   */
  get cuffFrame(): ArmFrame {
    return { node: this.upperArmFrameNode, radiusM: this.upperArmRadius };
  }

  /** The forearm placement frame (alternative seam). */
  get forearmFrame(): ArmFrame {
    return { node: this.forearmFrameNode, radiusM: this.forearmRadius };
  }

  /**
   * Build the arm: try the real GLB seam, else the procedural stand-in. Await before use.
   * Never throws — a missing/failed arm never blocks startup (the cuff still works without it).
   */
  async build(): Promise<void> {
    // Apply the configured root pose (same for either build path).
    this.root.setLocalPosition(ARM_POSE.rootPosition.x, ARM_POSE.rootPosition.y, ARM_POSE.rootPosition.z);
    this.root.setLocalEulerAngles(ARM_POSE.rootEulerDeg.x, ARM_POSE.rootEulerDeg.y, ARM_POSE.rootEulerDeg.z);

    const model = await this.assets.loadContainer(ARM_MODEL_URL, 'patient-arm-model');
    if (model) {
      this.limbRoot.addChild(model);
      this.usingRealModel = true;
      // A real mesh defines its own anatomy; keep the configured frames as best-effort sites. A
      // delivered arm should tag landmark nodes; until then the frames stay at the configured pose.
      this.placeFramesProcedural();
      log.info('patient arm GLB loaded');
      return;
    }
    log.debug('no patient arm GLB; building procedural stand-in (shown in AR)');
    this.buildProcedural();
  }

  /**
   * Procedural upper-arm + elbow + forearm + hand. The whole limb is laid out in the limb root's
   * local space: shoulder at the origin, the upper arm running down −Y, a flexed forearm, then a
   * hand stand-in. Built once; no per-frame work.
   */
  private buildProcedural(): void {
    const mat = this.getSkinMaterial();
    const ua = ARM_POSE.upperArm;
    const fa = ARM_POSE.forearm;

    // Upper arm: a tapered cone with its axis along Y. createCone is centered at origin with height
    // along +Y; we want it to hang DOWN from the shoulder (origin), so center it at -length/2 and
    // flip so the wider end (radiusTop) is at the shoulder (top).
    const upperArm = this.makeCone('upper-arm', ua.radiusTop, ua.radiusBottom, ua.length, mat);
    // Cone peak (peakRadius) is +Y; we passed base=radiusTop(shoulder), peak=radiusBottom(elbow),
    // so rotate 180° about X to put the wider shoulder end up, then drop by half-length.
    upperArm.setLocalEulerAngles(180, 0, 0);
    upperArm.setLocalPosition(0, -ua.length * 0.5, 0);
    this.limbRoot.addChild(upperArm);

    // Elbow joint: a sphere at the bottom of the upper arm.
    const elbowY = -ua.length;
    const elbow = this.makeSphere('elbow', ua.radiusBottom * 1.05, mat);
    elbow.setLocalPosition(0, elbowY, 0);
    this.limbRoot.addChild(elbow);

    // Forearm: parented to an elbow pivot so we can flex it forward (−Z) by the configured angle.
    const forearmPivot = new pc.Entity('forearm-pivot');
    forearmPivot.setLocalPosition(0, elbowY, 0);
    forearmPivot.setLocalEulerAngles(-ARM_POSE.elbowFlexionDeg, 0, 0);
    this.limbRoot.addChild(forearmPivot);

    const forearm = this.makeCone('forearm', fa.radiusTop, fa.radiusBottom, fa.length, mat);
    forearm.setLocalEulerAngles(180, 0, 0);
    forearm.setLocalPosition(0, -fa.length * 0.5, 0);
    forearmPivot.addChild(forearm);

    // Hand stand-in: a short rounded block at the wrist.
    const wristY = -fa.length;
    const hand = this.makeBox(
      'hand',
      fa.radiusBottom * 1.7,
      ARM_POSE.handLength,
      fa.radiusBottom * 0.9,
      mat,
    );
    hand.setLocalPosition(0, wristY - ARM_POSE.handLength * 0.5, 0);
    forearmPivot.addChild(hand);

    this.placeFramesProcedural(forearmPivot);
    this.upperArmRadius = lerp(ua.radiusTop, ua.radiusBottom, CUFF_ON_ARM.alongUpperArm01);
    this.forearmRadius = fa.radiusTop;
  }

  /**
   * Position the cuff-site frames along the limb. The upper-arm frame sits at the configured fraction
   * down the upper-arm segment (origin→ −Y), with +Y along the limb so a cuff oriented to the frame
   * wraps around the limb axis. The forearm frame sits on the (optionally flexed) forearm.
   */
  private placeFramesProcedural(forearmPivot?: pc.Entity): void {
    const ua = ARM_POSE.upperArm;
    const f = CUFF_ON_ARM.alongUpperArm01;
    // Upper-arm frame: along −Y from the shoulder. Keep +Y as the limb axis (so band wraps in XZ).
    this.upperArmFrameNode.setLocalPosition(0, -ua.length * f, 0);
    this.upperArmFrameNode.setLocalEulerAngles(0, 0, 0);

    // Forearm frame: reparent under the flexed pivot if we have one, else approximate in limb space.
    const fa = ARM_POSE.forearm;
    if (forearmPivot && this.forearmFrameNode.parent !== forearmPivot) {
      this.forearmFrameNode.parent?.removeChild(this.forearmFrameNode);
      forearmPivot.addChild(this.forearmFrameNode);
    }
    this.forearmFrameNode.setLocalPosition(0, -fa.length * 0.5, 0);
    this.forearmFrameNode.setLocalEulerAngles(0, 0, 0);
  }

  /** Show/hide the whole arm (sites with a real manikin/arm hide it). */
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.root.enabled = visible;
  }

  /** Whether the arm is currently shown. */
  get isVisible(): boolean {
    return this.visible;
  }

  // --- helpers (build-time only) ---

  private getSkinMaterial(): pc.StandardMaterial {
    if (!this.skinMaterial) {
      this.skinMaterial = createPbrMaterial({
        diffuse: SKIN_DIFFUSE,
        metalness: 0,
        roughness: 0.85, // matte skin; no specular sheen
      });
    }
    return this.skinMaterial;
  }

  private makeCone(
    name: string,
    baseRadius: number,
    peakRadius: number,
    height: number,
    mat: pc.StandardMaterial,
  ): pc.Entity {
    const e = new pc.Entity(name);
    const mesh = pc.createCone(this.device, { baseRadius, peakRadius, height, capSegments: 24 });
    e.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, mat)] });
    return e;
  }

  private makeSphere(name: string, radius: number, mat: pc.StandardMaterial): pc.Entity {
    const e = new pc.Entity(name);
    const mesh = pc.createSphere(this.device, { radius });
    e.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, mat)] });
    return e;
  }

  private makeBox(
    name: string,
    x: number,
    y: number,
    z: number,
    mat: pc.StandardMaterial,
  ): pc.Entity {
    const e = new pc.Entity(name);
    const mesh = pc.createBox(this.device, { halfExtents: new pc.Vec3(x * 0.5, y * 0.5, z * 0.5) });
    e.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, mat)] });
    return e;
  }

  dispose(): void {
    this.root.destroy();
  }
}

/** Linear interpolation (local helper; not in a hot path). */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
