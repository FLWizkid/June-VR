/**
 * Inspection controller (SPEC §5 fallback + §6 close-up).
 *
 * In the place/inspect layer (and on desktop), lets the user orbit and zoom the cuff for close
 * examination down to the 6–12 inch band. Also raises material anisotropy when the camera is within
 * the inspection band so close-up detail stays crisp regardless of quality tier.
 *
 * Input is abstracted: the controller exposes `orbit(dx, dy)` and `zoom(delta)` that the UI / pointer
 * / gaze map onto. Allocation-free per frame.
 */

import * as pc from 'playcanvas';
import { tmp, clamp } from '../utils/math';
import { INSPECTION_DISTANCE } from '../config/appConfig';
import { INSPECTION_RANGE_METERS } from '../utils/units';
import type { BloodPressureCuff } from '../entities/bloodPressureCuff';
import type { CuffMaterialLibrary } from '../materials/cuffMaterials';

/** Minimum orbit-camera height (m) above the floor plane (preview inspect only). */
const ORBIT_CAMERA_MIN_Y = 0.05;

export class InspectionController {
  private readonly cuff: BloodPressureCuff;
  private readonly materials: CuffMaterialLibrary;
  private readonly camera: pc.Entity;

  /** Spherical orbit state around the cuff. */
  private yaw = 0;
  private pitch = -10;
  private distance = INSPECTION_DISTANCE.default;

  /** Active only in the place/inspect (or desktop) layer. */
  private active = false;
  /** Base anisotropy from the current quality profile; inspection may exceed it. */
  private baseAnisotropy = 8;
  private inspectionBoostApplied = false;

  constructor(cuff: BloodPressureCuff, materials: CuffMaterialLibrary, camera: pc.Entity) {
    this.cuff = cuff;
    this.materials = materials;
    this.camera = camera;
  }

  setActive(active: boolean): void {
    this.active = active;
  }

  setBaseAnisotropy(anisotropy: number): void {
    this.baseAnisotropy = anisotropy;
    if (!this.inspectionBoostApplied) this.materials.setAnisotropy(anisotropy);
  }

  /** Orbit by pointer/gaze deltas (degrees). */
  orbit(deltaYawDeg: number, deltaPitchDeg: number): void {
    this.yaw += deltaYawDeg;
    this.pitch = clamp(this.pitch + deltaPitchDeg, -85, 85);
  }

  /** Zoom by a signed delta (meters); clamped to a safe inspection range. */
  zoom(deltaMeters: number): void {
    this.distance = clamp(this.distance + deltaMeters, INSPECTION_RANGE_METERS.near * 0.6, 1.2);
  }

  /** Smoothed orbit target: eases toward the cuff so part-drags read as the OBJECT moving. */
  private readonly targetSmoothed = new pc.Vec3();
  private targetSeeded = false;

  /**
   * Per-frame update. In desktop/inspect, positions the camera on the orbit sphere around the cuff.
   * In AR, the camera is driven by the headset pose, so we only manage the anisotropy boost based on
   * how close the headset is to the cuff. Allocation-free.
   *
   * @param arActive - True if an XR session is driving the camera (don't move the camera then).
   * @param dt - Delta seconds (for target smoothing).
   */
  update(arActive: boolean, dt: number): void {
    if (!arActive && this.active) {
      this.positionOrbitCamera(dt);
    }
    this.updateInspectionBoost();
  }

  private positionOrbitCamera(dt: number): void {
    // Ease the orbit target toward the cuff. When the user drags the assembly, an instantly
    // re-centering camera would cancel the motion on screen (object pinned, world sliding); the
    // lag lets the object visibly move, then the framing gently catches up.
    const actual = this.cuff.root.getPosition();
    if (!this.targetSeeded) {
      this.targetSmoothed.copy(actual);
      this.targetSeeded = true;
    } else {
      const alpha = 1 - Math.exp(-dt / 0.35);
      this.targetSmoothed.lerp(this.targetSmoothed, actual, alpha);
    }
    const target = this.targetSmoothed;
    const yawRad = (this.yaw * Math.PI) / 180;
    const pitchRad = (this.pitch * Math.PI) / 180;
    const cp = Math.cos(pitchRad);
    // Offset on a sphere of `distance` around the cuff.
    tmp.vecA.set(
      Math.sin(yawRad) * cp * this.distance,
      Math.sin(pitchRad) * this.distance,
      Math.cos(yawRad) * cp * this.distance,
    );
    tmp.vecB.add2(target, tmp.vecA);
    // Keep the orbit camera ABOVE the floor plane: with a low target and a long zoom, a negative
    // pitch can dip the eye under y=0, where the preview floor/grid renders as garbage (a grazing
    // grid line reads as a giant dark wedge). Same floor rule as content placement.
    if (tmp.vecB.y < ORBIT_CAMERA_MIN_Y) tmp.vecB.y = ORBIT_CAMERA_MIN_Y;
    this.camera.setPosition(tmp.vecB);
    this.camera.lookAt(target.x, target.y, target.z);
  }

  /**
   * Raise anisotropy when the camera is within the close-up band, restore otherwise. Avoids constant
   * material updates by tracking a boolean edge.
   */
  private updateInspectionBoost(): void {
    const camPos = this.camera.getPosition();
    const target = this.cuff.root.getPosition();
    tmp.vecA.copy(camPos);
    tmp.vecB.copy(target);
    const dist = tmp.vecA.distance(tmp.vecB);

    const inBand = dist <= INSPECTION_RANGE_METERS.far * 1.2;
    if (inBand && !this.inspectionBoostApplied) {
      this.inspectionBoostApplied = true;
      this.materials.setAnisotropy(Math.max(this.baseAnisotropy, 16));
    } else if (!inBand && this.inspectionBoostApplied) {
      this.inspectionBoostApplied = false;
      this.materials.setAnisotropy(this.baseAnisotropy);
    }
  }
}
