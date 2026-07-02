/**
 * Minimal offline-capable service worker for June-VR.
 *
 * Strategy:
 *   - Precache the app shell on install (index.html, mirror.html, qr.html, manifest, icons).
 *   - Runtime cache-first for hashed /assets/* (immutable Vite output).
 *   - Network-first for HTML entry points so we get updates on every reload.
 *
 * PlayCanvas engine chunk and other hashed assets are safe to keep forever
 * (Vite content-hashes filenames on every build).
 */

const VERSION = 'june-vr-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/mirror.html',
  '/qr.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/favicon.ico',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(APP_SHELL.filter(Boolean))).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache the PeerJS signaling / WebRTC endpoints.
  if (url.host.includes('peerjs.com')) return;

  // Cache-first for hashed static assets.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then((hit) =>
        hit ||
        fetch(req).then((res) => {
          const clone = res.clone();
          caches.open(VERSION).then((c) => c.put(req, clone)).catch(() => {});
          return res;
        })
      )
    );
    return;
  }

  // Network-first for HTML.
  if (req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(VERSION).then((c) => c.put(req, clone)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('/index.html')))
    );
  }
});
