/**
 * serve.mjs — a tiny, zero-dependency static file server for the PRODUCTION build in `dist/`.
 *
 * This is the "lightest possible" way to serve the built files with plain Node (no Vite, no npm
 * packages). Use it as a fallback for `npm run preview`, or as a simple local host you can point the
 * headset at over `adb reverse`.
 *
 *   1. npm run build      # produces ./dist
 *   2. npm run serve      # serves ./dist at http://localhost:8080
 *
 * For an Android XR headset over USB:
 *   adb reverse tcp:8080 tcp:8080
 * then open http://localhost:8080 in Chrome on the headset (localhost is a secure context, so WebXR
 * immersive sessions are allowed).
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist');
const PORT = Number(process.env.PORT) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
};

const server = createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    const requested = normalize(join(DIST, pathname));
    // Prevent path traversal outside DIST.
    if (requested !== DIST && !requested.startsWith(DIST + sep)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    const info = await stat(requested).catch(() => null);
    const file = info && info.isFile() ? requested : join(DIST, 'index.html');

    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(500);
    res.end('Server error');
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('  Serving ./dist at:');
  console.log(`    http://localhost:${PORT}`);
  console.log('');
  console.log('  If ./dist is missing, run:  npm run build');
  console.log(`  Headset over USB:           adb reverse tcp:${PORT} tcp:${PORT}`);
  console.log('');
});
