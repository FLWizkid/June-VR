/**
 * Per-part interaction controller (movement + pump/valve actions on the composed cuff-on-arm).
 *
 * Parts and their semantics (everything CONNECTED stays connected):
 *   - ARM / anything else on the assembly → moves the WHOLE assembly (arm + band + device travel
 *     together; they are one connected apparatus under the cuff root).
 *   - BAND (fabric cuff) → SLIDES along the limb axis only, clamped to the upper-arm segment, so
 *     the cuff repositions on the arm without ever detaching from it.
 *   - DEVICE / HOSE / BULB → moves the gauge+hose+bulb unit. The shipped device GLB is ONE merged
 *     mesh, so these always travel together (hose stays attached to gauge and bulb by construction);
 *     a leash keeps the unit near the cuff (the connecting tube is implied, as elsewhere).
 *   - BULB quick-press (click / quick pinch) → one pump squeeze (inflates the cuff).
 *   - GAUGE SCREEN quick-press → cycles the release valve (closed → controlled → open).
 *
 * Two input paths share the same classification + drag logic:
 *   - POINTER (desktop/phone preview): screen-ray picking via CameraComponent.screenToWorld.
 *   - HAND PINCH: proximity classification of the pinch point; quick pinches act as presses.
 *
 * The bulb/screen sub-regions are DEVICE-LOCAL boxes/spheres measured from the GLB bounds
 * (entities/bloodPressureCuff.ts) because the merged mesh has no per-part nodes to query.
 *
 * Allocation discipline: rays/planes/boxes are pre-allocated; per-event math uses the shared
 * scratch pool. Picking runs at input-event rate, never per frame.
 */

import * as pc from 'playcanvas';
import { tmp, clamp } from '../utils/math';
import { ARM_POSE, CUFF_ON_ARM } from '../config/trainingConfig';
import { getVariant } from '../entities/cuffVariants';
import {
  BloodPressureCuff,
  DEVICE_BULB_REGION,
  DEVICE_SCREEN_REGION,
} from '../entities/bloodPressureCuff';
import type { CuffAnimator } from '../animation/cuffAnimator';
import type { InflationController, ValveState } from './inflationController';

export const enum CuffPart {
  Assembly = 'assembly',
  Band = 'band',
  Device = 'device',
  Bulb = 'bulb',
  Screen = 'screen',
}

/** Press vs drag classification: shorter+stiller than this is a press. */
const PRESS_MAX_SECONDS = 0.35;
const PRESS_MAX_MOVE_M = 0.012;
/** Leash radius (m) keeping the device unit near the cuff (tube implied). */
const DEVICE_LEASH_M = 0.6;
/** Keep dragged parts above the floor plane (matches placementController's clamp). */
const FLOOR_Y = 0.01;
/** Band slide margins (m) from the elbow/shoulder ends of the upper-arm segment. */
const BAND_MARGIN_ELBOW = 0.005;
const BAND_MARGIN_SHOULDER = 0.015;
/**
 * Band-drag TIGHTEN gesture: the drag component perpendicular to the limb axis (pulling the strap
 * around the arm) adjusts snugness. Full range over this many meters of sideways drag.
 */
const TIGHTEN_FULL_RANGE_M = 0.22;

export class PartsController {
  private readonly cuff: BloodPressureCuff;
  private readonly camera: pc.Entity;
  private readonly inflation: InflationController;
  private readonly animator: CuffAnimator;
  /** Fired when a press changes the valve (so UI can reflect the new state). */
  private onValveChange: ((state: ValveState) => void) | null = null;
  /** Fired when an assembly drag ends (cuff scene re-runs the floor clamp). */
  private onAssemblyDropped: (() => void) | null = null;

  // --- pre-allocated interaction state (no per-event allocation) ---
  private readonly ray = new pc.Ray();
  private readonly hitPoint = new pc.Vec3();
  private readonly planePoint = new pc.Vec3();
  private readonly planeNormal = new pc.Vec3();
  private readonly startPoint = new pc.Vec3();
  private readonly startRootPos = new pc.Vec3();
  private readonly startDeviceLocal = new pc.Vec3();
  private readonly invWorld = new pc.Mat4();

  private clock = 0;
  private activePart: CuffPart | null = null;
  private pressStartClock = 0;
  private pressCandidate = false;
  private startSlide = 0;
  private startTighten = 0;
  /** True when the current gesture came from the hand path (point-driven, no ray). */
  private handGesture = false;

  constructor(
    cuff: BloodPressureCuff,
    camera: pc.Entity,
    inflation: InflationController,
    animator: CuffAnimator,
  ) {
    this.cuff = cuff;
    this.camera = camera;
    this.inflation = inflation;
    this.animator = animator;
  }

  setOnValveChange(cb: (state: ValveState) => void): void {
    this.onValveChange = cb;
  }

  setOnAssemblyDropped(cb: () => void): void {
    this.onAssemblyDropped = cb;
  }

  /** Part currently being interacted with (null when idle). */
  get part(): CuffPart | null {
    return this.activePart;
  }

  /** Per-frame tick: advances the press-timing clock only. Allocation-free. */
  update(dt: number): void {
    this.clock += dt;
  }

  // ------------------------------------------------------------------ pointer (screen ray) path

  /**
   * Begin a pointer interaction. Returns true when a part was picked (the caller should suppress
   * camera orbit for this drag); false leaves the gesture to the orbit controls.
   */
  pointerDown(screenX: number, screenY: number): boolean {
    if (this.activePart) return true;
    if (!this.buildRay(screenX, screenY)) return false;
    const part = this.pickAlongRay();
    if (!part) return false;
    this.beginGesture(part, this.hitPoint, false);
    return true;
  }

  pointerMove(screenX: number, screenY: number): void {
    if (!this.activePart || this.handGesture) return;
    if (!this.buildRay(screenX, screenY)) return;
    if (!this.intersectDragPlane(tmp.vecE)) return;
    this.applyDrag(tmp.vecE);
  }

  pointerUp(): void {
    if (!this.activePart || this.handGesture) return;
    this.endGesture();
  }

  // ------------------------------------------------------------------ hand (pinch point) path

  /**
   * Drive interactions from a hand pinch. Call every hands-layer frame. Returns true while this
   * controller owns the gesture (the caller must then skip the whole-assembly grab); false hands
   * the gesture to the default grab (which moves the whole assembly — the ARM semantics).
   */
  updateFromPoint(active: boolean, point: pc.Vec3 | null, _dt: number): boolean {
    // NOTE: the press clock is advanced by update(dt), which CuffScene ticks once per frame.
    if (!active || !point) {
      if (this.activePart && this.handGesture) this.endGesture();
      return false;
    }
    if (this.activePart) {
      if (this.handGesture) this.applyDrag(point);
      return this.handGesture;
    }
    const part = this.classifyPoint(point);
    // Assembly grabs stay with the default grab controller (momentum + smoothing preserved).
    if (!part || part === CuffPart.Assembly) return false;
    this.beginGesture(part, point, true);
    return true;
  }

  // ------------------------------------------------------------------ gesture lifecycle

  private beginGesture(part: CuffPart, point: pc.Vec3, fromHand: boolean): void {
    this.activePart = part;
    this.handGesture = fromHand;
    this.pressCandidate = part === CuffPart.Bulb || part === CuffPart.Screen;
    this.pressStartClock = this.clock;
    this.startPoint.copy(point);
    this.planePoint.copy(point);
    this.planeNormal.copy(this.camera.forward).normalize();
    this.startRootPos.copy(this.cuff.root.getPosition());
    this.startSlide = this.cuff.wrapSlide;
    this.startTighten = this.animator.tightenAmount;
    const device = this.cuff.deviceEntity;
    if (device) this.startDeviceLocal.copy(device.getLocalPosition());
  }

  private applyDrag(point: pc.Vec3): void {
    // A press candidate that moves becomes a drag of the device unit.
    if (this.pressCandidate && point.distance(this.startPoint) > PRESS_MAX_MOVE_M) {
      this.pressCandidate = false;
      if (this.activePart === CuffPart.Bulb || this.activePart === CuffPart.Screen) {
        this.activePart = CuffPart.Device;
      }
    }

    switch (this.activePart) {
      case CuffPart.Assembly:
        this.dragAssembly(point);
        break;
      case CuffPart.Band:
        this.dragBand(point);
        break;
      case CuffPart.Device:
        this.dragDevice(point);
        break;
      default:
        break; // bulb/screen press candidates don't move anything until reclassified
    }
  }

  private endGesture(): void {
    const part = this.activePart;
    const quick = this.clock - this.pressStartClock <= PRESS_MAX_SECONDS;
    if (this.pressCandidate && quick) {
      if (part === CuffPart.Bulb) {
        this.inflation.pumpSqueeze();
        if (this.onValveChange) this.onValveChange(this.inflation.valveState);
      } else if (part === CuffPart.Screen) {
        const state = this.inflation.cycleValve();
        if (this.onValveChange) this.onValveChange(state);
      }
    }
    if (part === CuffPart.Assembly && this.onAssemblyDropped) this.onAssemblyDropped();
    this.activePart = null;
    this.pressCandidate = false;
    this.handGesture = false;
  }

  /** Cancel any gesture without firing actions (e.g. layer switch / session change). */
  reset(): void {
    this.activePart = null;
    this.pressCandidate = false;
    this.handGesture = false;
  }

  // ------------------------------------------------------------------ drag semantics

  /** Whole assembly: translate the cuff root by the pointer's in-plane world delta. */
  private dragAssembly(point: pc.Vec3): void {
    tmp.vecA.sub2(point, this.startPoint);
    tmp.vecB.add2(this.startRootPos, tmp.vecA);
    if (tmp.vecB.y < FLOOR_Y) tmp.vecB.y = FLOOR_Y; // coarse; exact clamp re-runs on drop
    this.cuff.root.setPosition(tmp.vecB);
    this.cuff.invalidateAabb();
  }

  /**
   * Band: decompose the drag against the limb axis. The ALONG-limb component slides the band within
   * the upper-arm segment; the PERPENDICULAR (sideways, "pull the strap around the arm") component
   * adjusts snugness/tightness — this is how the trainee satisfies the confirm-fit step.
   */
  private dragBand(point: pc.Vec3): void {
    // Limb axis = cuff-root local +Y in world space.
    this.cuff.root.getWorldTransform().getY(tmp.vecA);
    tmp.vecA.normalize();
    tmp.vecB.sub2(point, this.startPoint);
    const along = tmp.vecB.dot(tmp.vecA);

    const f = CUFF_ON_ARM.alongUpperArm01;
    const len = ARM_POSE.upperArm.length;
    const half = getVariant(this.cuff.currentSize).bladder.width * 0.5;
    let min = -(1 - f) * len + half + BAND_MARGIN_ELBOW;
    let max = f * len - half - BAND_MARGIN_SHOULDER;
    if (min > max) min = max = 0; // band wider than the segment: pin at the built site

    this.cuff.setWrapSlide(clamp(this.startSlide + along, min, max));

    // Tighten: signed sideways component (limbAxis × cameraForward gives the screen-horizontal
    // tangent). Drag right = tighter, left = looser.
    tmp.vecC.cross(tmp.vecA, this.planeNormal);
    if (tmp.vecC.lengthSq() > 1e-6) {
      tmp.vecC.normalize();
      const sideways = tmp.vecB.dot(tmp.vecC);
      this.animator.setTightenTarget(clamp(this.startTighten + sideways / TIGHTEN_FULL_RANGE_M, 0, 1));
    }
  }

  /** Device unit: translate its cuff-local offset by the drag delta, leashed + floor-clamped. */
  private dragDevice(point: pc.Vec3): void {
    const device = this.cuff.deviceEntity;
    if (!device) return;

    tmp.vecA.sub2(point, this.startPoint); // world delta
    tmp.quatA.copy(this.cuff.root.getRotation()).invert();
    tmp.quatA.transformVector(tmp.vecA, tmp.vecB); // delta in cuff-local space
    tmp.vecC.add2(this.startDeviceLocal, tmp.vecB);

    // Leash: keep the unit within reach of the cuff (the connecting tube is implied).
    const dist = tmp.vecC.length();
    if (dist > DEVICE_LEASH_M) tmp.vecC.mulScalar(DEVICE_LEASH_M / dist);

    device.setLocalPosition(tmp.vecC);

    // Keep the unit's base above the floor: measure in world, correct along world-up in local.
    const world = device.getPosition();
    if (world.y < FLOOR_Y) {
      tmp.vecD.set(0, FLOOR_Y - world.y, 0);
      tmp.quatA.transformVector(tmp.vecD, tmp.vecE); // world-up correction in cuff-local space
      tmp.vecC.add(tmp.vecE);
      device.setLocalPosition(tmp.vecC);
    }
    // The connecting hose is anchored to the device — re-lay it for the new pose (event-rate).
    this.cuff.refreshHose();
    this.cuff.invalidateAabb();
  }

  // ------------------------------------------------------------------ picking

  /** Build a world ray through the screen point. False if no camera component. */
  private buildRay(screenX: number, screenY: number): boolean {
    const cam = this.camera.camera;
    if (!cam) return false;
    cam.screenToWorld(screenX, screenY, cam.nearClip, this.ray.origin);
    cam.screenToWorld(screenX, screenY, cam.farClip, tmp.vecA);
    this.ray.direction.sub2(tmp.vecA, this.ray.origin).normalize();
    return true;
  }

  /**
   * Pick the part under `this.ray`, most-specific first: bulb / screen (device-local regions),
   * then band, then the rest of the device, then anything on the assembly. Fills `hitPoint`.
   */
  private pickAlongRay(): CuffPart | null {
    const device = this.cuff.deviceEntity;
    if (device && this.rayHitsDeviceRegion(device)) {
      // hitPoint + specific part were set by the region test.
      return this.regionPart;
    }
    const band = this.cuff.bandWorldAabb();
    if (band && band.intersectsRay(this.ray, this.hitPoint)) return CuffPart.Band;
    const deviceBox = this.cuff.deviceWorldAabb();
    if (deviceBox && deviceBox.intersectsRay(this.ray, this.hitPoint)) return CuffPart.Device;
    // The connecting hose is grabbable and drags the device unit (it is plumbed into it).
    const hoseBox = this.cuff.hoseWorldAabb();
    if (hoseBox && hoseBox.intersectsRay(this.ray, this.hitPoint)) return CuffPart.Device;
    const whole = this.cuff.worldAabb();
    if (whole.intersectsRay(this.ray, this.hitPoint)) return CuffPart.Assembly;
    return null;
  }

  private regionPart: CuffPart = CuffPart.Device;

  /** Test the ray against the bulb sphere / screen box in DEVICE-LOCAL space. */
  private rayHitsDeviceRegion(device: pc.Entity): boolean {
    // Transform the ray into device-local space (reused matrix; event-rate only).
    this.invWorld.copy(device.getWorldTransform()).invert();
    this.invWorld.transformPoint(this.ray.origin, tmp.vecA); // local origin
    this.invWorld.transformVector(this.ray.direction, tmp.vecB).normalize(); // local dir

    // Bulb: ray vs sphere.
    tmp.vecC.set(DEVICE_BULB_REGION.x, DEVICE_BULB_REGION.y, DEVICE_BULB_REGION.z);
    tmp.vecD.sub2(tmp.vecC, tmp.vecA);
    const t = tmp.vecD.dot(tmp.vecB);
    if (t > 0) {
      tmp.vecE.copy(tmp.vecB).mulScalar(t).add(tmp.vecA); // closest point on ray
      if (tmp.vecE.distance(tmp.vecC) <= DEVICE_BULB_REGION.radius) {
        device.getWorldTransform().transformPoint(tmp.vecE, this.hitPoint);
        this.regionPart = CuffPart.Bulb;
        return true;
      }
    }

    // Screen: analytic ray-vs-box (slab method) in device-local space.
    const r = DEVICE_SCREEN_REGION;
    const tHit = rayBoxEntry(tmp.vecA, tmp.vecB, r.min, r.max);
    if (tHit >= 0) {
      tmp.vecE.copy(tmp.vecB).mulScalar(tHit).add(tmp.vecA);
      device.getWorldTransform().transformPoint(tmp.vecE, this.hitPoint);
      this.regionPart = CuffPart.Screen;
      return true;
    }
    return false;
  }

  /** Classify a hand pinch point by proximity (world space). Null → not on any part. */
  private classifyPoint(point: pc.Vec3): CuffPart | null {
    const device = this.cuff.deviceEntity;
    if (device) {
      this.invWorld.copy(device.getWorldTransform()).invert();
      this.invWorld.transformPoint(point, tmp.vecA);
      tmp.vecB.set(DEVICE_BULB_REGION.x, DEVICE_BULB_REGION.y, DEVICE_BULB_REGION.z);
      if (tmp.vecA.distance(tmp.vecB) <= DEVICE_BULB_REGION.radius * 1.3) return CuffPart.Bulb;
      const r = DEVICE_SCREEN_REGION;
      const m = 0.03; // pinch slop
      if (
        tmp.vecA.x >= r.min.x - m && tmp.vecA.x <= r.max.x + m &&
        tmp.vecA.y >= r.min.y - m && tmp.vecA.y <= r.max.y + m &&
        tmp.vecA.z >= r.min.z - m && tmp.vecA.z <= r.max.z + m
      ) {
        return CuffPart.Screen;
      }
    }
    const band = this.cuff.bandWorldAabb();
    if (band && containsWithMargin(band, point, 0.02)) return CuffPart.Band;
    const deviceBox = this.cuff.deviceWorldAabb();
    if (deviceBox && containsWithMargin(deviceBox, point, 0.02)) return CuffPart.Device;
    const hoseBox = this.cuff.hoseWorldAabb();
    if (hoseBox && containsWithMargin(hoseBox, point, 0.02)) return CuffPart.Device;
    return null; // assembly / empty space → default whole grab
  }

  /** Intersect the current ray with the drag plane (through grab point, facing the camera). */
  private intersectDragPlane(out: pc.Vec3): boolean {
    const denom = this.ray.direction.dot(this.planeNormal);
    if (Math.abs(denom) < 1e-5) return false;
    tmp.vecC.sub2(this.planePoint, this.ray.origin);
    const t = tmp.vecC.dot(this.planeNormal) / denom;
    if (t <= 0) return false;
    out.copy(this.ray.direction).mulScalar(t).add(this.ray.origin);
    return true;
  }
}

/**
 * Ray-vs-box slab intersection. Returns the entry distance along the (normalized) direction, or −1
 * when the ray misses. Axis-aligned box given by min/max plain objects. Allocation-free.
 */
function rayBoxEntry(
  origin: pc.Vec3,
  dir: pc.Vec3,
  min: { x: number; y: number; z: number },
  max: { x: number; y: number; z: number },
): number {
  let tMin = 0;
  let tMax = Infinity;
  // Unrolled per axis; allocation-free.
  if (Math.abs(dir.x) < 1e-9) {
    if (origin.x < min.x || origin.x > max.x) return -1;
  } else {
    const a = (min.x - origin.x) / dir.x;
    const b = (max.x - origin.x) / dir.x;
    tMin = Math.max(tMin, Math.min(a, b));
    tMax = Math.min(tMax, Math.max(a, b));
    if (tMin > tMax) return -1;
  }
  if (Math.abs(dir.y) < 1e-9) {
    if (origin.y < min.y || origin.y > max.y) return -1;
  } else {
    const a = (min.y - origin.y) / dir.y;
    const b = (max.y - origin.y) / dir.y;
    tMin = Math.max(tMin, Math.min(a, b));
    tMax = Math.min(tMax, Math.max(a, b));
    if (tMin > tMax) return -1;
  }
  if (Math.abs(dir.z) < 1e-9) {
    if (origin.z < min.z || origin.z > max.z) return -1;
  } else {
    const a = (min.z - origin.z) / dir.z;
    const b = (max.z - origin.z) / dir.z;
    tMin = Math.max(tMin, Math.min(a, b));
    tMax = Math.min(tMax, Math.max(a, b));
    if (tMin > tMax) return -1;
  }
  return tMin;
}

/** AABB containment with a uniform margin (m). Allocation-free. */
function containsWithMargin(box: pc.BoundingBox, p: pc.Vec3, margin: number): boolean {
  const c = box.center;
  const h = box.halfExtents;
  return (
    Math.abs(p.x - c.x) <= h.x + margin &&
    Math.abs(p.y - c.y) <= h.y + margin &&
    Math.abs(p.z - c.z) <= h.z + margin
  );
}
