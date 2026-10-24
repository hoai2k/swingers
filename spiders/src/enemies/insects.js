// The survival bestiary (original insects, procedural art):
//   Stinglet    yellow wasp drone: circles, winds up (shakes, stinger glows), dashes
//   Gnatling    tiny swarm fly: orbits its prey, blinks red, then dives
//   Buzzgunner  orange hornet: keeps its distance, aims a sight line, fires a bolt
//   Bladewing   green mantis: a plasma blade (clashes with sabers, bats shots back)
//   Shellback   blue beetle: energy shield in front, rams; shield drops after a ram
//   Dropmoth    dusty moth: flies high over its prey and drops fused bombs
//   Hexfly      violet caster: blinks (marked destination), casts slow homing orbs
// The boss (every 5th wave) lives in boss.js.

import { Enemy, wings, eyes, antennae, abdomen, legs, drawInsect } from './base.js';
import { Bolt, Orb, Bomb } from './shots.js';
import { sfx } from '../audio.js';
import { glowLine } from '../fx.js';
import { W, H } from '../board.js';
import { rand, TAU, clamp, angDiff, closestOnSeg, segSegDist, lerp } from '../util.js';

// shared telegraph: thin dashed aim line that brightens as it charges
function aimLine(ctx, x, y, dx, dy, len, color, k) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.15 + 0.6 * k;
  ctx.lineWidth = 1.5 + 2 * k;
  ctx.setLineDash([14, 10]);
  ctx.lineDashOffset = -k * 60;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx * len, y + dy * len); ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
export class Stinglet extends Enemy {
  static id = 'stinglet';
  static label = 'Stinglet';
  static hp = 2;
  static r = 16;
  static speed = 250;
  static color = '#ffd23a';
  static dropChance = 0.05;

  constructor(game, x, y, o) {
    super(game, x, y, o);
    this.state = 'approach';
    this.st = 0;
    this.cool = rand(1, 2);
    this.orbit = rand(0, TAU);
    this.dash = { x: 0, y: 0 };
  }

  think(dt) {
    const t = this.target;
    this.st += dt;
    this.cool -= dt * this.agg;
    if (this.state === 'approach') {
      if (t) {
        this.orbit += dt * 0.9;
        const rad = 170 + Math.sin(this.t * 1.3) * 30;
        this.steer(t.x + Math.cos(this.orbit) * rad, t.y - 60 + Math.sin(this.orbit) * rad * 0.6, Stinglet.speed * this.agg, dt, 4);
        this.facing = t.x >= this.x ? 1 : -1;
        const d = Math.hypot(t.x - this.x, t.y - this.y);
        if (this.cool <= 0 && d < 300 && this.entered && this.los(t)) { this.state = 'windup'; this.st = 0; }
      } else this.drag(dt);
      this.move(dt);
    } else if (this.state === 'windup') {
      // back off a little, shake, and lock the dash direction at the end
      this.drag(dt, 6);
      if (t) {
        const a = this.aimAt(t, 900, { lead: 0.35, spread: 0.06 });
        this.dash.x = a.x; this.dash.y = a.y;
        this.facing = a.x >= 0 ? 1 : -1;
        this.vx -= a.x * 200 * dt; this.vy -= a.y * 200 * dt;
      }
      this.move(dt);
      if (this.st > 0.55 / Math.sqrt(this.agg)) { this.state = 'dash'; this.st = 0; sfx.throwIt(); }
    } else if (this.state === 'dash') {
      const sp = 920 * Math.min(1.25, this.agg);
      this.vx = this.dash.x * sp; this.vy = this.dash.y * sp;
      this.move(dt, { avoid: false, bounce: 0.2 });
      this.touchSpiders();
      if (Math.random() < dt * 40) this.game.fx.add({ kind: 'smoke', x: this.x, y: this.y, vx: 0, vy: 0, color: 'rgba(255,220,90,0.3)', size: 8, life: 0.25 });
      if (this.contacts && this.contacts.length) { this.stagger = 0.4; this.game.fx.burst(this.x, this.y, { n: 6, speed: 200, color: '#fff', life: 0.2 }); this.state = 'recover'; this.st = 0; }
      if (this.st > 0.36) { this.state = 'recover'; this.st = 0; }
    } else {
      this.drag(dt, 4);
      this.move(dt);
      if (this.st > 0.7) { this.state = 'approach'; this.cool = rand(1.6, 2.6); }
    }
  }

  drawBody(ctx) {
    const wind = this.state === 'windup';
    const sx = wind ? rand(-2, 2) : 0;
    const tilt = this.state === 'dash' ? 0.25 : wind ? -0.25 : clamp(this.vx * 0.0008 * this.facing, -0.3, 0.3);
    ctx.save();
    ctx.translate(sx, 0);
    drawInsect(ctx, this, {
      tilt,
      body: '#2b2416', head: '#3a2f18',
      abdomen: { base: '#ffd23a', stripe: '#201a10', stinger: wind || this.state === 'dash' ? '#ff4a2a' : '#201a10' },
      wings: { rate: 55 },
      eyes: { color: '#ff3b3b', glow: wind ? 0.6 : 0 },
    });
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
export class Gnatling extends Enemy {
  static id = 'gnatling';
  static label = 'Gnatling';
  static hp = 1;
  static r = 9;
  static speed = 330;
  static color = '#9be15a';
  static dropChance = 0.02;
  static mass = 0.6;

  constructor(game, x, y, o) {
    super(game, x, y, o);
    this.state = 'orbit';
    this.st = 0;
    this.cool = rand(1.8, 3.5);
    this.orbit = rand(0, TAU);
    this.rad = rand(90, 150);
    this.dir = Math.random() < 0.5 ? -1 : 1;
  }

  think(dt) {
    const t = this.target;
    this.st += dt;
    this.cool -= dt * this.agg;
    if (this.state === 'orbit') {
      if (t) {
        this.orbit += dt * 2.2 * this.dir;
        const jx = Math.sin(this.t * 7.3) * 25, jy = Math.cos(this.t * 6.1) * 25;
        this.steer(t.x + Math.cos(this.orbit) * this.rad + jx, t.y - 40 + Math.sin(this.orbit) * this.rad * 0.7 + jy, Gnatling.speed * this.agg, dt, 6);
        this.facing = this.vx >= 0 ? 1 : -1;
        if (this.cool <= 0 && this.entered && this.los(t)) { this.state = 'blink'; this.st = 0; }
      } else this.drag(dt);
      this.move(dt);
    } else if (this.state === 'blink') {
      this.drag(dt, 8);
      this.move(dt);
      if (this.st > 0.42) {
        this.state = 'dive'; this.st = 0;
        if (t) { const a = this.aimAt(t, 620, { lead: 0.3, spread: 0.1 }); this.vx = a.x * 620; this.vy = a.y * 620; this.facing = a.x >= 0 ? 1 : -1; }
      }
    } else if (this.state === 'dive') {
      this.move(dt, { avoid: false, bounce: 0.3 });
      this.touchSpiders({}, -2);
      if (this.st > 0.5 || (this.contacts && this.contacts.length)) { this.state = 'orbit'; this.cool = rand(2.2, 4); this.st = 0; }
    }
  }

  drawBody(ctx) {
    const blink = this.state === 'blink' && Math.floor(this.st * 16) % 2 === 0;
    drawInsect(ctx, this, {
      body: blink ? '#ff4040' : '#1f2a14', head: blink ? '#ff6a6a' : '#2a3a18',
      abdomen: { base: '#6fbf3a', stripe: '#1f2a14', stripes: 2, stinger: null, len: 0.8 },
      wings: { rate: 80, len: 1.5, wid: 0.6 },
      legs: { n: 2 },
      antennae: { len: 0.6 },
      eyes: { color: '#ffef5a', size: 0.38 },
    });
  }
}

// ---------------------------------------------------------------------------
export class Buzzgunner extends Enemy {
  static id = 'buzzgunner';
  static label = 'Buzzgunner';
  static hp = 2;
  static r = 18;
  static speed = 210;
  static color = '#ff8a2a';
  static dropChance = 0.18;
  static dropId = 'pistol';

  constructor(game, x, y, o) {
    super(game, x, y, o);
    this.state = 'hover';
    this.st = 0;
    this.cool = rand(1.4, 2.4);
    this.side = Math.random() < 0.5 ? -1 : 1;
    this.range = rand(380, 520);
    this.shotDir = { x: 1, y: 0 };
    this.burst = 0;
  }

  get muzzle() { return { x: this.x + this.facing * this.r * 0.9, y: this.y + this.r * 0.55 }; }

  think(dt) {
    const t = this.target;
    this.st += dt;
    if (this.state === 'hover') {
      this.cool -= dt * this.agg;
      if (t) {
        // hold position at range, above and to one side, drifting
        const a = Math.atan2(this.y - t.y, this.x - t.x);
        const want = Math.atan2(-0.6, this.side * 0.8);
        const ang = a + clamp(angDiff(a, want), -0.8, 0.8) * 0.5 + Math.sin(this.t * 0.7) * 0.2;
        const px = t.x + Math.cos(ang) * this.range, py = t.y + Math.sin(ang) * this.range;
        this.steer(px, py, Buzzgunner.speed * this.agg, dt, 3);
        this.facing = t.x >= this.x ? 1 : -1;
        if (this.cool <= 0 && this.entered && this.los(t)) { this.state = 'charge'; this.st = 0; sfx.enemyCharge(); }
        if (Math.random() < dt * 0.2) this.side *= -1;
      } else this.drag(dt);
      this.move(dt);
    } else if (this.state === 'charge') {
      this.drag(dt, 5);
      this.move(dt);
      const chargeT = 0.75 / Math.sqrt(this.agg);
      if (t) {
        // the sight line tracks until the last 0.2 s, then locks
        if (this.st < chargeT - 0.2) {
          const m = this.muzzle;
          const a = this.aimAt(t, this.shotSpeed, { lead: 0.5, spread: 0, ox: m.x, oy: m.y });
          this.shotDir.x = a.x; this.shotDir.y = a.y;
          this.facing = a.x >= 0 ? 1 : -1;
        }
      }
      if (this.st >= chargeT) this.fire();
    } else {
      this.drag(dt, 3);
      this.move(dt);
      if (this.st > 0.5) { this.state = 'hover'; this.cool = rand(2.0, 3.0); }
    }
  }

  get shotSpeed() { return 700 + Math.min(220, this.wave * 12); }

  fire() {
    const m = this.muzzle;
    const sp = this.shotSpeed;
    const shots = this.wave >= 8 ? 2 : 1;
    for (let i = 0; i < shots; i++) {
      const a = Math.atan2(this.shotDir.y, this.shotDir.x) + rand(-0.06, 0.06) + (i ? 0.12 : 0) * (Math.random() < 0.5 ? -1 : 1);
      this.game.addProjectile(new Bolt(this.game, { x: m.x, y: m.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, owner: this }));
    }
    this.game.fx.glow(m.x, m.y, 30, '#ff9a4a', 0.1);
    this.impulse(-this.shotDir.x * 160, -this.shotDir.y * 160);
    sfx.enemyShoot();
    this.state = 'recover'; this.st = 0;
  }

  drawBody(ctx) {
    const charging = this.state === 'charge';
    const k = charging ? Math.min(1, this.st / 0.75) : 0;
    if (charging) {
      const m = this.muzzle;
      aimLine(ctx, m.x, m.y, this.shotDir.x, this.shotDir.y, 520, '#ff6a2a', k);
    }
    const r = this.r;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.facing < 0 ? -1 : 1, 1);
    wings(ctx, r, this.t, { rate: 45, pairs: 2, color: 'rgba(255,220,180,0.45)' });
    abdomen(ctx, r, { base: '#ff8a2a', stripe: '#3a1a08', stripes: 3, stinger: '#3a1a08', len: 1.05, wid: 0.68 });
    legs(ctx, r, this.t, { color: '#3a1a08' });
    ctx.fillStyle = '#5a2a10';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.66, 0, TAU); ctx.fill();
    // underslung stinger-cannon
    const ang = Math.atan2(this.shotDir.y, Math.abs(this.shotDir.x));
    ctx.save();
    ctx.translate(r * 0.5, r * 0.55);
    if (charging) ctx.rotate(clamp(ang, -1.2, 1.2));
    ctx.fillStyle = '#2b2f3a';
    ctx.beginPath(); ctx.roundRect(-r * 0.2, -r * 0.18, r * 0.95, r * 0.36, 4); ctx.fill();
    ctx.fillStyle = charging ? `rgba(255,${200 - 120 * k},60,1)` : '#ff8a2a';
    ctx.beginPath(); ctx.arc(r * 0.78, 0, r * (0.12 + 0.12 * k), 0, TAU); ctx.fill();
    if (charging) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = k;
      ctx.fillStyle = 'rgba(255,140,60,0.7)';
      ctx.beginPath(); ctx.arc(r * 0.78, 0, r * 0.5 * k, 0, TAU); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#6a3412';
    ctx.beginPath(); ctx.arc(r * 0.55, -r * 0.08, r * 0.5, 0, TAU); ctx.fill();
    antennae(ctx, r, this.t, { color: '#3a1a08' });
    eyes(ctx, r, { color: '#ffe14d', glow: k * 0.7, size: 0.3 });
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// The mantis carries a plasma blade. It registers with game.registerBlade
// every frame so player sabers clash with it and it bats shots back.
export class Bladewing extends Enemy {
  static id = 'bladewing';
  static label = 'Bladewing';
  static hp = 4;
  static r = 19;
  static speed = 240;
  static color = '#7dff6a';
  static dropChance = 0.3;
  static dropId = 'saber';
  static bladeFrom = 6;
  static bladeTo = 66;

  constructor(game, x, y, o) {
    super(game, x, y, o);
    this.state = 'stalk';
    this.st = 0;
    this.cool = rand(1, 2);
    // the blade object doubles as the "weapon" sabers clash against
    this.blade = { angle: 0, av: 0, clashCool: 0, owner: this, on: 0 };
    this.swingDir = 1;
    this.swingFrom = 0;
    this.side = Math.random() < 0.5 ? -1 : 1;
  }

  get grip() { return { x: this.x + this.facing * this.r * 0.5, y: this.y + this.r * 0.2 }; }

  bladeSeg() {
    const g = this.grip, a = this.blade.angle, on = this.blade.on;
    const C = Bladewing;
    return { x1: g.x + Math.cos(a) * C.bladeFrom * on, y1: g.y + Math.sin(a) * C.bladeFrom * on, x2: g.x + Math.cos(a) * C.bladeTo * on, y2: g.y + Math.sin(a) * C.bladeTo * on };
  }

  think(dt) {
    const t = this.target;
    const b = this.blade;
    this.st += dt;
    this.cool -= dt * this.agg;
    b.clashCool = Math.max(0, b.clashCool - dt);
    b.on = Math.min(1, b.on + dt * 3);
    const prevA = b.angle;
    const toT = t ? Math.atan2(t.y - this.y, t.x - this.x) : b.angle;
    if (this.state === 'stalk') {
      if (t) {
        // hover just outside blade reach, a little above
        const px = t.x - this.side * 130, py = t.y - 50 + Math.sin(this.t * 2) * 20;
        this.steer(px, py, Bladewing.speed * this.agg, dt, 4);
        this.facing = t.x >= this.x ? 1 : -1;
        b.angle += clamp(angDiff(b.angle, toT - this.facing * 0.9), -5 * dt, 5 * dt);
        const d = Math.hypot(t.x - this.x, t.y - this.y);
        if (this.cool <= 0 && d < 220 && this.entered && this.los(t)) { this.state = 'raise'; this.st = 0; this.swingDir = this.facing; }
        if (Math.random() < dt * 0.25) this.side *= -1;
      } else this.drag(dt);
      this.move(dt);
    } else if (this.state === 'raise') {
      // blade up and back: the tell
      this.drag(dt, 6);
      const want = toT - this.swingDir * 2.2;
      b.angle += clamp(angDiff(b.angle, want), -8 * dt, 8 * dt);
      this.move(dt);
      if (this.st > 0.45 / Math.sqrt(this.agg)) {
        this.state = 'slash'; this.st = 0; this.swingFrom = b.angle;
        if (t) { const a = this.aimAt(t, 700, { lead: 0.4, spread: 0.05 }); this.vx = a.x * 560; this.vy = a.y * 560; }
        sfx.swoosh(1.4);
      }
    } else if (this.state === 'slash') {
      b.angle += this.swingDir * 12 * dt;
      this.drag(dt, 2);
      this.move(dt);
      if (this.st > 0.32) { this.state = 'recover'; this.st = 0; }
    } else if (this.state === 'recoil') {
      this.move(dt);
      this.drag(dt, 3);
      b.angle += Math.sin(this.st * 30) * 0.05;
      if (this.st > 0.55) { this.state = 'stalk'; this.cool = rand(0.8, 1.4); }
    } else {
      this.drag(dt, 4);
      this.move(dt);
      if (this.st > 0.6) { this.state = 'stalk'; this.cool = rand(1.4, 2.4); }
    }
    b.av = angDiff(prevA, b.angle) / Math.max(dt, 1e-4);
    this.updateBlade(dt);
  }

  updateBlade(dt) {
    const game = this.game;
    const b = this.blade;
    const s = this.bladeSeg();
    game.registerBlade({ ...s, owner: this, weapon: b });
    if (b.on < 0.9) return;
    // clash with player blades (sabers also detect this from their side)
    if (b.clashCool <= 0) {
      for (const o of game.blades) {
        if (o.owner === this || (o.owner && o.owner.team === this.team)) continue;
        if (segSegDist(s.x1, s.y1, s.x2, s.y2, o.x1, o.y1, o.x2, o.y2) < 7) { this.clashed(o, s); return; }
      }
    } else if (b.clashCool > 0.1 && this.state !== 'recoil') {
      // a saber clashed with us this frame
      this.state = 'recoil'; this.st = 0;
      return;
    }
    if (this.state === 'recoil') return;
    // the blade kills spiders it touches
    for (const sp of game.spiders) {
      if (!sp.alive) continue;
      const c = closestOnSeg(sp.x, sp.y, s.x1, s.y1, s.x2, s.y2);
      if (Math.hypot(sp.x - c.x, sp.y - c.y) < sp.r + 2) {
        const dx = sp.x - this.x, dy = sp.y - this.y, m = Math.hypot(dx, dy) || 1;
        if (game.damage(sp, { amount: 3, from: this, cause: 'blade', x: c.x, y: c.y, ix: dx / m * 500, iy: dy / m * 500, melee: true })) {
          game.fx.burst(c.x, c.y, { n: 14, speed: 500, color: '#ff4fd8', life: 0.3 });
        }
      }
    }
  }

  clashed(o, s) {
    const game = this.game;
    this.blade.clashCool = 0.15;
    if (o.weapon) { o.weapon.clashCool = 0.15; if (o.weapon.angle !== undefined) o.weapon.angle -= Math.sign(o.weapon.av || 1) * 0.5; }
    this.blade.angle -= Math.sign(this.blade.av || 1) * 0.6;
    const cx = (s.x2 + o.x2) / 2, cy = (s.y2 + o.y2) / 2;
    game.fx.burst(cx, cy, { n: 22, speed: 650, color: '#fff6c8', life: 0.35, size: 2.5 });
    game.fx.glow(cx, cy, 60, '#ffffff', 0.12);
    game.fx.shake(4);
    game.hitStop(0.05);
    sfx.clash();
    const p = o.owner;
    if (p && p.impulse) {
      const dx = p.x - this.x, dy = p.y - this.y, m = Math.hypot(dx, dy) || 1;
      p.impulse(dx / m * 380, dy / m * 380 - 80, true);
      this.impulse(-dx / m * 420, -dy / m * 420 - 60);
    }
    this.state = 'recoil'; this.st = 0;
  }

  drawBody(ctx) {
    const r = this.r;
    const raising = this.state === 'raise';
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.facing < 0 ? -1 : 1, 1);
    wings(ctx, r, this.t, { rate: 38, pairs: 2, len: 1.5, wid: 0.38, color: 'rgba(200,255,200,0.4)', tilt: -0.3 });
    // long thin abdomen
    abdomen(ctx, r, { x: -1.0, y: 0.25, len: 1.1, wid: 0.42, base: '#4fc24a', stripe: '#2a7a2a', stripes: 4, stinger: null, tilt: 0.15 });
    legs(ctx, r, this.t, { color: '#2a7a2a', len: 0.9 });
    ctx.fillStyle = '#5ad84f';
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.62, r * 0.5, -0.4, 0, TAU); ctx.fill();
    // neck + triangular head
    ctx.fillStyle = '#7dff6a';
    ctx.beginPath(); ctx.moveTo(r * 0.3, -r * 0.6); ctx.lineTo(r * 1.15, -r * 0.45); ctx.lineTo(r * 0.55, r * 0.05); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#2a7a2a'; ctx.lineWidth = 2; ctx.stroke();
    antennae(ctx, r, this.t, { color: '#2a7a2a', x: 0.8, y: -0.6, len: 0.9 });
    eyes(ctx, r, { x: 0.62, y: -0.45, size: 0.24, color: '#ff4fd8', glow: raising ? 0.7 : 0.1 });
    // raptor arm toward the grip
    ctx.strokeStyle = '#4fc24a'; ctx.lineWidth = r * 0.18; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(r * 0.3, 0); ctx.lineTo(r * 0.7, r * 0.45); ctx.lineTo(r * 0.5, r * 0.2); ctx.stroke();
    ctx.restore();
    // the blade (world space)
    const s = this.bladeSeg();
    const g = this.grip;
    ctx.fillStyle = '#2a2d36';
    ctx.beginPath(); ctx.arc(g.x, g.y, 5, 0, TAU); ctx.fill();
    glowLine(ctx, s.x1, s.y1, s.x2, s.y2, raising ? '#ff7ae6' : '#ff3fc8', 4.5);
  }
}

// ---------------------------------------------------------------------------
// A shield covers the front (toward its target). Hits from the front bounce
// off unless they're explosions; the shield drops while it recovers from a ram.
export class Shellback extends Enemy {
  static id = 'shellback';
  static label = 'Shellback';
  static hp = 6;
  static r = 24;
  static speed = 150;
  static color = '#6ab8ff';
  static dropChance = 0.12;
  static mass = 2.2;
  static shieldArc = 1.25;   // half-angle (rad)

  constructor(game, x, y, o) {
    super(game, x, y, o);
    this.state = 'advance';
    this.st = 0;
    this.cool = rand(1.5, 2.5);
    this.shieldA = 0;
    this.shieldUp = 1;
    this.ram = { x: 0, y: 0 };
  }

  block(info) {
    if (this.shieldUp < 0.5 || info.cause === 'explosion') return false;
    let hx = info.x, hy = info.y;
    if (hx === undefined && info.from) { hx = info.from.x; hy = info.from.y; }
    if (hx === undefined) return false;
    const a = Math.atan2(hy - this.y, hx - this.x);
    if (Math.abs(angDiff(this.shieldA, a)) > Shellback.shieldArc) return false;
    // blocked: sparks, a little shove
    const game = this.game;
    const sx = this.x + Math.cos(a) * (this.r + 8), sy = this.y + Math.sin(a) * (this.r + 8);
    game.fx.burst(sx, sy, { n: 10, speed: 380, color: '#9fe8ff', life: 0.25, dir: a, spread: 1.6 });
    game.fx.ring(sx, sy, 22, '#9fe8ff', 0.18, 3);
    this.shieldFlash = 1;
    sfx.deflect();
    if (info.ix || info.iy) this.impulse((info.ix || 0) * 0.3, (info.iy || 0) * 0.3);
    if (info.melee && info.from && info.from.impulse) info.from.impulse(Math.cos(a) * 380, Math.sin(a) * 380 - 80, true);
    return true;
  }

  think(dt) {
    const t = this.target;
    this.st += dt;
    this.shieldFlash = Math.max(0, (this.shieldFlash || 0) - dt * 4);
    if (t && this.state !== 'ram' && this.state !== 'recover') {
      const want = Math.atan2(t.y - this.y, t.x - this.x);
      this.shieldA += clamp(angDiff(this.shieldA, want), -2.6 * dt, 2.6 * dt);
    }
    this.shieldUp = lerp(this.shieldUp, this.state === 'recover' ? 0 : 1, Math.min(1, dt * 8));
    if (this.state === 'advance') {
      this.cool -= dt * this.agg;
      if (t) {
        this.steer(t.x, t.y - 30, Shellback.speed * this.agg, dt, 2);
        this.facing = t.x >= this.x ? 1 : -1;
        const d = Math.hypot(t.x - this.x, t.y - this.y);
        if (this.cool <= 0 && d < 280 && this.entered && this.los(t)) { this.state = 'windup'; this.st = 0; sfx.enemyCharge(); }
      } else this.drag(dt);
      this.move(dt);
    } else if (this.state === 'windup') {
      this.drag(dt, 6);
      this.move(dt);
      if (t) { const a = this.aimAt(t, 600, { lead: 0.3, spread: 0.05 }); this.ram.x = a.x; this.ram.y = a.y; }
      if (this.st > 0.65 / Math.sqrt(this.agg)) { this.state = 'ram'; this.st = 0; this.shieldA = Math.atan2(this.ram.y, this.ram.x); }
    } else if (this.state === 'ram') {
      this.vx = this.ram.x * 560; this.vy = this.ram.y * 560;
      this.move(dt, { avoid: false, bounce: 0.3 });
      this.touchSpiders();
      if ((this.contacts && this.contacts.length) || this.st > 0.5) {
        if (this.contacts && this.contacts.length) { this.game.fx.shake(5); sfx.land(); this.game.fx.burst(this.x, this.y, { n: 10, speed: 260, color: '#cfe8ff', life: 0.3 }); }
        this.state = 'recover'; this.st = 0;
      }
    } else {
      // dazed, shield down: the opening
      this.drag(dt, 4);
      this.move(dt);
      if (this.st > 1.1) { this.state = 'advance'; this.cool = rand(1.8, 2.8); }
    }
  }

  drawBody(ctx) {
    const r = this.r;
    const wind = this.state === 'windup';
    const dazed = this.state === 'recover';
    ctx.save();
    ctx.translate(this.x + (wind ? rand(-1.5, 1.5) : 0), this.y);
    ctx.scale(this.facing < 0 ? -1 : 1, 1);
    // wings peek out from under the shell
    wings(ctx, r, this.t, { rate: 30, len: 1.1, wid: 0.45, y: -0.35, x: -0.3, color: 'rgba(190,220,255,0.4)' });
    legs(ctx, r, this.t, { color: '#16243a', n: 3, len: 0.6 });
    // the shell
    const g = ctx.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, '#5a9ae8'); g.addColorStop(1, '#1c3a7a');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(-r * 0.15, -r * 0.05, r * 0.95, r * 0.75, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#0e1d3c'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-r * 0.15, -r * 0.8); ctx.lineTo(-r * 0.15, r * 0.7); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.ellipse(-r * 0.45, -r * 0.4, r * 0.3, r * 0.14, -0.3, 0, TAU); ctx.fill();
    // head + horn
    ctx.fillStyle = '#16243a';
    ctx.beginPath(); ctx.arc(r * 0.7, r * 0.05, r * 0.38, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(r * 0.85, -r * 0.15); ctx.quadraticCurveTo(r * 1.35, -r * 0.4, r * 1.25, -r * 0.85); ctx.lineTo(r * 1.0, -r * 0.2); ctx.fill();
    eyes(ctx, r, { x: 0.82, y: 0.0, size: 0.18, color: dazed ? '#8899aa' : '#ffef5a', glow: wind ? 0.6 : 0 });
    ctx.restore();
    // dazed stars
    if (dazed) {
      for (let i = 0; i < 3; i++) {
        const a = this.t * 5 + i * TAU / 3;
        ctx.fillStyle = '#fff6a0';
        ctx.beginPath(); ctx.arc(this.x + Math.cos(a) * r * 0.8, this.y - r - 6 + Math.sin(a) * 5, 3, 0, TAU); ctx.fill();
      }
    }
    // energy shield arc (world space, toward its target)
    if (this.shieldUp > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.shieldUp * (0.55 + 0.25 * Math.sin(this.t * 9) + (this.shieldFlash || 0) * 0.4);
      ctx.strokeStyle = '#7fe8ff';
      ctx.lineCap = 'round';
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(this.x, this.y, r + 9, this.shieldA - Shellback.shieldArc, this.shieldA + Shellback.shieldArc); ctx.stroke();
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(this.x, this.y, r + 9, this.shieldA - Shellback.shieldArc, this.shieldA + Shellback.shieldArc); ctx.stroke();
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------
export class Dropmoth extends Enemy {
  static id = 'dropmoth';
  static label = 'Dropmoth';
  static hp = 3;
  static r = 20;
  static speed = 200;
  static color = '#ffb0a0';
  static dropChance = 0.12;

  constructor(game, x, y, o) {
    super(game, x, y, o);
    this.cool = rand(1.5, 2.5);
    this.hasBomb = 1;
    this.alt = rand(300, 380);
    this.off = rand(-60, 60);
  }

  think(dt) {
    const t = this.target;
    this.cool -= dt * this.agg;
    if (this.cool < 0.8) this.hasBomb = Math.min(1, this.hasBomb + dt * 3);
    if (t) {
      const lead = t.vx * 0.35;
      const px = t.x + lead + this.off + Math.sin(this.t * 0.9) * 60;
      const py = Math.max(70, t.y - this.alt);
      this.steer(px, py, Dropmoth.speed * this.agg, dt, 2.2);
      this.facing = this.vx >= 0 ? 1 : -1;
      const above = Math.abs(t.x + lead * 0.5 - this.x) < 110 && this.y < t.y - 120;
      if (this.cool <= 0 && this.entered && (above || this.cool < -2.5)) this.dropBomb(t);
    } else this.drag(dt);
    // fluttery
    this.vy += Math.sin(this.t * 5) * 90 * dt;
    this.move(dt);
  }

  dropBomb(t) {
    this.hasBomb = 0;
    this.cool = rand(2.6, 3.6);
    const vx = clamp((t.x - this.x) * 1.2, -260, 260) + this.vx * 0.4;
    this.game.addProjectile(new Bomb(this.game, { x: this.x, y: this.y + this.r, vx, vy: 60, owner: this }));
    sfx.drop();
  }

  drawBody(ctx) {
    const r = this.r;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.facing < 0 ? -1 : 1, 1);
    // the bomb it carries
    if (this.hasBomb > 0.1) {
      ctx.globalAlpha = this.hasBomb;
      ctx.strokeStyle = '#3a2a3a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, r * 0.4); ctx.lineTo(0, r * 1.05); ctx.stroke();
      ctx.fillStyle = '#4a3a4a'; ctx.strokeStyle = '#d9a8c8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, r * 1.3, 11, 10, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = Math.floor(this.t * 4) % 2 ? '#ff3030' : '#661818';
      ctx.beginPath(); ctx.arc(0, r * 1.3, 3.5, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // big dusty wings (fore + hind), slow flap, with eye spots
    const ph = Math.sin(this.t * 14);
    const sy = 0.3 + 0.7 * Math.abs(ph);
    for (const [ox, oy, rx, ry, rot, col] of [[-0.55, -0.15, 0.6, 0.45, 0.5, '#b07a68'], [-0.1, -0.35, 0.95, 0.6, -0.55, '#e8b39a']]) {
      ctx.save();
      ctx.translate(r * ox, r * oy);
      ctx.scale(1, sy);
      ctx.rotate(rot);
      ctx.fillStyle = col;
      ctx.strokeStyle = '#5a3a3a'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(-r * rx * 0.6, -r * ry * 0.9, r * rx, r * ry, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5a3a5a';
      ctx.beginPath(); ctx.arc(-r * rx * 0.75, -r * ry * 1.0, r * ry * 0.38, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffe0a0';
      ctx.beginPath(); ctx.arc(-r * rx * 0.75, -r * ry * 1.0, r * ry * 0.16, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // fuzzy body
    ctx.fillStyle = '#d9b9a0';
    ctx.beginPath(); ctx.ellipse(-r * 0.2, r * 0.1, r * 0.7, r * 0.42, 0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#b08870';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-r * 0.5 + i * r * 0.3, r * 0.12, r * 0.12, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#e8cbb0';
    ctx.beginPath(); ctx.arc(r * 0.5, -r * 0.05, r * 0.38, 0, TAU); ctx.fill();
    // feathery antennae
    ctx.strokeStyle = '#7a5a4a'; ctx.lineWidth = 2;
    for (const s of [0, 1]) {
      ctx.beginPath(); ctx.moveTo(r * 0.6, -r * 0.35); ctx.quadraticCurveTo(r * (0.9 + s * 0.2), -r * 0.9, r * (1.2 + s * 0.15), -r * 0.8); ctx.stroke();
    }
    eyes(ctx, r, { x: 0.65, y: -0.1, size: 0.22, color: '#2a1a2a' });
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
export class Hexfly extends Enemy {
  static id = 'hexfly';
  static label = 'Hexfly';
  static hp = 3;
  static r = 17;
  static speed = 160;
  static color = '#c46bff';
  static dropChance = 0.14;

  constructor(game, x, y, o) {
    super(game, x, y, o);
    this.state = 'drift';
    this.st = 0;
    this.cool = rand(1.5, 2.5);
    this.blinkTo = null;
    this.spawnFade = 1;
    this.castDir = { x: 1, y: 0 };
  }

  pickBlink() {
    const t = this.target;
    for (let i = 0; i < 12; i++) {
      const a = rand(0, TAU), d = rand(300, 460);
      const cx = t ? t.x : W / 2, cy = t ? t.y - 120 : H / 2;
      const p = this.freeSpot(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.6);
      if (p && (!t || !this.game.world.segment(p.x, p.y, t.x, t.y))) return p;
    }
    return null;
  }

  think(dt) {
    const t = this.target;
    this.st += dt;
    if (this.state === 'drift') {
      this.cool -= dt * this.agg;
      if (t) {
        const d = Math.hypot(t.x - this.x, t.y - this.y);
        const away = d < 260 ? -1 : d > 480 ? 1 : 0;
        this.steer(this.x + (t.x - this.x) * away * 0.5 + Math.sin(this.t) * 80, Math.min(this.y, t.y - 100) + Math.cos(this.t * 0.8) * 40, Hexfly.speed, dt, 2);
        this.facing = t.x >= this.x ? 1 : -1;
        if (this.cool <= 0 && this.entered) {
          this.blinkTo = this.pickBlink();
          if (this.blinkTo) { this.state = 'vanish'; this.st = 0; sfx.teleport(); }
          else { this.state = 'cast'; this.st = 0; }
        }
      } else this.drag(dt);
      this.move(dt);
    } else if (this.state === 'vanish') {
      // fades out; the destination rune is already drawn (the tell)
      this.drag(dt, 6);
      this.spawnFade = Math.max(0, 1 - this.st / 0.45);
      this.move(dt);
      if (this.st > 0.55) {
        this.game.fx.burst(this.x, this.y, { n: 12, speed: 260, color: '#c46bff', life: 0.3 });
        this.x = this.blinkTo.x; this.y = this.blinkTo.y; this.vx = this.vy = 0;
        this.game.fx.ring(this.x, this.y, 50, '#c46bff', 0.3, 4);
        this.state = 'appear'; this.st = 0;
      }
    } else if (this.state === 'appear') {
      this.spawnFade = Math.min(1, this.st / 0.25);
      this.drag(dt, 6);
      this.move(dt);
      if (this.st > 0.25) { this.state = 'cast'; this.st = 0; sfx.enemyCharge(); }
    } else if (this.state === 'cast') {
      this.spawnFade = 1;
      this.drag(dt, 6);
      this.move(dt);
      if (t) { const dx = t.x - this.x, dy = t.y - this.y, m = Math.hypot(dx, dy) || 1; this.castDir.x = dx / m; this.castDir.y = dy / m; this.facing = dx >= 0 ? 1 : -1; }
      if (this.st > 0.7 / Math.sqrt(this.agg)) {
        const n = this.wave >= 10 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const a = Math.atan2(this.castDir.y, this.castDir.x) + (n > 1 ? (i - 0.5) * 0.9 : 0) + rand(-0.15, 0.15);
          const sp = 250 + Math.min(80, this.wave * 4);
          this.game.addProjectile(new Orb(this.game, { x: this.x + Math.cos(a) * 24, y: this.y + Math.sin(a) * 24, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, owner: this }));
        }
        sfx.orb();
        this.state = 'drift'; this.st = 0; this.cool = rand(3.2, 4.4);
      }
    }
  }

  hurt(info) { if (this.state === 'vanish' && this.spawnFade < 0.3) return false; return super.hurt(info); }

  draw(ctx) {
    // destination rune while blinking
    if (this.state === 'vanish' && this.blinkTo) {
      const k = Math.min(1, this.st / 0.55);
      ctx.save();
      ctx.translate(this.blinkTo.x, this.blinkTo.y);
      ctx.rotate(this.t * 2);
      ctx.strokeStyle = '#c46bff';
      ctx.globalAlpha = 0.3 + 0.6 * k;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) { const a = i * TAU / 6; const rr = 30 * (0.5 + 0.5 * k); i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 16 * k, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    super.draw(ctx);
  }

  drawBody(ctx) {
    const r = this.r;
    const casting = this.state === 'cast';
    const k = casting ? Math.min(1, this.st / 0.7) : 0;
    ctx.save();
    ctx.translate(this.x, this.y);
    // orbiting runes
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const a = this.t * 2.4 + i * TAU / 3;
      ctx.fillStyle = 'rgba(200,120,255,0.8)';
      ctx.fillRect(Math.cos(a) * r * 1.6 - 3, Math.sin(a) * r * 0.9 - 3, 6, 6);
    }
    ctx.restore();
    ctx.scale(this.facing < 0 ? -1 : 1, 1);
    // dragonfly: 4 long wings, long segmented tail
    wings(ctx, r, this.t, { rate: 50, pairs: 2, len: 1.7, wid: 0.32, color: 'rgba(220,180,255,0.45)', tilt: -0.2 });
    ctx.fillStyle = '#7a3ab8';
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-r * (0.6 + i * 0.32), r * (0.1 + i * 0.05), r * (0.22 - i * 0.025), 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#9b4fe0';
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.55, r * 0.45, 0, 0, TAU); ctx.fill();
    // hooded head
    ctx.fillStyle = '#5a2a8a';
    ctx.beginPath(); ctx.arc(r * 0.5, -r * 0.12, r * 0.46, 0, TAU); ctx.fill();
    eyes(ctx, r, { x: 0.62, y: -0.15, size: 0.3, color: '#7ffff0', glow: 0.25 + k * 0.6 });
    // casting hand + forming orb
    if (casting) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gx = r * 1.2, gy = r * 0.3;
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 18 * k + 4);
      g.addColorStop(0, '#f6e6ff'); g.addColorStop(1, 'rgba(196,107,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(gx, gy, 18 * k + 4, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}

export const ENEMY_TYPES = { Stinglet, Gnatling, Buzzgunner, Bladewing, Shellback, Dropmoth, Hexfly };
