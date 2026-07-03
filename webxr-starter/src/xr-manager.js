/**
 * xr-manager.js — WebXR support checks and session lifecycle for immersive VR.
 *
 * Responsibilities (and nothing more):
 *   1. Detect whether WebXR is supported and whether an immersive-VR device is available.
 *   2. Start a session — ONLY from a user gesture (the Enter VR button click calls `enter()`).
 *   3. End a session, and keep the overlay button/status in sync with real session state.
 *
 * PlayCanvas notes (verified against playcanvas@2.19):
 *   - `app.xr` can be null on very old browsers — always guard it.
 *   - `app.xr.start(cameraComponent, type, spaceType, { callback })` is callback-based and returns
 *     void; it must be triggered by user interaction.
 *   - We use `XRTYPE_VR` (immersive-vr) + `XRSPACE_LOCALFLOOR` (floor at y = 0).
 */

import * as pc from 'playcanvas';

export class XrManager {
  /**
   * @param {pc.AppBase} app
   * @param {pc.Entity} cameraEntity - entity that has a camera component
   * @param {{ log, setSupport, setSessionState, configureButton }} overlay
   */
  constructor(app, cameraEntity, overlay) {
    this.app = app;
    this.cameraEntity = cameraEntity;
    this.overlay = overlay;
    this.sessionType = pc.XRTYPE_VR;
    this.spaceType = pc.XRSPACE_LOCALFLOOR;
  }

  /** Wire up support/availability detection and session event handlers. */
  init() {
    const xr = this.app.xr;

    if (!xr || !xr.supported) {
      this.overlay.setSupport('WebXR: not supported in this browser');
      this.overlay.configureButton({ label: 'VR unavailable', enabled: false });
      this.overlay.log('WebXR not supported here. Desktop fallback is active — click the cube.');
      return;
    }

    // Availability can change at runtime (device connects, permission granted). Re-evaluate live.
    xr.on(`available:${this.sessionType}`, (available) => this._refreshAvailability(available));
    xr.on('start', () => this._onSessionStart());
    xr.on('end', () => this._onSessionEnd());

    this._refreshAvailability(xr.isAvailable(this.sessionType));
  }

  /** Update the button + status based on whether an immersive-VR device is available. */
  _refreshAvailability(available) {
    if (this.app.xr.active) return; // never override the "Exit VR" button during a live session

    if (available) {
      this.overlay.setSupport('WebXR: immersive VR available');
      this.overlay.configureButton({
        label: 'Enter VR',
        enabled: true,
        onClick: () => this.enter(),
      });
    } else {
      this.overlay.setSupport('WebXR: supported, but no immersive-VR device is available');
      this.overlay.configureButton({ label: 'Enter VR (no device)', enabled: false });
      this.overlay.log('No immersive-VR device detected. On a plain PC this is expected — use the mouse.');
    }
  }

  /**
   * Start the immersive session. MUST be called from a user gesture (button click).
   */
  enter() {
    const xr = this.app.xr;
    if (!xr || xr.active) return;

    this.overlay.log('Requesting immersive VR session…');
    xr.start(this.cameraEntity.camera, this.sessionType, this.spaceType, {
      callback: (err) => {
        if (err) {
          this.overlay.setSupport('WebXR: session failed to start');
          this.overlay.log('Could not start VR: ' + err.message);
        }
      },
    });
  }

  /** End the immersive session if one is active. */
  exit() {
    const xr = this.app.xr;
    if (xr && xr.active) xr.end();
  }

  _onSessionStart() {
    this.overlay.setSupport('WebXR: session ACTIVE');
    this.overlay.setSessionState(true);
    this.overlay.configureButton({ label: 'Exit VR', enabled: true, onClick: () => this.exit() });
    this.overlay.log('VR session started — put on the headset.');
  }

  _onSessionEnd() {
    this.overlay.setSessionState(false);
    this._refreshAvailability(this.app.xr.isAvailable(this.sessionType));
    this.overlay.log('VR session ended.');
  }
}
