// The battle simulation: physics world, units, projectiles, explosions.
// Emits events ([kind, x, y, z, a, b, c]) for effects/sound so that the live view
// and the replay player can share the same presentation code.
import { THREE, clamp, rand, pick, segSegDist2 } from './util.js';
import { createWorld } from './physics.js';
import { Unit, EXPR } from './unit.js';
import { PART, NPARTS } from './body.js';
import { UNIT_BY_ID } from './units.js';

export const PROJ = {
  arrow: { g: 9.81, len: 0.85, r: 0.05, stick: true, life: 8 },
  spear: { g: 9.81, len: 1.8, r: 0.06, stick: true, life: 10 },
  hay: { g: 9.81, len: 0.0, r: 0.38, roll: true, life: 7 },
  potion: { g: 9.81, len: 0.0, r: 0.12, explode: 'potion', life: 6 },
  bomb: { g: 9.81, len: 0.0, r: 0.16, explode: 'bomb', fuse: 0.6, life: 6 },
  fireball: { g: 2.5, len: 0.0, r: 0.3, explode: 'fire', life: 4 },
};
export const PROJ_TYPES = Object.keys(PROJ);

class Grid {
  constructor(cell = 3) { this.cell = cell; this.map = new Map(); }
  clear() { this.map.clear(); }
  key(ix, iz) { return ix * 4096 + iz; }
  insert(u) {
    const p = u.pos;
    const k = this.key(Math.floor(p.x / this.cell) + 2048, Math.floor(p.z / this.cell) + 2048);
    let a = this.map.get(k);
    if (!a) this.map.set(k, (a = []));
    a.push(u);
  }
  query(x, z, r, cb) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c) + 2048, x1 = Math.floor((x + r) / c) + 2048;
    const z0 = Math.floor((z - r) / c) + 2048, z1 = Math.floor((z + r) / c) + 2048;
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const a = this.map.get(this.key(ix, iz));
      if (a) for (let i = 0; i < a.length; i++) cb(a[i]);
    }
  }
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
let projId = 1;

export class Battle {
  // armies: [[{type, x, z}], [{...}]]
  constructor(terrain, armies, sink) {
    this.terrain = terrain;
    this.world = createWorld();
    terrain.addCollider(this.world);
    this.sink = sink; // (event) => void
    this.units = [];
    this.teams = [[], []];
    this.grid = new Grid(3);
    this.projectiles = [];
    this.stuck = [];
    this.time = 0;
    this.started = true;
    this.over = false;
    this.winner = -1;
    this.overT = 0;
    this.voiceBudget = 0;
    this.delayed = [];
    this.front = [null, null];
    for (let t = 0; t < 2; t++) {
      for (const a of armies[t]) {
        const def = UNIT_BY_ID[a.type];
        if (!def) continue;
        const yaw = t === 0 ? Math.PI / 2 : -Math.PI / 2;
        const u = new Unit(this, def, t, a.x, a.z, yaw + rand(-0.05, 0.05));
        this.units.push(u);
        this.teams[t].push(u);
      }
    }
    this.startCounts = [this.teams[0].length, this.teams[1].length];
    this.startValue = [0, 1].map((t) => this.teams[t].reduce((s, u) => s + u.def.cost, 0));
    // opening battle cries
    for (const u of this.units) if (Math.random() < 0.5) this.delayed.push([rand(0, 0.9), () => this.voice(u, 'cry', true)]);
  }

  emit(kind, x, y, z, a = 0, b = 0, c = 0) { this.sink && this.sink([kind, x, y, z, a, b, c]); }
  sound(name, p, vol = 1, pitch = 1) { this.emit('snd:' + name, p.x, p.y, p.z, vol, pitch); }
  voice(u, kind, force) {
    if (!force && this.voiceBudget > 6) return;
    this.voiceBudget++;
    const pers = u.def.personality;
    const p = u.headPos;
    const cry = ['ooga', 'roar', 'yip', 'hey', 'la', 'charge', 'cackle', 'royal', 'magic'].indexOf(pers.cry);
    const kinds = ['idle', 'attack', 'hurt', 'die', 'cry', 'scream', 'sing', 'cheer'];
    this.emit('voice', p.x, p.y, p.z, kinds.indexOf(kind), pers.voice / Math.pow(u.s, 0.35) * rand(0.92, 1.08), cry);
  }

  alive(team) { return this.teams[team].filter((u) => u.alive); }

  nearestEnemy(u) {
    const p = u.pos;
    let best = null, bd = Infinity;
    for (const o of this.teams[1 - u.team]) {
      if (!o.alive) continue;
      // nearest, but spread out: enemies already mobbed by several of our
      // units look further away (so a blob splits over the enemy line)
      const crowd = o === u.target ? 0 : o.mobbed || 0;
      const d = ((o.pos.x - p.x) ** 2 + (o.pos.z - p.z) ** 2) * rand(0.9, 1.1) * (1 + 0.35 * crowd / Math.max(1, o.s));
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  mostHurtAlly(u, range) {
    let best = null, bf = 0.97;
    for (const o of this.teams[u.team]) {
      if (!o.alive || o === u) continue;
      const f = o.hp / o.maxHp;
      if (f >= bf) continue;
      if ((o.pos.x - u.pos.x) ** 2 + (o.pos.z - u.pos.z) ** 2 > range * range) continue;
      bf = f; best = o;
    }
    return best;
  }

  // The nearest non-support ally (support units hide behind it).
  allyAnchor(u) {
    let best = null, bd = Infinity;
    for (const o of this.teams[u.team]) {
      if (!o.alive || o === u) continue;
      const k = o.def.weapon.kind;
      if (k === 'heal' || k === 'bard') continue;
      const d = (o.pos.x - u.pos.x) ** 2 + (o.pos.z - u.pos.z) ** 2;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // Each team's centre and the direction to the enemy centre (for keeping a line).
  updateFront() {
    const c = [[0, 0, 0], [0, 0, 0]];
    for (const u of this.units) {
      if (!u.alive) continue;
      const a = c[u.team];
      a[0] += u.pos.x; a[1] += u.pos.z; a[2]++;
    }
    for (let t = 0; t < 2; t++) {
      const a = c[t], e = c[1 - t];
      if (!a[2] || !e[2]) { this.front[t] = null; continue; }
      const x = a[0] / a[2], z = a[1] / a[2];
      const dx = e[0] / e[2] - x, dz = e[1] / e[2] - z;
      const d = Math.hypot(dx, dz) || 1;
      this.front[t] = { x, z, dx: dx / d, dz: dz / d };
    }
  }

  projGravity(type) { return PROJ[type]?.g ?? 9.81; }

  // ------------------------------------------------------------------ step
  step(dt) {
    this.time += dt;
    this.voiceBudget = Math.max(0, this.voiceBudget - dt * 8);
    for (let i = this.delayed.length - 1; i >= 0; i--) {
      const d = this.delayed[i];
      d[0] -= dt;
      if (d[0] <= 0) { this.delayed.splice(i, 1); d[1](); }
    }
    this.grid.clear();
    for (const u of this.units) { u.mobbed = 0; if (u.alive) this.grid.insert(u); }
    for (const u of this.units) if (u.alive && u.target && u.def.weapon.kind === 'melee') u.target.mobbed++;
    this.updateFront();
    for (const u of this.units) u.step(dt);
    this.stepProjectiles(dt);
    this.world.timestep = dt;
    this.world.step();
    for (const u of this.units) {
      if (u.alive || !u.rag.bodies[0].isSleeping()) u.rag.read();
    }
    if (!this.over) {
      const a0 = this.teams[0].some((u) => u.alive), a1 = this.teams[1].some((u) => u.alive);
      if (!a0 || !a1) {
        this.over = true;
        this.winner = a0 ? 0 : a1 ? 1 : -1;
        this.overT = 0;
        this.emit('over', 0, 0, 0, this.winner);
        for (const u of this.units) if (u.alive && Math.random() < 0.7) this.delayed.push([rand(0.2, 1.5), () => this.voice(u, 'cheer', true)]);
      }
    } else {
      this.overT += dt;
      // winners hop about
      for (const u of this.units) {
        if (u.alive && u.team === this.winner && u.stun <= 0 && Math.random() < dt * 0.8 && u.groundGap() < 0.2) {
          u.rag.impulseAll(0, u.M * rand(3, 5), 0);
        }
      }
    }
  }

  // ------------------------------------------------------------------ melee
  meleeSweep(att, A, B, r, tipVel, tipSpeed) {
    const w = att.def.weapon;
    const reach = (w.reach + 2) * att.s + 2;
    const p = att.pos;
    let hitAny = false;
    this.grid.query(p.x, p.z, reach, (v) => {
      if (hitAny && !w.sweep) return;
      if (v.team === att.team || !v.alive || att.hitSet.has(v)) return;
      const rag = v.rag;
      let best = -1, bd = Infinity;
      for (let i = 0; i < NPARTS; i++) {
        const part = v.skel.parts[i];
        const c = rag.pos[i];
        if (part.shape === 'ball') {
          _c.copy(c); _d.copy(c);
        } else {
          _c.set(0, part.hh, 0).applyQuaternion(rag.quat[i]).add(c);
          _d.set(0, -part.hh, 0).applyQuaternion(rag.quat[i]).add(c);
        }
        const d2 = segSegDist2(A, B, _c, _d);
        const rr = r + part.r;
        if (d2 < rr * rr && d2 < bd) { bd = d2; best = i; }
      }
      if (best < 0) return;
      att.hitSet.add(v);
      hitAny = true;
      const k = clamp(tipSpeed / 7, 0.55, 1.4) * (att.buff > 0 ? 1.15 : 1);
      let dmg = w.damage * k;
      // knockback: big and funny, but a slap should send a peasant ~10-20 m, not off the map
      let force = Math.min(w.force * k, v.M * 15);
      // shields
      let blocked = false;
      const vw = v.def.weapon;
      if (vw.shield && v.stun <= 0) {
        const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
        const tx = p.x - v.pos.x, tz = p.z - v.pos.z;
        if (fx * tx + fz * tz > 0) {
          dmg *= 1 - (vw.blockMelee || 0.3);
          force *= 0.6;
          blocked = true;
        }
      }
      _a.copy(tipVel).normalize();
      _a.y = Math.max(_a.y, 0) + 0.25;
      _a.normalize();
      const hitPos = v.rag.pos[best];
      if (blocked || v.def.armor > 0.3) {
        this.emit('spark', hitPos.x, hitPos.y, hitPos.z, 6);
        this.sound('clang', hitPos, 0.8 * Math.min(2, att.s), 1 / Math.sqrt(att.s));
      } else {
        this.emit('blood', hitPos.x, hitPos.y, hitPos.z, Math.min(16, 4 + dmg / 8), _a.x, _a.z);
        this.sound(w.item && w.item.includes('sword') || w.item === 'axe' || w.item === 'big_axe' ? 'slash' : 'thud', hitPos, clamp(dmg / 40, 0.4, 1.5), 1 / Math.sqrt(att.s));
      }
      // part of the push goes to the struck part, the rest to the body
      v.hit(dmg, best, _a.x * force * 0.35, _a.y * force * 0.35, _a.z * force * 0.35, att, 'melee');
      v.rag.impulseAll(_a.x * force * 0.65, _a.y * force * 0.65, _a.z * force * 0.65);
    });
  }

  // A giant's footfall: shakes the ground, squashes and kicks away small fry
  // under and around the foot (also frees anyone pinned beneath it).
  stomp(u, at) {
    const r = 0.55 * u.s;
    this.emit('dust', at.x, at.y, at.z, 3);
    this.sound('thump', at, 0.5, 0.6);
    this.grid.query(at.x, at.z, r + 1, (v) => {
      if (v === u || !v.alive || v.s > u.s * 0.7) return;
      const dx = v.pos.x - at.x, dz = v.pos.z - at.z, d = Math.hypot(dx, dz);
      if (d > r + v.skel.radius || v.pos.y - at.y > 1.4 * v.s) return;
      const k = 1 - d / (r + v.skel.radius + 0.01);
      const imp = v.M * (3 + 4 * k);
      if (v.team !== u.team) v.hit(u.def.weapon.damage * 0.15 * k, PART.pelvis, 0, 0, 0, u, 'stomp');
      v.rag.impulseAll((dx / (d || 1)) * imp, imp * 0.7, (dz / (d || 1)) * imp);
      v.stun = Math.max(v.stun, 0.5 * k);
    });
  }

  // ------------------------------------------------------------------ projectiles
  spawnProjectile(type, pos, vel, owner) {
    const P = PROJ[type];
    const w = owner.def.weapon;
    this.projectiles.push({
      id: projId++, type, pos: pos.clone(), vel: vel.clone(), prev: pos.clone(), team: owner.team, owner,
      damage: w.damage, force: w.force, blast: w.blast || 0, life: P.life, fuse: -1,
      spin: new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)), quat: new THREE.Quaternion(), hits: new Set(),
    });
    const s = type === 'arrow' ? 'bow' : type === 'fireball' ? 'fire' : 'throw';
    this.sound(s, pos, 0.6, rand(0.9, 1.1));
  }

  stepProjectiles(dt) {
    const list = this.projectiles;
    for (let i = list.length - 1; i >= 0; i--) {
      const pr = list[i];
      const P = PROJ[pr.type];
      pr.life -= dt;
      pr.prev.copy(pr.pos);
      pr.vel.y -= P.g * dt;
      if (P.roll) pr.vel.multiplyScalar(1 - 0.05 * dt);
      pr.pos.addScaledVector(pr.vel, dt);
      // orientation
      if (P.len > 0) {
        _a.copy(pr.vel).normalize();
        pr.quat.setFromUnitVectors(_b.set(0, 1, 0), _a);
      } else {
        _q.setFromEuler(new THREE.Euler(pr.spin.x * dt, pr.spin.y * dt, pr.spin.z * dt));
        pr.quat.multiply(_q);
      }
      let dead = pr.life <= 0;
      // unit hits
      if (!dead) dead = this.projectileHits(pr, P);
      // fuse
      if (!dead && pr.fuse > 0) {
        pr.fuse -= dt;
        if (pr.fuse <= 0) { this.explode(pr.pos, pr.blast, pr.damage, pr.force, pr.owner, P.explode); dead = true; }
      }
      // ground
      if (!dead) {
        const gy = this.terrain.height(pr.pos.x, pr.pos.z);
        if (pr.pos.y - P.r * 0.5 < gy) {
          if (P.stick) {
            // bury the tip in the ground
            const tip = _a.copy(pr.vel).normalize();
            pr.pos.y = gy + 0.02 - tip.y * P.len * 0.25;
            this.stuck.push({ type: pr.type, unit: null, part: -1, pos: pr.pos.clone(), quat: pr.quat.clone(), t: 25, id: pr.id });
            this.emit('dust', pr.pos.x, gy, pr.pos.z, 2);
            dead = true;
          } else if (P.explode && !P.fuse) {
            this.explode(pr.pos, pr.blast, pr.damage, pr.force, pr.owner, P.explode);
            dead = true;
          } else {
            // bounce / roll
            pr.pos.y = gy + P.r * 0.5;
            const n = this.terrain.normal(pr.pos.x, pr.pos.z, _b);
            const vn = pr.vel.dot(n);
            if (vn < 0) pr.vel.addScaledVector(n, -vn * (P.roll ? 1.15 : 1.4));
            pr.vel.multiplyScalar(P.roll ? 0.985 : 0.6);
            if (Math.abs(vn) > 3) { this.emit('dust', pr.pos.x, gy, pr.pos.z, 4); this.sound('thump', pr.pos, clamp(Math.abs(vn) / 10, 0.2, 0.8), 0.8); }
            if (P.fuse && pr.fuse < 0) pr.fuse = P.fuse;
            if (P.roll && pr.vel.lengthSq() < 0.5) pr.life = Math.min(pr.life, 1.5);
          }
        }
      }
      if (dead) list.splice(i, 1);
    }
    // stuck projectiles follow their part
    for (let i = this.stuck.length - 1; i >= 0; i--) {
      const s = this.stuck[i];
      s.t -= dt;
      if (s.t <= 0 || this.stuck.length > 500) { this.stuck.splice(i, 1); continue; }
      if (s.unit) {
        const rag = s.unit.rag;
        s.pos.copy(s.lp).applyQuaternion(rag.quat[s.part]).add(rag.pos[s.part]);
        s.quat.copy(rag.quat[s.part]).multiply(s.lq);
      }
    }
  }

  projectileHits(pr, P) {
    let hit = false;
    const speed = pr.vel.length();
    if (P.roll && speed < 3) return false;
    const reach = 3;
    this.grid.query(pr.pos.x, pr.pos.z, reach + 2, (v) => {
      if (hit || !v.alive || pr.hits.has(v)) return;
      if (v.team === pr.team && !P.roll) return;
      if (v.team === pr.team && P.roll && pr.owner === v) return;
      const rag = v.rag;
      // shield first
      const vw = v.def.weapon;
      if (vw.shield && P.stick) {
        const fa = rag.pos[PART.farmL];
        _c.set(rag.skel.parts[PART.farmL].r * 1.6, 0, 0).applyQuaternion(rag.quat[PART.farmL]).add(fa);
        const sr = 0.42 * v.s;
        if (segSegDist2(pr.prev, pr.pos, _c, _c) < sr * sr) {
          this.emit('spark', pr.pos.x, pr.pos.y, pr.pos.z, 4);
          this.sound('block', pr.pos, 0.7, 1);
          const lp = pr.pos.clone().sub(fa).applyQuaternion(_q.copy(rag.quat[PART.farmL]).invert());
          const lq = _q.clone().multiply(pr.quat);
          this.stuck.push({ type: pr.type, unit: v, part: PART.farmL, lp, lq, pos: pr.pos.clone(), quat: pr.quat.clone(), t: 25, id: pr.id });
          hit = true;
          return;
        }
      }
      for (let i = 0; i < NPARTS; i++) {
        const part = v.skel.parts[i];
        const c = rag.pos[i];
        if (part.shape === 'ball') { _c.copy(c); _d.copy(c); }
        else {
          _c.set(0, part.hh, 0).applyQuaternion(rag.quat[i]).add(c);
          _d.set(0, -part.hh, 0).applyQuaternion(rag.quat[i]).add(c);
        }
        // projectile tip segment
        const rr = part.r + P.r;
        if (segSegDist2(pr.prev, pr.pos, _c, _d) > rr * rr) continue;
        pr.hits.add(v);
        const dmgK = P.roll ? clamp(speed / 10, 0.3, 1.3) : 1;
        const dmg = pr.damage * dmgK;
        const f = pr.force * dmgK;
        _a.copy(pr.vel).normalize();
        // a raised shield catches most arrows and spears that come from the front
        if (vw.shield && P.stick && v.stun <= 0 && !v.isDown() &&
            -(_a.x * Math.sin(v.heading) + _a.z * Math.cos(v.heading)) > 0.3 && Math.random() < 0.85) {
          const fa = rag.pos[PART.farmL];
          this.emit('spark', pr.pos.x, pr.pos.y, pr.pos.z, 4);
          this.sound('block', pr.pos, 0.7, 1);
          v.rag.impulse(PART.farmL, _a.x * pr.force * 0.2, 0, _a.z * pr.force * 0.2);
          const lp = _b.set(rag.skel.parts[PART.farmL].r * 1.4, 0, 0);
          const lq = _q.copy(rag.quat[PART.farmL]).invert().multiply(pr.quat).clone();
          this.stuck.push({ type: pr.type, unit: v, part: PART.farmL, lp: lp.clone(), lq, pos: fa.clone(), quat: pr.quat.clone(), t: 25, id: pr.id });
          hit = true;
          return;
        }
        if (P.explode) {
          this.explode(pr.pos, pr.blast, pr.damage, pr.force, pr.owner, P.explode);
          hit = true;
          return;
        }
        v.hit(dmg, i, _a.x * f * 0.5, _a.y * f * 0.5 + f * 0.1, _a.z * f * 0.5, pr.owner, pr.type);
        v.rag.impulseAll(_a.x * f * 0.5, _a.y * f * 0.5, _a.z * f * 0.5);
        if (v.def.armor > 0.3) { this.emit('spark', c.x, c.y, c.z, 4); this.sound('clang', c, 0.5, 1.3); }
        else { this.emit('blood', c.x, c.y, c.z, 6, _a.x, _a.z); this.sound(P.roll ? 'thud' : 'stab', c, 0.7, 1); }
        if (P.stick) {
          const lp = pr.pos.clone().addScaledVector(_a, -P.len * 0.15).sub(c).applyQuaternion(_q.copy(rag.quat[i]).invert());
          const lq = _q.clone().multiply(pr.quat);
          this.stuck.push({ type: pr.type, unit: v, part: i, lp, lq, pos: pr.pos.clone(), quat: pr.quat.clone(), t: 25, id: pr.id });
          hit = true;
        } else {
          // rolling things keep going, a bit slower
          pr.vel.multiplyScalar(0.8);
        }
        return;
      }
    });
    return hit;
  }

  explode(pos, radius, damage, force, owner, kind) {
    const p = pos.clone();
    this.emit('explode', p.x, p.y, p.z, radius, ['bomb', 'potion', 'fire'].indexOf(kind));
    this.sound(kind === 'potion' ? 'pop' : 'boom', p, clamp(radius / 3, 0.6, 1.6), kind === 'potion' ? 1.4 : 1);
    this.grid.query(p.x, p.z, radius + 3, (v) => {
      const c = v.chestPos;
      const d = c.distanceTo(p);
      if (d > radius + v.skel.radius) return;
      const f = clamp(1 - d / (radius + v.skel.radius), 0.15, 1);
      _a.copy(c).sub(p);
      _a.y = Math.max(_a.y, 0) + 0.8;
      _a.normalize();
      const imp = force * f * Math.min(1.5, v.M / 80);
      v.hit(damage * f, PART.chest, 0, 0, 0, owner, 'blast');
      v.rag.impulseAll(_a.x * imp, _a.y * imp, _a.z * imp);
      v.stun = Math.max(v.stun, 1.2 * f * (v.def.stagger ?? 1));
      if (!v.alive) v.rag.impulseAll(_a.x * imp * 0.4, _a.y * imp * 0.4, _a.z * imp * 0.4);
    });
    // dead bodies and nothing else: give corpses a kick too
    for (const v of this.units) {
      if (v.alive) continue;
      const c = v.chestPos;
      const d = c.distanceTo(p);
      if (d > radius) continue;
      const f = 1 - d / radius;
      _a.copy(c).sub(p); _a.y = Math.max(_a.y, 0) + 0.8; _a.normalize();
      v.rag.impulseAll(_a.x * force * f * 0.6, _a.y * force * f * 0.6, _a.z * force * f * 0.6);
    }
  }

  healPulse(h) {
    const w = h.def.weapon;
    const p = h.pos;
    this.emit('healring', p.x, this.terrain.height(p.x, p.z) + 0.1, p.z, w.radius);
    this.sound('heal', p, 0.7, 1);
    for (const o of this.teams[h.team]) {
      if (!o.alive) continue;
      if ((o.pos.x - p.x) ** 2 + (o.pos.z - p.z) ** 2 > w.radius * w.radius) continue;
      if (o.hp >= o.maxHp) continue;
      o.hp = Math.min(o.maxHp, o.hp + w.amount);
      const c = o.chestPos;
      this.emit('heal', c.x, c.y, c.z, 6);
    }
  }

  inspire(bard) {
    const r = bard.def.weapon.auraRadius;
    const p = bard.pos;
    for (const o of this.teams[bard.team]) {
      if (!o.alive || o === bard) continue;
      if ((o.pos.x - p.x) ** 2 + (o.pos.z - p.z) ** 2 < r * r) o.buff = 0.5;
    }
    bard.noteT = (bard.noteT || 0) - 1 / 60;
    if (bard.noteT <= 0) {
      bard.noteT = rand(0.25, 0.5);
      const h = bard.headPos;
      this.emit('note', h.x, h.y + 0.3, h.z, Math.floor(rand(0, 4)));
      if (Math.random() < 0.35) this.sound('lute', p, 0.4, pick([1, 1.122, 1.26, 1.335, 1.498, 1.682]));
    }
  }

  onDeath(u, killer) {
    this.voice(u, 'die', true);
    const p = u.chestPos;
    this.emit('death', p.x, p.y, p.z, u.team);
    if (u.def.deathBomb) {
      this.delayed.push([0.35, () => {
        const c = u.chestPos.clone();
        this.explode(c, 3.2, 60, 520, u, 'bomb');
      }]);
    }
  }

  stats() {
    return [0, 1].map((t) => {
      const alive = this.teams[t].filter((u) => u.alive);
      return {
        alive: alive.length, total: this.teams[t].length,
        value: alive.reduce((s, u) => s + u.def.cost, 0), startValue: this.startValue[t],
      };
    });
  }

  destroy() {
    this.world.free();
    this.units = [];
  }
}
