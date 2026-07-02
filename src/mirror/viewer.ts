/**
 * Mirror viewer (PC side).
 *
 * Runs on `/mirror.html`. Connects to the headset broadcaster over WebRTC using PeerJS
 * and renders the incoming MediaStream in a <video> element.
 *
 * Flow:
 *   1. User enters a session code (or code is provided via ?code= query string).
 *   2. We create our own peer id: `junevr-viewer-<code>-<random>`.
 *   3. We open a data connection to `junevr-host-<code>`.
 *   4. The broadcaster receives our data conn and calls us back with the media stream.
 *   5. On call event we answer() with no local stream and attach remote stream to <video>.
 */

import { Peer } from 'peerjs';

type Status = 'idle' | 'connecting' | 'live' | 'error';

function setStatus(state: Status, text: string): void {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = text;
  el.className = 'status' + (state === 'live' ? ' live' : state === 'error' ? ' err' : '');
}

function replaceStageWithVideo(): HTMLVideoElement {
  const stage = document.getElementById('stage');
  if (!stage) throw new Error('stage element missing');
  stage.innerHTML = '';
  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true; // required for autoplay on most browsers
  stage.appendChild(video);
  return video;
}

function connect(code: string): void {
  if (!code) {
    setStatus('error', 'Enter a code');
    return;
  }
  setStatus('connecting', 'Connecting…');

  const rand = Math.random().toString(36).slice(2, 8);
  const viewerId = `junevr-viewer-${code}-${rand}`;
  const hostId = `junevr-host-${code}`;

  const peer = new Peer(viewerId, { debug: 1 });

  peer.on('open', () => {
    // Open a data connection to the host — this triggers the host to call us back.
    const dc = peer.connect(hostId, { reliable: true });

    dc.on('open', () => {
      setStatus('connecting', 'Waiting for stream…');
    });

    dc.on('error', (err) => {
      console.error('data conn error', err);
      setStatus('error', 'Host not found');
    });
  });

  peer.on('call', (incoming) => {
    // Answer without sending anything (viewer is receive-only).
    incoming.answer();
    incoming.on('stream', (remoteStream) => {
      const video = replaceStageWithVideo();
      video.srcObject = remoteStream;
      setStatus('live', '● Live');
    });
    incoming.on('close', () => {
      setStatus('idle', 'Disconnected');
    });
  });

  peer.on('error', (err) => {
    console.error('peer error', err.type, err.message);
    setStatus('error', err.type === 'peer-unavailable' ? 'Host offline' : err.message);
  });
}

// Wire up UI.
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const input = document.getElementById('code-input') as HTMLInputElement | null;
  const btn = document.getElementById('connect-btn');
  const preset = params.get('code');
  if (preset && input) input.value = preset;

  btn?.addEventListener('click', () => {
    const code = input?.value.trim() ?? '';
    connect(code);
  });
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const code = input.value.trim();
      connect(code);
    }
  });

  // Auto-connect if code came via URL.
  if (preset) connect(preset);
});
