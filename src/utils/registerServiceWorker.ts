/**
 * Register the offline service worker in production only.
 * In dev, an SW would cache stale bundles between Vite HMR reloads.
 */

import { createLogger } from './logging';

const log = createLogger('sw');

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env?.DEV) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => log.info('service worker registered', reg.scope))
      .catch((err) => log.warn('service worker registration failed', err));
  });
}
