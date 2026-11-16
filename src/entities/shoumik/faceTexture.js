// Shoumik's face texture. Takes assets/shoumik/face.png (through the asset registry),
// shrinks it to a small PS2-size texture, nudges its skin tone towards the model's skin
// colour and fades the edges to transparent, so the photo melts into the skin, beard and
// hair colours of the low-poly head underneath (docs/CHARACTER.md).

import * as THREE from 'three';

/**
 * @param {HTMLImageElement} image  the 512x512 face crop
 * @param {{size:number, skin:string, feather:number, toneMatch:number, brightness:number}} cfg  data/player.json → model.face
 */
export function makeFaceTexture(image, cfg) {
  const size = cfg.size;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;

  // Average colour of the two cheeks → per-channel gain towards the model's skin colour.
  const hex = parseInt(cfg.skin.slice(1), 16);
  const want = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  const sum = [0, 0, 0];
  let n = 0;
  for (const [u0, u1] of [[0.18, 0.32], [0.68, 0.82]]) {
    for (let y = Math.floor(size * 0.4); y < size * 0.52; y++) {
      for (let x = Math.floor(size * u0); x < size * u1; x++) {
        const i = (y * size + x) * 4;
        sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2];
        n++;
      }
    }
  }
  const gain = sum.map((s, c) => {
    const g = want[c] / Math.max(1, s / n);
    return (1 + (Math.min(1.5, Math.max(0.7, g)) - 1) * cfg.toneMatch) * (cfg.brightness ?? 1);
  });

  // Elliptical feather: solid in the middle, see-through at the rim.
  const inner = 1 - cfg.feather;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      d[i] = Math.min(255, d[i] * gain[0]);
      d[i + 1] = Math.min(255, d[i + 1] * gain[1]);
      d[i + 2] = Math.min(255, d[i + 2] * gain[2]);
      const ex = (x / size - 0.5) / 0.4;
      const ey = (y / size - 0.52) / 0.52;
      const r = Math.hypot(ex, ey);
      const a = 1 - Math.min(1, Math.max(0, (r - inner) / (1 - inner)));
      d[i + 3] = 255 * a * a * (3 - 2 * a);
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}
