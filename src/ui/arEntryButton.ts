/**
 * AR entry button (SPEC §3/§7, R8). The ONLY way to start a WebXR session — it must be a real DOM
 * element so the click is a genuine user gesture (WebXR requirement). Shown enabled only when
 * immersive-AR is available; otherwise disabled with an explanation.
 */

import { getOverlayRoot, styleAsButton } from './overlay';

export class ArEntryButton {
  private readonly button: HTMLButtonElement;
  private readonly hint: HTMLElement;
  private onEnter: (() => void) | null = null;
  private inSession = false;

  constructor() {
    const wrap = document.createElement('div');
    wrap.style.position = 'absolute';
    wrap.style.left = '50%';
    wrap.style.bottom = '28px';
    wrap.style.transform = 'translateX(-50%)';
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '8px';
    wrap.style.pointerEvents = 'none';

    this.button = document.createElement('button');
    this.button.textContent = 'Enter AR';
    styleAsButton(this.button, false);
    this.button.disabled = true;
    this.button.addEventListener('click', () => {
      if (this.button.disabled) return;
      if (this.inSession) return;
      if (this.onEnter) this.onEnter();
    });

    this.hint = document.createElement('div');
    this.hint.style.font = '12px/1.3 system-ui, sans-serif';
    this.hint.style.color = '#9aa3ad';
    this.hint.style.pointerEvents = 'none';
    this.hint.textContent = 'Checking AR support...';

    wrap.appendChild(this.button);
    wrap.appendChild(this.hint);
    getOverlayRoot().appendChild(wrap);
  }

  /** Register the enter-AR handler (invoked from the real click). */
  setOnEnter(cb: () => void): void {
    this.onEnter = cb;
  }

  /** Enable/disable based on AR availability + secure context. */
  setAvailable(available: boolean, reason?: string): void {
    if (this.inSession) return;
    this.button.disabled = !available;
    styleAsButton(this.button, available);
    this.hint.textContent = available
      ? 'Tap to start. Requires a hand gesture and HTTPS.'
      : reason ?? 'Immersive AR not available on this device/browser.';
  }

  /** Reflect active-session state (button becomes an exit affordance label). */
  setInSession(active: boolean): void {
    this.inSession = active;
    this.button.textContent = active ? 'In AR' : 'Enter AR';
    this.button.disabled = active;
    styleAsButton(this.button, !active);
    if (active) this.hint.textContent = 'Use the system gesture to exit AR.';
  }
}
