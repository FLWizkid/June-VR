/**
 * Loading screen (SPEC §7 first-load budget). Shown until the scene is ready; supports a progress
 * message so the 2–5 s startup feels intentional. Plain DOM.
 */

import { getOverlayRoot } from './overlay';

export class LoadingScreen {
  private readonly el: HTMLElement;
  private readonly message: HTMLElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.style.position = 'absolute';
    this.el.style.inset = '0';
    this.el.style.display = 'flex';
    this.el.style.flexDirection = 'column';
    this.el.style.alignItems = 'center';
    this.el.style.justifyContent = 'center';
    this.el.style.gap = '16px';
    this.el.style.background = 'radial-gradient(circle at 50% 40%, #11151c, #07090d)';
    this.el.style.color = '#e8edf2';
    this.el.style.font = '500 16px/1.4 system-ui, sans-serif';
    this.el.style.pointerEvents = 'auto';
    this.el.style.zIndex = '50';

    const title = document.createElement('div');
    title.textContent = 'AR Blood Pressure Cuff';
    title.style.font = '700 20px/1 system-ui, sans-serif';
    title.style.letterSpacing = '0.3px';

    const spinner = document.createElement('div');
    spinner.style.width = '34px';
    spinner.style.height = '34px';
    spinner.style.border = '3px solid rgba(255,255,255,0.18)';
    spinner.style.borderTopColor = '#38b6ff';
    spinner.style.borderRadius = '50%';
    spinner.style.animation = 'bp-spin 0.9s linear infinite';

    this.message = document.createElement('div');
    this.message.textContent = 'Preparing scene...';
    this.message.style.opacity = '0.8';

    ensureSpinKeyframes();

    this.el.appendChild(title);
    this.el.appendChild(spinner);
    this.el.appendChild(this.message);
    getOverlayRoot().appendChild(this.el);
  }

  setMessage(text: string): void {
    this.message.textContent = text;
  }

  hide(): void {
    this.el.style.transition = 'opacity 0.4s ease';
    this.el.style.opacity = '0';
    window.setTimeout(() => this.el.remove(), 420);
  }
}

let keyframesInjected = false;
function ensureSpinKeyframes(): void {
  if (keyframesInjected) return;
  keyframesInjected = true;
  const style = document.createElement('style');
  style.textContent = '@keyframes bp-spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(style);
}
