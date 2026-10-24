// A battle unit: active ragdoll + controller + personality-driven AI.
import { THREE, clamp, lerp, rand, angleDiff, damp, pick, ballisticAngle, eulerYZX, smooth } from './util.js';
import { makeSkeleton, NPARTS, PART } from './body.js';
import { computePose, newPose, STYLE_ANIM } from './pose.js';
import { Ragdoll } from './ragdoll.js';
import { ITEMS, gripDir, heldLayout, shieldDef, itemMass, itemSpan } from './items.js';
import { FIELD } from './world.js';
import { EXT } from './ext.js';
import { RAPIER, GROUPS, itemGroups } from './physics.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _yawQ = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

// Muscle tuning per part: [gain, rate, torque cap per kg of unit mass, max spin rad/s]
const MUSCLE = [
  [10, 22, 5.5], // pelvis
  [12, 26, 8.5], // chest
  [9, 18, 0.9], // head
  [26, 32, 4.5, 26], [28, 32, 2.6, 30], // thigh, shin L
  [26, 32, 4.5, 26], [28, 32, 2.6, 30], // R
  [18, 30, 1.9], [18, 30, 1.2], // arm L
  [18, 30, 1.9], [18, 30, 1.2], // arm R
];

// Window of the attack animation (0..1) in which the weapon deals damage.
const STRIKE = {
  overhead: [[0.46, 0.97]], slam: [[0.46, 0.97]], stab: [[0.4, 0.9]],
  dual: [[0.3, 0.6], [0.47, 0.85]], punch: [[0.36, 0.8]],
};

// Stepping: the physical leg trails its target by a few frames, so a swinging foot
// is aimed SWING_LEAD seconds ahead (and lowered YLEAD times that early) so it lands
// on time instead of skidding in; a foot plants where it actually touches down.
const SWING_LEAD = 0.03, YLEAD = 1.5;

export const EXPR = { normal: 0, angry: 1, scared: 2, dead: 3, happy: 4, hurt: 5 };

let nextId = 1;

export class Unit {
  constructor(battle, def, team, x, z, yaw) {
    this.id = nextId++;
    this.battle = battle;
    this.def = def;
    this.team = team;
    this.skel = makeSkeleton(def.build);
    this.maxHp = def.hp;
    this.hp = def.hp;
    this.alive = true;
    this.heading = yaw;
    this.pose = newPose();
    this.worldTarget = newPose();
    this.prevTarget = newPose();
    this.hasPrev = false;
    this.st = {
      phase: rand(0, 6), amp: 0, lean: 0, style: def.weapon.style, attack: null, attackT: 0,
      headPitch: 0, headYaw: 0, mode: 'normal', t: rand(0, 10), crouch: 0, seed: rand(0, 10),
    };
    computePose(this.st, this.pose);
    const gy = battle.terrain.height(x, z);
    this.spawn = new THREE.Vector3(x, gy, z);
    this.spawnYaw = yaw;
    this.rag = new Ragdoll(battle.world, this.skel, new THREE.Vector3(x, gy, z), yaw, this.pose);
    this.M = this.skel.totalMass;
    this.s = this.skel.scale;
    this.initLegs();
    this.initHeld();

    this.target = null;
    this.retarget = rand(0, 0.5);
    this.cooldown = rand(0.2, 1.0);
    this.attackDur = 0.8;
    this.hitSet = new Set();
    this.stun = 0;
    this.recover = 1;
    this.fleeT = 0;
    this.fled = false;
    this.buff = 0;
    this.expr = EXPR.normal;
    this.exprT = 0;
    this.talkT = rand(1, 6);
    this.deadT = 0;
    this.killer = null;
    this.desired = new THREE.Vector3();
    this.control = null; // possession input
    this.released = false;
    this.lastHitBy = null;
    this.healPulse = 0;
    this.airT = 0;
    this.kills = 0;
    this.damageDealt = 0;

    // pack-defined behaviour for this weapon kind (src/ext.js), and extra rigid bodies
    this.kind = EXT.kinds[def.weapon.kind] || null;
    this.extras = [];

    // Weapon hit geometry, in forearm-local space.
    this.weapons = [];
    const w = def.weapon;
    const addW = (item, part) => {
      const it = ITEMS[item] || ITEMS.none;
      const dir = gripDir(it, new THREE.Vector3());
      const hand = new THREE.Vector3(0, -this.skel.handOffset, 0);
      const s = this.s;
      const back = it.back ? it.back * it.len : 0;
      const a = hand.clone().addScaledVector(dir, (it.center ? -it.len / 2 : -back) * s + (it.len - back) * 0.25 * s);
      const b = hand.clone().addScaledVector(dir, ((it.center ? it.len / 2 : it.len - back)) * s);
      if (item === 'none') { a.set(0, 0, 0); b.copy(hand).multiplyScalar(1.4); }
      this.weapons.push({ part, a, b, r: Math.max(0.08, it.r * s), prevTip: new THREE.Vector3(), tipVel: new THREE.Vector3(), first: true });
    };
    if (w.kind === 'melee' || w.kind === 'bard' || w.kind === 'heal' || this.kind?.melee) {
      if (w.style === 'dual') { addW(w.item, PART.farmL); addW(w.item2 || w.item, PART.farmR); }
      else if (w.style === 'fists') { addW('none', PART.farmL); addW('none', PART.farmR); }
      else addW(w.item || 'none', PART.farmR);
    }
    this.anim = w.anim || STYLE_ANIM[w.style] || 'punch';
    {
      const it = ITEMS[w.style === 'fists' ? 'none' : w.item] || ITEMS.none;
      const len = it.center ? it.len / 2 : it.len * (1 - (it.back || 0));
      const arm = 0.54 * (def.build.arms || 1);
      this.reachDist = (0.3 + 0.55 * arm + 0.6 * len) * this.s;
    }
    if (w.kind === 'ranged') this.attackDur = w.windup || 1.0;
    else if (w.kind === 'heal') this.attackDur = 1.2;
    else this.attackDur = clamp(w.cooldown * 0.75, 0.45, 1.1) * Math.sqrt(Math.max(1, this.s));
  }

  get pos() { return this.rag.pos[PART.pelvis]; }
  get chestPos() { return this.rag.pos[PART.chest]; }
  get headPos() { return this.rag.pos[PART.head]; }

  forward(out) { return out.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }

  isDown() {
    // chest up axis
    _v.set(0, 1, 0).applyQuaternion(this.rag.quat[PART.chest]);
    return _v.y < 0.45;
  }

  // ----------------------------------------------------------------- AI
  think(dt) {
    const b = this.battle, def = this.def, w = def.weapon, p = this.pos;
    this.desired.set(0, 0, 0);
    let face = null;
    // berserkers get faster and angrier the more they are hurt
    this.frenzy = def.frenzy ? clamp(1 - this.hp / this.maxHp, 0, 1) : 0;
    const spd = def.speed * (1 + (this.buff > 0 ? 0.2 : 0) + this.frenzy * 0.4);

    if (b.over) {
      this.st.mode = b.winner === this.team ? 'cheer' : 'cower';
      this.expr = b.winner === this.team ? EXPR.happy : EXPR.scared;
      return;
    }
    if (this.control) return this.possessed(dt, spd);

    this.retarget -= dt;
    if (!this.target || !this.target.alive || this.retarget <= 0) {
      this.target = b.nearestEnemy(this, w.kind === 'heal' || w.kind === 'bard' ? 999 : 999);
      this.retarget = rand(0.6, 1.4);
    }
    const t = this.target;
    if (!t) { this.st.mode = 'normal'; return; }
    const dx = t.pos.x - p.x, dz = t.pos.z - p.z;
    const dist = Math.hypot(dx, dz);
    const gap = dist - t.skel.radius - this.skel.radius;
    const dirx = dx / (dist || 1), dirz = dz / (dist || 1);
    const pers = def.personality;

    // Panic
    if (!this.fled && pers.bravery > 0 && this.hp < this.maxHp * pers.bravery && this.stun <= 0) {
      this.fled = true;
      this.fleeT = rand(2.5, 4.5);
      b.voice(this, 'scream');
    }
    if (this.fleeT > 0) {
      this.fleeT -= dt;
      this.desired.set(-dirx * spd * 1.1, 0, -dirz * spd * 1.1);
      this.st.mode = 'cower';
      this.expr = EXPR.scared;
      this.st.attack = null;
      this.separate(spd);
      if (Math.abs(p.x) > FIELD.x + 8 || Math.abs(p.z) > FIELD.z + 6) this.fleeT = 0;
      return;
    }
    this.st.mode = 'normal';

    if (this.kind && this.kind.think) {
      face = this.kind.think(this, dt, { t, dist, gap, dirx, dirz, spd }) || null;
    } else if (w.kind === 'melee') {
      face = t;
      this.expr = gap < 6 ? EXPR.angry : EXPR.normal;
      const near = dist - t.skel.radius;
      // advance more or less in line: careful units ahead of their team's front ease off
      let pace = 1;
      if (gap > 8 && pers.aggro < 1 && !def.frenzy) {
        const f = b.front[this.team];
        if (f && (p.x - f.x) * f.dx + (p.z - f.z) * f.dz > 2.5) pace = 0.65;
      }
      if (near > this.reachDist * 0.8) this.desired.set(dirx * spd * pace, 0, dirz * spd * pace);
      else if (near < this.reachDist * 0.4) this.desired.set(-dirx * spd * 0.3, 0, -dirz * spd * 0.3);
      if (near < this.reachDist + 0.35 && this.cooldown <= 0 && !this.st.attack && !this.isDown()) this.startAttack();
      if (this.st.attack) this.desired.multiplyScalar(0.35);
    } else if (w.kind === 'ranged') {
      face = t;
      this.expr = EXPR.normal;
      const shy = pers.aggro < 0.5;
      // close to firing range; shy shooters back off from melee, but only for a
      // limited time and never off the field (no endless kiting)
      this.kiteT = Math.min(3, (this.kiteT ?? 3) + dt * 0.4);
      const cornered = Math.abs(p.x) > FIELD.x - 2 || Math.abs(p.z) > FIELD.z - 2;
      const kiting = shy && dist < w.minRange * 0.6 && this.kiteT > 0 && !cornered && t.def.weapon.kind === 'melee';
      if (dist > w.range * 0.85) this.desired.set(dirx * spd, 0, dirz * spd);
      else if (kiting) { this.desired.set(-dirx * spd * 0.75, 0, -dirz * spd * 0.75); this.kiteT -= dt * 1.4; }
      if (dist < w.range && !this.st.attack && this.cooldown <= 0 && (dist > w.minRange * 0.4 || !kiting)) {
        this.startAttack();
        this.aimAt = t;
      }
      if (this.st.attack) this.desired.multiplyScalar(0.1);
    } else if (w.kind === 'heal' || w.kind === 'bard') {
      // Support units stay behind friends and away from enemies.
      const friend = w.kind === 'heal' ? b.mostHurtAlly(this, 22) : null;
      const anchor = friend || b.allyAnchor(this);
      if (!anchor && !friend) {
        // nobody left to hide behind: fight
        face = t;
        this.expr = EXPR.angry;
        if (dist - t.skel.radius > this.reachDist * 0.8) this.desired.set(dirx * spd, 0, dirz * spd);
        if (dist - t.skel.radius < this.reachDist + 0.3 && this.cooldown <= 0 && !this.st.attack) this.startAttack('punchy');
      } else if (gap < 3.5) {
        this.desired.set(-dirx * spd, 0, -dirz * spd);
        this.expr = EXPR.scared;
        if (dist - t.skel.radius < this.reachDist && this.cooldown <= 0 && !this.st.attack && Math.random() < 0.3) this.startAttack('punchy');
      } else if (anchor) {
        _v.set(anchor.pos.x - dirx * 2.5 - p.x, 0, anchor.pos.z - dirz * 2.5 - p.z);
        const d = _v.length();
        if (d > (friend ? w.radius * 0.5 : 3)) this.desired.copy(_v).multiplyScalar(spd / d * clamp(d / 3, 0.3, 1));
        this.expr = EXPR.normal;
      }
      face = gap < 10 ? t : anchor || t;
      if (w.kind === 'heal' && friend && this.cooldown <= 0 && !this.st.attack &&
          Math.hypot(friend.pos.x - p.x, friend.pos.z - p.z) < w.radius) this.startAttack();
      if (w.kind === 'bard' && !this.st.attack) this.st.mode = 'play';
    }
    this.separate(spd);
    // unstick: wanting to move but going nowhere for a while -> sidestep
    const want = Math.hypot(this.desired.x, this.desired.z);
    const v0 = this.rag.vel[PART.pelvis];
    if (this.sideT > 0) {
      this.sideT -= dt;
      const dx0 = this.desired.x, dz0 = this.desired.z;
      this.desired.x = dx0 * 0.4 - dz0 * this.sideDir;
      this.desired.z = dz0 * 0.4 + dx0 * this.sideDir;
    } else if (want > spd * 0.5 && Math.hypot(v0.x, v0.z) < spd * 0.15 && !this.st.attack) {
      this.stuckT = (this.stuckT || 0) + dt;
      if (this.stuckT > 1.2) { this.stuckT = 0; this.sideT = rand(0.6, 1.1); this.sideDir = Math.random() < 0.5 ? -1 : 1; }
    } else this.stuckT = 0;
    // stay on the battlefield
    const bx = FIELD.x + 8, bz = FIELD.z + 6;
    if (Math.abs(p.x) > bx) this.desired.x -= Math.sign(p.x) * (Math.abs(p.x) - bx) * 2;
    if (Math.abs(p.z) > bz) this.desired.z -= Math.sign(p.z) * (Math.abs(p.z) - bz) * 2;
    if (face) {
      const fy = Math.atan2(face.pos.x - p.x, face.pos.z - p.z);
      this.faceYaw = fy;
    } else if (this.desired.lengthSq() > 0.1) this.faceYaw = Math.atan2(this.desired.x, this.desired.z);
  }

  possessed(dt, spd) {
    const c = this.control;
    // control.block (optional): raise the shield / weapon and brace, moving slowly
    this.blocking = !!c.block && !this.st.attack;
    const mv = this.blocking ? 0.45 : 1.15;
    this.desired.set(c.mx * spd * mv, 0, c.mz * spd * mv);
    this.faceYaw = c.aimYaw;
    this.expr = EXPR.angry;
    this.st.mode = 'normal';
    // pack kinds can take over (steer a mount, crew an engine, dive...); true means
    // the attack button was handled there
    const own = this.kind?.control ? this.kind.control(this, dt, c) : false;
    if (!own && c.attack && !this.blocking && !this.st.attack && this.cooldown <= 0) {
      this.startAttack();
      this.aimAt = null;
    }
    if (c.jump && !this.isDown() && this.groundGap() < 0.3) {
      this.rag.impulseAll(0, this.M * 5.5, 0);
      c.jump = false;
    }
  }

  separate(spd) {
    const b = this.battle, p = this.pos;
    let sx = 0, sz = 0;
    b.grid.query(p.x, p.z, 2.5 * Math.max(1, this.s), (o) => {
      if (o === this || !o.alive) return;
      const dx = p.x - o.pos.x, dz = p.z - o.pos.z;
      const d2 = dx * dx + dz * dz;
      const r = (this.skel.radius + o.skel.radius) * 1.6;
      if (d2 < r * r && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const k = (1 - d / r) * (o.team === this.team ? 1 : 0.4);
        sx += (dx / d) * k; sz += (dz / d) * k;
      }
    });
    this.desired.x += sx * spd * 0.8;
    this.desired.z += sz * spd * 0.8;
  }

  startAttack(kind) {
    this.st.attack = kind === 'punchy' ? 'punch' : this.anim;
    this.st.attackT = 0;
    this.hitSet.clear();
    this.released = false;
    const w = this.def.weapon;
    this.cooldown = w.cooldown * rand(0.85, 1.15) * (this.buff > 0 ? 0.88 : 1) * (1 - 0.35 * (this.frenzy || 0));
    if (Math.random() < 0.35 * this.def.personality.chatter) this.battle.voice(this, 'attack');
    if (w.kind === 'melee') this.battle.sound('whoosh', this.pos, 0.5 * Math.min(2, this.s), 1 / Math.sqrt(this.s));
  }

  groundGap() {
    const p = this.pos;
    return p.y - this.battle.terrain.height(p.x, p.z) - this.skel.standHeight;
  }

  // ----------------------------------------------------------------- legs
  // Procedural stepping: each foot is either planted (its leg is aimed at a
  // fixed spot on the ground, so it stays put while the body walks over it) or
  // swinging to a new spot ahead of the hip. Steps fire when a planted foot
  // strays too far from where it should be, alternating legs - which gives the
  // TABS waddle, shuffles when turning on the spot, and catch-up steps after a shove.
  initLegs() {
    const sk = this.skel, P = sk.parts;
    this.thighLen = P[PART.thighL].hh * 2;
    this.shinLen = P[PART.shinL].hh * 2;
    this.footR = P[PART.shinL].r;
    this.legLen = this.thighLen + this.shinLen;
    this.legs = [PART.thighL, PART.thighR].map((th, k) => ({
      side: k ? -1 : 1, thigh: th, shin: th + 1, hip: sk.joints[k ? 4 : 2],
      state: 'free', plant: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(),
      foot: new THREE.Vector3(), t: 0, dur: 0.25, stanceT: 0, err: 0, hd: 0,
    }));
    this.hipH = this.skel.standHeight;
    this.gaitSwing = 0;
  }

  hipPoint(leg, out) {
    const r = this.rag;
    return out.copy(leg.hip.anchorA).applyQuaternion(r.quat[PART.pelvis]).add(r.pos[PART.pelvis]);
  }

  footPoint(leg, out) {
    return this.rag.worldPoint(leg.shin, 0, -this.shinLen / 2, 0, out);
  }

  // Returns true when the legs are being placed (the pose's leg targets were overwritten).
  updateLegs(dt, grounded) {
    const legs = this.legs, s = this.s, ter = this.battle.terrain;
    if (!grounded) {
      for (const l of legs) l.state = 'free';
      this.hipH = this.skel.standHeight;
      return false;
    }
    const p = this.pos, v = this.rag.vel[PART.pelvis];
    // steer the feet by a blend of actual and wanted velocity (feet lead turns)
    const vx = v.x * 0.6 + this.desired.x * 0.4, vz = v.z * 0.6 + this.desired.z * 0.4;
    const spd = Math.hypot(vx, vz);
    const h = this.heading, ch = Math.cos(h), sh = Math.sin(h);
    const hipX = Math.abs(legs[0].hip.anchorA.x) * 1.15;
    const sq = Math.sqrt(s);
    const base = 0.14 * s;
    // how far a foot can be from under the hip at the current hip height
    const vert = Math.max(0.05, this.hipH - 0.05 * s - this.footR);
    const reach = Math.max(0.2 * s, Math.sqrt(Math.max(0.0025, (this.legLen * 0.98) ** 2 - vert * vert)));
    // swing time; short legs moving fast (halflings) step quicker still: a planted foot
    // only lasts about 2 reaches of travel, and a swing slower than that drags the
    // feet along the ground instead of stepping
    const dur = Math.min(clamp(0.24 - spd * 0.02, 0.13, 0.24) * sq, Math.max(0.055, 2.1 * reach / Math.max(0.5, spd)));
    const lead = Math.min(0.06 * sq, reach * 0.8 / Math.max(0.5, spd));
    for (const l of legs) {
      // ideal spot: under the hip, a little ahead along the velocity
      const hx = p.x + ch * hipX * l.side, hz = p.z - sh * hipX * l.side;
      const ix = hx + vx * lead, iz = hz + vz * lead;
      if (l.state === 'free') {
        this.footPoint(l, l.plant);
        l.plant.y = ter.height(l.plant.x, l.plant.z);
        l.state = 'stance'; l.stanceT = 0;
      }
      if (l.state === 'swing') {
        l.t += dt / l.dur;
        const rem = Math.max(0, 1 - l.t) * l.dur;
        let tx = vx * (rem + lead), tz = vz * (rem + lead);
        const tm = Math.hypot(tx, tz), lim = reach * 0.9 + vx * 0 + spd * rem;
        if (tm > lim) { tx *= lim / tm; tz *= lim / tm; }
        l.to.set(hx + tx, 0, hz + tz);
        if (l.t >= 1) {
          l.state = 'stance'; l.stanceT = 0; l.down = false;
          this.footPoint(l, l.foot);
          // land where the foot actually is if it got close, so it doesn't skate in
          const e = Math.hypot(l.foot.x - l.to.x, l.foot.z - l.to.z);
          if (e < 0.25 * s) l.plant.set(l.foot.x, 0, l.foot.z); else l.plant.copy(l.to);
          l.plant.y = ter.height(l.plant.x, l.plant.z);
          if (s > 1.6 && this.battle.stomp) this.battle.stomp(this, l.plant);
        }
      }
      if (l.state === 'stance') {
        l.stanceT += dt;
        // still coming down: the foot plants where it touches the ground instead of
        // being dragged to the spot it was aimed at (that drag reads as skating)
        if (!l.down) {
          this.footPoint(l, _v3);
          if (_v3.y - this.footR - ter.height(_v3.x, _v3.z) < 0.03 * s || l.stanceT > 0.12) l.down = true;
          else { l.plant.x = _v3.x; l.plant.z = _v3.z; l.plant.y = ter.height(_v3.x, _v3.z); }
        }
        l.err = Math.hypot(l.plant.x - ix, l.plant.z - iz);
        l.hd = Math.hypot(l.plant.x - hx, l.plant.z - hz);
        // a foot ahead of the hip (along the motion) is about to be walked over: leave it
        l.ahead = (l.plant.x - hx) * vx + (l.plant.z - hz) * vz > 0.05 * spd;
      }
    }
    // lift at most one leg per frame: the one that is worst off
    const a = legs[0], b = legs[1];
    const thr = Math.min(base + spd * lead, reach * 1.6);
    let cand = null;
    // fast for the length of its legs (a sprinting halfling): run with a flight phase,
    // lifting a foot before the other has landed, or the planted foot gets dragged
    const flight = spd > this.legLen * 10;
    for (const l of legs) {
      if (l.state !== 'stance') continue;
      const o = l === a ? b : a;
      const need = l.ahead ? l.hd > reach * 1.6 : l.err > thr || l.hd > reach;
      if (!need) continue;
      const otherOk = o.state === 'stance' ? o.stanceT > 0.02 : flight && o.state === 'swing' && o.t > 0.55;
      const desperate = l.hd > reach * 1.5 + 0.1 * s;
      if ((otherOk || desperate) && (!cand || l.err > cand.err)) cand = l;
    }
    if (cand) {
      cand.state = 'swing'; cand.t = 0; cand.dur = dur;
      this.footPoint(cand, cand.from);
      cand.from.y = ter.height(cand.from.x, cand.from.z);
    }
    // aim each leg at its foot target with 2-bone IK
    let hMin = Infinity;
    const lift = (0.1 + Math.min(1, spd / 4) * 0.1) * s;
    for (const l of legs) {
      const F = l.foot;
      if (l.state === 'swing') {
        // the physical leg trails its target by a few frames: aim ahead in time
        const ld = SWING_LEAD * sq / l.dur;
        const f = smooth(clamp(l.t + ld, 0, 1));
        F.lerpVectors(l.from, l.to, f);
        F.y = ter.height(F.x, F.z) + Math.sin(Math.PI * clamp(l.t + ld * YLEAD, 0, 1)) * lift;
      } else {
        F.copy(l.plant);
        F.y -= 0.03 * s; // press into the ground so the planted leg bears weight
      }
      F.y += this.footR;
      this.hipPoint(l, _v3);
      const wx = F.x - _v3.x, wy = F.y - _v3.y, wz = F.z - _v3.z;
      const lx = wx * ch - wz * sh, lz = wx * sh + wz * ch;
      this.legIK(l, lx, wy, lz);
      if (l.state === 'stance') {
        const hd = Math.hypot(lx, lz);
        const hy = Math.sqrt(Math.max(0, (this.legLen * 0.97) ** 2 - hd * hd));
        hMin = Math.min(hMin, l.plant.y + this.footR + hy + 0.05 * s);
      }
    }
    const gy = ter.height(p.x, p.z);
    const SH = this.skel.standHeight;
    const top = SH * (1 - 0.13 * Math.min(1, spd / 3.5));
    const want = hMin === Infinity ? gy + top * 0.97 : clamp(hMin, gy + SH * 0.8, gy + top);
    this.hipH = lerp(this.hipH, want - gy, damp(14, dt));
    // arm swing signal: the opposite arm follows each foot forward
    const fl = legs[0].foot, fr = legs[1].foot;
    const dz = ((fl.x - fr.x) * sh + (fl.z - fr.z) * ch) / Math.max(0.3, reach * 2);
    this.gaitSwing = lerp(this.gaitSwing, clamp(dz, -1, 1), damp(20, dt));
    const rk = (a.state === 'swing' ? 1 : 0) - (b.state === 'swing' ? 1 : 0);
    this.gaitRock = lerp(this.gaitRock || 0, rk * Math.min(1, spd / 2 + 0.3), damp(10, dt));
    return true;
  }

  legIK(l, x, y, z) {
    const a = this.thighLen, b = this.shinLen;
    let L = Math.hypot(x, y, z);
    const nx = x / L, ny = y / L, nz = z / L;
    L = clamp(L, Math.abs(a - b) + 0.05, a + b - 1e-4);
    const pitch = Math.asin(clamp(-nz, -1, 1));
    const roll = Math.atan2(nx, -ny);
    const alpha = Math.acos(clamp((a * a + L * L - b * b) / (2 * a * L), -1, 1));
    const knee = Math.PI - Math.acos(clamp((a * a + b * b - L * L) / (2 * a * b), -1, 1));
    eulerYZX(this.pose[l.thigh], 0, roll, pitch - alpha);
    eulerYZX(this.pose[l.shin], 0, roll, pitch - alpha + knee);
  }

  // ----------------------------------------------------------------- physics step
  step(dt) {
    const rag = this.rag;
    const p = this.pos;
    this.st.t += dt;
    if (p.y < -30) { if (this.alive) this.die(null); }

    if (!this.alive) {
      this.deadT += dt;
      // a short twitch then fully limp; once the body has come to rest it is
      // put to sleep (costs nothing until something hits it again)
      if (this.deadT < 0.3) this.drive(dt, 0.12 * (1 - this.deadT / 0.3), false);
      if (this.deadT > 1.5) {
        if (!this.settled) { rag.setDamping(0.8, 3.0); rag.corpse(); this.settled = true; this.awakeT = 0; }
        if (!rag.bodies[0].isSleeping()) {
          // (also when a sleeping corpse is woken by a blast or a bale it settles again)
          const ms = rag.maxSpeed();
          this.awakeT += dt;
          this.restT = ms < 0.5 ? (this.restT || 0) + dt : 0;
          if (this.restT > 0.3 || (this.awakeT > 3 && ms < 2)) { rag.sleep(); this.restT = 0; this.awakeT = 0; }
        }
      }
      return;
    }

    this.cooldown -= dt;
    this.buff = Math.max(0, this.buff - dt);
    if (this.stun > 0) {
      this.stun -= dt;
      this.recover = 0;
      if (this.stun <= 0) this.stun = 0;
    } else this.recover = Math.min(1, this.recover + dt * 1.4);

    // stuck lying down (pinned, wedged): heave up with a wobbly hop
    if (this.stun <= 0 && this.isDown()) {
      this.downT = (this.downT || 0) + dt;
      if (this.downT > 3) { this.downT = 0; this.rag.impulseAll(rand(-1, 1) * this.M, this.M * 4.5, rand(-1, 1) * this.M); }
    } else this.downT = 0;
    const gap = this.groundGap();
    const airborne = gap > 0.7 * this.s;
    this.airT = airborne ? this.airT + dt : 0;

    this.think(dt);
    if (this.kind?.step) this.kind.step(this, dt);
    if (this.airT > 0.25 || this.stun > 0.3) this.st.mode = 'flail';
    this.st.airborne = this.airT > 0.25;

    // talk
    this.talkT -= dt;
    if (this.talkT <= 0) {
      this.talkT = rand(3, 9) / Math.max(0.2, this.def.personality.chatter);
      if (this.battle.started) this.battle.voice(this, this.st.mode === 'play' ? 'sing' : 'idle');
    }

    // heading
    const turnRate = (this.st.attack ? 3 : 7) / Math.sqrt(this.s);
    if (this.faceYaw !== undefined && this.recover > 0.5) {
      this.heading += clamp(angleDiff(this.heading, this.faceYaw), -turnRate * dt, turnRate * dt);
    }

    // attack animation progress & effects
    if (this.st.attack) {
      const prev = this.st.attackT;
      this.st.attackT += dt / this.attackDur;
      this.attackEvents(prev, this.st.attackT);
      if (this.st.attackT >= 1) { this.st.attack = null; this.st.attackT = 0; }
    }

    // locomotion state
    const v = rag.vel[PART.pelvis];
    const hs = Math.hypot(v.x, v.z);
    const stride = 1.15 * this.s;
    this.st.amp = lerp(this.st.amp, clamp(hs / Math.max(2, this.def.speed * 0.8), 0, 1), damp(8, dt));
    this.st.phase += dt * (hs / stride) * Math.PI;
    this.st.lean = clamp(hs * 0.04, 0, 0.3);
    // heads look at their target (ahead of the body as it turns)
    const st = this.st;
    if (this.target && this.target.alive && st.mode !== 'cheer') {
      const tp = this.target.headPos;
      const hp = this.headPos;
      st.headPitch = clamp(-Math.atan2(tp.y - hp.y, Math.hypot(tp.x - hp.x, tp.z - hp.z) + 0.1), -0.5, 0.5);
      st.headYaw = lerp(st.headYaw, clamp(angleDiff(this.heading, Math.atan2(tp.x - hp.x, tp.z - hp.z)), -0.9, 0.9), damp(10, dt));
    } else { st.headPitch = lerp(st.headPitch, 0, damp(4, dt)); st.headYaw = lerp(st.headYaw, 0, damp(4, dt)); }
    // shield bearers brace behind the shield when an enemy is close; a possessed
    // unit blocks on command
    const near = this.target && this.target.alive && Math.hypot(this.target.pos.x - p.x, this.target.pos.z - p.z) - this.target.skel.radius < 3.5 * this.s;
    const brace = this.def.weapon.shield && near && !st.attack && st.mode === 'normal' ? 1 : 0;
    st.brace = lerp(st.brace || 0, brace, damp(8, dt));
    st.block = lerp(st.block || 0, this.blocking ? 1 : 0, damp(12, dt));
    st.flinch = Math.max(0, (st.flinch || 0) - dt * 3.5);
    // groggy for a moment after getting back up
    if (this.stun > 0) this.groggyT = Math.min(1.6, 0.6 + this.stun);
    else this.groggyT = Math.max(0, (this.groggyT || 0) - dt);
    st.wobble = this.stun > 0 ? 0 : clamp(this.groggyT, 0, 1) * 0.9;
    st.swing = this.gaitSwing;
    this.st.rock = this.gaitRock || 0;
    computePose(this.st, this.pose);
    this.updateLegs(dt, !airborne && this.stun <= 0 && this.recover > 0.6 && this.st.mode !== 'flail');

    const strength = this.recover * (this.stun > 0 ? 0.08 : 1);
    // knocked flying: the arms keep enough strength to windmill
    // (flung through the air they windmill hard)
    this.armStrength = st.mode === 'flail' ? Math.max(strength, st.airborne ? 0.7 : 0.35) : strength;
    this.drive(dt, strength, !airborne && this.stun <= 0);

    // melee hits
    if (this.st.attack && this.weapons.length) this.checkMelee(dt);
    else for (const w of this.weapons) w.first = true;

    if (this.def.weapon.kind === 'bard' && this.st.mode === 'play' && this.battle.started) this.battle.inspire(this);
  }

  drive(dt, strength, support) {
    const rag = this.rag, M = this.M;
    _yawQ.setFromAxisAngle(UP, this.heading);
    const Mk = M * Math.max(1, this.s);
    const atk = this.st.attack ? 1 : 0;
    const ffk = 0.5;
    for (let i = 0; i < NPARTS; i++) {
      const m = MUSCLE[i];
      const arm = i >= PART.uarmL ? atk : 0;
      const wt = this.worldTarget[i];
      this.prevTarget[i].copy(wt);
      wt.copy(_yawQ).multiply(this.pose[i]);
      // feed-forward: the target's own spin, so fast-moving targets (legs) don't lag
      let ff = null;
      if (this.hasPrev && ffk > 0 && (i >= PART.thighL && i <= PART.shinR || arm)) {
        _q.copy(this.prevTarget[i]).invert().premultiply(wt);
        if (_q.w < 0) { _q.x = -_q.x; _q.y = -_q.y; _q.z = -_q.z; _q.w = -_q.w; }
        const a = 2 * Math.acos(clamp(_q.w, -1, 1));
        const sn = Math.sqrt(Math.max(1e-9, 1 - _q.w * _q.w));
        const kk = Math.min(a / dt, 30) / sn * ffk;
        ff = _v.set(_q.x * kk, _q.y * kk, _q.z * kk);
      }
      const sk = i >= PART.uarmL && this.alive ? Math.max(strength, this.armStrength || 0) : strength;
      // small units' legs are quicker (a pendulum's swing time goes with sqrt(length)):
      // without this a halfling's feet lag their fast steps and drag along the ground
      const lk = this.s < 1 && i >= PART.thighL && i <= PART.shinR ? 1 / Math.sqrt(this.s) : 1;
      rag.muscle(i, wt, m[0] * (1 + arm * 0.4) * lk, m[1] * Math.max(0.2, sk) * (1 + arm * 0.5) * lk,
        m[2] * Mk * sk * (1 + arm * 1.2) * (rag.loadK ? rag.loadK[i] : 1), dt, (arm ? 17 : m[3] || 12) / Math.sqrt(this.s), ff);
    }
    this.hasPrev = true;
    if (!support || strength < 0.05) return;
    // Balance: hold the pelvis at standing height, and steer.
    const p = rag.pos[PART.pelvis];
    const gy = this.battle.terrain.height(p.x, p.z);
    const h = p.y - gy;
    const target = this.hipH * (1 - (this.st.crouchOut ?? this.st.crouch ?? 0) * 0.3);
    const vy = rag.vel[PART.pelvis].y;
    const k = strength;
    if (h < target + 0.5 * this.s) {
      let a = 9.81 + (target - h) * 70 - vy * 12;
      a = clamp(a, 0, 40) * k;
      const J = M * a * dt;
      rag.impulse(PART.pelvis, 0, J * 0.55, 0);
      rag.impulse(PART.chest, 0, J * 0.45, 0);
    }
    // horizontal steering
    const vel = rag.vel[PART.pelvis];
    let ax = (this.desired.x - vel.x) * 9, az = (this.desired.z - vel.z) * 9;
    const am = Math.hypot(ax, az), cap = 28 * k;
    if (am > cap) { ax *= cap / am; az *= cap / am; }
    const Jx = M * ax * dt, Jz = M * az * dt;
    rag.impulse(PART.pelvis, Jx * 0.6, 0, Jz * 0.6);
    rag.impulse(PART.chest, Jx * 0.4, 0, Jz * 0.4);
  }

  attackEvents(t0, t1) {
    if (this.kind?.event) return this.kind.event(this, t0, t1);
    const w = this.def.weapon;
    if (w.kind === 'ranged') {
      const at = w.releaseAt || 0.7;
      if (t0 < at && t1 >= at) this.release();
    } else if (w.kind === 'heal') {
      if (t0 < 0.5 && t1 >= 0.5) this.battle.healPulse(this);
    }
  }

  release() {
    const b = this.battle, w = this.def.weapon;
    this.released = true;
    const hand = this.rag.worldPoint(PART.farmR, 0, -this.skel.handOffset, 0, new THREE.Vector3());
    let tgt = this.aimAt;
    const vel = new THREE.Vector3();
    let speed = w.speed;
    if (tgt && tgt.alive) {
      const tp = tgt.chestPos.clone();
      // lead the target a little
      const dist = Math.hypot(tp.x - hand.x, tp.z - hand.z);
      const tof = dist / speed;
      const tv = tgt.rag.vel[PART.chest];
      tp.x += tv.x * tof * 0.7; tp.z += tv.z * tof * 0.7;
      const dx = Math.hypot(tp.x - hand.x, tp.z - hand.z);
      const dy = tp.y - hand.y;
      const g = b.projGravity(w.proj);
      let ang;
      if (g <= 0.01) ang = Math.atan2(dy, dx);
      else {
        ang = ballisticAngle(dx, dy, speed, g, w.arc === 'high');
        if (ang === null) ang = Math.PI / 4;
      }
      const yaw = Math.atan2(tp.x - hand.x, tp.z - hand.z) + rand(-1, 1) * w.spread;
      ang += rand(-1, 1) * w.spread;
      speed *= 1 + rand(-1, 1) * w.spread * 0.5;
      vel.set(Math.sin(yaw) * Math.cos(ang), Math.sin(ang), Math.cos(yaw) * Math.cos(ang)).multiplyScalar(speed);
    } else {
      // possessed: throw where the unit faces, aimed by the camera pitch
      const pitch = this.control ? this.control.aimPitch : 0.3;
      const yaw = this.heading;
      vel.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(speed);
    }
    b.spawnProjectile(w.proj, hand, vel, this);
  }

  checkMelee(dt) {
    const anim = this.st.attack;
    const wins = STRIKE[anim];
    const at = this.st.attackT;
    for (let wi = 0; wi < this.weapons.length; wi++) {
      const w = this.weapons[wi];
      const rag = this.rag;
      const A = rag.worldPoint(w.part, w.a.x, w.a.y, w.a.z, _v);
      const B = rag.worldPoint(w.part, w.b.x, w.b.y, w.b.z, _v2);
      if (w.first) { w.prevTip.copy(B); w.first = false; w.tipVel.set(0, 0, 0); continue; }
      w.tipVel.copy(B).sub(w.prevTip).divideScalar(Math.max(dt, 1e-4));
      w.prevTip.copy(B);
      if (!wins) continue;
      const win = wins[Math.min(wi, wins.length - 1)];
      if (at < win[0] || at > win[1]) continue;
      const tipSpeed = w.tipVel.length();
      if (tipSpeed < 1.2) continue;
      this.battle.meleeSweep(this, A, B, w.r, w.tipVel, tipSpeed);
    }
  }

  // ----------------------------------------------------------------- held items
  // Each held weapon / shield is a collider on its forearm's body while the unit
  // lives (mass, inertia, clashes with enemy weapons and shields), and becomes a
  // rigid body of its own when the unit dies. h.pos/h.quat are its world transform
  // (item origin = the hand; long axis local +Y), kept up to date every step.
  initHeld() {
    const s = this.s, sk = this.skel;
    this.held = heldLayout(this.def).map((l, slot) => {
      const h = { slot, shield: l.shield, name: l.name, part: l.part, lp: new THREE.Vector3(), lq: new THREE.Quaternion(),
        phys: false, shape: null, mass: 0, collider: null, body: null, dropped: false,
        pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
      if (l.shield) {
        const sd = shieldDef(l.name);
        h.lp.set(sk.parts[l.part].r * 1.7, 0, 0);
        h.shape = { box: sd.half.map((x) => x * s), cy: 0 };
        h.mass = sd.mass * s * s * s;
        h.phys = true;
      } else {
        const it = ITEMS[l.name];
        h.lp.set(0, -sk.handOffset, 0);
        h.lq.setFromUnitVectors(UP, gripDir(it, _v));
        const [y0, y1] = itemSpan(it, s);
        const r = Math.max(0.03 * s, Math.min(it.r * 0.6, 0.09) * s);
        h.phys = it.phys !== false && y1 - y0 > 0.1;
        h.shape = { r, hh: Math.max(0.01, (y1 - y0) / 2 - r), cy: (y0 + y1) / 2 };
        h.mass = itemMass(it, s);
      }
      if (h.phys) {
        const at = new THREE.Vector3(0, h.shape.cy, 0).applyQuaternion(h.lq).add(h.lp);
        h.collider = this.rag.attach(h.part, this.heldCollider(h, true), h.mass, at);
      }
      return h;
    });
    this.readHeld();
  }

  // the shield this unit still carries, if any
  shield() {
    for (const h of this.held) if (h.shield && !h.dropped) return h;
    return null;
  }

  heldCollider(h, onArm) {
    const sh = h.shape;
    const cd = sh.box ? RAPIER.ColliderDesc.cuboid(sh.box[0], sh.box[1], sh.box[2]) : RAPIER.ColliderDesc.capsule(sh.hh, sh.r);
    cd.setMass(h.mass).setFriction(0.6).setRestitution(0.15);
    if (onArm) {
      _v.set(0, sh.cy, 0).applyQuaternion(h.lq).add(h.lp);
      cd.setTranslation(_v.x, _v.y, _v.z).setRotation({ x: h.lq.x, y: h.lq.y, z: h.lq.z, w: h.lq.w });
      cd.setCollisionGroups(itemGroups(this.team));
    } else {
      cd.setTranslation(0, sh.cy, 0).setCollisionGroups(GROUPS.dropped);
    }
    return cd;
  }

  readHeld(dt = 1 / 60) {
    const r = this.rag;
    for (const h of this.held) {
      if (h.body) {
        const b = h.body;
        if (b.isSleeping()) continue;
        const t = b.translation(), q = b.rotation();
        h.pos.set(t.x, t.y, t.z); h.quat.set(q.x, q.y, q.z, q.w);
        // once it has landed a round haft would roll down slopes for ever: damp
        // its spin hard and put it to sleep when it has come to rest
        h.t += dt;
        const gy = this.battle.terrain.height(t.x, t.z);
        if (!h.landed && h.t > 0.15 && t.y - gy < 0.5 * this.s) { h.landed = true; b.setAngularDamping(6); b.setLinearDamping(0.6); }
        const lv = b.linvel(), av = b.angvel();
        const slow = lv.x * lv.x + lv.y * lv.y + lv.z * lv.z < 0.15 && av.x * av.x + av.y * av.y + av.z * av.z < 1;
        h.restT = slow ? h.restT + dt : 0;
        if (h.restT > 0.3 || h.t > 10) { b.sleep(); h.restT = 0; h.t = 0.5; }
        // (no CCD, it is costly: a blade that tunnelled into the ground pops back out)
        if (t.y < gy - 0.05) { b.setTranslation({ x: t.x, y: gy + 0.15 * this.s, z: t.z }, true); b.setLinvel({ x: 0, y: 0, z: 0 }, true); }
      } else {
        h.quat.copy(r.quat[h.part]).multiply(h.lq);
        h.pos.copy(h.lp).applyQuaternion(r.quat[h.part]).add(r.pos[h.part]);
      }
    }
  }

  // Let go of everything held: each item flies off with the velocity its hand had.
  dropHeld() {
    const r = this.rag, world = this.battle.world;
    for (const h of this.held) {
      if (h.dropped) continue;
      h.dropped = true;
      if (!h.phys) continue;
      this.readHeld();
      world.removeCollider(h.collider, true);
      h.collider = null;
      const bd = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(h.pos.x, h.pos.y, h.pos.z)
        .setRotation({ x: h.quat.x, y: h.quat.y, z: h.quat.z, w: h.quat.w })
        .setLinearDamping(0.1).setAngularDamping(0.8);
      const body = world.createRigidBody(bd);
      world.createCollider(this.heldCollider(h, false), body);
      // velocity of the item's centre as carried by the forearm, plus a little spin
      const w = r.angvel[h.part], v = r.vel[h.part];
      _v2.set(0, h.shape.cy, 0).applyQuaternion(h.quat).add(h.pos).sub(r.pos[h.part]);
      _v3.crossVectors(w, _v2).add(v);
      body.setLinvel({ x: _v3.x, y: _v3.y + rand(0.5, 2), z: _v3.z }, true);
      body.setAngvel({ x: w.x + rand(-4, 4), y: w.y + rand(-4, 4), z: w.z + rand(-4, 4) }, true);
      h.body = body; h.t = 0; h.restT = 0; h.landed = false;
    }
  }

  // ----------------------------------------------------------------- extra bodies
  // Packs can give a unit extra rigid bodies (a horse, a catapult, a wing...). pos/quat
  // are in the unit frame relative to its ground point at spawn; they must match the
  // rest pose of the matching vis.extraParts entry so setup previews line up.
  addExtraBody(bodyDesc, colliderDescs, pos, quat) {
    const yq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.spawnYaw);
    const wp = pos.clone().applyQuaternion(yq).add(this.spawn);
    const wq = yq.clone().multiply(quat);
    bodyDesc.setTranslation(wp.x, wp.y, wp.z).setRotation({ x: wq.x, y: wq.y, z: wq.z, w: wq.w });
    const body = this.battle.world.createRigidBody(bodyDesc);
    for (const cd of [].concat(colliderDescs)) this.battle.world.createCollider(cd, body);
    const e = { body, pos: wp.clone(), quat: wq.clone() };
    this.extras.push(e);
    return e;
  }

  readExtras() {
    for (const e of this.extras) {
      const t = e.body.translation(), r = e.body.rotation();
      e.pos.set(t.x, t.y, t.z);
      e.quat.set(r.x, r.y, r.z, r.w);
    }
  }

  // ----------------------------------------------------------------- damage
  hit(amount, part, ix, iy, iz, attacker, kind) {
    if (this.kind?.hit && this.alive) amount = this.kind.hit(this, amount, part, attacker, kind);
    if (!this.alive) {
      this.rag.impulse(part, ix, iy, iz);
      return;
    }
    const armor = this.def.armor || 0;
    amount *= 1 - armor;
    this.hp -= amount;
    // parried (kind.parry, e.g. the Samurai): the blade took it, no push or flinch
    if (this.parriedAt === this.battle.time) { ix = iy = iz = 0; }
    this.rag.impulse(part, ix, iy, iz);
    // the caller also pushes the whole body by ~2x this; stun on big shoves
    const dv = (Math.hypot(ix, iy, iz) * 2.5) / this.M;
    const stag = this.def.stagger ?? 1;
    const st = clamp((dv - 1.6) * 0.6 * stag, 0, 2.2);
    if (st > 0.2) this.stun = Math.max(this.stun, st);
    if (this.def.frenzy) this.stun = Math.min(this.stun, 0.3);
    this.expr = EXPR.hurt;
    // flinch along the push (unit frame: +Z forward, +X left)
    const jm = Math.hypot(ix, iz);
    if (jm > 1e-3) {
      const hx = Math.sin(this.heading), hz = Math.cos(this.heading);
      const k = clamp(jm * 2.5 / this.M / 3, 0.35, 1);
      this.st.flinch = Math.max(this.st.flinch || 0, k);
      this.st.flinchZ = (ix * hx + iz * hz) / jm;
      this.st.flinchX = (ix * hz - iz * hx) / jm;
    }
    this.lastHitBy = attacker;
    if (attacker && attacker.alive) attacker.damageDealt += amount;
    if (this.hp <= 0) this.die(attacker);
    else if (Math.random() < 0.4) this.battle.voice(this, 'hurt');
  }

  die(killer) {
    if (!this.alive) return;
    this.kind?.die?.(this, killer);
    this.alive = false;
    this.hp = 0;
    this.expr = EXPR.dead;
    this.st.attack = null;
    this.dropHeld();
    if (killer) killer.kills++;
    this.battle.onDeath(this, killer);
  }
}
