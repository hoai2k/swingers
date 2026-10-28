// Survival enemies: the shared base class and procedural insect art.
//
// Every enemy follows the actor contract used by weapons and game.damage:
//   { kind:'enemy', team:'enemy', x, y, r, vx, vy, alive, hp,
//     update(dt), draw(ctx), hurt(info) -> false if ignored, impulse(ix, iy, detach) }
// Subclasses implement think(dt) (AI: set this.want* / attack) and drawBody(ctx).
// The base handles flying physics (steering, terrain avoidance, collision),
// damage (per-attacker melee cooldown, knockback, hit flash), death fx,
// weapon drops and targeting (nearest living spider, with lead + spread).
//
// Damage units: pistol shot 1, saber 3, explosion ~3. A spider's perk can
// multiply what it deals (sp.dmgMul).

import { clamp, rand, TAU } from '../util.js';
import { sfx } from '../audio.js';
import { W, H } from '../board.js';
import { randomWeaponId } from '../weapons.js';
import { drawSil } from './art.js';

// Insects are a good deal bigger than the spiders: easy to read and to hit.
export const ENEMY_SCALE = 1.45;
// ...and they move at this fraction of their nominal speed: they close in
// warily rather than racing at you from across the board.
export const ENEMY_PACE = 0.62;

let NEXT = 1;

export class Enemy {
  static id = 'enemy';
  static label = 'Bug';
  static hp = 2;
  static r = 18;
  static speed = 220;
  static color = '#ffcc33';      // ichor / fx color
  static dropChance = 0.05;
  static dropId = null;          // null = random weapon
  static mass = 1;               // knockback divisor
  static score = 1;

  constructor(game, x, y, { wave = 1 } = {}) {
    const C = this.constructor;
    this.game = game;
    this.id = NEXT++;
    this.kind = 'enemy';
    this.team = 'enemy';
    this.type = C.id;
    this.label = C.label;
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.r = C.r * ENEMY_SCALE;   // insects are drawn and hit at this size
    this.wave = wave;
    // gentle difficulty creep: a bit faster and quicker to attack each wave
    this.agg = 1 + Math.min(0.3, (wave - 1) * 0.02);
    this.maxHp = C.hp;
    this.hp = C.hp;
    this.alive = true;
    this.t = rand(0, 10);
    this.age = 0;
    this.flash = 0;
    this.stagger = 0;            // can't steer (s)
    this.facing = 1;
    this.meleeCd = new Map();    // attacker -> time left before its melee lands again
    this.target = null;
    this.retarget = 0;
    this.bias = rand(0.8, 1.25); // spreads targets between players
    this.entered = false;
    this.aim = { x: 1, y: 0 };   // blades deflect along this
    this.invuln = 0;
  }

  // ---- targeting --------------------------------------------------------
  findTarget() {
    let best = null, bd = Infinity;
    for (const s of this.game.spiders) {
      if (!s.alive) continue;
      const d = Math.hypot(s.x - this.x, s.y - this.y) * (s === this.target ? 0.8 : this.bias);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  // unit direction to shoot at (x,y moving at vx,vy) with a projectile of `speed`;
  // partial lead + random spread so it is dodgeable
  aimAt(t, speed, { lead = 0.55, spread = 0.07, ox = this.x, oy = this.y } = {}) {
    const d = Math.hypot(t.x - ox, t.y - oy);
    const tt = d / speed;
    const px = t.x + t.vx * tt * lead, py = t.y + t.vy * tt * lead * 0.6;
    const a = Math.atan2(py - oy, px - ox) + rand(-spread, spread);
    return { x: Math.cos(a), y: Math.sin(a), a };
  }

  los(t) {
    if (!t) return false;
    return !this.game.world.segment(this.x, this.y, t.x, t.y);
  }

  // ---- movement --------------------------------------------------------
  // accelerate toward point (tx, ty) at up to `speed`
  steer(tx, ty, speed, dt, accel = 5) {
    if (this.stagger > 0) return;
    // still flying in: follow the entry lane first
    if (!this.entered && this.entryTarget) { tx = this.entryTarget.x; ty = this.entryTarget.y; speed = Math.max(speed, 260); accel = Math.max(accel, 4); }
    // never aim for a point outside the arena
    const m = this.r + 20;
    tx = clamp(tx, m, W - m); ty = clamp(ty, m, H - m);
    const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy) || 1;
    const s = Math.min(speed * (this.entered ? ENEMY_PACE : 0.85), d * 3);
    const k = Math.min(1, accel * dt);
    this.vx += (dx / d * s - this.vx) * k;
    this.vy += (dy / d * s - this.vy) * k;
  }

  // drift (no thrust): air drag
  drag(dt, k = 2) { const f = Math.max(0, 1 - k * dt); this.vx *= f; this.vy *= f; }

  move(dt, { avoid = true, bounce = 0.4, keepIn = true } = {}) {
    const world = this.game.world;
    // terrain avoidance: feel ahead along the velocity and slide off
    const sp = Math.hypot(this.vx, this.vy);
    if (avoid && sp > 20) {
      const look = this.r + 30 + sp * 0.25;
      const hit = world.raycast(this.x, this.y, this.vx, this.vy, look);
      if (hit) {
        const k = 1 - hit.t / look;
        this.vx += hit.nx * 1600 * k * dt;
        this.vy += hit.ny * 1600 * k * dt;
      }
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.contacts = world.collideCircle(this, { bounce, friction: 0.1 });
    // arena bounds (after entering from offscreen)
    const m = this.r + 6;
    if (!this.entered) {
      if (this.entryTarget) {
        if (Math.hypot(this.entryTarget.x - this.x, this.entryTarget.y - this.y) < 70) this.entered = true;
        else if (this.age > 5) {
          // stuck on the way in: blink to the lane's end
          this.game.fx.burst(this.x, this.y, { n: 8, speed: 200, color: this.constructor.color, life: 0.3 });
          this.x = this.entryTarget.x; this.y = this.entryTarget.y; this.vx = this.vy = 0;
          this.game.fx.ring(this.x, this.y, 40, this.constructor.color, 0.3, 4);
          this.entered = true;
        }
      } else if (this.x > m && this.x < W - m && this.y > m && this.y < H - m) this.entered = true;
    }
    if (this.entered && keepIn) {
      if (this.x < m) { this.x = m; this.vx = Math.abs(this.vx) * 0.5; }
      if (this.x > W - m) { this.x = W - m; this.vx = -Math.abs(this.vx) * 0.5; }
      if (this.y < m) { this.y = m; this.vy = Math.abs(this.vy) * 0.5; }
      if (this.y > H - m) { this.y = H - m; this.vy = -Math.abs(this.vy) * 0.5; }
    } else if (!this.entered && this.age > 6) {
      // never stall outside: drift to the middle
      this.steer(W / 2, H / 2, 300, dt);
    }
  }

  // a free point near (x,y) that is not in terrain (or null)
  freeSpot(x, y, clear = this.r + 14) {
    x = clamp(x, 80, W - 80); y = clamp(y, 70, H - 120);
    const n = this.game.world.nearest(x, y, clear);
    return n ? null : { x, y };
  }

  // touching a spider: hurt it
  touchSpiders(info = {}, pad = 0) {
    let hit = false;
    for (const s of this.game.spiders) {
      if (!s.alive) continue;
      const dx = s.x - this.x, dy = s.y - this.y, d = Math.hypot(dx, dy) || 1;
      if (d < s.r + this.r + pad) {
        if (this.game.damage(s, { amount: 1, from: this, cause: this.type, x: this.x + dx / d * this.r, y: this.y + dy / d * this.r, ix: dx / d * 600, iy: dy / d * 600 - 150, melee: true, ...info })) hit = true;
      }
    }
    return hit;
  }

  // gently push spiders out of a big body (no damage)
  shoveSpiders(k = 400) {
    for (const s of this.game.spiders) {
      if (!s.alive) continue;
      const dx = s.x - this.x, dy = s.y - this.y, d = Math.hypot(dx, dy) || 1;
      if (d < s.r + this.r) s.impulse(dx / d * k, dy / d * k - 60, true);
    }
  }

  // ---- lifecycle ----------------------------------------------------------
  update(dt) {
    this.t += dt;
    this.age += dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.stagger = Math.max(0, this.stagger - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    for (const [k, v] of this.meleeCd) { if (v - dt <= 0) this.meleeCd.delete(k); else this.meleeCd.set(k, v - dt); }
    this.retarget -= dt;
    if (this.retarget <= 0 || !this.target || !this.target.alive) { this.target = this.findTarget(); this.retarget = rand(0.6, 1.2); }
    if (this.target) {
      const dx = this.target.x - this.x, dy = this.target.y - this.y, m = Math.hypot(dx, dy) || 1;
      this.aim.x = dx / m; this.aim.y = dy / m;
    }
    this.think(dt);
    if (!this.alive) return;
    if (this.y > this.game.board.killY + 300) this.die({ cause: 'fall' });
    if (Math.random() < dt * 0.6) sfx.buzz();
  }

  think(dt) { const t = this.target; if (t) this.steer(t.x, t.y, this.constructor.speed, dt); this.move(dt); }

  impulse(ix, iy) {
    const m = this.constructor.mass;
    this.vx += ix / m; this.vy += iy / m;
    if (Math.hypot(ix, iy) > 350) this.stagger = Math.max(this.stagger, 0.12);
  }

  // returns false when the hit is ignored (cooldown, shield...)
  hurt(info = {}) {
    if (!this.alive || this.invuln > 0) return false;
    const from = info.from || null;
    if (info.melee && from) {
      if (this.meleeCd.has(from)) return false;
      this.meleeCd.set(from, 0.3);
    }
    if (this.block && this.block(info)) return false;
    // armor plates (survival stages / trials): each one soaks a whole hit
    if (this.armor > 0 && !info.bonk) {
      this.armor--;
      this.flash = 1;
      if (info.ix || info.iy) this.impulse((info.ix || 0) * 0.5, (info.iy || 0) * 0.5);
      const fx = this.game.fx;
      fx.ring(this.x, this.y, this.r * 1.8, '#d8e0f0', 0.25, 4);
      for (let i = 0; i < 5; i++) fx.add({ kind: 'shard', x: this.x, y: this.y, vx: rand(-300, 300), vy: rand(-380, -60), color: '#b8c2d8', size: 5, life: 0.6, g: 1200, drag: 0.5, rot: rand(0, TAU), vr: rand(-12, 12) });
      sfx.deflect();
      return true;
    }
    let amt = info.bonk ? 1 : (info.amount ?? 1);
    if (from && from.dmgMul) amt *= from.dmgMul;
    this.hp -= amt;
    this.flash = 1;
    if (info.ix || info.iy) this.impulse((info.ix || 0) * 0.8, (info.iy || 0) * 0.8);
    const hx = info.x ?? this.x, hy = info.y ?? this.y;
    this.game.fx.burst(hx, hy, { n: 8, speed: 300, color: this.constructor.color, life: 0.3, kind: 'blob', size: 3, g: 900 });
    if (this.onHurt) this.onHurt(info, amt);
    if (this.hp <= 0) this.die(info);
    else sfx.hurt();
    return true;
  }

  die(info = {}) {
    if (!this.alive) return;
    this.alive = false;
    const game = this.game, C = this.constructor;
    const big = this.r / 20;
    game.fx.splat(this.x, this.y, C.color, Math.round(14 * big), 450 * Math.sqrt(big));
    game.fx.burst(this.x, this.y, { n: Math.round(14 * big), speed: 600, color: '#fff6c8', life: 0.35 });
    game.fx.ring(this.x, this.y, this.r * 2.6, C.color, 0.25, 5);
    // wing shards flutter down
    for (let i = 0; i < 4; i++) {
      game.fx.add({ kind: 'shard', x: this.x, y: this.y, vx: rand(-260, 260), vy: rand(-420, -120), color: 'rgba(210,240,255,0.7)', size: this.r * 0.45, life: rand(0.7, 1.1), g: 700, drag: 1.5, rot: rand(0, TAU), vr: rand(-14, 14) });
    }
    game.fx.shake(3 + big * 3);
    sfx.enemyDie();
    if (Math.random() < C.dropChance) {
      const sc = game.scene;
      const id = (sc && sc.enemyDropId && sc.enemyDropId(C)) || C.dropId || randomWeaponId();
      const w = id && game.createWeapon(id);
      if (w) { const p = game.spawnPickup(w, this.x, this.y, rand(-120, 120), -380); p.spawnGlow = 1; }
    }
    if (this.onDie) this.onDie(info);
    if (game.scene && game.scene.onEnemyKilled) game.scene.onEnemyKilled(this, info);
  }

  // ---- drawing --------------------------------------------------------------
  draw(ctx) {
    ctx.save();
    if (this.spawnFade !== undefined && this.spawnFade < 1) ctx.globalAlpha = this.spawnFade;
    this._spr = null;              // set by drawBug when a sprite frame was drawn
    this.drawBody(ctx);
    if (this.flash > 0 && this._spr) {
      // hit flash: a white copy of the painted frame
      drawSil(ctx, this, '#ffffff', this.flash * 0.75);
    } else if (this.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.flash * 0.6;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 1.1, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // armor plates: a riveted steel ring, one segment per plate
    if (this.armor > 0) {
      ctx.save();
      ctx.lineCap = 'round';
      const n = this.armor, seg = TAU / Math.max(3, n * 3);
      for (let k = 0; k < n * 3; k++) {
        const a0 = this.t * 0.8 + k * (TAU / (n * 3));
        ctx.strokeStyle = 'rgba(20,24,34,0.8)'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r + 5, a0, a0 + seg * 0.7); ctx.stroke();
        ctx.strokeStyle = '#c8d2e6'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r + 5, a0, a0 + seg * 0.7); ctx.stroke();
      }
      ctx.restore();
    }
    // small hp pips for tougher bugs once hurt
    if (this.maxHp > 2 && this.hp < this.maxHp && !this.isBoss) {
      const w = this.r * 2, k = Math.max(0, this.hp / this.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(this.x - w / 2, this.y - this.r - 14, w, 5);
      ctx.fillStyle = this.constructor.color; ctx.fillRect(this.x - w / 2, this.y - this.r - 14, w * k, 5);
    }
  }

  drawBody(ctx) {
    drawInsect(ctx, this, {});
  }
}

// ---------------------------------------------------------------------------
// Procedural insect art. Everything is drawn in a local frame where the
// insect faces +x (mirrored by `facing`) and r = this.r.

export function wings(ctx, r, t, { rate = 40, color = 'rgba(210,235,255,0.55)', edge = 'rgba(255,255,255,0.8)', len = 1.25, wid = 0.5, x = -0.1, y = -0.55, pairs = 1, tilt = -0.5 } = {}) {
  for (let p = 0; p < pairs; p++) {
    const ph = Math.sin(t * rate + p * 1.7);
    const sy = 0.25 + 0.75 * Math.abs(ph);
    ctx.save();
    ctx.translate(r * (x - p * 0.35), r * y);
    ctx.rotate(tilt - p * 0.35 + ph * 0.25);
    ctx.scale(1, sy);
    ctx.fillStyle = color;
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(-r * len * 0.5, 0, r * len * 0.55, r * wid, 0, 0, TAU); ctx.fill(); ctx.stroke();
    // a vein
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-r * len, 0); ctx.stroke();
    ctx.restore();
  }
}

export function eyes(ctx, r, { x = 0.55, y = -0.12, size = 0.32, color = '#ff3b3b', look = 0, glow = 0, n = 1 } = {}) {
  for (let i = 0; i < n; i++) {
    const ex = r * (x - i * 0.06), ey = r * (y + i * 0.28), s = r * size * (i ? 0.7 : 1);
    if (glow > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = glow * 0.45;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(ex, ey, s * 1.6, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(ex, ey, s * 0.9, s, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(ex + s * 0.25 + look * s * 0.2, ey, s * 0.45, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(ex + s * 0.1, ey - s * 0.4, s * 0.22, 0, TAU); ctx.fill();
  }
}

export function antennae(ctx, r, t, { color = '#222', x = 0.6, y = -0.5, len = 0.8 } = {}) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, r * 0.08);
  ctx.lineCap = 'round';
  for (const s of [0, 1]) {
    const w = Math.sin(t * 6 + s) * 0.15;
    ctx.beginPath();
    ctx.moveTo(r * x, r * y);
    ctx.quadraticCurveTo(r * (x + 0.3 + s * 0.1), r * (y - len * 0.8 + w), r * (x + 0.55 + s * 0.15), r * (y - len * 0.6 + w));
    ctx.stroke();
  }
}

// striped abdomen behind the thorax
export function abdomen(ctx, r, { x = -0.85, y = 0.15, len = 0.95, wid = 0.62, base = '#ffcc33', stripe = '#1d1a16', stripes = 3, tilt = 0.25, stinger = '#1d1a16' } = {}) {
  ctx.save();
  ctx.translate(r * x, r * y);
  ctx.rotate(tilt);
  if (stinger) {
    ctx.fillStyle = stinger;
    ctx.beginPath(); ctx.moveTo(-r * len * 0.9, -r * 0.1); ctx.lineTo(-r * len * 1.45, 0); ctx.lineTo(-r * len * 0.9, r * 0.1); ctx.fill();
  }
  ctx.fillStyle = base;
  ctx.beginPath(); ctx.ellipse(0, 0, r * len, r * wid, 0, 0, TAU); ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = stripe;
  for (let i = 0; i < stripes; i++) {
    const sx = r * len * (-0.7 + i * (1.2 / stripes));
    ctx.fillRect(sx, -r, r * len * 0.2, r * 2);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, 0, r * len, r * wid, 0, 0, TAU); ctx.stroke();
  ctx.restore();
}

export function legs(ctx, r, t, { color = '#1d1a16', n = 3, len = 0.7, dangle = 1 } = {}) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, r * 0.09);
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const bx = r * (0.2 - i * 0.35), by = r * 0.45;
    const sw = Math.sin(t * 5 + i) * 0.12 * dangle;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - r * 0.15 + sw * r, by + r * len * 0.6);
    ctx.lineTo(bx - r * 0.3 + sw * r * 1.5, by + r * len);
    ctx.stroke();
  }
}

// default body: thorax + head (used by simple types)
export function drawInsect(ctx, e, o = {}) {
  const r = e.r;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.scale(e.facing < 0 ? -1 : 1, 1);
  if (o.tilt) ctx.rotate(o.tilt);
  wings(ctx, r, e.t, o.wings || {});
  abdomen(ctx, r, o.abdomen || {});
  legs(ctx, r, e.t, o.legs || {});
  ctx.fillStyle = o.body || '#2a2418';
  ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, TAU); ctx.fill();
  ctx.fillStyle = o.head || o.body || '#2a2418';
  ctx.beginPath(); ctx.arc(r * 0.55, -r * 0.05, r * 0.48, 0, TAU); ctx.fill();
  antennae(ctx, r, e.t, o.antennae || {});
  eyes(ctx, r, o.eyes || {});
  ctx.restore();
}

