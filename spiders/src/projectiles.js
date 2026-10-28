// Projectiles: anything flying that isn't a pickup. game.addProjectile(p)
// takes any object with
//   update(dt) -> false when finished,  draw(ctx),  owner, x, y, vx, vy
// and optionally
//   reflectable: true    plasma blades bat it back (deflect(blade, dirX, dirY))
//   prevX/prevY          last position (blade deflection uses the swept path)
//
// Bullet is the shared fast-shot class most guns build on: swept collision
// against terrain and actors each step, wall bounces, glowing trail.

import { segCircle, TAU, rand } from './util.js';
import { sfx } from './audio.js';
import { glowLine } from './fx.js';

export class Bullet {
  constructor(game, { x, y, vx, vy, owner = null, r = 3, damage = 1, color = '#ffe14d', core = '#fff',
    bounces = 0, life = 1.6, gravity = 0, reflectable = true, trail = 0.035, width = 3, knock = 380,
    pierce = 0, onHitWall = null, onHitActor = null, onExpire = null, cause = 'shot', glass = true } = {}) {
    Object.assign(this, { game, x, y, vx, vy, owner, r, damage, color, core, bounces, life, gravity, reflectable, trail, width, knock, pierce, onHitWall, onHitActor, onExpire, cause, glass });
    this.prevX = x; this.prevY = y;
    this.age = 0;
    this.hitSet = new Set();
    this.dead = false;
  }

  deflect(blade, dx, dy) {
    const sp = Math.hypot(this.vx, this.vy) * 1.1;
    this.vx = dx * sp; this.vy = dy * sp;
    this.owner = blade.owner;
    this.hitSet.clear();
    this.age = 0;
    sfx.deflect();
    this.game.fx.burst(this.x, this.y, { n: 10, speed: 400, color: this.color, life: 0.25 });
  }

  update(dt) {
    if (this.dead) return false;
    const game = this.game;
    this.age += dt;
    if (this.age > this.life) { if (this.onExpire) this.onExpire(this); return false; }
    this.vy += this.gravity * dt;
    this.prevX = this.x; this.prevY = this.y;
    let nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    // actors first (closest along the path)
    const hits = game.actorsOnSegment(this.x, this.y, nx, ny, this.r, this.owner);
    const wall = game.world.segment(this.x, this.y, nx, ny);
    const segLen = Math.hypot(nx - this.x, ny - this.y) || 1;
    for (const h of hits) {
      if (this.hitSet.has(h.actor)) continue;
      if (wall && wall.t < h.t * segLen) break;
      this.hitSet.add(h.actor);
      const ix = this.vx / (Math.hypot(this.vx, this.vy) || 1) * this.knock, iy = this.vy / (Math.hypot(this.vx, this.vy) || 1) * this.knock;
      const hx = this.x + (nx - this.x) * h.t, hy = this.y + (ny - this.y) * h.t;
      game.damage(h.actor, { amount: this.damage, from: this.owner, cause: this.cause, x: hx, y: hy, ix, iy, projectile: this });
      if (this.onHitActor) this.onHitActor(this, h.actor, hx, hy);
      game.fx.hitSpark(hx, hy, 26 + this.width * 3, this.core);
      if (this.pierce-- <= 0) {
        game.fx.burst(hx, hy, { n: 8, speed: 300, color: this.color, life: 0.2 });
        return false;
      }
    }
    if (wall) {
      if (wall.solid.mat === 'glass' && this.glass) game.breakSolid(wall.solid, wall.x, wall.y);
      if (this.onHitWall && this.onHitWall(this, wall) === false) return false;
      if (this.bounces > 0) {
        this.bounces--;
        const vn = this.vx * wall.nx + this.vy * wall.ny;
        this.vx -= 2 * vn * wall.nx; this.vy -= 2 * vn * wall.ny;
        this.x = wall.x + wall.nx * 2; this.y = wall.y + wall.ny * 2;
        this.hitSet.clear();
        game.fx.burst(wall.x, wall.y, { n: 5, speed: 200, color: this.color, life: 0.2, size: 1.5 });
        sfx.clink();
        return true;
      }
      game.fx.burst(wall.x, wall.y, { n: 7, speed: 260, color: this.color, life: 0.25, size: 2, dir: Math.atan2(wall.ny, wall.nx), spread: 2.4 });
      game.fx.hitSpark(wall.x, wall.y, 12 + this.width * 2, this.color, 0.1);
      this.x = wall.x; this.y = wall.y;
      return false;
    }
    this.x = nx; this.y = ny;
    return !(this.x < -200 || this.x > game.world.bounds.w + 200 || this.y < -600 || this.y > game.world.bounds.h + 300);
  }

  draw(ctx) {
    const sp = Math.hypot(this.vx, this.vy) || 1;
    const tl = Math.min(this.age, this.trail) * sp;
    const tx = this.x - (this.vx / sp) * tl, ty = this.y - (this.vy / sp) * tl;
    glowLine(ctx, tx, ty, this.x, this.y, this.color, this.width, this.core);
  }
}

// Spin a projectile's facing for drawing (rockets, saws...)
export function headingOf(p) { return Math.atan2(p.vy, p.vx); }
