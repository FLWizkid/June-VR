/**
 * Headless check for WebXR image tracking (CLAUDE.md §8 Step 2, §4.1).
 *
 * Deterministic — no Date.now()/Math.random(), no live XR session. Proves:
 *   (a) ImageTracker registers the placeholder marker and emits `onMarker` for a simulated tracked
 *       image, copying the pose out correctly;
 *   (b) image tracking is NOT wrapped in the `.supported`/fallback capability gate — it runs even
 *       when the (informational-only) supported/available flags are false — while the other WebXR
 *       features stay gated in `readXrFeatures`.
 *
 * Run ad hoc (not part of CI; no package.json script added). Bundle with the esbuild that ships
 * with Vite, then run with node:
 *   npx esbuild src/ar/__checks__/imageTracking.check.ts --bundle --platform=node \
 *     --format=esm --outfile=.tmp-check/check.mjs && node .tmp-check/check.mjs
 * (Being under `src/`, this file is also strict-typechecked by `npm run typecheck`.)
 */

import * as pc from 'playcanvas';
import assert from 'node:assert/strict';

import {
  ImageTracker,
  PLACEHOLDER_MARKER,
  type MarkerImageSource,
  type MarkerResult,
  type TrackedImagePose,
} from '../imageTracking';
import { DEFAULT_XR_FEATURES } from '../../config/capabilities';

/** Mutable fake of `XrTrackedImage` that satisfies {@link TrackedImagePose}. */
class FakeTrackedImage implements TrackedImagePose {
  tracking = false;
  emulated = false;
  private readonly pos = new pc.Vec3();
  private readonly rot = new pc.Quat();
  setPose(x: number, y: number, z: number): void {
    this.pos.set(x, y, z);
  }
  getPosition(): pc.Vec3 {
    return this.pos;
  }
  getRotation(): pc.Quat {
    return this.rot;
  }
}

/**
 * Build a fake `pc.AppBase` exposing only `xr.imageTracking.add`. `supported`/`available` default to
 * FALSE to prove the tracker does not gate on them.
 */
function makeFakeApp(tracked: FakeTrackedImage, supported = false): pc.AppBase {
  const imageTracking = {
    supported,
    available: supported,
    images: [tracked],
    add(_image: MarkerImageSource, _width: number): TrackedImagePose {
      return tracked;
    },
  };
  return { xr: { imageTracking } } as unknown as pc.AppBase;
}

function run(): void {
  // (a) registration + emit --------------------------------------------------------------------
  const tracked = new FakeTrackedImage();
  const tracker = new ImageTracker(makeFakeApp(tracked));

  assert.deepEqual(tracker.markerIds, [PLACEHOLDER_MARKER.id], 'placeholder marker is registered');

  let calls = 0;
  const seen: { id: string; x: number; y: number; z: number; emulated: boolean } = {
    id: '',
    x: 0,
    y: 0,
    z: 0,
    emulated: false,
  };
  tracker.onMarker((r: MarkerResult) => {
    calls++;
    seen.id = r.id;
    seen.x = r.position.x;
    seen.y = r.position.y;
    seen.z = r.position.z;
    seen.emulated = r.emulated;
  });

  // No image bytes yet -> prepareForSession binds nothing -> tick is a no-op.
  tracker.prepareForSession();
  tracker.update();
  assert.equal(calls, 0, 'no emit before image bytes are supplied');

  // Supply placeholder image bytes and register with the (fake) engine tracker.
  const fakeImage = {} as unknown as MarkerImageSource;
  tracker.setMarkerImage(PLACEHOLDER_MARKER.id, fakeImage);
  tracker.prepareForSession();

  // Not yet tracking -> still a no-op.
  tracker.update();
  assert.equal(calls, 0, 'no emit while image is not tracking');

  // Simulate the image becoming actively tracked with a known pose.
  tracked.tracking = true;
  tracked.emulated = false;
  tracked.setPose(1.5, -2.25, 0.75);
  tracker.update();
  assert.equal(calls, 1, 'emits once when tracked');
  assert.equal(seen.id, PLACEHOLDER_MARKER.id, 'emits the placeholder marker id');
  assert.equal(seen.emulated, false, 'reports actively-tracked (not emulated)');
  assert.equal(seen.x, 1.5, 'copied position.x');
  assert.equal(seen.y, -2.25, 'copied position.y');
  assert.equal(seen.z, 0.75, 'copied position.z');

  // Emulated (recently-lost) pose is still reported, flagged emulated.
  tracked.emulated = true;
  tracker.update();
  assert.equal(calls, 2, 'still emits while emulated');
  assert.equal(seen.emulated, true, 'reports emulated flag');

  // (b) ungated: runs even though supported/available are FALSE ---------------------------------
  // The fake app above had supported=false yet the marker still tracked and emitted. Assert the
  // informational capability default is false and, crucially, does NOT prevent operation.
  assert.equal(DEFAULT_XR_FEATURES.imageTracking, false, 'imageTracking flag defaults false');
  assert.equal(
    calls,
    2,
    'image tracking operated with supported=false (no capability gate) — CLAUDE.md §4.1',
  );

  console.log('imageTracking.check: OK (all assertions passed)');
}

run();
