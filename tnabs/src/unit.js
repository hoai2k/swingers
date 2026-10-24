// A battle unit: active ragdoll + controller + personality-driven AI.
import { THREE, clamp, lerp, rand, angleDiff, damp, pick, ballisticAngle } from './util.js';
import { makeSkeleton, NPARTS, PART } from './body.js';
import { computePose, newPose, STYLE_ANIM } from './pose.js';
import { Ragdoll } from './ragdoll.js';
import { ITEMS, gripDir } from './items.js';
import { FIELD } from './world.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _yawQ = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

// Muscle tuning per part: [gain, rate, torque cap per kg of unit mass]
const MUSCLE = [
  [10, 22, 5.5], // pelvis
  [12, 26, 8.5], // chest
  [9, 18, 0.9], // head
  [13, 26, 3.4], [13, 26, 2.0], // thigh, shin L
  [13, 26, 3.4], [13, 26, 2.0], // R
  [18, 30, 1.9], [18, 30, 1.2], // arm L
  [18, 30, 1.9], [18, 30, 1.2], // arm R
];

// Window of the attack animation (0..1) in which the weapon deals damage.
const STRIKE = {
  overhead: [[0.46, 0.97]], slam: [[0.46, 0.97]], stab: [[0.4, 0.9]],
  dual: [[0.3, 0.6], [0.47, 0.85]], punch: [[0.36, 0.8]],
};

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
    this.st = {
      phase: rand(0, 6), amp: 0, lean: 0, style: def.weapon.style, attack: null, attackT: 0,
      headPitch: 0, headYaw: 0, mode: 'normal', t: rand(0, 10), crouch: 0,
    };
    computePose(this.st, this.pose);
    const gy = battle.terrain.height(x, z);
    this.rag = new Ragdoll(battle.world, this.skel, new THREE.Vector3(x, gy, z), yaw, this.pose);
    this.M = this.skel.totalMass;
    this.s = this.skel.scale;

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
    if (w.kind === 'melee' || w.kind === 'bard' || w.kind === 'heal') {
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
    const spd = def.speed * (1 + (this.buff > 0 ? 0.3 : 0));

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

    if (w.kind === 'melee') {
      face = t;
      this.expr = gap < 6 ? EXPR.angry : EXPR.normal;
      const near = dist - t.skel.radius;
      if (near > this.reachDist * 0.8) this.desired.set(dirx * spd, 0, dirz * spd);
      else if (near < this.reachDist * 0.4) this.desired.set(-dirx * spd * 0.3, 0, -dirz * spd * 0.3);
      if (near < this.reachDist + 0.35 && this.cooldown <= 0 && !this.st.attack) this.startAttack();
      if (this.st.attack) this.desired.multiplyScalar(0.35);
    } else if (w.kind === 'ranged') {
      face = t;
      this.expr = EXPR.normal;
      const shy = pers.aggro < 0.5;
      if (dist > w.range * 0.9) this.desired.set(dirx * spd, 0, dirz * spd);
      else if (shy && dist < w.minRange * 0.6) this.desired.set(-dirx * spd * 0.6, 0, -dirz * spd * 0.6);
      if (dist < w.range && !this.st.attack && this.cooldown <= 0 && (dist > w.minRange * 0.4 || !shy)) {
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
    this.desired.set(c.mx * spd * 1.15, 0, c.mz * spd * 1.15);
    this.faceYaw = c.aimYaw;
    this.expr = EXPR.angry;
    this.st.mode = 'normal';
    if (c.attack && !this.st.attack && this.cooldown <= 0) {
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
    this.cooldown = w.cooldown * rand(0.85, 1.15) * (this.buff > 0 ? 0.8 : 1);
    if (Math.random() < 0.35 * this.def.personality.chatter) this.battle.voice(this, 'attack');
    if (w.kind === 'melee') this.battle.sound('whoosh', this.pos, 0.5 * Math.min(2, this.s), 1 / Math.sqrt(this.s));
  }

  groundGap() {
    const p = this.pos;
    return p.y - this.battle.terrain.height(p.x, p.z) - this.skel.standHeight;
  }

  // ----------------------------------------------------------------- physics step
  step(dt) {
    const rag = this.rag;
    const p = this.pos;
    this.st.t += dt;
    if (p.y < -30) { if (this.alive) this.die(null); }

    if (!this.alive) {
      this.deadT += dt;
      // a short twitch then limp
      if (this.deadT < 0.4) this.drive(dt, 0.15 * (1 - this.deadT / 0.4), false);
      if (this.deadT > 4 && !this.settled) { rag.setDamping(0.6, 2.5); this.settled = true; }
      return;
    }

    this.cooldown -= dt;
    this.buff = Math.max(0, this.buff - dt);
    if (this.stun > 0) {
      this.stun -= dt;
      this.recover = 0;
      if (this.stun <= 0) this.stun = 0;
    } else this.recover = Math.min(1, this.recover + dt * 1.4);

    const gap = this.groundGap();
    const airborne = gap > 0.7 * this.s;
    this.airT = airborne ? this.airT + dt : 0;

    this.think(dt);
    if (this.airT > 0.25 || this.stun > 0.3) this.st.mode = 'flail';

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
    if (this.target) {
      const tp = this.target.headPos;
      const hp = this.headPos;
      this.st.headPitch = clamp(-Math.atan2(tp.y - hp.y, Math.hypot(tp.x - hp.x, tp.z - hp.z) + 0.1), -0.5, 0.5);
    }
    computePose(this.st, this.pose);

    const strength = this.recover * (this.stun > 0 ? 0.08 : 1);
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
    for (let i = 0; i < NPARTS; i++) {
      const m = MUSCLE[i];
      const arm = i >= PART.uarmL ? atk : 0;
      this.worldTarget[i].copy(_yawQ).multiply(this.pose[i]);
      rag.muscle(i, this.worldTarget[i], m[0] * (1 + arm * 0.4), m[1] * Math.max(0.2, strength) * (1 + arm * 0.5),
        m[2] * Mk * strength * (1 + arm * 1.2), dt, arm ? 17 / Math.sqrt(this.s) : 12);
    }
    if (!support || strength < 0.05) return;
    // Balance: hold the pelvis at standing height, and steer.
    const p = rag.pos[PART.pelvis];
    const gy = this.battle.terrain.height(p.x, p.z);
    const h = p.y - gy;
    const target = this.skel.standHeight * (1 - (this.st.crouch || 0) * 0.3);
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

  // ----------------------------------------------------------------- damage
  hit(amount, part, ix, iy, iz, attacker, kind) {
    if (!this.alive) {
      this.rag.impulse(part, ix, iy, iz);
      return;
    }
    const armor = this.def.armor || 0;
    amount *= 1 - armor;
    this.hp -= amount;
    this.rag.impulse(part, ix, iy, iz);
    // the caller also pushes the whole body by ~2x this; stun on big shoves
    const dv = (Math.hypot(ix, iy, iz) * 2.5) / this.M;
    const stag = this.def.stagger ?? 1;
    const st = clamp((dv - 1.6) * 0.6 * stag, 0, 2.2);
    if (st > 0.2) this.stun = Math.max(this.stun, st);
    if (this.def.frenzy) this.stun = Math.min(this.stun, 0.3);
    this.expr = EXPR.hurt;
    this.lastHitBy = attacker;
    if (attacker && attacker.alive) attacker.damageDealt += amount;
    if (this.hp <= 0) this.die(attacker);
    else if (Math.random() < 0.4) this.battle.voice(this, 'hurt');
  }

  die(killer) {
    if (!this.alive) return;
    this.alive = false;
    this.hp = 0;
    this.expr = EXPR.dead;
    this.st.attack = null;
    if (killer) killer.kills++;
    this.battle.onDeath(this, killer);
  }
}
