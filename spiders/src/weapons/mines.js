// Stick Mines: RT lobs a sticky mine along the aim.
//  - it clings to the first thing it touches: terrain (riding moving
//    platforms) or a body (good luck)
//  - arms after 0.7s (blinking light); once armed, any actor the thrower
//    may hurt coming close trips it: a short beep, then game.explode.
//    The thrower doesn't trip their own mines but is hurt by the blast.
//  - a plasma blade touching a mine sets it off; flying mines get batted
//  - 3 per pickup; a mine that never trips fizzles after 30s

import { Weapon, registerWeapon } from '../weapons.js';
import { sfx } from '../audio.js';
import { drawSprite, preloadSprites } from '../sprites.js';
import { TAU } from '../util.js';
import { safeMuzzle, bladeNear } from './kit.js';

preloadSprites(['proj_mine_strip.png']);

const ARM = 0.7, TRIP = 70, LIFE = 30;

export class Mine {
  constructor(game, { x, y, vx, vy, owner }) {
    this.game = game;
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.prevX = x; this.prevY = y;
    this.owner = owner;
    this.r = 6;
    this.state = 'fly';       // fly | stuck | trip
    this.t = 0;               // time since stuck
    this.age = 0;
    this.solid = null; this.lx = 0; this.ly = 0; this.la = 0;
    this.host = null; this.hx = 0; this.hy = 0;
    this.na = -Math.PI / 2;   // angle of the surface normal (drawing)
    this.reflectable = true;
  }

  get armed() { return this.state !== 'fly' && this.t >= ARM; }

  deflect(blade, dx, dy) {
    if (this.state !== 'fly') return;
    const sp = Math.max(800, Math.hypot(this.vx, this.vy));
    this.vx = dx * sp; this.vy = dy * sp;
    this.owner = blade.owner;
    sfx.deflect();
  }

  update(dt) {
    const game = this.game;
    this.age += dt;
    this.prevX = this.x; this.prevY = this.y;
    if (this.state === 'fly') {
      this.reflectable = true;
      this.vy += 1500 * dt;
      const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
      const hits = game.actorsOnSegment(this.x, this.y, nx, ny, this.r, this.age < 0.2 ? this.owner : null);
      const wall = game.world.segment(this.x, this.y, nx, ny);
      const len = Math.hypot(nx - this.x, ny - this.y) || 1;
      if (hits.length && (!wall || hits[0].t * len <= wall.t)) {
        const a = hits[0].actor;
        const t = hits[0].t;
        const px = this.x + (nx - this.x) * t, py = this.y + (ny - this.y) * t;
        const dx = px - a.x, dy = py - a.y, m = Math.hypot(dx, dy) || 1;
        this.host = a; this.hx = dx / m * a.r; this.hy = dy / m * a.r;
        this.na = Math.atan2(dy, dx);
        this.stick();
        return true;
      }
      if (wall) {
        if (wall.solid.mat === 'lava') { game.fx.burst(wall.x, wall.y, { n: 6, color: '#ff8a3a' }); return false; }
        this.x = wall.x + wall.nx * 3; this.y = wall.y + wall.ny * 3;
        this.solid = wall.solid;
        const l = wall.solid.inv({ x: this.x, y: this.y }); this.lx = l.x; this.ly = l.y;
        this.na = Math.atan2(wall.ny, wall.nx); this.la = this.na - wall.solid.a;
        this.stick();
        return true;
      }
      this.x = nx; this.y = ny;
      return this.y < game.board.killY + 200;
    }
    this.reflectable = false;
    // follow whatever it's stuck to
    if (this.host) {
      if (!this.host.alive) { this.host = null; this.state = 'fly'; this.vx = 0; this.vy = -100; return true; }
      this.x = this.host.x + this.hx; this.y = this.host.y + this.hy;
    } else if (this.solid) {
      if (this.solid.broken) { this.solid = null; this.state = 'fly'; this.vx = 0; this.vy = 0; return true; }
      if (this.solid.dynamic) { const w = this.solid.tx({ x: this.lx, y: this.ly }); this.x = w.x; this.y = w.y; this.na = this.la + this.solid.a; }
    }
    this.t += dt;
    if (this.t > LIFE) { sfx.fizzle(); game.fx.smoke(this.x, this.y, { n: 4, size: 6 }); return false; }
    // blades set it off
    const b = bladeNear(game, this.x, this.y, this.r + 4);
    if (b) return this.boom(b.owner || this.owner);
    if (this.state === 'trip') {
      this.tripT -= dt;
      if (this.tripT <= 0) return this.boom(this.owner);
      return true;
    }
    if (this.armed) {
      if (this.t - dt < ARM) { sfx.beep(); game.fx.ring(this.x, this.y, TRIP, 'rgba(255,74,106,0.35)', 0.35, 2); }
      for (const a of game.actors()) {
        if (a === this.owner || !game.canHurt(this.owner, a)) continue;
        if (Math.hypot(a.x - this.x, a.y - this.y) < TRIP + a.r || a === this.host) {
          this.state = 'trip'; this.tripT = 0.16;
          sfx.beep(); sfx.tick(1);
          break;
        }
      }
    }
    return true;
  }

  stick() {
    this.state = 'stuck'; this.t = 0; this.vx = this.vy = 0;
    sfx.stick();
    this.game.fx.burst(this.x, this.y, { n: 4, speed: 120, color: '#ffb0c0', life: 0.2, size: 1.5 });
  }

  boom(owner) {
    this.game.explode(this.x, this.y, { radius: 115, owner, force: 950, damage: 3 });
    return false;
  }

  draw(ctx) {
    drawMine(ctx, this.x, this.y, this.state === 'fly' ? this.age * 12 : this.na + Math.PI / 2, this.state === 'fly' ? -1 : this.t, this.state === 'trip');
  }
}

function drawMine(ctx, x, y, rot, t, trip) {
  const armed = t >= ARM;
  const on = trip || (t >= 0 && (armed ? Math.sin(t * 9) > 0.3 : Math.sin(t * 30) > 0));
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  // the delivered strip: light off / on, sitting on its base (toward +y)
  if (drawSprite(ctx, 'proj_mine_strip.png', 0, 0, 19, { frame: on ? 1 : 0, of: 2, anchor: [0.5, 0.62] })) {
    if (on) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#ff4a6a';
      ctx.globalAlpha = trip ? 0.7 : 0.3;
      ctx.beginPath(); ctx.arc(0, -3, trip ? 14 : 7, 0, TAU); ctx.fill();
    }
    ctx.restore();
    return;
  }
  // flat puck with a dome, sitting on its base (base toward +y = the surface)
  ctx.fillStyle = '#3a3f4c';
  ctx.beginPath(); ctx.roundRect(-8, -1, 16, 5, 2); ctx.fill();
  ctx.fillStyle = '#5a6070';
  ctx.beginPath(); ctx.arc(0, -1, 5.5, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(-7, 2, 3, 2); ctx.fillRect(4, 2, 3, 2);
  // light: dim while arming, blinking once armed, solid when tripped
  ctx.fillStyle = on ? '#ff4a6a' : '#6a2030';
  ctx.beginPath(); ctx.arc(0, -3, 2.2, 0, TAU); ctx.fill();
  if (on) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = trip ? 0.7 : 0.35;
    ctx.beginPath(); ctx.arc(0, -3, trip ? 14 : 8, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

export class Mines extends Weapon {
  static id = 'mines';
  static label = 'Stick Mines';
  static kind = 'throwable';
  static ammo = 3;
  static weight = 0.41;   // guns are rarer than blades
  static color = '#ff4a6a';
  static art = { hx: 48, hy: 33, s: 0.25 };   // wpn_mines.png: grip pixel, units per pixel

  constructor(game) {
    super(game);
    this.length = 20;
    this.holdDist = 18;
  }

  update(dt, ctl) {
    super.update(dt, ctl);
    if (ctl.firePressed && this.cool <= 0) this.toss(ctl);
  }

  toss(ctl) {
    const game = this.game;
    const o = this.owner;
    const m = safeMuzzle(this, 12);
    const sp = 820;
    game.addProjectile(new Mine(game, { x: m.x, y: m.y, vx: this.dirX * sp + o.vx * 0.3, vy: this.dirY * sp + o.vy * 0.3 - 80, owner: o }));
    this.cool = 0.35;
    this.kick = 6;
    sfx.throwIt();
    if (--this.ammo <= 0) this.empty();
  }

  // the held sprite: carried flat, feet down, just past the leg tip
  drawArt(ctx) {
    ctx.save();
    ctx.translate(10, 0);
    const ok = super.drawArt(ctx);
    ctx.restore();
    return ok;
  }

  drawArtOver(ctx) {
    for (let i = 1; i < Math.min(3, this.ammo); i++) drawSprite(ctx, 'wpn_mines.png', -4 - i * 9, 5, 11);
  }

  drawShape(ctx) {
    drawMine(ctx, 9, 0, Math.PI / 2, -1, false);
    for (let i = 1; i < Math.min(3, this.ammo); i++) {
      ctx.fillStyle = '#3a3f4c';
      ctx.beginPath(); ctx.roundRect(-6 - i * 6, 2, 5, 9, 2); ctx.fill();
    }
  }

  drawPickup(ctx) {
    ctx.translate(this.length * 0.4, 0);
    for (let i = 0; i < Math.max(1, this.ammo); i++) drawMine(ctx, (i - 1) * 14, 2, 0, -1, false);
  }
}

registerWeapon(Mines);
