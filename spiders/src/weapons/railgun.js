// Rail Lance: hold RT to charge, release to fire.
//  - while charging a thin sight line shows exactly where it will go and the
//    aim gets heavy; letting go before it's full fizzles (no shell used)
//  - the shot is instant and pierces every body on the line; terrain stops
//    it, glass shatters and it carries on
//  - a plasma blade in the way catches the beam and sends it where the
//    blade's owner is aiming
//  - heavy recoil; 3 shots

import { Weapon, registerWeapon } from '../weapons.js';
import { sfx } from '../audio.js';
import { glowLine } from '../fx.js';
import { rand, clamp } from '../util.js';
import { safeMuzzle, traceBeam, cutWebs, Flicker } from './kit.js';

const RANGE = 2600;
const CHARGE = 0.65;   // s to full

export class Railgun extends Weapon {
  static id = 'railgun';
  static label = 'Rail Lance';
  static kind = 'gun';
  static ammo = 3;
  static weight = 0.36;   // guns are rarer than blades
  static color = '#5affd2';
  static art = { hx: 60, hy: 40, s: 0.27 };   // wpn_railgun.png: grip pixel, units per pixel

  constructor(game) {
    super(game);
    this.length = 46;
    this.charge = 0;
    this.sight = null;
  }

  onUnequip() { this.charge = 0; this.sight = null; }

  update(dt, ctl) {
    this.turnRate = this.charge > 0 ? 9 : 22;
    super.update(dt, ctl);
    if (ctl.fire && this.cool <= 0) {
      const was = this.charge;
      this.charge = Math.min(1, this.charge + dt / CHARGE);
      sfx.charge(this.charge);
      if (was < 1 && this.charge >= 1) { sfx.tick(1); this.game.fx.ring(this.muzzle().x, this.muzzle().y, 18, '#5affd2', 0.2, 3); }
      // energy sucked into the muzzle
      if (Math.random() < 0.5) {
        const m = this.muzzle(), a = rand(0, Math.PI * 2), d = rand(18, 34);
        this.game.fx.add({ kind: 'spark', x: m.x + Math.cos(a) * d, y: m.y + Math.sin(a) * d, vx: -Math.cos(a) * d * 7, vy: -Math.sin(a) * d * 7, color: '#8fffe0', life: 0.14, size: 1.6, drag: 0, g: 0 });
      }
      const m = safeMuzzle(this);
      this.sight = traceBeam(this.game, m.x, m.y, this.dirX, this.dirY, RANGE, { owner: this.owner, pierceGlass: false });
      this.sight.sx = m.x; this.sight.sy = m.y;
    } else if (this.charge > 0) {
      if (this.charge >= 1) this.fire();
      else { sfx.fizzle(); this.game.fx.burst(this.muzzle().x, this.muzzle().y, { n: 5, speed: 120, color: '#5affd2', life: 0.2, size: 1.5 }); }
      this.charge = 0;
      this.sight = null;
    }
  }

  fire() {
    const game = this.game;
    const m = safeMuzzle(this);
    this.shoot(m.x, m.y, this.dirX, this.dirY, this.owner, 0);
    game.fx.glow(m.x, m.y, 70, '#5affd2', 0.15);
    game.fx.shake(9);
    game.hitStop(0.03);
    this.recoil(900, 14);
    this.cool = 0.5;
    sfx.rail();
    if (--this.ammo <= 0) this.empty();
  }

  // one beam leg; a blade can send it back once
  shoot(x, y, dx, dy, owner, depth) {
    const game = this.game;
    const b = traceBeam(game, x, y, dx, dy, RANGE, { owner, pierceGlass: true });
    for (const h of game.actorsOnSegment(x, y, b.x, b.y, 4, owner)) {
      const a = h.actor;
      const hx = x + (b.x - x) * h.t, hy = y + (b.y - y) * h.t;
      if (game.damage(a, { amount: 5, from: owner, cause: 'rail', x: hx, y: hy, ix: dx * 900, iy: dy * 900 - 100 })) {
        game.fx.burst(hx, hy, { n: 16, speed: 700, color: '#aaffe8', life: 0.35, dir: Math.atan2(dy, dx), spread: 1.2 });
      }
    }
    cutWebs(game, x, y, b.x, b.y, null);
    const color = owner && owner.color ? owner.color.main : '#5affd2';
    const x2 = b.x, y2 = b.y;
    game.addProjectile(new Flicker(0.4, (ctx, k) => {
      glowLine(ctx, x, y, x2, y2, '#5affd2', 7 * k + 1, '#ffffff');
      ctx.save(); ctx.globalAlpha = k * 0.6; ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.setLineDash([3, 9]); ctx.lineDashOffset = -k * 60;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.restore();
    }));
    // rings along the path
    const len = Math.hypot(x2 - x, y2 - y);
    for (let d = 40; d < len; d += 90) game.fx.ring(x + dx * d, y + dy * d, 12, '#8fffe0', 0.3, 2);
    if (b.wall) {
      game.fx.burst(b.x, b.y, { n: 18, speed: 500, color: '#aaffe8', life: 0.35, dir: Math.atan2(b.wall.ny, b.wall.nx), spread: 2.4 });
      game.fx.glow(b.x, b.y, 50, '#5affd2', 0.2);
    }
    if (b.blade && depth === 0) {
      const o = b.blade.owner;
      game.fx.burst(b.x, b.y, { n: 20, speed: 600, color: '#fff6c8', life: 0.3 });
      sfx.deflect();
      let ndx = o && o.aim ? o.aim.x : -dx, ndy = o && o.aim ? o.aim.y : -dy;
      const mm = Math.hypot(ndx, ndy) || 1;
      this.shoot(b.x + ndx / mm * 4, b.y + ndy / mm * 4, ndx / mm, ndy / mm, o, 1);
    }
  }

  draw(ctx) {
    if (this.charge > 0 && this.sight) {
      const s = this.sight;
      const k = this.charge;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.15 + 0.5 * k * (k >= 1 ? 0.7 + 0.3 * Math.sin(this.time * 40) : 1);
      ctx.strokeStyle = '#5affd2';
      ctx.lineWidth = 1 + k * 1.5;
      ctx.setLineDash(k >= 1 ? [] : [10, 8]);
      ctx.beginPath(); ctx.moveTo(s.sx, s.sy); ctx.lineTo(s.x, s.y); ctx.stroke();
      ctx.restore();
    }
    super.draw(ctx);
  }

  // over the sprite: the coils glow up as it charges
  drawArtOver(ctx) {
    const k = clamp(this.charge, 0, 1);
    if (k > 0) glowLine(ctx, 20, -2.2, 40, -2.2, '#5affd2', 1 + k * 2);
  }

  drawShape(ctx) {
    const k = clamp(this.charge, 0, 1);
    // stock and body
    ctx.fillStyle = '#2b2f3a';
    ctx.beginPath(); ctx.roundRect(-8, -5, 22, 10, 3); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-2, 3, 7, 9, 2); ctx.fill();
    // twin rails
    ctx.fillStyle = '#9aa4b8';
    ctx.fillRect(12, -6, 34, 3);
    ctx.fillRect(12, 2, 34, 3);
    // coils glow as it charges
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = k * 4 > i ? '#5affd2' : '#2c6b5c';
      ctx.fillRect(16 + i * 7, -3, 4, 5);
    }
    if (k > 0) glowLine(ctx, 14, -0.5, 44, -0.5, '#5affd2', 1 + k * 2);
    ctx.fillStyle = '#5affd2';
    ctx.fillRect(-6, -2, 6, 3);
  }
}

registerWeapon(Railgun);
