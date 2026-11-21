// The city painted once onto a hidden canvas from the layout data. Shared by the minimap and
// the full map (Session 9). Colours: data/ui.json → minimap.colors, districts / areas.
// Roadmap 2 S3: with the countryside (world.terrain) the canvas covers the whole land:
// fields, desert, beach, sea, river, hills, ponds, highways and the bridge are painted first
// (coarse colour grid, scaled up smoothly), the city on top.
//
// The canvas origin is the world point (ox, oz): map pixel = (world - origin) * scale.

import { KIND } from '../../world/layout.js';

/**
 * @param {import('../../world/layout.js').CityLayout} layout
 * @param {object} cfg  data/ui.json → minimap
 * @param {import('../../world/terrain/index.js').Terrain|null} [terrain]
 * @returns {{ canvas: HTMLCanvasElement, scale: number, ox: number, oz: number,
 *             toPx(x:number, z:number): [number, number] }}   map pixels for a world point
 */
export function paintCityMap(layout, cfg, terrain = null) {
  const L = layout;
  const areaTypes = L.areaTypes;
  const scale = cfg.pixelsPerMetre;
  const margin = cfg.range * 1.5;
  const field = terrain?.field || null;
  const area = field
    ? { x0: field.bounds.x0 - margin, z0: field.bounds.z0 - margin, x1: field.bounds.x1 + margin, z1: field.bounds.z1 + margin }
    : { x0: L.minX - margin, z0: L.minZ - margin, x1: L.maxX + margin, z1: L.maxZ + margin };
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((area.x1 - area.x0) * scale);
  canvas.height = Math.ceil((area.z1 - area.z0) * scale);
  const c = canvas.getContext('2d');
  const X = (x) => (x - area.x0) * scale;
  const Z = (z) => (z - area.z0) * scale;
  const rect = (x0, z0, x1, z1, color) => {
    c.fillStyle = color;
    // +0.5px so neighbouring pieces overlap and leave no hairline gaps
    c.fillRect(X(x0), Z(z0), (x1 - x0) * scale + 0.5, (z1 - z0) * scale + 0.5);
  };
  c.fillStyle = cfg.colors.background;
  c.fillRect(0, 0, canvas.width, canvas.height);
  if (field) paintCountryside(c, field, terrain.cfg, area, scale, X, Z);
  else if (L.river?.side === 'south') rect(L.minX - margin, L.maxZ, L.maxX + margin, L.maxZ + margin, areaTypes.water.minimapColor);

  for (const p of L.pieces) {
    let color = cfg.colors.road;
    if (p.kind === KIND.BLOCK) color = L.districts[p.district].minimapColor || cfg.colors.block;
    else if (p.kind === KIND.WATER) color = areaTypes.water.minimapColor;
    else if (p.kind === KIND.PARK) color = areaTypes.park.minimapColor;
    else if (p.kind === KIND.PLAZA) color = areaTypes.plaza.minimapColor;
    rect(p.x, p.z, p.x + p.w, p.z + p.d, color);
    if (p.pond) rect(p.pond.x0, p.pond.z0, p.pond.x1, p.pond.z1, areaTypes.water.minimapColor);
    if (p.kind === KIND.BLOCK) {
      for (const patch of p.content.patches) {
        if (patch.lane) rect(patch.x0, patch.z0, patch.x1, patch.z1, cfg.colors.lane);
      }
    }
  }
  return { canvas, scale, ox: area.x0, oz: area.z0, toPx: (x, z) => [X(x), Z(z)] };
}

/** The land around the city: a coarse colour grid drawn smoothly, then crisp roads + ponds. */
function paintCountryside(c, field, cfg, area, scale, X, Z) {
  const step = 16; // metres per colour sample
  const w = Math.ceil((area.x1 - area.x0) / step), h = Math.ceil((area.z1 - area.z0) / step);
  const small = document.createElement('canvas');
  small.width = w; small.height = h;
  const sc = small.getContext('2d');
  const img = sc.createImageData(w, h);
  const rgb = new Map();
  const parse = (hex) => {
    let v = rgb.get(hex);
    if (!v) { const n = parseInt(hex.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; rgb.set(hex, v); }
    return v;
  };
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = area.x0 + (i + 0.5) * step, z = area.z0 + (j + 0.5) * step;
      const v = parse(field.inBounds(x, z) || x > field.shoreX(z) ? field.mapColor(x, z) : '#3a4a36');
      const k = (j * w + i) * 4;
      img.data[k] = v[0]; img.data[k + 1] = v[1]; img.data[k + 2] = v[2]; img.data[k + 3] = 255;
    }
  }
  sc.putImageData(img, 0, 0);
  c.imageSmoothingEnabled = true;
  c.drawImage(small, 0, 0, w * step * scale, h * step * scale);
  // Ponds (round), highways, the bridge.
  c.fillStyle = cfg.river.minimapColor;
  for (const p of field.ponds) {
    c.beginPath();
    c.arc(X(p.x), Z(p.z), p.r * scale, 0, Math.PI * 2);
    c.fill();
  }
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = cfg.highways.minimapColor;
  c.lineWidth = Math.max(2, cfg.highways.width * scale);
  for (const hw of field.highways) {
    c.beginPath();
    hw.pts.forEach(([x, z], i) => (i ? c.lineTo(X(x), Z(z)) : c.moveTo(X(x), Z(z))));
    c.stroke();
  }
  const B = field.bridge;
  if (B) {
    c.strokeStyle = '#d8d2c4';
    c.lineWidth = Math.max(3, B.width * scale);
    c.beginPath();
    c.moveTo(X(B.x), Z(B.z0));
    c.lineTo(X(B.x), Z(B.landZ));
    c.stroke();
  }
}
