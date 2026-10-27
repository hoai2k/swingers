// Sizzle Ray: a continuous beam while RT is held.
//  - kills whatever the beam touches, cuts webs, shatters glass, and
//    leaves glowing scorch marks where it hits terrain
//  - a plasma blade blocks it (sparks, but the blade holds)
//  - drains an energy cell (ammo is 0..1, ~2.6s of beam) and pushes the
//    shooter gently backwards while firing

import { Weapon, registerWeapon } from '../weapons.js';
import { sfx } from '../audio.js';
import { glowLine } from '../fx.js';
import { rand } from '../util.js';
import { safeMuzzle, traceBeam, cutWebs } from './kit.js';

const RANGE = 1500;
const DRAIN = 1 / 2.6;

export class DeathRay extends Weapon {
  static id = 'deathray';
  static label = 'Sizzle Ray';
  static kind = 'gun';
  static ammo = 1;          // energy, 0..1
  static weight = 0.36;   // guns are rarer than blades
  static color = '#ff3df0';

  constructor(game) {
    super(game);
    this.length = 36;
    this.turnRate = 7;       // sweeping the beam is slow and deliberate
    this.beam = null;        // {sx, sy, x, y, wall, blade}
    this.warm = 0;
    this.scorchT = 0;
  }

  onUnequip() { this.beam = null; this.warm = 0; }

  update(dt, ctl) {
    super.update(dt, ctl);
    const game = this.game;
    if (!(ctl.fire && this.ammo > 0)) { this.beam = null; this.warm = Math.max(0, this.warm - dt * 4); return; }
    this.warm = Math.min(1, this.warm + dt * 8);
    const o = this.owner;
    const m = safeMuzzle(this);
    const b = traceBeam(game, m.x, m.y, this.dirX, this.dirY, RANGE * this.warm, { owner: o, pierceGlass: true });
    b.sx = m.x; b.sy = m.y;
    this.beam = b;
    for (const h of game.actorsOnSegment(m.x, m.y, b.x, b.y, 3, o)) {
      const hx = m.x + (b.x - m.x) * h.t, hy = m.y + (b.y - m.y) * h.t;
      if (game.damage(h.actor, { amount: 2, from: o, cause: 'ray', x: hx, y: hy, ix: this.dirX * 500, iy: this.dirY * 500 - 80 })) {
        game.fx.burst(hx, hy, { n: 14, speed: 500, color: '#ff8af6', life: 0.35 });
      }
    }
    cutWebs(game, m.x, m.y, b.x, b.y, o);
    // the end of the beam sizzles
    if (b.wall || b.blade) {
      const nx = b.wall ? b.wall.nx : -this.dirX, ny = b.wall ? b.wall.ny : -this.dirY;
      game.fx.spark(b.x, b.y, (nx + rand(-0.8, 0.8)) * rand(200, 500), (ny + rand(-0.8, 0.8)) * rand(200, 500), b.blade ? '#fff6c8' : '#ffb0f8', 0.3, 2);
      if (Math.random() < 0.25) game.fx.smoke(b.x, b.y, { n: 1, size: 8, life: 0.6, speed: 40, color: 'rgba(90,40,90,0.4)' });
      this.scorchT -= dt;
      if (b.wall && this.scorchT <= 0) {
        this.scorchT = 0.09;
        game.fx.decals.push({ x: b.x - nx * 3 + rand(-3, 3), y: b.y - ny * 3 + rand(-3, 3), r: rand(3, 6), color: '#2a1022' });
        if (game.fx.decals.length > 400) game.fx.decals.shift();
      }
      if (b.blade) sfx.clash();
    }
    // a slight shove on the shooter
    o.impulse(-this.dirX * 900 * dt, -this.dirY * 900 * dt, false);
    this.kick = 2 + Math.random() * 1.5;
    sfx.beam();
    this.ammo = Math.max(0, this.ammo - DRAIN * dt);
    if (this.ammo <= 0) { this.beam = null; sfx.fizzle(); this.empty(); }
  }

  draw(ctx) {
    const b = this.beam;
    if (b) {
      const w = 5 + Math.sin(this.time * 60) * 1.2 + Math.random();
      glowLine(ctx, b.sx, b.sy, b.x, b.y, '#ff3df0', w * this.warm, '#ffe6fd');
      // heat shimmer pulses travelling along the beam
      const len = Math.hypot(b.x - b.sx, b.y - b.sy) || 1;
      const ux = (b.x - b.sx) / len, uy = (b.y - b.sy) / len;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#ff9df7';
      for (let d = (this.time * 900) % 70; d < len; d += 70) {
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.arc(b.sx + ux * d, b.sy + uy * d, w * 0.9, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.arc(b.x, b.y, w * 2 + Math.random() * 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    super.draw(ctx);
  }

  drawShape(ctx) {
    // grip + body
    ctx.fillStyle = '#2b2f3a';
    ctx.beginPath(); ctx.roundRect(-6, -5, 20, 10, 3); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-3, 3, 7, 9, 2); ctx.fill();
    // energy cell shows the charge left
    ctx.fillStyle = '#4a1a48';
    ctx.fillRect(-4, -9, 14, 4);
    ctx.fillStyle = '#ff3df0';
    ctx.fillRect(-4, -9, 14 * Math.max(0, this.ammo), 4);
    // ring fins
    ctx.fillStyle = '#8a93a6';
    for (let i = 0; i < 3; i++) ctx.fillRect(14 + i * 6, -7 + i, 3, 14 - i * 2);
    // emitter dish
    ctx.fillStyle = '#c8cfe0';
    ctx.beginPath(); ctx.moveTo(30, -9); ctx.quadraticCurveTo(26, 0, 30, 9); ctx.lineTo(33, 9); ctx.quadraticCurveTo(29, 0, 33, -9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff3df0';
    ctx.beginPath(); ctx.arc(32, 0, 2.5 + this.warm * 1.5, 0, Math.PI * 2); ctx.fill();
  }
}

registerWeapon(DeathRay);
