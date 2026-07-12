// The player: a round robot head with two grabby robot arms.
//
// Control model (the heart of the game):
//  - Each arm aims where its stick points (left stick -> left arm, right
//    stick -> right arm). If only one stick is used, both arms follow it
//    with a small spread, like Heave Ho.
//  - Holding LT/RT closes that hand; a closed hand latches onto anything
//    grabbable it touches.
//  - While latched the arm is a stiff robot limb: a rope constraint keeps the
//    body within arm's length, a slack-spring extends the arm when compressed
//    (so you can do handstands / push yourself off walls), and the stick
//    drives a tangential "motor" that swings the body around the grip point.
//    The convention is Heave Ho's: the stick points where you want your
//    HANDS relative to your BODY, so hanging from a ceiling and holding
//    left swings your body right, and holding down flips you up over a ledge.
//  - Release the trigger mid-swing to fling.
//  - B: punch — knocks nearby players flying and breaks their grip.
//    Grabbing a power-up glove turns your next punch into a super punch.

import { clamp, lerp, angDiff, angApproach, TAU } from './util.js';
import { drawHead } from './heads.js';
import { sfx } from './audio.js';

const M = window.Matter;

export const CAT = { SOLID: 0x0001, PLAYER: 0x0002, ROPE: 0x0004, BALLOON: 0x0008 };

export const PLAYER_COLORS = [
  { main: '#ff5d6c', dark: '#b03544', name: 'RED' },
  { main: '#4da3ff', dark: '#2a63b8', name: 'BLUE' },
  { main: '#ffd94d', dark: '#bd9a1f', name: 'GOLD' },
  { main: '#5fe08b', dark: '#2c9c58', name: 'GREEN' },
];

export const CFG = {
  radius: 21,
  armLength: 66,        // grip anchor to body-center, fully extended
  density: 0.0016,
  friction: 0.45,
  frictionStatic: 0.7,
  frictionAir: 0.012,
  restitution: 0.05,
  grabRange: 26,        // how far from the hand tip a latch can reach
  armForce: 3.0,        // tangential swing motor, in multiples of body weight
  extendForce: 1.7,     // max radial push when the arm is compressed (x weight)
  handPush: 1.6,        // free hands shoving off surfaces (x weight)
  airForce: 0.5,        // airborne drift (x weight)
  rollSpin: 0.0045,     // angular velocity added per tick from stick when free
  maxSpeed: 26,         // px per tick (~1560 px/s) hard cap, prevents tunneling
  punchCooldown: 1.4,
  punchRadius: 100, punchKick: 11, punchSelf: 3.5,
  superRadius: 175, superKick: 19, superSelf: 6,
  respawnDelay: 1.2,
  protectTime: 1.5,
};

// ---------------------------------------------------------------------------
// geometry helpers

function worldToLocal(body, p) {
  const c = Math.cos(-body.angle), s = Math.sin(-body.angle);
  const dx = p.x - body.position.x, dy = p.y - body.position.y;
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

function localToWorld(body, p) {
  const c = Math.cos(body.angle), s = Math.sin(body.angle);
  return {
    x: body.position.x + p.x * c - p.y * s,
    y: body.position.y + p.x * s + p.y * c,
  };
}

// Velocity of a point rigidly attached to a body (includes spin — matters for
// riding spinners and moving platforms).
function velocityAtPoint(body, p) {
  return {
    x: body.velocity.x - body.angularVelocity * (p.y - body.position.y),
    y: body.velocity.y + body.angularVelocity * (p.x - body.position.x),
  };
}

function closestOnSegment(ax, ay, bx, by, px, py) {
  const abx = bx - ax, aby = by - ay;
  const len2 = abx * abx + aby * aby || 1;
  const t = clamp(((px - ax) * abx + (py - ay) * aby) / len2, 0, 1);
  return { x: ax + abx * t, y: ay + aby * t };
}

// Closest point on the body's SURFACE (never an interior point — a grab
// anchored inside a solid could never swing around it).
export function closestPointOnBody(body, p) {
  const parts = body.parts.length > 1 ? body.parts.slice(1) : body.parts;
  let best = null, bestD = Infinity;
  for (const part of parts) {
    let q;
    if (part.circleRadius) {
      const dx = p.x - part.position.x, dy = p.y - part.position.y;
      const d = Math.hypot(dx, dy) || 1;
      q = {
        x: part.position.x + (dx / d) * part.circleRadius,
        y: part.position.y + (dy / d) * part.circleRadius,
      };
    } else {
      q = null;
      let qd = Infinity;
      const vs = part.vertices;
      for (let i = 0; i < vs.length; i++) {
        const a = vs[i], b = vs[(i + 1) % vs.length];
        const c = closestOnSegment(a.x, a.y, b.x, b.y, p.x, p.y);
        const d2 = (c.x - p.x) ** 2 + (c.y - p.y) ** 2;
        if (d2 < qd) { qd = d2; q = c; }
      }
    }
    const d2 = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d2 < bestD) { bestD = d2; best = q; }
  }
  return best;
}

// ---------------------------------------------------------------------------

export class Player {
  constructor(slot, sourceId, headStyle = 0) {
    this.slot = slot;
    this.sourceId = sourceId;
    this.headStyle = headStyle;
    this.color = PLAYER_COLORS[slot];
    this.name = 'P' + (slot + 1);
    this.score = 0;
    this.body = null;
    this.arms = [
      { side: -1, angle: Math.PI / 2 + 0.4, grab: null, src: null, trig: 0, reach: 0.94 },
      { side: 1, angle: Math.PI / 2 - 0.4, grab: null, src: null, trig: 0, reach: 0.94 },
    ];
    this.resetMatchStats();
  }

  resetMatchStats() {
    this.score = 0;
    this.deaths = 0;
  }

  // Called at the start of every level.
  spawn(engine, x, y) {
    this.state = 'alive';
    this.finishOrder = -1;
    this.finishTime = 0;
    this.respawnAt = 0;
    this.protectUntil = 0;
    this.punchCd = 0;
    this.punchFx = 0;
    this.punchAngle = 0;
    this.superPunch = false;
    this.face = 1;
    this.spawnPoint = { x, y };
    for (const a of this.arms) { a.grab = null; a.angle = Math.PI / 2 + a.side * 0.4; }
    this.body = M.Bodies.circle(x, y, CFG.radius, {
      density: CFG.density,
      friction: CFG.friction,
      frictionStatic: CFG.frictionStatic,
      frictionAir: CFG.frictionAir,
      restitution: CFG.restitution,
      label: 'player' + this.slot,
      collisionFilter: { category: CAT.PLAYER, mask: CAT.SOLID | CAT.PLAYER | CAT.BALLOON },
      plugin: { hh: { type: 'player', player: this, grab: true } },
    });
    M.Composite.add(engine.world, this.body);
  }

  weight(g) {
    return this.body.mass * g.engine.gravity.y * g.engine.gravity.scale;
  }

  releaseArm(arm) { arm.grab = null; }

  releaseAll() { for (const a of this.arms) a.grab = null; }

  // Other players letting go of me (I died / finished / got super-punched).
  static breakGrabsOn(target, players) {
    for (const p of players) {
      for (const a of p.arms) {
        if (a.grab && a.grab.body === target.body) a.grab = null;
      }
    }
  }

  anchorWorld(grab) { return localToWorld(grab.body, grab.local); }

  handPos(arm) {
    if (arm.grab) return this.anchorWorld(arm.grab);
    return {
      x: this.body.position.x + Math.cos(arm.angle) * CFG.armLength * arm.reach,
      y: this.body.position.y + Math.sin(arm.angle) * CFG.armLength * arm.reach,
    };
  }

  // ------------------------------------------------------------------ update

  update(dt, ctrl, g) {
    if (this.state === 'dead') {
      if (g.time >= this.respawnAt && g.state === 'play') this.respawn(g);
      return;
    }
    if (this.state !== 'alive') return;

    const A = this.body;
    const W = this.weight(g);
    const controls = g.controlsEnabled();

    // --- decide which stick drives which arm (shared-stick spread like Heave Ho)
    const lAct = ctrl.l.mag > 0.01, rAct = ctrl.r.mag > 0.01;
    let srcL = null, srcR = null, spread = 0;
    if (lAct && rAct) { srcL = ctrl.l; srcR = ctrl.r; }
    else if (lAct) { srcL = srcR = ctrl.l; spread = 0.26; }
    else if (rAct) { srcL = srcR = ctrl.r; spread = 0.26; }
    this.arms[0].src = controls ? srcL : null;
    this.arms[1].src = controls ? srcR : null;
    this.arms[0].trig = controls ? ctrl.lt : 0;
    this.arms[1].trig = controls ? ctrl.rt : 0;
    const move = controls ? (srcL || srcR) : null;
    if (move && Math.abs(move.x) > 0.3) this.face = Math.sign(move.x);

    let anyGrab = false;

    for (const arm of this.arms) {
      const src = arm.src;
      if (arm.grab) {
        // Grabbed body vanished (balloon popped, player died...)?
        if (arm.grab.body.plugin.hh.removed) { arm.grab = null; continue; }
        if (arm.trig < 0.25) { arm.grab = null; continue; }
        anyGrab = true;

        const P = this.anchorWorld(arm.grab);
        const dx = A.position.x - P.x, dy = A.position.y - P.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const n = { x: dx / d, y: dy / d };           // grip -> body
        arm.angle = Math.atan2(-dy, -dx);             // arm points body -> hand
        const B = arm.grab.body;
        const dynB = !B.isStatic;

        if (src && src.mag > 0.02) {
          // Tangential motor: rotate body around the grip so the arm points
          // along the stick.
          const sm = Math.hypot(src.x, src.y) || 1;
          const wantX = -src.x / sm, wantY = -src.y / sm;    // desired n
          const cross = n.x * wantY - n.y * wantX;
          const dot = n.x * wantX + n.y * wantY;
          const dAng = Math.atan2(cross, dot);
          // Near 180° the rotation direction is ambiguous — keep whatever
          // swing momentum exists rather than always picking the same side.
          let dir = Math.sign(dAng || 1);
          if (Math.abs(dAng) > 2.6) {
            const vt = -A.velocity.x * n.y + A.velocity.y * n.x;
            if (Math.abs(vt) > 0.4) dir = Math.sign(vt);
          }
          const f = CFG.armForce * W * src.mag * clamp(Math.abs(dAng) / 0.55, 0, 1) * dir;
          const fx = -n.y * f, fy = n.x * f;
          M.Body.applyForce(A, A.position, { x: fx, y: fy });
          if (dynB) M.Body.applyForce(B, P, { x: -fx, y: -fy });
        }

        // Slack spring: stiff robot arm pushes back to full extension when
        // compressed (handstands, vaulting off walls).
        if (d < CFG.armLength * 0.98) {
          const compress = (CFG.armLength - d) / CFG.armLength;
          const f = Math.min(CFG.extendForce, compress * 7) * W;
          M.Body.applyForce(A, A.position, { x: n.x * f, y: n.y * f });
          if (dynB) M.Body.applyForce(B, P, { x: -n.x * f, y: -n.y * f });
          // damp radial bounce
          const vr = A.velocity.x * n.x + A.velocity.y * n.y;
          M.Body.setVelocity(A, { x: A.velocity.x - n.x * vr * 0.08, y: A.velocity.y - n.y * vr * 0.08 });
        }
      } else {
        // Free arm: aim at the stick (or dangle), push off surfaces, latch.
        let target, rate;
        if (this.punchFx > 0) {
          target = this.punchAngle; rate = 40;
        } else if (src) {
          target = Math.atan2(src.y, src.x) + arm.side * spread; rate = 18;
        } else {
          target = Math.PI / 2 + arm.side * 0.42; rate = 5;
        }
        arm.angle = angApproach(arm.angle, target, rate * dt);
        arm.reach = lerp(arm.reach, arm.trig > 0.25 ? 1.0 : 0.94, 12 * dt);

        const hx = A.position.x + Math.cos(arm.angle) * CFG.armLength * arm.reach;
        const hy = A.position.y + Math.sin(arm.angle) * CFG.armLength * arm.reach;

        // Shove off any solid surface the open hand is touching (lets you
        // hop, crawl and kip up off the floor).
        if (src && src.mag > 0.3 && Math.abs(angDiff(arm.angle, target)) < 0.7) {
          const touching = M.Query.point(g.level.pushables, { x: hx, y: hy });
          if (touching.length) {
            const f = CFG.handPush * W * src.mag;
            M.Body.applyForce(A, A.position, { x: -Math.cos(arm.angle) * f, y: -Math.sin(arm.angle) * f });
          }
        }

        // Closed hand latches onto anything grabbable it touches.
        if (arm.trig > 0.3 && controls) this.tryLatch(arm, hx, hy, g);
      }
    }

    // --- free-body control: air drift + rolling
    if (!anyGrab && move) {
      M.Body.applyForce(A, A.position, { x: move.x * CFG.airForce * W, y: 0 });
      const spin = clamp(A.angularVelocity + move.x * CFG.rollSpin, -0.7, 0.7);
      M.Body.setAngularVelocity(A, spin);
    }
    // mild spin damping so heads don't rotate forever
    M.Body.setAngularVelocity(A, A.angularVelocity * 0.995);

    // --- punch
    this.punchCd = Math.max(0, this.punchCd - dt);
    this.punchFx = Math.max(0, this.punchFx - dt);
    if (controls && ctrl.pressed.b && this.punchCd <= 0) this.doPunch(move, g);
  }

  tryLatch(arm, hx, hy, g) {
    const R = CFG.grabRange;
    const candidates = g.grabCandidates(this);
    const near = M.Query.region(candidates, {
      min: { x: hx - R, y: hy - R }, max: { x: hx + R, y: hy + R },
    });
    let best = null, bestD = Infinity, bestPt = null;
    for (const b of near) {
      if (b === this.body) continue;
      const hh = b.plugin.hh;
      if (!hh || !hh.grab || hh.removed) continue;
      const pt = closestPointOnBody(b, { x: hx, y: hy });
      const d = Math.hypot(pt.x - hx, pt.y - hy);
      if (d < R && d < bestD) { bestD = d; best = b; bestPt = pt; }
    }
    if (best) {
      arm.grab = { body: best, local: worldToLocal(best, bestPt) };
      arm.angle = Math.atan2(bestPt.y - this.body.position.y, bestPt.x - this.body.position.x);
      g.particles.dust(bestPt.x, bestPt.y, 4);
      sfx.grab();
    }
  }

  doPunch(move, g) {
    const isSuper = this.superPunch;
    this.superPunch = false;
    this.punchCd = CFG.punchCooldown;
    const aim = move && move.mag > 0.05
      ? { x: move.x / move.mag, y: move.y / move.mag }
      : { x: this.face, y: 0 };
    this.punchAngle = Math.atan2(aim.y, aim.x);
    this.punchFx = 0.22;

    const A = this.body;
    const R = isSuper ? CFG.superRadius : CFG.punchRadius;
    const kick = isSuper ? CFG.superKick : CFG.punchKick;
    // small self-lunge
    M.Body.setVelocity(A, {
      x: A.velocity.x + aim.x * (isSuper ? CFG.superSelf : CFG.punchSelf),
      y: A.velocity.y + aim.y * (isSuper ? CFG.superSelf : CFG.punchSelf),
    });

    for (const p of g.players) {
      if (p === this || p.state !== 'alive') continue;
      const B = p.body;
      const dx = B.position.x - A.position.x, dy = B.position.y - A.position.y;
      const d = Math.hypot(dx, dy);
      if (d > R + CFG.radius) continue;
      const dir = d > 1 ? { x: dx / d, y: dy / d } : aim;
      M.Body.setVelocity(B, {
        x: B.velocity.x + dir.x * kick,
        y: B.velocity.y + dir.y * kick - 2,
      });
      p.releaseAll();                                   // knock their grip loose
      if (isSuper) Player.breakGrabsOn(p, g.players);   // and shake off grapplers
      g.particles.burst(B.position.x, B.position.y, '#ffffff', 8, 200);
    }
    for (const bl of g.level.balloons) {
      if (!bl.body || bl.body.plugin.hh.removed) continue;
      const dx = bl.body.position.x - A.position.x, dy = bl.body.position.y - A.position.y;
      const d = Math.hypot(dx, dy);
      if (d > R + 30) continue;
      M.Body.setVelocity(bl.body, {
        x: bl.body.velocity.x + (dx / (d || 1)) * kick * 0.8,
        y: bl.body.velocity.y + (dy / (d || 1)) * kick * 0.8,
      });
    }

    g.particles.ring(A.position.x + aim.x * 30, A.position.y + aim.y * 30, R, isSuper ? '#ffd94d' : '#ffffff');
    g.addShake(isSuper ? 14 : 5);
    if (isSuper) sfx.superPunch(); else sfx.punch();
  }

  // Enforce the arm-length rope for every latched arm. Runs after the physics
  // step, a few iterations so both arms + partner constraints settle.
  solveGrabs() {
    const A = this.body;
    for (const arm of this.arms) {
      if (!arm.grab) continue;
      const B = arm.grab.body;
      if (B.plugin.hh.removed) { arm.grab = null; continue; }
      const P = this.anchorWorld(arm.grab);
      const dx = A.position.x - P.x, dy = A.position.y - P.y;
      const d = Math.hypot(dx, dy) || 0.001;
      if (d <= CFG.armLength) continue;
      const n = { x: dx / d, y: dy / d };
      const err = d - CFG.armLength;
      const invA = 1 / A.mass;
      const invB = B.isStatic ? 0 : 1 / B.mass;
      const k = 1 / (invA + invB);

      // position correction (keeps velocity: setPosition without updateVelocity)
      const corr = Math.min(err, 14) * 0.6;
      M.Body.setPosition(A, { x: A.position.x - n.x * corr * invA * k, y: A.position.y - n.y * corr * invA * k });
      if (invB) M.Body.setPosition(B, { x: B.position.x + n.x * corr * invB * k, y: B.position.y + n.y * corr * invB * k });

      // kill separating radial velocity
      const vB = velocityAtPoint(B, P);
      const rvx = A.velocity.x - vB.x, rvy = A.velocity.y - vB.y;
      const vr = rvx * n.x + rvy * n.y;
      if (vr > 0) {
        M.Body.setVelocity(A, { x: A.velocity.x - n.x * vr * invA * k, y: A.velocity.y - n.y * vr * invA * k });
        if (invB) M.Body.setVelocity(B, { x: B.velocity.x + n.x * vr * invB * k, y: B.velocity.y + n.y * vr * invB * k });
      }
    }
  }

  clampSpeed() {
    const v = this.body.velocity;
    const s = Math.hypot(v.x, v.y);
    if (s > CFG.maxSpeed) {
      M.Body.setVelocity(this.body, { x: (v.x / s) * CFG.maxSpeed, y: (v.y / s) * CFG.maxSpeed });
    }
  }

  die(g) {
    if (this.state !== 'alive') return;
    this.state = 'dead';
    this.deaths++;
    this.respawnAt = g.time + CFG.respawnDelay;
    this.releaseAll();
    Player.breakGrabsOn(this, g.players);
    this.body.plugin.hh.removed = true;
    M.Composite.remove(g.engine.world, this.body);
    g.particles.burst(this.body.position.x, this.body.position.y, this.color.main, 22, 380);
    g.addShake(6);
    sfx.death();
  }

  respawn(g) {
    this.state = 'alive';
    this.protectUntil = g.time + CFG.protectTime;
    const b = this.body;
    b.plugin.hh.removed = false;
    M.Body.setPosition(b, { x: this.spawnPoint.x, y: this.spawnPoint.y });
    M.Body.setVelocity(b, { x: 0, y: 0 });
    M.Body.setAngularVelocity(b, 0);
    M.Body.setAngle(b, 0);
    M.Composite.add(g.engine.world, b);
    for (const a of this.arms) { a.grab = null; a.angle = Math.PI / 2 + a.side * 0.4; }
  }

  finish(g) {
    if (this.state !== 'alive') return;
    this.state = 'finished';
    this.finishOrder = g.finishCounter++;
    this.finishTime = g.raceTime;
    this.releaseAll();
    Player.breakGrabsOn(this, g.players);
    this.body.plugin.hh.removed = true;
    M.Composite.remove(g.engine.world, this.body);
    g.particles.confetti(g.level.goal.x, g.level.goal.y, 44);
    sfx.finish();
  }

  // -------------------------------------------------------------------- draw

  draw(ctx, g) {
    if (this.state !== 'alive') return;
    const A = this.body;
    const t = g.time;
    const flicker = t < this.protectUntil && Math.floor(t * 14) % 2 === 0;
    ctx.globalAlpha = flicker ? 0.35 : 1;

    for (const arm of this.arms) this.drawArm(ctx, arm);

    // gaze follows the stick, else velocity
    const move = this.arms[0].src || this.arms[1].src;
    let look = { x: 0, y: 0 };
    if (move) look = { x: move.x, y: move.y };
    else look = { x: clamp(A.velocity.x / 12, -1, 1), y: clamp(A.velocity.y / 12, -1, 1) };
    const tilt = clamp(A.angularVelocity * 2.2, -0.3, 0.3);
    drawHead(ctx, A.position.x, A.position.y, CFG.radius, this.color, this.headStyle, look, tilt);

    // name tag + super-punch marker
    ctx.globalAlpha = flicker ? 0.35 : 0.85;
    ctx.fillStyle = this.color.main;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.name, A.position.x, A.position.y - CFG.radius - 12);
    if (this.superPunch) {
      const bob = Math.sin(t * 6) * 3;
      ctx.font = '15px system-ui, sans-serif';
      ctx.fillStyle = '#ffd94d';
      ctx.fillText('★', A.position.x, A.position.y - CFG.radius - 27 + bob);
    }
    ctx.globalAlpha = 1;
  }

  drawArm(ctx, arm) {
    const A = this.body;
    const hand = this.handPos(arm);
    const dirA = Math.atan2(hand.y - A.position.y, hand.x - A.position.x);
    const shoulder = {
      x: A.position.x + Math.cos(dirA + arm.side * 0.55) * CFG.radius * 0.8,
      y: A.position.y + Math.sin(dirA + arm.side * 0.55) * CFG.radius * 0.8,
    };
    // two-segment IK elbow
    const mx = (shoulder.x + hand.x) / 2, my = (shoulder.y + hand.y) / 2;
    const dx = hand.x - shoulder.x, dy = hand.y - shoulder.y;
    const d = Math.hypot(dx, dy) || 0.001;
    const seg = Math.max(d / 2 + 0.5, 42);
    const bulge = Math.sqrt(Math.max(0, seg * seg - (d / 2) ** 2));
    const elbow = { x: mx + (-dy / d) * bulge * arm.side, y: my + (dx / d) * bulge * arm.side };

    ctx.lineCap = 'round';
    // upper arm + forearm, metal
    for (const [p1, p2, w] of [[shoulder, elbow, 11], [elbow, hand, 9]]) {
      ctx.strokeStyle = '#565d70';
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      ctx.strokeStyle = '#9aa3ba';
      ctx.lineWidth = w - 5;
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    // joints
    for (const [p, r] of [[shoulder, 6], [elbow, 5]]) {
      ctx.fillStyle = '#3c4252';
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#b8c0d4';
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.4, 0, TAU); ctx.fill();
    }

    // gripper hand
    const handAng = Math.atan2(hand.y - elbow.y, hand.x - elbow.x);
    const closed = !!arm.grab || arm.trig > 0.3;
    const open = closed ? 0.28 : 0.85;
    ctx.save();
    ctx.translate(hand.x, hand.y);
    ctx.rotate(handAng);
    // wrist ring in player color
    ctx.strokeStyle = this.color.main;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(-7, 0, 6, 0, TAU); ctx.stroke();
    // palm
    ctx.fillStyle = '#7c8499';
    ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#3c4252'; ctx.lineWidth = 2; ctx.stroke();
    // claw prongs
    ctx.strokeStyle = '#c3cadd';
    ctx.lineWidth = 5;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(2, s * 6);
      ctx.quadraticCurveTo(9 + Math.cos(open) * 4, s * (6 + Math.sin(open) * 9), 13, s * (closed ? 2.5 : 9));
      ctx.stroke();
    }
    ctx.restore();
  }
}
