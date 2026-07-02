# Headset ↔ PC Mirroring Guide

Three ways to see on your PC what the Samsung Galaxy XR headset is showing.
Use whichever fits the moment: **demos**, **development**, or **remote observation**.

---

## Option 1 — In-app WebRTC Mirror (built into June-VR)

**Best for:** remote observation, sharing with colleagues over the internet, and
recording sessions. Zero setup on the PC beyond opening a URL.

### How it works
- The app captures its live PlayCanvas canvas as a `MediaStream` (30 fps).
- It publishes the stream over WebRTC using [PeerJS](https://peerjs.com/) with a
  shared session code as the identifier.
- Any browser that opens `/mirror.html?code=<same-code>` receives the stream
  peer-to-peer. **No video ever passes through our servers.**

### Steps
1. On the headset, launch the app (production URL after Vercel deploy).
2. Tap **Start Mirror** in the top-right panel. A code appears
   (e.g. `ruby-482`) plus a viewer URL.
3. On your PC, open that URL, e.g.
   `https://june-vr.vercel.app/mirror.html?code=ruby-482`
4. The PC page connects within ~2 seconds and shows the live view.

### Notes
- **What you'll see during flat/desktop mode:** the full 3D scene canvas as
  rendered on the headset browser tab.
- **What you'll see during an immersive-AR session:** what Chrome composites
  into the canvas. Depending on Chrome's XR privacy policy on Android XR, this
  may show only the 3D overlay layers (not the passthrough camera). If the
  passthrough camera is essential, use Option 2 (Cast).
- **Latency:** ~150–300 ms over Wi-Fi. Fine for observation, not for
  low-latency reflex work.
- **Recording:** on the PC page, right-click the video → *Save as* is not
  supported by browsers for MediaStreams, but you can use OBS or macOS
  Screenshot to record the browser window.

---

## Option 2 — Android XR native Cast (system-level)

**Best for:** live demos to a room, presentations, and capturing what the
headset actually shows including the passthrough camera.

### Requirements
- A **Chromecast**, **Chromecast with Google TV**, or a Google TV / Android TV
  device on the same Wi-Fi network as the Galaxy XR
- OR a laptop with Google Chrome (uses the Google Cast browser receiver)

### Steps (Chromecast / Google TV target)
1. On the Galaxy XR, put on the headset and open **Quick Settings**
   (usually a swipe from top or a system-menu gesture).
2. Tap **Cast** (Google Cast icon).
3. Select your Chromecast / Google TV / laptop from the list.
4. The headset's compositor view — passthrough camera + all UI + AR content —
   appears on the TV or receiver device.

### Steps (laptop with Chrome receiver)
1. On the laptop, install the **Google Cast** extension if not already present
   (bundled with Chrome — no install needed on Chrome 100+).
2. On the laptop, open Chrome and go to **`chrome://cast`** or a Google
   sign-in page. Some setups require the free
   [Google Cast Receiver](https://cast.google.com/publish/#/overview) app.
3. On the headset, tap **Cast** in Quick Settings → pick your laptop.

### Notes
- **Latency:** ~100–200 ms. This is what Google recommends for demos.
- **Fidelity:** system-level cast typically captures the full composited view
  including passthrough camera, unlike Option 1.
- **Requires network:** headset and receiver must be on the same Wi-Fi.
- **Battery:** casting uses more battery than a plain session.

---

## Option 3 — Chrome DevTools Remote Inspection (developer)

**Best for:** debugging, seeing console logs, inspecting DOM, profiling, and
setting breakpoints in the WebXR app running on the headset.

### Requirements
- A USB-C cable from Galaxy XR to your computer (Windows / macOS / Linux)
- Chrome or Edge on the computer
- Developer options enabled on the Galaxy XR (Settings → About → tap Build
  Number 7 times → back → Developer Options → **USB Debugging: On**)

### Steps
1. Plug the Galaxy XR into your computer via USB-C.
2. On the headset, when prompted "Allow USB debugging from this computer?",
   tap **Allow** (and check "Always allow" if you'll do this often).
3. On the computer, open Chrome and go to `chrome://inspect/#devices`.
4. Under **Remote Target** you'll see your Galaxy XR with a list of open Chrome
   tabs. Find your June-VR tab.
5. Click **inspect**. A full DevTools window opens with:
   - A **live thumbnail** of the tab (mirror)
   - Console, Sources, Network, Performance, Memory tabs
   - You can set breakpoints, `console.log`, inspect DOM, etc.

### Notes
- **Latency:** ~50 ms. Best mirror latency of the three options.
- **This is the standard XR web development workflow** used by the Chrome and
  PlayCanvas teams. If you're actively developing, keep this open.
- **Limitations:** the thumbnail is small and low-fidelity; it's for developer
  use, not audience viewing.
- **WebXR while inspecting:** you can enter an immersive-AR session while
  DevTools is attached. Console and breakpoints continue to work.

---

## Recommended workflow

| Situation | Use |
|---|---|
| Solo development / debugging | **Option 3** (DevTools) |
| Showing a client or teammate remotely | **Option 1** (in-app mirror URL) |
| Live demo to a room / recording a high-fidelity capture | **Option 2** (Cast) |
| All three at once | Yes — they don't conflict |

## Troubleshooting

**Mirror panel says "Failed: captureStream unsupported"**
Some browsers block `canvas.captureStream()` when hardware-accelerated WebGL is
in a specific state. Reload the page and try again before entering AR.

**Viewer page says "Host offline"**
The headset session code doesn't match, or the app hasn't tapped Start Mirror
yet. Double-check the code.

**Cast option not visible on Galaxy XR**
Verify the Chromecast/TV is powered on, on the same Wi-Fi, and updated to the
latest firmware. Reboot the headset if it doesn't appear.

**Chrome://inspect doesn't show the headset**
- Make sure USB Debugging is on and you tapped "Allow" on the headset prompt
- Try a different USB-C cable (some cables are power-only)
- Run `adb devices` from a terminal — if the headset isn't listed there
  either, driver/permission issue on the computer
