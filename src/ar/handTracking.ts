/**
 * Hand tracking access layer (SPEC §5 primary, R2).
 *
 * Wraps `app.xr.input` to surface tracked hands and their pinch gestures. Tracks input-source
 * add/remove so the interaction layer can re-select live when hands appear/disappear.
 *
 * Verified APIs (playcanvas@2.19): app.xr.input.inputSources: XrInputSource[],
 * XrInputSource.hand: XrHand | null, XrInputSource.handedness, events 'add'/'remove' on XrInput.
 */

import * as pc from 'playcanvas';
import { HandGesture, type PinchState } from './gestureInterpreter';
import { createLogger } from '../utils/logging';

const log = createLogger('hands');

export interface HandFrame {
  /** Pinch state for the hand, or null if that hand is not currently tracked. */
  readonly left: PinchState | null;
  readonly right: PinchState | null;
  /** True if at least one hand is currently tracked with valid joints. */
  readonly anyTracked: boolean;
}

export class HandTracking {
  private readonly app: pc.AppBase;
  private readonly leftGesture = new HandGesture();
  private readonly rightGesture = new HandGesture();
  private readonly frame: { left: PinchState | null; right: PinchState | null; anyTracked: boolean } = {
    left: null,
    right: null,
    anyTracked: false,
  };

  private onChange: (() => void) | null = null;
  private boundAdd = (source: pc.XrInputSource): void => this.handleSourceChange(source, true);
  private boundRemove = (source: pc.XrInputSource): void => this.handleSourceChange(source, false);

  constructor(app: pc.AppBase) {
    this.app = app;
  }

  /** Subscribe to input-source presence changes (for live layer re-selection). */
  setOnChange(cb: () => void): void {
    this.onChange = cb;
  }

  /** Begin listening to XR input source changes. Call when a session starts. */
  attach(): void {
    const input = this.app.xr?.input;
    if (!input) return;
    input.on('add', this.boundAdd);
    input.on('remove', this.boundRemove);
  }

  /** Stop listening (call on session end). */
  detach(): void {
    const input = this.app.xr?.input;
    if (input) {
      input.off('add', this.boundAdd);
      input.off('remove', this.boundRemove);
    }
    this.leftGesture.reset();
    this.rightGesture.reset();
    this.frame.left = null;
    this.frame.right = null;
    this.frame.anyTracked = false;
  }

  /** True if any input source currently exposes a hand. */
  hasHands(): boolean {
    const sources = this.app.xr?.input?.inputSources ?? [];
    for (let i = 0; i < sources.length; i++) {
      if (sources[i]?.hand) return true;
    }
    return false;
  }

  /**
   * Per-frame update. Reads current hands and updates gestures. Allocation-free.
   * Returns the (owned) HandFrame snapshot.
   */
  update(): HandFrame {
    const sources = this.app.xr?.input?.inputSources ?? [];
    let left: PinchState | null = null;
    let right: PinchState | null = null;
    let anyTracked = false;

    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      if (!src) continue;
      const hand = src.hand;
      if (!hand) continue;

      if (src.handedness === pc.XRHAND_LEFT) {
        const s = this.leftGesture.update(hand);
        left = s;
        if (s.valid) anyTracked = true;
      } else if (src.handedness === pc.XRHAND_RIGHT) {
        const s = this.rightGesture.update(hand);
        right = s;
        if (s.valid) anyTracked = true;
      } else {
        // Unhanded tracked hand (rare): treat as right.
        const s = this.rightGesture.update(hand);
        right = s;
        if (s.valid) anyTracked = true;
      }
    }

    this.frame.left = left;
    this.frame.right = right;
    this.frame.anyTracked = anyTracked;
    return this.frame;
  }

  private handleSourceChange(source: pc.XrInputSource, added: boolean): void {
    if (source.hand) {
      log.debug(`hand ${source.handedness} ${added ? 'added' : 'removed'}`);
      if (this.onChange) this.onChange();
    }
  }
}
