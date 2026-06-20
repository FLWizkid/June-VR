/**
 * DOM overlay root + shared styling helpers (SPEC §7 readable UI).
 *
 * UI is plain DOM layered over the canvas (#ui-root in index.html). This avoids pulling in a UI
 * framework (CLAUDE.md: minimal deps) and is reliable for the AR entry button (which must be a real
 * DOM element receiving a user gesture to start WebXR).
 */

/** Get (or lazily create) the overlay root element. */
export function getOverlayRoot(): HTMLElement {
  let root = document.getElementById('ui-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'ui-root';
    root.style.position = 'fixed';
    root.style.inset = '0';
    root.style.pointerEvents = 'none';
    document.body.appendChild(root);
  }
  return root;
}

/** Shared panel style (dark, legible, unobtrusive). */
export function styleAsPanel(el: HTMLElement): void {
  el.style.position = 'absolute';
  el.style.background = 'rgba(12, 14, 18, 0.82)';
  el.style.color = '#e8edf2';
  el.style.font = '13px/1.4 system-ui, -apple-system, sans-serif';
  el.style.padding = '10px 12px';
  el.style.borderRadius = '10px';
  el.style.border = '1px solid rgba(255,255,255,0.08)';
  el.style.backdropFilter = 'blur(6px)';
  el.style.pointerEvents = 'auto';
  el.style.userSelect = 'none';
  el.style.maxWidth = '320px';
}

/** Style a primary action button. */
export function styleAsButton(el: HTMLElement, enabled = true): void {
  el.style.pointerEvents = 'auto';
  el.style.cursor = enabled ? 'pointer' : 'not-allowed';
  el.style.font = '600 15px/1 system-ui, sans-serif';
  el.style.padding = '14px 22px';
  el.style.borderRadius = '12px';
  el.style.border = 'none';
  el.style.color = enabled ? '#06121a' : '#9aa3ad';
  el.style.background = enabled
    ? 'linear-gradient(180deg, #7fd4ff, #38b6ff)'
    : 'rgba(255,255,255,0.08)';
  el.style.boxShadow = enabled ? '0 6px 18px rgba(56,182,255,0.35)' : 'none';
  el.style.opacity = enabled ? '1' : '0.7';
}
