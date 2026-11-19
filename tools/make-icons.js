// Makes the app icons for the installable game (Session 8). Not part of the game.
//
//   node tools/make-icons.js
//
// Draws the Breaking City logo (synthwave sunset + "BC") on a canvas in headless Chromium and
// saves the PNGs that manifest.webmanifest and index.html point to:
//   assets/icons/icon-192.png, icon-512.png      normal app icons
//   assets/icons/maskable-512.png                Android "adaptive" icon (logo inside the safe circle)
//   assets/icons/apple-touch-icon.png (180)      iPhone home screen
//   assets/icons/favicon-32.png                  browser tab
// To use a designer's icon instead, just replace these files (same names and sizes).

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = path.resolve(__dirname, '..', 'assets', 'icons');
const ICONS = [
  { file: 'icon-192.png', size: 192, safe: 1 },
  { file: 'icon-512.png', size: 512, safe: 1 },
  { file: 'maskable-512.png', size: 512, safe: 0.78 }, // Android crops to a circle/squircle
  { file: 'apple-touch-icon.png', size: 180, safe: 1 },
  { file: 'favicon-32.png', size: 32, safe: 1 },
];

// Runs inside the browser page. `safe` shrinks the logo so masks never cut it.
function draw({ size, safe }) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const s = size / 512;
  // Night-purple background with a warm glow at the horizon.
  const bg = g.createLinearGradient(0, 0, 0, size);
  bg.addColorStop(0, '#1b1238');
  bg.addColorStop(0.62, '#4a1f5e');
  bg.addColorStop(1, '#ff6f91');
  g.fillStyle = bg;
  g.fillRect(0, 0, size, size);
  g.save();
  g.translate(size / 2, size / 2);
  g.scale(safe, safe);
  g.translate(-size / 2, -size / 2);
  // Striped sunset sun.
  const cx = 256 * s, cy = 300 * s, r = 170 * s;
  g.save();
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.clip();
  const sun = g.createLinearGradient(0, cy - r, 0, cy + r);
  sun.addColorStop(0, '#ffe38a');
  sun.addColorStop(1, '#ff4f8b');
  g.fillStyle = sun;
  g.fillRect(cx - r, cy - r, r * 2, r * 2);
  g.fillStyle = '#4a1f5e';
  for (let i = 0; i < 6; i++) {
    const y = cy + i * 26 * s;
    g.fillRect(cx - r, y, r * 2, (4 + i * 2.2) * s);
  }
  g.restore();
  // "BC" in the loading-screen style: italic, white with pink + ink shadows, cyan C.
  g.font = `italic 900 ${250 * s}px system-ui, 'Segoe UI', Roboto, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const x = 256 * s, y = 236 * s;
  g.save();
  g.translate(x, y);
  g.rotate(-0.07);
  const text = (str, dx, color, shadow1) => {
    g.fillStyle = '#140d26';
    g.fillText(str, dx + 14 * s, 14 * s);
    g.fillStyle = shadow1;
    g.fillText(str, dx + 7 * s, 7 * s);
    g.fillStyle = color;
    g.fillText(str, dx, 0);
  };
  text('B', -78 * s, '#ffffff', '#ff4f8b');
  text('C', 82 * s, '#4ff0ff', '#ffffff');
  g.restore();
  g.restore();
  return c.toDataURL('image/png');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const icon of ICONS) {
    const url = await page.evaluate(draw, { size: icon.size, safe: icon.safe });
    fs.writeFileSync(path.join(OUT, icon.file), Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', icon.file);
  }
  await browser.close();
})();
