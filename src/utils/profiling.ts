/**
 * Tiny rolling-average frame-time sampler used by the performance monitor and status panel.
 *
 * Allocation-free after construction: it writes into a fixed-size ring buffer.
 */

export class RollingAverage {
  private readonly samples: Float32Array;
  private index = 0;
  private count = 0;
  private sum = 0;

  /** @param size - Number of samples to average over. */
  constructor(size: number) {
    this.samples = new Float32Array(Math.max(1, size | 0));
  }

  /** Add a sample (e.g. a frame time in ms) and return the current average. */
  add(value: number): number {
    const prev = this.samples[this.index] ?? 0;
    this.sum += value - prev;
    this.samples[this.index] = value;
    this.index = (this.index + 1) % this.samples.length;
    if (this.count < this.samples.length) this.count++;
    return this.average;
  }

  /** Current rolling average (0 if no samples yet). */
  get average(): number {
    return this.count === 0 ? 0 : this.sum / this.count;
  }

  /** True once the buffer has filled at least once. */
  get isWarm(): boolean {
    return this.count >= this.samples.length;
  }

  /** Reset all samples. */
  reset(): void {
    this.samples.fill(0);
    this.index = 0;
    this.count = 0;
    this.sum = 0;
  }
}

/** Convert a frame time in milliseconds to frames-per-second (guards divide-by-zero). */
export function frameTimeToFps(ms: number): number {
  return ms > 0 ? 1000 / ms : 0;
}
