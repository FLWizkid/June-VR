/*
 * Markerless AR placement for Android XR (Samsung / Google) glasses & headsets,
 * and Android phones — using WebXR Hit Test + Anchors via PlayCanvas.
 *
 * Why this and not image tracking?
 *   Android XR's browser supports Hit Test, Anchors, Hand Input, Depth Sensing,
 *   etc. — but NOT WebXR image/marker tracking. So to run on the glasses, the
 *   model is placed on a detected real-world surface and anchored there, rather
 *   than locked to a printed photo. See ../docs/platform-compatibility.md.
 *
 * Interaction: aim at a surface -> a reticle appears -> pinch (hand input) or
 * tap/select to place the model. Select again to re-place.
 */

const statusEl = document.getElementById('status');
const startBtn = document.getElementById('startAr');
const canvas = document.getElementById('application');

function setStatus(msg) { statusEl.textContent = msg; }

const app = new pc.Application(canvas, {
  mouse: new pc.Mouse(canvas),
  touch: new pc.TouchDevice(canvas),
  keyboard: new pc.Keyboard(window),
  graphicsDeviceOptions: { alpha: true } // transparent clear so the camera passthrough shows
});
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
window.addEventListener('resize', () => app.resizeCanvas());

// --- Camera (transparent clear for AR passthrough) ---
const camera = new pc.Entity('camera');
camera.addComponent('camera', { clearColor: new pc.Color(0, 0, 0, 0) });
app.root.addChild(camera);

// --- Lighting (light estimation can refine this at runtime if desired) ---
const dir = new pc.Entity('light');
dir.addComponent('light', { type: 'directional', intensity: 1.0, castShadows: true });
dir.setEulerAngles(45, 30, 0);
app.root.addChild(dir);

const ambient = new pc.Entity('ambient');
ambient.addComponent('light', { type: 'directional', intensity: 0.4 });
ambient.setEulerAngles(-30, -120, 0);
app.root.addChild(ambient);

// --- Reticle: shows where the model will land ---
const reticle = new pc.Entity('reticle');
reticle.addComponent('render', { type: 'cylinder' });
reticle.setLocalScale(0.12, 0.002, 0.12); // ~12cm ring-ish disc
reticle.enabled = false;
app.root.addChild(reticle);

// --- Model root (the thing we place) ---
const modelRoot = new pc.Entity('modelRoot');
modelRoot.enabled = false;
app.root.addChild(modelRoot);

// Tunables: lift the model so it sits ON the surface, and scale to taste.
const MODEL_Y_OFFSET = 0.0;   // metres
const MODEL_SCALE = 1.0;

// Try to load assets/model.glb; fall back to a primitive so the app always runs.
app.assets.loadFromUrl('assets/model.glb', 'container', (err, asset) => {
  if (err || !asset) {
    console.warn('No model.glb found — using placeholder. (' + err + ')');
    const box = new pc.Entity('placeholder');
    box.addComponent('render', { type: 'box' });
    box.setLocalScale(0.12, 0.06, 0.18); // rough cuff-meter footprint in metres
    modelRoot.addChild(box);
    return;
  }
  const entity = asset.resource.instantiateRenderEntity();
  modelRoot.addChild(entity);
});

app.start();

// --- WebXR support gating ---
const xrSupported = app.xr && app.xr.supported;
const hitTestSupported = xrSupported && app.xr.hitTest && app.xr.hitTest.supported;

if (!xrSupported) {
  setStatus('WebXR AR not available in this browser.\nOpen on an Android XR device or Chrome on Android.');
} else if (!hitTestSupported) {
  setStatus('AR is available but Hit Test is not — placement needs Hit Test.');
} else {
  setStatus('Ready. Tap "Start AR", aim at a surface, then pinch/tap to place.');
  startBtn.disabled = false;
}

startBtn.addEventListener('click', () => {
  app.xr.start(camera.camera, pc.XRTYPE_AR, pc.XRSPACE_LOCALFLOOR, {
    anchors: true,
    depthSensing: { usagePreference: 'cpu-optimized', dataFormatPreference: 'luminance-alpha' },
    callback: (err) => {
      if (err) setStatus('Failed to start AR: ' + err.message);
    }
  });
});

// Re-usable temporaries
const lastPos = new pc.Vec3();
const lastRot = new pc.Quat();
let haveHit = false;

app.xr.on('start', () => {
  setStatus('AR running. Aim at a surface; pinch/tap to place the model.');
  startBtn.style.display = 'none';

  app.xr.hitTest.start({
    spaceType: pc.XRSPACE_VIEWER,
    callback: (err, hitTestSource) => {
      if (err) { setStatus('Hit test error: ' + err.message); return; }
      hitTestSource.on('result', (position, rotation) => {
        lastPos.copy(position);
        lastRot.copy(rotation);
        haveHit = true;
        reticle.enabled = true;
        reticle.setPosition(position);
        reticle.setRotation(rotation);
      });
    }
  });
});

app.xr.on('end', () => {
  setStatus('AR ended.');
  startBtn.style.display = '';
  reticle.enabled = false;
  haveHit = false;
});

// Place (or re-place) on select / pinch
app.xr.input.on('select', () => {
  if (!haveHit) return;
  placeModel(lastPos, lastRot);
});

function placeModel(position, rotation) {
  // Anchor the placement if anchors are supported, so it stays put as you move.
  if (app.xr.anchors && app.xr.anchors.supported) {
    app.xr.anchors.create(position, rotation, (err, anchor) => {
      if (err || !anchor) { attach(position, rotation); return; }
      anchor.on('change', () => {
        modelRoot.setPosition(anchor.getPosition());
        modelRoot.setRotation(anchor.getRotation());
      });
      attach(anchor.getPosition(), anchor.getRotation());
    });
  } else {
    attach(position, rotation);
  }
}

function attach(position, rotation) {
  modelRoot.setPosition(position.x, position.y + MODEL_Y_OFFSET, position.z);
  modelRoot.setRotation(rotation);
  modelRoot.setLocalScale(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
  modelRoot.enabled = true;
  setStatus('Placed. Pinch/tap again to move it.');
}
