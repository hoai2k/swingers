// Rocket Tube: a slow-starting rocket that accelerates, trailing smoke.
//  - explodes on contact with terrain or a body (game.explode: hurts
//    everyone in the blast, the shooter too)
//  - rocket jumping: a rocket that hits terrain in its first ~0.09s (fired
//    at a wall/floor you're touching) has not armed yet and only goes off as
//    a harmless concussion pop that flings everyone near it
//  - plasma blades bat rockets back; 3 rockets, slow reload

import { Weapon, registerWeapon } from '../weapons.js';
import { sfx } from '../audio.js';
import { sprite, drawSprite, preloadSprites } from '../sprites.js';
import { rand } from '../util.js';
import { safeMuzzle, shove } from './kit.js';

preloadSprites(['proj_rocket.png']);

const ARM = 0.09;

export class Rocket {
  constructor(game, { x, y, dx, dy, owner }) {
    this.game = game;
    this.x = x; this.y = y; this.prevX = x; this.prevY = y;
    this.speed = 520;
    this.vx = dx * this.speed; this.vy = dy * this.speed;
    this.owner = owner;
    this.r = 6;
    this.age = 0;
    this.reflectable = true;
    this.smokeT = 0;
  }

  deflect(blade, dx, dy) {
    this.speed = Math.max(this.speed, 900);
    this.vx = dx * this.speed; this.vy = dy * this.speed;
    this.owner = blade.owner;
    this.age = Math.max(this.age, ARM);
    sfx.deflect();
    this.game.fx.burst(this.x, this.y, { n: 10, speed: 400, color: '#ffb060', life: 0.25 });
  }

  update(dt) {
    const game = this.game;
    this.age += dt;
    if (this.age > 4) return this.detonate(this.x, this.y, true);
    this.speed = Math.min(1500, this.speed + 2600 * dt);
    const m = Math.hypot(this.vx, this.vy) || 1;
    this.vx = this.vx / m * this.speed; this.vy = this.vy / m * this.speed;
    this.prevX = this.x; this.prevY = this.y;
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    const exclude = this.age < 0.25 ? this.owner : null;
    const hits = game.actorsOnSegment(this.x, this.y, nx, ny, this.r, exclude);
    const wall = game.world.segment(this.x, this.y, nx, ny);
    const len = Math.hypot(nx - this.x, ny - this.y) || 1;
    if (hits.length && (!wall || hits[0].t * len <= wall.t)) {
      const t = hits[0].t;
      return this.detonate(this.x + (nx - this.x) * t, this.y + (ny - this.y) * t, true);
    }
    if (wall) return this.detonate(wall.x + wall.nx * 4, wall.y + wall.ny * 4, this.age >= ARM);
    this.x = nx; this.y = ny;
    // smoke trail + flame
    this.smokeT -= dt;
    if (this.smokeT <= 0) {
      this.smokeT = 0.018;
      const bx = this.x - this.vx / this.speed * 10, by = this.y - this.vy / this.speed * 10;
      game.fx.add({ kind: 'smoke', x: bx, y: by, vx: rand(-20, 20), vy: rand(-20, 20), color: 'rgba(150,150,160,0.45)', size: rand(5, 8), life: rand(0.5, 0.8), drag: 2, g: -30 });
      game.fx.spark(bx, by, -this.vx * 0.2 + rand(-60, 60), -this.vy * 0.2 + rand(-60, 60), '#ffb347', 0.12, 2.5);
    }
    return !(this.x < -300 || this.x > game.world.bounds.w + 300 || this.y < -700 || this.y > game.world.bounds.h + 300);
  }

  detonate(x, y, armed) {
    const game = this.game;
    if (armed) {
      game.explode(x, y, { radius: 135, owner: this.owner, force: 1050, damage: 3 });
    } else {
      // concussion pop: knockback only (rocket jumps)
      game.fx.explosion(x, y, 55, '#ffcf7a');
      shove(game, x, y, 140, 1250);
      sfx.boom(0.5);
    }
    return false;
  }

  draw(ctx) {
    const a = Math.atan2(this.vy, this.vx);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(a);
    // flame
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffb347';
    ctx.globalAlpha = 0.85;
    const fl = 10 + Math.random() * 8;
    const art = sprite('proj_rocket.png');
    const tail = art ? -13 : -8;
    ctx.beginPath(); ctx.moveTo(tail, -3.5); ctx.lineTo(tail - fl, 0); ctx.lineTo(tail, 3.5); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // body: the delivered sprite (never upside down), else drawn
    if (art) { drawSprite(ctx, 'proj_rocket.png', 0, 0, 28, { fit: 'w', flipY: Math.cos(a) < 0 }); ctx.restore(); return; }
    ctx.fillStyle = '#d9dde6';
    ctx.beginPath(); ctx.roundRect(-9, -4, 15, 8, 2); ctx.fill();
    ctx.fillStyle = '#ff5a3a';
    ctx.beginPath(); ctx.moveTo(6, -4); ctx.lineTo(12, 0); ctx.lineTo(6, 4); ctx.fill();
    ctx.fillStyle = '#6c7280';
    ctx.beginPath(); ctx.moveTo(-9, -4); ctx.lineTo(-12, -8); ctx.lineTo(-5, -4); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-9, 4); ctx.lineTo(-12, 8); ctx.lineTo(-5, 4); ctx.fill();
    ctx.restore();
  }
}

export class RocketLauncher extends Weapon {
  static id = 'rocket';
  static label = 'Rocket Tube';
  static kind = 'gun';
  static ammo = 3;
  static weight = 0.41;   // guns are rarer than blades
  static color = '#ff7a2a';
  static art = { hx: 55, hy: 44, s: 0.25 };   // wpn_rocket.png: grip pixel, units per pixel

  constructor(game) {
    super(game);
    this.length = 44;
    this.turnRate = 16;
  }

  update(dt, ctl) {
    super.update(dt, ctl);
    if (ctl.firePressed && this.cool <= 0) this.fire();
  }

  fire() {
    const game = this.game;
    const m = safeMuzzle(this, this.length - 6);
    game.addProjectile(new Rocket(game, { x: m.x, y: m.y, dx: this.dirX, dy: this.dirY, owner: this.owner }));
    // back-blast out of the rear of the tube
    const back = this.along(-10);
    game.fx.smoke(back.x, back.y, { n: 6, size: 10, life: 0.7, speed: 140, color: 'rgba(160,160,170,0.5)' });
    game.fx.burst(back.x, back.y, { n: 8, speed: 400, color: '#ffb347', life: 0.2, dir: this.angle + Math.PI, spread: 0.8 });
    game.fx.glow(m.x, m.y, 40, '#ff9a4a', 0.1);
    game.fx.shake(4);
    this.recoil(320, 10);
    this.cool = 0.85;
    sfx.rocket();
    if (--this.ammo <= 0) this.empty();
  }

  drawShape(ctx) {
    // tube resting on the shoulder
    ctx.fillStyle = '#4f5a3e';
    ctx.beginPath(); ctx.roundRect(-14, -7, 58, 13, 4); ctx.fill();
    ctx.fillStyle = '#3a4330';
    ctx.fillRect(-14, -7, 5, 13);
    ctx.fillRect(38, -8, 6, 15);
    ctx.fillStyle = '#ff7a2a';
    ctx.fillRect(10, -7, 4, 13);
    // loaded warhead peeking out
    if (this.cool <= 0.2) {
      ctx.fillStyle = '#ff5a3a';
      ctx.beginPath(); ctx.moveTo(44, -4); ctx.lineTo(50, 0); ctx.lineTo(44, 4); ctx.fill();
    }
    // grip + sight
    ctx.fillStyle = '#2b2f3a';
    ctx.beginPath(); ctx.roundRect(-2, 4, 7, 10, 2); ctx.fill();
    ctx.fillRect(18, -12, 8, 5);
  }
}

registerWeapon(RocketLauncher);
