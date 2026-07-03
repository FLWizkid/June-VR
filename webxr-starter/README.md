# PlayCanvas WebXR Starter (Android XR)

A tiny, robust WebXR starter built on **PlayCanvas**. It opens in a normal PC browser and, on an
**Android XR** headset, runs as an immersive **VR** experience in **Google Chrome**. It runs directly
in the browser — no native-engine export step, no build-service lock-in, and no backend, database, or
login.

You manage everything from your PC with one dev command.

---

## What this project is

- A **PlayCanvas** (WebGL/WebXR) app written in plain JavaScript ES modules.
- A minimal **immersive-VR** room: floor, lighting, a floating sign, and one interactive cube.
- A clean **desktop fallback**: on a normal PC the same page is usable with the mouse.
- A foundation you can grow into a **healthcare training simulation** (props, hotspots, flows, scoring).

## What it does

1. On load, it shows a status panel and checks whether WebXR + immersive VR are available.
2. It renders a 3D room you can see immediately on your PC.
3. It shows an **Enter VR** button. Entering VR happens **only when you click it** (browsers require a
   user gesture to start XR).
4. The cube gives **visible feedback** when selected: it turns from red to green and the in-world sign
   updates. This works with a **mouse** on desktop and with a **trigger/pinch** in the headset.
5. The status panel (and the in-world sign) show a live **input readout** — how many hands or
   controllers are tracked. The session requests **hand tracking** automatically (hand-first), and
   falls back to controllers/pointer, and to a plain `local` space if `local-floor` is unavailable.

## The stack

| Piece | Choice | Why |
| --- | --- | --- |
| Engine | PlayCanvas `^2.19` | WebXR-native, lightweight, browser-first |
| Language | JavaScript ES modules | Simple, readable, no transpiler needed |
| Dev/build | Vite | One command to run, plus `build`/`preview` |
| Backend | none | Not needed for v1 |

---

## How to run it (PC)

You need **Node.js 18+** (20+ recommended). Then, from this folder:

```bash
npm install      # one time — downloads PlayCanvas + Vite
npm run dev      # starts the dev server
```

1. Run `npm install`.
2. Wait until it finishes.
3. Run `npm run dev`.
4. Open the URL it prints — **http://localhost:5173**.

**Success looks like:** a dark room with a red cube, a floating "PlayCanvas WebXR / Select the cube"
sign, and a status panel in the top-left.

## How to test it on a PC

1. With `npm run dev` running, open **http://localhost:5173**.
2. Click the cube. It should turn **green** and the sign should say **SELECTED**. Click again to toggle.
3. The status panel will say *"no immersive-VR device is available"* — that is normal on a plain PC.
   The **Enter VR** button is disabled until a headset is present. Desktop interaction still works.

## How to open it on Android XR

Two supported paths (full steps in **RUNBOOK.md**):

- **USB / developer (recommended):** connect the headset by USB, run `adb reverse tcp:5173 tcp:5173`,
  then open **http://localhost:5173** in Chrome on the headset. `localhost` is a secure context, so
  WebXR immersive mode is allowed with no hosting.
- **Hosted (share a link):** run `npm run build`, upload the `dist/` folder to any **HTTPS** static
  host, and open that `https://…` URL in Chrome on the headset. See **HOSTING.md**.

In the headset: press **Enter VR** (a real click/tap is required), then pull the trigger or pinch to
select the cube.

---

## Files that matter

| File | What it is |
| --- | --- |
| `src/main.js` | Boots the app, wires mouse/touch/XR interaction |
| `src/scene-builder.js` | **Edit this first** to change the room (cube, sign, lights, props) |
| `src/xr-manager.js` | WebXR support checks + start/exit session logic |
| `src/ui-overlay.js` | The DOM status panel + Enter VR button |
| `src/styles.css` | Overlay styling |

## More docs

- **RUNBOOK.md** — exact, ordered steps for every platform, with wait-here checkpoints.
- **DEPENDENCY-ORDER.md** — what must finish before the next step starts.
- **HOSTING.md** — the simplest way to host the built files for the headset.
- **TROUBLESHOOTING.md** — fixes for the common failures.
- **PROJECT-SUMMARY.md** — the one-page operational summary.
