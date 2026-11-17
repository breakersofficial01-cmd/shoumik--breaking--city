// Font loader (CLAUDE.md rule 7). The ONLY place that knows font names.
//
// Reads data/ui.json → fonts. If fonts.bn.fileInstalled is true it loads the custom Bangla
// font file (fonts.bn.file). If that is off, missing or broken, the Google Fonts fallback
// (fonts.bn.fallback) is used instead, and after that the device's own Bangla font.
// The chosen font stacks are exposed as CSS variables, and all CSS uses those:
//   --font-bn   Bangla text (and the default UI when the game is in Bangla)
//   --font-en   English text
//   --font-ui   the current UI language's stack (set by i18n.js)
//
// Canvas / 3D text (signboards, posters) must `await fontsReady()` before drawing and use
// `fontStack('bn')` for ctx.font.

import { log } from '../core/debug.js';

const stacks = { bn: 'sans-serif', en: 'sans-serif' };
let readyPromise = Promise.resolve();

const quote = (family) => (/^[a-z-]+$/i.test(family) ? family : `'${family}'`);

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

/** Add a <link rel=stylesheet> and wait until it has loaded (or failed). */
function loadStylesheet(url) {
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.onload = resolve;
    link.onerror = () => reject(new Error('stylesheet failed'));
    document.head.appendChild(link);
  });
}

async function loadBangla(bn, timeoutMs) {
  // Start the fallback stylesheet right away (it is tiny) so a missing custom file costs
  // no extra waiting. It also covers any letters the custom font might lack.
  const fallbackCss = withTimeout(loadStylesheet(bn.googleFontsFallbackUrl), timeoutMs).then(() => true, () => false);

  // 1) The licensed custom font file — only tried when ui.json says it is installed, so a
  //    missing file never causes a failed download (and a console error) on every launch.
  if (bn.fileInstalled) {
    try {
      const face = new FontFace(bn.family, `url("${bn.file}")`, { display: 'swap' });
      await withTimeout(face.load(), timeoutMs);
      document.fonts.add(face);
      stacks.bn = `${quote(bn.family)}, ${bn.fallback}`;
      log.info(`Bangla font: ${bn.family} (custom file)`);
      return 'custom';
    } catch (err) {
      log.warn(`Bangla font file could not be loaded (${bn.file}); using the fallback font`, err.message);
    }
  }

  // 2) Fallback web font. If even this fails (offline), the system Bangla font is used.
  stacks.bn = bn.fallback;
  if (!(await fallbackCss)) {
    log.warn('Bangla fallback font could not be downloaded; using a system font');
    return 'system';
  }
  try {
    const first = bn.fallback.split(',')[0].trim();
    // Fetch the Bangla glyphs now, so the first Bangla text doesn't flash in a wrong font.
    await withTimeout(Promise.all([document.fonts.load(`400 16px ${first}`, 'বাংলা'), document.fonts.load(`700 16px ${first}`, 'বাংলা')]), timeoutMs);
    return 'fallback';
  } catch (err) {
    log.warn('Bangla fallback font is slow to download; text will switch to it when ready', err.message);
    return 'fallback';
  }
}

/**
 * Load fonts from the ui.json config. Never throws; worst case system fonts are used.
 * @param {object} uiCfg  data/ui.json
 * @returns {Promise<string>} which Bangla font is active: custom | fallback | system
 */
export async function loadFonts(uiCfg) {
  const { bn, en } = uiCfg.fonts;
  const timeoutMs = uiCfg.loading?.fontTimeoutMs ?? 4000;
  stacks.en = `${quote(en.family)}, ${en.fallback}`;
  const task = loadBangla(bn, timeoutMs);
  readyPromise = task.then(() => document.fonts.ready).catch(() => {});
  const result = await task;
  const root = document.documentElement.style;
  root.setProperty('--font-bn', stacks.bn);
  root.setProperty('--font-en', stacks.en);
  return result;
}

/** CSS font-family value for a language ('bn' | 'en'). */
export function fontStack(lang) {
  return stacks[lang] || stacks.en;
}

/** Resolves when fonts are usable for canvas text. */
export function fontsReady() {
  return readyPromise;
}
