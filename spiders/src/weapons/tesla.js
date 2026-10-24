// Arc Coil: short-range chain lightning.
//  - RT zaps the nearest hurtable body within ~300px in front of you (line
//    of sight needed), then the bolt jumps to the next nearest body within
//    240px of that one, up to 3 bodies
//  - no target: it spits a short crackling arc at the nearest surface
//  - lightning ignores blades (it can't be batted back); 7 charges

import { Weapon, registerWeapon } from '../weapons.js';
import { sfx } from '../audio.js';
import { rand } from '../util.js';
import { safeMuzzle, nearestFoe, boltPoints, drawBolt, Flicker } from './kit.js';

const RANGE = 300, HOP = 240, CHAIN = 3;

function arcFx(game, x1, y1, x2, y2, color, width = 3) {
  const segs = Math.max(4, Math.round(Math.hypot(x2 - x1, y2 - y1) / 22));
  const pts = [];
  let reT = 0;
  game.addProjectile(new Flicker(0.24, (ctx, k, t) => {
    if (t >= reT) { boltPoints(x1, y1, x2, y2, segs, 16, pts); reT = t + 0.035; }
    drawBolt(ctx, pts, color, width * (0.5 + 0.5 * k), k);
  }));
}

export class Tesla extends Weapon {
  static id = 'tesla';
  static label = 'Arc Coil';
  static kind = 'gun';
  static ammo = 7;
  static weight = 1;
  static color = '#7ab8ff';

  constructor(game) {
    super(game);
    this.length = 30;
    this.idleT = 0;
  }

  update(dt, ctl) {
    super.update(dt, ctl);
    if (ctl.firePressed && this.cool <= 0) this.fire();
    // idle crackle at the tip
    this.idleT -= dt;
    if (this.idleT <= 0) {
      this.idleT = rand(0.15, 0.5);
      const m = this.muzzle();
      this.game.fx.spark(m.x, m.y, rand(-150, 150), rand(-150, 150), '#bfe0ff', 0.12, 1.2);
    }
  }

  fire() {
    const game = this.game;
    const o = this.owner;
    const m = safeMuzzle(this);
    const hit = new Set();
    let from = { x: m.x, y: m.y };
    let target = nearestFoe(game, o, m.x, m.y, RANGE, { dx: this.dirX, dy: this.dirY, cone: 0.35 });
    if (!target) {
      // fizzle arc to the nearest surface along the aim (or into the air)
      const a = this.angle + rand(-0.3, 0.3);
      const w = game.world.raycast(m.x, m.y, Math.cos(a), Math.sin(a), 170);
      const ex = w ? w.x : m.x + Math.cos(a) * rand(90, 150), ey = w ? w.y : m.y + Math.sin(a) * rand(90, 150);
      arcFx(game, m.x, m.y, ex, ey, '#7ab8ff', 2.5);
      if (w) game.fx.burst(ex, ey, { n: 6, speed: 250, color: '#bfe0ff', life: 0.2, size: 1.5 });
    }
    let n = 0;
    while (target && n < CHAIN) {
      hit.add(target);
      const tx = target.x, ty = target.y;
      arcFx(game, from.x, from.y, tx, ty, n === 0 ? '#7ab8ff' : '#a8d0ff', 3.2 - n * 0.6);
      const dx = tx - from.x, dy = ty - from.y, d = Math.hypot(dx, dy) || 1;
      if (game.damage(target, { amount: 3, from: o, cause: 'tesla', x: tx, y: ty, ix: dx / d * 380, iy: dy / d * 380 - 120 })) {
        game.fx.burst(tx, ty, { n: 14, speed: 450, color: '#bfe0ff', life: 0.3 });
        game.fx.glow(tx, ty, 50, '#7ab8ff', 0.15);
      }
      from = { x: tx, y: ty };
      n++;
      target = nearestFoe(game, o, tx, ty, HOP, { skip: hit });
    }
    game.fx.glow(m.x, m.y, 40, '#7ab8ff', 0.12);
    this.recoil(120, 4);
    this.cool = 0.38;
    sfx.crackle();
    sfx.zap();
    if (--this.ammo <= 0) this.empty();
  }

  drawShape(ctx) {
    ctx.fillStyle = '#2b2f3a';
    ctx.beginPath(); ctx.roundRect(-6, -5, 16, 10, 3); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-3, 3, 7, 9, 2); ctx.fill();
    // copper coil
    ctx.fillStyle = '#4a5060';
    ctx.fillRect(8, -2.5, 16, 5);
    ctx.fillStyle = '#d9894a';
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.roundRect(9 + i * 4, -6, 3, 12, 1.5); ctx.fill(); }
    // prongs + spark ball
    ctx.fillStyle = '#8a93a6';
    ctx.fillRect(24, -6, 5, 2);
    ctx.fillRect(24, 4, 5, 2);
    ctx.fillStyle = '#bfe0ff';
    ctx.beginPath(); ctx.arc(28, 0, 3 + Math.sin(this.time * 30) * 0.8, 0, Math.PI * 2); ctx.fill();
  }
}

registerWeapon(Tesla);
