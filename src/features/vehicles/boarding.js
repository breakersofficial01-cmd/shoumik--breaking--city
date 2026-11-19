// Boarding: getting Shoumik into and out of vehicles, and keeping him on the seat.
// Used only by ./index.js.
//
// States:  foot → entering → driving (he drives) or riding (hired ride, passenger seat)
//          → exiting → foot.
// While he is not on foot, game.player.mode is 'vehicle' (the player feature then only
// animates him; we place him) and game.player.vehicle is the vehicle.
//
// Carjacking: a vehicle that has a driver loses him first — the driver is thrown out on the
// other side (vehicle:driverEjected → the pedestrians feature turns him into a person).
//
// Events sent
//   vehicle:entered { id, type, jacked, passenger }    vehicle:exited { id, type, passenger }
//   vehicle:driverEjected { x, z, heading, archetype, angry, flee }
//   crime:committed { type: 'carjack' | 'stealPolice', x, z }   (wanted stars)
//   A police pickup (driver 'police', tags.police) can be jacked too: its driver is sent out
//   with police: true and the police feature turns him into an angry officer.
//   controls:mode { mode: 'driving' | 'onFoot' }       player:action { name, … }

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _door = { x: 0, y: 0, z: 0 };
const _seat = { x: 0, y: 0, z: 0 };

export class Boarding {
  constructor(game, fleet, cfg, rng) {
    this.game = game;
    this.fleet = fleet;
    this.cfg = cfg.enterExit;
    this.rng = rng;
    this.state = 'foot';
    this.vehicle = null;
    this.passenger = false;
    this.exitQueued = false;
    this.t = 0;
    this.side = 1;
    this.from = { x: 0, y: 0, z: 0, heading: 0 };
    this.to = { x: 0, z: 0 };
    this.animStarted = false;
    const pc = game.config.get('player');
    this.radius = pc.radius;
    this.sitDrop = this.cfg.sitHipHeight * pc.model.heightScale;
  }

  get onFoot() { return this.state === 'foot'; }

  get seat() {
    const T = this.vehicle.T;
    return this.passenger ? T.passengerSeat || T.seat : T.seat;
  }

  /** +1 when (x, z) is on the vehicle's left, -1 on its right. */
  sideOf(v, x, z) {
    return (x - v.x) * Math.cos(v.heading) - (z - v.z) * Math.sin(v.heading) >= 0 ? 1 : -1;
  }

  /** Throw the driver out on the side away from Shoumik. */
  ejectDriver(v, side) {
    const out = v.T.size[1] / 2 + 0.8;
    v.localToWorld([-side * out, 0, v.T.seat[2]], _door);
    this.fleet.setRider(v, null);
    const angry = this.rng.chance(this.cfg.ejectAngry);
    const ev = this.game.events;
    const police = !!v.tags.police;
    ev.emit('vehicle:driverEjected', { x: _door.x, z: _door.z, heading: v.heading, archetype: v.tags.riderArchetype || null, angry: angry || police, flee: !angry && !police, police });
    ev.emit('crime:committed', { type: police ? 'stealPolice' : 'carjack', x: v.x, z: v.z });
    ev.emit('danger:raised', { x: v.x, z: v.z, radius: this.cfg.jackDangerRadius, source: 'player' });
  }

  /** Start getting in. passenger = hired ride (the driver stays). */
  enter(v, passenger = false) {
    const player = this.game.player;
    const p = player.position;
    this.vehicle = v;
    this.passenger = passenger;
    this.side = this.sideOf(v, p.x, p.z);
    const jacked = !passenger && (v.driver === 'ai' || v.driver === 'police' || !!v.tags.stand);
    if (jacked) this.ejectDriver(v, this.side);
    if (!passenger) {
      v.driver = 'player';
      v.brain = null;
      v.tags.stand = false;
      v.tags.riderArchetype = null;
      if (v.tags.slot) { v.tags.slot.spent = true; v.tags.slot.vehicle = null; v.tags.slot = null; }
    }
    v.input.throttle = 0; v.input.steer = 0; v.input.handbrake = true;
    this.state = 'entering';
    this.t = 0;
    this.animStarted = false;
    this.exitQueued = false;
    this.from = { x: p.x, y: p.y, z: p.z, heading: player.heading };
    player.mode = 'vehicle';
    player.vehicle = v;
    player.velocity.x = player.velocity.y = player.velocity.z = 0;
    player.grounded = true;
    this.game.cameraRig.setTarget(v, 'driving', false, v.T.camera || 1);
    this.game.events.emit('vehicle:entered', { id: v.id, type: v.type, jacked, passenger });
    this.game.events.emit('controls:mode', { mode: 'driving' });
  }

  /** Ask to get out; he steps out as soon as the vehicle is slow enough. */
  requestExit() {
    if (this.state === 'driving' || this.state === 'riding') this.exitQueued = true;
  }

  /** A free spot next to the vehicle to step out to. */
  exitSpot(v) {
    const { game, fleet } = this;
    const [L, W] = v.T.size;
    const w = W / 2 + this.cfg.doorGap, sz = this.seat[2];
    // Passengers step out on the kerb side (left); the driver on the side his seat is.
    const pref = this.passenger ? 1 : this.seat[0] > 0 ? 1 : -1;
    const options = [[pref * w, sz], [-pref * w, sz], [pref * w, sz - 1.3], [-pref * w, sz - 1.3], [0, -(L / 2 + 0.9)], [0, L / 2 + 0.9]];
    for (const [lx, lz] of options) {
      v.localToWorld([lx, 0, lz], _door);
      if (!game.world.layout.pieceAt(_door.x, _door.z)) continue;
      if (game.world.collision.isBlocked(_door.x, _door.z, this.radius)) continue;
      if (fleet.nearest(_door.x, _door.z, this.radius, (o) => o !== v)) continue;
      return { x: _door.x, z: _door.z, side: Math.sign(lx) || 1 };
    }
    v.localToWorld([pref * w, 0, sz], _door);
    return { x: _door.x, z: _door.z, side: pref };
  }

  /** Step out now. instant = no animation (the vehicle exploded or vanished). */
  exitNow(instant = false) {
    const v = this.vehicle;
    const player = this.game.player;
    if (!v || this.state === 'foot' || this.state === 'exiting') return;
    const spot = this.exitSpot(v);
    if (player.model) player.model.visible = true;
    this.to = spot;
    this.from = { x: player.position.x, y: player.position.y, z: player.position.z, heading: player.heading };
    if (!this.passenger) { v.driver = null; v.brain = null; }
    v.input.throttle = 0; v.input.handbrake = true;
    this.exitQueued = false;
    this.t = instant ? this.cfg.exitSeconds : 0;
    this.state = 'exiting';
    this.game.cameraRig.setTarget(player, 'onFoot');
    if (instant) this.game.events.emit('player:action', { name: 'enterVehicle', on: false });
    else this.game.events.emit('player:action', { name: 'exitVehicle', side: spot.side > 0 ? -1 : 1, duration: this.cfg.exitSeconds });
  }

  finishExit() {
    const v = this.vehicle;
    const player = this.game.player;
    const p = player.position;
    p.x = this.to.x; p.z = this.to.z;
    p.y = this.game.world.heightAt(p.x, p.z);
    player.speed = 0;
    player.mode = 'onFoot';
    player.vehicle = null;
    this.state = 'foot';
    this.vehicle = null;
    this.game.events.emit('vehicle:exited', { id: v.id, type: v.type, passenger: this.passenger });
    this.game.events.emit('controls:mode', { mode: 'onFoot' });
    this.passenger = false;
  }

  /** Call before the physics step. */
  update(dt) {
    const v = this.vehicle;
    if (!v) return;
    const player = this.game.player;
    const p = player.position;
    const c = this.cfg;
    if (v.removed && this.state !== 'exiting') this.exitNow(true);
    if (this.state === 'entering') {
      this.t += dt;
      v.localToWorld([this.side * (v.T.size[1] / 2 + c.doorGap), 0, this.seat[2]], _door);
      v.localToWorld(this.seat, _seat);
      if (this.t < c.walkSeconds) {
        // Step up to the door, turning to face the vehicle.
        const k = this.t / c.walkSeconds;
        p.x = lerp(this.from.x, _door.x, k);
        p.z = lerp(this.from.z, _door.z, k);
        const face = Math.atan2(_seat.x - _door.x, _seat.z - _door.z);
        player.heading = wrapAngle(this.from.heading + wrapAngle(face - this.from.heading) * k);
        player.speed = 0;
        return;
      }
      if (!this.animStarted) {
        this.animStarted = true;
        this.from.y = p.y;
        this.from.heading = player.heading;
        this.game.events.emit('player:action', { name: 'enterVehicle', side: this.side, duration: c.enterSeconds });
      }
      // Climb in: door → seat, turning to face forward.
      const k = Math.min(1, (this.t - c.walkSeconds) / c.enterSeconds);
      const e = smooth(k);
      p.x = lerp(_door.x, _seat.x, e);
      p.z = lerp(_door.z, _seat.z, e);
      p.y = lerp(this.from.y, _seat.y - this.sitDrop, e);
      player.heading = wrapAngle(this.from.heading + wrapAngle(v.heading - this.from.heading) * e);
      if (k >= 1) {
        this.state = this.passenger ? 'riding' : 'driving';
        if (v.T.closed && player.model) player.model.visible = false;
        if (!this.passenger) v.input.handbrake = false;
      }
    } else if (this.state === 'exiting') {
      this.t += dt;
      const k = Math.min(1, this.t / c.exitSeconds);
      const e = smooth(k);
      p.x = lerp(this.from.x, this.to.x, e);
      p.z = lerp(this.from.z, this.to.z, e);
      p.y = lerp(this.from.y, this.game.world.heightAt(this.to.x, this.to.z), e);
      player.speed = 0;
      if (k >= 1) this.finishExit();
    } else if (this.exitQueued) {
      v.input.throttle = 0;
      v.input.handbrake = true;
      if (v.speed < c.exitMaxSpeed || v.state === 'wreck') this.exitNow();
    }
  }

  /** Call after the physics step: keep him on the seat. */
  afterPhysics() {
    const v = this.vehicle;
    if (!v || (this.state !== 'driving' && this.state !== 'riding')) return;
    const player = this.game.player;
    v.localToWorld(this.seat, _seat);
    player.position.x = _seat.x;
    player.position.z = _seat.z;
    player.position.y = _seat.y - this.sitDrop;
    player.heading = v.heading;
    player.speed = v.speed;
  }
}
