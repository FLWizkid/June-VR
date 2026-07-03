/**
 * Quality panel (SPEC §8). Lets the user force a quality tier (overriding adaptive selection),
 * cycle cuff size variants for demonstration, and bend the patient arm's elbow. Plain DOM.
 */

import { getOverlayRoot, styleAsPanel } from './overlay';
import { QualityTier, QUALITY_ORDER, getProfile } from '../config/qualityProfiles';
import { CuffSize, getVariant } from '../entities/cuffVariants';
import { ARM_POSE } from '../config/trainingConfig';
import { ValveState } from '../interaction/inflationController';

export class QualityPanel {
  private readonly el: HTMLElement;
  private readonly tierRow: HTMLElement;
  private readonly sizeLabel: HTMLElement;
  private readonly elbowLabel: HTMLElement;
  private readonly valveChip: HTMLElement;

  private onTier: ((tier: QualityTier) => void) | null = null;
  private onSize: ((size: CuffSize) => void) | null = null;
  private onInflate: (() => void) | null = null;
  private onElbow: ((deg: number) => void) | null = null;
  private onPump: (() => void) | null = null;
  private onValve: (() => void) | null = null;

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

    // Manual pump + release valve (mirrors clicking the bulb / gauge screen in the 3D scene).
    const pumpRow = document.createElement('div');
    pumpRow.style.display = 'flex';
    pumpRow.style.gap = '6px';
    const pumpBtn = this.makeChip('Pump bulb', () => this.onPump?.());
    this.valveChip = this.makeChip('Valve: Closed', () => this.onValve?.());
    pumpRow.appendChild(pumpBtn);
    pumpRow.appendChild(this.valveChip);

    // Elbow bend: live slider over the configured flexion range, starting at the 90° rest fold.
    const elbowRow = document.createElement('div');
    elbowRow.style.display = 'flex';
    elbowRow.style.alignItems = 'center';
    elbowRow.style.gap = '6px';
    const elbowTitle = document.createElement('span');
    elbowTitle.textContent = 'Elbow';
    elbowTitle.style.font = '600 12px/1 system-ui, sans-serif';
    const elbowSlider = document.createElement('input');
    elbowSlider.type = 'range';
    elbowSlider.min = String(ARM_POSE.elbowFlexionRangeDeg.min);
    elbowSlider.max = String(ARM_POSE.elbowFlexionRangeDeg.max);
    elbowSlider.step = '1';
    elbowSlider.value = String(ARM_POSE.elbowFlexionDeg);
    elbowSlider.style.pointerEvents = 'auto';
    elbowSlider.style.flex = '1';
    elbowSlider.style.minWidth = '90px';
    this.elbowLabel = document.createElement('span');
    this.elbowLabel.style.opacity = '0.9';
    this.elbowLabel.style.minWidth = '34px';
    this.elbowLabel.textContent = `${ARM_POSE.elbowFlexionDeg}°`;
    elbowSlider.addEventListener('input', () => {
      const deg = Number(elbowSlider.value);
      this.elbowLabel.textContent = `${deg}°`;
      this.onElbow?.(deg);
    });
    elbowRow.appendChild(elbowTitle);
    elbowRow.appendChild(elbowSlider);
    elbowRow.appendChild(this.elbowLabel);

    this.el.appendChild(title);
    this.el.appendChild(this.tierRow);
    this.el.appendChild(sizeRow);
    this.el.appendChild(inflateBtn);
    this.el.appendChild(pumpRow);
    this.el.appendChild(elbowRow);
    getOverlayRoot().appendChild(this.el);
  }

  private currentSize: CuffSize = CuffSize.Medium;

  setHandlers(handlers: {
    onTier: (tier: QualityTier) => void;
    onSize: (size: CuffSize) => void;
    onInflate: () => void;
    onElbow: (deg: number) => void;
    onPump: () => void;
    onValve: () => void;
  }): void {
    this.onTier = handlers.onTier;
    this.onSize = handlers.onSize;
    this.onInflate = handlers.onInflate;
    this.onElbow = handlers.onElbow;
    this.onPump = handlers.onPump;
    this.onValve = handlers.onValve;
  }

  /** Reflect the release-valve state (changed by UI or by pressing the gauge/bulb in 3D). */
  setValveState(state: ValveState): void {
    const label =
      state === ValveState.Closed
        ? 'Valve: Closed'
        : state === ValveState.Controlled
          ? 'Valve: Releasing'
          : 'Valve: Open';
    this.valveChip.textContent = label;
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
