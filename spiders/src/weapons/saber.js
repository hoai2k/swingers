// Plasma Saber: the signature melee weapon.
//  - the blade follows the right stick with a fast-but-limited turn rate,
//    so flicking the stick swings it; anything the blade touches dies
//  - blades clash (both bounce, sparks) and bat projectiles back
//  - it slices webs
//  - RT throws it spinning; it kills along its path and sticks in walls;
//    RT again recalls it to your hand (it flies back through everything)
//  - RB / B tosses it like any weapon (no recall)

import { Weapon, registerWeapon } from '../weapons.js';
import { glowLine } from '../fx.js';
import { sfx } from '../audio.js';
import { angDiff, segSegDist, closestOnSeg, TAU, clamp, lerp, segSeg } from '../util.js';

export class Saber extends Weapon {
  static id = 'saber';
  static label = 'Plasma Saber';
  static kind = 'melee';
  static ammo = Infinity;
  static weight = 1.3;
  static color = '#4dd2ff';
  static blades = [{ from: 4, to: 70 }];    // along the axis from the grip
  static throwSpeed = 1500;

  constructor(game) {
    super(game);
    this.turnRate = 30;
    this.holdDist = 2;
    this.length = 70;
    this.on = 0;               // ignition 0..1
    this.clashCool = 0;
    this.prevSegs = null;
    this.trail = [];           // recent blade tips for the swing smear
    this.mode = null;          // when flying: 'thrown' | 'stuck' | 'recall'
  }

  get bladeColor() { return this.owner ? this.owner.color.main : this.color; }

  onEquip(sp) {
    if (this.thrower && this.thrower.recallable === this) this.thrower.recallable = null;
    this.mode = null; this.thrower = null; this.pickup = null;
    this.on = 0; this.trail.length = 0;
    sp.recallable = null;
    sfx.saberOn();
  }

  // blade segments in world space for a grip at (x,y) with angle a
  segsAt(x, y, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return this.constructor.blades.map((b) => ({ x1: x + c * b.from * this.on, y1: y + s * b.from * this.on, x2: x + c * b.to * this.on, y2: y + s * b.to * this.on }));
  }

  update(dt, ctl) {
    const prevA = this.angle, px = this.x, py = this.y;
    super.update(dt, ctl);
    this.on = Math.min(1, this.on + dt * 6);
    this.clashCool = Math.max(0, this.clashCool - dt);
    const speed = Math.abs(this.av);
    if (speed > 9) sfx.swoosh(speed / 20);
    else sfx.hum();
    this.cut(px, py, prevA, this.x, this.y, this.angle, this.owner);
    // swing smear
    const tip = this.along(this.length * this.on);
    this.trail.push({ x: tip.x, y: tip.y, bx: this.x, by: this.y, t: 0 });
    if (this.trail.length > 6) this.trail.shift();
    for (const t of this.trail) t.t += dt;
    if (ctl.firePressed) this.throwSaber(ctl);
  }

  // kill / clash / deflect / cut webs along the swept blade
  cut(px, py, pa, x, y, a, owner) {
    const game = this.game;
    const steps = Math.max(1, Math.ceil(Math.abs(angDiff(pa, a)) / 0.12));
    const segs = [];
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const ang = pa + angDiff(pa, a) * k;
      segs.push(...this.segsAt(lerp(px, x, k), lerp(py, y, k), ang));
    }
    const live = this.segsAt(x, y, a);
    for (const s of live) game.registerBlade({ ...s, owner, weapon: this });
    // clash with other blades
    if (this.clashCool <= 0) {
      for (const b of game.blades) {
        if (b.weapon === this || b.owner === owner) continue;
        for (const s of live) {
          if (segSegDist(s.x1, s.y1, s.x2, s.y2, b.x1, b.y1, b.x2, b.y2) < 7) {
            this.clash(b, s);
            return;
          }
        }
      }
    }
    // bodies
    for (const actor of game.actors()) {
      if (actor === owner || !actor.alive) continue;
      for (const s of segs) {
        const c = closestOnSeg(actor.x, actor.y, s.x1, s.y1, s.x2, s.y2);
        if (Math.hypot(actor.x - c.x, actor.y - c.y) < actor.r + 3) {
          const dx = actor.x - (owner ? owner.x : x), dy = actor.y - (owner ? owner.y : y), m = Math.hypot(dx, dy) || 1;
          if (game.damage(actor, { amount: 3, from: owner, cause: 'saber', x: c.x, y: c.y, ix: dx / m * 500, iy: dy / m * 500, weapon: this, melee: true })) {
            game.fx.burst(c.x, c.y, { n: 14, speed: 500, color: this.bladeColor, life: 0.3 });
          }
          break;
        }
      }
    }
    // webs
    for (const sp of game.spiders) {
      if (!sp.alive || !sp.web || sp === owner) continue;
      const w = sp.web;
      const an = w.state === 'fly' ? { x: w.x, y: w.y } : sp.webAnchor();
      for (const s of live) {
        if (segSeg(s.x1, s.y1, s.x2, s.y2, sp.x, sp.y, an.x, an.y) >= 0) {
          sp.web = null; sfx.webCut();
          game.fx.burst((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, { n: 6, speed: 200, color: '#fff', life: 0.3, size: 1.5 });
          break;
        }
      }
    }
  }

  clash(b, s) {
    const game = this.game;
    this.clashCool = 0.15;
    if (b.weapon) b.weapon.clashCool = 0.15;
    // bounce both blades back the way they came
    this.angle -= Math.sign(this.av || 1) * 0.5;
    if (b.weapon && b.weapon.angle !== undefined) b.weapon.angle -= Math.sign(b.weapon.av || 1) * 0.5;
    const cx = (s.x2 + b.x2) / 2, cy = (s.y2 + b.y2) / 2;
    game.fx.burst(cx, cy, { n: 22, speed: 650, color: '#fff6c8', life: 0.35, size: 2.5 });
    game.fx.glow(cx, cy, 60, '#ffffff', 0.12);
    game.fx.shake(4);
    game.hitStop(0.05);
    sfx.clash();
    const o1 = this.owner, o2 = b.owner;
    if (o1 && o2 && o1.impulse && o2.impulse) {
      const dx = o2.x - o1.x, dy = o2.y - o1.y, m = Math.hypot(dx, dy) || 1;
      o1.impulse(-dx / m * 380, -dy / m * 380 - 80, true);
      o2.impulse(dx / m * 380, dy / m * 380 - 80, true);
    }
    // a flying saber that clashes drops out of the air
    if (b.weapon && b.weapon.mode === 'thrown' && b.weapon.pickup) b.weapon.toLoose(b.weapon.pickup);
    if (this.mode === 'thrown' && this.pickup) this.toLoose(this.pickup);
  }

  // ---- throwing ---------------------------------------------------------
  onThrow() { return false; }   // RB/B: plain toss

  throwSaber(ctl) {
    const o = this.owner;
    if (!o) return;
    const sp = this.constructor.throwSpeed;
    const p = o.dropWeapon(0, 0);
    if (!p) return;
    p.vx = ctl.aimX * sp; p.vy = ctl.aimY * sp;
    p.x = o.x + ctl.aimX * (o.r + 10); p.y = o.y + ctl.aimY * (o.r + 10);
    p.spin = 24 * (ctl.aimX >= 0 ? 1 : -1);
    p.angle = this.angle;
    this.mode = 'thrown';
    this.thrower = o;
    this.pickup = p;
    p.mode = 'thrown';
    o.recallable = this;
    sfx.throwIt();
  }

  recall(sp) {
    const p = this.pickup;
    if (!p || p.removed || this.thrower !== sp) { sp.recallable = null; return; }
    this.mode = 'recall';
    p.mode = 'recall';
    p.stuck = false;
    sfx.saberOn();
  }

  toLoose(p) {
    this.mode = null;
    p.mode = null;
    p.stuck = false;
    if (this.thrower && this.thrower.recallable === this) this.thrower.recallable = null;
    this.thrower = null;
    this.pickup = null;
    p.vy = Math.min(p.vy, 0) - 150; p.vx *= 0.3;
  }

  thrownUpdate(p, dt) {
    const game = this.game;
    this.time += dt;
    const thrower = this.thrower;
    if (this.mode && (!thrower || !thrower.alive)) { this.toLoose(p); return false; }
    if (this.mode === 'thrown' || this.mode === 'recall') {
      const pa = p.angle, px = p.x, py = p.y;
      if (this.mode === 'recall') {
        const dx = thrower.x - p.x, dy = thrower.y - p.y, m = Math.hypot(dx, dy) || 1;
        const sp = 1900;
        p.vx = lerp(p.vx, dx / m * sp, Math.min(1, dt * 10));
        p.vy = lerp(p.vy, dy / m * sp, Math.min(1, dt * 10));
        if (m < thrower.r + 18) {
          // caught
          this.mode = null; p.mode = null; p.removed = true; this.pickup = null;
          thrower.recallable = null;
          if (!thrower.weapon) { thrower.giveWeapon(this); this.on = 1; }
          else game.spawnPickup(this, thrower.x, thrower.y - 20, 0, -200);
          sfx.pickup();
          return true;
        }
      } else {
        p.vy += 260 * dt;     // nearly straight flight
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.angle += p.spin * dt;
      // the spinning blade is two-sided while flying: grip at the center
      const cx = p.x - Math.cos(p.angle) * 35, cy = p.y - Math.sin(p.angle) * 35;
      const pcx = px - Math.cos(pa) * 35, pcy = py - Math.sin(pa) * 35;
      this.on = 1;
      this.angle = p.angle;
      this.x = cx; this.y = cy;
      this.cut(pcx, pcy, pa, cx, cy, p.angle, thrower);
      if (this.mode === 'thrown') {
        const hit = game.world.segment(px, py, p.x + p.vx * dt * 2, p.y + p.vy * dt * 2);
        if (hit) {
          if (hit.solid.mat === 'glass') game.breakSolid(hit.solid, hit.x, hit.y);
          else {
            // stick into the wall, point first
            this.mode = 'stuck'; p.mode = 'stuck'; p.stuck = true;
            p.angle = Math.atan2(-hit.ny, -hit.nx);
            p.x = hit.x + hit.nx * 28; p.y = hit.y + hit.ny * 28;
            p.vx = p.vy = 0; p.spin = 0;
            p.stuckSolid = hit.solid;
            const l = hit.solid.inv({ x: p.x, y: p.y }); p.slx = l.x; p.sly = l.y; p.sla = p.angle - hit.solid.a;
            game.fx.burst(hit.x, hit.y, { n: 16, speed: 400, color: '#ffe9a8', life: 0.3, dir: Math.atan2(hit.ny, hit.nx), spread: 2 });
            sfx.clash();
          }
        }
        if (p.y > game.board.killY + 100) { this.toLoose(p); }
      }
      return true;
    }
    if (this.mode === 'stuck') {
      if (p.stuckSolid && p.stuckSolid.dynamic) { const w = p.stuckSolid.tx({ x: p.slx, y: p.sly }); p.x = w.x; p.y = w.y; p.angle = p.sla + p.stuckSolid.a; }
      if (p.stuckSolid && p.stuckSolid.broken) this.toLoose(p);
      return true;
    }
    return false;
  }

  // ---- drawing ------------------------------------------------------------
  drawHilt(ctx) {
    ctx.fillStyle = '#2a2d36';
    ctx.fillRect(-10, -3.5, 16, 7);
    ctx.fillStyle = '#b9c0cc';
    ctx.fillRect(-12, -4, 4, 8);
    ctx.fillRect(2, -4.5, 4, 9);
    ctx.fillStyle = '#e04848';
    ctx.fillRect(-4, -1.5, 3, 3);
  }

  draw(ctx) {
    const color = this.bladeColor;
    // swing smear
    if (this.trail.length > 2 && Math.abs(this.av) > 8) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = color;
      for (let i = 1; i < this.trail.length; i++) {
        const a = this.trail[i - 1], b = this.trail[i];
        ctx.globalAlpha = 0.12 * (i / this.trail.length);
        ctx.beginPath();
        ctx.moveTo(a.bx, a.by); ctx.lineTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b.bx, b.by);
        ctx.fill();
      }
      ctx.restore();
    }
    for (const s of this.segsAt(this.x, this.y, this.angle)) glowLine(ctx, s.x1, s.y1, s.x2, s.y2, color, 4.5);
    super.draw(ctx);
  }

  drawShape(ctx) { this.drawHilt(ctx); }

  drawPickup(ctx, p) {
    if (p && (this.mode === 'thrown' || this.mode === 'recall' || this.mode === 'stuck')) {
      // flying/stuck sabers stay lit
      ctx.translate(this.length * 0.4, 0);
      const c = this.thrower ? this.thrower.color.main : this.color;
      ctx.translate(-35, 0);
      for (const b of this.constructor.blades) glowLine(ctx, b.from, 0, b.to, 0, c, 4.5);
      this.drawHilt(ctx);
      return;
    }
    this.drawHilt(ctx);
    // unlit stub of blade so it reads as a saber
    ctx.fillStyle = this.color;
    ctx.globalAlpha *= 0.5;
    ctx.fillRect(6, -1.5, 20, 3);
  }
}

registerWeapon(Saber);
