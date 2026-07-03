# RUNBOOK

Do these steps in order. Do not skip ahead. Each section says **where** the action happens (your PC
or the headset), has a **WAIT HERE** checkpoint, and tells you **what success looks like**.

---

## Section 0 — What depends on what (read first)

1. Install Node.js **before** anything else.
2. `npm install` must finish **before** `npm run dev`.
3. Desktop testing should pass **before** you try the headset.
4. For the headset you need **either** USB + `adb` **or** an HTTPS host — pick one.
5. Immersive VR only starts from a **button click** — never automatically.

---

## Section 1 — PC setup (on your PC)

1. Install **Node.js 18 or newer** (20+ recommended) from https://nodejs.org.
2. Open a terminal.
3. Check it works:
   ```bash
   node -v
   ```
4. You should see `v18…` or higher.

**WAIT HERE.** Do not continue until `node -v` prints a version.

**Success:** `node -v` shows v18 or newer.

---

## Section 2 — Install the project (on your PC)

1. In the terminal, go into this project folder:
   ```bash
   cd webxr-starter
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Let it finish. It downloads PlayCanvas and Vite.

**WAIT HERE.** Do not continue until `npm install` finishes with no red error lines.

**Success:** a `node_modules/` folder now exists and the command ended cleanly.

---

## Section 3 — Local run (on your PC)

1. Start the dev server:
   ```bash
   npm run dev
   ```
2. It prints a local URL.
3. Open **http://localhost:5173** in Chrome on your PC.
4. Click the cube once. It turns **green** and the sign says **SELECTED**.
5. Click it again. It turns **red** again.

**WAIT HERE.** Do not go to the headset until the cube toggles color on your PC.

**Success:** the room renders and clicking the cube toggles red/green. The status panel says
"no immersive-VR device is available" — that is expected on a PC.

> This is your single command for day-to-day work: **`npm run dev`**. Leave it running while you edit
> files; the page reloads automatically.

---

## Section 4 — Put it on the headset

Pick **ONE** path.

### Path A — USB + adb (recommended for development)

Where: PC + headset connected by USB cable.

1. Install the Android **Platform Tools** (this gives you `adb`): https://developer.android.com/tools/releases/platform-tools
2. On the headset, enable **Developer options** and **USB debugging** (see the device's docs).
3. Connect the headset to the PC by USB.
4. On the PC, confirm the device is seen:
   ```bash
   adb devices
   ```
   You should see one device listed (accept the on-headset prompt if it appears).
5. Make sure `npm run dev` is still running on the PC.
6. Forward the port so the headset can reach your PC's dev server as localhost:
   ```bash
   adb reverse tcp:5173 tcp:5173
   ```
7. On the headset, open **Chrome** and go to **http://localhost:5173**.

**WAIT HERE.** Confirm the page loads and the status panel appears in the headset browser.

8. The **Enter VR** button should now be **enabled**.
9. Click **Enter VR**.
10. Put on / look through the headset.
11. Pull the trigger or pinch to select the cube — it toggles red/green and the sign updates.

**Success:** immersive VR opens from the button, and you can select the cube in 3D.

> Why localhost? WebXR immersive mode requires a **secure context**. `https://` qualifies, and so does
> `http://localhost`. `adb reverse` makes your PC's dev server appear as `localhost` on the headset, so
> no hosting is needed for development.

### Path B — Hosted HTTPS link (to share, or with no USB)

Where: PC to build + a static host; headset opens the link.

1. On the PC, build the production files:
   ```bash
   npm run build
   ```
2. This creates a `dist/` folder.
3. Upload `dist/` to any **HTTPS** static host (see **HOSTING.md** for the simplest options).
4. Copy the resulting `https://…` URL.
5. On the headset, open **Chrome** and go to that URL.
6. Click **Enter VR**, then select the cube.

**WAIT HERE.** Confirm the hosted page loads over `https://` (not `http://`).

**Success:** the hosted page enters VR from the button on the headset.

---

## Section 5 — Iterate (on your PC)

1. Keep `npm run dev` running.
2. Open **`src/scene-builder.js`** — this is where the room lives.
3. Change something small (for example, the cube color constants at the top).
4. Save the file.
5. The PC browser reloads automatically.
6. If you are on the headset via **Path A**, reload the headset tab to see changes.
7. When you want a shareable build, run `npm run build` again and re-host `dist/`.

**Success:** your edit shows up after save/reload.

---

## Quick command reference

| Command | Where | Result |
| --- | --- | --- |
| `npm install` | PC | one-time dependency install |
| `npm run dev` | PC | dev server at http://localhost:5173 |
| `npm run build` | PC | production files in `dist/` |
| `npm run preview` | PC | serve the build at http://localhost:4173 |
| `npm run serve` | PC | serve `dist/` with plain Node at http://localhost:8080 |
| `adb reverse tcp:5173 tcp:5173` | PC (headset via USB) | headset can open http://localhost:5173 |
