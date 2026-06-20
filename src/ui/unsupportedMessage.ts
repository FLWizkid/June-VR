/**
 * Unsupported-capability message (SPEC §7, R8/R12). Clearly tells the user why immersive AR is not
 * available (no WebXR, no AR, or insecure context) and that the desktop inspect mode is still usable.
 */

import { getOverlayRoot, styleAsPanel } from './overlay';

export class UnsupportedMessage {
  private readonly el: HTMLElement;

  constructor() {
    this.el = document.createElement('div');
    styleAsPanel(this.el);
    this.el.style.left = '16px';
    this.el.style.top = '16px';
    this.el.style.display = 'none';
    getOverlayRoot().appendChild(this.el);
  }

  /** Show with a specific reason. */
  show(reason: string): void {
    this.el.innerHTML = '';
    const title = document.createElement('div');
    title.textContent = 'Immersive AR unavailable';
    title.style.font = '700 14px/1.3 system-ui, sans-serif';
    title.style.marginBottom = '6px';

    const body = document.createElement('div');
    body.style.opacity = '0.9';
    body.textContent = reason;

    const note = document.createElement('div');
    note.style.marginTop = '8px';
    note.style.opacity = '0.75';
    note.textContent = 'You can still inspect the cuff in desktop mode (drag to orbit, scroll to zoom).';

    this.el.appendChild(title);
    this.el.appendChild(body);
    this.el.appendChild(note);
    this.el.style.display = 'block';
  }

  hide(): void {
    this.el.style.display = 'none';
  }
}

/** Compose a human reason string from environment flags. */
export function reasonForUnsupported(secure: boolean, webxr: boolean, ar: boolean): string {
  if (!secure) {
    return 'A secure context (HTTPS) is required for WebXR. Serve the app over HTTPS and reload.';
  }
  if (!webxr) {
    return 'This browser does not expose WebXR. Use Chrome or Comet on a supported Android XR device.';
  }
  if (!ar) {
    return 'This device/browser does not report immersive-AR support.';
  }
  return 'Immersive AR is not currently available.';
}
