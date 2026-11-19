// Feature: minimap (top-right). The whole city is painted once onto a hidden canvas from
// the layout data; every tick a rotated window of it is copied to the screen, with the
// player arrow in the middle. Look + size: data/ui.json → minimap.
// Other features add coloured dots (shops, homes...) with
//   map:blips { id, points: [{ x, z, color }] }   (same id again replaces the list; [] removes it)
// Dots outside the map circle are pinned to its edge so you can see which way to go.

import { t, getLanguage } from '../../ui/i18n.js';
import { fontStack, fontsReady } from '../../ui/fonts.js';
import { KIND } from '../../world/layout.js';

let game = null;
let cfg = null;
let canvas = null;
let ctx = null;
let map = null;       // pre-drawn city
let mapScale = 1;     // map pixels per metre
let margin = 0;       // metres of empty border around the city on the map
let timer = 0;
let dpr = 1;
let offs = [];
const blips = new Map(); // id -> points

/** Paint the whole city once. */
function drawCityMap() {
  const L = game.world.layout;
  const areaTypes = L.areaTypes;
  mapScale = cfg.pixelsPerMetre;
  margin = cfg.range * 1.5;
  map = document.createElement('canvas');
  map.width = Math.ceil((L.width + margin * 2) * mapScale);
  map.height = Math.ceil((L.depth + margin * 2) * mapScale);
  const c = map.getContext('2d');
  const X = (x) => (x - L.minX + margin) * mapScale;
  const Z = (z) => (z - L.minZ + margin) * mapScale;
  const rect = (x0, z0, x1, z1, color) => {
    c.fillStyle = color;
    // +0.5px so neighbouring pieces overlap and leave no hairline gaps
    c.fillRect(X(x0), Z(z0), (x1 - x0) * mapScale + 0.5, (z1 - z0) * mapScale + 0.5);
  };
  c.fillStyle = cfg.colors.background;
  c.fillRect(0, 0, map.width, map.height);
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
}

function draw() {
  const player = game.player;
  if (!player || !map) return;
  const size = canvas.width;
  const r = size / 2;
  const yaw = game.cameraRig.yaw;
  const mapAngle = cfg.rotate ? yaw - Math.PI : 0;
  const zoom = r / (cfg.range * mapScale); // screen px per map px
  const L = game.world.layout;

  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r - 2 * dpr, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = cfg.colors.background;
  ctx.fillRect(0, 0, size, size);
  ctx.translate(r, r);
  ctx.rotate(mapAngle);
  ctx.scale(zoom, zoom);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(map, -(player.position.x - L.minX + margin) * mapScale, -(player.position.z - L.minZ + margin) * mapScale);
  ctx.restore();

  // Blips (shops, homes, ...): rotate the offset like the map, pin far ones to the rim.
  const edge = r - 9 * dpr;
  const ca = Math.cos(mapAngle), sa = Math.sin(mapAngle);
  const ppm = r / cfg.range;
  for (const points of blips.values()) {
    for (const b of points) {
      const dx = (b.x - player.position.x) * ppm;
      const dz = (b.z - player.position.z) * ppm;
      let sx = dx * ca - dz * sa;
      let sy = dx * sa + dz * ca;
      const len = Math.hypot(sx, sy);
      const far = len > edge;
      if (far && len > cfg.range * ppm * 4) continue; // very far away: no dot
      if (far) { sx *= edge / len; sy *= edge / len; }
      ctx.beginPath();
      ctx.arc(r + sx, r + sy, (far ? 3 : 4.5) * dpr, 0, Math.PI * 2);
      ctx.fillStyle = b.color;
      ctx.strokeStyle = cfg.colors.border;
      ctx.lineWidth = 1.5 * dpr;
      ctx.fill();
      ctx.stroke();
    }
  }

  // Player arrow.
  ctx.save();
  ctx.translate(r, r);
  ctx.rotate(cfg.rotate ? yaw - player.heading : Math.PI - player.heading);
  ctx.beginPath();
  ctx.moveTo(0, -7 * dpr);
  ctx.lineTo(5 * dpr, 6 * dpr);
  ctx.lineTo(0, 3 * dpr);
  ctx.lineTo(-5 * dpr, 6 * dpr);
  ctx.closePath();
  ctx.fillStyle = cfg.colors.player;
  ctx.strokeStyle = cfg.colors.border;
  ctx.lineWidth = 1.5 * dpr;
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Rim + north marker.
  ctx.beginPath();
  ctx.arc(r, r, r - 2 * dpr, 0, Math.PI * 2);
  ctx.strokeStyle = cfg.colors.border;
  ctx.lineWidth = 3 * dpr;
  ctx.stroke();
  const nx = r + Math.sin(mapAngle) * (r - 11 * dpr);
  const ny = r - Math.cos(mapAngle) * (r - 11 * dpr);
  ctx.beginPath();
  ctx.arc(nx, ny, 8 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = cfg.colors.border;
  ctx.fill();
  ctx.fillStyle = cfg.colors.player;
  ctx.font = `700 ${10 * dpr}px ${fontStack(getLanguage())}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(t('hud.north'), nx, ny + 0.5 * dpr);
}

export default {
  id: 'minimap',

  async init(g) {
    game = g;
    cfg = g.config.get('ui').minimap;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas = document.createElement('canvas');
    canvas.id = 'minimap';
    canvas.width = canvas.height = Math.round(cfg.size * dpr);
    canvas.style.width = canvas.style.height = `${cfg.size}px`;
    ctx = canvas.getContext('2d');
    g.ui.appendChild(canvas);
    drawCityMap();
    await fontsReady(); // canvas text must wait for the Bangla font (CLAUDE.md rule 7)
    offs = [
      g.events.on('game:ready', draw),
      g.events.on('map:blips', ({ id, points }) => { if (points?.length) blips.set(id, points); else blips.delete(id); }),
    ];
  },

  update(dt) {
    timer -= dt;
    if (timer > 0) return;
    timer = 1 / game.quality.minimapFps;
    draw();
  },

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    canvas?.remove();
    canvas = ctx = map = null;
  },
};
