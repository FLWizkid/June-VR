/**
 * Mirror Panel — small toggle UI shown on the headset that starts/stops
 * canvas broadcasting and displays the shared session code + viewer URL.
 *
 * Rendered inside #ui-root as a DOM overlay so it's readable both in flat
 * desktop preview and in the WebXR AR session (via DOM overlay layer).
 */

import { CanvasBroadcaster } from '../mirror/canvasBroadcaster';
import { createLogger } from '../utils/logging';

const log = createLogger('mirror-ui');

function randomCode(): string {
  const words = ['ruby', 'jade', 'onyx', 'opal', 'amber', 'coral', 'sage', 'ivory'];
  const w = words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(Math.random() * 900 + 100);
  return `${w}-${n}`;
}

export function mountMirrorPanel(canvas: HTMLCanvasElement): void {
  const root = document.getElementById('ui-root') ?? document.body;

  const box = document.createElement('div');
  box.style.cssText = [
    'position:fixed', 'top:12px', 'right:12px', 'z-index:20',
    'background:rgba(16,20,27,0.92)', 'color:#e8edf2',
    'border:1px solid #2a3340', 'border-radius:10px',
    'padding:10px 12px', 'font:500 12px/1.4 system-ui, sans-serif',
    'min-width:220px', 'backdrop-filter:blur(8px)',
    'pointer-events:auto',
  ].join(';');

  box.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:14px">📡</span>
      <strong style="font-size:13px">PC Mirror</strong>
      <span id="mirror-dot" style="margin-left:auto;width:8px;height:8px;border-radius:50%;background:#555"></span>
    </div>
    <div id="mirror-body">
      <button id="mirror-start" style="width:100%;padding:8px;background:#4a7cff;color:white;border:none;border-radius:6px;font-weight:600;cursor:pointer">Start Mirror</button>
    </div>
  `;

  root.appendChild(box);

  const dot = box.querySelector('#mirror-dot') as HTMLSpanElement;
  const body = box.querySelector('#mirror-body') as HTMLDivElement;
  const startBtn = box.querySelector('#mirror-start') as HTMLButtonElement;

  let broadcaster: CanvasBroadcaster | null = null;

  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    startBtn.textContent = 'Starting…';
    const code = randomCode();
    broadcaster = new CanvasBroadcaster(canvas);
    const result = await broadcaster.start(code);

    if (!result.ok) {
      body.innerHTML = `<div style="color:#ffb5b5">Failed: ${result.error ?? 'unknown'}</div>
        <button id="mirror-retry" style="margin-top:6px;width:100%;padding:6px;background:#2a3340;color:#e8edf2;border:none;border-radius:6px;cursor:pointer">Retry</button>`;
      body.querySelector('#mirror-retry')?.addEventListener('click', () => location.reload());
      dot.style.background = '#ff5555';
      log.error('mirror failed', result.error);
      return;
    }

    dot.style.background = '#22cc66';
    const url = result.viewerUrl ?? '';
    body.innerHTML = `
      <div style="margin-bottom:6px;opacity:0.8">Session code:</div>
      <div style="font-family:ui-monospace,monospace;font-size:14px;background:#0a0c10;padding:6px 8px;border-radius:6px;text-align:center;margin-bottom:8px">${code}</div>
      <div style="margin-bottom:6px;opacity:0.8">Open on PC:</div>
      <div style="font-family:ui-monospace,monospace;font-size:11px;background:#0a0c10;padding:6px 8px;border-radius:6px;word-break:break-all;margin-bottom:8px">${url}</div>
      <button id="mirror-stop" style="width:100%;padding:6px;background:#2a3340;color:#e8edf2;border:none;border-radius:6px;cursor:pointer">Stop</button>
    `;
    body.querySelector('#mirror-stop')?.addEventListener('click', () => {
      broadcaster?.stop();
      broadcaster = null;
      dot.style.background = '#555';
      body.innerHTML = `<button id="mirror-start-again" style="width:100%;padding:8px;background:#4a7cff;color:white;border:none;border-radius:6px;font-weight:600;cursor:pointer">Start Mirror</button>`;
      body.querySelector('#mirror-start-again')?.addEventListener('click', () => location.reload());
    });

    log.info(`mirror live: code=${code} url=${url}`);
  });
}
