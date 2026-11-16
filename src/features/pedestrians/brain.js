// What one pedestrian does each frame. States:
//   walk   follow the sidewalk to the next corner        wait   stand before crossing a road
//   pause  stand a while (phone, looking around)         flee   run away from danger
//   cower  crouch with hands over the head               fight  chase the player and punch
//   down   knocked to the ground, gets up after a while
// Numbers: data/pedestrians.json → behaviour. The feature (index.js) owns spawning and events.

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _t = { x: 0, z: 0 };

export class Brain {
  constructor(ctx) {
    this.ctx = ctx; // { game, cfg (behaviour), spawnCfg, nav, rng, shout(ped, kind), hitPlayer(ped) }
  }

  range([a, b]) {
    return this.ctx.rng.range(a, b);
  }

  /** Turn towards (dx, dz) and step. Returns the distance actually wanted. */
  step(ped, dx, dz, speed, dt, collide) {
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) { ped.speed = 0; return 0; }
    const want = Math.atan2(dx, dz);
    ped.heading = wrapAngle(ped.heading + wrapAngle(want - ped.heading) * Math.min(1, 9 * dt));
    const bx = ped.x, bz = ped.z;
    const d = Math.min(len, speed * dt);
    ped.x += (dx / len) * d;
    ped.z += (dz / len) * d;
    if (collide) this.ctx.game.world.collision.resolveCircle(ped, this.ctx.spawnCfg.radius);
    ped.speed = dt > 0 ? Math.hypot(ped.x - bx, ped.z - bz) / dt : 0;
    return len;
  }

  setState(ped, state, seconds = 0) {
    ped.state = state;
    ped.timer = seconds;
  }

  /** Go back to normal walking from wherever the person ended up. */
  calm(ped) {
    const node = this.ctx.nav.nearestNode(ped.x, ped.z);
    ped.animator.stop();
    ped.animator.idleName = ped.arch.idle || 'idle';
    ped.fleeFrom = null;
    if (!node) return this.setState(ped, 'pause', 2);
    ped.prev = null;
    ped.node = node;
    this.setState(ped, 'walk');
  }

  startFlee(ped, from, followPlayer) {
    ped.fleeFrom = { x: from.x, z: from.z };
    ped.fleePlayer = followPlayer;
    ped.fleeTurn = this.ctx.rng.range(-0.5, 0.5);
    ped.animator.stop();
    this.setState(ped, 'flee', this.range(this.ctx.cfg.fleeSeconds));
    ped.runSpeed = this.range(this.ctx.cfg.fleeSpeed);
  }

  startCower(ped, from) {
    ped.fleeFrom = { x: from.x, z: from.z };
    ped.animator.play('cower');
    this.setState(ped, 'cower', this.range(this.ctx.cfg.cowerSeconds));
  }

  startFight(ped) {
    ped.animator.stop();
    ped.animator.idleName = 'guard';
    ped.punchIn = this.range(this.ctx.cfg.fightPunchEvery) * 0.5;
    ped.hitIn = -1;
    this.setState(ped, 'fight', this.ctx.cfg.fightSeconds);
  }

  knockDown(ped) {
    ped.animator.play('down');
    ped.speed = 0;
    this.setState(ped, 'down', this.range(this.ctx.cfg.downSeconds));
  }

  update(ped, dt, near) {
    const { cfg, nav, rng, game } = this.ctx;
    const player = game.player;
    ped.timer -= dt;
    switch (ped.state) {
      case 'walk': {
        nav.cornerPos(ped.node, ped.off, _t);
        const left = this.step(ped, _t.x - ped.x, _t.z - ped.z, ped.walkSpeed * (ped.crossing ? 1.25 : 1), dt, near);
        // Blocked for a while (pole, crowd, wall)? Turn round.
        ped.stuck += dt;
        if (ped.stuck > cfg.stuckSeconds) {
          if (Math.hypot(ped.x - ped.markX, ped.z - ped.markZ) < 0.35 && ped.prev) {
            const n = ped.node; ped.node = ped.prev; ped.prev = n;
          }
          ped.stuck = 0; ped.markX = ped.x; ped.markZ = ped.z;
        }
        if (left > 0.4) break;
        ped.crossing = false;
        const options = nav.options(ped.node, ped.prev);
        const weights = options.map((o) => (o.cross ? cfg.crossWeight : cfg.straightWeight));
        let r = rng.next() * weights.reduce((a, b) => a + b, 0);
        let next = options[0];
        for (let i = 0; i < options.length; i++) { r -= weights[i]; if (r <= 0) { next = options[i]; break; } }
        ped.prev = ped.node;
        ped.node = next;
        if (next.cross) {
          ped.crossing = true;
          this.setState(ped, 'wait', this.range(cfg.waitAtCrossing));
        } else if (rng.chance(cfg.pauseChance)) {
          this.setState(ped, 'pause', this.range(cfg.pauseSeconds));
        }
        break;
      }
      case 'wait':
      case 'pause':
        ped.speed = 0;
        if (ped.timer <= 0) this.setState(ped, 'walk');
        break;
      case 'flee': {
        if (ped.fleePlayer && player) { ped.fleeFrom.x = player.position.x; ped.fleeFrom.z = player.position.z; }
        const dx = ped.x - ped.fleeFrom.x, dz = ped.z - ped.fleeFrom.z;
        const a = Math.atan2(dx, dz) + ped.fleeTurn;
        this.step(ped, Math.sin(a) * 10, Math.cos(a) * 10, ped.runSpeed, dt, true);
        if (ped.timer <= 0) this.calm(ped);
        break;
      }
      case 'cower':
        ped.speed = 0;
        if (ped.timer <= 0) this.startFlee(ped, ped.fleeFrom, false);
        break;
      case 'fight': {
        if (!player) { this.calm(ped); break; }
        const dx = player.position.x - ped.x, dz = player.position.z - ped.z;
        const dist = Math.hypot(dx, dz);
        if (ped.timer <= 0 || dist > cfg.fightGiveUpDistance) { this.calm(ped); break; }
        if (dist > cfg.fightReach) {
          this.step(ped, dx, dz, cfg.fightSpeed, dt, true);
        } else {
          ped.speed = 0;
          ped.heading = wrapAngle(ped.heading + wrapAngle(Math.atan2(dx, dz) - ped.heading) * Math.min(1, 12 * dt));
          ped.punchIn -= dt;
          if (ped.punchIn <= 0) {
            ped.punchIn = this.range(cfg.fightPunchEvery);
            ped.punchSide = -(ped.punchSide || 1);
            ped.animator.play('punch', { side: ped.punchSide });
            ped.hitIn = 0.15;
          }
        }
        if (ped.hitIn >= 0) {
          ped.hitIn -= dt;
          if (ped.hitIn < 0 && dist < cfg.fightReach + 0.35) this.ctx.hitPlayer(ped);
        }
        break;
      }
      case 'down':
        ped.speed = 0;
        if (ped.timer <= 0) {
          ped.animator.stop('down');
          ped.hp = cfg.health;
          this.startFlee(ped, player ? player.position : ped, true);
          ped.runSpeed *= 0.8;
        }
        break;
      default:
        this.setState(ped, 'walk');
    }

    // People step out of the player's way instead of blocking him.
    if (player && ped.state !== 'down') {
      const dx = ped.x - player.position.x, dz = ped.z - player.position.z;
      const d = Math.hypot(dx, dz);
      if (d < cfg.playerPushRadius && d > 1e-3 && ped.state !== 'fight') {
        const push = (cfg.playerPushRadius - d) * Math.min(1, 8 * dt);
        ped.x += (dx / d) * push;
        ped.z += (dz / d) * push;
      }
    }
  }
}
