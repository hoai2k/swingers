// Laser Pistol: quick semi-auto bolts that ricochet once. The baseline gun.

import { Weapon, registerWeapon } from '../weapons.js';
import { Bullet } from '../projectiles.js';
import { sfx } from '../audio.js';

export class Pistol extends Weapon {
  static id = 'pistol';
  static label = 'Laser Pistol';
  static kind = 'gun';
  static ammo = 12;
  static weight = 0.54;   // guns are rarer than blades
  static color = '#ff5a5a';

  constructor(game) {
    super(game);
    this.length = 30;
  }

  update(dt, ctl) {
    super.update(dt, ctl);
    if (ctl.firePressed && this.cool <= 0) this.fire();
  }

  fire() {
    const m = this.muzzle();
    const sp = 2300;
    this.game.addProjectile(new Bullet(this.game, {
      x: m.x, y: m.y, vx: this.dirX * sp, vy: this.dirY * sp, owner: this.owner,
      color: '#ff4a4a', core: '#ffe0e0', bounces: 1, width: 3,
    }));
    this.game.fx.glow(m.x, m.y, 26, '#ff6a6a', 0.08);
    this.recoil(140, 5);
    this.cool = 0.16;
    sfx.pew(1);
    if (--this.ammo <= 0) this.empty();
  }

  drawShape(ctx) {
    ctx.fillStyle = '#2b2f3a';
    ctx.beginPath(); ctx.roundRect(-4, -5, 28, 9, 3); ctx.fill();
    ctx.fillStyle = '#c63b3b';
    ctx.fillRect(4, -3, 18, 3);
    ctx.fillStyle = '#2b2f3a';
    ctx.beginPath(); ctx.roundRect(-3, 2, 8, 11, 2); ctx.fill();
    ctx.fillStyle = '#ff8a8a';
    ctx.fillRect(24, -3, 5, 5);
  }
}

registerWeapon(Pistol);
