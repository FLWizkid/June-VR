/**
 * main.js — application bootstrap.
 *
 * Order of operations:
 *   1. Create the PlayCanvas application on the canvas (with mouse/touch/keyboard input).
 *   2. Build the scene (camera, lights, floor, cube, sign).
 *   3. Create the DOM overlay (status + Enter VR button + log).
 *   4. Start the XR manager (support checks + session lifecycle).
 *   5. Wire interaction: desktop click/touch AND XR trigger/pinch all toggle the cube.
 *   6. Start the render loop.
 */

import * as pc from 'playcanvas';
import './styles.css';
import { buildScene } from './scene-builder.js';
import { createOverlay } from './ui-overlay.js';
import { XrManager } from './xr-manager.js';

// 1) App --------------------------------------------------------------------------------------------
const canvas = document.getElementById('app-canvas');
const app = new pc.Application(canvas, {
  mouse: new pc.Mouse(canvas),
  touch: new pc.TouchDevice(canvas),
  keyboard: new pc.Keyboard(window),
  graphicsDeviceOptions: { antialias: true, alpha: false },
});
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
window.addEventListener('resize', () => app.resizeCanvas());

// 2) Scene ------------------------------------------------------------------------------------------
const scene = buildScene(app);

// 3) Overlay ----------------------------------------------------------------------------------------
const overlay = createOverlay();
overlay.setInput('Input: enter VR to detect hands / controllers');
overlay.log('App started. Rendering the room…');

// 4) XR ---------------------------------------------------------------------------------------------
const xr = new XrManager(app, scene.camera, overlay);
xr.init();

// 5) Interaction ------------------------------------------------------------------------------------
// Shared scratch objects (reused; no per-event allocation).
const _from = new pc.Vec3();
const _dir = new pc.Vec3();
const _ray = new pc.Ray();

/** Build a world-space ray from a screen pixel (desktop click/touch). */
function rayFromScreen(screenX, screenY) {
  const cam = scene.camera.camera;
  cam.screenToWorld(screenX, screenY, cam.nearClip, _from);
  cam.screenToWorld(screenX, screenY, cam.farClip, _dir);
  _dir.sub(_from).normalize();
  _ray.set(_from, _dir);
  return _ray;
}

/** If `ray` hits the cube, toggle it and report. Returns true on hit. */
function toggleIfHit(ray, source) {
  const meshInstance = scene.cube.render.meshInstances[0];
  if (meshInstance && meshInstance.aabb.intersectsRay(ray)) {
    const selected = scene.toggleCube();
    overlay.log(`${source}: cube ${selected ? 'SELECTED (green)' : 'released (red)'}`);
    return true;
  }
  return false;
}

// Desktop: left mouse click.
app.mouse.on(pc.EVENT_MOUSEDOWN, (e) => {
  if (!toggleIfHit(rayFromScreen(e.x, e.y), 'Click')) {
    overlay.log('Click: empty space (aim at the cube).');
  }
});

// Touch (phones / touch laptops).
if (app.touch) {
  app.touch.on(pc.EVENT_TOUCHSTART, (e) => {
    const t = e.touches[0];
    if (t) toggleIfHit(rayFromScreen(t.x, t.y), 'Tap');
  });
}

// XR: trigger pull / hand pinch. Ray-test from the input source when it exposes a pointer ray;
// otherwise just toggle so there is always visible feedback in-headset.
if (app.xr) {
  const input = app.xr.input;

  input.on(pc.EVENT_SELECTSTART, (inputSource) => {
    const origin = typeof inputSource.getOrigin === 'function' ? inputSource.getOrigin() : null;
    const direction = typeof inputSource.getDirection === 'function' ? inputSource.getDirection() : null;
    if (origin && direction) {
      _ray.set(origin, direction);
      if (!toggleIfHit(_ray, 'Select')) overlay.log('Select: aim the pointer at the cube.');
    } else {
      const selected = scene.toggleCube();
      overlay.log(`Select: cube ${selected ? 'SELECTED' : 'released'}`);
    }
  });

  // Simple input-state message: how many hands / controllers are tracked. Shown in the DOM panel
  // AND on the in-world sign (so it is readable inside the headset, where the DOM is not visible).
  const reportInput = () => {
    const sources = input.inputSources || [];
    const hands = sources.filter((s) => s.hand).length;
    let desc;
    if (sources.length === 0) desc = 'none';
    else if (hands > 0) desc = `${hands} hand${hands > 1 ? 's' : ''} tracked`;
    else desc = `${sources.length} controller${sources.length > 1 ? 's' : ''}`;
    overlay.setInput('Input: ' + desc);
    scene.setSign({ status: sources.length ? desc : '' });
  };
  input.on('add', reportInput);
  input.on('remove', reportInput);

  // Guide the user in-headset via the sign as the session opens/closes.
  app.xr.on('start', () => scene.setSign({ subtitle: 'Pinch or pull the trigger to select' }));
  app.xr.on('end', () => scene.setSign({ subtitle: 'Select the cube', status: '' }));
}

// Keyboard nicety: Esc exits VR.
app.keyboard.on(pc.EVENT_KEYDOWN, (e) => {
  if (e.key === pc.KEY_ESCAPE) xr.exit();
});

// 6) Go ---------------------------------------------------------------------------------------------
app.start();
overlay.log('Ready. On desktop, click the cube. For VR, press Enter VR.');
