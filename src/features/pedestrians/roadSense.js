// How pedestrians deal with vehicles: jump out of the way of a fast one, get knocked down
// when hit, step aside for a slow one. Used only by ./index.js.
//
// The pedestrians feature never imports the vehicles feature: vehicles are simply the
// moving circles in world.collision.dynamic that are marked  kind: 'vehicle'  (they carry
// vx, vz, speed and `owner` = the vehicle). Numbers: data/pedestrians.json → behaviour.vehicles.

export class RoadSense {
  /** @param {object} ctx { game, cfg (behaviour), radius, brain, rng, shout, killSpeed, kill(ped, by, dx, dz) } */
  constructor(ctx) {
    this.ctx = ctx;
    this.moving = [];
  }

  /** Once a frame: which vehicle circles are moving at all? */
  collect() {
    this.moving.length = 0;
    for (const o of this.ctx.game.world.collision.dynamic) {
      if (o.kind === 'vehicle' && o.speed > 0.6) this.moving.push(o);
    }
    return this.moving.length;
  }

  /** @returns {boolean} true when the pedestrian reacted (dived or was hit) */
  check(ped) {
    const { game, cfg, radius, brain, rng, shout } = this.ctx;
    const V = cfg.vehicles;
    for (const o of this.moving) {
      const dx = ped.x - o.x, dz = ped.z - o.z;
      if (Math.abs(dx) > V.checkRange || Math.abs(dz) > V.checkRange) continue;
      const vdx = o.vx / o.speed, vdz = o.vz / o.speed;
      const ahead = dx * vdx + dz * vdz;       // metres in front of the vehicle
      const side = dx * vdz - dz * vdx;        // metres to one side of its path
      const sign = side >= 0 ? 1 : -1;
      const byPlayer = o.owner?.driver === 'player';
      if (dx * dx + dz * dz < (o.r + radius) ** 2 && ahead > -0.2) {
        if (o.speed < V.hitSpeed) {
          // Nudged by a crawling vehicle: shuffle aside.
          ped.x += vdz * sign * 0.06;
          ped.z -= vdx * sign * 0.06;
          continue;
        }
        // Run over: thrown forward and to the side, lies on the road for a while.
        ped.x += vdx * V.throw + vdz * sign * 0.5;
        ped.z += vdz * V.throw - vdx * sign * 0.5;
        game.world.collision.resolveCircle(ped, radius);
        if (o.speed >= this.ctx.killSpeed) {
          // Too fast to survive (data/combat.json → people.runOverKillSpeed).
          this.ctx.kill(ped, byPlayer ? 'player' : 'traffic', vdx, vdz);
          game.events.emit('danger:raised', { x: ped.x, z: ped.z, radius: V.hitDangerRadius, source: byPlayer ? 'player' : 'traffic' });
          if (byPlayer) game.events.emit('crime:committed', { type: 'hitPedestrian', x: ped.x, z: ped.z });
          return true;
        }
        brain.knockDown(ped);
        shout(ped, 'pain');
        game.events.emit('ped:hit', { x: ped.x, z: ped.z, down: true, byVehicle: true });
        game.events.emit('danger:raised', { x: ped.x, z: ped.z, radius: V.hitDangerRadius, source: byPlayer ? 'player' : 'traffic' });
        if (byPlayer) game.events.emit('crime:committed', { type: 'hitPedestrian', x: ped.x, z: ped.z });
        return true;
      }
      if (o.speed < V.diveSpeed || ahead <= 0) continue;
      const reach = o.speed * (byPlayer ? V.diveSeconds : V.diveSecondsAi) + o.r;
      if (ahead > reach || Math.abs(side) > o.r + radius + V.diveWidth) continue;
      brain.startDive(ped, vdz * sign, -vdx * sign);
      if (rng.chance(V.diveShoutChance)) shout(ped, 'dive');
      return true;
    }
    return false;
  }
}
