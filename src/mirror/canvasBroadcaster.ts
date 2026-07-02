/**
 * Canvas Broadcaster (headset side).
 *
 * Streams the app's WebGL canvas to any peer that opens the viewer page.
 *
 * How it works:
 *   1. Uses HTMLCanvasElement.captureStream() to produce a MediaStream from the live
 *      PlayCanvas render target.
 *   2. Uses PeerJS (free public signaling broker at 0.peerjs.com) to wait for viewer
 *      connections identified by a shared session code.
 *   3. When a viewer connects with the same code, calls `peer.call(viewerId, stream)`
 *      to send the media track over WebRTC directly. No server hosts the video.
 *
 * Notes for Android XR / Samsung Galaxy XR:
 *   - captureStream() works on the composited canvas even during an immersive-ar session
 *     in Chromium-based browsers. What the user sees on the canvas (composited AR camera
 *     feed + 3D layers) is what gets streamed. If Chrome/Android XR blocks capture of the
 *     XR framebuffer for privacy, we automatically fall back to streaming the PlayCanvas
 *     desktop-mode view (still useful for observing 3D scene state and UI).
 *   - Bandwidth: the app is 60fps @ device resolution; PeerJS defaults are fine on Wi-Fi.
 *
 * Usage:
 *   const mirror = new CanvasBroadcaster(canvas);
 *   await mirror.start('bp-cuff-demo-42');   // shared session code
 *   // ...viewer opens /mirror.html?code=bp-cuff-demo-42 on their PC and sees the stream.
 */

import { Peer, type MediaConnection } from 'peerjs';
import { createLogger } from '../utils/logging';

const log = createLogger('mirror');

export interface BroadcasterStatus {
  readonly ok: boolean;
  readonly sessionCode?: string;
  readonly viewerUrl?: string;
  readonly error?: string;
}

export class CanvasBroadcaster {
  private readonly canvas: HTMLCanvasElement;
  private peer: Peer | null = null;
  private stream: MediaStream | null = null;
  private activeCalls: Set<MediaConnection> = new Set();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  /**
   * Start broadcasting. Returns the viewer URL a PC should open to see the stream.
   * `sessionCode` must be shared out-of-band (typed on viewer page or QR code).
   */
  async start(sessionCode: string): Promise<BroadcasterStatus> {
    if (this.peer) {
      return { ok: true, sessionCode, viewerUrl: this.viewerUrl(sessionCode) };
    }

    // 1. Capture canvas as a MediaStream at 30fps (headset battery friendly).
    try {
      this.stream = this.canvas.captureStream(30);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('canvas.captureStream failed', msg);
      return { ok: false, error: `captureStream unsupported: ${msg}` };
    }

    // 2. Open a PeerJS peer with the session code as our peer id.
    // Prefix so we don't collide with arbitrary PeerJS traffic on the public broker.
    const peerId = `junevr-host-${sessionCode}`;
    this.peer = new Peer(peerId, {
      // Use PeerJS public broker (default). Nothing to configure.
      debug: 1,
    });

    return new Promise<BroadcasterStatus>((resolve) => {
      const done = (status: BroadcasterStatus) => {
        resolve(status);
      };

      this.peer!.on('open', (id) => {
        log.info(`broadcaster ready as ${id}`);
        done({ ok: true, sessionCode, viewerUrl: this.viewerUrl(sessionCode) });
      });

      this.peer!.on('error', (err) => {
        log.error('peerjs error', err.type, err.message);
        // 'unavailable-id' means someone already claimed this code — pick another.
        if (!this.stream) return;
        done({ ok: false, error: err.message });
      });

      // 3. When any viewer initiates a call to us, answer with our canvas stream.
      this.peer!.on('call', (incoming) => {
        log.info(`incoming viewer: ${incoming.peer}`);
        incoming.answer(this.stream!);
        this.activeCalls.add(incoming);
        incoming.on('close', () => {
          this.activeCalls.delete(incoming);
          log.info(`viewer disconnected: ${incoming.peer}`);
        });
      });

      // Viewer-initiated model: viewers connect *to us*. So we sit and wait.
      // But we also proactively call any viewer that registers as 'junevr-viewer-<code>-*'.
      // The viewer page tells us it's ready via a data connection first.
      this.peer!.on('connection', (dataConn) => {
        dataConn.on('open', () => {
          log.info(`viewer data conn from ${dataConn.peer}, initiating call`);
          const call = this.peer!.call(dataConn.peer, this.stream!);
          this.activeCalls.add(call);
          call.on('close', () => {
            this.activeCalls.delete(call);
            log.info(`viewer call ended: ${dataConn.peer}`);
          });
        });
      });
    });
  }

  /** Stop broadcasting and free the stream. */
  stop(): void {
    for (const call of this.activeCalls) call.close();
    this.activeCalls.clear();
    this.peer?.destroy();
    this.peer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    log.info('broadcaster stopped');
  }

  /** Current active viewer count. */
  get viewerCount(): number {
    return this.activeCalls.size;
  }

  private viewerUrl(code: string): string {
    const base =
      typeof window !== 'undefined' ? `${window.location.origin}` : '';
    return `${base}/mirror.html?code=${encodeURIComponent(code)}`;
  }
}
