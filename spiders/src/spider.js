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
import { settings } from './settings.js';
import { sfx } from './audio.js';
import { drawWebSplat } from './fx.js';

export const SP = {
  r: 15,                 // body radius at size 1 (see base)
  base: 0.68,            // every spider is drawn and hit at this size: small
                         // against the board, so there's room to swing.
                         // Speeds and web reach stay in board units.
  gravity: 1750,         // a touch floaty: long, readable arcs
  walkSpeed: 340,
  walkAccel: 4200,
  airAccel: 2100,        // air steering (u/s^2)...
  airMax: 640,           // ...up to this sideways speed (faster momentum is kept, not added to)
  airBrake: 1.6,         // steering against your motion bites harder
  stickRange: 10,
  jumpSpeed: 860,
  maxSpeed: 2200,
  coyote: 0.1,
  webSpeed: 7000,
  webMax: 900,
  webMin: 30,
  webReel: 520,          // left stick along the rope reels in / pays out
  webReelAuto: 340,      // a held web keeps shortening its rest length (the pull)
  webRest: 0.32,          // the elastic web's rest length, as a fraction of the hit distance
  webK: 16,              // spring: u/s^2 of pull per unit of stretch...
  webMaxPull: 6500,      // ...capped
  webDamp: 1.1,          // damping on the stretch (keeps it bouncy, not jittery)
  webSlack: 0.12,        // max stretch beyond rest (x hit distance) before it goes taut
  webPump: 1350,
  webApproach: 1600,     // the pull eases off as you close on the anchor at this speed
  webRamp: 0.12,         // s for a fresh web's tension to build (no instant yank)
  webCatch: 5200,        // u/s^2 the taut web brakes you moving away
  softSpeed: 1500,       // above this, air drag grows (no hard speed clamp)
  webMinHold: 0.25,
  ceilingPush: 230,      // u/s a neutral drop from a ceiling pushes you off it
  gentleDrop: 0.45,      // s of lighter gravity for a stick-up ceiling drop
  wallPush: 240,         // u/s every wall jump pushes you off the wall
  skyCeiling: -40,       // webs fired off the top of the arena catch here
  grabRange: 900,        // RB pulls a loose weapon from this far      // a web stays on at least this long
  webCool: 0.12,         // cooldown after a web; +webCoolStep per web since landing
  webCoolStep: 0.08,
  airAnchor: 0.3,        // a web into empty air clings to nothing this long
  webAssist: [0, 0.1, -0.1, 0.2, -0.2, 0.3, -0.3],   // aim-assist fan (rad)
  coxa: 12,               // leg segments: short base, thigh (rises to the knee), shin (tapers to a point)
  femur: 35,
  tibia: 43,
  legLen: 40,            // average segment (reach = femur + tibia)
  lift: 14,              // the body stands this far above the surface (r + lift)
};

const LEGS = [
  // side (+1 = along tangent), rest offset along the surface (x r), group, far (drawn darker)
  { side: 1, off: 1.1, g: 0, far: true }, { side: 1, off: 1.85, g: 1, far: false },
  { side: 1, off: 2.4, g: 0, far: true }, { side: 1, off: 2.9, g: 1, far: false },
  { side: -1, off: 1.1, g: 1, far: true }, { side: -1, off: 1.85, g: 0, far: false },
  { side: -1, off: 2.4, g: 1, far: true }, { side: -1, off: 2.9, g: 0, far: false },
];

let NEXT_ID = 1;

const clingableSolid = (solid) => clingable(solid);
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
    this.gravMul = 1;          // match modifiers (modifiers.js)
    this.sz = 1;               // body + leg scale (setSize)
    this.legs = LEGS.map((L) => ({ ...L, F: SP.femur * (L.far ? 0.85 : 0.9), T: SP.tibia * (L.far ? 1.1 : 1.35), fx: 0, fy: 0, sx: 0, sy: 0, tx: 0, ty: 0, t: 1, planted: false, solid: null, lx: 0, ly: 0 }));
    this.ctl = null;
    this.recallable = null;   // thrown weapon that answers RT (saber)
    this.setSize(1);          // base size (SP.base)
  }

  get webColor() { return '#f4f7ff'; }
  get lift() { return SP.lift * this.sz; }

  // scale the body and legs (tiny / giant modifiers)
  setSize(k) {
    k *= SP.base;
    this.sz = k;
    this.r = SP.r * k;
    for (const L of this.legs) { L.F = SP.femur * (L.far ? 0.85 : 0.9) * k; L.T = SP.tibia * (L.far ? 1.1 : 1.35) * k; }
  }

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

    // ---- jump / web: one button (A or LT), like the original
    //  on a surface: jump. In the air: shoot a web (hold to keep it, release to
    //  let go). Holding the button through a jump slings a web at the top.
    this.webCooldown = Math.max(0, (this.webCooldown || 0) - dt);
    // LB is the original's jump / web button; A and LT do the same
    const jwHeld = !!inp && (inp.held.lb || inp.held.a || inp.held.lt);
    const jwPressed = !!inp && (inp.pressed.lb || inp.pressed.a || inp.pressed.lt);
    if (jwPressed) {
      if (this.ground || this.coyote > 0) this.jump(move);
      else if (!this.web) this.shootWeb(move, inp);
    }
    if (this.web && !jwHeld && this.web.t >= SP.webMinHold) this.releaseWeb(true);
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

    // swinging: the body leans into the web (it hangs from the thread), and
    // eases back upright when you let go
    let lean = 0;
    if (this.web && this.web.state !== 'fly' && !this.ground) {
      const d = this.webDir();
      lean = clamp(Math.atan2(d.x, -d.y), -0.75, 0.75) * 0.7;
    }
    this.lean = lerp(this.lean || 0, lean, Math.min(1, dt * 9));
    this.updateLegs(dt);

    // weapon
    const hadWeapon = !!this.weapon;
    if (this.weapon) this.weapon.update(dt, this.ctl);
    // RB (the original's grab button): holding something -> throw it; empty
    // -> grab: take a weapon within reach, else pull one to you from across
    // the board (your thrown blade first). B throws too; X swaps.
    if (inp && inp.pressed.rb) { if (hadWeapon && this.weapon) this.throwWeapon(); else if (!hadWeapon) this.recall(); }
    else if (inp && this.weapon && inp.pressed.b) this.throwWeapon();
    if (inp && inp.pressed.x) this.swapWeapon();
    // weapons you pulled are caught on arrival; walking over one only picks it
    // up with the auto-pickup setting
    if (!this.weapon && this.pickCooldown <= 0) {
      const p = game.pickupNear(this.x, this.y, this.r + 18, this);
      if (p && (p.yankedBy === this || settings.autoPickup)) game.takePickup(this, p);
    }

    // hazards
    if (this.y > game.board.killY || this.x < -300 || this.x > world.bounds.w + 300) game.killSpider(this, { cause: 'fall' });
  }

  step(h, move) {
    const world = this.game.world;
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > SP.softSpeed) {
      // air drag that grows past softSpeed: fast, but smooth to a limit
      const k = Math.max(0, 1 - h * 2.2 * (speed - SP.softSpeed) / speed);
      this.vx *= k; this.vy *= k;
    }
    if (speed > SP.maxSpeed) { this.vx *= SP.maxSpeed / speed; this.vy *= SP.maxSpeed / speed; }

    if (this.ground) {
      // climbing into a wall ahead: switch onto it before moving
      if (this.circ) {
        const g0 = this.ground;
        const hit = world.raycast(this.x, this.y, -g0.ny * this.circ, g0.nx * this.circ, this.r + this.lift + 4);
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
            const hit = world.raycast(this.x, this.y, -dy * sgn, dx * sgn, this.r + this.lift + 5);
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
      // a gentle drop floats a moment, for as long as the stick stays up
      let gk = this.gravMul;
      if (this.gentleT > 0) { this.gentleT -= h; if (move.mag > 0.3 && move.y < -0.4) gk *= 0.35; else this.gentleT = 0; }
      this.vy += SP.gravity * gk * h;
      // air control
      // air steering: sideways, stronger when it opposes your motion, and a
      // little vertical (up softens a fall, down speeds it)
      const am = this.airMul ?? 1;
      let ax = move.x * SP.airAccel * am * h;
      if (ax * this.vx < 0) ax *= SP.airBrake;
      if ((ax > 0 && this.vx < SP.airMax * am) || (ax < 0 && this.vx > -SP.airMax * am)) this.vx += ax;
      this.vy += move.y * SP.airAccel * 0.3 * am * h;
      this.vx *= 1 - h * 0.15;
    }

    this.x += this.vx * h;
    this.y += this.vy * h;
    if (this.web && (this.web.state === 'stuck' || this.web.state === 'air')) this.constrainWeb(h);

    const preVx = this.vx, preVy = this.vy;
    const contacts = world.collideCircle(this, { bounce: 0, friction: 0 });
    for (const c of contacts) {
      if (c.solid.mat === 'lava') { this.game.killSpider(this, { cause: 'lava' }); return; }
      if (c.solid.mat === 'bouncy' && c.vn < -150) { sfx.jump(); this.jumpLock = 0.15; this.ground = null; }
    }

    // find the surface to cling to
    if (this.jumpLock > 0) { this.ground = null; }
    else {
      const n = world.nearest(this.x, this.y, this.r + this.lift + SP.stickRange);
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
        let gap = (n.inside ? -n.d : n.d) - this.r - this.lift;
        if (gap < 0) gap *= 0.35;   // rise smoothly (and give way under low ceilings)
        this.x -= this.ground.nx * gap; this.y -= this.ground.ny * gap;
        if (!this.wasGround) {
          const impact = -(preVx * n.nx + preVy * n.ny);
          if (impact > 250) { sfx.land(); this.squash = 1 - Math.min(0.3, impact / 3000); this.game.fx.burst(n.x, n.y, { n: 4, speed: 120, color: 'rgba(255,255,255,0.5)', kind: 'smoke', size: 4, life: 0.3, g: 0 }); }
        }
        this.coyote = SP.coyote;
        this.lastNormal = { x: n.nx, y: n.ny };
        this.airWebs = 0;
      } else {
        this.ground = null;
      }
    }
    if (!this.ground) this.coyote = Math.max(0, this.coyote - h);
    this.wasGround = !!this.ground;
  }

  // Jumping depends on what you're standing on:
  //  - top of a platform: an upward jump, the stick steering it
  //  - underside of a platform: with the stick neutral you just let go and
  //    fall; push the stick to launch that way instead
  //  - a wall: always a small push off it (so you don't slide down it),
  //    plus a full jump along the stick if it's pushed
  // The stick can never push you into the surface. Surface momentum is kept.
  jump(move) {
    const world = this.game.world;
    const n = this.ground || this.lastNormal;
    const nx = n.nx ?? n.x, ny = n.ny ?? n.y;
    const jv = SP.jumpSpeed * this.jumpMul;
    // the stick, minus any part pointing into the surface
    let sx = 0, sy = 0;
    if (move.mag > 0.3) {
      sx = move.x / move.mag; sy = move.y / move.mag;
      const into = sx * nx + sy * ny;
      if (into < 0) { sx -= into * nx; sy -= into * ny; }
    }
    const smag = Math.hypot(sx, sy);
    let vx, vy;
    if (ny < -0.55) {
      // floor: up, steered by the stick
      let jx = nx + sx * 0.6, jy = ny + sy * 0.4;
      const m = Math.hypot(jx, jy) || 1;
      vx = (jx / m) * jv; vy = (jy / m) * jv;
    } else if (ny > 0.55) {
      // ceiling: stick up (into it) = a gentle let-go that floats for a
      // moment; neutral = a slight push off; any other way = launch along it
      const up = move.mag > 0.3 && (move.x * nx + move.y * ny) / move.mag < -0.5;
      if (up) { vx = nx * 70; vy = ny * 70; this.gentleT = SP.gentleDrop; }
      else if (smag > 0.25) { vx = (sx / smag) * jv; vy = (sy / smag) * jv; }
      else { vx = nx * SP.ceilingPush; vy = ny * SP.ceilingPush; }
    } else {
      // wall: a little push off, plus a jump along the stick if pushed
      const push = SP.wallPush;
      vx = nx * push; vy = ny * push;
      if (smag > 0.25) { vx += (sx / smag) * jv * 0.9; vy += (sy / smag) * jv * 0.9; }
    }
    const sv = this.ground ? this.ground.solid.velAt(this.ground.x, this.ground.y, world.dt) : { x: 0, y: 0 };
    // keep the momentum you had along the surface: running jumps go further
    this.vx = vx + sv.x * 0.6 + this.vx * 0.55;
    this.vy = vy + sv.y * 0.6 + Math.min(0, this.vy) * 0.2;
    const sp = Math.hypot(vx, vy) || 1;
    this.ground = null; this.coyote = 0; this.jumpLock = this.gentleT > 0 ? 0.4 : 0.16;   // a gentle drop mustn't re-grab the ceiling
    const strong = sp > jv * 0.5;
    this.squash = strong ? 0.72 : 0.92;
    this.pushOff = strong ? { t: 0.07, nx: vx / sp, ny: vy / sp } : null;   // legs push on a real jump
    if (strong) {
      sfx.jump();
      this.game.fx.burst(this.x - nx * this.r, this.y - ny * this.r, { n: 6, speed: 160, color: 'rgba(255,255,255,0.6)', kind: 'smoke', size: 5, life: 0.35, g: 0 });
    }
  }

  // ---------------------------------------------------------------- web
  // Direction: the left stick (where you're steering); with it neutral, the
  // right-stick aim if held, else up and a little forward. Keyboard + mouse
  // aims with the mouse. A fan of rays gives a little aim assist.
  webAim(move, inp) {
    if (inp && inp.kind === 'keyboard' && inp.mouseAim) return { x: this.aim.x, y: this.aim.y };
    if (move.mag > 0.35) return { x: move.x / move.mag, y: move.y / move.mag };
    if (inp && inp.r.mag > 0.3) return { x: this.aim.x, y: this.aim.y };
    const a = -Math.PI / 2 + this.facing * 0.35;
    return { x: Math.cos(a), y: Math.sin(a) };
  }

  shootWeb(move = { x: 0, y: 0, mag: 0 }, inp = null) {
    if (this.noWeb || this.webCooldown > 0) return;
    let { x: dx, y: dy } = this.webAim(move, inp);
    // aim assist: nudge toward the nearest anchor in a small fan
    const max = SP.webMax * (this.webMul || 1);
    const base = Math.atan2(dy, dx);
    for (const off of SP.webAssist) {
      const a = base + off;
      if (this.game.world.raycast(this.x, this.y, Math.cos(a), Math.sin(a), max)) { dx = Math.cos(a); dy = Math.sin(a); break; }
    }
    this.web = { state: 'fly', x: this.x, y: this.y, dx, dy, len: 0, dist: 0, solid: null, lx: 0, ly: 0, taut: false, target: null, t: 0 };
    // webs in a row without landing cool down longer
    this.airWebs = (this.airWebs || 0) + (this.ground ? 0 : 1);
    this.webCooldown = SP.webCool + SP.webCoolStep * Math.max(0, this.airWebs - 1);
    sfx.webShoot();
  }

  // letting go keeps every bit of the swing's momentum, plus a small kick
  // along it (the fling)
  releaseWeb(boost) {
    if (!this.web) return;
    if ((this.web.state === 'stuck' || this.web.state === 'air') && boost) {
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > 120) { const k = 1 + Math.min(0.12, 60 / sp); this.vx *= k; this.vy = this.vy * k - 90; }
      this.jumpLock = 0.08;
    }
    this.web = null;
  }

  // anchor in world coords
  webAnchor() {
    const w = this.web;
    if (w.pivots && w.pivots.length) return w.pivots[w.pivots.length - 1];
    return this.webBase();
  }
  // where the web is actually stuck (ignoring corners it's wrapped around)
  webBase() {
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
          w.attach = d; w.st = 0; w.maxLen = d + 12;
          w.len = Math.max(SP.webMin, d * SP.webRest);
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
        w.attach = d; w.st = 0; w.maxLen = d + 12;
        w.len = Math.max(SP.webMin, d * SP.webRest);
        w.x = hit.x; w.y = hit.y;
        sfx.webStick();
        this.game.fx.burst(hit.x, hit.y, { n: 5, speed: 120, color: '#ffffff', size: 1.5, life: 0.25 });
        // a fresh web lifts you off the floor
        if (this.ground && (hit.y < this.y - 30)) { this.ground = null; this.jumpLock = 0.08; }
        return;
      }
      w.x = nx; w.y = ny;
      w.dist += step;
      if (hit) { this.web = null; return; }
      if (w.y < SP.skyCeiling) {
        // past the top of the arena: catch on the (unseen) ceiling up there
        w.state = 'stuck'; w.y = SP.skyCeiling; w.sky = true;
        const d = Math.hypot(w.x - this.x, w.y - this.y);
        w.attach = d; w.st = 0; w.maxLen = d + 12;
        w.len = Math.max(SP.webMin, d * SP.webRest);
        sfx.webStick();
        return;
      }
      if (w.dist > SP.webMax * (this.webMul || 1)) {
        // nothing to grab: the web clings to thin air for a moment
        w.state = 'air'; w.t = 0;
        w.attach = Math.hypot(w.x - this.x, w.y - this.y);
        w.len = w.attach;            // thin air: a brake, not a slingshot
        w.st = 0; w.maxLen = w.attach + 12;
        this.game.fx.burst(w.x, w.y, { n: 4, speed: 80, color: '#ffffff', size: 1.2, life: 0.2 });
      }
      return;
    }
    if (w.state === 'air' && w.t > SP.airAnchor) { this.web = null; return; }
    // stuck: dead targets or broken solids drop the web
    if ((w.target && (!w.target.alive || w.target.removed)) || (w.solid && w.solid.broken)) { this.web = null; return; }
    // reel with up/down relative to the rope, pump sideways
    const d = this.webDir();
    const reel = move.x * d.x + move.y * d.y;      // stick toward the anchor = reel in
    // a held web reels in on its own; the stick along the rope speeds it up or pays out
    let rate = w.state === 'air' ? 0 : -SP.webReelAuto;
    if (Math.abs(reel) > 0.3) rate -= reel * SP.webReel;
    w.len = clamp(w.len + rate * dt, SP.webMin, SP.webMax);
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
    this.wrapWeb();
  }

  // The line catches on terrain between you and the anchor: it wraps around
  // that corner (a new pivot) instead of being cut, and unwraps when you
  // swing back so the line to the previous point is clear again.
  wrapWeb() {
    const w = this.web, world = this.game.world;
    if (w.target) {   // tied to a body: blocked lines just break
      const a = this.webAnchor(), hit = world.segment(this.x, this.y, a.x, a.y);
      if (hit && hit.t > 12 && Math.hypot(a.x - hit.x, a.y - hit.y) > 20) this.web = null;
      return;
    }
    w.pivots = w.pivots || [];
    // unwrap first: is the point before the current pivot visible again?
    while (w.pivots.length) {
      const prev = w.pivots.length > 1 ? w.pivots[w.pivots.length - 2] : this.webBase();
      const cur = w.pivots[w.pivots.length - 1];
      if (clearLine(world, this.x, this.y, prev.x, prev.y)) {
        const back = Math.hypot(cur.x - prev.x, cur.y - prev.y);
        w.pivots.pop();
        w.len += back; w.maxLen = (w.maxLen ?? w.len) + back;
      } else break;
    }
    // wrap: the line to the current anchor is blocked well short of it
    const a = this.webAnchor();
    const dx = a.x - this.x, dy = a.y - this.y, dist = Math.hypot(dx, dy) || 1;
    const hit = world.segment(this.x, this.y, a.x, a.y);
    if (!hit || hit.t < 6 || dist - hit.t < 10) return;
    if (w.pivots.length >= 6) { this.web = null; return; }
    // pivot just outside the surface it caught on
    const p = { x: hit.x + hit.nx * 4, y: hit.y + hit.ny * 4 };
    const seg = Math.hypot(a.x - p.x, a.y - p.y);
    w.pivots.push(p);
    w.len = Math.max(SP.webMin, w.len - seg);
    w.maxLen = Math.max(w.len, (w.maxLen ?? w.len) - seg);
  }

  // The web is elastic: past its rest length it pulls like a stretched band
  // (spring + damping), which flings you at the anchor and lets swings
  // build up; past rest + slack it goes taut like a rope. Momentum is never
  // thrown away except the outward part when taut.
  // The web: an elastic pull toward the anchor plus a rope limit that only
  // ever shortens smoothly. Everything acts through velocity (no position
  // snaps), the sideways part of your velocity is never touched, so swings
  // keep their momentum and speed up naturally as the web reels you in.
  constrainWeb(h) {
    const w = this.web;
    const a = this.webAnchor();
    let dx = a.x - this.x, dy = a.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    w.st = (w.st || 0) + h;
    // rest length follows you in, so slack never stores up into a snap
    if (w.len > d) w.len = Math.max(SP.webMin, d);
    // rope limit: starts where it stuck, reels in at a steady rate, and
    // never sits closer than the rest length plus some give
    const give = (w.attach || d) * SP.webSlack + 16;
    w.maxLen = Math.max(w.len + give, Math.min(w.maxLen ?? d + 12, d + 12) - SP.webReelAuto * 1.4 * h);
    const stretch = d - w.len;
    w.taut = d >= w.maxLen - 2;
    const vr = this.vx * dx + this.vy * dy;               // speed toward the anchor
    if (stretch > 0) {
      const ramp = Math.min(1, w.st / SP.webRamp);
      let acc = Math.min(SP.webMaxPull * (this.pullMul ?? 1), SP.webK * (this.pullMul ?? 1) * stretch) * ramp;
      acc *= clamp(1 - vr / SP.webApproach, 0, 1);       // eases off as you close in
      acc -= SP.webDamp * Math.min(0, vr);                 // damp the flying-away part
      this.vx += dx * acc * h; this.vy += dy * acc * h;
    }
    if (d > w.maxLen) {
      // taut: a firm but finite brake on moving further away
      const out = -(this.vx * dx + this.vy * dy);
      if (out > 0) { const take = Math.min(out, SP.webCatch * h); this.vx += dx * take; this.vy += dy * take; }
      const fix = Math.min(2, d - w.maxLen);
      this.x += dx * fix; this.y += dy * fix;
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

  recall() {
    if (this.recallable && this.recallable.pickup && !this.recallable.pickup.removed) { this.recallable.recall(this); return; }
    // within reach: just take it
    const near = this.game.pickupNear(this.x, this.y, this.r + 40, this, true);
    if (near && !near.stuck) { this.game.takePickup(this, near); return; }
    // otherwise pull the best one in range: favour the aim direction
    let p = null, best = Infinity;
    for (const q of this.game.pickups) {
      if (!q.canTake) continue;
      const dx = q.x - this.x, dy = q.y - this.y, d = Math.hypot(dx, dy);
      if (d > SP.grabRange) continue;
      const along = (dx * this.aim.x + dy * this.aim.y) / (d || 1);
      const score = d * (1.6 - 0.8 * along);
      if (score < best) { best = score; p = q; }
    }
    if (!p || p.stuck && !(p.weapon && p.weapon.recall)) return;
    if (p.weapon && p.weapon.mode === 'stuck' && p.weapon.recall) { p.weapon.thrower = this; p.weapon.pickup = p; p.weapon.recall(this); return; }
    const dx = this.x - p.x, dy = this.y - p.y, m = Math.hypot(dx, dy) || 1;
    p.stuck = false;
    const sp = clamp(m * 2.4, 700, 1500);
    p.vx = (dx / m) * sp; p.vy = (dy / m) * sp - 160; p.yankedBy = this; p.yankT = 0.9;
    sfx.webStick();
    this.game.fx.line(this.x, this.y, p.x, p.y, 'rgba(255,255,255,0.7)', 1.5, 0.15, false);
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
    const reach = (SP.femur + SP.tibia) * 0.97 * this.sz;
    const g = this.ground;
    const nx = g ? g.nx : this.up.x, ny = g ? g.ny : this.up.y;
    const tx = -ny, ty = nx;
    const speed = Math.hypot(this.vx, this.vy);
    if (this.pushOff) { this.pushOff.t -= dt; if (this.pushOff.t <= 0) this.pushOff = null; }
    // airborne and closing on a surface? (feet reach for it)
    this.catchSurface = null;
    if (!g && speed > 150) {
      const look = clamp(speed * 0.12, 30, 140) + r + this.lift;
      const hit = world.raycast(this.x, this.y, this.vx, this.vy, look);
      if (hit && clingableSolid(hit.solid)) this.catchSurface = { x: hit.x, y: hit.y, nx: hit.nx, ny: hit.ny, tx: -hit.ny, ty: hit.nx };
    }
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
        L.hold = true; L.holdKind = hold.kind || 'web'; L.planted = false; L.t = 1; L.solid = null;
        continue;
      }
      if (L.hold) { L.hold = false; L.planted = false; L.t = 1; }
      if (g) {
        // ideal foothold: along the surface, leading in the walk direction
        const lead = clamp(((this.vx * tx + this.vy * ty) * 0.07), -r, r);
        const ox = this.x + tx * (L.side * L.off * r + lead) * 0.9, oy = this.y + ty * (L.side * L.off * r + lead) * 0.9;
        let hit = world.raycast(ox, oy, -nx, -ny, (r + this.lift) * 2.2);
        if (!hit) hit = world.raycast(this.x, this.y, tx * L.side * 0.8 - nx, ty * L.side * 0.8 - ny, reach + r);
        if (hit) {
          L.tx = hit.x; L.ty = hit.y;
          const far = Math.hypot(L.fx - L.tx, L.fy - L.ty);
          const tooFar = Math.hypot(L.fx - hipX, L.fy - hipY) > (L.F + L.T) * 1.02;
          if ((!L.planted && L.t >= 1) || ((far > r * 1.25 || tooFar) && L.t >= 1 && !anyStep[1 - L.g])) {
            L.sx = L.fx; L.sy = L.fy; L.t = 0; L.planted = false; anyStep[L.g] = true;
            L.solid = hit.solid; const lp = hit.solid.inv(hit); L.lx = lp.x; L.ly = lp.y;
            L.tN = { x: nx, y: ny };
          }
        } else if (L.t >= 1) {
          L.planted = false;
        }
      } else {
        // just jumped: planted feet stay put a moment, so the legs stretch and push
        if (this.pushOff && this.pushOff.t > 0 && L.planted) { L.t = 1; continue; }
        L.planted = false;
        let ax, ay;
        const catchAt = this.catchSurface;
        if (catchAt) {
          // about to land: feet reach out and spread along the surface ahead
          const off = (L.side * L.off * r) * 0.9;
          ax = catchAt.x + catchAt.tx * off + catchAt.nx * 2; ay = catchAt.y + catchAt.ty * off + catchAt.ny * 2;
        } else {
          // flying: legs trail the motion; at speed they tuck in, slow they splay
          const tuck = clamp(1.15 - speed / 1600, 0.45, 1);
          const spread = L.side * (0.7 + L.off * 0.55) * tuck;
          ax = this.x + spread * r * 1.05 - clamp(this.vx * 0.03, -22, 22);
          ay = this.y + r * (1.2 * tuck + 0.3 * Math.sin(this.time * 9 + i)) - clamp(this.vy * 0.02, -16, 16);
        }
        L.tx = ax; L.ty = ay;
        const k = Math.min(1, dt * (catchAt ? 22 : 14));
        L.fx = lerp(L.fx, ax, k); L.fy = lerp(L.fy, ay, k);
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
      const ext = (SP.femur + SP.tibia) * 0.85 * this.sz * Math.sin(Math.min(1, (0.22 - this.flingT) / 0.08) * Math.PI / 2);
      out.set(i, { x: this.x + d.x * ext, y: this.y + d.y * ext });
      return out;
    }
    // swinging: legs on the free side grip the web thread
    if (this.web && this.web.state !== 'fly') {
      const d = this.webDir();
      const wside = this.weapon ? -(this.holdSide || this.facing) : 0;
      const reach = (SP.femur + SP.tibia) * this.sz;
      for (const side of wside ? [wside] : [1, -1]) {
        const i = this.legs.findIndex((L) => L.side === side && L.off === LEGS[1].off);
        // feet on the thread itself, one a little above the other (hand over hand)
        const along = reach * (side === 1 ? 0.8 : 0.64) + Math.sin(this.time * 7 + side) * 3;
        out.set(i, { x: this.x + d.x * along, y: this.y + d.y * along });
      }
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
    out.set(grip, { ...hands[0], kind: 'weapon' });
    if (hands[1]) out.set(this.legs.findIndex((L) => L.side === side && L.off === LEGS[0].off), { ...hands[1], kind: 'weapon' });
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
    const len = SP.coxa * (0.8 + 0.4 * k) * this.sz;
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
    const coxaCol = back ? shade(c.dark, 0.5) : c.dark;
    for (const L of this.legs) {
      if (far === 'hold' ? !(L.hold && L.holdKind !== 'weapon') : far === 'arm' ? !(L.hold && L.holdKind === 'weapon') : (L.far !== far || L.hold)) continue;
      // hip on the body, then a short base segment angled up and out
      const { hipX, hipY, cx, cy } = this.legRoot(L, nx, ny, tx, ty);
      let fx = L.fx, fy = L.fy;
      let dx = fx - cx, dy = fy - cy;
      let d = Math.hypot(dx, dy) || 1;
      const F = L.F, T = L.T;
      const max = (F + T) * 0.999;
      if (d > max) { fx = cx + dx / d * max; fy = cy + dy / d * max; dx = fx - cx; dy = fy - cy; d = max; }
      // two-bone IK, knee bent up/out: away from the surface, outward from the body
      const a = Math.acos(clamp((F * F + d * d - T * T) / (2 * F * d), -1, 1));
      const base = Math.atan2(dy, dx);
      const k1 = base + a, k2 = base - a;
      const ux = nx + tx * L.side * 0.5, uy = ny + ty * L.side * 0.5;
      const ka = Math.cos(k1) * ux + Math.sin(k1) * uy > Math.cos(k2) * ux + Math.sin(k2) * uy ? k1 : k2;
      const kx = cx + Math.cos(ka) * F, ky = cy + Math.sin(ka) * F;
      const w = (back ? 0.85 : 1) * this.sz;
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
    ctx.lineJoin = 'round';
    // the wrapped part: from where it's stuck, around each corner, to the
    // last pivot (the free part to the spider is drawn below, with sag)
    if (w.state !== 'fly' && w.pivots && w.pivots.length) {
      const base = this.webBase();
      const pts = [base, ...w.pivots];
      for (const [col, lw] of [[rgba(this.color.main, 0.55), 4], ['#ffffff', 1.6]]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (const q of pts.slice(1)) ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
    }
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
      const st = this.webBase();
      // the silk splat where it sticks (a fixed random twist per web)
      if (w.splatRot === undefined) w.splatRot = rand(0, TAU);
      if (!drawWebSplat(ctx, st.x, st.y, w.target ? 18 : 26, w.splatRot)) {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(st.x, st.y, 3.5, 0, TAU); ctx.fill();
      }
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
    // player ring: only when another spider on the board wears the same
    // character and they need telling apart (each look is otherwise unique)
    if (this.game.spiders.some((o) => o !== this && o.alive && o.castIndex === this.castIndex)) {
      ctx.strokeStyle = this.color.main;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(this.x, this.y, r + 2.5, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (this.weapon && this.weapon.drawBehind) this.weapon.drawBehind(ctx);
    const tilt = (this.lean || 0) + clamp(Math.atan2(this.up.x, -this.up.y), -0.45, 0.45) + (this.ground ? Math.sin(this.time * 14) * Math.min(1, Math.hypot(this.vx, this.vy) / 300) * 0.06 : clamp(this.vx * 0.0004, -0.3, 0.3));
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
    // the leg wielding the weapon is drawn over the body: you see the arm work
    this.drawLegs(ctx, 'arm');
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

// true if nothing solid lies on the line (with a little tolerance at the ends)
function clearLine(world, ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay);
  if (d < 12) return true;
  const hit = world.segment(ax, ay, bx, by);
  return !hit || hit.t > d - 10;
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
