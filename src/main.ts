/**
 * Entry point. Boots the AR Blood Pressure Cuff application.
 *
 * The app runs in two modes from the same code:
 *   - Desktop / preview inspect mode (no WebXR needed) — drag to orbit, scroll to zoom.
 *   - Immersive optical see-through AR on Android XR (Chrome / Comet) via the "Enter AR" button.
 *
 * See SPEC.md / RUNBOOK.md / README.md.
 */

import { ARCuffApplication } from './core/app';
import { createLogger, setLogLevel, LogLevel } from './utils/logging';
import { mountMirrorPanel } from './ui/mirrorPanel';
import { mountVersionBanner } from './utils/versionBanner';
import { registerServiceWorker } from './utils/registerServiceWorker';

const log = createLogger('main');

function getCanvas(): HTMLCanvasElement {
  const el = document.getElementById('app-canvas');
  if (el instanceof HTMLCanvasElement) return el;
  // Create one if the host page didn't provide it.
  const canvas = document.createElement('canvas');
  canvas.id = 'app-canvas';
  document.body.appendChild(canvas);
  return canvas;
}

async function boot(): Promise<void> {
  // Verbose logging in dev; quieter in production builds.
  setLogLevel(import.meta.env?.DEV ? LogLevel.Debug : LogLevel.Info);

  const canvas = getCanvas();
  const application = new ARCuffApplication(canvas);

  try {
    await application.start();
    log.info('application ready');
    // Mount PC-mirror control panel (broadcasts canvas over WebRTC).
    mountMirrorPanel(canvas);
    // Version banner (bottom-left, click to copy build info).
    mountVersionBanner();
    // Offline service worker (production only).
    registerServiceWorker();
  } catch (err) {
    log.error('failed to start application', err);
    showFatal(err);
  }

  // Expose for debugging in the browser console.
  (window as unknown as { bpAR?: ARCuffApplication }).bpAR = application;
}

function showFatal(err: unknown): void {
  const div = document.createElement('div');
  div.style.position = 'fixed';
  div.style.inset = '0';
  div.style.display = 'flex';
  div.style.alignItems = 'center';
  div.style.justifyContent = 'center';
  div.style.padding = '24px';
  div.style.textAlign = 'center';
  div.style.background = '#0a0c10';
  div.style.color = '#ff8a8a';
  div.style.font = '500 15px/1.5 system-ui, sans-serif';
  div.textContent =
    'The AR application failed to start. ' +
    (err instanceof Error ? err.message : 'Unknown error.') +
    ' See the browser console for details.';
  document.body.appendChild(div);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void boot());
} else {
  void boot();
}
