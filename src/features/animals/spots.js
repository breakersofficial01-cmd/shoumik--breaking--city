// Where animals can be (Roadmap 2 S5), for data/animals.json → kinds.<kind>.where:
//   street – a sidewalk spot (dogs, cats), like the pedestrians use
//   herd   – a sidewalk in the listed city districts (Old Dhaka lanes) or open ground in the
//            listed countryside zones of data/terrain.json (cows, goats)
//   perch  – a point on an overhead wire span or a rooftop edge (crows)
//   water  – a point on a city lake, a park pond or a countryside pond (ducks); the animal
//            remembers its water body so it only swims inside it
// Every function returns { x, y, z, ...extra } or null. rng = src/core/rng.js.

import { KIND } from '../../world/layout.js';

export class AnimalSpots {
  /** @param {object} game  @param {object} cfg data/animals.json  @param {import('../pedestrians/navigation.js').SidewalkNav} nav */
  constructor(game, cfg, nav) {
    this.game = game;
    this.cfg = cfg;
    this.nav = nav;
    this.world = game.world;
    this.layout = game.world.layout;
    this.waterY = game.config.get('world').water.level;
  }

  ground(x, z) { return this.world.heightAt(x, z); }

  free(x, z, r = 0.4) { return !this.world.collision.isBlocked(x, z, r); }

  /** A sidewalk point near (x, z), `off` metres in from the kerb (null outside the city). */
  sidewalk(x, z, off) {
    if (!this.layout.pieceAt(x, z)) return null;
    const s = this.nav.sidewalkSpot(x, z, off);
    if (!s || !this.free(s.x, s.z)) return null;
    return { x: s.x, z: s.z, y: this.ground(s.x, s.z) };
  }

  street(x, z, rng) {
    return this.sidewalk(x, z, rng.range(0.9, 3.2));
  }

  herd(x, z, rng, kind) {
    const district = this.world.districtAt(x, z);
    if (district) {
      if (!(kind.districts || []).includes(district.id)) return null;
      return this.sidewalk(x, z, rng.range(1.2, 3.4));
    }
    const zone = this.world.terrain?.zoneAt(x, z);
    if (!zone || !(kind.zones || []).includes(zone.id)) return null;
    const y = this.ground(x, z);
    if (y < this.waterY + 0.3 || !this.free(x, z, 1)) return null;
    return { x, z, y };
  }

  /** Near (x, z): a wire span point or a rooftop edge, within behaviour.perchSearch metres. */
  perch(x, z, rng) {
    const p = this.layout.pieceAt(x, z);
    if (!p || !p.content) return null;
    const c = p.content;
    const wires = c.wires || [];
    if (wires.length && rng.chance(0.6)) {
      const w = rng.pick(wires);
      // Near the ends the wire hangs least (props.js sags strands by up to ~1 m in the middle).
      const t = rng.chance(0.5) ? rng.range(0.06, 0.14) : rng.range(0.86, 0.94);
      const sag = 0.55 * 4 * t * (1 - t);
      const px = w.a[0] + (w.b[0] - w.a[0]) * t, pz = w.a[2] + (w.b[2] - w.a[2]) * t;
      const y = w.a[1] + (w.b[1] - w.a[1]) * t - sag - 0.06;
      return { x: px, z: pz, y, heading: Math.atan2(w.b[0] - w.a[0], w.b[2] - w.a[2]) + Math.PI / 2 * (rng.chance(0.5) ? 1 : -1) };
    }
    const b = (c.buildings || []).length ? rng.pick(c.buildings) : null;
    if (!b) return null;
    // A point on the roof edge (parapet), facing out.
    const side = rng.int(0, 3);
    const u = rng.range(0.15, 0.85);
    const pts = [
      [b.x0 + (b.x1 - b.x0) * u, b.z0 + 0.15, Math.PI],
      [b.x1 - 0.15, b.z0 + (b.z1 - b.z0) * u, Math.PI / 2],
      [b.x0 + (b.x1 - b.x0) * u, b.z1 - 0.15, 0],
      [b.x0 + 0.15, b.z0 + (b.z1 - b.z0) * u, -Math.PI / 2],
    ][side];
    return { x: pts[0], z: pts[1], y: this.ground(pts[0], pts[1]) + b.h + 0.02, heading: pts[2] };
  }

  /** Water bodies within `range` of (x, z): rectangles (lakes, park ponds) and discs (country ponds). */
  waters(x, z, range) {
    const out = [];
    for (const p of this.layout.pieces) {
      if (Math.abs(p.x + p.w / 2 - x) > range + p.w || Math.abs(p.z + p.d / 2 - z) > range + p.d) continue;
      if (p.kind === KIND.WATER) out.push({ rect: [p.x + 3, p.z + 3, p.x + p.w - 3, p.z + p.d - 3] });
      if (p.pond) out.push({ rect: [p.pond.x0 + 1.5, p.pond.z0 + 1.5, p.pond.x1 - 1.5, p.pond.z1 - 1.5] });
    }
    for (const d of this.world.terrain?.field?.ponds || []) {
      if (Math.hypot(d.x - x, d.z - z) < range + d.r) out.push({ disc: [d.x, d.z, d.r * 0.7] });
    }
    return out.filter((w) => !w.rect || (w.rect[2] > w.rect[0] && w.rect[3] > w.rect[1]));
  }

  /** A random point inside water body w. */
  inWater(w, rng) {
    if (w.rect) return { x: rng.range(w.rect[0], w.rect[2]), z: rng.range(w.rect[1], w.rect[3]), y: this.waterY };
    const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next()) * w.disc[2];
    return { x: w.disc[0] + Math.cos(a) * r, z: w.disc[1] + Math.sin(a) * r, y: this.waterY };
  }

  /** Is (x, z) inside water body w (with a margin)? */
  inside(w, x, z) {
    if (w.rect) return x > w.rect[0] && x < w.rect[2] && z > w.rect[1] && z < w.rect[3];
    return Math.hypot(x - w.disc[0], z - w.disc[1]) < w.disc[2];
  }

  water(x, z, rng) {
    const list = this.waters(x, z, this.cfg.behaviour.waterSearch);
    if (!list.length) return null;
    const w = rng.pick(list);
    return { ...this.inWater(w, rng), water: w };
  }

  /** Spot for kind (name, cfg) near (x, z), or null. */
  find(name, kind, x, z, rng) {
    switch (kind.where) {
      case 'street': return this.street(x, z, rng);
      case 'herd': return this.herd(x, z, rng, kind);
      case 'perch': return this.perch(x, z, rng);
      case 'water': return this.water(x, z, rng);
      default: return null;
    }
  }
}
