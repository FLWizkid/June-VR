/**
 * Quality panel (SPEC §8). Lets the user force a quality tier (overriding adaptive selection) and
 * cycle cuff size variants for demonstration. Plain DOM.
 */

import { getOverlayRoot, styleAsPanel } from './overlay';
import { QualityTier, QUALITY_ORDER, getProfile } from '../config/qualityProfiles';
import { CuffSize, getVariant } from '../entities/cuffVariants';

export class QualityPanel {
  private readonly el: HTMLElement;
  private readonly tierRow: HTMLElement;
  private readonly sizeLabel: HTMLElement;

  private onTier: ((tier: QualityTier) => void) | null = null;
  private onSize: ((size: CuffSize) => void) | null = null;
  private onInflate: (() => void) | null = null;

  constructor() {
    this.el = document.createElement('div');
    styleAsPanel(this.el);
    this.el.style.left = '16px';
    this.el.style.bottom = '16px';
    this.el.style.display = 'flex';
    this.el.style.flexDirection = 'column';
    this.el.style.gap = '8px';

    const title = document.createElement('div');
    title.textContent = 'Controls';
    title.style.font = '700 12px/1.3 system-ui, sans-serif';

    this.tierRow = document.createElement('div');
    this.tierRow.style.display = 'flex';
    this.tierRow.style.gap = '6px';
    for (const tier of QUALITY_ORDER) {
      this.tierRow.appendChild(this.makeChip(getProfile(tier).label, () => this.onTier?.(tier)));
    }

    const sizeRow = document.createElement('div');
    sizeRow.style.display = 'flex';
    sizeRow.style.alignItems = 'center';
    sizeRow.style.gap = '6px';
    this.sizeLabel = document.createElement('span');
    this.sizeLabel.style.opacity = '0.9';
    this.sizeLabel.textContent = getVariant(CuffSize.Medium).label;
    const sizeBtn = this.makeChip('Cycle size', () => this.cycleSize());
    sizeRow.appendChild(sizeBtn);
    sizeRow.appendChild(this.sizeLabel);

    const inflateBtn = this.makeChip('Inflate cycle', () => this.onInflate?.());

    this.el.appendChild(title);
    this.el.appendChild(this.tierRow);
    this.el.appendChild(sizeRow);
    this.el.appendChild(inflateBtn);
    getOverlayRoot().appendChild(this.el);
  }

  private currentSize: CuffSize = CuffSize.Medium;

  setHandlers(handlers: {
    onTier: (tier: QualityTier) => void;
    onSize: (size: CuffSize) => void;
    onInflate: () => void;
  }): void {
    this.onTier = handlers.onTier;
    this.onSize = handlers.onSize;
    this.onInflate = handlers.onInflate;
  }

  /** Reflect the externally-active tier (e.g. after adaptive change). */
  setActiveTier(tier: QualityTier): void {
    const chips = this.tierRow.children;
    for (let i = 0; i < chips.length; i++) {
      const chip = chips[i] as HTMLElement | undefined;
      if (!chip) continue;
      const active = QUALITY_ORDER[i] === tier;
      chip.style.background = active ? 'rgba(56,182,255,0.35)' : 'rgba(255,255,255,0.08)';
    }
  }

  private cycleSize(): void {
    const order = [CuffSize.PediatricSmall, CuffSize.Medium, CuffSize.Large];
    const idx = order.indexOf(this.currentSize);
    const next = order[(idx + 1) % order.length] ?? CuffSize.Medium;
    this.currentSize = next;
    this.sizeLabel.textContent = getVariant(next).label;
    this.onSize?.(next);
  }

  private makeChip(label: string, onClick: () => void): HTMLElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.pointerEvents = 'auto';
    b.style.cursor = 'pointer';
    b.style.font = '600 12px/1 system-ui, sans-serif';
    b.style.padding = '8px 10px';
    b.style.borderRadius = '8px';
    b.style.border = '1px solid rgba(255,255,255,0.12)';
    b.style.background = 'rgba(255,255,255,0.08)';
    b.style.color = '#e8edf2';
    b.addEventListener('click', onClick);
    return b;
  }
}
