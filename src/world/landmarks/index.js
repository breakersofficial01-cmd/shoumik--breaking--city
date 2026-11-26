// Landmarks: the real Dhaka places of Breaking City. World code, available as
// game.world.landmarks.
//
// WHERE they stand comes from data/places.json: a place with a `landmark` block
//     "landmark": { "type": "curzonHall", "block": [5, 12], "facing": "N" }      one city block
//     "landmark": { "type": "sangsad", "area": "sangsad-grounds", "facing": "S" } a plaza from districts.json
// HOW they look (colours, heights) comes from data/landmarks.json → types.<type>; the shape
// itself is a builder function (civic.js, campus.js, oldDhaka.js, modern.js).
// Viaducts (MRT, flyover) and lake dressing are also built here (viaduct.js, modern.js).
//
// A landmark block keeps its sidewalk, poles, wires and street trees (layout.js), so
// pedestrians, bus stops and ride stands work as on any other block.
//
//   landmarks.sites      [{ id, type, place, cx, cz, y, angle, half }]
//   landmarks.markers    [{ id, place, x, y, z }]  entrance markers (Breaking School / Biology)
//   landmarks.viaducts   [{ id, kind, line, path, pillars, stations }]   (train + poster slots)
//   landmarks.heightAt(x, z)   extra ground height of walkable platforms (part of world.heightAt)
//
// TO ADD A LANDMARK: write a builder (k, ctx) using the Kit, add it to BUILDERS, give it
// colours in data/landmarks.json → types, and add the `landmark` block to a place.

import * as THREE from 'three';
import { markGlow } from '../graphics/glow.js';
import { log } from '../../core/debug.js';
import { Rng, hashInts } from '../../core/rng.js';
import { GeoBuilder } from '../geoBuilder.js';
import { KIND } from '../layout.js';
import { COLLIDE } from '../collision.js';
import { Kit } from './kit.js';
import { buildSignAtlas } from './signs.js';
import { buildViaduct } from './viaduct.js';
import { buildRailway } from './railway.js';
import { sangsad, shaheedMinar, shaplaChattar } from './civic.js';
import { curzonHall, dhakaUniversity, tsc, dhakaMedical, buet, notreDame, ssmc } from './campus.js';
import { ahsanManzil, lalbaghFort, sadarghat, nilkhet } from './oldDhaka.js';
import { breakingCampus, gulshanTowers, karwanBazar, lakeDecor } from './modern.js';
import { hotel } from './hotels.js';

export const BUILDERS = {
  sangsad, shaheedMinar, shaplaChattar, curzonHall, dhakaUniversity, tsc, dhakaMedical, buet,
  notreDame, ssmc, ahsanManzil, lalbaghFort, sadarghat, nilkhet, gulshanTowers, karwanBazar,
  breakingSchool: breakingCampus, breakingBiology: breakingCampus, // same building, own colours and name
  // Roadmap 2 S4: the three hotels (one builder, three styles; the inside: src/features/hotels/).
  breakingHotel: hotel, shoumikCulinary: hotel, bengaliHeritage: hotel,
};
const FACING = { S: 0, E: Math.PI / 2, N: Math.PI, W: -Math.PI / 2 };
const WORLD_SITE = { cx: 0, cz: 0, y: 0, angle: 0 };

/** For the layout: which blocks are landmark plots. Map "col,row" → { id, ground }. */
export function landmarkBlocks(places, cfg) {
  const map = new Map();
  for (const p of places) {
    const lm = p.landmark;
    if (!lm || !Array.isArray(lm.block) || !BUILDERS[lm.type]) continue;
    map.set(`${lm.block[0]},${lm.block[1]}`, { id: p.id, ground: cfg.types[lm.type]?.ground || 'plaza' });
  }
  return map;
}

export class Landmarks {
  /**
   * Plans every landmark (pure data) — must run before colliders and chunk meshes exist,
   * because it removes and plants trees.
   */
  constructor(layout, places, cfg, worldCfg) {
    this.layout = layout;
    this.cfg = cfg;
    this.worldCfg = worldCfg;
    this.sites = [];
    this.markers = [];
    this.viaducts = [];
    this.railways = [];   // Roadmap 2 S6: ground railways (railway.js); trains: features/railway
    this.groundAt = null; // (x, z) → countryside height, set by world.js before build()
    this.platforms = [];
    this.units = [];
    this.group = new THREE.Group();
    this.group.name = 'landmarks';
    const sw = worldCfg.grid.sidewalkWidth;
    for (const place of places) {
      const lm = place.landmark;
      if (!lm) continue;
      if (!BUILDERS[lm.type] || !cfg.types[lm.type]) { log.warn(`landmark "${place.id}": unknown type "${lm.type}"`); continue; }
      const site = { id: place.id, type: lm.type, place, angle: FACING[lm.facing] ?? 0, roadWidth: layout.W };
      if (Array.isArray(lm.block)) {
        const piece = layout.piece(2 * lm.block[0] + 1, 2 * lm.block[1] + 1);
        if (!piece || piece.kind !== KIND.BLOCK || piece.landmark !== place.id) { log.warn(`landmark "${place.id}": block ${lm.block} is not free`); continue; }
        Object.assign(site, { cx: piece.x + piece.w / 2, cz: piece.z + piece.d / 2, y: piece.y, half: piece.w / 2 - sw, piece });
        this.plantTrees(site);
      } else {
        const pieces = layout.pieces.filter((p) => p.area && p.area.id === lm.area);
        if (!pieces.length) { log.warn(`landmark "${place.id}": area "${lm.area}" not found`); continue; }
        const x0 = Math.min(...pieces.map((p) => p.x)), x1 = Math.max(...pieces.map((p) => p.x + p.w));
        const z0 = Math.min(...pieces.map((p) => p.z)), z1 = Math.max(...pieces.map((p) => p.z + p.d));
        Object.assign(site, { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, y: pieces[0].y, half: Math.min(x1 - x0, z1 - z0) / 2 });
        this.clearTrees(site, pieces, lm.clear);
      }
      this.sites.push(site);
    }
  }

  /** Local (x, z) of a site → world. */
  toWorld(site, x, z) {
    const c = Math.cos(site.angle), s = Math.sin(site.angle);
    return { x: site.cx + x * c + z * s, z: site.cz - x * s + z * c };
  }

  /** Lawn trees listed for the type in data/landmarks.json (local [x, z] pairs). */
  plantTrees(site) {
    const list = this.cfg.types[site.type].trees || [];
    const t = this.worldCfg.props.tree;
    const rng = new Rng(hashInts(this.layout.seed, site.piece.i, site.piece.j, 404));
    for (const [x, z] of list) {
      const p = this.toWorld(site, x, z);
      site.piece.content.trees.push({ x: p.x, z: p.z, h: rng.range(t.height[0], t.height[1]), tint: rng.int(0, t.colors.length - 1), rot: rng.range(0, Math.PI * 2) });
    }
  }

  /** An area landmark (Sangsad): no trees inside `clear` = [halfX, zBack, zFront] of its local space. */
  clearTrees(site, pieces, clear) {
    if (!clear) return;
    const c = Math.cos(site.angle), s = Math.sin(site.angle);
    for (const p of pieces) {
      if (!p.content?.trees?.length) continue;
      p.content.trees = p.content.trees.filter((t) => {
        const dx = t.x - site.cx, dz = t.z - site.cz;
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        return Math.abs(lx) > clear[0] || lz < clear[1] || lz > clear[2];
      });
    }
  }

  /** Extra ground height from walkable platforms (steps slope up over `run` metres). */
  heightAt(x, z) {
    let h = 0;
    for (const p of this.platforms) {
      const dx = Math.max(p.x0 - x, 0, x - p.x1), dz = Math.max(p.z0 - z, 0, z - p.z1);
      if (dx >= p.run || dz >= p.run) continue;
      const d = Math.hypot(dx, dz);
      if (d < p.run) h = Math.max(h, p.h * (1 - d / p.run));
    }
    return h;
  }

  /** Water rectangles and bridge decks of one lake (data/districts.json area id). */
  waterOf(areaId) {
    const L = this.layout;
    const rects = [], bridges = [];
    const wet = (i, j) => { const p = L.piece(i, j); return !!p && p.kind === KIND.WATER && p.area?.id === areaId; };
    for (const p of L.pieces) {
      if (p.kind === KIND.WATER && p.area?.id === areaId && p.i & 1 && p.j & 1) rects.push({ x0: p.x, z0: p.z, x1: p.x + p.w, z1: p.z + p.d });
      else if (p.kind === KIND.ROAD_NS && wet(p.i - 1, p.j) && wet(p.i + 1, p.j)) bridges.push({ x0: p.x, z0: p.z, x1: p.x + p.w, z1: p.z + p.d, alongX: false });
      else if (p.kind === KIND.ROAD_EW && wet(p.i, p.j - 1) && wet(p.i, p.j + 1)) bridges.push({ x0: p.x, z0: p.z, x1: p.x + p.w, z1: p.z + p.d, alongX: true });
    }
    return { rects, bridges };
  }

  /** Turn filled builders into meshes and register colliders/platforms. */
  addUnit(id, kits, cx, cz) {
    const group = new THREE.Group();
    group.name = `landmark-${id}`;
    let radius = 30;
    const b = kits[0].b;
    for (const [key, material] of [['lit', this.materials.lit], ['glow', this.materials.glow], ['sign', this.materials.sign]]) {
      if (b[key].isEmpty) continue;
      const mesh = new THREE.Mesh(b[key].build(), material);
      const s = mesh.geometry.boundingSphere;
      radius = Math.max(radius, Math.hypot(s.center.x - cx, s.center.z - cz) + s.radius);
      group.add(mesh);
    }
    group.traverse((o) => { o.matrixAutoUpdate = false; });
    this.group.add(group);
    for (const k of kits) {
      for (const c of k.colliders) this.collision.add(c.x0, c.z0, c.x1, c.z1, c.camera ? COLLIDE.SOLID | COLLIDE.CAMERA : COLLIDE.SOLID);
      this.platforms.push(...k.platforms);
    }
    const unit = { id, group, cx, cz, radius };
    this.units.push(unit);
    return unit;
  }

  /**
   * Build every mesh. Async because the name boards are canvas text (waits for the fonts).
   * @param {{facadeMaterial:THREE.Material}} shared   @param {THREE.Object3D} parent
   * @param {import('../collision.js').CollisionWorld} collision
   */
  async build(shared, parent, collision) {
    const { cfg, layout } = this;
    this.collision = collision;
    parent.add(this.group);
    const stations = [...(cfg.viaducts || []), ...(cfg.railways || [])].flatMap((v) => v.stations || []);
    const entries = [
      ...this.sites.map((s) => ({ id: s.id, name: s.place.name, big: cfg.types[s.type].bigSign || null })),
      ...stations.map((s) => ({ id: s.id, name: s.name })),
    ];
    const atlas = await buildSignAtlas(entries, cfg.signs);
    this.materials = {
      lit: shared.facadeMaterial,
      glow: markGlow(new THREE.MeshBasicMaterial({ vertexColors: true }), 'glow'),
      sign: markGlow(new THREE.MeshBasicMaterial({ map: atlas.texture }), 'sign'),
    };
    const sign = (id) => atlas.uv.get(id) || null;
    this.signUv = sign; // Roadmap 2 S4: the hotels feature puts the name board inside the lobby too
    const makeBuilders = () => ({ lit: new GeoBuilder(), glow: new GeoBuilder(), sign: new GeoBuilder() });
    const waterLevel = this.worldCfg.water.level;
    let tris = 0;

    for (const site of this.sites) {
      const kit = new Kit(makeBuilders(), site);
      const ctx = { C: cfg.types[site.type], sign, site, waterY: waterLevel - site.y, rng: new Rng(hashInts(layout.seed, this.sites.indexOf(site), 77)) };
      try {
        BUILDERS[site.type](kit, ctx);
      } catch (err) {
        log.error(`landmark "${site.id}" could not be built`, err);
        continue;
      }
      this.addUnit(site.id, [kit], site.cx, site.cz);
      tris += kit.b.lit.idx.length / 3;
      if (kit.markerAt) this.markers.push({ id: site.id, place: site.place, ...kit.markerAt });
    }
    for (const [areaId, C] of Object.entries(cfg.lakes || {})) {
      const water = this.waterOf(areaId);
      if (!water.rects.length) continue;
      const kit = new Kit(makeBuilders(), WORLD_SITE);
      lakeDecor(kit, { C, water, waterY: waterLevel, rng: new Rng(hashInts(layout.seed, areaId.length, 91)) });
      const cx = water.rects.reduce((s, r) => s + (r.x0 + r.x1) / 2, 0) / water.rects.length;
      const cz = water.rects.reduce((s, r) => s + (r.z0 + r.z1) / 2, 0) / water.rects.length;
      this.addUnit(`lake-${areaId}`, [kit], cx, cz);
    }
    for (const line of cfg.viaducts || []) {
      const v = buildViaduct(layout, line, cfg.viaductColors[line.kind], makeBuilders, sign);
      v.sections.forEach((sec, i) => this.addUnit(`${line.id}-${i}`, [sec.kit], sec.cx, sec.cz));
      this.viaducts.push({ id: v.id, kind: v.kind, line, path: v.path, pillars: v.pillars, stations: v.stations });
    }
    for (const line of cfg.railways || []) {
      const r = buildRailway(layout, line, cfg.railwayColors, makeBuilders, sign, this.groundAt || (() => 0));
      r.sections.forEach((sec, i) => this.addUnit(`${line.id}-${i}`, [sec.kit], sec.cx, sec.cz));
      this.railways.push(r);
    }
    log.info(`landmarks: ${this.sites.length} places, ${this.viaducts.length} viaducts, ${this.units.length} mesh groups, ~${Math.round(tris / 1000)}k triangles`);
  }

  /** Is (x, z) within `r` metres of a railway track? (no countryside trees on the line) */
  nearRailway(x, z, r) {
    for (const rl of this.railways) {
      const b = rl.bounds;
      if (b && (x < b.x0 - r || x > b.x1 + r || z < b.z0 - r || z > b.z1 + r)) continue;
      const s = rl.path.nearest(x, z);
      const p = rl.path.at(s, {});
      if (Math.hypot(p.x - x, p.z - z) < r) return true;
    }
    return false;
  }

  /** Show only what is within view of the player. */
  update(focus, viewDistance) {
    const margin = this.cfg.viewMargin;
    for (const u of this.units) u.group.visible = Math.hypot(u.cx - focus.x, u.cz - focus.z) < viewDistance + u.radius + margin;
  }
}
