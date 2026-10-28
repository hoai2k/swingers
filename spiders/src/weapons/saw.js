// Ripper: fires spinning saw discs.
//  - discs fly straight and ricochet off terrain 4 times, then bite into
//    the wall and keep spinning there for a few seconds as a hazard
//  - they cut through every body they touch (they don't stop) and snap
//    webs; after their first bounce they can cut the shooter too
//  - glass shatters; plasma blades bat discs back; 5 discs

import { Weapon, registerWeapon } from '../weapons.js';
import { sfx } from '../audio.js';
import { drawSprite, preloadSprites } from '../sprites.js';
import { TAU, rand } from '../util.js';
import { safeMuzzle, cutWebs } from './kit.js';

preloadSprites(['proj_saw.png']);

export class SawDisc {
  constructor(game, { x, y, vx, vy, owner }) {
    this.game = game;
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.prevX = x; this.prevY = y;
    this.owner = owner;
    this.r = 10;
    this.bounces = 4;
    this.bounced = false;
    this.rot = 0;
    this.spinRate = 40;
    this.state = 'fly';     // fly | stuck
    this.t = 0;
    this.age = 0;
    this.hitSet = new Set();
    this.reflectable = true;
    this.solid = null; this.lx = 0; this.ly = 0; this.na = 0;
  }

  deflect(blade, dx, dy) {
    if (this.state !== 'fly') return;
    const sp = Math.hypot(this.vx, this.vy) * 1.05;
    this.vx = dx * sp; this.vy = dy * sp;
    this.owner = blade.owner;
    this.bounced = false;
    this.hitSet.clear();
    sfx.sawHit();
    this.game.fx.burst(this.x, this.y, { n: 10, speed: 400, color: '#fff6c8', life: 0.25 });
  }

  // kill whatever overlaps segment a->b (shooter only after a bounce)
  slice(ax, ay, bx, by) {
    const game = this.game;
    const hits = game.actorsOnSegment(ax, ay, bx, by, this.r - 2, this.bounced ? null : this.owner);
    for (const h of hits) {
      const a = h.actor;
      if (this.hitSet.has(a)) continue;
      this.hitSet.add(a);
      const self = a === this.owner;
      const sp = Math.hypot(this.vx, this.vy) || 1;
      const hx = ax + (bx - ax) * h.t, hy = ay + (by - ay) * h.t;
      const ix = this.state === 'fly' ? this.vx / sp * 450 : (a.x - this.x) * 12, iy = this.state === 'fly' ? this.vy / sp * 450 : (a.y - this.y) * 12;
      if (game.damage(a, { amount: 3, from: this.owner, cause: 'saw', x: hx, y: hy, ix, iy, selfOk: self })) {
        game.fx.burst(hx, hy, { n: 14, speed: 500, color: '#e8eef8', life: 0.3 });
        sfx.sawHit();
      }
    }
  }

  update(dt) {
    const game = this.game;
    this.age += dt;
    this.prevX = this.x; this.prevY = this.y;
    if (this.state === 'stuck') {
      this.reflectable = false;
      this.t += dt;
      if (this.solid) {
        if (this.solid.broken) return false;
        if (this.solid.dynamic) { const w = this.solid.tx({ x: this.lx, y: this.ly }); this.x = w.x; this.y = w.y; }
      }
      const k = Math.max(0, 1 - this.t / 3.5);
      this.rot += this.spinRate * k * dt;
      if (k > 0.25) {
        this.bounced = true;
        this.slice(this.x, this.y, this.x + 0.01, this.y);
        if (this.age % 0.3 < dt) this.hitSet.clear();
        if (Math.random() < k) game.fx.spark(this.x - Math.cos(this.na) * 6, this.y - Math.sin(this.na) * 6, (Math.cos(this.na) + rand(-1, 1)) * 300, (Math.sin(this.na) + rand(-1, 1)) * 300, '#ffe9a8', 0.25, 1.6);
        sfx.grind();
      }
      return this.t < 5;
    }
    this.rot += this.spinRate * dt;
    if (this.age > 3) return false;
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    const wall = game.world.segment(this.x, this.y, nx, ny);
    const ex = wall ? wall.x : nx, ey = wall ? wall.y : ny;
    this.slice(this.x, this.y, ex, ey);
    cutWebs(game, this.x, this.y, ex, ey, null);
    if (wall) {
      if (wall.solid.mat === 'glass') { game.breakSolid(wall.solid, wall.x, wall.y); this.x = nx; this.y = ny; return true; }
      game.fx.burst(wall.x, wall.y, { n: 8, speed: 350, color: '#ffe9a8', life: 0.25, dir: Math.atan2(wall.ny, wall.nx), spread: 2.2, size: 1.8 });
      if (this.bounces > 0 && wall.solid.mat !== 'lava') {
        this.bounces--;
        const vn = this.vx * wall.nx + this.vy * wall.ny;
        this.vx -= 2 * vn * wall.nx; this.vy -= 2 * vn * wall.ny;
        this.x = wall.x + wall.nx * 3; this.y = wall.y + wall.ny * 3;
        this.bounced = true;
        this.hitSet.clear();
        sfx.sawHit();
        return true;
      }
      if (wall.solid.mat === 'lava') return false;
      // bite in
      this.state = 'stuck'; this.t = 0;
      this.x = wall.x - wall.nx * 3; this.y = wall.y - wall.ny * 3;
      this.na = Math.atan2(wall.ny, wall.nx);
      this.solid = wall.solid;
      const l = wall.solid.inv({ x: this.x, y: this.y }); this.lx = l.x; this.ly = l.y;
      this.hitSet.clear();
      sfx.clash();
      return true;
    }
    this.x = nx; this.y = ny;
    if (Math.random() < 0.3) sfx.saw();
    return !(this.x < -200 || this.x > game.world.bounds.w + 200 || this.y < -600 || this.y > game.world.bounds.h + 300);
  }

  draw(ctx) {
    const fade = this.state === 'stuck' ? Math.min(1, (5 - this.t) / 0.6) : 1;
    ctx.save();
    ctx.globalAlpha = fade;
    if (this.state === 'fly') {
      // motion blur ring
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#9fb0c8';
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r + 2, 0, TAU); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    if (!drawSprite(ctx, 'proj_saw.png', this.x, this.y, this.r * 2.3, { rot: this.rot })) drawDisc(ctx, this.x, this.y, this.r, this.rot);
    ctx.restore();
  }
}

function drawDisc(ctx, x, y, r, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = '#d0d8e8';
  ctx.beginPath();
  const teeth = 8;
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * TAU, a1 = ((i + 0.6) / teeth) * TAU;
    ctx.lineTo(Math.cos(a0) * r * 0.78, Math.sin(a0) * r * 0.78);
    ctx.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
  }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#8a93a6';
  ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#2b2f3a';
  ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, TAU); ctx.fill();
  ctx.restore();
}

export class SawLauncher extends Weapon {
  static id = 'saw';
  static label = 'Ripper';
  static kind = 'gun';
  static ammo = 5;
  static weight = 0.45;   // guns are rarer than blades
  static color = '#c8d4e8';
  static art = { hx: 35, hy: 57, s: 0.25 };   // wpn_saw.png: grip pixel, units per pixel

  constructor(game) {
    super(game);
    this.length = 34;
    this.rot = 0;
  }

  update(dt, ctl) {
    super.update(dt, ctl);
    this.rot += dt * (this.cool > 0 ? 4 : 16);
    if (ctl.firePressed && this.cool <= 0) this.fire();
  }

  fire() {
    const game = this.game;
    const m = safeMuzzle(this, this.length - 4);
    const sp = 1250;
    game.addProjectile(new SawDisc(game, { x: m.x, y: m.y, vx: this.dirX * sp, vy: this.dirY * sp, owner: this.owner }));
    game.fx.burst(m.x, m.y, { n: 6, speed: 300, color: '#e8eef8', life: 0.15, dir: this.angle, spread: 0.8, size: 1.5 });
    this.recoil(220, 7);
    this.cool = 0.38;
    sfx.saw();
    if (--this.ammo <= 0) this.empty();
  }

  drawShape(ctx) {
    ctx.fillStyle = '#2b2f3a';
    ctx.beginPath(); ctx.roundRect(-6, -5, 30, 10, 3); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-3, 3, 7, 10, 2); ctx.fill();
    // open-sided muzzle guard
    ctx.fillStyle = '#4a5060';
    ctx.fillRect(20, -11, 14, 3);
    ctx.fillRect(20, 8, 14, 3);
    ctx.fillStyle = '#c8d4e8';
    ctx.fillRect(4, -2, 10, 3);
    // next disc loaded
    if (this.cool <= 0.15) drawDisc(ctx, 27, 0, 8, this.rot);
  }
}

registerWeapon(SawLauncher);
