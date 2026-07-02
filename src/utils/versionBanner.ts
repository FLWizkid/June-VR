/**
 * Version banner: renders a tiny corner label showing the current build's
 * git commit hash and build time. Values injected by Vite via `define`.
 *
 * Click the banner to copy the full version string.
 */

declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILD_TIME__: string;

export function mountVersionBanner(): void {
  const banner = document.createElement('div');
  banner.style.cssText = [
    'position:fixed', 'bottom:6px', 'left:6px', 'z-index:20',
    'padding:3px 8px', 'font:500 10px/1.4 ui-monospace,monospace',
    'background:rgba(10,12,16,0.7)', 'color:#7f8894',
    'border:1px solid #1e2530', 'border-radius:4px',
    'cursor:pointer', 'pointer-events:auto', 'user-select:none',
  ].join(';');

  const short = __APP_COMMIT__.slice(0, 7);
  banner.textContent = `v${__APP_VERSION__} · ${short}`;
  banner.title = `Build: ${__APP_BUILD_TIME__}\nCommit: ${__APP_COMMIT__}\nClick to copy`;

  banner.addEventListener('click', () => {
    const full = `v${__APP_VERSION__} commit ${__APP_COMMIT__} built ${__APP_BUILD_TIME__}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(full).catch(() => {});
    }
    banner.style.color = '#4a7cff';
    setTimeout(() => (banner.style.color = '#7f8894'), 400);
  });

  const root = document.getElementById('ui-root') ?? document.body;
  root.appendChild(banner);
}
