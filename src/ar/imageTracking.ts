/**
 * WebXR image / marker tracking (SPEC §2 "Verified platform facts"/§12 A19, CLAUDE.md §4.1).
 *
 * UNLIKE every other WebXR feature in this app (hit test, hands, anchors, depth, light estimation),
 * image tracking is a **first-class, UNGATED** feature per the resolved conflict decision in
 * CLAUDE.md §4.1: we build directly against it and do NOT wrap it in the `.supported`/fallback
 * capability discipline that §4 applies elsewhere. There is no "image tracking unavailable" branch
 * that changes behaviour — it simply activates. If the running session produces no results the
 * per-frame tick is a harmless no-op; that is an absence of data, not a capability gate.
 *
 * `app.xr` may still be **null** (installed PlayCanvas types allow it) and is always null-guarded —
 * null-guarding an object reference is not the same as gating the feature.
 *
 * Verified APIs (playcanvas@2.19):
 *   - `app.xr.imageTracking.add(image, widthMeters)` → `XrTrackedImage | null`; only valid BEFORE a
 *     session is active, so images are registered in {@link ImageTracker.prepareForSession} which the
 *     XR bootstrap calls immediately before `xr.start(..., { imageTracking: true })`.
 *   - `XrTrackedImage.tracking` / `.emulated` / `.getPosition()` / `.getRotation()`. `getPosition()`
 *     and `getRotation()` return the tracked image's own persistent Vec3/Quat (no per-call alloc), so
 *     the tick only copies into reused scratch.
 *
 * The real marker image bytes are not shipped yet (see the `TODO(asset)` seam and
 * `public/assets/tracking/`). A placeholder marker descriptor is registered so the module compiles
 * and runs; supply the image via {@link ImageTracker.setMarkerImage} once available.
 */

import * as pc from 'playcanvas';
import { createLogger } from '../utils/logging';

const log = createLogger('image-tracking');

/** Image sources the underlying WebXR/PlayCanvas image tracker accepts as a marker sample. */
export type MarkerImageSource =
  | HTMLCanvasElement
  | HTMLImageElement
  | SVGImageElement
  | HTMLVideoElement
  | Blob
  | ImageData
  | ImageBitmap;

/** Static description of a trackable marker. Config-as-data (CLAUDE.md §3.3). */
export interface TrackedMarker {
  /** Stable identifier reported back through {@link MarkerResult.id}. */
  readonly id: string;
  /** Real-world width of the printed marker in metres (improves tracking quality). */
  readonly widthMeters: number;
}

/**
 * Minimal structural view of a tracked image the per-frame tick reads. `XrTrackedImage` satisfies
 * this; keeping the surface tiny also makes the emit path testable without a live XR session.
 */
export interface TrackedImagePose {
  readonly tracking: boolean;
  readonly emulated: boolean;
  getPosition(): pc.Vec3;
  getRotation(): pc.Quat;
}

/** Pose event delivered to {@link ImageTracker.onMarker}. The object is REUSED across calls. */
export interface MarkerResult {
  readonly id: string;
  /** World position of the marker. Reused scratch — copy out; do not retain across ticks. */
  readonly position: pc.Vec3;
  /** World rotation of the marker. Reused scratch — copy out; do not retain across ticks. */
  readonly rotation: pc.Quat;
  /** True when the pose is extrapolated from a recently-lost image rather than actively tracked. */
  readonly emulated: boolean;
}

export type MarkerCallback = (result: MarkerResult) => void;

/** Default placeholder marker so the module runs before real bytes exist. */
// TODO(asset): supply real marker image bytes; images live in the Room environment assets
// (public/assets/tracking/ — see ASSET_PIPELINE.md). Call setMarkerImage('room-marker-01', img)
// with the ImageBitmap decoded from the shipped marker, ideally before the first AR entry.
export const PLACEHOLDER_MARKER: TrackedMarker = {
  id: 'room-marker-01',
  widthMeters: 0.2,
};

interface Registration {
  readonly marker: TrackedMarker;
  image: MarkerImageSource | null;
  tracked: TrackedImagePose | null;
}

/**
 * Registers trackable markers and, once a session is running, reports their world pose every frame.
 *
 * Lifecycle (driven by {@link XrBootstrap}):
 *   1. construct (registers {@link PLACEHOLDER_MARKER}),
 *   2. optionally {@link setMarkerImage} to attach real bytes,
 *   3. {@link prepareForSession} just before `xr.start` (adds images to the engine tracker),
 *   4. {@link update} each frame (emits {@link onMarker} for tracked markers).
 *
 * The engine retains its `XrTrackedImage` list across sessions (it marks images untracked on end and
 * re-scores them on the next start), so registrations persist and are never re-added.
 */
export class ImageTracker {
  private readonly app: pc.AppBase;
  private readonly byId = new Map<string, Registration>();
  /** Array mirror of `byId` for allocation-free iteration in {@link update}. */
  private readonly list: Registration[] = [];
  private callback: MarkerCallback | null = null;

  // Reused per-frame output (no allocation inside the tick). Persistent Vec3/Quat live here.
  private readonly outPosition = new pc.Vec3();
  private readonly outRotation = new pc.Quat();
  private readonly result: MarkerResult;
  private resultId = '';
  private resultEmulated = false;

  constructor(app: pc.AppBase) {
    this.app = app;
    // The result object is allocated once; fields point at persistent scratch and getters read the
    // current mutable id/emulated so the tick never builds an object literal.
    const self = this;
    this.result = {
      get id(): string {
        return self.resultId;
      },
      position: this.outPosition,
      rotation: this.outRotation,
      get emulated(): boolean {
        return self.resultEmulated;
      },
    };
    this.registerMarker(PLACEHOLDER_MARKER);
  }

  /** Register a marker descriptor, optionally with its image source. Idempotent per id. */
  registerMarker(marker: TrackedMarker, image?: MarkerImageSource): void {
    const existing = this.byId.get(marker.id);
    if (existing) {
      if (image) existing.image = image;
      return;
    }
    const reg: Registration = { marker, image: image ?? null, tracked: null };
    this.byId.set(marker.id, reg);
    this.list.push(reg);
  }

  /** Supply (or replace) the real image bytes for an already-registered marker. */
  setMarkerImage(id: string, image: MarkerImageSource): void {
    const reg = this.byId.get(id);
    if (!reg) {
      log.warn(`setMarkerImage: unknown marker id "${id}"`);
      return;
    }
    reg.image = image;
  }

  /** Subscribe to per-frame marker poses. One callback; call again to replace. */
  onMarker(callback: MarkerCallback): void {
    this.callback = callback;
  }

  /**
   * Add every registered marker that has image bytes to the engine image tracker. MUST run before
   * `xr.start` (the engine rejects `add` once a session is active). UNGATED: we do not consult
   * `imageTracking.supported` to decide whether to try — we simply attempt registration. `app.xr`
   * is null-guarded (that is a reference guard, not a capability gate).
   */
  prepareForSession(): void {
    const tracking = this.app.xr?.imageTracking;
    if (!tracking) return;
    for (let i = 0; i < this.list.length; i++) {
      const reg = this.list[i];
      if (!reg || reg.tracked || !reg.image) continue;
      const tracked = tracking.add(reg.image, reg.marker.widthMeters);
      if (tracked) {
        reg.tracked = tracked;
        log.info(`registered marker "${reg.marker.id}" (${reg.marker.widthMeters} m)`);
      } else {
        // add() returns null if the UA lacks image tracking or the manager is already active. This
        // is not treated as a fallback branch — the marker simply produces no data this session.
        log.warn(`marker "${reg.marker.id}" could not be added to the image tracker`);
      }
    }
    const withImage = this.list.filter((r) => r.image).length;
    if (withImage === 0) {
      // Expected until real marker bytes are supplied (see TODO(asset) / PLACEHOLDER_MARKER).
      log.info('no marker images supplied yet; image tracking will yield no results this session');
    }
  }

  /**
   * Per-frame tick. Emits {@link onMarker} for every marker currently reporting a pose.
   * ALLOCATION-FREE: iterates an array by index and reuses the single {@link result} object plus its
   * persistent position/rotation scratch (CLAUDE.md §2 performance guardrails).
   */
  update(): void {
    const cb = this.callback;
    if (!cb) return;
    for (let i = 0; i < this.list.length; i++) {
      const reg = this.list[i];
      if (!reg) continue;
      const tracked = reg.tracked;
      if (!tracked || !tracked.tracking) continue;
      this.outPosition.copy(tracked.getPosition());
      this.outRotation.copy(tracked.getRotation());
      this.resultId = reg.marker.id;
      this.resultEmulated = tracked.emulated;
      cb(this.result);
    }
  }

  /** Ids of all registered markers (order of registration). */
  get markerIds(): readonly string[] {
    return this.list.map((r) => r.marker.id);
  }
}
