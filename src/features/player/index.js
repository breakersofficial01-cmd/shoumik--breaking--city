// Feature: player. Shoumik on foot — walking, running, sprinting, jumping, sliding along
// buildings. Publishes its state as game.player (other features read it; nobody imports
// this file). Numbers: data/player.json.
//
// Events sent:  player:spawned { x, z }   district:entered { district }
//
// Movement is relative to the camera: stick up = away from the camera.

import { debugLine } from '../../core/debug.js';
import { buildShoumikPlaceholder, HumanoidAnimator } from '../../entities/shoumikPlaceholder.js';

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

let game = null;
let cfg = null;
let model = null;
let animator = null;
let lastDistrict = null;

/** Live player state shared through game.player. */
const state = {
  position: { x: 0, y: 0, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
  heading: 0,          // radians; 0 faces +z (south), turning towards +x (east)
  speed: 0,            // ground speed, m/s
  grounded: true,
  mode: 'onFoot',      // 'driving' etc. in later sessions
  model: null,
};

function spawnPoint() {
  const L = game.world.layout;
  const s = cfg.spawn;
  const c = L.crossingCentre(s.col, s.row);
  // Stand on the sidewalk corner next to the crossing, not in the middle of the road.
  const off = L.W / 2 + 1.6;
  return { x: c.x + off, z: c.z + off, heading: s.heading };
}

function placeAt(p) {
  state.position.x = p.x;
  state.position.z = p.z;
  state.position.y = game.world.heightAt(p.x, p.z);
  state.heading = p.heading ?? 0;
  state.velocity.x = state.velocity.y = state.velocity.z = 0;
}

export default {
  id: 'player',

  async init(g) {
    game = g;
    cfg = g.config.get('player');
    g.assets.registerDefault('model.player', () => buildShoumikPlaceholder(cfg.model));
    await g.assets.load('model.player');
    model = g.assets.instance('model.player');
    animator = new HumanoidAnimator(model);
    g.scene.add(model);
    state.model = model;

    // Continue from the saved spot if it is still a free place, else the spawn point.
    const saved = g.save.data.player;
    const L = g.world.layout;
    const savedOk = saved && Number.isFinite(saved.x) && Number.isFinite(saved.z) &&
      L.pieceAt(saved.x, saved.z) && !g.world.collision.isBlocked(saved.x, saved.z, cfg.radius);
    placeAt(savedOk ? saved : spawnPoint());
    g.player = state;
    g.cameraRig.setTarget(state, 'onFoot', true);
    g.save.onBeforeSave((data) => {
      data.player = { x: +state.position.x.toFixed(2), z: +state.position.z.toFixed(2), heading: +state.heading.toFixed(3) };
    });
    this.syncModel();
    g.events.emit('player:spawned', { x: state.position.x, z: state.position.z });
  },

  syncModel() {
    model.position.set(state.position.x, state.position.y, state.position.z);
    model.rotation.y = state.heading;
  },

  update(dt) {
    if (state.mode !== 'onFoot') return;
    const { input, cameraRig, world } = game;
    const pos = state.position;
    const vel = state.velocity;

    // 1) Wanted speed from stick / keys, relative to the camera.
    const mx = input.move.x;
    const my = input.move.y;
    const amount = Math.min(1, Math.hypot(mx, my));
    let wantX = 0, wantZ = 0;
    if (amount > 0.01) {
      const f = cameraRig.forward();
      const r = cameraRig.right();
      const dx = f.x * my + r.x * mx;
      const dz = f.z * my + r.z * mx;
      const len = Math.hypot(dx, dz) || 1;
      const top = input.held.sprint ? cfg.sprintSpeed : amount < cfg.walkStickThreshold ? cfg.walkSpeed : cfg.runSpeed;
      wantX = (dx / len) * top;
      wantZ = (dz / len) * top;
      // Turn to face where he is going.
      const targetHeading = Math.atan2(dx, dz);
      state.heading = wrapAngle(state.heading + wrapAngle(targetHeading - state.heading) * Math.min(1, cfg.turnSpeed * dt));
    }

    // 2) Accelerate / brake towards it.
    const rate = (amount > 0.01 ? cfg.acceleration : cfg.deceleration) * dt;
    const ddx = wantX - vel.x;
    const ddz = wantZ - vel.z;
    const dlen = Math.hypot(ddx, ddz);
    if (dlen <= rate || dlen < 1e-6) { vel.x = wantX; vel.z = wantZ; }
    else { vel.x += (ddx / dlen) * rate; vel.z += (ddz / dlen) * rate; }

    // 3) Move, then slide along anything solid.
    const beforeX = pos.x, beforeZ = pos.z;
    pos.x += vel.x * dt;
    pos.z += vel.z * dt;
    world.collision.resolveCircle(pos, cfg.radius);
    state.speed = dt > 0 ? Math.hypot(pos.x - beforeX, pos.z - beforeZ) / dt : 0;

    // 4) Jump + gravity; follow the ground (kerbs) smoothly.
    const ground = world.heightAt(pos.x, pos.z);
    if (state.grounded) {
      if (input.pressed.jump) {
        vel.y = cfg.jumpSpeed;
        state.grounded = false;
      } else {
        pos.y += (ground - pos.y) * Math.min(1, cfg.stepSmooth * dt);
      }
    }
    if (!state.grounded) {
      vel.y -= cfg.gravity * dt;
      pos.y += vel.y * dt;
      if (pos.y <= ground && vel.y <= 0) {
        pos.y = ground;
        vel.y = 0;
        state.grounded = true;
      }
    }

    this.syncModel();
    animator.update(dt, { speed: state.speed, grounded: state.grounded, height: Math.max(0, pos.y - ground) });

    // 5) Tell everyone when he walks into another district.
    const district = world.districtAt(pos.x, pos.z);
    if (district && district !== lastDistrict) {
      lastDistrict = district;
      game.events.emit('district:entered', { district });
    }
    debugLine('player', `pos ${pos.x.toFixed(0)}, ${pos.z.toFixed(0)}  ${district ? district.id : '-'}  ${state.speed.toFixed(1)} m/s`);
  },

  dispose() {
    if (model) game.scene.remove(model);
    game.player = null;
    model = animator = null;
  },
};
