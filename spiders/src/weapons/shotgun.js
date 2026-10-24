// Scattergun: a fan of 7 short-lived plasma pellets.
//  - deadly up close, useless past ~400px (pellets burn out fast)
//  - a huge kick: fire at the floor to shotgun-jump, or mid-air to dash
//  - 4 shells, with a pump between shots

import { Weapon, registerWeapon } from '../weapons.js';
import { Bullet } from '../projectiles.js';
import { sfx } from '../audio.js';
import { rand } from '../util.js';
import { safeMuzzle } from './kit.js';

export class Shotgun extends Weapon {
  static id = 'shotgun';
  static label = 'Scattergun';
  static kind = 'gun';
  static ammo = 4;
  static weight = 1.1;
  static color = '#ff9f40';

  constructor(game) {
    super(game);
    this.length = 40;
    this.turnRate = 20;
    this.pump = 0;          // pump animation 0..1
  }

  update(dt, ctl) {
    super.update(dt, ctl);
    this.pump = Math.max(0, this.pump - dt * 2.4);
    if (ctl.firePressed && this.cool <= 0) this.fire();
  }

  fire() {
    const game = this.game;
    const m = safeMuzzle(this);
    const base = this.angle;
    for (let i = 0; i < 7; i++) {
      const a = base + (i - 3) * 0.075 + rand(-0.03, 0.03);
      const sp = rand(1700, 2150);
      game.addProjectile(new Bullet(game, {
        x: m.x, y: m.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, owner: this.owner,
        color: '#ffa040', core: '#fff1d0', life: rand(0.17, 0.23), width: 2.4, r: 3, knock: 520, cause: 'shotgun', trail: 0.025,
      }));
    }
    game.fx.glow(m.x, m.y, 50, '#ffb060', 0.1);
    game.fx.burst(m.x, m.y, { n: 10, speed: 600, color: '#ffd08a', life: 0.18, dir: base, spread: 0.7 });
    game.fx.smoke(m.x, m.y, { n: 4, size: 10, life: 0.5, speed: 90, color: 'rgba(120,110,110,0.45)' });
    game.fx.shake(5);
    this.recoil(780, 12);
    this.cool = 0.6;
    this.pump = 1;
    sfx.shotgun();
    if (--this.ammo <= 0) this.empty();
  }

  drawShape(ctx) {
    // stock
    ctx.fillStyle = '#6b4a2e';
    ctx.beginPath(); ctx.moveTo(-10, -4); ctx.lineTo(4, -4); ctx.lineTo(4, 4); ctx.lineTo(-10, 8); ctx.closePath(); ctx.fill();
    // receiver + twin barrels
    ctx.fillStyle = '#2b2f3a';
    ctx.beginPath(); ctx.roundRect(2, -6, 16, 11, 2); ctx.fill();
    ctx.fillStyle = '#3d4352';
    ctx.fillRect(16, -6, 24, 5);
    ctx.fillRect(16, -1, 24, 4);
    ctx.fillStyle = '#ff9f40';
    ctx.fillRect(37, -6, 3, 9);
    // pump slides back after a shot
    const pp = Math.sin(this.pump * Math.PI) * 6;
    ctx.fillStyle = '#8a5a34';
    ctx.beginPath(); ctx.roundRect(19 - pp, 3, 12, 5, 2); ctx.fill();
    // grip
    ctx.fillStyle = '#2b2f3a';
    ctx.beginPath(); ctx.roundRect(1, 3, 6, 9, 2); ctx.fill();
  }
}

registerWeapon(Shotgun);
