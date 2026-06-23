/**
 * Status panel (SPEC §7/§9, R1). Live readout of capability state, active interaction layer, and
 * performance (fps + quality tier). This is also the "debug output for capability state" required by
 * the AR behavior spec.
 */

import { getOverlayRoot, styleAsPanel } from './overlay';
import type { PerfSnapshot } from '../core/performanceMonitor';
import { getProfile } from '../config/qualityProfiles';

export class StatusPanel {
  private readonly el: HTMLElement;
  private readonly capsLine: HTMLElement;
  private readonly perfLine: HTMLElement;
  private visible = true;

  constructor() {
    this.el = document.createElement('div');
    styleAsPanel(this.el);
    this.el.style.right = '16px';
    this.el.style.top = '16px';
    this.el.style.whiteSpace = 'pre';
    this.el.style.font = '12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace';

    const title = document.createElement('div');
    title.textContent = 'Status';
    title.style.font = '700 12px/1.3 system-ui, sans-serif';
    title.style.marginBottom = '6px';

    this.capsLine = document.createElement('div');
    this.perfLine = document.createElement('div');
    this.perfLine.style.marginTop = '6px';
    this.perfLine.style.opacity = '0.9';

    this.el.appendChild(title);
    this.el.appendChild(this.capsLine);
    this.el.appendChild(this.perfLine);
    getOverlayRoot().appendChild(this.el);
  }

  /** Update the capability/interaction text block. */
  setCapabilities(text: string): void {
    this.capsLine.textContent = text;
  }

  /** Update the performance line. */
  setPerformance(perf: PerfSnapshot): void {
    const profile = getProfile(perf.tier);
    const fps = perf.fps > 0 ? perf.fps.toFixed(0) : '--';
    const ms = perf.avgFrameMs > 0 ? perf.avgFrameMs.toFixed(1) : '--';
    this.perfLine.textContent = `quality: ${profile.label}  |  ${fps} fps  (${ms} ms)`;
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? 'block' : 'none';
  }
}
