/**
 * QR launch page — renders scannable codes for the main app and mirror viewer.
 * Uses the deployed origin so the QR is always correct wherever it's hosted.
 */

import QRCode from 'qrcode';

function draw(canvasId: string, url: string, urlEl: HTMLElement | null): void {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (!canvas) return;
  QRCode.toCanvas(canvas, url, {
    width: 180,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#0a0c10', light: '#ffffff' },
  }).catch((err) => console.error('qr render failed', err));
  if (urlEl) urlEl.textContent = url;
}

document.addEventListener('DOMContentLoaded', () => {
  const origin = window.location.origin;
  draw('qr-main', `${origin}/`, document.getElementById('url-main'));
  draw('qr-mirror', `${origin}/mirror`, document.getElementById('url-mirror'));
});
