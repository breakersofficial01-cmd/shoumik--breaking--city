// Feature: healthPacks (Session 9). Green first-aid boxes lie on sidewalk corners all over the
// city. Walk over one while hurt → +25% of max health (data/healthPacks.json → heal), it
// disappears and comes back after respawnSeconds. Clinics and hospitals (shops, kind 'health')
// sell bigger heals. All packs are drawn with two InstancedMeshes (box + cross) = 2 draw calls.
//
// Listens nothing special.  Sends player:heal { share }, toast:show, map:blips { id: 'healthPacks' }

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from '../../core/rng.js';
import { markGlow } from '../../world/graphics/glow.js';
import { cornerPoint } from '../shops/markers.js';
import { log } from '../../core/debug.js';

const CORNERS = ['NE', 'NW', 'SE', 'SW'];

let game = null;
let cfg = null;
let packs = [];       // { x, z, y, takenUntil }
let box = null;
let cross = null;
let time = 0;
let offs = [];
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
const pos = new THREE.Vector3();
const scl = new THREE.Vector3();

/** Pick count free sidewalk corners, the same every game (seeded). */
function place() {
  const L = game.world.layout;
  const rng = new Rng(cfg.seed);
  const cols = game.config.get('world').grid.cols, rows = game.config.get('world').grid.rows;
  const used = new Set();
  let tries = 0;
  while (packs.length < cfg.count && tries++ < cfg.count * 20) {
    const c = rng.int(0, cols), r = rng.int(0, rows);
    const corner = CORNERS[rng.int(0, 3)];
    const key = `${c},${r}`;
    if (used.has(key) || !game.world.roads.isJunction(c, r)) continue;
    const p = cornerPoint(game.world, c, r, corner, 0.6);
    if (!p) continue;
    used.add(key);
    // Move it a little along the sidewalk so it does not sit inside a shop ring.
    const centre = L.crossingCentre(c, r);
    const dx = Math.sign(p.x - centre.x), dz = Math.sign(p.z - centre.z);
    const x = p.x + dx * 4, z = p.z + dz * 0.5;
    const ok = !game.world.collision.isBlocked(x, z, 0.5);
    const px = ok ? x : p.x, pz = ok ? z : p.z;
    packs.push({ x: px, z: pz, y: game.world.heightAt(px, pz), takenUntil: 0 });
  }
}

function buildMeshes() {
  const s = cfg.size;
  const boxGeo = new THREE.BoxGeometry(s, s * 0.75, s * 0.75);
  const bar = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  // White cross sticking out a little on all four sides (z faces: d 0.78s, x faces: w 1.02s).
  const crossGeo = mergeGeometries([
    bar(s * 0.14, s * 0.5, s * 0.78), bar(s * 0.5, s * 0.14, s * 0.78),
    bar(s * 1.02, s * 0.5, s * 0.14), bar(s * 1.02, s * 0.14, s * 0.5),
  ]);
  box = new THREE.InstancedMesh(boxGeo, markGlow(new THREE.MeshBasicMaterial({ color: cfg.color }), 'marker'), packs.length);
  cross = new THREE.InstancedMesh(crossGeo, markGlow(new THREE.MeshBasicMaterial({ color: cfg.crossColor }), 'marker'), packs.length);
  for (const m of [box, cross]) {
    m.name = 'health-packs';
    m.frustumCulled = false;
    m.userData.noCastShadow = true;
    game.scene.add(m);
  }
}

function sendBlips() {
  game.events.emit('map:blips', {
    id: 'healthPacks',
    points: packs.filter((p) => p.takenUntil <= time).map((p) => ({ x: p.x, z: p.z, color: cfg.minimapColor, icon: '➕', group: 'healthpack', small: true })),
  });
}

export default {
  id: 'healthPacks',

  init(g) {
    game = g;
    cfg = g.config.get('healthPacks');
    place();
    buildMeshes();
    offs = [g.events.on('game:ready', sendBlips)];
    sendBlips();
    log.info(`healthPacks: ${packs.length} placed`);
  },

  get packs() { return packs; },

  update(dt) {
    time += dt;
    const p = game.player?.position;
    if (!p) return;
    const h = game.player.health;
    let changed = false;
    for (let i = 0; i < packs.length; i++) {
      const k = packs[i];
      const d = Math.hypot(k.x - p.x, k.z - p.z);
      if (k.takenUntil > 0 && k.takenUntil <= time) { k.takenUntil = 0; changed = true; }
      const here = k.takenUntil === 0 && d < cfg.visibleDistance;
      if (here && d < cfg.pickupRadius && h && h.value < h.max && !game.player.dead) {
        k.takenUntil = time + cfg.respawnSeconds;
        game.events.emit('player:heal', { share: cfg.heal });
        game.events.emit('toast:show', { key: 'health.packTaken', vars: { n: Math.round(cfg.heal * 100) } });
        game.audio?.play('reward');
        changed = true;
      }
      const show = k.takenUntil === 0 && d < cfg.visibleDistance;
      q.setFromAxisAngle(up, time * 1.6 + i);
      pos.set(k.x, k.y + 0.55 + Math.sin(time * 2.4 + i) * 0.08, k.z);
      scl.setScalar(show ? 1 : 0);
      m4.compose(pos, q, scl);
      box.setMatrixAt(i, m4);
      cross.setMatrixAt(i, m4);
    }
    box.instanceMatrix.needsUpdate = true;
    cross.instanceMatrix.needsUpdate = true;
    if (changed) sendBlips();
  },

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    for (const m of [box, cross]) { m?.removeFromParent(); m?.geometry.dispose(); m?.material.dispose(); }
    box = cross = null;
    packs = [];
    game.events.emit('map:blips', { id: 'healthPacks', points: [] });
  },
};
