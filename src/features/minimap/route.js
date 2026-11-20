// GPS route (Session 9): the shortest way along the roads from the player to a target, drawn
// as a yellow line on the minimap and the full map.
//   route:set { x, z, label?, icon? }   start guiding     route:clear {}   stop
// Recomputed every RECALC seconds (the player moves); cleared on arrival (mapView.routeArriveMetres).

import { DIRS } from '../../world/roads.js';

const RECALC = 1.5;

export class Route {
  constructor(game) {
    this.game = game;
    this.target = null;   // { x, z, label, icon }
    this.points = [];     // [[x, z], ...] from the player to the target
    this.timer = 0;
  }

  set(target) {
    this.target = target && Number.isFinite(target.x) ? { ...target } : null;
    this.timer = 0;
    this.points = [];
    if (this.target) this.recalc();
  }

  clear() { this.set(null); }

  recalc() {
    const g = this.game;
    const roads = g.world.roads;
    const L = g.world.layout;
    const p = g.player.position;
    const a = roads.nearestJunction(p.x, p.z);
    const b = roads.nearestJunction(this.target.x, this.target.z);
    const pts = [[p.x, p.z]];
    const dirs = a && b ? roads.route(a.c, a.r, b.c, b.r) : null;
    if (dirs) {
      let c = a.c, r = a.r;
      const start = L.crossingCentre(c, r);
      pts.push([start.x, start.z]);
      for (const d of dirs) {
        c += DIRS[d].dc; r += DIRS[d].dr;
        const q = L.crossingCentre(c, r);
        pts.push([q.x, q.z]);
      }
    }
    pts.push([this.target.x, this.target.z]);
    this.points = pts;
  }

  /** @returns {boolean} true when the player has just arrived */
  update(dt, arriveMetres) {
    if (!this.target) return false;
    const p = this.game.player.position;
    if (Math.hypot(this.target.x - p.x, this.target.z - p.z) < arriveMetres) { this.clear(); return true; }
    this.timer -= dt;
    if (this.timer <= 0) { this.timer = RECALC; this.recalc(); }
    else if (this.points.length) this.points[0] = [p.x, p.z];
    return false;
  }

  /** Stroke the route on a 2D context; project(x, z) → [px, py]. */
  draw(ctx, project, width, colors) {
    if (!this.points.length) return;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    this.points.forEach(([x, z], i) => { const [px, py] = project(x, z); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
    ctx.strokeStyle = colors.routeEdge;
    ctx.lineWidth = width + 3;
    ctx.stroke();
    ctx.strokeStyle = colors.route;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.restore();
  }
}
