// Feature: minimap (top-right) + Session 9: the full map, GPS routes and place icons.
// The whole city is painted once onto a hidden canvas (./cityMap.js); every tick a rotated
// window of it is copied to the screen, with the player arrow in the middle.
// Look + size: data/ui.json → minimap; full map: data/mapView.json.
//
// Points on the maps come from other features:
//   map:blips { id, points: [{ x, z, color, icon?, label?, group?, big?, small?, pin?, blink?, routeable? }] }
//     (same id again replaces the list; [] removes it). label = { en, bn } name written on the
//     full map; pin = keep it on the minimap rim when far away (police, institutes, route target).
// Breaking School / Breaking Biology are added here (id 'institutes', data/mapView.json → institutes).
//
// Listens  map:blips, map:open, input:map (M key), route:set { x, z, label?, icon? }, route:clear
// Sends    toast:show (arrived)
// Tap the minimap → the full map (./bigMap.js). Route: ./route.js.

import { t, getLanguage } from '../../ui/i18n.js';
import { fontStack, fontsReady } from '../../ui/fonts.js';
import { paintCityMap } from './cityMap.js';
import { BigMap } from './bigMap.js';
import { Route } from './route.js';

let game = null;
let cfg = null;
let mv = null;
let canvas = null;
let ctx = null;
let city = null;      // { canvas, scale, ox, oz } (cityMap.js)
let timer = 0;
let dpr = 1;
let offs = [];
let big = null;
let route = null;
const blips = new Map(); // id -> points

/** The two institutes as big pins (at their entrance marker, else their road junction). */
function instituteBlips() {
  const L = game.world.layout;
  const points = [];
  for (const id of mv.institutes) {
    const p = game.content.get('places').find((x) => x.id === id);
    if (!p) continue;
    const m = game.world.landmarks?.markers?.find((x) => x.id === id || x.place === id);
    const c = L.crossingCentre(p.col, p.row);
    points.push({ id, x: m?.x ?? c.x, z: m?.z ?? c.z, color: mv.colors.school, icon: '🎓', label: p.name, group: 'school', big: true, pin: true, routeable: true });
  }
  blips.set('institutes', points);
}

/**
 * Roadmap 2 S3: the countryside on the full map — one labelled point per zone, the beach,
 * the bridge, the oasis and the end of each highway (all routeable: the GPS line leads to the
 * city edge on the road nearest to them).
 */
function countrysideBlips() {
  const terrain = game.world.terrain;
  if (!terrain) return;
  const f = terrain.field;
  const color = '#9bd46a';
  const points = [];
  const add = (id, x, z, icon, label) => points.push({ id, x, z, color, icon, label, group: 'outskirts', routeable: true });
  const icons = { fields: '🌾', desert: '🏜️', coast: '🌴' };
  for (const z of f.zones) add(z.id, (z.x0 + z.x1) / 2, (z.z0 + z.z1) / 2, icons[z.type] || '📍', z.name);
  const S = terrain.cfg.sea;
  const beachZ = f.Z(6);
  add('beach', f.shoreX(beachZ) - S.beach / 2, beachZ, '🏖️', S.name);
  if (f.bridge) add(f.bridge.id, f.bridge.x, (f.bridge.z0 + f.bridge.landZ) / 2, '🌉', f.bridge.name);
  const oasis = f.ponds.find((p) => p.id === 'oasis');
  if (oasis) add('oasis', oasis.x, oasis.z, '🌴', { en: 'Oasis', bn: 'মরূদ্যান' });
  if (terrain.cfg.mountains.name) add('hills', f.X(-11.5), f.Z(-10.5), '⛰️', terrain.cfg.mountains.name);
  blips.set('countryside', points);
}

function draw() {
  const player = game.player;
  if (!player || !city) return;
  const size = canvas.width;
  const r = size / 2;
  const yaw = game.cameraRig.yaw;
  const mapAngle = cfg.rotate ? yaw - Math.PI : 0;
  const zoom = r / (cfg.range * city.scale); // screen px per map px
  const px = player.position.x, pz = player.position.z;

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
  ctx.drawImage(city.canvas, -(px - city.ox) * city.scale, -(pz - city.oz) * city.scale);
  ctx.restore();

  // Points (shops, police, packs...): rotate the offset like the map.
  const edge = r - 9 * dpr;
  const ca = Math.cos(mapAngle), sa = Math.sin(mapAngle);
  const ppm = r / cfg.range;
  const project = (x, z) => {
    const dx = (x - px) * ppm, dz = (z - pz) * ppm;
    return [r + dx * ca - dz * sa, r + dx * sa + dz * ca];
  };

  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r - 2 * dpr, 0, Math.PI * 2);
  ctx.clip();
  route.draw(ctx, project, 3.5 * dpr, mv.colors);
  ctx.restore();

  const blink = Math.floor(performance.now() / 350) % 2 === 0;
  const font = fontStack(getLanguage());
  for (const points of blips.values()) {
    for (const b of points) {
      let [sx, sy] = project(b.x, b.z);
      sx -= r; sy -= r;
      const len = Math.hypot(sx, sy);
      const far = len > edge;
      if (far && !b.pin) continue;                 // shops etc. only inside the circle
      if (far) { sx *= edge / len; sy *= edge / len; }
      const rad = (b.big ? 7 : b.small ? 3 : far ? 3.5 : 6) * dpr;
      if (b.blink && !blink) ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(r + sx, r + sy, rad, 0, Math.PI * 2);
      ctx.fillStyle = b.icon && !b.small && !far ? 'rgba(20,12,40,0.85)' : b.color;
      ctx.strokeStyle = b.icon && !b.small && !far ? b.color : cfg.colors.border;
      ctx.lineWidth = 1.5 * dpr;
      ctx.fill();
      ctx.stroke();
      if (b.icon && !b.small && !far) {
        ctx.font = `${Math.round(rad * 1.3)}px ${font}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.icon, r + sx, r + sy + 0.5 * dpr);
      }
      ctx.globalAlpha = 1;
    }
  }
  // The route target, pinned to the rim when far.
  if (route.target) {
    let [sx, sy] = project(route.target.x, route.target.z);
    sx -= r; sy -= r;
    const len = Math.hypot(sx, sy);
    if (len > edge) { sx *= edge / len; sy *= edge / len; }
    ctx.beginPath();
    ctx.arc(r + sx, r + sy, 5 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = mv.colors.route;
    ctx.strokeStyle = mv.colors.routeEdge;
    ctx.lineWidth = 2 * dpr;
    ctx.fill();
    ctx.stroke();
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
  ctx.font = `700 ${10 * dpr}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(t('hud.north'), nx, ny + 0.5 * dpr);
}

function openBig() {
  if (game.paused || !big) return;
  big.open();
}

export default {
  id: 'minimap',

  async init(g) {
    game = g;
    cfg = g.config.get('ui').minimap;
    mv = g.config.get('mapView');
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas = document.createElement('canvas');
    canvas.id = 'minimap';
    canvas.width = canvas.height = Math.round(cfg.size * dpr);
    canvas.style.width = canvas.style.height = `${cfg.size}px`;
    canvas.title = t('map.tapToOpen');
    ctx = canvas.getContext('2d');
    g.ui.appendChild(canvas);
    canvas.addEventListener('click', openBig);
    city = paintCityMap(g.world.layout, cfg, g.world.terrain);
    route = new Route(g);
    big = new BigMap(g, city, mv, route, blips, g.config.get('shops').kinds);
    instituteBlips();
    await fontsReady(); // canvas text must wait for the Bangla font (CLAUDE.md rule 7)
    offs = [
      g.events.on('game:ready', () => { instituteBlips(); countrysideBlips(); draw(); }),
      g.events.on('map:blips', ({ id, points }) => { if (points?.length) blips.set(id, points); else blips.delete(id); }),
      g.events.on('map:open', openBig),
      g.events.on('input:map', () => (big.isOpen ? big.close() : openBig())),
      g.events.on('route:set', (target) => { route.set(target); draw(); }),
      g.events.on('route:clear', () => route.clear()),
    ];
  },

  /** For tools / the console. */
  get route() { return route; },
  get bigMap() { return big; },
  get blips() { return blips; },

  update(dt) {
    if (route.update(dt, mv.routeArriveMetres)) game.events.emit('toast:show', { key: 'map.arrived' });
    timer -= dt;
    if (timer > 0) return;
    timer = 1 / game.quality.minimapFps;
    draw();
  },

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    big?.dispose();
    canvas?.remove();
    canvas = ctx = city = big = null;
  },
};
