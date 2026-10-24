// Twin Saber: a double-ended plasma staff.
//  - two blades, one on each end of a short staff held at its middle, so
//    the back blade guards behind you (and bats shots coming from behind)
//  - RT throws it spinning flat like a buzzsaw (faster spin than the
//    saber); when it hits a wall it bites in and keeps grinding there for a
//    few seconds, killing anything that touches it
//  - RT again recalls it (it flies back through everything), like the saber
//  - RB / B tosses it like any weapon

import { registerWeapon } from '../weapons.js';
import { Saber } from './saber.js';
import { glowLine } from '../fx.js';
import { sfx } from '../audio.js';
import { rand } from '../util.js';

export class TwinSaber extends Saber {
  static id = 'twinsaber';
  static label = 'Twin Saber';
  static kind = 'melee';
  static ammo = Infinity;
  static weight = 0.9;
  static color = '#ff5ad1';
  static blades = [{ from: 9, to: 54 }, { from: -9, to: -54 }];
  static throwSpeed = 1250;
  static throwCenter = 0;           // spins about the middle of the staff

  hands() { return [this.along(-7), this.along(7)]; }

  constructor(game) {
    super(game);
    this.turnRate = 27;
    this.holdDist = 4;
    this.length = 54;
    this.grind = 0;
    this.wallN = { x: 0, y: -1 };
  }

  throwSaber(ctl) {
    super.throwSaber(ctl);
    if (this.pickup) this.pickup.spin *= 1.5;
    this.grind = 0;
  }

  recall(sp) {
    this.grind = 0;
    super.recall(sp);
  }

  thrownUpdate(p, dt) {
    const game = this.game;
    if (this.mode === 'stuck') {
      if (!this.thrower || !this.thrower.alive || (p.stuckSolid && p.stuckSolid.broken)) { this.grind = 0; this.toLoose(p); return false; }
      if (p.stuckSolid && p.stuckSolid.dynamic) { const w = p.stuckSolid.tx({ x: p.slx, y: p.sly }); p.x = w.x; p.y = w.y; }
      if (this.grind > 0) {
        // buzzing in the wall: still a killer
        this.grind -= dt;
        const pa = p.angle;
        p.angle += p.spin * dt * Math.min(1, this.grind * 1.5);
        this.on = 1; this.angle = p.angle; this.x = p.x; this.y = p.y;
        this.cut(p.x, p.y, pa, p.x, p.y, p.angle, this.thrower);
        if (Math.random() < 0.7) {
          const n = this.wallN, tx = -n.y, ty = n.x, s = rand(-1, 1) * 40;
          game.fx.spark(p.x - n.x * 10 + tx * s, p.y - n.y * 10 + ty * s, (n.x + tx * rand(-2, 2)) * 380, (n.y + ty * rand(-2, 2)) * 380 - 100, '#ffe9a8', 0.3, 2);
        }
        sfx.grind();
      } else {
        p.angle = Math.atan2(-this.wallN.y, -this.wallN.x);
        if (p.mode === 'thrown') p.mode = 'stuck';
      }
      return true;
    }
    const was = this.mode;
    const spin = p.spin;
    const r = super.thrownUpdate(p, dt);
    if (was === 'thrown' && this.mode === 'stuck') {
      // the saber logic stuck it point-first 28px out; sink the hub in and keep it spinning
      const a = p.angle;
      this.wallN = { x: -Math.cos(a), y: -Math.sin(a) };
      p.x += Math.cos(a) * 14; p.y += Math.sin(a) * 14;
      if (p.stuckSolid) { const l = p.stuckSolid.inv({ x: p.x, y: p.y }); p.slx = l.x; p.sly = l.y; }
      p.spin = spin || 30;
      p.mode = 'thrown';         // still live: can't be grabbed (or webbed) while it buzzes
      this.grind = 2.8;
    }
    return r;
  }

  drawHilt(ctx) {
    ctx.fillStyle = '#2a2d36';
    ctx.fillRect(-11, -3.5, 22, 7);
    ctx.fillStyle = '#b9c0cc';
    ctx.fillRect(-13, -4.5, 4, 9);
    ctx.fillRect(9, -4.5, 4, 9);
    ctx.fillStyle = '#ff5ad1';
    ctx.fillRect(-5, -2, 3, 4);
    ctx.fillRect(2, -2, 3, 4);
    ctx.fillStyle = '#5a6070';
    ctx.fillRect(-1, -4, 2, 8);
  }

  drawPickup(ctx, p) {
    if (p && (this.mode === 'thrown' || this.mode === 'recall' || (this.mode === 'stuck' && this.grind > 0))) {
      ctx.translate(this.length * 0.4, 0);
      const c = this.thrower ? this.thrower.color.main : this.color;
      // motion disc behind the spinning blades
      if (this.mode !== 'stuck' || this.grind > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha *= 0.18;
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(0, 0, 54, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      for (const b of this.constructor.blades) glowLine(ctx, b.from, 0, b.to, 0, c, 4.5);
      this.drawHilt(ctx);
      return;
    }
    ctx.translate(this.length * 0.4, 0);
    this.drawHilt(ctx);
    ctx.fillStyle = this.color;
    ctx.globalAlpha *= 0.5;
    ctx.fillRect(13, -1.5, 16, 3);
    ctx.fillRect(-29, -1.5, 16, 3);
  }
}

registerWeapon(TwinSaber);
