// Police helicopter (5 stars). Used only by ./index.js. Numbers: data/police.json → helicopter.
// Built in code (dark body, white stripe, spinning rotors — no real police markings). It circles
// above Shoumik with a spotlight on him and a gunner who fires now and then. It can be shot
// down (game.targets, bleeds: false): it spins, falls and explodes where it lands.

import * as THREE from 'three';
import { markGlow } from '../../world/graphics/glow.js';

const DOWN = new THREE.Vector3(0, -1, 0);
const _dir = new THREE.Vector3();

function box(group, w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 }));
  m.position.set(x, y, z);
  group.add(m);
  return m;
}

function buildModel(H) {
  const g = new THREE.Group();
  g.name = 'police-helicopter';
  box(g, 1.8, 1.6, 3.6, H.bodyColor, 0, 0, 0.4);                         // cabin
  box(g, 1.82, 0.28, 3.4, H.stripeColor, 0, -0.1, 0.4);                  // stripe
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 1.0), new THREE.MeshStandardMaterial({ color: '#1d3346', roughness: 0.1, metalness: 0.6 }));
  glass.position.set(0, 0.2, 2.3);
  g.add(glass);
  box(g, 0.45, 0.45, 4.6, H.bodyColor, 0, 0.3, -3.6);                     // tail boom
  box(g, 0.12, 1.2, 0.8, H.bodyColor, 0, 0.8, -5.8);                      // fin
  for (const sx of [-0.8, 0.8]) box(g, 0.1, 0.1, 3.2, '#222', sx, -1.05, 0.4); // skids
  const rotor = new THREE.Group();
  rotor.position.set(0, 1.05, 0.4);
  box(rotor, 11, 0.06, 0.35, '#1a1a1a');
  box(rotor, 0.35, 0.06, 11, '#1a1a1a');
  g.add(rotor);
  const tail = new THREE.Group();
  tail.position.set(0.3, 0.8, -5.8);
  box(tail, 0.05, 1.6, 0.18, '#1a1a1a');
  g.add(tail);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), markGlow(new THREE.MeshBasicMaterial({ color: '#ff3040' }), 'glow'));
  lamp.position.set(0, -0.82, 2.0);
  g.add(lamp);
  return { group: g, rotor, tail, lamp };
}

export class Helicopter {
  /** @param {object} ctx { game, cfg (police.json), rng, fx, hooks: { shootFrom(x, y, z, acc, dmg), killed(by), down(x, z) } } */
  constructor(ctx, x, z) {
    const { game, cfg } = ctx;
    const H = cfg.helicopter;
    this.ctx = ctx;
    this.H = H;
    const m = buildModel(H);
    this.model = m;
    this.x = x; this.z = z;
    this.y = game.world.heightAt(x, z) + H.height + 10;
    this.heading = 0;
    this.angle = ctx.rng.range(0, Math.PI * 2);
    this.health = H.health;
    this.state = 'fly';     // fly | falling | gone | leave
    this.fireIn = H.fireEvery;
    this.vy = 0;
    this.spin = 0;
    this.timer = 0;
    game.scene.add(m.group);
    // Spotlight: a soft cone from the helicopter to the ground and a bright circle under it.
    const coneMat = new THREE.MeshBasicMaterial({ color: H.spotlightColor, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.cone = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 4, 1, 16, 1, true).translate(0, -0.5, 0), coneMat);
    this.cone.userData.noCastShadow = true;
    this.spot = new THREE.Mesh(new THREE.CircleGeometry(4, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: H.spotlightColor, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.spot.userData.noCastShadow = true;
    game.scene.add(this.cone, this.spot);
    this.target = game.targets.add({
      kind: 'helicopter', police: true, bleeds: false, x, y: this.y - 1.2, z, r: 2.2, h: 2.6, owner: this, priority: -0.4,
      onHit: (info) => this.onHit(info),
    });
  }

  get alive() { return this.state === 'fly' || this.state === 'leave'; }

  onHit(info) {
    if (!this.alive) return null;
    this.health -= (info.damage || 0) * (info.kind === 'bullet' ? 1 : 0.5);
    if (this.health > 0) return 'hit';
    this.state = 'falling';
    this.target.dead = true;
    this.ctx.hooks.killed(info.by);
    return 'killed';
  }

  leave() { if (this.state === 'fly') { this.state = 'leave'; this.timer = 0; } }

  update(dt) {
    const { game, rng } = this.ctx;
    const H = this.H;
    const p = game.player.position;
    const m = this.model;
    m.rotor.rotation.y += dt * 28;
    m.tail.rotation.x += dt * 40;
    this.timer += dt;
    const ground = game.world.heightAt(this.x, this.z);

    if (this.state === 'falling') {
      this.vy -= 9 * dt;
      this.y += this.vy * dt;
      this.spin += dt * 4;
      this.heading += this.spin * dt;
      if (Math.random() < dt * 20) this.ctx.fx.fire(this.x, this.y, this.z, 1.4);
      if (this.y <= ground + 1) {
        this.state = 'gone';
        this.ctx.hooks.down(this.x, this.z);
      }
    } else if (this.state === 'leave') {
      this.y += dt * 6;
      this.x += Math.sin(this.heading) * H.speed * dt;
      this.z += Math.cos(this.heading) * H.speed * dt;
      if (this.timer > 10) this.state = 'gone';
    } else {
      // Circle around him at orbitRadius, at height above the ground.
      this.angle += dt * (H.speed / Math.max(8, H.orbitRadius)) * 0.35;
      const gx = p.x + Math.sin(this.angle) * H.orbitRadius, gz = p.z + Math.cos(this.angle) * H.orbitRadius;
      const dx = gx - this.x, dz = gz - this.z;
      const d = Math.hypot(dx, dz);
      const step = Math.min(d, H.speed * dt);
      if (d > 0.01) { this.x += (dx / d) * step; this.z += (dz / d) * step; }
      const wantY = Math.max(game.world.heightAt(p.x, p.z), ground) + H.height;
      this.y += (wantY - this.y) * Math.min(1, dt * 0.8);
      this.heading += wrap(Math.atan2(p.x - this.x, p.z - this.z) - this.heading) * Math.min(1, dt * 2);
      this.fireIn -= dt;
      if (this.fireIn <= 0 && !game.player.dead) {
        this.fireIn = H.fireEvery * rng.range(0.8, 1.3);
        this.ctx.hooks.shootFrom(this.x, this.y - 1.1, this.z, H.accuracy, H.damage);
      }
    }

    m.group.position.set(this.x, this.y, this.z);
    m.group.rotation.set(this.state === 'fly' ? 0.12 : 0, this.heading, 0);
    m.lamp.visible = Math.floor(this.timer * 2) % 2 === 0;
    const spotOn = this.state === 'fly';
    this.cone.visible = this.spot.visible = spotOn;
    if (spotOn) {
      const gy = game.world.heightAt(p.x, p.z);
      const h = this.y - 1 - gy;
      this.cone.position.set(this.x, this.y - 1, this.z);
      // Point the cone (its axis is local -y) from the helicopter down to Shoumik.
      const dx = p.x - this.x, dz = p.z - this.z;
      _dir.set(dx, -h, dz);
      const len = _dir.length();
      this.cone.quaternion.setFromUnitVectors(DOWN, _dir.divideScalar(len));
      this.cone.scale.set(1, len, 1);
      this.spot.position.set(p.x, gy + 0.06, p.z);
    }
    this.target.x = this.x; this.target.y = this.y - 1.3; this.target.z = this.z;
  }

  dispose() {
    const g = this.ctx.game;
    g.targets.remove(this.target);
    for (const o of [this.model.group, this.cone, this.spot]) {
      o.traverse((c) => { if (c.isMesh) { c.geometry.dispose(); c.material.dispose(); } });
      o.removeFromParent();
    }
  }
}

function wrap(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
