// The spider: a Rounders character ball with eight procedural legs.
//
// Movement (Spider-Heck style):
//  - clings to every surface it touches (floors, walls, ceilings, round
//    rocks, moving platforms) and walks around it with the left stick.
//    Holding a direction keeps circulating around a corner, so holding
//    right on the floor walks you up the wall you run into.
//  - A / LB jumps off the surface (along its normal, nudged by the stick).
//  - LT shoots a web toward the right-stick aim; hold to swing, release to
//    let go. Left stick pumps the swing (sideways) and reels (up/down).
//  - RT uses the held weapon, RB / B throws it, X swaps with one nearby.
//
// Spiders die from one hit (game.killSpider). Ice can't be clung to; lava
// kills.

import { clamp, lerp, TAU, angDiff, rand, rgba } from './util.js';
import { castAt, drawBody } from './cast.js';
import { sfx } from './audio.js';

export const SP = {
  r: 19,
  gravity: 2000,
  walkSpeed: 340,
  walkAccel: 4200,
  airAccel: 1100,
  airMax: 430,
  stickRange: 10,
  jumpSpeed: 860,
  maxSpeed: 2200,
  coyote: 0.1,
  webSpeed: 3600,
  webMax: 860,
  webMin: 36,
  webReel: 520,
  webYank: 0.9,          // rope length snaps to this fraction of the hit distance
  webPump: 1500,
  coxa: 15,               // leg segments: short base, thigh (rises to the knee), shin (tapers to a point)
  femur: 44,
  tibia: 54,
  legLen: 40,            // average segment (reach = femur + tibia)
  lift: 17,              // the body stands this far above the surface (r + lift)
};

const LEGS = [
  // side (+1 = along tangent), rest offset along the surface (x r), group, far (drawn darker)
  { side: 1, off: 1.1, g: 0, far: true }, { side: 1, off: 1.85, g: 1, far: false },
  { side: 1, off: 2.4, g: 0, far: true }, { side: 1, off: 2.9, g: 1, far: false },
  { side: -1, off: 1.1, g: 1, far: true }, { side: -1, off: 1.85, g: 0, far: false },
  { side: -1, off: 2.4, g: 1, far: true }, { side: -1, off: 2.9, g: 0, far: false },
];

let NEXT_ID = 1;

const clingable = (solid) => solid.mat !== 'ice' && solid.mat !== 'bouncy' && solid.mat !== 'lava';

export class Spider {
  constructor(game, { slot = 0, castIndex = 0, color, inputId = null, team = null, name = '' } = {}) {
    this.game = game;
    this.id = NEXT_ID++;
    this.kind = 'spider';
    this.slot = slot;
    this.castIndex = castIndex;
    this.color = color;
    this.inputId = inputId;
    this.team = team ?? ('p' + slot);
    this.name = name || castAt(castIndex).name;
    this.r = SP.r;
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.alive = true;
    this.hp = 1;
    this.ground = null;        // {nx, ny, x, y, solid} while clinging
    this.wasGround = false;
    this.up = { x: 0, y: -1 }; // smoothed surface normal (visuals)
    this.jumpLock = 0;
    this.coyote = 0;
    this.lastNormal = { x: 0, y: -1 };
    this.circ = 0;             // walking direction memory (+1/-1 around the surface)
    this.circStick = null;
    this.aim = { x: 1, y: 0 };
    this.aimAngle = 0;
    this.facing = 1;
    this.web = null;
    this.weapon = null;
    this.pickCooldown = 0;
    this.invuln = 0;           // spawn protection (s)
    this.shield = 0;           // hits a shield absorbs (perks/pickups)
    this.flash = 0;
    this.squash = 1;
    this.time = rand(0, 10);
    this.stepPhase = 0;
    this.kills = 0;
    this.stun = 0;             // can't act (s)
    this.speedMul = 1;         // perks
    this.jumpMul = 1;
    this.legs = LEGS.map((L) => ({ ...L, fx: 0, fy: 0, sx: 0, sy: 0, tx: 0, ty: 0, t: 1, planted: false, solid: null, lx: 0, ly: 0 }));
    this.ctl = null;
    this.recallable = null;   // thrown weapon that answers RT (saber)
  }

  get webColor() { return '#f4f7ff'; }

  place(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.ground = null;
    this.web = null;
    for (const L of this.legs) { L.fx = L.sx = L.tx = x + L.side * L.off * this.r; L.fy = L.sy = L.ty = y + this.r; L.t = 1; L.planted = false; L.solid = null; }
  }

  impulse(ix, iy, detach = true) {
    this.vx += ix; this.vy += iy;
    if (detach && Math.hypot(ix, iy) > 260) { this.jumpLock = Math.max(this.jumpLock, 0.14); this.ground = null; }
  }

  // ----------------------------------------------------------------------
  update(dt, input) {
    const game = this.game;
    const world = game.world;
    this.time += dt;
    this.jumpLock = Math.max(0, this.jumpLock - dt);
    this.pickCooldown = Math.max(0, this.pickCooldown - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.flash = Math.max(0, this.flash - dt * 4);
    this.stun = Math.max(0, this.stun - dt);
    this.squash = lerp(this.squash, 1, Math.min(1, dt * 12));

    const inp = this.stun > 0 ? null : input;
    const move = inp ? inp.l : { x: 0, y: 0, mag: 0 };
    // aim: right stick (or mouse). Neutral keeps the last aim.
    if (inp && inp.r.mag > 0.3) {
      const m = Math.hypot(inp.r.x, inp.r.y);
      this.aim.x = inp.r.x / m; this.aim.y = inp.r.y / m;
    }
    this.aimAngle = Math.atan2(this.aim.y, this.aim.x);
    // face the side the weapon points to (or the aim, or the walk)
    if (this.weapon) { const c = Math.cos(this.weapon.angle); if (Math.abs(c) > 0.08) this.facing = Math.sign(c); }
    else if (inp && inp.r.mag > 0.3) { if (Math.abs(this.aim.x) > 0.15) this.facing = Math.sign(this.aim.x); }
    else if (Math.abs(move.x) > 0.2) this.facing = Math.sign(move.x);

    this.ctl = inp ? {
      aimX: this.aim.x, aimY: this.aim.y, angle: this.aimAngle, aimMag: inp.r.mag,
      fire: inp.rt > 0.45, firePressed: inp.pressed.rt, fireReleased: inp.released.rt,
      alt: inp.held.rb, altPressed: inp.pressed.rb,
    } : { aimX: this.aim.x, aimY: this.aim.y, angle: this.aimAngle, aimMag: 0, fire: false, firePressed: false, fireReleased: false, alt: false, altPressed: false };

    // ---- jump
    const jumpPressed = inp && (inp.pressed.a || inp.pressed.lb);
    if (jumpPressed) {
      if (this.ground || this.coyote > 0) {
        const n = this.ground || this.lastNormal;
        const jv = SP.jumpSpeed * this.jumpMul;
        let jx = n.nx ?? n.x, jy = n.ny ?? n.y;
        // nudge by the stick; on a ceiling, a jump is a drop
        jx += move.x * 0.55; jy += move.y * 0.35;
        const m = Math.hypot(jx, jy) || 1;
        const sv = this.ground ? this.ground.solid.velAt(this.ground.x, this.ground.y, world.dt) : { x: 0, y: 0 };
        this.vx = (jx / m) * jv + sv.x * 0.6 + this.vx * 0.3;
        this.vy = (jy / m) * jv + sv.y * 0.6;
        this.ground = null; this.coyote = 0; this.jumpLock = 0.16;
        this.squash = 0.75;
        sfx.jump();
        game.fx.burst(this.x - jx / m * this.r, this.y - jy / m * this.r, { n: 6, speed: 160, color: 'rgba(255,255,255,0.6)', kind: 'smoke', size: 5, life: 0.35, g: 0 });
      } else if (this.web && this.web.state === 'stuck') {
        // jump out of a swing: let go with a little boost
        this.releaseWeb(true);
      }
    }

    // ---- web
    if (inp && inp.pressed.lt && !this.web) this.shootWeb();
    if (this.web && (!inp || !(inp.lt > 0.3))) this.releaseWeb(false);
    if (this.web) this.updateWeb(dt, move);

    // ---- locomotion
    const sub = 2;
    const h = dt / sub;
    for (let s = 0; s < sub; s++) this.step(h, move);

    // ---- surroundings
    // ease the visual 'up' by rotating it (blending vectors would get stuck on a
    // straight flip, e.g. floor -> ceiling)
    const ua = Math.atan2(this.up.y, this.up.x);
    const ta = this.ground ? Math.atan2(this.ground.ny, this.ground.nx) : -Math.PI / 2;
    const na = ua + angDiff(ua, ta) * Math.min(1, dt * 12);
    this.up.x = Math.cos(na); this.up.y = Math.sin(na);

    this.updateLegs(dt);

    // weapon
    const hadWeapon = !!this.weapon;
    if (this.weapon) this.weapon.update(dt, this.ctl);
    if (inp && this.weapon && (inp.pressed.rb || inp.pressed.b)) this.throwWeapon();
    if (inp && inp.pressed.x) this.swapWeapon();
    // a thrown weapon that can come back (sabers): pull the trigger to recall it
    if (inp && !hadWeapon && this.recallable && inp.pressed.rt) this.recallable.recall(this);
    if (!this.weapon && this.pickCooldown <= 0) {
      const p = game.pickupNear(this.x, this.y, this.r + 16, this);
      if (p) game.takePickup(this, p);
    }

    // hazards
    if (this.y > game.board.killY || this.x < -300 || this.x > world.bounds.w + 300) game.killSpider(this, { cause: 'fall' });
  }

  step(h, move) {
    const world = this.game.world;
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > SP.maxSpeed) { this.vx *= SP.maxSpeed / speed; this.vy *= SP.maxSpeed / speed; }

    if (this.ground) {
      // climbing into a wall ahead: switch onto it before moving
      if (this.circ) {
        const g0 = this.ground;
        const hit = world.raycast(this.x, this.y, -g0.ny * this.circ, g0.nx * this.circ, this.r + SP.lift + 4);
        if (hit && hit.nx * g0.nx + hit.ny * g0.ny < 0.7 && clingable(hit.solid)) {
          this.ground = { nx: hit.nx, ny: hit.ny, x: hit.x, y: hit.y, solid: hit.solid };
        }
      }
      // in a corner, the stick may run along the other surface: hop onto it
      if (move.mag > 0.25) {
        const g0 = this.ground;
        const dx = move.x / move.mag, dy = move.y / move.mag;
        const continuing = this.circ && this.circStick && dx * this.circStick.x + dy * this.circStick.y > 0.9;
        if (!continuing && Math.abs(dx * -g0.ny + dy * g0.nx) < 0.38) {
          for (const sgn of [1, -1]) {
            const hit = world.raycast(this.x, this.y, -dy * sgn, dx * sgn, this.r + SP.lift + 5);
            if (hit && clingable(hit.solid) && Math.abs(dx * -hit.ny + dy * hit.nx) > 0.6) {
              this.ground = { nx: hit.nx, ny: hit.ny, x: hit.x, y: hit.y, solid: hit.solid };
              break;
            }
          }
        }
      }
      const g = this.ground;
      const nx = g.nx, ny = g.ny;
      const tx = -ny, ty = nx;            // consistent circulation around a solid
      const sv = g.solid.velAt(g.x, g.y, world.dt);
      // direction memory: keep circulating (up walls you walk into, around
      // ledges you walk off) while the stick stays put and doesn't oppose it
      let target = 0;
      if (move.mag > 0.25) {
        const dx = move.x / move.mag, dy = move.y / move.mag;
        const s = dx * tx + dy * ty;
        const same = this.circStick && dx * this.circStick.x + dy * this.circStick.y > 0.9;
        if (!same) {
          this.circStick = { x: dx, y: dy };
          this.circ = Math.abs(s) > 0.38 ? Math.sign(s) : 0;
          this.circBlocked = false;
        } else if (this.circ && this.circ * s < -0.3) {
          // the surface turned against the stick (e.g. a ceiling corner): stop
          // there until the stick changes, instead of flipping back
          this.circ = 0; this.circBlocked = true;
        } else if (!this.circ && !this.circBlocked && Math.abs(s) > 0.38) this.circ = Math.sign(s);
        target = this.circ * SP.walkSpeed * this.speedMul * Math.min(1, move.mag * 1.2);
      } else { this.circ = 0; this.circStick = null; }
      // walking speed along the tangent
      let vt = (this.vx - sv.x) * tx + (this.vy - sv.y) * ty;
      const acc = SP.walkAccel * h * (g.solid.mat === 'ice' ? 0.15 : 1);
      vt += clamp(target - vt, -acc, acc);
      if (!target && g.solid.mat !== 'ice') vt *= Math.max(0, 1 - h * 14);
      if (g.solid.mat === 'ice') vt += SP.gravity * ty * h;   // slide down icy slopes
      this.vx = sv.x + tx * vt - nx * 40;
      this.vy = sv.y + ty * vt - ny * 40;
    } else {
      this.vy += SP.gravity * h;
      // air control
      const ax = move.x * SP.airAccel * h;
      if ((ax > 0 && this.vx < SP.airMax) || (ax < 0 && this.vx > -SP.airMax)) this.vx += ax;
      this.vx *= 1 - h * 0.15;
    }

    this.x += this.vx * h;
    this.y += this.vy * h;
    if (this.web && this.web.state === 'stuck') this.constrainWeb(h);

    const preVx = this.vx, preVy = this.vy;
    const contacts = world.collideCircle(this, { bounce: 0, friction: 0 });
    for (const c of contacts) {
      if (c.solid.mat === 'lava') { this.game.killSpider(this, { cause: 'lava' }); return; }
      if (c.solid.mat === 'bouncy' && c.vn < -150) { sfx.jump(); this.jumpLock = 0.15; this.ground = null; }
    }

    // find the surface to cling to
    if (this.jumpLock > 0) { this.ground = null; }
    else {
      const n = world.nearest(this.x, this.y, this.r + SP.lift + SP.stickRange);
      const webPull = this.web && this.web.state === 'stuck' ? this.webDir() : null;
      let ok = n && clingable(n.solid);
      if (ok && webPull && webPull.x * n.nx + webPull.y * n.ny > 0.25 && this.web.taut) ok = false;
      if (n && n.solid.mat === 'ice' && n.ny < -0.5) {
        // ice: you can stand on top, slipping, but not cling
        this.ground = { nx: n.nx, ny: n.ny, x: n.x, y: n.y, solid: n.solid };
        this.coyote = SP.coyote; this.lastNormal = { x: n.nx, y: n.ny };
      } else if (ok) {
        this.ground = { nx: n.nx, ny: n.ny, x: n.x, y: n.y, solid: n.solid };
        // stand on the legs: hold the body at r + lift from the surface
        let gap = (n.inside ? -n.d : n.d) - this.r - SP.lift;
        if (gap < 0) gap *= 0.35;   // rise smoothly (and give way under low ceilings)
        this.x -= this.ground.nx * gap; this.y -= this.ground.ny * gap;
        if (!this.wasGround) {
          const impact = -(preVx * n.nx + preVy * n.ny);
          if (impact > 250) { sfx.land(); this.squash = 1 - Math.min(0.3, impact / 3000); this.game.fx.burst(n.x, n.y, { n: 4, speed: 120, color: 'rgba(255,255,255,0.5)', kind: 'smoke', size: 4, life: 0.3, g: 0 }); }
        }
        this.coyote = SP.coyote;
        this.lastNormal = { x: n.nx, y: n.ny };
      } else {
        this.ground = null;
      }
    }
    if (!this.ground) this.coyote = Math.max(0, this.coyote - h);
    this.wasGround = !!this.ground;
  }

  // ---------------------------------------------------------------- web
  shootWeb() {
    let dx = this.aim.x, dy = this.aim.y;
    this.web = { state: 'fly', x: this.x, y: this.y, dx, dy, len: 0, dist: 0, solid: null, lx: 0, ly: 0, taut: false, target: null, t: 0 };
    sfx.webShoot();
  }

  releaseWeb(boost) {
    if (!this.web) return;
    if (this.web.state === 'stuck' && boost) {
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > 50) { this.vx *= 1.08; this.vy = this.vy * 1.08 - 220; }
      else this.vy -= 400;
      this.jumpLock = 0.1;
    }
    this.web = null;
  }

  // anchor in world coords
  webAnchor() {
    const w = this.web;
    if (w.target) return { x: w.target.x, y: w.target.y };
    if (w.solid) { const p = w.solid.tx({ x: w.lx, y: w.ly }); return p; }
    return { x: w.x, y: w.y };
  }
  webDir() {
    const a = this.webAnchor();
    const dx = a.x - this.x, dy = a.y - this.y, m = Math.hypot(dx, dy) || 1;
    return { x: dx / m, y: dy / m, d: m };
  }

  updateWeb(dt, move) {
    const w = this.web;
    const world = this.game.world;
    w.t += dt;
    if (w.state === 'fly') {
      const step = SP.webSpeed * dt;
      const nx = w.x + w.dx * step, ny = w.y + w.dy * step;
      // things the web can grab: pickups (yank them to you), other bodies
      const ent = this.game.webHitTest(w.x, w.y, nx, ny, this);
      const hit = world.segment(w.x, w.y, nx, ny);
      if (ent && (!hit || ent.t * step <= hit.t)) {
        if (ent.pickup) {
          const p = ent.pickup;
          const dx = this.x - p.x, dy = this.y - p.y, m = Math.hypot(dx, dy) || 1;
          p.vx = (dx / m) * 1100; p.vy = (dy / m) * 1100 - 250; p.yankedBy = this; p.yankT = 0.6;
          sfx.webStick();
          this.game.fx.burst(p.x, p.y, { n: 6, speed: 150, color: '#fff', size: 2 });
          this.web = null;
          return;
        }
        if (ent.body) {
          w.state = 'stuck'; w.target = ent.body;
          const d = Math.hypot(ent.body.x - this.x, ent.body.y - this.y);
          w.len = Math.max(SP.webMin, d * SP.webYank);
          sfx.webStick();
          return;
        }
      }
      if (hit && hit.solid.mat !== 'lava') {
        w.state = 'stuck';
        w.solid = hit.solid;
        const l = hit.solid.inv({ x: hit.x, y: hit.y });
        w.lx = l.x; w.ly = l.y;
        const d = Math.hypot(hit.x - this.x, hit.y - this.y);
        w.len = Math.max(SP.webMin, d * SP.webYank);
        w.x = hit.x; w.y = hit.y;
        sfx.webStick();
        this.game.fx.burst(hit.x, hit.y, { n: 5, speed: 120, color: '#ffffff', size: 1.5, life: 0.25 });
        // a fresh web lifts you off the floor
        if (this.ground && (hit.y < this.y - 30)) { this.ground = null; this.jumpLock = 0.08; }
        return;
      }
      w.x = nx; w.y = ny;
      w.dist += step;
      if (w.dist > SP.webMax * (this.webMul || 1) || hit) { this.web = null; }
      return;
    }
    // stuck: dead targets or broken solids drop the web
    if ((w.target && (!w.target.alive || w.target.removed)) || (w.solid && w.solid.broken)) { this.web = null; return; }
    // reel with up/down relative to the rope, pump sideways
    const d = this.webDir();
    const reel = -(move.x * d.x + move.y * d.y);   // stick toward anchor = shorten
    if (Math.abs(reel) > 0.3) w.len = clamp(w.len + reel * SP.webReel * dt, SP.webMin, SP.webMax + 40);
    if (w.t < 0.25) w.len = Math.max(SP.webMin, w.len - 260 * dt);
    if (!this.ground) {
      const tx = -d.y, ty = d.x;
      const pump = move.x * tx + move.y * ty;
      this.vx += tx * pump * SP.webPump * dt;
      this.vy += ty * pump * SP.webPump * dt;
    }
    // a web pulls things it's tied to
    if (w.target && w.target.impulse) {
      const k = (d.d - w.len) > 0 ? (d.d - w.len) * 6 : 0;
      w.target.impulse(-d.x * k * dt * 60 * 0.02, -d.y * k * dt * 60 * 0.02, false);
    }
    // rope blocked by terrain: snap
    const a = this.webAnchor();
    const hit = world.segment(this.x, this.y, a.x - d.x * 3, a.y - d.y * 3);
    if (hit && hit.t > 12) this.web = null;
  }

  constrainWeb(h) {
    const w = this.web;
    const a = this.webAnchor();
    let dx = this.x - a.x, dy = this.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    w.taut = d >= w.len - 1;
    if (d > w.len) {
      dx /= d; dy /= d;
      this.x = a.x + dx * w.len;
      this.y = a.y + dy * w.len;
      const vr = this.vx * dx + this.vy * dy;
      if (vr > 0) { this.vx -= vr * dx * 1.0; this.vy -= vr * dy * 1.0; }
    }
  }

  // ---------------------------------------------------------------- weapons
  giveWeapon(w) {
    if (this.weapon) this.dropWeapon();
    this.weapon = w;
    w.owner = this;
    w.fromX = Number.isFinite(w.x) && (w.x || w.y) ? w.x : this.x;
    w.fromY = Number.isFinite(w.y) && (w.x || w.y) ? w.y : this.y;
    w.equipT = 0;
    this.reachT = 0.18;                // the holding leg reaches out to take it
    if (w.onEquip) w.onEquip(this);
  }

  dropWeapon(vx = 0, vy = -100) {
    const w = this.weapon;
    if (!w) return null;
    // a hard toss (saber throws included) gets an arm follow-through
    if (Math.hypot(vx, vy) > 600 && !(this.flingT > 0)) { const m = Math.hypot(vx, vy); this.flingT = 0.22; this.flingDir = { x: vx / m, y: vy / m }; }
    this.weapon = null;
    if (w.onUnequip) w.onUnequip(this);
    w.owner = null;
    this.pickCooldown = 0.35;
    return this.game.spawnPickup(w, this.x, this.y, this.vx * 0.5 + vx, this.vy * 0.5 + vy, { from: this });
  }

  throwWeapon() {
    const w = this.weapon;
    if (!w) return;
    if (w.onThrow && w.onThrow(this.ctl) === true) return; // weapon handled it (e.g. saber throw)
    const sp = 1300;
    this.flingT = 0.22; this.flingDir = { x: this.aim.x, y: this.aim.y };
    const p = this.dropWeapon(this.aim.x * sp, this.aim.y * sp);
    if (p) { p.thrown = true; p.thrower = this; p.spin = 18 * this.facing; }
    sfx.throwIt();
  }

  swapWeapon() {
    const p = this.game.pickupNear(this.x, this.y, this.r + 40, this, true);
    if (!p) return;
    if (this.weapon) this.dropWeapon(0, -200);
    this.game.takePickup(this, p);
  }

  // ---------------------------------------------------------------- legs
  updateLegs(dt) {
    const world = this.game.world;
    const r = this.r;
    const reach = (SP.femur + SP.tibia) * 0.97;
    const g = this.ground;
    const nx = g ? g.nx : this.up.x, ny = g ? g.ny : this.up.y;
    const tx = -ny, ty = nx;
    const speed = Math.hypot(this.vx, this.vy);
    let anyStep = [false, false];
    for (const L of this.legs) if (L.t < 1 && !L.hold) anyStep[L.g] = true;
    const holds = this.holdTargets(tx, ty);
    for (let i = 0; i < this.legs.length; i++) {
      const L = this.legs[i];
      // planted feet ride their surface
      if (L.planted && L.solid && L.solid.dynamic) { const p = L.solid.tx({ x: L.lx, y: L.ly }); L.fx = p.x; L.fy = p.y; }
      if (L.planted && L.solid && L.solid.broken) L.planted = false;
      const root = this.legRoot(L, nx, ny, tx, ty), hipX = root.cx, hipY = root.cy;   // reach is measured from the base segment's end
      // front legs lift off the ground to hold the weapon (or follow through a throw)
      const hold = holds.get(i);
      if (hold) {
        const k = Math.min(1, dt * (L.hold ? 30 : 16));
        L.fx = lerp(L.fx, hold.x, k); L.fy = lerp(L.fy, hold.y, k);
        L.hold = true; L.planted = false; L.t = 1; L.solid = null;
        continue;
      }
      if (L.hold) { L.hold = false; L.planted = false; L.t = 1; }
      if (g) {
        // ideal foothold: along the surface, leading in the walk direction
        const lead = clamp(((this.vx * tx + this.vy * ty) * 0.07), -r, r);
        const ox = this.x + tx * (L.side * L.off * r + lead) * 0.9, oy = this.y + ty * (L.side * L.off * r + lead) * 0.9;
        let hit = world.raycast(ox, oy, -nx, -ny, (r + SP.lift) * 2.2);
        if (!hit) hit = world.raycast(this.x, this.y, tx * L.side * 0.8 - nx, ty * L.side * 0.8 - ny, reach + r);
        if (hit) {
          L.tx = hit.x; L.ty = hit.y;
          const far = Math.hypot(L.fx - L.tx, L.fy - L.ty);
          const tooFar = Math.hypot(L.fx - hipX, L.fy - hipY) > reach * 1.05;
          if ((!L.planted && L.t >= 1) || ((far > r * 1.25 || tooFar) && L.t >= 1 && !anyStep[1 - L.g])) {
            L.sx = L.fx; L.sy = L.fy; L.t = 0; L.planted = false; anyStep[L.g] = true;
            L.solid = hit.solid; const lp = hit.solid.inv(hit); L.lx = lp.x; L.ly = lp.y;
            L.tN = { x: nx, y: ny };
          }
        } else if (L.t >= 1) {
          L.planted = false;
        }
      } else {
        L.planted = false;
        // airborne: legs spread and trail the motion
        const spread = L.side * (0.7 + L.off * 0.55);
        const ax = this.x + spread * r * 1.05 - clamp(this.vx * 0.02, -14, 14), ay = this.y + r * (1.2 + 0.3 * Math.sin(this.time * 9 + i)) - clamp(this.vy * 0.015, -10, 12);
        L.tx = ax; L.ty = ay;
        L.fx = lerp(L.fx, ax, Math.min(1, dt * 14)); L.fy = lerp(L.fy, ay, Math.min(1, dt * 14));
        L.t = 1;
        continue;
      }
      if (L.t < 1) {
        L.t = Math.min(1, L.t + dt / Math.max(0.05, 0.11 - speed * 0.00008));
        const s = L.t;
        const lift = Math.sin(s * Math.PI) * r * 0.75;
        const tN = L.tN || { x: nx, y: ny };
        L.fx = lerp(L.sx, L.tx, s) + tN.x * lift;
        L.fy = lerp(L.sy, L.ty, s) + tN.y * lift;
        if (L.t >= 1) { L.planted = true; L.fx = L.tx; L.fy = L.ty; if (speed > 60) sfx.step(); }
      }
    }
  }

  // which legs hold what: Map(legIndex -> world point). The front legs on the
  // side the weapon points to take the grip (and a long gun's barrel); after a
  // throw the gripping leg stays stretched out after it for a moment.
  holdTargets(tx, ty) {
    const out = new Map();
    this.reachT = Math.max(0, (this.reachT || 0) - this.game.world.dt);
    if (this.flingT > 0) {
      this.flingT -= this.game.world.dt;
      const d = this.flingDir;
      const side = Math.sign(d.x * tx + d.y * ty) || this.facing;
      const i = this.legs.findIndex((L) => L.side === side && L.off === LEGS[1].off);
      const ext = (SP.femur + SP.tibia) * 0.85 * Math.sin(Math.min(1, (0.22 - this.flingT) / 0.08) * Math.PI / 2);
      out.set(i, { x: this.x + d.x * ext, y: this.y + d.y * ext });
      return out;
    }
    const w = this.weapon;
    if (!w || !w.hands) return out;
    const ax = Math.cos(w.angle), ay = Math.sin(w.angle);
    let side = Math.sign(ax * tx + ay * ty);
    if (!side) side = this.facing;
    // hysteresis: don't swap legs while the weapon points straight up/down
    if (this.holdSide && Math.abs(ax * tx + ay * ty) < 0.25) side = this.holdSide;
    this.holdSide = side;
    const hands = w.hands();
    const grip = this.legs.findIndex((L) => L.side === side && L.off === LEGS[1].off);
    out.set(grip, hands[0]);
    if (hands[1]) out.set(this.legs.findIndex((L) => L.side === side && L.off === LEGS[0].off), hands[1]);
    return out;
  }

  // where a leg leaves the body (hip, at the body's edge) and where its short
  // base segment ends (rising up and out, away from the surface)
  legRoot(L, nx, ny, tx, ty) {
    const r = this.r;
    // legs fan out: the front pair's base points outward, the rear ones more upright
    const k = (L.off - LEGS[0].off) / (LEGS[3].off - LEGS[0].off);   // 0 inner .. 1 outer
    const hs = L.side * r * (0.4 + 0.25 * k), hu = r * (0.25 - 0.3 * k);
    const hipX = this.x + tx * hs + nx * hu, hipY = this.y + ty * hs + ny * hu;
    const ex = tx * L.side * (0.25 + 0.55 * k) + nx * (1 - 0.3 * k), ey = ty * L.side * (0.25 + 0.55 * k) + ny * (1 - 0.3 * k), m = Math.hypot(ex, ey);
    const len = SP.coxa * (0.8 + 0.4 * k);
    return { hipX, hipY, cx: hipX + ex / m * len, cy: hipY + ey / m * len };
  }

  drawLegs(ctx, far) {
    const c = castAt(this.castIndex);
    const r = this.r;
    const nx = this.up.x, ny = this.up.y;
    const tx = -ny, ty = nx;
    const back = far === true;
    const outline = back ? '#0b0b10' : '#14141c';
    const fill = back ? shade(c.dark, 0.75) : c.color;
    const shin = back ? shade(c.dark, 0.6) : c.dark;
    const F = SP.femur, T = SP.tibia;
    const coxaCol = back ? shade(c.dark, 0.5) : c.dark;
    for (const L of this.legs) {
      if (far === 'hold' ? !L.hold : (L.far !== far || L.hold)) continue;
      // hip on the body, then a short base segment angled up and out
      const { hipX, hipY, cx, cy } = this.legRoot(L, nx, ny, tx, ty);
      let fx = L.fx, fy = L.fy;
      let dx = fx - cx, dy = fy - cy;
      let d = Math.hypot(dx, dy) || 1;
      const max = (F + T) * 0.999;
      if (d > max) { fx = cx + dx / d * max; fy = cy + dy / d * max; dx = fx - cx; dy = fy - cy; d = max; }
      // two-bone IK, knee bent up/out: away from the surface, outward from the body
      const a = Math.acos(clamp((F * F + d * d - T * T) / (2 * F * d), -1, 1));
      const base = Math.atan2(dy, dx);
      const k1 = base + a, k2 = base - a;
      const ux = nx + tx * L.side * 0.5, uy = ny + ty * L.side * 0.5;
      const ka = Math.cos(k1) * ux + Math.sin(k1) * uy > Math.cos(k2) * ux + Math.sin(k2) * uy ? k1 : k2;
      const kx = cx + Math.cos(ka) * F, ky = cy + Math.sin(ka) * F;
      const w = back ? 0.85 : 1;
      // outline pass, then colour: base + thigh thick, the shin tapers to a point
      for (const pass of [0, 1]) {
        const o = pass ? 0 : 2.2;
        ctx.fillStyle = pass ? coxaCol : outline;
        taper(ctx, hipX, hipY, cx, cy, 7 * w + o, 6.5 * w + o);
        ctx.fillStyle = pass ? fill : outline;
        taper(ctx, cx, cy, kx, ky, 6.2 * w + o, 5 * w + o);
        ctx.fillStyle = pass ? shin : outline;
        taper(ctx, kx, ky, fx, fy, 5 * w + o, 0.6 + o * 0.6);
      }
      // joints
      // joints: the base/thigh joint and the knee read as distinct bends
      ctx.fillStyle = back ? shade(c.dark, 0.45) : c.accent;
      ctx.beginPath(); ctx.arc(cx, cy, back ? 2.2 : 2.8, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(kx, ky, back ? 2.2 : 2.8, 0, TAU); ctx.fill();
    }
  }

  drawWeb(ctx) {
    const w = this.web;
    if (!w) return;
    const a = w.state === 'fly' ? { x: w.x, y: w.y } : this.webAnchor();
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(this.color.main, 0.55);
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(a.x, a.y); ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    // slack webs sag a little
    const d = Math.hypot(a.x - this.x, a.y - this.y);
    const sag = w.state === 'stuck' ? Math.max(0, (w.len - d)) * 0.5 : 0;
    ctx.moveTo(this.x, this.y);
    ctx.quadraticCurveTo((this.x + a.x) / 2, (this.y + a.y) / 2 + sag, a.x, a.y);
    ctx.stroke();
    if (w.state === 'stuck') {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(a.x, a.y, 3.5, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  draw(ctx) {
    if (!this.alive) return;
    const r = this.r;
    this.drawWeb(ctx);
    this.drawLegs(ctx, true);
    this.drawLegs(ctx, false);
    this.drawLegs(ctx, 'hold');     // behind the body: only the reaching part shows
    // player ring
    ctx.strokeStyle = this.color.main;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(this.x, this.y, r + 2.5, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
    if (this.weapon && this.weapon.drawBehind) this.weapon.drawBehind(ctx);
    const tilt = clamp(Math.atan2(this.up.x, -this.up.y), -0.45, 0.45) + (this.ground ? Math.sin(this.time * 14) * Math.min(1, Math.hypot(this.vx, this.vy) / 300) * 0.06 : clamp(this.vx * 0.0004, -0.3, 0.3));
    const blink = this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0;
    const bob = this.ground ? Math.abs(Math.sin(this.time * 16)) * Math.min(1, Math.hypot(this.vx, this.vy) / 300) * 2.5 : 0;
    drawBody(ctx, this.x + this.up.x * bob, this.y + this.up.y * bob, r * 1.0, this.castIndex, { tilt, facing: this.facing, squash: this.squash, alpha: blink ? 0.45 : 1, flash: this.flash });
    if (this.shield > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#7fe8ff'; ctx.globalAlpha = 0.5 + 0.2 * Math.sin(this.time * 8);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(this.x, this.y, r + 9, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    if (this.weapon) this.weapon.draw(ctx);
  }
}

// darken a hex color by factor k (0..1)
const shadeCache = new Map();
export function shade(hex, k) {
  const key = hex + k;
  let v = shadeCache.get(key);
  if (v) return v;
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  const r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
  v = `rgb(${r},${g},${b})`;
  shadeCache.set(key, v);
  return v;
}

// a filled segment from (x1,y1) width w1 to (x2,y2) width w2, rounded joints
function taper(ctx, x1, y1, x2, y2, w1, w2) {
  const dx = x2 - x1, dy = y2 - y1, m = Math.hypot(dx, dy) || 1;
  const px = -dy / m, py = dx / m;
  ctx.beginPath();
  ctx.moveTo(x1 + px * w1 / 2, y1 + py * w1 / 2);
  ctx.lineTo(x2 + px * w2 / 2, y2 + py * w2 / 2);
  ctx.lineTo(x2 - px * w2 / 2, y2 - py * w2 / 2);
  ctx.lineTo(x1 - px * w1 / 2, y1 - py * w1 / 2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath(); ctx.arc(x1, y1, w1 / 2, 0, TAU); ctx.fill();
  if (w2 > 1.5) { ctx.beginPath(); ctx.arc(x2, y2, w2 / 2, 0, TAU); ctx.fill(); }
}
