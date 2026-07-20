// The player: a round robot with two articulated, physically simulated arms.
//
// This models Heave Ho's character physics as closely as possible:
//
//  - Each arm is a real physics chain: 4 rigid segments pinned end-to-end
//    from a shoulder on the SIDE of the body to a hand body at the tip.
//    Arms drape, lag, whip and rest on the ground like noodles.
//  - The stick is a positional SERVO, and magnitude matters: the hand is
//    driven toward  stick × armReach  relative to the body, with a capped
//    muscle force. Half-deflection = half-extended arm.
//  - Holding LT/RT closes that hand; a closed hand that touches anything
//    grabbable gets pinned to it (a real revolute constraint).
//  - While a hand is pinned, the stick STEERS THE BODY around the grip:
//    the body is driven toward  grip + stick × armReach — push where you
//    want to go, and the free hand points the same way, leading to the
//    next hold. Everything falls out of this one rule: swing pumping,
//    windmilling, holding horizontal, chin-ups (partial deflection),
//    climbing over ledges (push up-toward the ledge), handstands (grip
//    the floor and push up), and hold-direction + alternate-trigger
//    monkey-bar traversal.
//  - Free hands physically push off floors and walls (the muscle force on
//    a blocked hand reacts on the body), so hops, crawls and wall shoves
//    are emergent rather than scripted. There is NO direct air control.
//  - Left and right arms are distinct: separate shoulders, mirrored claws
//    (left gripper has 2 prongs, right has 3).
//
// A conservative rope-clamp keeps chains from overstretching under extreme
// loads; it only engages beyond full arm extension.

import { clamp, lerp, angDiff, TAU } from './util.js';
import { drawHead } from './heads.js';
import { sfx } from './audio.js';

const M = window.Matter;

export const CAT = { SOLID: 0x0001, PLAYER: 0x0002, ROPE: 0x0004, BALLOON: 0x0008, ARM: 0x0010, HAND: 0x0020 };

export const PLAYER_COLORS = [
  { main: '#ff5d6c', dark: '#b03544', name: 'RED' },
  { main: '#4da3ff', dark: '#2a63b8', name: 'BLUE' },
  { main: '#ffd94d', dark: '#bd9a1f', name: 'GOLD' },
  { main: '#5fe08b', dark: '#2c9c58', name: 'GREEN' },
];

export const CFG = {
  radius: 21,
  density: 0.0016,
  friction: 0.45,
  frictionStatic: 0.7,
  frictionAir: 0.012,
  restitution: 0.18,    // bodies boing a little off surfaces
  // arm rig
  segCount: 4,
  segLen: 17,
  segThick: 7,
  segDensity: 0.0009,
  segFrictionAir: 0.02,
  handRadius: 7.5,
  handDensity: 0.0012,
  shoulderFrac: 0.85,   // shoulder distance from center, in body radii
  stickGain: 1.25,      // stick response: full arm extension by ~80% deflection
  // muscle servo — forces in multiples of body weight
  muscleGrab: 3.6,      // cap while that hand is gripping (drives the body)
  liftBoost: 3.2,       // extra grip strength when hauling ANOTHER player —
                        // being a "living anchor" that hoists a friend is a
                        // core co-op move, so lifting a teammate's full rig
                        // needs far more than the force that moves your own
  muscleFree: 1.6,      // cap while the hand is free (drives the hand)
  satDist: 22,          // position error (px) at which the muscle saturates
  satAng: 0.55,         // angular error (rad) at which the swing motor saturates
  dampTan: 0.012,       // tangential damping while gripping (low: windmills live)
  dampRad: 0.08,        // radial damping while gripping (kills rubber-banding)
  dampFree: 0.04,
  rollAssist: 0.009,    // tiny hidden roll torque from the stick (playability;
                        // strong enough to un-chock a body resting on its own
                        // wedged arm)
  grabAssist: 18,       // how close a closed hand must be to latch
  maxSpeed: 28,         // px/tick hard cap on the body (anti-tunneling)
  maxHandSpeed: 34,
  punchCooldown: 1.4,
  punchChargeTime: 1.0,  // seconds of holding B for a fully charged blast
  punchRadius: 100, punchKick: 13, punchSelf: 3.5,
  superRadius: 175, superKick: 20, superSelf: 6,
  respawnDelay: 1.2,
  protectTime: 1.5,
};

// shoulder→hand length at full extension
export const ARM_REACH = CFG.segCount * CFG.segLen + 6;

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

function capMag(v, max) {
  const m = Math.hypot(v.x, v.y);
  if (m <= max || m === 0) return v;
  return { x: (v.x / m) * max, y: (v.y / m) * max };
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
    this.arms = [];
    this.resetMatchStats();
  }

  resetMatchStats() {
    this.score = 0;
    this.deaths = 0;
  }

  // Called at the start of every level (and on respawn).
  spawn(engine, x, y) {
    this.engine = engine;
    this.state = 'alive';
    this.finishOrder = -1;
    this.finishTime = 0;
    this.respawnAt = 0;
    this.protectUntil = 0;
    this.punchCd = 0;
    this.punchFx = 0;
    this.punchAngle = 0;
    this.punchCharge = -1;   // -1 idle; >=0 seconds B has been held
    this.superPunch = false;
    this.face = 1;
    this.spawnPoint = { x, y };
    this.buildRig(x, y);
  }

  buildRig(x, y) {
    const group = -(this.slot + 1);   // player never collides with itself
    const bodies = [], joints = [];

    this.body = M.Bodies.circle(x, y, CFG.radius, {
      density: CFG.density,
      friction: CFG.friction,
      frictionStatic: CFG.frictionStatic,
      frictionAir: CFG.frictionAir,
      restitution: CFG.restitution,
      label: 'player' + this.slot,
      collisionFilter: { group, category: CAT.PLAYER, mask: CAT.SOLID | CAT.PLAYER | CAT.BALLOON | CAT.HAND },
      plugin: { hh: { type: 'player', player: this, grab: true } },
    });
    bodies.push(this.body);

    this.arms = [];
    for (const side of [-1, 1]) {
      const shoulderLocal = { x: side * CFG.radius * CFG.shoulderFrac, y: 0 };
      const sx = x + shoulderLocal.x, sy = y;
      const segs = [];
      const armJoints = [];
      for (let i = 0; i < CFG.segCount; i++) {
        // built FOLDED at the shoulder (it unfurls under gravity) — building
        // extended could embed the hand inside a floor or wall
        const seg = M.Bodies.rectangle(sx, sy + 2 + i * 2, CFG.segLen, CFG.segThick, {
          angle: Math.PI / 2,
          density: CFG.segDensity,
          friction: 0.2,
          frictionAir: CFG.segFrictionAir,
          restitution: 0,
          collisionFilter: { group, category: CAT.ARM, mask: CAT.SOLID },
          plugin: { hh: { type: 'arm', player: this, grab: false } },
        });
        segs.push(seg);
        armJoints.push(M.Constraint.create({
          bodyA: i === 0 ? this.body : segs[i - 1],
          pointA: i === 0 ? { ...shoulderLocal } : { x: CFG.segLen / 2, y: 0 },
          bodyB: seg,
          pointB: { x: -CFG.segLen / 2, y: 0 },
          length: 0,
          stiffness: 1,
        }));
      }
      const hand = M.Bodies.circle(sx, sy + 12, CFG.handRadius, {
        density: CFG.handDensity,
        friction: 0.4,
        frictionAir: 0.02,
        restitution: 0,
        collisionFilter: { group, category: CAT.HAND, mask: CAT.SOLID | CAT.PLAYER | CAT.BALLOON },
        plugin: { hh: { type: 'hand', player: this, grab: true } },
      });
      armJoints.push(M.Constraint.create({
        bodyA: segs[CFG.segCount - 1],
        pointA: { x: CFG.segLen / 2, y: 0 },
        bodyB: hand,
        pointB: { x: 0, y: 0 },
        length: 0,
        stiffness: 1,
      }));
      bodies.push(...segs, hand);
      joints.push(...armJoints);
      this.arms.push({
        side, shoulderLocal, segs, hand,
        joints: armJoints,
        grab: null, trig: 0, src: null, spreadRot: 0,
      });
    }

    this.rigBodies = bodies;
    this.rigJoints = joints;
    M.Composite.add(this.engine.world, [...bodies, ...joints]);
  }

  removeRig() {
    for (const arm of this.arms) this.releaseArm(arm);
    this.body.plugin.hh.removed = true;
    for (const arm of this.arms) arm.hand.plugin.hh.removed = true;
    M.Composite.remove(this.engine.world, this.rigJoints);
    M.Composite.remove(this.engine.world, this.rigBodies);
  }

  weight(g) {
    return this.body.mass * g.engine.gravity.y * g.engine.gravity.scale;
  }

  // Move the whole rig (debug / tests). Arms are folded against the body so
  // they can't arrive embedded in a floor or wall — they unfurl on their own.
  teleport(x, y) {
    M.Body.setPosition(this.body, { x, y });
    M.Body.setVelocity(this.body, { x: 0, y: 0 });
    M.Body.setAngularVelocity(this.body, 0);
    for (const arm of this.arms) {
      const sh = this.shoulderWorld(arm);
      arm.segs.forEach((seg, i) => {
        M.Body.setPosition(seg, { x: sh.x, y: sh.y + 2 + i * 2 });
        M.Body.setAngle(seg, Math.PI / 2);
        M.Body.setVelocity(seg, { x: 0, y: 0 });
        M.Body.setAngularVelocity(seg, 0);
      });
      M.Body.setPosition(arm.hand, { x: sh.x, y: sh.y + 12 });
      M.Body.setVelocity(arm.hand, { x: 0, y: 0 });
      M.Body.setAngularVelocity(arm.hand, 0);
    }
  }

  shoulderWorld(arm) { return localToWorld(this.body, arm.shoulderLocal); }

  anchorWorld(grab) { return localToWorld(grab.body, grab.local); }

  releaseArm(arm) {
    if (!arm.grab) return;
    M.Composite.remove(this.engine.world, arm.grab.constraint);
    arm.grab = null;
    arm.gripDrive = null;
  }

  releaseAll() { for (const a of this.arms) this.releaseArm(a); }

  // Other players letting go of me (I died / finished / got super-punched).
  static breakGrabsOn(target, players) {
    for (const p of players) {
      for (const a of p.arms) {
        if (a.grab && a.grab.body.plugin.hh.player === target) p.releaseArm(a);
      }
    }
  }

  // ------------------------------------------------------------------ update

  update(dt, ctrl, g) {
    if (this.state === 'dead') {
      if (g.time >= this.respawnAt && (g.state === 'play' || g.state === 'lobby')) this.respawn(g);
      return;
    }
    if (this.state !== 'alive') return;

    const A = this.body;
    const W = this.weight(g);
    const controls = g.controlsEnabled();

    // --- each stick drives its OWN arm (Heave Ho's twin-stick scheme:
    // left stick = left arm, right stick = right arm; an idle stick's arm
    // just dangles as a noodle). Body steering while gripping still blends
    // both sticks, below.
    const lAct = ctrl.l.mag > 0.01, rAct = ctrl.r.mag > 0.01;
    let srcL = lAct ? ctrl.l : null, srcR = rAct ? ctrl.r : null;
    let spread = 0;

    // punching thrusts both hands along the aim for a moment
    this.punchFx = Math.max(0, this.punchFx - dt);
    if (this.punchFx > 0) {
      const p = { x: Math.cos(this.punchAngle), y: Math.sin(this.punchAngle), mag: 1 };
      srcL = srcR = p;
      spread = 0.1;
    }

    // Body steering while gripping BLENDS every deflected stick (clamped
    // sum): left stick up + right stick right steers up-right at full
    // strength no matter which hand is latched. Free arms still aim with
    // their own stick.
    let steer = null;
    if (this.punchFx > 0) steer = srcL;
    else if (lAct && rAct) {
      const sx = ctrl.l.x + ctrl.r.x, sy = ctrl.l.y + ctrl.r.y;
      const m = Math.hypot(sx, sy);
      if (m > 0.01) {
        const k = Math.min(1, m) / m;
        steer = { x: sx * k, y: sy * k, mag: Math.min(1, m) };
      }
    } else steer = srcL || srcR;
    this.steer = controls ? steer : null;

    this.arms[0].src = controls ? srcL : null;
    this.arms[1].src = controls ? srcR : null;
    this.arms[0].spreadRot = -spread;
    this.arms[1].spreadRot = spread;
    this.arms[0].trig = controls ? ctrl.lt : 0;
    this.arms[1].trig = controls ? ctrl.rt : 0;
    const move = controls ? (srcL || srcR) : null;
    if (move && Math.abs(move.x) > 0.3) this.face = Math.sign(move.x);

    for (const arm of this.arms) {
      // gripping arms steer by the stick BLEND; free arms aim with their own
      const src = arm.grab ? this.steer : arm.src;

      // Target hand offset relative to the body: stick vector × reach.
      // MAGNITUDE MATTERS (easing the stick toward a grip reels you in for a
      // pull-up), but the response curve reaches full extension by ~80%
      // deflection so arms feel crisp, like Heave Ho.
      let T = null;
      if (src) {
        const gx = src.x * CFG.stickGain, gy = src.y * CFG.stickGain;
        const gm = Math.hypot(gx, gy);
        const k = gm > 1 ? 1 / gm : 1;
        const c = Math.cos(arm.spreadRot), s = Math.sin(arm.spreadRot);
        const tx = gx * k, ty = gy * k;
        T = {
          x: (tx * c - ty * s) * ARM_REACH,
          y: (tx * s + ty * c) * ARM_REACH,
        };
      }

      if (arm.grab) {
        if (arm.grab.body.plugin.hh.removed) { this.releaseArm(arm); continue; }
        if (arm.trig < 0.25) { this.releaseArm(arm); continue; }

        // Matter's constraint solver never rotates anchors on STATIC bodies
        // (it assumes statics don't spin) — but spinners are statics rotated
        // via setAngle, so a latched pin would stay at the original WORLD
        // spot while the blade turns away. Keep the pin riding the surface
        // by re-aiming its local anchor with the body's current angle.
        {
          const Bg = arm.grab.body;
          if (Bg.isStatic && Bg.angle !== 0) {
            const gl = arm.grab.local;
            const cg = Math.cos(Bg.angle), sg = Math.sin(Bg.angle);
            arm.grab.constraint.pointB.x = gl.x * cg - gl.y * sg;
            arm.grab.constraint.pointB.y = gl.x * sg + gl.y * cg;
          }
        }

        if (T) {
          // The gripping arm is torque + length control around the pivot,
          // like a real limb — NOT a point-chasing spring (that pulls along
          // the chord when you windmill and never builds orbital speed).
          //   tangential: full-strength motor rotating the body around the
          //     grip until the arm points along the stick
          //   radial: proportional control of arm length toward |T|
          //     (easing the stick toward the grip reels you in — pull-ups)
          // Control frame is anchored at the BODY CENTER: the shoulder orbits
          // the center as the body spins, and controlling from it feeds
          // torque back into the frame and destabilizes windmills.
          const B = arm.grab.body;
          const anchor = this.anchorWorld(arm.grab);
          const rx = A.position.x - anchor.x, ry = A.position.y - anchor.y;
          const rd = Math.hypot(rx, ry) || 0.001;
          const u = { x: rx / rd, y: ry / rd };          // grip -> body
          const tx = -u.y, ty = u.x;                     // tangent (+CCW)

          // While gripping, the stick steers the BODY: desired radial
          // direction is ALONG the stick ("push where you want to go" —
          // free arms meanwhile lead the same way, which is what makes
          // hold-a-direction + alternate-triggers climbing and monkey-bar
          // traversal flow). Desired radius = stick extension + shoulder.
          const Tm = Math.hypot(T.x, T.y) || 0.001;
          const radTarget = Tm + CFG.radius * CFG.shoulderFrac;
          const wx = T.x / Tm, wy = T.y / Tm;
          const wantAng = Math.atan2(wy, wx);
          const bodyAng = Math.atan2(u.y, u.x);

          const vB = velocityAtPoint(B, anchor);
          const rvx = A.velocity.x - vB.x, rvy = A.velocity.y - vB.y;
          const vt = rvx * tx + rvy * ty;
          const vr = rvx * u.x + rvy * u.y;

          // Track the angular error CONTINUOUSLY (unwrapped) while driven:
          // when a windmilling stick gets more than half a turn ahead, a
          // shortest-path error would flip sign and brake the swing. The
          // accumulated error knows the target is "ahead", keeps pulling
          // forward, and is capped just past a half-turn of extra lead so a
          // wedged arm un-winds quickly when the player reverses.
          if (!arm.gripDrive) {
            const c0 = u.x * wy - u.y * wx, d0 = u.x * wx + u.y * wy;
            arm.gripDrive = { err: Math.atan2(c0, d0), prevWant: wantAng, prevBody: bodyAng };
          } else {
            const gd = arm.gripDrive;
            gd.err += angDiff(gd.prevWant, wantAng) - angDiff(gd.prevBody, bodyAng);
            gd.err = clamp(gd.err, -4.5, 4.5);
            gd.prevWant = wantAng;
            gd.prevBody = bodyAng;
          }
          // The unwrap only matters while a swing is chasing a leading
          // stick. With no real swing, snap back to the shortest path —
          // otherwise an instant stick FLIP (e.g. down to up) reads as
          // "target went half a turn around", parking the error near ±2π
          // where every motor gates off: a total-paralysis deadlock.
          if (Math.abs(vt) < 1.2) {
            const gd = arm.gripDrive;
            while (gd.err > Math.PI) gd.err -= 2 * Math.PI;
            while (gd.err < -Math.PI) gd.err += 2 * Math.PI;
          }
          const angErr = arm.gripDrive.err;

          // Near 180° (pressing straight toward/through the anchor) the
          // rotation direction is ambiguous:
          //  - a REAL swing (serious tangential speed) keeps its momentum,
          //    so windmills never brake at the crossing
          //  - a REEL-IN intent (radial target well inside the current
          //    radius, i.e. a chin-up) fades the rotation motor and lets
          //    the radial control pull the body straight in
          //  - otherwise (full-extension press past the anchor, e.g.
          //    flipping over a ledge from rest) keep full torque
          let dir = Math.sign(angErr || 1);
          let tanScale = clamp(Math.abs(angErr) / CFG.satAng, 0, 1);
          if (Math.abs(angErr) > 2.6) {
            if (Math.abs(vt) > 1.2) dir = Math.sign(vt);
            else if (radTarget < rd - 8) tanScale *= clamp((Math.PI - Math.abs(angErr)) / 0.5, 0, 1);
          }

          // Hauling another player's whole rig needs far more force than
          // moving your own body — grabbing a teammate (their body or hand)
          // multiplies the muscle so you can hoist them like a winch.
          const liftGrab = B.plugin.hh.player && B.plugin.hh.player !== this;
          const gm = CFG.muscleGrab * (liftGrab ? CFG.liftBoost : 1);

          const Ft = gm * W * tanScale * dir
                   - vt * CFG.dampTan * W;
          const radCap = gm * W * 0.9;
          let Fr = clamp((radTarget - rd) * (gm * W / CFG.satDist), -radCap, radCap);
          // Only push OUTWARD when roughly pointed at the target — extending
          // at full force while 90°+ off-angle grinds the body into whatever
          // is behind it (e.g. the floor at the base of a wall you grabbed).
          // Full extension within ~45° of the target, none beyond ~110°.
          // Pulling IN (chin-ups) keeps full authority at any angle.
          if (Fr > 0) Fr *= clamp((1.9 - Math.abs(angErr)) / 1.2, 0, 1);
          Fr -= vr * CFG.dampRad * W;

          const F = capMag({ x: u.x * Fr + tx * Ft, y: u.y * Fr + ty * Ft }, gm * W * 1.4);
          M.Body.applyForce(A, A.position, F);
          if (!B.isStatic) {
            const hh = B.plugin.hh;
            if (hh.type === 'rope' && hh.ropeSegs) {
              // Rope swings are THE mechanic, and dumping the whole reaction
              // on the featherweight grabbed segment cancels them: the push
              // on the body and the pull on the tail are an internal pair, so
              // the pendulum as a whole never gains momentum. Physically a
              // rope transmits tension along itself but resolves bending
              // loads at its anchor mount — so split the reaction: the
              // radial (tension) part stays on the grabbed segment (climbing
              // still tugs the tail), the tangential (bending) part lands on
              // the topmost segment beside the static anchor, where its
              // lever arm is tiny. Net effect: steering the body torques the
              // whole pendulum around the anchor, exactly like Heave Ho.
              const fr = F.x * u.x + F.y * u.y;
              const ft = F.x * tx + F.y * ty;
              M.Body.applyForce(B, anchor, { x: -u.x * fr, y: -u.y * fr });
              const top = hh.ropeSegs[0];
              M.Body.applyForce(top, top.position, { x: -tx * ft, y: -ty * ft });
            } else {
              M.Body.applyForce(B, anchor, { x: -F.x, y: -F.y });
            }
          }
        } else {
          arm.gripDrive = null;   // stick neutral while gripping = dangle
        }
      } else {
        arm.gripDrive = null;
        if (T) {
          // Drive the free hand toward the target. The equal-and-opposite
          // reaction on the body is what makes pushing off floors/walls,
          // flail-hops and arm-swimming work.
          // Target is based on the body CENTER (not the shoulder, which
          // rotates with the body — aim must stay world-absolute even while
          // tumbling), with a world-space lateral spread so the two hands
          // sit side by side instead of overlapping.
          const hand = arm.hand;
          const Tm2 = Math.hypot(T.x, T.y) || 1;
          const offX = arm.side * (-T.y / Tm2) * 14;
          const offY = arm.side * (T.x / Tm2) * 14;
          const desired = { x: A.position.x + T.x + offX, y: A.position.y + T.y + offY };
          const err = { x: desired.x - hand.position.x, y: desired.y - hand.position.y };
          let F = capMag({
            x: err.x * (CFG.muscleFree * W / CFG.satDist),
            y: err.y * (CFG.muscleFree * W / CFG.satDist),
          }, CFG.muscleFree * W);
          F = capMag({
            x: F.x - (hand.velocity.x - A.velocity.x) * CFG.dampFree * W,
            y: F.y - (hand.velocity.y - A.velocity.y) * CFG.dampFree * W,
          }, CFG.muscleFree * W * 1.3);
          M.Body.applyForce(hand, hand.position, F);
          M.Body.applyForce(A, A.position, { x: -F.x, y: -F.y });
        }
        // closed hand latches onto anything grabbable it touches
        if (arm.trig > 0.3 && controls) this.tryLatch(arm, g);
      }
    }

    // tiny hidden roll assist (Heave Ho-style games are unplayable without a
    // whisper of it) + mild spin damping so heads don't rotate forever
    if (move) {
      M.Body.setAngularVelocity(A, clamp(A.angularVelocity + move.x * CFG.rollAssist, -0.7, 0.7));
    }
    M.Body.setAngularVelocity(A, A.angularVelocity * 0.99);

    // --- punch: tap B for a quick shove, HOLD B to charge a big blast.
    // The push fires on RELEASE, scaled by how long B was held (Heave Ho's
    // AoE push, plus the charge-up house rule).
    this.punchCd = Math.max(0, this.punchCd - dt);
    if (controls) {
      if (ctrl.pressed.b && this.punchCd <= 0 && this.punchCharge < 0) {
        this.punchCharge = 0;
        // shake off anyone gripping you the INSTANT B is pressed — you don't
        // have to wait for the charged blast to escape a grapple
        Player.breakGrabsOn(this, g.players);
      }
      if (this.punchCharge >= 0) {
        if (ctrl.b) this.punchCharge = Math.min(CFG.punchChargeTime, this.punchCharge + dt);
        else {
          this.doPunch(move, g, this.punchCharge / CFG.punchChargeTime);
          this.punchCharge = -1;
        }
      }
    } else this.punchCharge = -1;
  }

  tryLatch(arm, g) {
    const hand = arm.hand;
    const hx = hand.position.x, hy = hand.position.y;
    const R = CFG.grabAssist;
    const candidates = g.grabCandidates(this);
    const near = M.Query.region(candidates, {
      min: { x: hx - R - 8, y: hy - R - 8 }, max: { x: hx + R + 8, y: hy + R + 8 },
    });
    let best = null, bestD = Infinity, bestPt = null;
    for (const b of near) {
      const hh = b.plugin.hh;
      if (!hh || !hh.grab || hh.removed) continue;
      if (hh.player === this) continue;                 // never grab yourself
      const pt = closestPointOnBody(b, { x: hx, y: hy });
      const d = Math.hypot(pt.x - hx, pt.y - hy);
      if (d < R && d < bestD) { bestD = d; best = b; bestPt = pt; }
    }
    if (best) {
      const constraint = M.Constraint.create({
        bodyA: hand,
        pointA: { x: 0, y: 0 },
        bodyB: best,
        // For STATIC bodies Matter treats pointB as a plain world offset from
        // the center (it never rotates static anchors), so give it the world
        // offset; for dynamic bodies it must be body-local. Spinner grips are
        // re-aimed every frame in the arm loop to keep riding the blade.
        pointB: best.isStatic
          ? { x: bestPt.x - best.position.x, y: bestPt.y - best.position.y }
          : worldToLocal(best, bestPt),
        length: 0,
        stiffness: 1,
      });
      M.Composite.add(this.engine.world, constraint);
      arm.grab = { body: best, local: worldToLocal(best, bestPt), constraint };
      g.particles.dust(bestPt.x, bestPt.y, 4);
      sfx.grab();
    }
  }

  doPunch(move, g, charge = 0) {
    // t 0..1: how charged the punch is. A ⭐ super glove fires at full charge
    // with an extra multiplier on top no matter how briefly B was tapped.
    const t = clamp(charge, 0, 1);
    const isSuper = this.superPunch;
    this.superPunch = false;
    this.punchCd = CFG.punchCooldown;
    const aim = move && move.mag > 0.05
      ? { x: move.x / move.mag, y: move.y / move.mag }
      : { x: this.face, y: 0 };
    this.punchAngle = Math.atan2(aim.y, aim.x);
    this.punchFx = 0.22;

    const A = this.body;
    const R = isSuper ? CFG.superRadius : lerp(CFG.punchRadius, CFG.superRadius, t);
    const kick = isSuper ? CFG.superKick * (1 + 0.35 * t) : lerp(CFG.punchKick, CFG.superKick, t);
    const selfKick = isSuper ? CFG.superSelf : lerp(CFG.punchSelf, CFG.superSelf, t);
    const big = isSuper || t > 0.6;
    // small self-lunge
    M.Body.setVelocity(A, {
      x: A.velocity.x + aim.x * selfKick,
      y: A.velocity.y + aim.y * selfKick,
    });

    // Heave Ho's push: anyone holding on to ME lets go, always
    Player.breakGrabsOn(this, g.players);

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
      if (big) Player.breakGrabsOn(p, g.players);       // and shake off grapplers
      g.particles.burst(B.position.x, B.position.y, '#ffffff', big ? 14 : 8, 200 + 140 * t);
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

    g.particles.ring(A.position.x + aim.x * 30, A.position.y + aim.y * 30, R, big ? '#ffd94d' : '#ffffff');
    g.addShake(isSuper ? 14 : 5 + 8 * t);
    if (big) sfx.superPunch(); else sfx.punch();
  }

  // Safety clamps, run after the physics step:
  //  - the body can't drift beyond full arm extension from an active grip
  //  - free hands can't overstretch their chain
  solveGrabs() {
    const A = this.body;
    const maxReach = CFG.radius * CFG.shoulderFrac + ARM_REACH + 8;
    for (const arm of this.arms) {
      if (arm.grab) {
        const B = arm.grab.body;
        if (B.plugin.hh.removed) { this.releaseArm(arm); continue; }
        const P = this.anchorWorld(arm.grab);
        const dx = A.position.x - P.x, dy = A.position.y - P.y;
        const d = Math.hypot(dx, dy) || 0.001;
        if (d <= maxReach) continue;
        const n = { x: dx / d, y: dy / d };
        const err = d - maxReach;
        const invA = 1 / A.mass;
        const invB = B.isStatic ? 0 : 1 / B.mass;
        const k = 1 / (invA + invB);
        const corr = Math.min(err, 14) * 0.6;
        M.Body.setPosition(A, { x: A.position.x - n.x * corr * invA * k, y: A.position.y - n.y * corr * invA * k });
        if (invB) M.Body.setPosition(B, { x: B.position.x + n.x * corr * invB * k, y: B.position.y + n.y * corr * invB * k });
        const vB = velocityAtPoint(B, P);
        const rvx = A.velocity.x - vB.x, rvy = A.velocity.y - vB.y;
        const vr = rvx * n.x + rvy * n.y;
        if (vr > 0) {
          M.Body.setVelocity(A, { x: A.velocity.x - n.x * vr * invA * k, y: A.velocity.y - n.y * vr * invA * k });
          if (invB) M.Body.setVelocity(B, { x: B.velocity.x + n.x * vr * invB * k, y: B.velocity.y + n.y * vr * invB * k });
        }
      } else {
        // free-chain guard
        const sh = this.shoulderWorld(arm);
        const hand = arm.hand;
        const dx = hand.position.x - sh.x, dy = hand.position.y - sh.y;
        const d = Math.hypot(dx, dy);
        const lim = ARM_REACH * 1.35;
        if (d > lim) {
          M.Body.setPosition(hand, { x: sh.x + (dx / d) * lim, y: sh.y + (dy / d) * lim });
        }
      }
    }
  }

  clampSpeed() {
    const v = this.body.velocity;
    const s = Math.hypot(v.x, v.y);
    if (s > CFG.maxSpeed) {
      M.Body.setVelocity(this.body, { x: (v.x / s) * CFG.maxSpeed, y: (v.y / s) * CFG.maxSpeed });
    }
    for (const arm of this.arms) {
      const hv = arm.hand.velocity;
      const hs = Math.hypot(hv.x, hv.y);
      if (hs > CFG.maxHandSpeed) {
        M.Body.setVelocity(arm.hand, { x: (hv.x / hs) * CFG.maxHandSpeed, y: (hv.y / hs) * CFG.maxHandSpeed });
      }
    }
  }

  die(g) {
    if (this.state !== 'alive') return;
    this.state = 'dead';
    this.deaths++;
    this.respawnAt = g.time + CFG.respawnDelay;
    Player.breakGrabsOn(this, g.players);
    g.particles.burst(this.body.position.x, this.body.position.y, this.color.main, 22, 380);
    this.removeRig();
    g.addShake(6);
    sfx.death();
  }

  respawn(g) {
    this.state = 'alive';
    this.protectUntil = g.time + CFG.protectTime;
    this.buildRig(this.spawnPoint.x, this.spawnPoint.y);
  }

  finish(g) {
    if (this.state !== 'alive') return;
    this.state = 'finished';
    this.finishOrder = g.finishCounter++;
    this.finishTime = g.raceTime;
    Player.breakGrabsOn(this, g.players);
    this.removeRig();
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

    // gaze follows the stick, else velocity; the face rotates with the body
    const move = this.arms[0].src || this.arms[1].src;
    let look;
    if (move) look = { x: move.x, y: move.y };
    else look = { x: clamp(A.velocity.x / 12, -1, 1), y: clamp(A.velocity.y / 12, -1, 1) };
    drawHead(ctx, A.position.x, A.position.y, CFG.radius, this.color, this.headStyle, look, A.angle);

    // name tag + super-punch marker (upright, above the body)
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
    // charging punch: a ring closes in and burns brighter as it fills
    if (this.punchCharge >= 0) {
      const c = Math.min(1, this.punchCharge / CFG.punchChargeTime);
      const rr = CFG.radius + 26 - c * 18 + Math.sin(t * (8 + c * 18)) * 2;
      ctx.globalAlpha = 0.35 + c * 0.55;
      ctx.strokeStyle = c >= 1 ? '#ffd94d' : '#ffffff';
      ctx.lineWidth = 2 + c * 3;
      ctx.beginPath();
      ctx.arc(A.position.x, A.position.y, rr, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawArm(ctx, arm) {
    ctx.lineCap = 'round';

    // segmented metal chain, drawn from each segment's real physics transform
    const joints = [this.shoulderWorld(arm)];
    for (let i = 0; i < arm.segs.length; i++) {
      const seg = arm.segs[i];
      const c = Math.cos(seg.angle), s = Math.sin(seg.angle);
      const hl = CFG.segLen / 2;
      const a = { x: seg.position.x - c * hl, y: seg.position.y - s * hl };
      const b = { x: seg.position.x + c * hl, y: seg.position.y + s * hl };
      const w = 11 - i * 0.8;
      ctx.strokeStyle = arm.side < 0 ? '#4e5568' : '#565d70';
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = arm.side < 0 ? '#8e97ad' : '#9aa3ba';
      ctx.lineWidth = w - 5;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      joints.push(b);
    }
    // joint bolts
    for (let i = 0; i < joints.length - 1; i++) {
      const p = joints[i];
      const r = i === 0 ? 6 : 4.5 - i * 0.3;
      ctx.fillStyle = '#3c4252';
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#b8c0d4';
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.4, 0, TAU); ctx.fill();
    }
    // shoulder accent in player color
    const sh = joints[0];
    ctx.strokeStyle = this.color.main;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sh.x, sh.y, 7, 0, TAU); ctx.stroke();

    // gripper hand at the physical hand body. Left = 2 prongs, right = 3.
    // Hands are color-coded so you can always tell which arm is which:
    // LEFT hand = blue, RIGHT hand = red.
    const hand = arm.hand;
    const last = arm.segs[arm.segs.length - 1];
    const handAng = Math.atan2(hand.position.y - last.position.y, hand.position.x - last.position.x);
    const closed = !!arm.grab || arm.trig > 0.3;
    const hc = arm.side < 0
      ? { main: '#3d8bff', light: '#bcd8ff', dark: '#23508f' }    // LEFT = blue
      : { main: '#ff4d54', light: '#ffc0c3', dark: '#9c2a2f' };   // RIGHT = red
    ctx.save();
    ctx.translate(hand.position.x, hand.position.y);
    ctx.rotate(handAng);
    // wrist ring
    ctx.strokeStyle = hc.dark;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(-8, 0, 6, 0, TAU); ctx.stroke();
    // palm
    ctx.fillStyle = hc.main;
    ctx.beginPath(); ctx.arc(0, 0, CFG.handRadius - 1, 0, TAU); ctx.fill();
    ctx.strokeStyle = hc.dark; ctx.lineWidth = 2; ctx.stroke();
    // claw prongs
    ctx.strokeStyle = hc.light;
    ctx.lineWidth = 5;
    const open = closed ? 0.28 : 0.85;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(2, s * 6);
      ctx.quadraticCurveTo(9 + Math.cos(open) * 4, s * (6 + Math.sin(open) * 9), 13, s * (closed ? 2.5 : 9));
      ctx.stroke();
    }
    if (arm.side > 0) {
      // right hand's short middle prong
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(3, 0);
      ctx.lineTo(closed ? 10 : 8, 0);
      ctx.stroke();
    }
    ctx.restore();
  }
}
