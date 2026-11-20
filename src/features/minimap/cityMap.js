// The city painted once onto a hidden canvas from the layout data. Shared by the minimap and
// the full map (Session 9). Colours: data/ui.json → minimap.colors, districts / areas.

import { KIND } from '../../world/layout.js';

/**
 * @returns {{ canvas: HTMLCanvasElement, scale: number, margin: number,
 *             toPx(x:number, z:number): [number, number] }}   map pixels for a world point
 */
export function paintCityMap(layout, cfg) {
  const L = layout;
  const areaTypes = L.areaTypes;
  const scale = cfg.pixelsPerMetre;
  const margin = cfg.range * 1.5;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((L.width + margin * 2) * scale);
  canvas.height = Math.ceil((L.depth + margin * 2) * scale);
  const c = canvas.getContext('2d');
  const X = (x) => (x - L.minX + margin) * scale;
  const Z = (z) => (z - L.minZ + margin) * scale;
  const rect = (x0, z0, x1, z1, color) => {
    c.fillStyle = color;
    // +0.5px so neighbouring pieces overlap and leave no hairline gaps
    c.fillRect(X(x0), Z(z0), (x1 - x0) * scale + 0.5, (z1 - z0) * scale + 0.5);
  };
  c.fillStyle = cfg.colors.background;
  c.fillRect(0, 0, canvas.width, canvas.height);
  if (L.river?.side === 'south') rect(L.minX - margin, L.maxZ, L.maxX + margin, L.maxZ + margin, areaTypes.water.minimapColor);

  for (const p of L.pieces) {
    let color = cfg.colors.road;
    if (p.kind === KIND.BLOCK) color = L.districts[p.district].minimapColor || cfg.colors.block;
    else if (p.kind === KIND.WATER) color = areaTypes.water.minimapColor;
    else if (p.kind === KIND.PARK) color = areaTypes.park.minimapColor;
    else if (p.kind === KIND.PLAZA) color = areaTypes.plaza.minimapColor;
    rect(p.x, p.z, p.x + p.w, p.z + p.d, color);
    if (p.kind === KIND.BLOCK) {
      for (const patch of p.content.patches) {
        if (patch.lane) rect(patch.x0, patch.z0, patch.x1, patch.z1, cfg.colors.lane);
      }
    }
  }
  return { canvas, scale, margin, toPx: (x, z) => [X(x), Z(z)] };
}
