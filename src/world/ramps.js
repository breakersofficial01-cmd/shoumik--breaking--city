// Stunt ramps: tent-shaped humps in the parks and plazas. Drive over one fast and the car
// flies. They are part of the ground:  world.heightAt() includes them, so Shoumik, the
// camera and vehicles all stand on them. List and size: data/world.json → ramps.
//
// A ramp is `2 * run` long (up one side, down the other), `width` wide and `height` tall
// at the ridge. `at` = [col, row] in junction units (may be fractional, see GAME_SPEC map),
// `heading` in degrees = the direction you drive over it (0 = north-south, 90 = east-west).

import * as THREE from 'three';
import { VBuilder } from '../entities/vehicles/shapes.js';

export class Ramps {
  /** @param {import('./layout.js').CityLayout} layout  @param {object} cfg world.ramps */
  constructor(layout, cfg) {
    this.cfg = cfg || { list: [] };
    this.list = [];
    for (const item of this.cfg.list || []) {
      if (!Array.isArray(item.at)) continue;
      const x = layout.minX + item.at[0] * layout.P + layout.W / 2;
      const z = layout.minZ + item.at[1] * layout.P + layout.W / 2;
      if (!layout.pieceAt(x, z)) continue;
      const a = ((item.heading || 0) * Math.PI) / 180;
      this.list.push({
        id: item.id, x, z, fx: Math.sin(a), fz: Math.cos(a),
        run: item.run ?? this.cfg.run, width: item.width ?? this.cfg.width, height: item.height ?? this.cfg.height,
        y: layout.heightAt(x, z),
      });
    }
    this.clearTrees(layout);
    /** Optional extra height function (x, z) → metres, set by world.js for landmark platforms. */
    this.surface = null;
  }

  /** Height of the ramp surface above the normal ground at (x, z); 0 when not on a ramp. */
  heightAt(x, z) {
    // Walkable landmark platforms count as ramps too, so vehicles climb and jump them.
    const extra = this.surface ? this.surface(x, z) : 0;
    if (extra > 0) return extra;
    for (const r of this.list) {
      const dx = x - r.x, dz = z - r.z;
      const along = Math.abs(dx * r.fx + dz * r.fz);
      if (along >= r.run) continue;
      if (Math.abs(dx * r.fz - dz * r.fx) > r.width / 2) continue;
      return r.height * (1 - along / r.run);
    }
    return 0;
  }

  /** No trees on the ramp or on its run-up (must happen before colliders and meshes are made). */
  clearTrees(layout) {
    const reach = this.cfg.clearRunUp || 0;
    for (const r of this.list) {
      for (const p of layout.pieces) {
        const trees = p.content?.trees;
        if (!trees?.length) continue;
        if (Math.abs(p.x + p.w / 2 - r.x) > p.w + reach + r.run || Math.abs(p.z + p.d / 2 - r.z) > p.d + reach + r.run) continue;
        p.content.trees = trees.filter((t) => {
          const dx = t.x - r.x, dz = t.z - r.z;
          return Math.abs(dx * r.fx + dz * r.fz) > r.run + reach || Math.abs(dx * r.fz - dz * r.fx) > r.width / 2 + 2;
        });
      }
    }
  }

  /** One small mesh with every ramp (striped so they are easy to spot). */
  buildMesh() {
    if (!this.list.length) return null;
    const vb = new VBuilder();
    const stripes = 4;
    for (const r of this.list) {
      const hw = r.width / 2;
      const sx = r.fz, sz = -r.fx; // sideways
      const pt = (along, side, h) => [r.x + r.fx * along + sx * side, r.y + h, r.z + r.fz * along + sz * side];
      const inside = [r.x, r.y - 1, r.z];
      for (const dir of [-1, 1]) {
        for (let i = 0; i < stripes; i++) {
          const a0 = dir * r.run * (1 - i / stripes), a1 = dir * r.run * (1 - (i + 1) / stripes);
          const h0 = (r.height * i) / stripes, h1 = (r.height * (i + 1)) / stripes;
          vb.quad(pt(a0, -hw, h0), pt(a0, hw, h0), pt(a1, hw, h1), pt(a1, -hw, h1), i % 2 ? this.cfg.stripeColor : this.cfg.color, inside);
        }
      }
      for (const s of [-hw, hw]) {
        vb.quad(pt(-r.run, s, 0), pt(0, s, r.height), pt(0, s, r.height), pt(r.run, s, 0), this.cfg.sideColor, [r.x, r.y + 0.2, r.z]);
      }
    }
    const mesh = new THREE.Mesh(vb.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.name = 'ramps';
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}
