// The Brood Tyrant: a hive-queen boss for every 5th wave.
//  Phase 1 (hp > 2/3): drifts over the arena, fires fans of stinger bolts,
//                      calls in Gnatlings.
//  Phase 2 (hp > 1/3): adds a telegraphed charge across the arena; it
//                      smacks into walls and is dazed (an opening).
//  Phase 3:            enraged (red), faster, and fires rings of slow orbs
//                      with gaps; calls in Stinglets.
// Each phase change: a roar, a shockwave that shoves spiders (no damage)
// and a moment of invulnerability. Contact only hurts while charging.

import { Enemy, wings, eyes, abdomen, legs, antennae } from './base.js';
import { Bolt, Orb } from './shots.js';
import { Gnatling, Stinglet } from './insects.js';
import { sfx } from '../audio.js';
import { W, H } from '../board.js';
import { rand, TAU, clamp, angDiff } from '../util.js';

export class BroodTyrant extends Enemy {
  static id = 'tyrant';
  static label = 'Brood Tyrant';
  static hp = 40;
  static r = 46;            // x ENEMY_SCALE in game
  static speed = 170;
  static color = '#ffb020';
  static dropChance = 0;
  static mass = 6;

  constructor(game, x, y, o = {}) {
    super(game, x, y, o);
    const n = Math.max(1, o.players || 1);
    const tier = Math.max(1, Math.floor((o.wave || 5) / 5));
    this.maxHp = this.hp = Math.round((36 + 14 * (n - 1)) * (1 + 0.35 * (tier - 1)));
    this.tier = tier;
    this.isBoss = true;
    this.phase = 1;
    this.state = 'enter';
    this.st = 0;
    this.cool = 2;
    this.next = 'volley';
    this.way = { x: W / 2, y: 260 };
    this.charge = { x: 0, y: 0 };
    this.aimDir = { x: 0, y: 1 };
    this.summonCool = 6;
  }

  get rage() { return this.phase === 3 ? 1.35 : this.phase === 2 ? 1.15 : 1; }

  // a free waypoint it can fly straight to (a fat ray: centre and both flanks)
  clearPath(x, y) {
    const world = this.game.world;
    const dx = x - this.x, dy = y - this.y, m = Math.hypot(dx, dy) || 1;
    const px = -dy / m * this.r * 0.8, py = dx / m * this.r * 0.8;
    return !world.segment(this.x, this.y, x, y) && !world.segment(this.x + px, this.y + py, x + px, y + py) && !world.segment(this.x - px, this.y - py, x - px, y - py);
  }

  // where to fly in: a roomy spot below its spawn with a clear drop from above
  entrySpot() {
    let best = null, bd = Infinity;
    for (let i = 0; i < 40; i++) {
      const x = rand(300, W - 300), y = rand(220, 480);
      if (!this.freeSpot(x, y, this.r + 30)) continue;
      const world = this.game.world;
      if (world.segment(x, -100, x, y) || world.segment(x - this.r, -100, x - this.r, y) || world.segment(x + this.r, -100, x + this.r, y)) continue;
      const d = Math.abs(x - this.x) + Math.abs(y - 300);
      if (d < bd) { bd = d; best = { x, y }; }
    }
    return best || { x: W / 2, y: 260 };
  }

  newWay() {
    let fallback = null;
    for (let i = 0; i < 24; i++) {
      const p = this.freeSpot(rand(260, W - 260), rand(130, 520), this.r + 30);
      if (!p) continue;
      if (this.clearPath(p.x, p.y)) { this.way = p; return; }
      fallback = fallback || p;
    }
    this.way = fallback || { x: W / 2, y: 200 };
  }

  onHurt() {
    const k = this.hp / this.maxHp;
    const want = k > 2 / 3 ? 1 : k > 1 / 3 ? 2 : 3;
    if (want > this.phase && this.hp > 0) {
      this.phase = want;
      this.state = 'roar'; this.st = 0;
      this.invuln = 1.1;
      sfx.bossRoar();
      this.game.fx.ring(this.x, this.y, 340, '#ffdd88', 0.5, 12);
      this.game.fx.shake(14);
      this.game.fx.flash('#ffcc66', 0.25);
      for (const s of this.game.spiders) {
        if (!s.alive) continue;
        const dx = s.x - this.x, dy = s.y - this.y, d = Math.hypot(dx, dy) || 1;
        if (d < 360) s.impulse(dx / d * 900, dy / d * 900 - 200, true);
      }
    }
  }

  think(dt) {
    const t = this.target;
    this.st += dt;
    this.shoveSpiders(300);
    if (t) this.facing = t.x >= this.x ? 1 : -1;
    switch (this.state) {
      case 'enter':
        if (!this.entry) this.entry = this.entryTarget || this.entrySpot();
        this.steer(this.entry.x, this.entry.y, 300, dt, 3);
        this.move(dt, { keepIn: false });
        if (this.entered || this.st > 5 || Math.hypot(this.entry.x - this.x, this.entry.y - this.y) < 70) { this.entered = true; this.state = 'drift'; this.st = 0; this.newWay(); sfx.bossRoar(); }
        return;
      case 'roar':
        this.drag(dt, 6);
        this.move(dt);
        if (this.st > 1.1) { this.state = 'drift'; this.st = 0; this.cool = 0.6; }
        return;
      case 'drift': {
        this.cool -= dt * this.rage;
        this.summonCool -= dt * this.rage;
        if (Math.hypot(this.way.x - this.x, this.way.y - this.y) < 60 || this.st > 4) { this.newWay(); this.st = 0; }
        this.steer(this.way.x, this.way.y + Math.sin(this.t * 1.5) * 40, BroodTyrant.speed * this.rage, dt, 1.6);
        this.move(dt);
        if (this.summonCool <= 0) { this.summon(); this.summonCool = rand(9, 12); }
        if (this.cool <= 0 && t) {
          const opts = ['volley'];
          if (this.phase >= 2) opts.push('chargeUp', 'chargeUp');
          if (this.phase >= 3) opts.push('nova', 'nova');
          const pickNext = opts[Math.floor(Math.random() * opts.length)];
          this.state = pickNext === 'volley' ? 'aim' : pickNext; this.st = 0;
          if (this.state === 'aim' || this.state === 'nova') sfx.enemyCharge();
          if (this.state === 'chargeUp') sfx.bossRoar();
        }
        return;
      }
      case 'aim': {
        this.drag(dt, 4);
        this.move(dt);
        const T = 0.9 / this.rage;
        if (t && this.st < T - 0.25) { const a = this.aimAt(t, 760, { lead: 0.4, spread: 0 }); this.aimDir.x = a.x; this.aimDir.y = a.y; }
        if (this.st >= T) {
          const n = this.phase >= 2 ? 7 : 5;
          const base = Math.atan2(this.aimDir.y, this.aimDir.x);
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * 0.17 + rand(-0.03, 0.03);
            const sp = 720 + this.tier * 40;
            this.game.addProjectile(new Bolt(this.game, { x: this.x + Math.cos(a) * this.r, y: this.y + Math.sin(a) * this.r, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, owner: this, color: '#ffb020' }));
          }
          sfx.enemyShoot(); sfx.bang(0.8);
          this.state = 'drift'; this.st = 0; this.cool = rand(1.8, 2.6);
        }
        return;
      }
      case 'chargeUp': {
        this.drag(dt, 5);
        this.move(dt);
        if (t && this.st < 0.7) { const a = this.aimAt(t, 1100, { lead: 0.25, spread: 0.04 }); this.charge.x = a.x; this.charge.y = a.y; }
        if (this.st > 1.0 / this.rage) { this.state = 'charge'; this.st = 0; sfx.throwIt(); }
        return;
      }
      case 'charge': {
        const sp = 1050 * this.rage;
        this.vx = this.charge.x * sp; this.vy = this.charge.y * sp;
        this.move(dt, { avoid: false, bounce: 0.2 });
        this.touchSpiders({ amount: 3 });
        if (Math.random() < dt * 40) this.game.fx.add({ kind: 'smoke', x: this.x, y: this.y, vx: 0, vy: 0, color: 'rgba(255,190,90,0.3)', size: 30, life: 0.3 });
        const hitWall = this.contacts && this.contacts.length;
        const edge = this.x < this.r + 10 || this.x > W - this.r - 10 || this.y < this.r + 10 || this.y > H - this.r - 10;
        if (hitWall || edge || this.st > 1.2) {
          this.game.fx.shake(12); sfx.boom(0.6);
          this.game.fx.burst(this.x, this.y, { n: 24, speed: 500, color: '#ffe0a0', life: 0.4 });
          this.vx *= -0.3; this.vy *= -0.3;
          this.state = 'dazed'; this.st = 0;
        }
        return;
      }
      case 'dazed':
        this.drag(dt, 3);
        this.move(dt);
        if (this.st > 1.4) { this.state = 'drift'; this.st = 0; this.cool = rand(1.5, 2.2); this.newWay(); }
        return;
      case 'nova': {
        this.drag(dt, 5);
        this.move(dt);
        if (this.st > 0.8) {
          const n = 14, gap = rand(0, TAU);
          for (let i = 0; i < n; i++) {
            const a = gap + (i / n) * TAU;
            if (i === 0 || i === 1 || i === 7 || i === 8) continue;   // two gaps to slip through
            this.game.addProjectile(new Orb(this.game, { x: this.x + Math.cos(a) * this.r, y: this.y + Math.sin(a) * this.r, vx: Math.cos(a) * 280, vy: Math.sin(a) * 280, owner: this, homing: false, life: 4 }));
          }
          sfx.orb();
          this.state = 'drift'; this.st = 0; this.cool = rand(2.0, 2.8);
        }
        return;
      }
    }
  }

  summon() {
    const game = this.game;
    const n = this.phase >= 3 ? 2 : 3;
    sfx.bossRoar();
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const C = this.phase >= 3 ? Stinglet : Gnatling;
      const e = new C(game, this.x + Math.cos(a) * this.r, this.y + Math.sin(a) * this.r, { wave: this.wave });
      e.entered = true;
      e.vx = Math.cos(a) * 300; e.vy = Math.sin(a) * 300;
      game.addEnemy(e);
      game.fx.burst(e.x, e.y, { n: 8, speed: 200, color: '#ffb020', life: 0.3 });
    }
    if (game.scene && game.scene.onSummon) game.scene.onSummon(n);
  }

  die(info) {
    if (!this.alive) return;
    const game = this.game;
    super.die(info);
    game.fx.explosion(this.x, this.y, 200, '#ffb020');
    sfx.boom(1.6);
    for (const s of game.spiders) {
      if (!s.alive) continue;
      const dx = s.x - this.x, dy = s.y - this.y, d = Math.hypot(dx, dy) || 1;
      if (d < 320) s.impulse(dx / d * 700, dy / d * 700 - 200, true);
    }
    game.fx.splat(this.x, this.y, '#ffb020', 40, 900);
    game.slowmo(0.3, 1.2);
    game.hitStop(0.12);
    // the hive's hoard
    for (let i = 0; i < 2; i++) {
      const w = game.createWeapon(i === 0 ? 'saber' : 'pistol');
      if (w) { const p = game.spawnPickup(w, this.x, this.y, rand(-300, 300), -600); p.spawnGlow = 1; }
    }
  }

  draw(ctx) {
    const r = this.r;
    // telegraphs
    if (this.state === 'aim') {
      const T = 0.9 / this.rage, k = Math.min(1, this.st / T);
      const n = this.phase >= 2 ? 7 : 5;
      const base = Math.atan2(this.aimDir.y, this.aimDir.x);
      ctx.save();
      ctx.strokeStyle = '#ffb020';
      ctx.globalAlpha = 0.15 + 0.5 * k;
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 10]);
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.17;
        ctx.beginPath(); ctx.moveTo(this.x + Math.cos(a) * r, this.y + Math.sin(a) * r); ctx.lineTo(this.x + Math.cos(a) * 420, this.y + Math.sin(a) * 420); ctx.stroke();
      }
      ctx.restore();
    }
    if (this.state === 'chargeUp') {
      const k = Math.min(1, this.st / (1.0 / this.rage));
      ctx.save();
      ctx.strokeStyle = '#ff4030';
      ctx.globalAlpha = 0.2 + 0.5 * k;
      ctx.lineWidth = r * 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + this.charge.x * 1400, this.y + this.charge.y * 1400); ctx.stroke();
      ctx.globalAlpha = 0.6 + 0.4 * k;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffd0c0';
      ctx.setLineDash([20, 14]);
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + this.charge.x * 1400, this.y + this.charge.y * 1400); ctx.stroke();
      ctx.restore();
    }
    if (this.state === 'nova') {
      const k = Math.min(1, this.st / 0.8);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#c46bff'; ctx.globalAlpha = k; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(this.x, this.y, r + 30 * (1 - k) + 6, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    super.draw(ctx);
  }

  drawBody(ctx) {
    const r = this.r;
    const enraged = this.phase === 3;
    const dazed = this.state === 'dazed';
    const shake = this.state === 'roar' || this.state === 'chargeUp' ? rand(-3, 3) : 0;
    ctx.save();
    ctx.translate(this.x + shake, this.y);
    ctx.scale(this.facing < 0 ? -1 : 1, 1);
    if (this.invuln > 0) ctx.globalAlpha *= 0.6 + 0.4 * Math.sin(this.t * 40);
    wings(ctx, r, this.t, { rate: 26, pairs: 2, len: 1.5, wid: 0.5, y: -0.6, color: enraged ? 'rgba(255,170,150,0.5)' : 'rgba(255,230,190,0.45)' });
    abdomen(ctx, r, { x: -0.95, y: 0.3, len: 1.05, wid: 0.7, base: enraged ? '#ff5030' : '#ffb020', stripe: '#3a0a10', stripes: 4, stinger: '#1a0508', tilt: 0.35 });
    legs(ctx, r, this.t, { color: '#3a0a10', n: 3, len: 0.75 });
    // armored thorax
    const g = ctx.createRadialGradient(-r * 0.15, -r * 0.2, r * 0.1, 0, 0, r * 0.75);
    g.addColorStop(0, enraged ? '#a02020' : '#8a2a3a'); g.addColorStop(1, '#3a0a18');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.7, 0, TAU); ctx.fill();
    // head + crown
    ctx.fillStyle = '#5a0e1e';
    ctx.beginPath(); ctx.arc(r * 0.6, -r * 0.1, r * 0.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd040';
    ctx.beginPath();
    ctx.moveTo(r * 0.25, -r * 0.5);
    for (let i = 0; i < 5; i++) { const x = r * (0.3 + i * 0.15); ctx.lineTo(x, -r * (0.9 + (i % 2 ? 0 : 0.18))); ctx.lineTo(x + r * 0.075, -r * 0.55); }
    ctx.lineTo(r * 1.0, -r * 0.5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#a07010'; ctx.lineWidth = 2; ctx.stroke();
    antennae(ctx, r, this.t, { color: '#3a0a10', x: 0.85, y: -0.45, len: 0.5 });
    // mandibles
    ctx.fillStyle = '#2a0508';
    const mo = Math.sin(this.t * 8) * 0.08 + (this.state === 'roar' ? 0.25 : 0);
    ctx.beginPath(); ctx.moveTo(r * 0.95, r * 0.1); ctx.lineTo(r * 1.25, r * (0.05 - mo)); ctx.lineTo(r * 1.0, r * 0.22); ctx.fill();
    ctx.beginPath(); ctx.moveTo(r * 0.95, r * 0.2); ctx.lineTo(r * 1.25, r * (0.35 + mo)); ctx.lineTo(r * 0.95, r * 0.32); ctx.fill();
    eyes(ctx, r, { x: 0.72, y: -0.18, size: 0.17, color: dazed ? '#8899aa' : enraged ? '#ff2020' : '#ffe14d', glow: this.state === 'aim' || this.state === 'chargeUp' ? 0.8 : 0.2, n: 2 });
    ctx.restore();
    if (dazed) {
      for (let i = 0; i < 4; i++) {
        const a = this.t * 5 + i * TAU / 4;
        ctx.fillStyle = '#fff6a0';
        ctx.beginPath(); ctx.arc(this.x + Math.cos(a) * r * 0.9, this.y - r - 10 + Math.sin(a) * 8, 5, 0, TAU); ctx.fill();
      }
    }
  }
}
