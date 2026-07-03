/**
 * scene-builder.js — builds the immersive room.
 *
 * Contents: a camera, ambient + directional light, a floor, one interactive cube, and a floating
 * "sign" (a 3D panel whose text is drawn with a 2D canvas). The sign matters because in an immersive
 * VR session the DOM overlay is NOT visible — only the 3D scene is — so readable text must live in 3D.
 *
 * The returned object exposes the pieces `main.js` needs to wire interaction:
 *   { camera, cube, toggleCube(), setSign(partial) }   // partial = { title?, subtitle?, status? }
 *
 * This module is engine-only: it does not touch the DOM overlay. Interaction/logging is wired in
 * main.js so responsibilities stay separate (and so healthcare props/hotspots can be added here later
 * without dragging UI code along).
 */

import * as pc from 'playcanvas';

const CUBE_RED = new pc.Color(0.9, 0.32, 0.27);
const CUBE_GREEN = new pc.Color(0.27, 0.82, 0.46);

export function buildScene(app) {
  const device = app.graphicsDevice;

  // --- Camera ------------------------------------------------------------------------------------
  // On desktop this fixed pose frames the room. Once XR starts, the headset drives the camera pose;
  // PlayCanvas positions this same camera entity from the `local-floor` reference space (floor = y 0).
  const camera = new pc.Entity('camera');
  camera.addComponent('camera', {
    clearColor: new pc.Color(0.05, 0.06, 0.09),
    farClip: 100,
  });
  camera.setLocalPosition(0, 1.6, 2.4); // ~standing eye height, a little back from the cube
  camera.lookAt(0, 1.2, -1.5);
  app.root.addChild(camera);

  // --- Lights ------------------------------------------------------------------------------------
  app.scene.ambientLight = new pc.Color(0.35, 0.37, 0.42);

  const keyLight = new pc.Entity('directional-light');
  keyLight.addComponent('light', {
    type: 'directional',
    color: new pc.Color(1.0, 0.98, 0.95),
    intensity: 1.1,
    castShadows: true,
    shadowResolution: 1024,
    shadowDistance: 16,
    normalOffsetBias: 0.05,
    shadowBias: 0.05,
  });
  keyLight.setLocalEulerAngles(55, 30, 0);
  app.root.addChild(keyLight);

  // --- Floor -------------------------------------------------------------------------------------
  const floor = new pc.Entity('floor');
  floor.addComponent('render', { type: 'plane' });
  floor.setLocalScale(10, 1, 10);
  floor.render.material = matte(new pc.Color(0.18, 0.19, 0.22));
  app.root.addChild(floor);

  // --- Interactive cube --------------------------------------------------------------------------
  const cube = new pc.Entity('cube');
  cube.addComponent('render', { type: 'box', castShadows: true });
  cube.setLocalScale(0.4, 0.4, 0.4);
  cube.setLocalPosition(0, 1.0, -1.5);
  const cubeMat = matte(CUBE_RED.clone(), 0.35);
  cube.render.material = cubeMat;
  app.root.addChild(cube);

  // A gentle idle spin so the object reads as "alive" and confirms the render loop is running.
  app.on('update', (dt) => cube.rotateLocal(0, dt * 14, 0));

  // --- Floating sign (readable in-headset) -------------------------------------------------------
  const sign = createSign(device);
  sign.entity.setLocalPosition(0, 1.95, -2.3);
  sign.entity.setLocalEulerAngles(90, 0, 0); // stand the plane upright, facing the viewer (+Z)
  sign.entity.setLocalScale(1.7, 1, 0.75);
  app.root.addChild(sign.entity);
  sign.set({ title: 'PlayCanvas WebXR', subtitle: 'Select the cube', status: '' });

  // --- Interaction state -------------------------------------------------------------------------
  let selected = false;

  /** Flip the cube's color and update the sign. Returns the new selected state. */
  function toggleCube() {
    selected = !selected;
    cubeMat.diffuse.copy(selected ? CUBE_GREEN : CUBE_RED);
    cubeMat.update();
    sign.set({ subtitle: selected ? 'SELECTED' : 'Select the cube' });
    return selected;
  }

  /** Update the in-world sign. Accepts any of `{ title, subtitle, status }`; unspecified fields keep. */
  function setSign(partial) {
    sign.set(partial);
  }

  return { camera, cube, toggleCube, setSign };
}

/** Create a matte, non-mirror StandardMaterial (metalness workflow, dielectric). */
function matte(color, gloss = 0.2) {
  const m = new pc.StandardMaterial();
  m.diffuse = color;
  m.useMetalness = true;
  m.metalness = 0;
  m.gloss = gloss;
  m.update();
  return m;
}

/**
 * Build a floating sign: a plane whose texture is a 2D canvas we draw text into. The material is
 * emissive (self-lit) so the text stays readable regardless of scene lighting or headset display.
 *
 * Returns { entity, set(partial) } where partial = { title?, subtitle?, status? }.
 */
function createSign(device) {
  const W = 512;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const texture = new pc.Texture(device, {
    width: W,
    height: H,
    format: pc.PIXELFORMAT_RGBA8,
    mipmaps: true,
    addressU: pc.ADDRESS_CLAMP_TO_EDGE,
    addressV: pc.ADDRESS_CLAMP_TO_EDGE,
  });

  const material = new pc.StandardMaterial();
  material.emissiveMap = texture;
  material.emissive = new pc.Color(1, 1, 1);
  material.diffuse = new pc.Color(0, 0, 0);
  material.cull = pc.CULLFACE_NONE; // two-sided so the sign is visible from either side
  material.update();

  const entity = new pc.Entity('sign');
  entity.addComponent('render', { type: 'plane' });
  entity.render.material = material;

  // Current sign contents; `set(partial)` merges and redraws so callers can update one field.
  const state = { title: '', subtitle: '', status: '' };

  function draw() {
    // Rounded panel background.
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0f1420';
    roundRect(ctx, 10, 10, W - 20, H - 20, 26);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    roundRect(ctx, 10, 10, W - 20, H - 20, 26);
    ctx.stroke();

    // Text lines: title, subtitle, and an optional small status line (e.g. the XR input state).
    ctx.textAlign = 'center';
    ctx.fillStyle = '#eaf1f7';
    ctx.font = '700 44px system-ui, sans-serif';
    ctx.fillText(state.title, W / 2, 92);
    ctx.fillStyle = '#8fd3ff';
    ctx.font = '600 38px system-ui, sans-serif';
    ctx.fillText(state.subtitle, W / 2, 150);
    if (state.status) {
      ctx.fillStyle = '#93a3b3';
      ctx.font = '500 26px system-ui, sans-serif';
      ctx.fillText(state.status, W / 2, 202);
    }

    // Push the new canvas pixels to the GPU texture.
    texture.setSource(canvas);
  }

  /** Merge the given fields into the sign and redraw. Unspecified fields are kept. */
  function set(partial) {
    Object.assign(state, partial);
    draw();
  }

  return { entity, set };
}

/** Canvas helper: trace a rounded rectangle path (caller fills/strokes). */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
