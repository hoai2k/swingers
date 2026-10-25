// Weapons: the base class, the registry, pickups (weapons lying around,
// thrown, or yanked by a web) and the drop spawner.
//
// A weapon module (src/weapons/*.js) defines a class extending Weapon and
// calls registerWeapon(Cls). Static fields describe it:
//   static id      unique key ('saber', 'shotgun', ...)
//   static label   name shown when picked up
//   static kind    'melee' | 'gun' | 'throwable' | 'special'
//   static ammo    shots before it's empty (Infinity for melee)
//   static weight  drop frequency (1 = normal, 0.5 = rare)
//   static color   accent color (pickup glow, HUD)
//
// Lifecycle while held (owner = a Spider):
//   update(dt, ctl)  ctl = { aimX, aimY, angle, aimMag, fire, firePressed,
//                    fireReleased, alt, altPressed }. The base update eases
//                    this.angle toward the aim and places the weapon at
//                    this.x/this.y (grip point). Subclasses call super.update
//                    then fire on ctl.fire / firePressed.
//   drawShape(ctx)   draw in local coords: grip at (0,0), barrel along +x,
//                    "up" is -y (the base flips it when aiming left).
//   onThrow(ctl)     return true to take over the throw (e.g. saber)
//   onEquip/onUnequip(spider)
// When ammo runs out call this.empty(): the spider tosses it away.
// While lying around as a pickup: drawPickup(ctx) and optional
// thrownUpdate(pickup, dt) (return true if it handled the physics).

import { clamp, lerp, TAU, rand, angApproach, angDiff, pick } from './util.js';
import { sfx } from './audio.js';

export const WEAPONS = new Map();
export function registerWeapon(Cls) { WEAPONS.set(Cls.id, Cls); }
export function createWeapon(id, game) {
  const C = WEAPONS.get(id);
  return C ? new C(game) : null;
}
// weaponPool.weight(C, game) -> drop weight, set by pool.js (the weapon-pool
// setting + the "blades only" modifier). When the pool leaves nothing at all,
// the static weights are used so a drop always produces a weapon.
export const weaponPool = { weight: null };
export function randomWeaponId(exclude = [], game = null) {
  const all = [...WEAPONS.values()];
  let wOf = (C) => C.weight ?? 1;
  if (weaponPool.weight) {
    const pw = (C) => Math.max(0, weaponPool.weight(C, game) || 0);
    if (all.some((C) => pw(C) > 0)) wOf = pw;
  }
  const list = all.filter((C) => !exclude.includes(C.id) && wOf(C) > 0);
  let total = 0;
  for (const C of list) total += wOf(C);
  let r = Math.random() * total;
  for (const C of list) { r -= wOf(C); if (r <= 0) return C.id; }
  return list.length ? list[list.length - 1].id : null;
}

export class Weapon {
  static id = 'base';
  static label = 'Weapon';
  static kind = 'gun';
  static ammo = 10;
  static weight = 1;
  static color = '#ffd23f';

  constructor(game) {
    this.game = game;
    this.owner = null;
    const C = this.constructor;
    this.id = C.id;
    this.label = C.label;
    this.kind = C.kind;
    this.color = C.color;
    this.ammo = C.ammo;
    this.maxAmmo = C.ammo;
    this.angle = 0;
    this.av = 0;              // angular velocity (rad/s), for swings
    this.turnRate = 26;       // rad/s the weapon can turn toward the aim
    this.holdDist = 6;        // grip distance beyond the body surface
    this.x = 0; this.y = 0;
    this.cool = 0;
    this.kick = 0;            // visual recoil offset (px), decays
    this.time = 0;
    this.length = 34;         // rough size for pickups / drawing
  }

  // guns are drawn a little smaller than their nominal size so they suit the
  // small spiders; blades keep their full reach
  get vis() { return this.kind === 'melee' ? 1 : 0.8; }
  get muzzleDist() { return this.length * this.vis; }
  get dirX() { return Math.cos(this.angle); }
  get dirY() { return Math.sin(this.angle); }
  get flip() { return Math.cos(this.angle) < 0; }

  // world position of a point along the weapon's barrel axis
  along(d, side = 0) {
    const s = this.flip ? -side : side;
    return { x: this.x + this.dirX * d - this.dirY * s, y: this.y + this.dirY * d + this.dirX * s };
  }
  muzzle() { return this.along(this.muzzleDist); }

  update(dt, ctl) {
    const o = this.owner;
    this.time += dt;
    this.cool = Math.max(0, this.cool - dt);
    this.kick = lerp(this.kick, 0, Math.min(1, dt * 14));
    const prev = this.angle;
    this.angle = angApproach(this.angle, ctl.angle, this.turnRate * dt);
    this.av = angDiff(prev, this.angle) / Math.max(dt, 1e-4);
    const d = o.r + this.holdDist - this.kick;
    // held by the legs: a slow breathing sway, a bounce while walking
    const walk = o.ground ? Math.min(1, Math.hypot(o.vx, o.vy) / 300) : 0;
    const sway = Math.sin(this.time * 2.6) * 1.2 + Math.sin(this.time * 15) * 1.8 * walk;
    let x = o.x + Math.cos(this.angle) * d + o.up.x * sway;
    let y = o.y + Math.sin(this.angle) * d + o.up.y * sway;
    // just picked up: ease in from where it lay into the grip
    if (this.equipT < 1) {
      this.equipT = Math.min(1, this.equipT + dt / 0.2);
      const e = 1 - (1 - this.equipT) ** 3;
      x = lerp(this.fromX, x, e); y = lerp(this.fromY, y, e);
    }
    this.x = x; this.y = y;
  }

  // where the spider's legs hold it: [grip, support?] in world space.
  // Long guns take two legs; blades and throwables one. Override as needed.
  hands() {
    const h = [{ x: this.x, y: this.y }];
    if (this.kind === 'gun' && this.length >= 34) h.push(this.along(Math.min(this.length * 0.55, 30), 2));
    return h;
  }


  // fire helpers ---------------------------------------------------------
  recoil(force, kick = 6) {
    if (this.owner) this.owner.impulse(-this.dirX * force, -this.dirY * force, force > 500);
    this.kick = kick;
  }

  // out of ammo: toss it away (it fades out as a pickup)
  empty() {
    const o = this.owner;
    if (!o) return;
    sfx.drop();
    const p = o.dropWeapon(-o.facing * 160, -320);
    if (p) { p.spent = true; p.life = 1.2; }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    if (this.flip) ctx.scale(1, -1);
    if (this.vis !== 1) ctx.scale(this.vis, this.vis);
    this.drawShape(ctx);
    ctx.restore();
  }

  drawPickup(ctx) { this.drawShape(ctx); }

  drawShape(ctx) {
    ctx.fillStyle = '#555';
    ctx.fillRect(-4, -4, this.length, 8);
  }
}

// ---------------------------------------------------------------------------
// Pickups: weapons in the world.

export class Pickup {
  constructor(game, weapon, x, y, vx = 0, vy = 0) {
    this.game = game;
    this.weapon = weapon;
    weapon.owner = null;
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.r = 13;
    this.angle = weapon.angle || 0;
    this.spin = 0;
    this.age = 0;
    this.life = Infinity;       // set for fading
    this.spent = false;         // out of ammo: can't be picked up
    this.thrown = false;
    this.thrower = null;
    this.from = null;           // the spider that dropped it (short no-pickup)
    this.stuck = false;         // embedded in a wall (no gravity)
    this.yankedBy = null; this.yankT = 0;
    this.grounded = false;
    this.removed = false;
    this.spawnGlow = 0;
  }

  get canTake() { return !this.spent && !this.removed && this.mode !== 'thrown' && this.mode !== 'recall'; }

  update(dt) {
    const game = this.game;
    this.age += dt;
    this.life -= dt;
    this.spawnGlow = Math.max(0, this.spawnGlow - dt);
    if (this.life <= 0) { this.removed = true; return; }
    if (this.weapon.thrownUpdate && this.weapon.thrownUpdate(this, dt)) return;
    if (this.stuck) return;
    this.yankT = Math.max(0, this.yankT - dt);
    if (this.yankT <= 0) this.yankedBy = null;
    this.vy += 1700 * dt * (this.yankedBy ? 0.35 : 1);
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.angle += this.spin * dt;
    const sp = Math.hypot(this.vx, this.vy);
    // a thrown weapon bonks whoever it hits
    if (this.thrown && sp > 500) {
      for (const a of game.actors()) {
        if (a === this.thrower || !a.alive) continue;
        if (Math.hypot(a.x - this.x, a.y - this.y) < a.r + this.r) {
          game.damage(a, { amount: 1, from: this.thrower, cause: 'bonk', x: this.x, y: this.y, ix: this.vx * 0.4, iy: this.vy * 0.4, bonk: true });
          this.vx *= -0.3; this.vy = -250;
          this.thrown = false;
          break;
        }
      }
    }
    const contacts = game.world.collideCircle(this, { bounce: 0.35, friction: 0.25 });
    this.grounded = false;
    for (const c of contacts) {
      if (c.solid.mat === 'lava') { this.removed = true; game.fx.burst(this.x, this.y, { n: 10, color: '#ff8a3a' }); return; }
      if (c.vn < -200) sfx.clink();
      if (c.ny < -0.5) this.grounded = true;
    }
    if (contacts.length) { this.thrown = this.thrown && sp > 700; this.spin *= 0.7; }
    if (this.grounded) { this.vx *= 1 - Math.min(1, dt * 6); this.angle = lerp(this.angle, Math.round(this.angle / Math.PI) * Math.PI, Math.min(1, dt * 8)); }
    if (this.y > game.board.killY + 200) this.removed = true;
  }

  draw(ctx, time) {
    const fade = this.life < 1 ? Math.max(0, this.life) : 1;
    ctx.save();
    ctx.globalAlpha = fade;
    if (!this.spent) {
      // soft glow ring so weapons read on any background
      const pulse = 0.5 + 0.5 * Math.sin(time * 4 + this.x);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(this.x, this.y, 2, this.x, this.y, 30 + this.spawnGlow * 40);
      g.addColorStop(0, this.weapon.color + '88');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = fade * (0.35 + 0.25 * pulse + this.spawnGlow);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(this.x, this.y, 30 + this.spawnGlow * 40, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = fade;
    }
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    const w = this.weapon;
    ctx.translate(-w.length * 0.4, 0);
    w.drawPickup(ctx, this);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Drop spawner: one weapon at every spawn point when a round starts, then
// random drops falling in from the top of the board.

export const DROP_RATES = { off: 0, normal: 7, frequent: 3.5 };   // seconds between drops

export class DropSpawner {
  constructor(game, board, rate = 'normal') {
    this.game = game;
    this.board = board;
    this.interval = DROP_RATES[rate] ?? 7;
    this.timer = this.interval * 0.8;
    this.recent = [];
  }

  nextId() {
    const id = randomWeaponId(this.recent.slice(-4), this.game) || randomWeaponId([], this.game);
    this.recent.push(id);
    return id;
  }

  // a weapon resting at every spawn location (call at round start)
  seedSpawns(points) {
    for (const [x, y] of points) {
      const w = this.game.createWeapon(this.nextId());
      if (!w) continue;
      const p = this.game.spawnPickup(w, x, y - 40, 0, 0);
      p.spawnGlow = 1;
    }
  }

  update(dt) {
    if (!this.interval) return;
    const live = this.game.pickups.filter((p) => !p.spent && !p.removed).length;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.interval * rand(0.7, 1.3);
    if (live >= 6) return;
    this.dropOne();
  }

  dropOne(x) {
    const b = this.board;
    const pts = b.dropPoints && b.dropPoints.length ? b.dropPoints : null;
    let px = x, py = -30;
    if (px === undefined) {
      if (pts) { const p = pick(pts); px = p[0] + rand(-30, 30); py = p[1] ?? -30; }
      else px = rand(160, b.w - 160);
    }
    const w = this.game.createWeapon(this.nextId());
    if (!w) return null;
    const p = this.game.spawnPickup(w, px, py, rand(-40, 40), 120);
    p.spawnGlow = 1;
    p.dropping = true;
    sfx.crate();
    this.game.fx.ring(px, Math.max(20, py), 50, w.color, 0.4, 4);
    return p;
  }
}
