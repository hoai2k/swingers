// Hive Pod: a volley of 4 little homing missiles per pull of RT.
//  - they fan out, then each one steers toward the nearest body its owner
//    may hurt (re-picking its target every 0.2s); no target, they fly on
//  - small game.explode blasts on contact with terrain or a body, or when
//    they run out of fuel (2.4s)
//  - plasma blades bat them back, and then they hunt their old owner
//  - 3 volleys

import { Weapon, registerWeapon } from '../weapons.js';
import { sfx } from '../audio.js';
import { sprite, drawSprite, preloadSprites } from '../sprites.js';
import { rand, angDiff } from '../util.js';
import { safeMuzzle, nearestFoe } from './kit.js';

preloadSprites(['proj_missile.png']);

const FAN = [-0.42, -0.14, 0.14, 0.42];

export class Hornet {
  constructor(game, { x, y, a, owner }) {
    this.game = game;
    this.x = x; this.y = y; this.prevX = x; this.prevY = y;
    this.a = a;
    this.speed = 620;
    this.vx = Math.cos(a) * this.speed; this.vy = Math.sin(a) * this.speed;
    this.owner = owner;
    this.r = 4;
    this.age = 0;
    this.target = null;
    this.seekT = rand(0, 0.1);
    this.reflectable = true;
    this.trailT = 0;
  }

  deflect(blade, dx, dy) {
    this.a = Math.atan2(dy, dx);
    this.vx = dx * this.speed; this.vy = dy * this.speed;
    this.owner = blade.owner;
    this.target = null; this.seekT = 0.15;
    this.age = Math.min(this.age, 0.3);
    sfx.deflect();
  }

  update(dt) {
    const game = this.game;
    this.age += dt;
    if (this.age > 2.4) return this.pop(this.x, this.y);
    // velocity may have been changed by something else (singularity): follow it
    const va = Math.atan2(this.vy, this.vx);
    if (Math.abs(angDiff(va, this.a)) > 0.01 && Math.hypot(this.vx, this.vy) > 1) this.a = va;
    this.speed = Math.min(1050, this.speed + 900 * dt);
    if (this.age > 0.18) {
      this.seekT -= dt;
      if (this.seekT <= 0 || (this.target && !this.target.alive)) {
        this.seekT = 0.2;
        this.target = nearestFoe(game, this.owner, this.x, this.y, 1100, { los: false });
      }
      if (this.target) {
        const want = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        const d = angDiff(this.a, want);
        const turn = 5.2 * dt;
        this.a += Math.max(-turn, Math.min(turn, d));
      }
    }
    this.vx = Math.cos(this.a) * this.speed; this.vy = Math.sin(this.a) * this.speed;
    this.prevX = this.x; this.prevY = this.y;
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    const hits = game.actorsOnSegment(this.x, this.y, nx, ny, this.r, this.age < 0.3 ? this.owner : null);
    const wall = game.world.segment(this.x, this.y, nx, ny);
    const len = Math.hypot(nx - this.x, ny - this.y) || 1;
    if (hits.length && (!wall || hits[0].t * len <= wall.t)) {
      const t = hits[0].t;
      return this.pop(this.x + (nx - this.x) * t, this.y + (ny - this.y) * t);
    }
    if (wall) return this.pop(wall.x + wall.nx * 3, wall.y + wall.ny * 3);
    this.x = nx; this.y = ny;
    this.trailT -= dt;
    if (this.trailT <= 0) {
      this.trailT = 0.03;
      game.fx.add({ kind: 'smoke', x: this.x, y: this.y, vx: 0, vy: 0, color: 'rgba(170,170,180,0.35)', size: 3.5, life: 0.4, drag: 2, g: -20 });
    }
    return !(this.x < -300 || this.x > game.world.bounds.w + 300 || this.y < -700 || this.y > game.world.bounds.h + 300);
  }

  pop(x, y) {
    this.game.explode(x, y, { radius: 58, owner: this.owner, force: 600, damage: 2, color: '#ffb35a' });
    return false;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.a);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffb35a';
    ctx.globalAlpha = 0.9;
    const fl = 6 + Math.random() * 6;
    const art = sprite('proj_missile.png');
    const tail = art ? -8 : -5;
    ctx.beginPath(); ctx.moveTo(tail, -2); ctx.lineTo(tail - fl, 0); ctx.lineTo(tail, 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // the bee missile sprite (never upside down), else drawn
    if (art) { drawSprite(ctx, 'proj_missile.png', 0, 0, 18, { fit: 'w', flipY: Math.cos(this.a) < 0 }); ctx.restore(); return; }
    ctx.fillStyle = '#e8ecf4';
    ctx.fillRect(-6, -2.5, 9, 5);
    ctx.fillStyle = this.owner && this.owner.color ? this.owner.color.main : '#ffb35a';
    ctx.beginPath(); ctx.moveTo(3, -2.5); ctx.lineTo(7, 0); ctx.lineTo(3, 2.5); ctx.fill();
    ctx.restore();
  }
}

export class SwarmLauncher extends Weapon {
  static id = 'swarm';
  static label = 'Hive Pod';
  static kind = 'gun';
  static ammo = 3;
  static weight = 0.36;   // guns are rarer than blades
  static color = '#ffb35a';
  static art = { hx: 30, hy: 55, s: 0.22 };   // wpn_swarm.png: grip pixel, units per pixel

  constructor(game) {
    super(game);
    this.length = 34;
    this.queue = 0;       // missiles left in the current volley
    this.qT = 0;
  }

  onUnequip() { this.queue = 0; }

  update(dt, ctl) {
    super.update(dt, ctl);
    if (this.queue > 0) {
      this.qT -= dt;
      if (this.qT <= 0) { this.launch(FAN[4 - this.queue]); this.queue--; this.qT = 0.065; if (this.queue === 0 && this.ammo <= 0) { this.empty(); return; } }
    } else if (ctl.firePressed && this.cool <= 0 && this.ammo > 0) {
      this.ammo--;
      this.queue = 4; this.qT = 0;
      this.cool = 0.9;
    }
  }

  launch(off) {
    const game = this.game;
    const m = safeMuzzle(this);
    game.addProjectile(new Hornet(game, { x: m.x, y: m.y, a: this.angle + off, owner: this.owner }));
    game.fx.burst(m.x, m.y, { n: 4, speed: 250, color: '#ffd08a', life: 0.15, dir: this.angle, spread: 1 });
    game.fx.smoke(m.x, m.y, { n: 1, size: 6, life: 0.4, speed: 40 });
    this.recoil(110, 4);
    sfx.swarm();
  }

  drawShape(ctx) {
    ctx.fillStyle = '#2b2f3a';
    ctx.beginPath(); ctx.roundRect(-4, 3, 7, 9, 2); ctx.fill();
    // 2x2 tube pod
    ctx.fillStyle = '#5a5240';
    ctx.beginPath(); ctx.roundRect(-8, -10, 40, 15, 4); ctx.fill();
    ctx.fillStyle = '#2b2f3a';
    for (let i = 0; i < 4; i++) {
      const y = -8.5 + (i % 2) * 6.5;
      ctx.beginPath(); ctx.arc(31, y + 2.5, 2.6, 0, Math.PI * 2); ctx.fill();
    }
    // missiles left in the volley poke out
    const left = this.queue > 0 ? this.queue : (this.cool <= 0.2 && this.ammo > 0 ? 4 : 0);
    ctx.fillStyle = '#ffb35a';
    for (let i = 0; i < left; i++) {
      const y = -8.5 + (i % 2) * 6.5;
      ctx.beginPath(); ctx.moveTo(32, y + 0.5); ctx.lineTo(36, y + 2.5); ctx.lineTo(32, y + 4.5); ctx.fill();
    }
    ctx.fillStyle = '#ffb35a';
    ctx.fillRect(0, -10, 4, 15);
  }
}

registerWeapon(SwarmLauncher);
