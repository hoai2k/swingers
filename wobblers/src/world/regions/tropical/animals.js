// Coconut Cove wildlife (world/wildlife.js): flamingo flocks wading in the lagoon shallows (they wade
// off when you splash over) and iguanas sunning themselves on the islets. Models are round-18
// stand-ins until their reference sheets arrive (image-requests.md).
import { wildlife } from '../../wildlife.js';
import { RESORT, HARBOUR, POOL, LIGHTHOUSE } from '../tropical.js';

export function buildTropicalAnimals(game, R) {
  const box = (x, z, b, m) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m;
  const busy = (x, z) => box(x, z, RESORT, 12) || box(x, z, HARBOUR, 15) || box(x, z, POOL, 6) || Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z) < 15;
  const land = (x, z, strict) => {
    if (busy(x, z)) return false;
    const h = R.groundAt(x, z);
    if (h < 0.6 || h > 12) return false;
    if (!strict && Math.abs(R.groundAt(x + 2, z) - h) + Math.abs(R.groundAt(x, z + 2) - h) > 1.6) return false;
    return true;
  };
  const shallows = (x, z) => { if (busy(x, z)) return false; const h = R.groundAt(x, z); return h > -1.4 && h < -0.45; };   // knee-deep (their legs are 0.75 m)
  const W = wildlife(game, R, { seed: 3838, ok: land });
  W.mk('flamingo', 'flamingo', 18, { k: { LEG: 0.5, FLAP: 0 } });
  W.mk('iguana', 'iguana', 8, { k: { LEG: 0.6, TAILA: 0.3 } });
  // flamingo flocks wading in the shallows: the knee-deep band round the islets is only a few metres
  // wide (too thin for walking loops), so each flock gets a handful of shallow points picked here
  // and drifts between them, wading off to the farthest one when someone comes close
  const [bx0, bx1, bz0, bz1] = R.bounds, flocks = [];
  for (let tries = 0; flocks.length < 3 && tries < 4000; tries++) {
    const x = bx0 + 30 + W.rnd() * (bx1 - bx0 - 60), z = bz0 + 30 + W.rnd() * (bz1 - bz0 - 60);
    if (!shallows(x, z) || flocks.some((f) => Math.hypot(f.x - x, f.z - z) < 60)) continue;
    const pts = [[x, z]];
    for (let k = 0; k < 60 && pts.length < 8; k++) { const a = W.rnd() * 6.283, d = 2 + W.rnd() * 7, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; if (shallows(px, pz)) pts.push([px, pz]); }
    if (pts.length < 4) continue;
    flocks.push({ x, z, pts: pts.map(([px, pz]) => [px, R.groundAt(px, pz), pz]) });
  }
  flocks.forEach((f, fi) => { for (let i = 0; i < 5; i++) W.add({ kind: 'flamingo', custom: wade, flock: f, i: fi * 5 + i, x: f.x, z: f.z, s: 0.9 + W.rnd() * 0.2, sound: 'honk', hear: 9 }); });
  function wade(a, t, dt, S, Wl) {
    const P = a.flock.pts, st = a.st ||= { k: a.i % P.length, x: P[a.i % P.length][0] + (a.i % 3) * 0.7, z: P[a.i % P.length][2], ph: 0, until: 0 };
    const n = Wl.nearest(st.x, st.z, 6);
    if (n && !st.flee) { let best = st.k, bd = 0; P.forEach((p, k) => { const d = Math.hypot(p[0] - n.x, p[2] - n.z); if (d > bd) { bd = d; best = k; } }); st.k = best; st.flee = true; }
    if (!n) st.flee = false;
    if (t > st.until && !st.flee) { st.k = Math.floor((a.i * 7 + t / 9) % P.length); st.until = t + 8 + (a.i % 4) * 3; }
    const [tx, , tz] = P[st.k], ox = tx + ((a.i % 3) - 1) * 0.9, oz = tz + ((a.i % 2) - 0.5) * 1.2;
    const dx = ox - st.x, dz = oz - st.z, d = Math.hypot(dx, dz), stp = Math.min(d, (st.flee ? 1.6 : 0.4) * dt);
    if (d > 1e-3) { st.x += dx / d * stp; st.z += dz / d * stp; st.yaw = Math.atan2(dx, dz); }
    st.ph += stp * 6.283 / 0.6;
    const moving = d > 0.05;
    S.flamingo.put(st.x, R.groundAt(st.x, st.z), st.z, (st.yaw || 0) + (moving ? 0 : Math.sin(t * 0.4 + a.i) * 0.5), moving ? 0 : -0.25 * Math.max(0, Math.sin(t * 0.5 + a.i)), 0, a.s, moving ? st.ph : t * 0.5, moving ? 1 : 0.1);
    a.x = st.x; a.z = st.z; return true;
  }
  W.place('iguana', 6, 4, 0.5, 4, 25, { flee: 4, fleeV: 3.5, sound: 'hiss', hear: 4, stride: 0.3 });
  W.start('tropicalAnimals', { grab: { iguana: { r: 0.09, len: 0.3, y: 0.13, kg: 4, run: 4, pick: true } } });
}
