/*
 * PHONE-ONLY, EXPERIMENTAL image-tracking fallback (PlayCanvas + WebXR).
 *
 *  ⚠  Does NOT work on Samsung/Google Android XR glasses — their browser does
 *     not implement WebXR image tracking. Use app.js (hit test) for glasses.
 *  ⚠  Requires Chrome on Android with chrome://flags#webxr-incubations enabled.
 *
 * This is the CORRECTED version of the snippet you were given. Key fixes:
 *   1. The reference image must be an ImageBitmap / HTMLImageElement — NOT an
 *      asset .resource (that's a Texture and will be rejected).
 *   2. You must register the image with imageTracking.add() BEFORE the session
 *      starts, and pass `imageTracking: true` into app.xr.start().
 *   3. Read tracked images from app.xr.imageTracking.images and check `.tracking`.
 *   4. Use a designed, high-contrast marker — not the hands/photo — and set its
 *      real printed width in metres.
 *
 * Wire-up: include this INSTEAD of app.js in index.html to test the phone path.
 * Assumes the same camera/light/modelRoot setup; the essentials are inlined here.
 */

const statusEl = document.getElementById('status');
const startBtn = document.getElementById('startAr');
const canvas = document.getElementById('application');
const setStatus = (m) => { statusEl.textContent = m; };

const MARKER_URL = 'assets/marker.png'; // your DESIGNED marker, not the hands photo
const MARKER_WIDTH_METRES = 0.18;       // measured printed width (e.g. 18 cm)

const app = new pc.Application(canvas, {
  mouse: new pc.Mouse(canvas),
  touch: new pc.TouchDevice(canvas),
  graphicsDeviceOptions: { alpha: true }
});
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
window.addEventListener('resize', () => app.resizeCanvas());

const camera = new pc.Entity('camera');
camera.addComponent('camera', { clearColor: new pc.Color(0, 0, 0, 0) });
app.root.addChild(camera);

const light = new pc.Entity('light');
light.addComponent('light', { type: 'directional', intensity: 1.0 });
light.setEulerAngles(45, 30, 0);
app.root.addChild(light);

// Parent that gets driven by the tracked image pose.
const trackedRoot = new pc.Entity('trackedRoot');
trackedRoot.enabled = false;
app.root.addChild(trackedRoot);

app.assets.loadFromUrl('assets/model.glb', 'container', (err, asset) => {
  if (err || !asset) {
    const box = new pc.Entity('placeholder');
    box.addComponent('render', { type: 'box' });
    box.setLocalScale(0.12, 0.06, 0.18);
    box.setLocalPosition(0, 0.03, 0); // sit on top of the marker plane
    trackedRoot.addChild(box);
    return;
  }
  trackedRoot.addChild(asset.resource.instantiateRenderEntity());
});

app.start();

async function init() {
  if (!app.xr.supported || !app.xr.imageTracking || !app.xr.imageTracking.supported) {
    setStatus('WebXR image tracking not supported here.\nThis path is Chrome-on-Android only (flag required) and is NOT available on Android XR glasses — use app.js instead.');
    return;
  }

  // Load the marker as an ImageBitmap and register it BEFORE the session starts.
  const imgEl = new Image();
  imgEl.src = MARKER_URL;
  try {
    await imgEl.decode();
  } catch (e) {
    setStatus('Could not load marker image at ' + MARKER_URL);
    return;
  }
  const bitmap = await createImageBitmap(imgEl);
  app.xr.imageTracking.add(bitmap, MARKER_WIDTH_METRES);

  setStatus('Ready. Tap "Start AR" and point the camera at the printed marker.');
  startBtn.disabled = false;

  startBtn.addEventListener('click', () => {
    app.xr.start(camera.camera, pc.XRTYPE_AR, pc.XRSPACE_LOCALFLOOR, {
      imageTracking: true,
      callback: (err) => { if (err) setStatus('Start failed: ' + err.message); }
    });
  });
}

app.xr.on('start', () => { startBtn.style.display = 'none'; });
app.xr.on('end', () => { startBtn.style.display = ''; trackedRoot.enabled = false; });

app.on('update', () => {
  if (!app.xr.active || !app.xr.imageTracking) return;
  const images = app.xr.imageTracking.images;
  for (let i = 0; i < images.length; i++) {
    const ti = images[i];
    if (ti.tracking) {
      trackedRoot.enabled = true;
      trackedRoot.setPosition(ti.getPosition());
      trackedRoot.setRotation(ti.getRotation());
    }
  }
});

init();
