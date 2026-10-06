// Guns: pickups you grab with a hand (trigger) and fire with that hand's
// bumper (LB = left hand, RB = right hand). The art is the Rounders arsenal
// (assets/guns/, imported by tools/import_rounders.mjs) — every gun plays
// the same, only the look differs.
//
//  - Held, a gun is locked to the forearm AT WHATEVER ANGLE IT WAS GRABBED:
//    its grip sits in the palm and it turns with the wiggly arm. Aiming is
//    deliberately awkward — you point the arm, and the gun points wherever
//    it ended up in your hand. Let go of the trigger to drop (or throw) it.
//  - Every shot kicks the shooter back hard along the barrel. That's a
//    movement tool: shoot down to hop, shoot behind you to rocket across a
//    gap.
//  - A bullet that hits another robot doesn't hurt it. It knocks it back a
//    lot and shakes loose every grip it had (falling off something is what
//    kills). Bullets pop balloons and stop on solids.

import { ROUNDERS_GUNS } from './characters-data.js';
import { CAT } from './player.js';
import { sfx } from './audio.js';
import { TAU } from './util.js';

const M = window.Matter;

export const GUN = {
  reach: 52,          // grip -> muzzle length in world px (all guns alike)
  cooldown: 0.42,     // seconds between shots
  kick: 9.5,          // shooter recoil, px/tick added along -barrel
  hitPush: 15,        // knockback on a robot that's hit, px/tick
  hitLift: 4,         // ...plus a little upward pop
  bulletSpeed: 1500,  // px/s
  bulletLife: 0.9,    // s
  pickup: 30,         // how close a closed hand must be to grab a gun
};

export const GUN_IDS = ROUNDERS_GUNS.map((g) => g.id);

const SPRITES = new Map(ROUNDERS_GUNS.map((g) => {
  const img = new Image();
  img.src = `assets/guns/${g.id}.png`;
  return [g.id, { def: g, img }];
}));
const FX = {};
for (const f of ['muzzle-flash', 'shockwave-ring']) {
  FX[f] = new Image();
  FX[f].src = `assets/fx/${f}.png`;
}

const ready = (img) => img && img.complete && img.naturalWidth;

export class Gun {
  constructor(engine, x, y, id) {
    this.engine = engine;
    this.home = { x, y };
    this.sprite = SPRITES.get(id) || [...SPRITES.values()][0];
    const d = this.sprite.def;
    this.k = GUN.reach / Math.hypot(d.muzzle.x - d.grip.x, d.muzzle.y - d.grip.y);
    this.artAngle = Math.atan2(d.muzzle.y - d.grip.y, d.muzzle.x - d.grip.x);
    this.holder = null;      // { player, arm }
    this.cd = 0;
    this.dir = { x: 1, y: 0 };
    this.spawn();
  }

  spawn() {
    if (this.body) M.Composite.remove(this.engine.world, this.body);
    this.body = M.Bodies.rectangle(this.home.x, this.home.y, GUN.reach + 8, 14, {
      density: 0.001,
      friction: 0.6,
      frictionAir: 0.02,
      restitution: 0.2,
      collisionFilter: { category: CAT.GUN, mask: CAT.SOLID },
      plugin: { hh: { type: 'gun', grab: false, gun: this } },
    });
    M.Composite.add(this.engine.world, this.body);
    this.holder = null;
    this.glow = 1;
  }

  flipped() { return Math.cos(this.body.angle) < 0; }

  // the body is centred on the barrel line; the grip is half a reach back
  gripWorld() {
    const a = this.body.angle;
    return { x: this.body.position.x - Math.cos(a) * GUN.reach / 2, y: this.body.position.y - Math.sin(a) * GUN.reach / 2 };
  }

  muzzleWorld() {
    const a = this.body.angle;
    return { x: this.body.position.x + Math.cos(a) * GUN.reach / 2, y: this.body.position.y + Math.sin(a) * GUN.reach / 2 };
  }

  pickUp(player, arm) {
    // remember the gun's angle relative to the forearm right now
    const fore = arm.segs[arm.segs.length - 1];
    this.rel = this.body.angle - fore.angle;
    this.holder = { player, arm };
    arm.gun = this;
    this.body.collisionFilter.mask = 0;     // carried: no collisions
    this.glow = 0;
    sfx.grab();
  }

  drop() {
    if (!this.holder) return;
    const hand = this.holder.arm.hand;
    this.holder.arm.gun = null;
    this.holder = null;
    this.body.collisionFilter.mask = CAT.SOLID;
    M.Body.setVelocity(this.body, { x: hand.velocity.x, y: hand.velocity.y });
  }

  // carried: grip in the palm, turning with the forearm at the angle it was
  // picked up at
  follow() {
    const arm = this.holder.arm;
    const hand = arm.hand.position;
    const a = arm.segs[arm.segs.length - 1].angle + this.rel;
    this.dir = { x: Math.cos(a), y: Math.sin(a) };
    M.Body.setAngle(this.body, a);
    M.Body.setPosition(this.body, { x: hand.x + this.dir.x * GUN.reach / 2, y: hand.y + this.dir.y * GUN.reach / 2 });
    M.Body.setVelocity(this.body, { x: arm.hand.velocity.x, y: arm.hand.velocity.y });
    M.Body.setAngularVelocity(this.body, 0);
  }

  draw(ctx, time) {
    const b = this.body;
    if (!this.holder && this.glow > 0) {
      // waiting to be picked up: a soft pulsing halo
      ctx.fillStyle = `rgba(255,217,77,${0.12 + Math.sin(time * 4) * 0.06})`;
      ctx.beginPath(); ctx.arc(b.position.x, b.position.y, 34, 0, TAU); ctx.fill();
    }
    const d = this.sprite.def;
    const grip = this.gripWorld();
    ctx.save();
    ctx.translate(grip.x, grip.y);
    ctx.rotate(b.angle);
    if (this.flipped()) ctx.scale(1, -1);
    ctx.rotate(-this.artAngle);
    ctx.scale(this.k, this.k);
    if (ready(this.sprite.img)) {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.sprite.img, -d.grip.x, -d.grip.y, d.w, d.h);
    } else {
      ctx.fillStyle = d.color;
      ctx.fillRect(0, -6 / this.k, (GUN.reach) / this.k, 12 / this.k);
    }
    ctx.restore();
  }
}

// Bullets + hit effects live with the game (they need every player).
export class Shots {
  constructor() {
    this.bullets = [];
    this.fx = [];      // { kind, x, y, angle, t, life, size }
  }

  clear() { this.bullets.length = 0; this.fx.length = 0; }

  fire(g, player, gun) {
    if (gun.cd > 0) return;
    gun.cd = GUN.cooldown;
    gun.dir = { x: Math.cos(gun.body.angle), y: Math.sin(gun.body.angle) };
    const mz = gun.muzzleWorld();
    const dir = gun.dir;
    this.bullets.push({
      x: mz.x, y: mz.y, vx: dir.x * GUN.bulletSpeed, vy: dir.y * GUN.bulletSpeed,
      life: GUN.bulletLife, owner: player, color: gun.sprite.def.accent,
    });
    // recoil: the whole rig, so the arms don't soak it up
    for (const rb of player.rigBodies) {
      M.Body.setVelocity(rb, { x: rb.velocity.x - dir.x * GUN.kick, y: rb.velocity.y - dir.y * GUN.kick });
    }
    this.fx.push({ kind: 'muzzle-flash', x: mz.x, y: mz.y, angle: Math.atan2(dir.y, dir.x), t: 0, life: 0.12, size: 46 });
    g.addShake(2.5);
    sfx.shoot();
  }

  update(dt, g) {
    const level = g.level;
    const solids = [
      ...level.solids.map((s) => s.body).filter((b) => !b.plugin.hh.removed),
      ...level.movers.map((m) => m.body),
      ...level.spinners.map((s) => s.body),
    ];
    for (const b of this.bullets) {
      b.life -= dt;
      const steps = 4;
      for (let i = 0; i < steps && b.life > 0; i++) {
        b.x += (b.vx * dt) / steps;
        b.y += (b.vy * dt) / steps;
        if (M.Query.point(solids, { x: b.x, y: b.y }).length) {
          b.life = 0;
          g.particles.dust(b.x, b.y, 5);
          break;
        }
        for (const p of g.players) {
          if (p === b.owner || p.state !== 'alive') continue;
          if (g.time < p.protectUntil) continue;
          const pos = p.body.position;
          if (Math.hypot(pos.x - b.x, pos.y - b.y) > 21 + 6) continue;
          this.hit(g, p, b);
          b.life = 0;
          break;
        }
        for (const bl of level.balloons) {
          if (b.life > 0 && bl.body && Math.hypot(bl.body.position.x - b.x, bl.body.position.y - b.y) < 26) {
            level.popBalloon(bl, g.particles);
            b.life = 0;
          }
        }
      }
      if (b.x < -100 || b.x > level.w + 100 || b.y < -200 || b.y > level.h + 100) b.life = 0;
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < f.life);
  }

  // knocked back, grips shaken loose — not killed
  hit(g, p, b) {
    const m = Math.hypot(b.vx, b.vy) || 1;
    const dx = b.vx / m, dy = b.vy / m;
    if (p.has('shield')) {
      // BUBBLE SHIELD: the shot pings off
      this.fx.push({ kind: 'shockwave-ring', x: b.x, y: b.y, angle: 0, t: 0, life: 0.2, size: 50 });
      sfx.grab();
      return;
    }
    if (!p.has('sticky')) {                // STICKY GLOVES hold on regardless
      for (const a of p.arms) {
        p.releaseArm(a);
        if (a.gun) a.gun.drop();
      }
    }
    for (const rb of p.rigBodies) {
      M.Body.setVelocity(rb, { x: rb.velocity.x + dx * GUN.hitPush, y: rb.velocity.y + dy * GUN.hitPush - GUN.hitLift });
    }
    this.fx.push({ kind: 'shockwave-ring', x: b.x, y: b.y, angle: 0, t: 0, life: 0.3, size: 90 });
    g.particles.burst(b.x, b.y, b.color, 10, 260);
    g.addShake(5);
    sfx.hit();
  }

  draw(ctx) {
    for (const b of this.bullets) {
      const m = Math.hypot(b.vx, b.vy) || 1;
      const tx = (b.vx / m) * 22, ty = (b.vy / m) * 22;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(b.x - tx, b.y - ty); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(b.x - tx * 0.6, b.y - ty * 0.6); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.restore();
    }
    for (const f of this.fx) {
      const img = FX[f.kind];
      const u = f.t / f.life;
      const s = f.size * (f.kind === 'shockwave-ring' ? 0.4 + u : 1);
      ctx.save();
      ctx.globalAlpha = 1 - u;
      ctx.translate(f.x, f.y);
      ctx.rotate(f.angle);
      if (ready(img)) ctx.drawImage(img, -s / 2, -s / 2, s, s);
      else {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, s / 3, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
  }
}
