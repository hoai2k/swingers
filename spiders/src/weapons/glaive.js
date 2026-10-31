// Plasma Glaive: a long pole with a plasma head.
//  - huge reach but heavy: it turns slower than a saber, and only the head
//    is deadly (the pole is harmless)
//  - hold RT to prepare; release to lunge along the aim, the head thrusting out
//    further for a moment (a gap-closer, or a mid-air dash)
//  - RB hurls it like a javelin: it flies point-first in a shallow arc,
//    kills along its path and pins into walls, where anyone can pull it out
//    (no recall). Glass shatters and it flies on. B / Q simply discards it.
//  - like every plasma blade it clashes with blades and bats shots back

import { registerWeapon } from '../weapons.js';
import { Saber } from './saber.js';
import { glowLine } from '../fx.js';
import { sfx } from '../audio.js';
import { lerp } from '../util.js';

export class Glaive extends Saber {
  static id = 'glaive';
  static label = 'Plasma Glaive';
  static kind = 'melee';
  static ammo = Infinity;
  static weight = 1.6;
  static color = '#ffe066';
  static art = { hx: 66, hy: 31, s: 0.75 };   // the blade grows out of the golden fork
  static blades = [{ from: 74, to: 112 }];
  static canRecall = false;       // thrown as a javelin; anyone can collect it

  hands() { return [{ x: this.x, y: this.y }, this.along(30, 1)]; }

  constructor(game) {
    super(game);
    this.turnRate = 13;
    this.holdDist = 16;
    this.length = 112;
    this.ext = 0;
    this.lungeT = 0;
  }

  // the head ignites outward from its emitter; a lunge pushes it further
  segsAt(x, y, a) {
    const c = Math.cos(a), s = Math.sin(a);
    const b = this.constructor.blades[0];
    if (this.bladeHits <= 0) return [];
    const from = b.from + this.ext, to = b.from + (this.bladeEnd(b) - b.from) * this.on * (1 - 0.45 * (this.charging || 0)) + this.ext;
    return [{ x1: x + c * from, y1: y + s * from, x2: x + c * to, y2: y + s * to }];
  }

  update(dt, ctl) {
    const target = this.lungeT > 0 ? 34 : 0;
    this.ext = lerp(this.ext, target, Math.min(1, dt * (this.lungeT > 0 ? 30 : 10)));
    this.turnRate = this.lungeT > 0 ? 3 : 13;
    super.update(dt, ctl);   // shared RT charge/release; lunge() supplies the thrust
  }

  // RT release: charged lunge, retaining the glaive's extending head.
  lunge(ctl, charge) {
    const o = this.owner;
    if (!o || this.cool > 0 || this.bladeHits <= 0) return;
    this.angle = ctl.angle;
    const speed = 420 + 1150 * charge;
    o.impulse(ctl.aimX * speed, ctl.aimY * speed - 120 * charge, true);
    this.lungeT = 0.18 + 0.22 * charge;
    this.throwPower = 1 + 1.6 * charge;
    this.cool = 0.55;
    sfx.swoosh(2.2);
    const t = this.along(this.reach + this.ext);
    this.game.fx.burst(t.x, t.y, { n: 8, speed: 300, color: this.bladeColor, life: 0.25, dir: this.angle, spread: 0.8 });
  }

  // RB / B: javelin throw
  onThrow(ctl) {
    const o = this.owner;
    if (!o) return true;
    const p = o.dropWeapon(0, 0);
    if (!p) return true;
    const sp = 1750;
    p.vx = ctl.aimX * sp + o.vx * 0.3; p.vy = ctl.aimY * sp + o.vy * 0.3;
    p.angle = Math.atan2(p.vy, p.vx);
    p.spin = 0;
    p.x = o.x + ctl.aimX * (o.r + this.length * 0.4 - 10);
    p.y = o.y + ctl.aimY * (o.r + this.length * 0.4 - 10);
    this.mode = 'thrown'; p.mode = 'thrown';
    this.thrower = o; this.pickup = p;
    this.on = 1; this.ext = 0;
    sfx.throwIt();
    return true;
  }

  recall() {}

  thrownUpdate(p, dt) {
    const game = this.game;
    const L = this.length;
    if (this.mode === 'thrown') {
      const pa = p.angle;
      const pgx = p.x - Math.cos(pa) * L * 0.4, pgy = p.y - Math.sin(pa) * L * 0.4;
      const ptx = p.x + Math.cos(pa) * L * 0.6, pty = p.y + Math.sin(pa) * L * 0.6;
      p.vy += 420 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.angle = Math.atan2(p.vy, p.vx);
      const c = Math.cos(p.angle), s = Math.sin(p.angle);
      this.on = 1; this.angle = p.angle;
      this.x = p.x - c * L * 0.4; this.y = p.y - s * L * 0.4;
      this.cut(pgx, pgy, pa, this.x, this.y, p.angle, this.thrower);
      if (this.mode !== 'thrown') return false;     // clashed out of the air
      const tx = p.x + c * L * 0.6, ty = p.y + s * L * 0.6;
      const hit = game.world.segment(ptx, pty, tx, ty);
      if (hit) {
        if (hit.solid.mat === 'glass') game.breakSolid(hit.solid, hit.x, hit.y);
        else {
          this.mode = 'stuck'; p.mode = 'stuck'; p.stuck = true;
          p.x = hit.x - c * (L * 0.6 - 16); p.y = hit.y - s * (L * 0.6 - 16);
          p.vx = p.vy = 0;
          p.stuckSolid = hit.solid;
          const l = hit.solid.inv({ x: p.x, y: p.y }); p.slx = l.x; p.sly = l.y; p.sla = p.angle - hit.solid.a;
          game.fx.burst(hit.x, hit.y, { n: 18, speed: 420, color: '#ffe9a8', life: 0.3, dir: Math.atan2(hit.ny, hit.nx), spread: 2 });
          game.fx.shake(3);
          sfx.clash();
          if (this.thrower && this.thrower.recallable === this) this.thrower.recallable = null;
        }
      }
      if (p.y > game.board.killY + 100 || p.x < -300 || p.x > game.world.bounds.w + 300) this.toLoose(p);
      return true;
    }
    if (this.mode === 'stuck') {
      if (p.stuckSolid && p.stuckSolid.dynamic) { const w = p.stuckSolid.tx({ x: p.slx, y: p.sly }); p.x = w.x; p.y = w.y; p.angle = p.sla + p.stuckSolid.a; }
      if (p.stuckSolid && p.stuckSolid.broken) this.toLoose(p);
      return true;
    }
    return false;
  }

  drawPole(ctx) {
    ctx.fillStyle = '#3a3f4c';
    ctx.fillRect(-16, -2.5, 88, 5);
    ctx.fillStyle = '#c9a646';
    ctx.fillRect(-16, -3.5, 5, 7);
    ctx.fillRect(18, -3.5, 4, 7);
    ctx.fillRect(40, -3.5, 4, 7);
    // emitter head
    ctx.fillStyle = '#b9c0cc';
    ctx.beginPath(); ctx.moveTo(64, -6); ctx.lineTo(75, -3.5); ctx.lineTo(75, 3.5); ctx.lineTo(64, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e04848';
    ctx.fillRect(66, -1.5, 3, 3);
  }

  drawShape(ctx) { this.drawPole(ctx); }

  drawPickup(ctx, p) {
    if (p && this.mode === 'thrown') {
      const c = this.thrower ? this.thrower.color.main : this.color;
      const b = this.constructor.blades[0];
      glowLine(ctx, b.from, 0, this.bladeEnd(b), 0, c, 4.5);
      if (!this.drawArt(ctx)) this.drawPole(ctx);
      return;
    }
    if (!this.drawArt(ctx)) this.drawPole(ctx);      // pinned in a wall: the unlit pole
    ctx.fillStyle = this.color;
    ctx.globalAlpha *= 0.5;
    ctx.beginPath(); ctx.moveTo(76, -2); ctx.lineTo(76 + 24 * this.bladeRatio, 0); ctx.lineTo(76, 2); ctx.fill();
  }
}

registerWeapon(Glaive);
