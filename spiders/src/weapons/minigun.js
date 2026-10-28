// Hornet Gatling: hold RT to spin up, then a hose of small bolts.
//  - ~0.4s spin-up before the first shot (the barrels keep spinning for a
//    moment after you let go, so short taps after a burst fire at once)
//  - each shot kicks: aim down to hover or fly, aim sideways to skate.
//    Pointing it away from the surface you cling to lifts you off it.
//  - 3s of continuous fire overheats it (1.2s vent); 110 rounds in all

import { Weapon, registerWeapon } from '../weapons.js';
import { Bullet } from '../projectiles.js';
import { sfx } from '../audio.js';
import { rand } from '../util.js';
import { safeMuzzle, unstick } from './kit.js';

const RATE = 0.048;      // s between shots
const KICK = 118;        // per shot (~2450/s, more than gravity)

export class Minigun extends Weapon {
  static id = 'minigun';
  static label = 'Hornet Gatling';
  static kind = 'gun';
  static ammo = 110;
  static weight = 0.41;   // guns are rarer than blades
  static color = '#ffd23f';
  static art = { hx: 28, hy: 40, s: 0.22 };   // wpn_minigun.png: grip pixel, units per pixel

  constructor(game) {
    super(game);
    this.length = 44;
    this.turnRate = 14;
    this.spin = 0;       // barrel speed 0..1
    this.rot = 0;        // barrel phase (drawing)
    this.heat = 0;       // 0..1
    this.vent = 0;       // overheated: s left
    this.shotT = 0;
  }

  onUnequip() { this.spin = 0; }

  update(dt, ctl) {
    super.update(dt, ctl);
    const game = this.game;
    const want = ctl.fire && this.vent <= 0;
    this.spin = want ? Math.min(1, this.spin + dt / 0.4) : Math.max(0, this.spin - dt / 0.7);
    this.rot += this.spin * dt * 40;
    if (this.spin > 0.05) sfx.spin(this.spin);
    if (this.vent > 0) {
      this.vent -= dt;
      this.heat = Math.max(0, this.heat - dt / 1.2);
      if (Math.random() < 0.4) { const m = this.along(this.length * 0.6); game.fx.smoke(m.x, m.y, { n: 1, size: 7, life: 0.6, speed: 40, color: 'rgba(220,220,230,0.35)' }); }
      return;
    }
    if (want && this.spin >= 1) {
      this.shotT -= dt;
      while (this.shotT <= 0 && this.ammo > 0) {
        this.shotT += RATE;
        this.fire();
        if (!this.owner) return;     // emptied
      }
      this.heat += dt / 3;
      if (this.heat >= 1) { this.vent = 1.2; sfx.vent(); game.fx.text(this.x, this.y - 30, 'OVERHEAT', '#ff7a4a', 20, 0.7); }
    } else {
      this.shotT = 0;
      this.heat = Math.max(0, this.heat - dt / 1.5);
    }
  }

  fire() {
    const game = this.game;
    const o = this.owner;
    const m = safeMuzzle(this);
    const a = this.angle + rand(-0.07, 0.07);
    const sp = 2100;
    game.addProjectile(new Bullet(game, {
      x: m.x, y: m.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, owner: o,
      color: '#ffd23f', core: '#fff8d8', width: 2, r: 2.5, life: 0.75, knock: 160, cause: 'gatling', trail: 0.02,
    }));
    if (Math.random() < 0.5) game.fx.glow(m.x, m.y, 20, '#ffd23f', 0.05);
    game.fx.spark(m.x, m.y, Math.cos(a) * 500 + rand(-80, 80), Math.sin(a) * 500 + rand(-80, 80), '#ffe9a0', 0.08, 1.5);
    // continuous kick; strong enough to fly on
    o.impulse(-this.dirX * KICK, -this.dirY * KICK, false);
    if (o.ground && -(this.dirX * o.ground.nx + this.dirY * o.ground.ny) > 0.45) unstick(o, 0.1);
    this.kick = 3;
    sfx.rattle();
    if (--this.ammo <= 0) this.empty();
  }

  // over the sprite: glints running round the spinning barrels, heat glow
  drawArtOver(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) {
      const ph = this.rot + i * (Math.PI * 2 / 3);
      if (Math.cos(ph) <= 0) continue;
      ctx.globalAlpha = 0.25 * Math.cos(ph);
      ctx.fillRect(18, Math.sin(ph) * 2.6 - 0.5, 19, 1);
    }
    if (this.heat > 0.05) {
      ctx.globalAlpha = this.heat * 0.7;
      ctx.fillStyle = `rgb(255,${120 - this.heat * 80 | 0},40)`;
      ctx.beginPath(); ctx.roundRect(17, -3.4, 21, 6.8, 2); ctx.fill();
    }
    ctx.restore();
  }

  drawShape(ctx) {
    // body + handle
    ctx.fillStyle = '#2b2f3a';
    ctx.beginPath(); ctx.roundRect(-8, -7, 20, 14, 4); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-4, 4, 7, 9, 2); ctx.fill();
    // heat tint on the housing
    if (this.heat > 0.05) { ctx.fillStyle = `rgba(255,${120 - this.heat * 80 | 0},40,${this.heat * 0.7})`; ctx.fillRect(-6, -5, 16, 10); }
    // three spinning barrels (drawn by their phase around the axis)
    for (let i = 0; i < 3; i++) {
      const ph = this.rot + i * (Math.PI * 2 / 3);
      const off = Math.sin(ph) * 4.5;
      const front = Math.cos(ph) > 0;
      ctx.fillStyle = front ? '#a9b2c4' : '#5a6172';
      ctx.fillRect(12, off - 1.5, 30, 3);
    }
    ctx.fillStyle = '#3d4352';
    ctx.fillRect(14, -7, 4, 14);
    ctx.fillRect(36, -6.5, 4, 13);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(-6, -2, 10, 3);
  }
}

registerWeapon(Minigun);
