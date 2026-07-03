/**
 * ui-overlay.js — the DOM status panel, Enter/Exit VR button, and a small event log.
 *
 * This is plain DOM layered over the canvas. It is what you see on a normal PC browser and BEFORE you
 * enter XR. It is intentionally framework-free (no React/Vue) to keep the starter tiny.
 *
 * The Enter VR button MUST be a real DOM button: browsers only allow a WebXR session to start from a
 * user gesture (a real click/tap), so the button click is what calls into the XR manager.
 */

export function createOverlay() {
  let root = document.getElementById('ui-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'ui-root';
    document.body.appendChild(root);
  }

  root.innerHTML = `
    <div id="panel">
      <div id="title">PlayCanvas WebXR Starter</div>
      <div id="support" class="status">Checking WebXR…</div>
      <div id="session" class="status">Session: inactive</div>
      <div id="input" class="status">Input: —</div>
      <button id="xr-button" disabled>Checking…</button>
      <div id="hint">
        Desktop: click the cube to select it.<br />
        Headset: press <b>Enter VR</b>, then pull the trigger / pinch to select the cube.
      </div>
      <div id="log" aria-live="polite"></div>
    </div>
  `;

  const supportEl = root.querySelector('#support');
  const sessionEl = root.querySelector('#session');
  const inputEl = root.querySelector('#input');
  const buttonEl = root.querySelector('#xr-button');
  const logEl = root.querySelector('#log');

  // The button always calls the currently-configured handler (set per app state).
  let handler = null;
  buttonEl.addEventListener('click', () => {
    if (handler) handler();
  });

  /** Append a short line to the on-screen log (newest first) and mirror it to the console. */
  function log(message) {
    const line = document.createElement('div');
    line.className = 'log-line';
    line.textContent = message;
    logEl.prepend(line);
    while (logEl.childElementCount > 8) logEl.removeChild(logEl.lastChild);
    // eslint-disable-next-line no-console
    console.log('[starter]', message);
  }

  /** Set the top "support/availability" status line. */
  function setSupport(text) {
    supportEl.textContent = text;
  }

  /** Reflect whether an immersive session is active. */
  function setSessionState(active) {
    sessionEl.textContent = 'Session: ' + (active ? 'ACTIVE (in headset)' : 'inactive');
    root.classList.toggle('xr-active', active);
  }

  /** Reflect the current XR input state (hands / controllers / none). */
  function setInput(text) {
    inputEl.textContent = text;
  }

  /** Configure the single action button: its label, enabled state, and click handler. */
  function configureButton({ label, enabled, onClick }) {
    buttonEl.textContent = label;
    buttonEl.disabled = !enabled;
    handler = enabled ? onClick || null : null;
  }

  return { root, log, setSupport, setSessionState, setInput, configureButton };
}
