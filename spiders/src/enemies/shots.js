// Enemy projectiles. All are reflectable: a plasma blade bats them back
// (game.deflectProjectiles -> deflect), after which they belong to the
// spider that hit them and hurt insects instead. They pass through their
// own side (game.canHurt), unlike the shared Bullet.
//   Bolt  fast stinger shot (gunners, the boss)
//   Orb   slow homing hex orb (casters); a deflected orb homes on insects
//   Bomb  falling fused grenade (bombers); explodes on a spider or its fuse

import { TAU, rand, angDiff, clamp } from '../util.js';
import { sfx } from '../audio.js';
import { glowLine } from '../fx.js';

// Insect shots fly at this fraction of the speed their shooter asks for:
// slow enough to see coming, dodge, or bat back with a blade.
export const SHOT_PACE = 0.6;

class Shot {
  constructor(game, { x, y, vx, vy, owner, r = 5, life = 3, damage = 1, color = '#ff6a3a', core = '#fff3c8' }) {
    vx *= SHOT_PACE; vy *= SHOT_PACE;
    life /= SHOT_PACE;      // same range as before
    r *= 1.3;               // and a bit bigger to see
    Object.assign(this, { game, x, y, vx, vy, owner, r, life, damage, color, core });
    this.prevX = x; this.prevY = y;
    this.age = 0;
    this.reflectable = true;
    this.team = owner ? owner.team : 'enemy';
    this.deflected = false;
  }

  deflect(blade, dx, dy) {
    const sp = Math.max(500, Math.hypot(this.vx, this.vy) * 1.3);
    this.vx = dx * sp; this.vy = dy * sp;
    this.owner = blade.owner;
    this.team = this.owner ? this.owner.team : this.team;
    this.deflected = true;
    this.age = Math.min(this.age, 0.2);
    sfx.deflect();
    this.game.fx.burst(this.x, this.y, { n: 10, speed: 400, color: this.color, life: 0.25 });
  }

  canHit(a) {
    if (a === this.owner) return false;
    const from = this.owner || { team: this.team, kind: 'enemy' };
    return this.game.canHurt(from, a);
  }

  // swept move; returns 'actor' | 'wall' | null
  sweep(dt) {
    const game = this.game;
    this.prevX = this.x; this.prevY = this.y;
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    const wall = game.world.segment(this.x, this.y, nx, ny);
    const len = Math.hypot(nx - this.x, ny - this.y) || 1;
    for (const h of game.actorsOnSegment(this.x, this.y, nx, ny, this.r, this.owner)) {
      if (wall && wall.t < h.t * len) break;
      if (!this.canHit(h.actor)) continue;
      const hx = this.x + (nx - this.x) * h.t, hy = this.y + (ny - this.y) * h.t;
      this.x = hx; this.y = hy;
      this.hitActor(h.actor);
      return 'actor';
    }
    if (wall) { this.x = wall.x; this.y = wall.y; this.wall = wall; return 'wall'; }
    this.x = nx; this.y = ny;
    return null;
  }

  hitActor(a) {
    const sp = Math.hypot(this.vx, this.vy) || 1;
    this.game.damage(a, { amount: this.deflected ? this.damage * 2 : this.damage, from: this.owner, cause: 'sting', x: this.x, y: this.y, ix: this.vx / sp * 380, iy: this.vy / sp * 380, projectile: this });
    this.game.fx.burst(this.x, this.y, { n: 10, speed: 320, color: this.color, life: 0.25 });
  }

  out() {
    const b = this.game.world.bounds;
    return this.x < -200 || this.x > b.w + 200 || this.y < -400 || this.y > b.h + 300;
  }
}

export class Bolt extends Shot {
  constructor(game, o) { super(game, { r: 5, life: 2.6, color: '#ff7a2a', ...o }); }
  update(dt) {
    this.age += dt;
    if (this.age > this.life || this.out()) return false;
    const r = this.sweep(dt);
    if (r === 'actor') return false;
    if (r === 'wall') {
      if (this.wall.solid.mat === 'glass') this.game.breakSolid(this.wall.solid, this.wall.x, this.wall.y);
      this.game.fx.burst(this.x, this.y, { n: 6, speed: 220, color: this.color, life: 0.2, size: 2, dir: Math.atan2(this.wall.ny, this.wall.nx), spread: 2.4 });
      return false;
    }
    return true;
  }
  draw(ctx) {
    const sp = Math.hypot(this.vx, this.vy) || 1;
    const tl = Math.min(this.age * sp, 26);
    const c = this.deflected && this.owner && this.owner.color ? this.owner.color.main : this.color;
    glowLine(ctx, this.x - this.vx / sp * tl, this.y - this.vy / sp * tl, this.x, this.y, c, 5, this.core);
    ctx.fillStyle = this.core;
    ctx.beginPath(); ctx.arc(this.x, this.y, 3.5, 0, TAU); ctx.fill();
  }
}

export class Orb extends Shot {
  constructor(game, o) {
    super(game, { r: 9, life: 5.5, color: '#c46bff', core: '#f6e6ff', ...o });
    this.speed = Math.hypot(this.vx, this.vy) || 260;
    this.turn = o.turn ?? 1.7;
    this.homing = o.homing ?? true;
    this.spin = rand(0, TAU);
  }
  nearestFoe() {
    let best = null, bd = 1e9;
    for (const a of this.game.actors()) {
      if (!this.canHit(a)) continue;
      const d = Math.hypot(a.x - this.x, a.y - this.y);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }
  update(dt) {
    this.age += dt;
    this.spin += dt * 6;
    if (this.age > this.life || this.out()) { this.pop(); return false; }
    if (this.homing && this.age > 0.25) {
      const t = this.nearestFoe();
      if (t) {
        const a = Math.atan2(this.vy, this.vx);
        const want = Math.atan2(t.y - this.y, t.x - this.x);
        const na = a + clamp(angDiff(a, want), -this.turn * dt, this.turn * dt);
        const sp = this.deflected ? this.speed * 1.6 : this.speed;
        this.vx = Math.cos(na) * sp; this.vy = Math.sin(na) * sp;
      }
    }
    const r = this.sweep(dt);
    if (r) { this.pop(); return false; }
    if (Math.random() < dt * 30) this.game.fx.add({ kind: 'blob', x: this.x + rand(-4, 4), y: this.y + rand(-4, 4), vx: 0, vy: 0, color: this.color, size: 4, life: 0.3 });
    return true;
  }
  deflect(blade, dx, dy) { super.deflect(blade, dx, dy); this.life = Math.max(this.life, this.age + 2.5); }
  pop() { this.game.fx.burst(this.x, this.y, { n: 12, speed: 260, color: this.color, life: 0.3 }); this.game.fx.ring(this.x, this.y, 26, this.color, 0.2, 3); }
  draw(ctx) {
    const c = this.deflected && this.owner && this.owner.color ? this.owner.color.main : this.color;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r * 2.6);
    g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 2.6, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.fillStyle = this.core;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.6, 0, TAU); ctx.fill();
    // rune ring
    ctx.strokeStyle = c; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = this.spin + i * TAU / 3;
      ctx.moveTo(this.x + Math.cos(a) * this.r, this.y + Math.sin(a) * this.r);
      ctx.arc(this.x, this.y, this.r, a, a + 1.2);
    }
    ctx.stroke();
  }
}

export class Bomb extends Shot {
  constructor(game, o) {
    super(game, { r: 10, life: 6, color: '#ff4040', ...o });
    this.fuse = o.fuse ?? 1.7;
    this.radius = o.radius ?? 105;
    this.rot = 0;
  }
  update(dt) {
    const game = this.game;
    this.age += dt;
    this.fuse -= dt;
    this.prevX = this.x; this.prevY = this.y;
    this.vy += 1500 * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.rot += this.vx * dt * 0.03;
    const cs = game.world.collideCircle(this, { bounce: 0.45, friction: 0.25 });
    if (cs.length && cs[0].vn < -200) sfx.clink();
    for (const c of cs) if (c.solid.mat === 'lava') this.fuse = 0;
    // detonate on touching a foe (after a beat, so it never pops inside its dropper)
    if (this.age > 0.15) {
      for (const a of game.actors()) {
        if (!this.canHit(a)) continue;
        if (Math.hypot(a.x - this.x, a.y - this.y) < a.r + this.r) { this.fuse = 0; break; }
      }
    }
    if (this.fuse <= 0 || this.y > game.board.killY + 100) {
      if (this.y < game.board.killY + 100) game.explode(this.x, this.y, { radius: this.radius, owner: this.owner, damage: 3, force: 800, selfOk: false, color: '#ff7a4a' });
      return false;
    }
    if (this.fuse < 0.6 && Math.random() < dt * 20) sfx.clink();
    return true;
  }
  deflect(blade, dx, dy) { super.deflect(blade, dx, dy); this.vy -= 200; }
  draw(ctx) {
    const blink = this.fuse < 0.7 ? Math.floor(this.fuse * 14) % 2 === 0 : Math.floor(this.fuse * 5) % 2 === 0;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    // danger radius hint as the fuse runs out
    if (this.fuse < 0.8) {
      ctx.strokeStyle = `rgba(255,80,60,${0.15 + 0.25 * (1 - this.fuse / 0.8)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, this.radius * 0.85, 0, TAU); ctx.stroke();
    }
    ctx.fillStyle = '#4a3a4a'; ctx.strokeStyle = '#d9a8c8'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, this.r * 1.1, this.r, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#7a5a7a';
    ctx.beginPath(); ctx.ellipse(-3, -3, this.r * 0.45, this.r * 0.35, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = blink ? '#ff3030' : '#661818';
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
    if (blink) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,60,40,0.5)';
      ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}
