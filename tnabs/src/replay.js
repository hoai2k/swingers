// Battle recording and playback. Frames are sampled at a fixed sim-time rate with
// quantised transforms (int16 positions in cm, int16 quaternions) and interpolated
// on playback; events (effects/sounds) are replayed when playback passes them.
import { THREE } from './util.js';
import { NPARTS } from './body.js';
import { PROJ_TYPES } from './battle.js';

export const REC_HZ = 30;

export class Recorder {
  constructor(battle) {
    this.units = battle.units.map((u) => ({ type: u.def.id, team: u.team }));
    this.n = battle.units.length * NPARTS;
    this.frames = [];
    this.events = [];
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
      for (let i = 0; i < NPARTS; i++) {
        const p = r.pos[i], q = r.quat[i];
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
    const np = b.projectiles.length + b.stuck.length;
    const proj = new Float32Array(np * 9);
    let j = 0;
    const put = (id, type, p, q) => {
      proj[j++] = id; proj[j++] = PROJ_TYPES.indexOf(type);
      proj[j++] = p.x; proj[j++] = p.y; proj[j++] = p.z;
      proj[j++] = q.x; proj[j++] = q.y; proj[j++] = q.z; proj[j++] = q.w;
    };
    for (const p of b.projectiles) put(p.id, p.type, p.pos, p.quat);
    for (const s of b.stuck) put(s.id, s.type, s.pos, s.quat);
    this.frames.push({ t: b.time, bodies, us, hp, proj, counts: b.stats().map((s) => s.alive) });
  }

  get duration() { return this.frames.length ? this.frames[this.frames.length - 1].t : 0; }
}

const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();

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
      for (let i = 0; i < NPARTS; i++, o += 7) {
        const g = vis.parts[i];
        g.position.set(
          (A[o] + (B[o] - A[o]) * k) / 100,
          (A[o + 1] + (B[o + 1] - A[o + 1]) * k) / 100,
          (A[o + 2] + (B[o + 2] - A[o + 2]) * k) / 100);
        _qa.set(A[o + 3], A[o + 4], A[o + 5], A[o + 6]).normalize();
        _qb.set(B[o + 3], B[o + 4], B[o + 5], B[o + 6]).normalize();
        g.quaternion.slerpQuaternions(_qa, _qb, k);
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
    projViz.end(this.playing ? dt : 0);
    return a;
  }
}
