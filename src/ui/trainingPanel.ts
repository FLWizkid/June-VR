/**
 * Training panel (SPEC STEP 9 / §7 readable UI).
 *
 * Plain-DOM overlay (no UI framework — CLAUDE.md minimal deps) showing the active training step,
 * instruction, progress, corrective guidance, and mode/step controls. Mirrors the
 * `ProcedureStateMachine` status; the app wires the buttons to the training controller.
 *
 * Kept legible on an additive AR display (dark panel, high-contrast text). World-anchored UI is a
 * later enhancement; v1 uses the same screen-space overlay as the other panels.
 */

import { getOverlayRoot, styleAsPanel } from './overlay';
import { TrainingMode } from '../config/trainingConfig';
import type { TrainingStatus } from '../training/procedureStateMachine';
import { describeMode } from '../training/instructionalPrompts';

export interface TrainingPanelHandlers {
  readonly onMode: (mode: TrainingMode) => void;
  readonly onNext: () => void;
  readonly onRestart: () => void;
}

const MODES: readonly { mode: TrainingMode; label: string }[] = [
  { mode: TrainingMode.Guided, label: 'Guided' },
  { mode: TrainingMode.Placement, label: 'Placement' },
  { mode: TrainingMode.Inspection, label: 'Inspect' },
  { mode: TrainingMode.Demonstration, label: 'Demo' },
];

export class TrainingPanel {
  private readonly el: HTMLElement;
  private readonly modeRow: HTMLElement;
  private readonly header: HTMLElement;
  private readonly stepLine: HTMLElement;
  private readonly instruction: HTMLElement;
  private readonly correction: HTMLElement;
  private readonly progressBar: HTMLElement;
  private readonly progressFill: HTMLElement;

  private handlers: TrainingPanelHandlers | null = null;
  private activeMode: TrainingMode = TrainingMode.Guided;

  constructor() {
    this.el = document.createElement('div');
    styleAsPanel(this.el);
    this.el.style.left = '16px';
    this.el.style.top = '16px';
    this.el.style.display = 'flex';
    this.el.style.flexDirection = 'column';
    this.el.style.gap = '8px';
    this.el.style.maxWidth = '340px';

    this.header = document.createElement('div');
    this.header.style.font = '700 13px/1.3 system-ui, sans-serif';
    this.header.textContent = 'Training';

    this.modeRow = document.createElement('div');
    this.modeRow.style.display = 'flex';
    this.modeRow.style.flexWrap = 'wrap';
    this.modeRow.style.gap = '6px';
    for (const m of MODES) {
      this.modeRow.appendChild(this.makeChip(m.label, () => this.handlers?.onMode(m.mode)));
    }

    this.stepLine = document.createElement('div');
    this.stepLine.style.font = '600 12px/1.3 system-ui, sans-serif';
    this.stepLine.style.opacity = '0.85';

    this.instruction = document.createElement('div');
    this.instruction.style.font = '13px/1.45 system-ui, sans-serif';

    this.correction = document.createElement('div');
    this.correction.style.font = '12px/1.4 system-ui, sans-serif';
    this.correction.style.color = '#ffd27f';
    this.correction.style.display = 'none';

    // Progress bar.
    this.progressBar = document.createElement('div');
    this.progressBar.style.height = '6px';
    this.progressBar.style.borderRadius = '3px';
    this.progressBar.style.background = 'rgba(255,255,255,0.12)';
    this.progressBar.style.overflow = 'hidden';
    this.progressFill = document.createElement('div');
    this.progressFill.style.height = '100%';
    this.progressFill.style.width = '0%';
    this.progressFill.style.background = 'linear-gradient(90deg, #7fd4ff, #38b6ff)';
    this.progressFill.style.transition = 'width 120ms linear';
    this.progressBar.appendChild(this.progressFill);

    // Action row.
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '6px';
    actions.appendChild(this.makeChip('Next', () => this.handlers?.onNext()));
    actions.appendChild(this.makeChip('Restart', () => this.handlers?.onRestart()));

    this.el.appendChild(this.header);
    this.el.appendChild(this.modeRow);
    this.el.appendChild(this.stepLine);
    this.el.appendChild(this.instruction);
    this.el.appendChild(this.correction);
    this.el.appendChild(this.progressBar);
    this.el.appendChild(actions);
    getOverlayRoot().appendChild(this.el);
  }

  setHandlers(handlers: TrainingPanelHandlers): void {
    this.handlers = handlers;
  }

  /** Reflect a status snapshot from the state machine. */
  setStatus(status: TrainingStatus): void {
    this.activeMode = status.mode;
    this.header.textContent = describeMode(status.mode);
    this.stepLine.textContent = `Step ${status.stepIndex + 1} / ${status.stepCount}: ${status.prompt.title}`;

    // Show confirmation in place of instruction when satisfied (positive feedback).
    this.instruction.textContent = status.prompt.confirmation || status.prompt.instruction;
    this.instruction.style.color = status.prompt.confirmation ? '#9be7a8' : '#e8edf2';

    if (status.prompt.correction) {
      this.correction.style.display = 'block';
      this.correction.textContent = status.prompt.correction;
    } else {
      this.correction.style.display = 'none';
    }

    const pct = Math.round(status.prompt.progress * 100);
    this.progressFill.style.width = `${pct}%`;
    this.highlightMode();
  }

  private highlightMode(): void {
    const chips = this.modeRow.children;
    for (let i = 0; i < chips.length; i++) {
      const chip = chips[i] as HTMLElement | undefined;
      const m = MODES[i];
      if (!chip || !m) continue;
      const on = m.mode === this.activeMode;
      chip.style.background = on ? 'rgba(56,182,255,0.35)' : 'rgba(255,255,255,0.08)';
    }
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
