/**
 * Timeline controller (SPEC STEP 7).
 *
 * A tiny, dependency-free, allocation-free sequencer that plays a fixed list of named SEGMENTS over
 * time. Used by the Demonstration training mode to drive the cuff through the whole procedure
 * hands-off, and reusable for step transitions. It does NOT animate anything itself — it emits
 * `(segmentIndex, localProgress 0..1)` so the `CuffAnimator` / training scene applies motion. This
 * keeps motion policy in the animator and timing policy here.
 *
 * No per-frame allocation: segments are defined once; update only does number math + a callback.
 */

/** One timeline segment: an id (for the listener to interpret) and a duration in seconds. */
export interface TimelineSegment {
  readonly id: string;
  readonly durationSec: number;
}

/** Listener signature: called each frame the timeline is playing. */
export type TimelineListener = (
  segmentIndex: number,
  segmentId: string,
  localProgress: number,
  globalProgress: number,
) => void;

export class TimelineController {
  private segments: readonly TimelineSegment[] = [];
  private totalDuration = 0;

  private elapsed = 0;
  private playing = false;
  private looping = false;
  private listener: TimelineListener | null = null;
  private onComplete: (() => void) | null = null;

  /** Define (or replace) the segment list. Resets playback. */
  setSegments(segments: readonly TimelineSegment[]): void {
    this.segments = segments;
    let total = 0;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg) total += Math.max(0, seg.durationSec);
    }
    this.totalDuration = total;
    this.elapsed = 0;
    this.playing = false;
  }

  /** Per-frame listener (segment progress). */
  setListener(listener: TimelineListener): void {
    this.listener = listener;
  }

  /** Called once when a non-looping timeline reaches the end. */
  setOnComplete(cb: () => void): void {
    this.onComplete = cb;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Start (or restart) playback from the beginning. */
  play(loop = false): void {
    if (this.totalDuration <= 0) return;
    this.elapsed = 0;
    this.playing = true;
    this.looping = loop;
  }

  /** Pause playback (retains position). */
  pause(): void {
    this.playing = false;
  }

  /** Stop and rewind. */
  stop(): void {
    this.playing = false;
    this.elapsed = 0;
  }

  /**
   * Advance the timeline. `dt` seconds. Allocation-free.
   * Emits the active segment's local progress and the global progress to the listener.
   */
  update(dt: number): void {
    if (!this.playing || this.totalDuration <= 0) return;

    this.elapsed += dt;
    let end = false;
    if (this.elapsed >= this.totalDuration) {
      if (this.looping) {
        // Wrap (modulo keeps timing stable across long sessions).
        this.elapsed = this.elapsed % this.totalDuration;
      } else {
        this.elapsed = this.totalDuration;
        end = true;
      }
    }

    this.emitAt(this.elapsed);

    if (end) {
      this.playing = false;
      if (this.onComplete) this.onComplete();
    }
  }

  /** Resolve `t` seconds to a segment + local progress and notify the listener. */
  private emitAt(t: number): void {
    if (!this.listener) return;
    const global = this.totalDuration > 0 ? t / this.totalDuration : 0;

    let acc = 0;
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      if (!seg) continue;
      const dur = Math.max(0, seg.durationSec);
      if (t <= acc + dur || i === this.segments.length - 1) {
        const local = dur > 0 ? (t - acc) / dur : 1;
        this.listener(i, seg.id, local < 0 ? 0 : local > 1 ? 1 : local, global);
        return;
      }
      acc += dur;
    }
  }
}
