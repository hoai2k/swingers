// Void Lobber: fires a slow dark orb that opens a tiny black hole.
//  - the orb drifts forward until it hits terrain, touches a body or 0.9s
//    pass, then becomes a well for 2s that drags actors (the shooter too),
//    pickups and projectiles toward it, ripping spiders off their surfaces
//  - then it collapses with a game.explode burst
//  - plasma blades bat the orb while it's still flying; 2 shots

import { Weapon, registerWeapon } from '../weapons.js';
import { sfx } from '../audio.js';
import { TAU, rand } from '../util.js';
import { safeMuzzle, unstick } from './kit.js';

const PULL_R = 320, WELL_T = 2.0;

export class VoidOrb {
  constructor(game, { x, y, vx, vy, owner }) {
    this.game = game;
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.prevX = x; this.prevY = y;
    this.owner = owner;
    this.r = 9;
    this.state = 'fly';
    this.age = 0;
    this.t = 0;
    this.reflectable = true;
  }

  deflect(blade, dx, dy) {
    if (this.state !== 'fly') return;
    const sp = Math.hypot(this.vx, this.vy);
    this.vx = dx * sp; this.vy = dy * sp;
    this.owner = blade.owner;
    this.age = 0;
    sfx.deflect();
  }

  open() {
    this.state = 'well'; this.t = 0; this.vx = this.vy = 0;
    this.reflectable = false;
    sfx.implode();
    this.game.fx.ring(this.x, this.y, 90, '#b48cff', 0.4, 5);
  }

  update(dt) {
    const game = this.game;
    this.age += dt;
    this.prevX = this.x; this.prevY = this.y;
    if (this.state === 'fly') {
      const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
      const wall = game.world.segment(this.x, this.y, nx, ny);
      if (wall) { this.x = wall.x + wall.nx * 24; this.y = wall.y + wall.ny * 24; this.open(); return true; }
      this.x = nx; this.y = ny;
      if (game.actorsInRadius(this.x, this.y, this.r, this.age < 0.3 ? this.owner : null).length || this.age > 0.9) this.open();
      if (Math.random() < 0.5) game.fx.add({ kind: 'spark', x: this.x + rand(-8, 8), y: this.y + rand(-8, 8), vx: -this.vx * 0.3, vy: -this.vy * 0.3, color: '#9a6bff', life: 0.25, size: 2, drag: 2, g: 0 });
      return this.y < game.board.killY + 200;
    }
    // the well
    this.t += dt;
    const k = Math.min(1, this.t / 0.25);
    for (const a of game.actors()) {
      const dx = this.x - a.x, dy = this.y - a.y, d = Math.hypot(dx, dy) || 1;
      if (d > PULL_R + a.r) continue;
      const block = game.world.segment(this.x, this.y, a.x, a.y);
      if (block && block.t < d - a.r - 4) continue;
      const f = k * (1500 + 4200 * (1 - d / (PULL_R + a.r)));
      if (d < PULL_R * 0.8) unstick(a, 0.08);
      // pull, and damp sideways motion so bodies spiral in
      if (a.impulse) a.impulse(dx / d * f * dt, dy / d * f * dt, false);
      if (d < 60) { a.vx *= 1 - Math.min(1, dt * 6); a.vy *= 1 - Math.min(1, dt * 6); }
    }
    for (const p of game.pickups) {
      if (p.stuck || p.mode) continue;
      const dx = this.x - p.x, dy = this.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (d > PULL_R) continue;
      p.vx += dx / d * 3200 * dt; p.vy += dy / d * 3200 * dt - 1700 * dt * 0.7;
      p.vx *= 1 - dt * 2; p.vy *= 1 - dt * 2;
    }
    for (const q of game.projectiles) {
      if (q === this || q.vx === undefined || q.state === 'stuck' || q.state === 'well') continue;
      const dx = this.x - q.x, dy = this.y - q.y, d = Math.hypot(dx, dy) || 1;
      if (d > PULL_R) continue;
      q.vx += dx / d * 2600 * dt; q.vy += dy / d * 2600 * dt;
    }
    // in-falling dust
    for (let i = 0; i < 2; i++) {
      const a = rand(0, TAU), r = rand(80, PULL_R);
      game.fx.add({ kind: 'spark', x: this.x + Math.cos(a) * r, y: this.y + Math.sin(a) * r, vx: -Math.cos(a) * r * 2.6 - Math.sin(a) * 160, vy: -Math.sin(a) * r * 2.6 + Math.cos(a) * 160, color: i ? '#c9a8ff' : '#7a4bff', life: 0.35, size: 1.8, drag: 0, g: 0 });
    }
    sfx.warp();
    if (this.t >= WELL_T) {
      game.fx.ring(this.x, this.y, 40, '#ffffff', 0.25, 8);
      game.explode(this.x, this.y, { radius: 150, owner: this.owner, force: 1150, damage: 3, color: '#b48cff' });
      return false;
    }
    return true;
  }

  draw(ctx) {
    const x = this.x, y = this.y;
    if (this.state === 'fly') {
      drawOrb(ctx, x, y, 9, this.age);
      return;
    }
    const grow = Math.min(1, this.t / 0.25);
    const end = this.t > WELL_T - 0.3 ? 1 - (this.t - (WELL_T - 0.3)) / 0.3 * 0.6 : 1;
    const R = 26 * grow * end;
    ctx.save();
    // lensing halo
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, R * 0.8, x, y, R * 4);
    g.addColorStop(0, 'rgba(154,107,255,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, R * 4, 0, TAU); ctx.fill();
    // swirl arms
    ctx.strokeStyle = '#c9a8ff';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const a0 = this.t * 7 + i * TAU / 3;
      ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.arc(x, y, R * 1.6, a0, a0 + 1.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, R * 2.4, a0 + 0.8, a0 + 1.7); ctx.stroke();
    }
    ctx.restore();
    // the dark core
    ctx.fillStyle = '#05010c';
    ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#e6d8ff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, R + 1, 0, TAU); ctx.stroke();
  }
}

function drawOrb(ctx, x, y, r, t) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = '#9a6bff';
  ctx.globalAlpha = 0.35;
  ctx.beginPath(); ctx.arc(x, y, r * 2, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#12061f';
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#c9a8ff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, r, t * 9, t * 9 + 4); ctx.stroke();
}

export class SingularityGun extends Weapon {
  static id = 'singularity';
  static label = 'Void Lobber';
  static kind = 'special';
  static ammo = 2;
  static weight = 0.6;
  static color = '#9a6bff';

  constructor(game) {
    super(game);
    this.length = 36;
    this.turnRate = 18;
  }

  update(dt, ctl) {
    super.update(dt, ctl);
    if (ctl.firePressed && this.cool <= 0) this.fire();
  }

  fire() {
    const game = this.game;
    const m = safeMuzzle(this);
    const sp = 520;
    game.addProjectile(new VoidOrb(game, { x: m.x, y: m.y, vx: this.dirX * sp, vy: this.dirY * sp, owner: this.owner }));
    game.fx.ring(m.x, m.y, 30, '#9a6bff', 0.25, 4);
    this.recoil(260, 8);
    this.cool = 1;
    sfx.implode();
    if (--this.ammo <= 0) this.empty();
  }

  drawShape(ctx) {
    ctx.fillStyle = '#2b2f3a';
    ctx.beginPath(); ctx.roundRect(-6, -5, 18, 10, 3); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-3, 3, 7, 9, 2); ctx.fill();
    // cage around the orb
    ctx.strokeStyle = '#8a93a6'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(22, 0, 10, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(22, -10); ctx.lineTo(22, 10); ctx.stroke();
    if (this.cool <= 0.2) drawOrb(ctx, 22, 0, 6, this.time);
    ctx.fillStyle = '#5a6070';
    ctx.fillRect(30, -4, 6, 8);
  }
}

registerWeapon(SingularityGun);
