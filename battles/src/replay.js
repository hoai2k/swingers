// Battle recording and playback. Frames are sampled at a fixed sim-time rate with
// quantised transforms (int16 positions in cm, int16 quaternions) and interpolated
// on playback; events (effects/sounds) are replayed when playback passes them.
import { THREE } from './util.js';
import { NPARTS } from './body.js';
import { PROJ_TYPES } from './battle.js';
import { placeHeld } from './visual.js';

export const REC_HZ = 30;
function restingStuck(s) {
  if (s.held) return !!s.held.body && s.held.body.isSleeping();
  if (s.unit) return !s.unit.alive && s.unit.rag.bodies[0].isSleeping();
  return true;
}
const q16 = (x) => Math.max(-32767, Math.min(32767, Math.round(x)));

export class Recorder {
  constructor(battle) {
    this.units = battle.units.map((u) => ({ type: u.def.id, team: u.team }));
    this.n = battle.units.reduce((s, u) => s + NPARTS + u.extras.length, 0);
    this.frames = [];
    this.events = [];
    this.statics = [];
    this.restDrops = [];
    this.next = 0;
    this.maxFrames = REC_HZ * 60 * 6; // 6 minutes
  }

  event(t, e) { if (this.frames.length < this.maxFrames) this.events.push({ t, e }); }

  capture(b) {
    if (b.time + 1e-6 < this.next || this.frames.length >= this.maxFrames) return;
    this.next = b.time + 1 / REC_HZ;
    const bodies = new Int16Array(this.n * 7);
    let k = 0;
    for (const u of b.units) {
      const r = u.rag;
      const ne = u.extras.length;
      for (let i = 0; i < NPARTS + ne; i++) {
        const p = i < NPARTS ? r.pos[i] : u.extras[i - NPARTS].pos, q = i < NPARTS ? r.quat[i] : u.extras[i - NPARTS].quat;
        bodies[k++] = Math.max(-32767, Math.min(32767, Math.round(p.x * 100)));
        bodies[k++] = Math.max(-32767, Math.min(32767, Math.round(p.y * 100)));
        bodies[k++] = Math.max(-32767, Math.min(32767, Math.round(p.z * 100)));
        bodies[k++] = Math.round(q.x * 32767);
        bodies[k++] = Math.round(q.y * 32767);
        bodies[k++] = Math.round(q.z * 32767);
        bodies[k++] = Math.round(q.w * 32767);
      }
    }
    const us = new Uint8Array(b.units.length);
    const hp = new Uint8Array(b.units.length);
    b.units.forEach((u, i) => {
      us[i] = (u.expr & 7) | (u.alive ? 8 : 0) | (u.itemHidden ? 16 : 0);
      hp[i] = Math.round(255 * Math.max(0, u.hp) / u.maxHp);
    });
    // arrows stuck in the ground (or in a corpse / dropped shield at rest) don't
    // move: recorded once per resting spell, with its start and end time
    const fno = this.frames.length;
    let nd = 0;
    for (const s of b.stuck) {
      s.moving = !restingStuck(s);
      if (s.moving) {
        if (s.rec) { if (s.rec.t1 === Infinity) s.rec.t1 = b.time; s.rec = null; }
        nd++; continue;
      }
      if (!s.rec) {
        s.rec = { id: s.id, type: PROJ_TYPES.indexOf(s.type), p: s.pos.clone(), q: s.quat.clone(), t0: b.time, t1: Infinity, seen: fno };
        this.statics.push(s.rec);
      }
      s.rec.seen = fno;
    }
    for (const r of this.statics) if (r.t1 === Infinity && r.seen !== fno) r.t1 = b.time;
    const np = b.projectiles.length + nd;
    const proj = new Float32Array(np * 9);
    let j = 0;
    const put = (id, type, p, q) => {
      proj[j++] = id; proj[j++] = PROJ_TYPES.indexOf(type);
      proj[j++] = p.x; proj[j++] = p.y; proj[j++] = p.z;
      proj[j++] = q.x; proj[j++] = q.y; proj[j++] = q.z; proj[j++] = q.w;
    };
    for (const p of b.projectiles) put(p.id, p.type, p.pos, p.quat);
    for (const s of b.stuck) if (s.moving) put(s.id, s.type, s.pos, s.quat);
    // weapons and shields that have been let go of: [unit, slot, x, y, z (cm), quat]
    // while moving; once at rest, one record per resting spell (restDrops)
    const moving = [];
    b.units.forEach((u, ui) => {
      for (const h of u.held) {
        if (!h.body) continue;
        if (!h.body.isSleeping()) {
          if (h.rec) { if (h.rec.t1 === Infinity) h.rec.t1 = b.time; h.rec = null; }
          moving.push(ui, h);
        } else if (!h.rec) {
          h.rec = { ui, slot: h.slot, p: h.pos.clone(), q: h.quat.clone(), t0: b.time, t1: Infinity };
          this.restDrops.push(h.rec);
        }
      }
    });
    const drops = new Int16Array(moving.length / 2 * 9);
    let d = 0;
    for (let k = 0; k < moving.length; k += 2) {
      const h = moving[k + 1];
      drops[d++] = moving[k]; drops[d++] = h.slot;
      drops[d++] = q16(h.pos.x * 100); drops[d++] = q16(h.pos.y * 100); drops[d++] = q16(h.pos.z * 100);
      drops[d++] = Math.round(h.quat.x * 32767); drops[d++] = Math.round(h.quat.y * 32767);
      drops[d++] = Math.round(h.quat.z * 32767); drops[d++] = Math.round(h.quat.w * 32767);
    }
    this.frames.push({ t: b.time, bodies, us, hp, proj, drops, counts: b.stats().map((s) => s.alive) });
  }

  get duration() { return this.frames.length ? this.frames[this.frames.length - 1].t : 0; }
}

const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _p = new THREE.Vector3();

export class Player {
  constructor(rec) {
    this.rec = rec;
    this.t = 0;
    this.speed = 1;
    this.playing = true;
    this.evIdx = 0;
  }

  get duration() { return this.rec.duration; }

  frameAt(t) {
    const f = this.rec.frames;
    if (!f.length) return null;
    let lo = 0, hi = f.length - 1;
    if (t <= f[0].t) return { a: f[0], b: f[0], k: 0 };
    if (t >= f[hi].t) return { a: f[hi], b: f[hi], k: 0 };
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (f[m].t <= t) lo = m; else hi = m;
    }
    const a = f[lo], b = f[hi];
    return { a, b, k: (t - a.t) / Math.max(1e-6, b.t - a.t) };
  }

  // Advance time; returns the events crossed while moving forward by a small step
  // (normal play or a forward scrub). Any jump (backwards, or a skip) sets
  // `this.jumped` so the caller can clear lingering effects instead of showing
  // particles from another moment.
  advance(dt, scrub) {
    const t0 = this.t;
    if (scrub) this.t += scrub * dt * 3;
    else if (this.playing) this.t += dt * this.speed;
    this.t = Math.max(0, Math.min(this.duration, this.t));
    const out = [];
    const ev = this.rec.events;
    this.jumped = !!this.seeked;
    this.seeked = false;
    if (this.t >= t0 && this.t - t0 < 0.5) {
      while (this.evIdx < ev.length && ev[this.evIdx].t <= this.t) {
        if (ev[this.evIdx].t > t0) out.push(ev[this.evIdx].e);
        this.evIdx++;
      }
    } else { this.resyncEvents(); this.jumped = true; }
    if (this.t >= this.duration && !scrub) this.playing = false;
    return out;
  }

  // Unit deaths for timeline markers: [{t, team}]
  deaths() {
    return this.rec.events.filter((x) => x.e[0] === 'death').map((x) => ({ t: x.t, team: x.e[4], x: x.e[1], y: x.e[2], z: x.e[3] }));
  }

  seek(t) { this.t = Math.max(0, Math.min(this.duration, t)); this.resyncEvents(); this.seeked = true; }

  resyncEvents() {
    const ev = this.rec.events;
    let lo = 0, hi = ev.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (ev[m].t <= this.t) lo = m + 1; else hi = m; }
    this.evIdx = lo;
  }

  // write unit part transforms into visuals
  apply(visuals, projViz, dt) {
    const fr = this.frameAt(this.t);
    if (!fr) return null;
    const { a, b, k } = fr;
    const A = a.bodies, B = b.bodies;
    let o = 0;
    for (let u = 0; u < visuals.length; u++) {
      const vis = visuals[u];
      const ex = vis.extraParts || [];
      for (let i = 0; i < NPARTS + ex.length; i++, o += 7) {
        const g = i < NPARTS ? vis.parts[i] : ex[i - NPARTS].group;
        g.position.set(
          (A[o] + (B[o] - A[o]) * k) / 100,
          (A[o + 1] + (B[o + 1] - A[o + 1]) * k) / 100,
          (A[o + 2] + (B[o + 2] - A[o + 2]) * k) / 100);
        _qa.set(A[o + 3], A[o + 4], A[o + 5], A[o + 6]).normalize();
        _qb.set(B[o + 3], B[o + 4], B[o + 5], B[o + 6]).normalize();
        g.quaternion.slerpQuaternions(_qa, _qb, k);
      }
      for (let i = 0; i < (vis.held?.length || 0); i++) placeHeld(vis, i, null);
    }
    // dropped weapons: at rest, then moving
    for (const r of this.rec.restDrops) {
      if (r.t0 > this.t + 1e-6 || r.t1 <= this.t) continue;
      const vis = visuals[r.ui];
      if (vis) placeHeld(vis, r.slot, r.p, r.q);
    }
    const da = a.drops, db = b.drops;
    if (da && da.length) {
      const idx = new Map();
      for (let j = 0; db && j < db.length; j += 9) idx.set(db[j] * 64 + db[j + 1], j);
      for (let j = 0; j < da.length; j += 9) {
        const vis = visuals[da[j]];
        if (!vis) continue;
        const jb = idx.get(da[j] * 64 + da[j + 1]);
        const B2 = jb === undefined ? da : db, o2 = jb === undefined ? j : jb;
        _p.set(da[j + 2] + (B2[o2 + 2] - da[j + 2]) * k, da[j + 3] + (B2[o2 + 3] - da[j + 3]) * k, da[j + 4] + (B2[o2 + 4] - da[j + 4]) * k).multiplyScalar(0.01);
        _qa.set(da[j + 5], da[j + 6], da[j + 7], da[j + 8]).normalize();
        _qb.set(B2[o2 + 5], B2[o2 + 6], B2[o2 + 7], B2[o2 + 8]).normalize();
        _qa.slerp(_qb, k);
        placeHeld(vis, da[j + 1], _p, _qa);
      }
    }
    // projectiles: interpolate those present in both frames
    projViz.begin();
    const pa = a.proj, pb = b.proj;
    const idxB = new Map();
    for (let j = 0; j < pb.length; j += 9) idxB.set(pb[j], j);
    for (let j = 0; j < pa.length; j += 9) {
      const jb = idxB.get(pa[j]);
      let x = pa[j + 2], y = pa[j + 3], z = pa[j + 4];
      if (jb !== undefined && k > 0) { x += (pb[jb + 2] - x) * k; y += (pb[jb + 3] - y) * k; z += (pb[jb + 4] - z) * k; }
      projViz.put(pa[j], PROJ_TYPES[pa[j + 1]], x, y, z, pa[j + 5], pa[j + 6], pa[j + 7], pa[j + 8]);
    }
    for (const s of this.rec.statics) {
      if (s.t0 > this.t + 1e-6 || s.t1 <= this.t) continue;
      projViz.put(s.id, PROJ_TYPES[s.type], s.p.x, s.p.y, s.p.z, s.q.x, s.q.y, s.q.z, s.q.w);
    }
    projViz.end(this.playing ? dt : 0);
    return a;
  }
}
