// Pop Grenades: a pouch of 3 bouncy grenades.
//  - press RT to pull the pin (the fuse starts: 1.6s), release to throw
//    along the aim. Holding = cooking it for a shorter fuse in flight; hold
//    too long and it goes off in your hand.
//  - grenades bounce off terrain and bodies, and plasma blades bat them
//  - game.explode on the fuse: hurts everyone in the blast

import { Weapon, registerWeapon } from '../weapons.js';
import { sfx } from '../audio.js';
import { TAU, rand } from '../util.js';
import { safeMuzzle } from './kit.js';

const FUSE = 1.6;

export class GrenadeShell {
  constructor(game, { x, y, vx, vy, owner, fuse }) {
    this.game = game;
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.prevX = x; this.prevY = y;
    this.owner = owner;
    this.fuse = fuse;
    this.r = 7;
    this.rot = 0;
    this.reflectable = true;
    this.tickT = 0;
  }

  deflect(blade, dx, dy) {
    const sp = Math.max(900, Math.hypot(this.vx, this.vy));
    this.vx = dx * sp; this.vy = dy * sp;
    this.owner = blade.owner;
    sfx.deflect();
    this.game.fx.burst(this.x, this.y, { n: 8, speed: 300, color: '#b8ff8a', life: 0.2 });
  }

  update(dt) {
    const game = this.game;
    this.fuse -= dt;
    if (this.fuse <= 0) {
      game.explode(this.x, this.y, { radius: 125, owner: this.owner, force: 1000, damage: 3 });
      return false;
    }
    this.tickT -= dt;
    if (this.tickT <= 0) { this.tickT = this.fuse < 0.6 ? 0.1 : 0.3; sfx.tick(this.fuse < 0.6 ? 1 : 0); }
    this.prevX = this.x; this.prevY = this.y;
    const sub = 3, h = dt / sub;
    for (let i = 0; i < sub; i++) {
      this.vy += 1700 * h;
      this.x += this.vx * h; this.y += this.vy * h;
      const cs = game.world.collideCircle(this, { bounce: 0.5, friction: 0.12 });
      for (const c of cs) {
        if (c.solid.mat === 'lava') { this.fuse = Math.min(this.fuse, 0.01); }
        if (c.solid.mat === 'glass' && c.vn < -900) game.breakSolid(c.solid, c.x, c.y);
        if (c.vn < -180) sfx.clink();
      }
      if (cs.length) { this.vx *= 0.97; }
    }
    // bounce off bodies (no damage)
    for (const a of game.actors()) {
      const dx = this.x - a.x, dy = this.y - a.y, d = Math.hypot(dx, dy);
      if (d > a.r + this.r || d < 1e-3) continue;
      const nx = dx / d, ny = dy / d;
      const vn = (this.vx - (a.vx || 0)) * nx + (this.vy - (a.vy || 0)) * ny;
      if (vn < 0) { this.vx -= 1.5 * vn * nx; this.vy -= 1.5 * vn * ny; sfx.clink(); }
      this.x = a.x + nx * (a.r + this.r); this.y = a.y + ny * (a.r + this.r);
    }
    this.rot += this.vx * dt * 0.05;
    return this.y < game.board.killY + 200;
  }

  draw(ctx) {
    drawGrenade(ctx, this.x, this.y, this.rot, this.fuse);
  }
}

function drawGrenade(ctx, x, y, rot, fuse) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = '#3f7a2c';
  ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
  ctx.fillStyle = '#5fae43';
  ctx.beginPath(); ctx.arc(-2, -2, 4, 0, TAU); ctx.fill();
  ctx.fillStyle = '#9aa4b8';
  ctx.fillRect(-2.5, -10, 5, 4);
  ctx.restore();
  // blinking light, faster as the fuse runs down
  if (fuse < Infinity) {
    const on = Math.sin(fuse * (fuse < 0.6 ? 60 : 22)) > 0;
    if (on) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#ff4a3a';
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.3;
      ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }
}

export class Grenades extends Weapon {
  static id = 'grenade';
  static label = 'Pop Grenades';
  static kind = 'throwable';
  static ammo = 3;
  static weight = 1;
  static color = '#8fe36a';

  constructor(game) {
    super(game);
    this.length = 22;
    this.holdDist = 18;
    this.cook = -1;       // < 0: pin in
    this.tickT = 0;
  }

  onUnequip() {
    // dropped while cooking: the live grenade falls where you were
    if (this.cook >= 0 && this.owner) {
      const o = this.owner;
      this.game.addProjectile(new GrenadeShell(this.game, { x: this.x, y: this.y, vx: o.vx * 0.5, vy: o.vy * 0.5 - 100, owner: o, fuse: Math.max(0.05, FUSE - this.cook) }));
      this.ammo--;
    }
    this.cook = -1;
  }

  update(dt, ctl) {
    super.update(dt, ctl);
    if (this.cook < 0) {
      if (this.ammo <= 0) { this.empty(); return; }
      if (ctl.firePressed && this.cool <= 0 && this.ammo > 0) {
        this.cook = 0; this.tickT = 0;
        sfx.clink();
        this.game.fx.burst(this.x, this.y - 6, { n: 3, speed: 150, color: '#c8d0e0', life: 0.25, size: 1.5 });
      }
      return;
    }
    this.cook += dt;
    this.tickT -= dt;
    if (this.tickT <= 0) { this.tickT = 0.3; sfx.tick(0); }
    if (this.cook >= FUSE) {
      // cooked too long
      const o = this.owner;
      this.cook = -1;
      this.ammo--;
      this.game.explode(this.x, this.y, { radius: 125, owner: o, force: 1000, damage: 3 });
      if (this.owner && this.ammo <= 0) this.empty();
      return;
    }
    if (!ctl.fire) this.throwOne(ctl);
  }

  throwOne(ctl) {
    const game = this.game;
    const o = this.owner;
    const m = safeMuzzle(this, 14);
    const sp = 1050 * (0.55 + 0.45 * Math.max(0.4, ctl.aimMag || 1));
    game.addProjectile(new GrenadeShell(game, {
      x: m.x, y: m.y, vx: ctl.aimX * sp + o.vx * 0.4, vy: ctl.aimY * sp + o.vy * 0.4 - 120, owner: o,
      fuse: Math.max(0.05, FUSE - this.cook),
    }));
    this.cook = -1;
    this.cool = 0.3;
    this.kick = 8;
    sfx.throwIt();
    if (--this.ammo <= 0) this.empty();
  }

  drawShape(ctx) {
    // the grenade in hand (pin in: show the ring; cooking: blink)
    ctx.fillStyle = '#3f7a2c';
    ctx.beginPath(); ctx.arc(9, 0, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5fae43';
    ctx.beginPath(); ctx.arc(7, -2, 4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#9aa4b8';
    ctx.fillRect(6.5, -10, 5, 4);
    if (this.cook < 0) {
      ctx.strokeStyle = '#c8d0e0'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(14, -9, 3.5, 0, TAU); ctx.stroke();
    } else if (Math.sin(this.cook * 30) > 0) {
      ctx.fillStyle = '#ff4a3a';
      ctx.beginPath(); ctx.arc(9, 0, 3, 0, TAU); ctx.fill();
    }
    // spare grenades on the pouch strap
    for (let i = 1; i < Math.min(3, this.ammo); i++) {
      ctx.fillStyle = '#2f5c22';
      ctx.beginPath(); ctx.arc(-4 - i * 7, 5, 4, 0, TAU); ctx.fill();
    }
  }

  drawPickup(ctx) {
    // a little cluster of grenades
    ctx.translate(this.length * 0.4, 0);
    for (let i = 0; i < Math.max(1, this.ammo); i++) {
      const x = (i - 1) * 10, y = i === 1 ? -5 : 2;
      drawGrenade(ctx, x, y, 0, Infinity);
    }
  }
}

registerWeapon(Grenades);
