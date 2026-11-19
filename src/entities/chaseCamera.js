// Vice-City style chase camera: behind and slightly above the target. Drag (touch) or
// mouse moves it around; when you stop dragging it swings back behind the target. It
// pulls in instead of going through buildings. Numbers: data/camera.json.
//
// The target is any object with { position:{x,y,z}, heading, speed }. On foot that is the
// player; the vehicles feature (Session 3) will call setTarget(vehicle, 'driving') and add
// a "driving" block to data/camera.json.

import { COLLIDE } from '../world/collision.js';

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class ChaseCamera {
  constructor(camera, cameraCfg, world) {
    this.camera = camera;
    this.cfg = cameraCfg;
    this.world = world;
    this.target = null;
    this.mode = cameraCfg.onFoot;
    this.yaw = 0;
    this.pitch = this.mode.pitch;
    this.distance = this.mode.distance;
    this.sinceLook = 99;
    this.focusY = 0;
    this.scale = 1; // bigger vehicles push the camera further back (data/vehicles.json → camera)
    this.zoom = 1;      // < 1 pulls the camera closer (aiming: data/camera.json → aim)
    this.shoulder = 0;  // metres the view shifts to the right (over-the-shoulder aiming)
    this.zoomTarget = 1;
    this.shoulderTarget = 0;
  }

  /** Over-the-shoulder aiming view on/off (the weapons feature calls this). */
  setAim(on) {
    const a = this.cfg.aim || { zoom: 0.62, shoulder: 0.55 };
    this.zoomTarget = on ? a.zoom : 1;
    this.shoulderTarget = on ? a.shoulder : 0;
  }

  setTarget(target, modeName = 'onFoot', snap = false, scale = 1) {
    this.target = target;
    this.scale = scale;
    this.mode = this.cfg[modeName] || this.cfg.onFoot;
    if (snap) {
      this.yaw = target.heading;
      this.pitch = this.mode.pitch;
      this.distance = this.mode.distance * scale;
      this.focusY = target.position.y;
    }
  }

  /** Rotate the view. dx > 0 turns right, dy > 0 looks down. Radians. */
  addLook(dx, dy) {
    if (dx === 0 && dy === 0) return;
    this.yaw = wrapAngle(this.yaw - dx);
    this.pitch = Math.min(this.mode.pitchMax, Math.max(this.mode.pitchMin, this.pitch + dy));
    this.sinceLook = 0;
  }

  /** Unit vectors on the ground: where "forward" and "right" are for the player's stick. */
  forward() { return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) }; }
  right() { return { x: -Math.cos(this.yaw), z: Math.sin(this.yaw) }; }

  update(dt) {
    const t = this.target;
    if (!t) return;
    const m = this.mode;
    this.sinceLook += dt;

    // Swing back behind the target while it moves (not when it runs towards the camera).
    if (this.sinceLook > m.followDelay && t.speed > 0.5) {
      const diff = wrapAngle(t.heading - this.yaw);
      if (Math.abs(diff) < 2.5) this.yaw = wrapAngle(this.yaw + diff * Math.min(1, m.followSpeed * dt));
      this.pitch += (m.pitch - this.pitch) * Math.min(1, m.followSpeed * 0.5 * dt);
    }

    // Smooth the height so kerbs and jumps don't jolt the view.
    this.focusY += (t.position.y - this.focusY) * Math.min(1, m.positionSmooth * dt);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, 8 * dt);
    this.shoulder += (this.shoulderTarget - this.shoulder) * Math.min(1, 8 * dt);
    // Right of the view is (-fz, fx) rotated: right() = (-cos yaw, sin yaw).
    const tx = t.position.x - Math.cos(this.yaw) * this.shoulder, tz = t.position.z + Math.sin(this.yaw) * this.shoulder;
    const full = m.distance * this.scale * this.zoom;
    const ty = this.focusY + m.targetHeight * this.scale;

    // Pull the camera in if a building is between it and the target.
    const flat = Math.cos(this.pitch) * full;
    const free = this.world.collision.raycast(tx, tz, -fx, -fz, flat + m.wallPadding, COLLIDE.CAMERA) - m.wallPadding;
    const wanted = Math.max(m.minDistance, Math.min(full, (free / Math.max(0.001, flat)) * full));
    if (wanted < this.distance) this.distance = wanted;                          // in: at once
    else this.distance += (wanted - this.distance) * Math.min(1, 4 * dt);        // out: gently

    const d = this.distance;
    const cx = tx - fx * Math.cos(this.pitch) * d;
    const cz = tz - fz * Math.cos(this.pitch) * d;
    const cy = Math.max(this.world.heightAt(cx, cz) + 0.35, ty + Math.sin(this.pitch) * d);
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(tx, ty, tz);
  }
}
