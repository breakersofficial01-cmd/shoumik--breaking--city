// The cantonment itself (Roadmap 2 S8): built in code with the landmark Kit when Shoumik first
// comes near (the 'cantonment' group of data/streaming.json). Numbers: data/army.json → base.
//
//   boundary wall with posts and a green band, the main gate on the west wall (two pillars, a
//   lifting barrier, a name board), the guard post, three watchtowers, three barracks, the office
//   block, the officers' mess, the parade ground with a saluting dais and a flag pole (plain green
//   pennant — no flag, crest or insignia), the vehicle yard with a shed, roads, trees and lamps.
//
// Local space: origin = the pad centre, the gate on the −x side; data/army.json → base.angle turns
// the whole base (Kit site angle; 180° = the gate faces east). toWorld / toLocal convert.
// Everything static is merged into two meshes (lit / glow); trees are one instanced mesh per
// kind (the world's shared tree models); the barrier is its own small mesh (it lifts).
// Colliders are added once.

import * as THREE from 'three';
import { Kit } from '../../world/landmarks/kit.js';
import { GeoBuilder } from '../../world/geoBuilder.js';
import { FACADE } from '../../assets/proceduralTextures.js';
import { markGlow } from '../../world/graphics/glow.js';
import { fontStack, fontsReady } from '../../ui/fonts.js';
import { COLLIDE } from '../../world/collision.js';

/** Name board texture: Bangla on top, English below (canvas, after the fonts are ready). */
async function paintBoard(name) {
  await fontsReady();
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#2f3a1d'; g.fillRect(0, 0, 512, 160);
  g.strokeStyle = '#e8dfb8'; g.lineWidth = 6; g.strokeRect(8, 8, 496, 144);
  g.fillStyle = '#f4ecd0';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold 58px ${fontStack('bn')}`;
  g.fillText(name.bn, 256, 62);
  g.font = `bold 34px ${fontStack('en')}`;
  g.fillText(name.en.toUpperCase(), 256, 120);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class CantonmentBase {
  /**
   * @param {object} game
   * @param {object} pad   terrain field pad ({ cx, cz, height })
   * @param {object} cfg   data/army.json
   */
  constructor(game, pad, cfg) {
    this.game = game;
    this.pad = pad;
    this.cfg = cfg;
    this.B = cfg.base;
    this.angle = ((cfg.base.angle || 0) * Math.PI) / 180;
    this.cos = Math.cos(this.angle);
    this.sin = Math.sin(this.angle);
    this.site = { cx: pad.cx, cz: pad.cz, y: pad.height, angle: this.angle };
    this.group = new THREE.Group();
    this.group.name = 'cantonment';
    this.barrierOpen = 0;   // 0 = down, 1 = up
    this.colliderIds = [];
    this.owned = [];        // geometries / materials / textures this base made (for dispose)
  }

  /** Local → world and back (same turn as the Kit: forward (sin a, cos a)). */
  toWorld(x, z) { return { x: this.site.cx + x * this.cos + z * this.sin, z: this.site.cz - x * this.sin + z * this.cos }; }
  toLocal(x, z) {
    const dx = x - this.site.cx, dz = z - this.site.cz;
    return { x: dx * this.cos - dz * this.sin, z: dx * this.sin + dz * this.cos };
  }
  /** A local heading (radians) as a world heading. */
  heading(local) { return local + this.angle; }

  /** Is (x, z) inside the wall? margin > 0 = also this far outside it. */
  inside(x, z, margin = 0) {
    const h = this.B.wall.half + margin;
    const l = this.toLocal(x, z);
    return Math.abs(l.x) < h && Math.abs(l.z) < h;
  }

  /** World points just inside / outside the gate, and where to stand to buy a pass. */
  gatePoints() {
    const h = this.B.wall.half, P = this.B.guardPost;
    return { inner: this.toWorld(-h + 14, 0), outer: this.toWorld(-h - 22, 0), gate: this.toWorld(-h, 0), post: this.toWorld(P.x0 - 1.2, (P.z0 + P.z1) / 2) };
  }

  async build() {
    const g = this.game;
    const B = this.B;
    const b = { lit: new GeoBuilder(), glow: new GeoBuilder(), sign: new GeoBuilder() };
    const k = new Kit(b, this.site);
    this.ground(k);
    this.wall(k);
    this.gate(k);
    this.guardPost(k);
    for (const t of B.towers) this.tower(k, t.x, t.z);
    for (const bd of B.buildings) this.building(k, bd);
    this.parade(k);
    this.shed(k);
    this.lamps(k);

    const mats = g.world.landmarks?.materials;
    const lit = mats?.lit || new THREE.MeshLambertMaterial({ vertexColors: true });
    const glow = mats?.glow || markGlow(new THREE.MeshBasicMaterial({ vertexColors: true }), 'glow');
    for (const [key, mat] of [['lit', lit], ['glow', glow]]) {
      if (!b[key].count) continue;
      const mesh = new THREE.Mesh(b[key].build(), mat);
      mesh.name = `cantonment-${key}`;
      if (key === 'glow') mesh.userData.noCastShadow = true;
      this.owned.push(mesh.geometry);
      this.group.add(mesh);
    }
    this.trees();
    this.barrier();
    await this.board();
    g.scene.add(this.group);

    // Colliders (static boxes, once).
    const col = g.world.collision;
    for (const c of k.colliders) this.colliderIds.push(col.add(c.x0, c.z0, c.x1, c.z1, c.camera ? COLLIDE.SOLID | COLLIDE.CAMERA : COLLIDE.SOLID));
    this.colliders = this.colliderIds.length;
  }

  // ---------------------------------------------------------------- parts
  ground(k) {
    for (const p of this.B.ground) {
      k.ground(p.x0, p.z0, p.x1, p.z1, p.color, 0.04);
      if (p.lines) {
        // Marching lines across the parade ground.
        for (let x = p.x0 + 10; x < p.x1 - 5; x += 10) k.ground(x - 0.15, p.z0 + 4, x + 0.15, p.z1 - 4, p.lines, 0.05);
        k.ground(p.x0 + 4, p.z0 + 3.7, p.x1 - 4, p.z0 + 4.3, p.lines, 0.05);
        k.ground(p.x0 + 4, p.z1 - 4.3, p.x1 - 4, p.z1 - 3.7, p.lines, 0.05);
      }
    }
  }

  wall(k) {
    const W = this.B.wall, G = this.B.gate;
    const h = W.half, t = W.thick / 2, H = W.height;
    const run = (x0, z0, x1, z1) => {
      // A wall piece as a long box + the green band near the top, posts every postEvery metres.
      k.box(x0, 0, z0, x1, H, z1, W.color, { faces: 'nsewt', top: W.band });
      k.box(x0, H - 0.35, z0 - 0.02, x1, H - 0.1, z1 + 0.02, W.band, { flat: true, faces: 'nsew' });
      k.solid(x0, z0, x1, z1);
      const alongX = x1 - x0 > z1 - z0;
      const len = alongX ? x1 - x0 : z1 - z0;
      for (let u = 0; u <= len; u += W.postEvery) {
        const px = alongX ? x0 + u : (x0 + x1) / 2, pz = alongX ? (z0 + z1) / 2 : z0 + u;
        k.box(px - 0.4, 0, pz - 0.4, px + 0.4, H + 0.35, pz + 0.4, W.color, { flat: true, top: W.band });
      }
    };
    run(-h, -h - t, h, -h + t);              // north
    run(-h, h - t, h, h + t);                // south
    run(h - t, -h, h + t, h);                // east
    run(-h - t, -h, -h + t, -G.half);        // west, north of the gate
    run(-h - t, G.half, -h + t, h);          // west, south of the gate
  }

  gate(k) {
    const W = this.B.wall, G = this.B.gate;
    const x = -W.half, p = G.pillar / 2;
    for (const s of [-1, 1]) {
      const z = s * (G.half + p);
      k.box(x - p, 0, z - p, x + p, G.pillarHeight, z + p, G.color, { top: W.band });
      k.box(x - p - 0.1, G.pillarHeight, z - p - 0.1, x + p + 0.1, G.pillarHeight + 0.25, z + p + 0.1, W.band, { flat: true, faces: 'nsewtb' });
      k.solid(x - p, z - p, x + p, z + p);
      // Tall posts carrying the beam with the name board (high enough for trucks and tanks).
      k.box(x - 0.25, G.pillarHeight, z - 0.25, x + 0.25, G.signHeight + 1.9, z + 0.25, G.color, { flat: true });
    }
    k.box(x - 0.35, G.signHeight + 1.6, -G.half - p, x + 0.35, G.signHeight + 1.9, G.half + p, W.band, { flat: true, faces: 'nsewtb' });
    // Barrier post next to the north pillar, outside.
    k.box(x - 3.2, 0, -G.half - 0.9, x - 2.6, 1.0, -G.half - 0.3, '#3b3b38', { flat: true });
  }

  guardPost(k) {
    const P = this.B.guardPost;
    k.box(P.x0, 0, P.z0, P.x1, P.height, P.z1, P.color, { tile: FACADE.PLAIN });
    k.box(P.x0 - 0.4, P.height, P.z0 - 0.4, P.x1 + 0.4, P.height + 0.25, P.z1 + 0.4, P.roof, { flat: true, faces: 'nsewtb' });
    // Window band and a small counter on the gate side (west).
    k.box(P.x0 - 0.03, 1.2, P.z0 + 0.6, P.x0, 2.2, P.z1 - 0.6, '#9fc4d4', { flat: true, faces: 'w' });
    k.box(P.x0 - 0.6, 0.95, P.z0 + 0.8, P.x0, 1.05, P.z1 - 0.8, '#6e6650', { flat: true, faces: 'nsewt' });
    k.solid(P.x0, P.z0, P.x1, P.z1);
    // A sentry box outside the gate.
    const x = -this.B.wall.half - 4, z = this.B.gate.half + 4;
    k.box(x - 0.8, 0, z - 0.8, x + 0.8, 2.5, z + 0.8, '#5d6b3a', { flat: true, faces: 'nset' });
    k.box(x - 1.0, 2.5, z - 1.0, x + 1.0, 2.7, z + 1.0, '#4f5d2f', { flat: true, faces: 'nsewtb' });
    k.solid(x - 0.8, z - 0.8, x + 0.8, z + 0.8);
  }

  tower(k, x, z) {
    const H = this.B.towerHeight, c = '#6a6d5c';
    for (const [ox, oz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) k.prism(x + ox, z + oz, 0, H, 0.12, 0.1, 4, c);
    k.box(x - 1.8, H, z - 1.8, x + 1.8, H + 1.1, z + 1.8, '#5d6b3a', { flat: true, faces: 'nsewb' });
    k.box(x - 2.0, H + 2.2, z - 2.0, x + 2.0, H + 2.45, z + 2.0, '#4f5d2f', { flat: true, faces: 'nsewtb' });
    for (const [ox, oz] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) k.prism(x + ox, z + oz, H + 1.1, H + 2.2, 0.06, 0.06, 4, c);
    k.solid(x - 1.5, z - 1.5, x + 1.5, z + 1.5, false);
  }

  building(k, bd) {
    const fl = this.game.config.get('world').buildings;
    const H = fl.groundFloorHeight + (bd.floors - 1) * fl.floorHeight;
    k.box(bd.x0, 0, bd.z0, bd.x1, H, bd.z1, bd.color, { tile: FACADE[bd.tile] ?? FACADE.RESIDENTIAL, floors: bd.floors, top: bd.roofColor });
    k.box(bd.x0 - 0.2, 0, bd.z0 - 0.2, bd.x1 + 0.2, 0.6, bd.z1 + 0.2, '#8f8a7a', { flat: true, faces: 'nsew' }); // plinth
    if (bd.roof === 'gable') {
      const axis = bd.x1 - bd.x0 > bd.z1 - bd.z0 ? 'x' : 'z';
      k.gable(bd.x0 - 0.5, bd.z0 - 0.5, bd.x1 + 0.5, bd.z1 + 0.5, H, Math.min(bd.x1 - bd.x0, bd.z1 - bd.z0) * 0.22, bd.roofColor, axis, bd.color);
    } else {
      k.box(bd.x0, H, bd.z0, bd.x1, H + 0.6, bd.z1, bd.color, { flat: true, faces: 'nsew' }); // parapet
      k.box(bd.x0 + 3, H, bd.z0 + 3, bd.x0 + 7, H + 2.4, bd.z0 + 6, bd.color, { top: bd.roofColor }); // stair room
    }
    k.solid(bd.x0, bd.z0, bd.x1, bd.z1);
  }

  parade(k) {
    const D = this.B.dais, F = this.B.flagPole;
    k.box(D.x0, 0, D.z0, D.x1, D.height, D.z1, D.color, { flat: true });
    for (const [x, z] of [[D.x0 + 0.3, D.z1 - 0.3], [D.x1 - 0.3, D.z1 - 0.3], [D.x0 + 0.3, D.z0 + 0.3], [D.x1 - 0.3, D.z0 + 0.3]]) k.prism(x, z, D.height, D.height + 3, 0.1, 0.1, 4, '#d8d0b6');
    k.box(D.x0 - 0.4, D.height + 3, D.z0 - 0.4, D.x1 + 0.4, D.height + 3.25, D.z1 + 0.4, D.roof, { flat: true, faces: 'nsewtb' });
    k.solid(D.x0, D.z0, D.x1, D.z1);
    // Flag pole with a plain green pennant (no national flag, crest or insignia).
    k.prism(F.x, F.z, 0, F.height, 0.09, 0.05, 6, F.color);
    k.prism(F.x, F.z, 0, 0.5, 0.6, 0.6, 8, '#cfc6aa', { cap: true });
    const flag = [[F.x, F.height - 0.3, F.z], [F.x + 2.6, F.height - 0.8, F.z], [F.x + 2.6, F.height - 1.4, F.z], [F.x, F.height - 1.9, F.z]];
    k.quad(...flag, F.pennant, { inside: [F.x + 1, F.height - 1, F.z - 1] });
    k.quad(...flag, F.pennant, { inside: [F.x + 1, F.height - 1, F.z + 1] });
    k.solid(F.x - 0.6, F.z - 0.6, F.x + 0.6, F.z + 0.6, false);
  }

  shed(k) {
    const S = this.B.shed;
    for (let i = 0; i <= 6; i++) {
      const x = S.x0 + ((S.x1 - S.x0) / 6) * i;
      for (const z of [S.z0, S.z1]) {
        k.prism(x, z, 0, S.height, 0.15, 0.15, 4, S.postColor);
        k.solid(x - 0.2, z - 0.2, x + 0.2, z + 0.2, false);
      }
    }
    k.box(S.x0 - 0.6, S.height, S.z0 - 0.8, S.x1 + 0.6, S.height + 0.3, S.z1 + 0.8, S.color, { flat: true, faces: 'nsewtb' });
    k.box(S.x0, 0, S.z1 - 0.1, S.x1, 2.4, S.z1 + 0.1, '#8f8a7a', { flat: true, faces: 'ns' }); // low back wall
    k.solid(S.x0, S.z1 - 0.15, S.x1, S.z1 + 0.15);
  }

  lamps(k) {
    const L = this.B.lamps, h = this.B.wall.half;
    const at = [];
    for (let x = -h + 8; x < -60; x += L.every) at.push([x, -7], [x, 7]);
    for (let u = -h + 20; u < h - 10; u += L.every) at.push([u, -117], [u, 117], [-117, u], [117, u]);
    let n = 0;
    for (const [x, z] of at) {
      if (this.blockedLocal(x, z)) continue;
      k.lamp(x, z, L.height, L.color, L.glow);
      k.solid(x - 0.15, z - 0.15, x + 0.15, z + 0.15, false);
      n++;
    }
    this.lampCount = n;
  }

  /** Is a local point inside (or next to) a building, the shed, the dais or the guard post? */
  blockedLocal(x, z, pad = 2) {
    const r = [...this.B.buildings, this.B.shed, this.B.dais, this.B.guardPost];
    return r.some((b) => x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad);
  }

  /** Real tree models when the world has them (one instanced mesh per kind), else none. */
  trees() {
    const shared = this.game.world.shared;
    const models = shared?.treeModels;
    const B = this.B;
    this.treeCount = 0;
    if (!models?.size) return;
    const kinds = B.treeKinds.filter((k) => models.has(k));
    if (!kinds.length) kinds.push([...models.keys()][0]);
    const byKind = new Map();
    B.trees.forEach(([x, z], i) => {
      if (this.blockedLocal(x, z)) return;
      const kind = kinds[i % kinds.length];
      if (!byKind.has(kind)) byKind.set(kind, []);
      byKind.get(kind).push([x, z, i]);
    });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const col = this.game.world.collision;
    for (const [kind, list] of byKind) {
      const mesh = new THREE.InstancedMesh(models.get(kind), shared.propMaterial, list.length);
      mesh.name = `cantonment-trees-${kind}`;
      list.forEach(([x, z, i], n) => {
        const size = B.treeSize[0] + (((i * 37) % 10) / 10) * (B.treeSize[1] - B.treeSize[0]);
        const w = this.toWorld(x, z);
        q.setFromAxisAngle(up, i * 1.7);
        s.setScalar(size);
        p.set(w.x, this.site.y, w.z);
        mesh.setMatrixAt(n, m.compose(p, q, s));
        this.colliderIds.push(col.add(w.x - 0.3, w.z - 0.3, w.x + 0.3, w.z + 0.3, COLLIDE.SOLID));
      });
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      this.treeCount += list.length;
    }
  }

  /** The lifting barrier: a striped boom along the gate that turns up around its post. */
  barrier() {
    const G = this.B.gate, x = -this.B.wall.half - 2.9;
    const pivot = new THREE.Group();
    pivot.rotation.order = 'YXZ'; // turn with the base first, then lift (rotation.x) in its own frame
    pivot.rotation.y = this.angle;
    const w = this.toWorld(x, -G.half - 0.6);
    pivot.position.set(w.x, this.site.y + 0.95, w.z);
    const len = G.barrierLength;
    const white = new THREE.MeshLambertMaterial({ color: G.barrierColor });
    const red = new THREE.MeshLambertMaterial({ color: G.barrierStripe });
    const seg = new THREE.BoxGeometry(0.16, 0.16, len / 6);
    this.owned.push(white, red, seg);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(seg, i % 2 ? red : white);
      m.position.set(0, 0, (i + 0.5) * (len / 6));
      pivot.add(m);
    }
    pivot.name = 'cantonment-barrier';
    this.boom = pivot;
    this.group.add(pivot);
  }

  /** Name board over the gate, facing the road (west); unlit, so it glows a little. */
  async board() {
    const tex = await paintBoard(this.cfg.name);
    const G = this.B.gate;
    const geo = new THREE.PlaneGeometry(10, 3.1);
    const mat = markGlow(new THREE.MeshBasicMaterial({ map: tex }), 'sign');
    this.owned.push(geo, mat, tex);
    const mesh = new THREE.Mesh(geo, mat);
    const w = this.toWorld(-this.B.wall.half - 0.4, 0);
    mesh.position.set(w.x, this.site.y + G.signHeight + 0.15, w.z);
    mesh.rotation.y = Math.atan2(-this.cos, this.sin); // faces the base's −x side (out of the gate, towards the road)
    mesh.name = 'cantonment-board';
    mesh.userData.noCastShadow = true;
    this.group.add(mesh);
  }

  /** Lift the barrier while a vehicle is near the gate. */
  update(dt, vehicleNear) {
    const target = vehicleNear ? 1 : 0;
    const sp = this.B.gate.openSpeed * dt;
    this.barrierOpen += Math.max(-sp, Math.min(sp, target - this.barrierOpen));
    if (this.boom) this.boom.rotation.x = -this.barrierOpen * Math.PI * 0.47; // the boom lies along +z: turn it up
  }

  dispose() {
    this.group.removeFromParent();
    for (const o of this.owned) o.dispose?.();
    this.owned = [];
    for (const id of this.colliderIds) this.game.world.collision.setFlags(id, 0);
    this.colliderIds = [];
  }
}
