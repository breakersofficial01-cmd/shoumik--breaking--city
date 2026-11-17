// Debug helpers. `?debug=1` in the URL turns on console logs and the FPS panel.
// Warnings and errors are always printed.

const params = new URLSearchParams(location.search);

export const debug = {
  enabled: params.get('debug') === '1',
  /** Read any URL flag, e.g. flag('quality') for ?quality=low */
  flag: (name) => params.get(name),
  panel: null,
  frames: 0,
  time: 0,
  fps: 0,
  lines: {},
};

export const log = {
  info: (...a) => { if (debug.enabled) console.log('[BC]', ...a); },
  warn: (...a) => console.warn('[BC]', ...a),
  error: (...a) => console.error('[BC]', ...a),
};

/** Create the on-screen FPS / stats panel (debug only). */
export function initDebugPanel() {
  if (!debug.enabled) return;
  const el = document.createElement('pre');
  el.id = 'debug-panel';
  document.body.appendChild(el);
  debug.panel = el;
}

/** Features can add their own line: debugLine('player', 'x=1 z=2'). */
export function debugLine(key, text) {
  if (debug.enabled) debug.lines[key] = text;
}

/** Called once per frame by the game loop. Refreshes the panel twice a second. */
export function tickDebug(dt, renderer) {
  if (!debug.enabled || !debug.panel) return;
  debug.frames++;
  debug.time += dt;
  if (debug.time < 0.5) return;
  debug.fps = Math.round(debug.frames / debug.time);
  debug.frames = 0;
  debug.time = 0;
  const r = renderer.info.render;
  const m = renderer.info.memory;
  const lines = [
    `FPS ${debug.fps}`,
    `calls ${r.calls}  tris ${(r.triangles / 1000).toFixed(1)}k`,
    `geo ${m.geometries}  tex ${m.textures}`,
    ...Object.values(debug.lines),
  ];
  debug.panel.textContent = lines.join('\n');
}
