// Guesses whether this device is weak, so the first launch starts on Low quality (Session 8).
// The rules (memory, CPU cores, slow graphics chips) live in data/performance.json → weakDevice.
// The features/autoQuality watchdog later corrects the guess from the real frame rate.

let gpuName = null;

/** The graphics chip's name, e.g. "Adreno (TM) 610" or "Mali-G52". '' when the browser hides it. */
export function gpuRenderer() {
  if (gpuName !== null) return gpuName;
  gpuName = '';
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return gpuName;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    gpuName = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext(); // free it again right away
  } catch { /* some browsers block this: just skip the GPU test */ }
  return gpuName;
}

/**
 * @param {object} rules data/performance.json → weakDevice
 * @returns {{ weak: boolean, reason: string }}
 */
export function checkDevice(rules) {
  const mem = navigator.deviceMemory; // GB, Chrome only (undefined elsewhere)
  const cores = navigator.hardwareConcurrency;
  if (mem && mem <= rules.maxMemoryGB) return { weak: true, reason: `memory ${mem} GB` };
  if (cores && cores <= rules.maxCores) return { weak: true, reason: `${cores} CPU cores` };
  const gpu = gpuRenderer();
  const slow = (rules.gpuPatterns || []).find((p) => new RegExp(p, 'i').test(gpu));
  if (slow) return { weak: true, reason: `graphics chip "${gpu}"` };
  return { weak: false, reason: gpu || 'unknown' };
}
