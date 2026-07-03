# TROUBLESHOOTING

Find your symptom. Each item has **what you see**, **why**, and **fix**.

---

## The app does not load (blank page)

- **What you see:** white or black page, no status panel.
- **Why:** the dev server is not running, wrong URL, or a JavaScript error.
- **Fix:**
  1. Confirm `npm run dev` is running in the terminal (no red errors).
  2. Open the exact URL it printed — **http://localhost:5173**.
  3. Open the browser dev console (F12) and read the first red error.
  4. If it mentions a missing module, run `npm install` again.

## "WebXR: not supported in this browser"

- **What you see:** the support line says not supported; the button is disabled.
- **Why:** the browser has no WebXR (e.g., Safari, or an old browser).
- **Fix:** use **Google Chrome**. On the headset, WebXR immersive is a Chrome-on-Android-XR feature.
  On a plain PC, WebXR may still be absent — the **desktop fallback (mouse) still works**.

## "supported, but no immersive-VR device is available"

- **What you see:** this exact status on a PC; **Enter VR** is disabled.
- **Why:** this is **normal on a plain PC** — there is no VR device attached.
- **Fix:** nothing to fix for PC testing. To enable the button, open the page on the **headset**
  (RUNBOOK Section 4). Desktop cube interaction works regardless.

## The Enter VR button does nothing

- **What you see:** clicking the button has no effect.
- **Why:** it is disabled (no device), or the session request failed.
- **Fix:**
  1. Check the button is **enabled** (it is greyed out when no device is available).
  2. Make sure you are on the **headset** browser, not the PC.
  3. Watch the on-screen log and the dev console for a "Could not start VR" message.
  4. Confirm the page is on `https://` or `http://localhost` (see the next item).

## Immersive mode is denied / "session failed to start"

- **What you see:** you click Enter VR but VR never opens; the log shows an error.
- **Why:** not a secure context, permission denied, or another app holds the headset.
- **Fix:**
  1. The page **must** be `https://` or `http://localhost`. A `http://<lan-ip>` page is blocked.
     Use `adb reverse` (RUNBOOK Path A) or an HTTPS host (Path B).
  2. Accept any WebXR/permission prompt on the headset.
  3. Close other VR apps that might be using the display, then retry.
  4. Remember XR only starts from the **button click** — it cannot be triggered by code alone.

## The scene is too small or too large / cube is in the wrong place

- **What you see:** the cube is tiny, huge, too close, or too far in the headset.
- **Why:** sizes are in **meters** and the reference space is **local-floor** (floor = y 0).
- **Fix:** edit `src/scene-builder.js`:
  - Cube size: `cube.setLocalScale(0.4, 0.4, 0.4)` (meters).
  - Cube position: `cube.setLocalPosition(0, 1.0, -1.5)` (x, y=height, z=forward is negative).
  - Sign position: `sign.entity.setLocalPosition(0, 1.95, -2.3)`.
  - Desktop camera framing: `camera.setLocalPosition(0, 1.6, 2.4)` and `camera.lookAt(...)`.
  - Standing eye height is about **1.6 m**; keep interactive objects near 0.8–1.4 m.

## Input not detected (cube will not select)

- **On desktop:** aim the mouse **directly at the cube** and click; empty space logs "empty space".
  If nothing logs at all, the canvas may not have focus — click the page once, then the cube.
- **In the headset:** pull the **trigger** or **pinch** with a tracked hand. The log shows each select.
  If selection toggles even when not aimed at the cube, that is the intentional fallback when the
  input source exposes no pointer ray — extend `app.xr.input` handling in `src/main.js` to require a ray.
- **Check the `Input:` line** in the status panel (and the small line on the in-world sign). It reports
  how many hands/controllers are tracked. `none` while in VR means the device has not reported input
  sources yet — move your hands into the headset's view, or wake the controllers, and it updates live.

## Sign text looks flipped or unreadable

- **Why:** the sign is a plane with a canvas texture; its orientation depends on the plane rotation.
- **Fix:** in `src/scene-builder.js`, the sign uses `setLocalEulerAngles(90, 0, 0)`. If text ever
  appears mirrored/upside-down after a change, flip it back or add `material.emissiveMapTiling`/
  `emissiveMapOffset` to flip the U or V axis.

## Nothing renders but there are no errors

- **Fix:**
  1. Resize the browser window (forces a canvas resize).
  2. Confirm your GPU allows WebGL2 — visit `chrome://gpu`.
  3. Try `npm run build` then `npm run preview` to rule out a dev-server quirk.

## `adb: command not found` or `adb devices` is empty

- **Fix:**
  1. Install Android **Platform Tools** and ensure `adb` is on your PATH.
  2. Enable **Developer options + USB debugging** on the headset.
  3. Reconnect USB and accept the debugging prompt on the headset.
  4. Re-run `adb devices` — you should see exactly one device.
