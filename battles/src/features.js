// Terrain features that change how a battle plays: hills and plateaus (real
// elevation in the shared height grid, so units, feet, projectiles and effects all
// see them), rivers and pools (shallow water that slows waders), bridges, and
// obstacles - walls, towers, ruins, pillars, tombstones, rocks, trees (static
// colliders) and crates, barrels and fences (static until something smashes them).
//
// A map lists its features with `layout(L)` (see the Layout methods below). Every
// feature is mirrored through the centre of the field automatically (pass c = true
// for one that sits on the centre and is its own mirror), so the battlefield stays
// point-symmetric and neither army gets better ground.
//
// The runtime side, all per battle and all through hooks:
//  - Terrain.addCollider() adds the obstacle colliders to the battle's world;
//  - terrain.steer(unit) (called from Unit.think) slows waders and steers around
//    obstacles (slide along the wall, toward its nearer end);
//  - an EXT.battleStep hook stops projectiles at obstacles, smashes breakables hit
//    by flying bodies, heavy projectiles and blasts, and splashes water;
//  - terrain.blocked(x, z, r) keeps setup placements out of walls and water.
import { THREE, clamp, lerp, smooth } from './util.js';
import { RAPIER, GROUPS } from './physics.js';
import { EXT } from './ext.js';

// projectile table, read at run time (a static import would create a load cycle
// that could evaluate battle.js before the packs register their projectiles)
let PROJ = null;
import('./battle.js').then((m) => { PROJ = m.PROJ; });

const hash1 = (n) => { const s = Math.sin(n * 91.345 + 47.853) * 43758.5453; return s - Math.floor(s); };

// ------------------------------------------------------------------ layout
const BREAKABLE = { crate: 1, barrel: 1, fence: 1, ironfence: 1, pot: 1, pumpkin: 1 };

export class Layout {
  constructor() { this.ops = []; this.obs = []; this.paints = []; this.bridges = []; this.n = 0; }
  _op(o, c) { this.ops.push(o); if (!c) this.ops.push(mirrorOp(o)); }
  _ob(o, c) {
    o.seed = ++this.n;
    this.obs.push(o);
    if (!c) this.obs.push({ ...o, x: -o.x, z: -o.z, seed: o.seed + 0.5 });
  }
  // a round hill: cosine bump of radius r and height h
  hill(x, z, r, h, c) { this._op({ t: 'hill', x, z, r, h }, c); return this; }
  // a flat-topped plateau (top half extents hw x hd, h high, sloped sides `ramp` wide)
  plateau(x, z, hw, hd, h, ramp = h * 2, rot = 0, c) { this._op({ t: 'plat', x, z, hw, hd, h, ramp, rot }, c); return this; }
  // a river along z through the middle: centre x = amp sin(k z); width w, depth d,
  // shallower by `ford` around z = 0 (always centred: its own mirror)
  river(amp, k, w, depth, ford = 0) { this.ops.push({ t: 'river', amp, k, w, depth, ford }); return this; }
  pool(x, z, r, depth, c) { this._op({ t: 'pool', x, z, r, depth }, c); return this; }
  // a wooden bridge or boardwalk from (x0,z0) to (x1,z1), w wide, with rails
  bridge(x0, z0, x1, z1, w = 4.5, c) {
    const add = (a, b, d, e) => {
      const o = { t: 'bridge', x0: a, z0: b, x1: d, z1: e, w };
      this.ops.push(o); this.bridges.push(o);
      const L = Math.hypot(d - a, e - b), ux = (d - a) / L, uz = (e - b) / L;
      const rot = Math.atan2(-uz, ux); // box local x along the bridge
      for (const s of [-1, 1]) {
        const ox = -uz * s * (w / 2 - 0.12), oz = ux * s * (w / 2 - 0.12);
        this.obs.push({ kind: 'rail', shape: 'box', x: (a + d) / 2 + ox, z: (b + e) / 2 + oz, hw: L / 2 - 1.2, hd: 0.09, h: 0.95, rot, seed: ++this.n });
      }
    };
    add(x0, z0, x1, z1);
    if (!c) add(-x0, -z0, -x1, -z1);
    return this;
  }
  box(kind, x, z, hw, hd, h, rot = 0, opts = {}, c) { this._ob({ kind, shape: 'box', x, z, hw, hd, h, rot, ...opts }, c); return this; }
  cyl(kind, x, z, r, h, opts = {}, c) { this._ob({ kind, shape: 'cyl', x, z, r, h, rot: 0, ...opts }, c); return this; }
  // a straight wall from (x0,z0) to (x1,z1)
  wall(x0, z0, x1, z1, h = 2.6, thick = 0.9, kind = 'wall', c) {
    const L = Math.hypot(x1 - x0, z1 - z0);
    return this.box(kind, (x0 + x1) / 2, (z0 + z1) / 2, L / 2, thick / 2, h, Math.atan2(-(z1 - z0), x1 - x0), {}, c);
  }
  // a ruined wall: chunks of varying height with the odd gap
  ruin(x0, z0, x1, z1, hMin = 1.2, hMax = 2.6, thick = 0.8) {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 1.6));
    for (let i = 0; i < n; i++) {
      const r = hash1(this.n * 3.1 + i * 7.7);
      if (i > 0 && i < n - 1 && r < 0.18) continue; // a breach
      const a = i / n, b = (i + 1) / n;
      const h = lerp(hMin, hMax, hash1(this.n * 1.3 + i * 2.9));
      this.wall(lerp(x0, x1, a), lerp(z0, z1, a), lerp(x0, x1, b), lerp(z0, z1, b), h, thick, 'ruin');
    }
    return this;
  }
  // breakable fence from (x0,z0) to (x1,z1) in ~3 m panels
  fence(x0, z0, x1, z1, kind = 'fence', c) {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 3.3));
    for (let i = 0; i < n; i++) {
      const a = (i + 0.5) / n;
      this.box(kind, lerp(x0, x1, a), lerp(z0, z1, a), 1.6, 0.1, 1.05, Math.atan2(-(z1 - z0), x1 - x0), {}, c);
    }
    return this;
  }
  // a small pile of crates and barrels
  crates(x, z, n = 3, rot = 0, c) {
    const spots = [[0, 0], [1.2, 0.1], [0.3, 1.2], [-1.1, 0.4], [1.3, 1.3], [-0.6, -1.2]];
    for (let i = 0; i < Math.min(n, spots.length); i++) {
      const [a, b] = spots[i], cs = Math.cos(rot), sn = Math.sin(rot);
      const px = x + a * cs + b * sn, pz = z - a * sn + b * cs;
      if (i % 3 === 2) this.cyl('barrel', px, pz, 0.45, 1.05, {}, c);
      else this.box('crate', px, pz, 0.55, 0.55, 1.1, rot + i * 0.3, {}, c);
    }
    return this;
  }
  tree(type, x, z, s = 1, c) { return this.cyl('tree', x, z, 0.42 * s, 5 * s, { sub: type, s }, c); }
  rock(x, z, r, h = r * 1.3, c) { return this.cyl('rock', x, z, r, h, {}, c); }
  // tint the ground: rect (hw x hd, rot) or round (r), soft edge `soft`
  paint(x, z, hw, hd, color, { rot = 0, soft = 1.5, round = false, k = 1, noise = 0.25 } = {}, c) {
    const p = { x, z, hw, hd, color: new THREE.Color(color), rot, soft, round, k, noise };
    this.paints.push(p);
    if (!c) this.paints.push({ ...p, x: -x, z: -z });
    return this;
  }
}

function mirrorOp(o) {
  const m = { ...o };
  if ('x' in o) { m.x = -o.x; m.z = -o.z; }
  return m;
}

// ------------------------------------------------------------------ build
// Applies the map's features to the terrain's height grid and returns the
// feature data (obstacles, water) the rest of the game uses.
export function buildFeatures(map, terrain, field) {
  if (!map.layout) return null;
  const L = new Layout();
  map.layout(L);
  const SIZE = terrain.size, SEG = terrain.seg, n = SEG + 1, H = terrain.h;
  const cell = SIZE / SEG;
  const X = (ix) => (ix / SEG - 0.5) * SIZE;
  const IX = (x) => Math.round((x / SIZE + 0.5) * SEG);
  const ws = new Float32Array(n * n).fill(NaN); // water surface level
  // visit grid vertices within a world rect
  const each = (x0, x1, z0, z1, fn) => {
    const a = clamp(IX(x0) - 1, 0, SEG), b = clamp(IX(x1) + 1, 0, SEG);
    const c = clamp(IX(z0) - 1, 0, SEG), d = clamp(IX(z1) + 1, 0, SEG);
    for (let iz = c; iz <= d; iz++) for (let ix = a; ix <= b; ix++) fn(iz * n + ix, X(ix), X(iz));
  };
  for (const o of L.ops) {
    if (o.t === 'hill') {
      each(o.x - o.r, o.x + o.r, o.z - o.r, o.z + o.r, (i, x, z) => {
        const d = Math.hypot(x - o.x, z - o.z) / o.r;
        if (d < 1) H[i] += o.h * (0.5 + 0.5 * Math.cos(Math.PI * d));
      });
    } else if (o.t === 'plat') {
      const top = terrain.height(o.x, o.z) + o.h, R = Math.hypot(o.hw, o.hd) + o.ramp;
      const cs = Math.cos(o.rot), sn = Math.sin(o.rot);
      each(o.x - R, o.x + R, o.z - R, o.z + R, (i, x, z) => {
        const dx = x - o.x, dz = z - o.z;
        const lx = Math.abs(dx * cs - dz * sn) - o.hw, lz = Math.abs(dx * sn + dz * cs) - o.hd;
        const out = Math.hypot(Math.max(0, lx), Math.max(0, lz));
        const f = 1 - smooth(clamp(out / o.ramp, 0, 1));
        if (f > 0) H[i] = Math.max(H[i], lerp(H[i], top, f));
      });
    } else if (o.t === 'river') {
      const cx = (z) => o.amp * Math.sin(o.k * z);
      const depth = (z) => o.depth - o.ford * Math.exp(-(z * z) / 50);
      const bank = 2.2, half = o.w / 2;
      // centre-line level per row (the river runs level across its width)
      const lvl = new Float32Array(n);
      for (let iz = 0; iz <= SEG; iz++) lvl[iz] = terrain.height(cx(X(iz)), X(iz));
      for (let iz = 0; iz <= SEG; iz++) {
        const z = X(iz), c = cx(z), hc = lvl[iz], d = depth(z);
        for (let ix = clamp(IX(c - half - bank - 2), 0, SEG); ix <= clamp(IX(c + half + bank + 2), 0, SEG); ix++) {
          const x = X(ix), i = iz * n + ix;
          const dx = Math.abs(x - c);
          const prof = 1 - smooth(clamp((dx - (half - bank)) / bank, 0, 1));
          H[i] = Math.min(H[i], lerp(H[i], hc - d, prof));
          if (dx < half) ws[i] = hc - 0.15;
        }
      }
    } else if (o.t === 'pool') {
      const lv = terrain.height(o.x, o.z), bank = Math.min(2.5, o.r * 0.45);
      each(o.x - o.r - 2, o.x + o.r + 2, o.z - o.r - 2, o.z + o.r + 2, (i, x, z) => {
        const d = Math.hypot(x - o.x, z - o.z);
        const prof = 1 - smooth(clamp((d - (o.r - bank)) / bank, 0, 1));
        H[i] = Math.min(H[i], lerp(H[i], lv - o.depth, prof));
        if (d < o.r) ws[i] = lv - 0.12;
      });
    } else if (o.t === 'bridge') {
      const Lb = Math.hypot(o.x1 - o.x0, o.z1 - o.z0), ux = (o.x1 - o.x0) / Lb, uz = (o.z1 - o.z0) / Lb;
      const deck = Math.max(terrain.height(o.x0, o.z0), terrain.height(o.x1, o.z1)) + 0.05;
      o.deck = deck; o.len = Lb; o.ux = ux; o.uz = uz;
      const mx = (o.x0 + o.x1) / 2, mz = (o.z0 + o.z1) / 2, R = Lb / 2 + o.w;
      each(mx - R, mx + R, mz - R, mz + R, (i, x, z) => {
        const dx = x - mx, dz = z - mz;
        const u = dx * ux + dz * uz, v = Math.abs(-dx * uz + dz * ux);
        if (Math.abs(u) > Lb / 2) return;
        const f = 1 - smooth(clamp((v - o.w / 2 + 0.3) / 1.3, 0, 1));
        const arch = 0.45 * (1 - (2 * u / Lb) ** 2);
        if (f > 0) H[i] = Math.max(H[i], lerp(H[i], deck + arch, f));
      });
    }
  }
  // exact point symmetry inside the field (and a little beyond)
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
    const x = X(ix), z = X(iz);
    if (Math.abs(x) > field.x + 6 || Math.abs(z) > field.z + 6) continue;
    const i = iz * n + ix, j = (SEG - iz) * n + (SEG - ix);
    if (j < i) continue;
    const a = (H[i] + H[j]) / 2; H[i] = H[j] = a;
    const wa = ws[i], wb = ws[j];
    if (wa === wa || wb === wb) { const w = wa === wa && wb === wb ? (wa + wb) / 2 : wa === wa ? wa : wb; ws[i] = ws[j] = w; }
  }
  // wet depth per vertex
  const wd = new Float32Array(n * n);
  let anyWater = false;
  for (let i = 0; i < n * n; i++) if (ws[i] === ws[i] && ws[i] > H[i]) { wd[i] = ws[i] - H[i]; anyWater = true; }

  // obstacles: settle on the ground, cache transforms
  const obs = L.obs.map((o, idx) => {
    o.i = idx;
    o.breakable = !!BREAKABLE[o.kind];
    o.cs = Math.cos(o.rot); o.sn = Math.sin(o.rot);
    const g = terrain.height(o.x, o.z);
    let lo = g;
    const ext = o.shape === 'box' ? [[o.hw, o.hd], [-o.hw, o.hd], [o.hw, -o.hd], [-o.hw, -o.hd], [0, 0]] : [[o.r, 0], [-o.r, 0], [0, o.r], [0, -o.r]];
    for (const [a, b] of ext) {
      const wx = o.x + a * o.cs + b * o.sn, wz = o.z - a * o.sn + b * o.cs;
      lo = Math.min(lo, terrain.height(wx, wz));
    }
    o.ground = g;
    o.y0 = lo - 0.4;
    o.top = g + o.h;
    o.R = o.shape === 'box' ? Math.hypot(o.hw, o.hd) : o.r;
    return o;
  });
  return { obs, ws, wd, anyWater, bridges: L.bridges, paints: L.paints, cell };
}

// ------------------------------------------------------------------ queries
// closest point of an obstacle's footprint to (x, z): writes out = [cx, cz, dist]
// (dist < 0 when inside, as minus the depth to the nearest side)
function closest(o, x, z, out) {
  if (o.shape === 'cyl') {
    const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz) || 1e-6;
    out[0] = o.x + (dx / d) * o.r; out[1] = o.z + (dz / d) * o.r; out[2] = d - o.r;
    return out;
  }
  const dx = x - o.x, dz = z - o.z;
  const lx = dx * o.cs - dz * o.sn, lz = dx * o.sn + dz * o.cs;
  let cx = clamp(lx, -o.hw, o.hw), cz = clamp(lz, -o.hd, o.hd);
  let dist;
  if (cx === lx && cz === lz) { // inside: nearest side
    const ex = o.hw - Math.abs(lx), ez = o.hd - Math.abs(lz);
    if (ex < ez) { cx = Math.sign(lx || 1) * o.hw; dist = -ex; } else { cz = Math.sign(lz || 1) * o.hd; dist = -ez; }
  } else dist = Math.hypot(lx - cx, lz - cz);
  out[0] = o.x + cx * o.cs + cz * o.sn; out[1] = o.z - cx * o.sn + cz * o.cs; out[2] = dist;
  return out;
}
const _cp = [0, 0, 0];

// Terrain mix-in: query / steering methods (installed on Terrain.prototype by world.js)
export const TerrainFeatures = {
  // water depth at (x, z) (0 when dry)
  waterDepth(x, z) {
    const F = this.feat;
    if (!F || !F.anyWater) return 0;
    const SEG = this.seg, n = SEG + 1;
    const fx = clamp((x / this.size + 0.5) * SEG, 0, SEG - 1e-3), fz = clamp((z / this.size + 0.5) * SEG, 0, SEG - 1e-3);
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, w = F.wd;
    const a = w[iz * n + ix], b = w[iz * n + ix + 1], c = w[(iz + 1) * n + ix], d = w[(iz + 1) * n + ix + 1];
    if (a + b + c + d === 0) return 0;
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  },
  // can't place a unit of radius r here (in water, or in / against an obstacle)
  blocked(x, z, r = 0.3) {
    const F = this.feat;
    if (!F) return false;
    if (F.anyWater && this.waterDepth(x, z) > 0.06) return true;
    for (const o of F.obs) {
      if (Math.abs(x - o.x) > o.R + r + 0.3 || Math.abs(z - o.z) > o.R + r + 0.3) continue;
      if (closest(o, x, z, _cp)[2] < r + 0.15) return true;
    }
    return false;
  },
  // is the straight line a -> c (points in the world) blocked by the ground or a standing
  // obstacle taller than knee height? (for pack AI that aims shots itself)
  losBlocked(b, a, c) {
    return !!this.feat && this.feat.obs !== undefined && losBlocked(this, this.feat, STATE.get(b.world), a, c);
  },
  // Per-unit AI hook (Unit.think, after its desired velocity is set): wading slows
  // units down; obstacles ahead turn the desired velocity along their side.
  steer(u) {
    const F = this.feat;
    if (!F) return;
    const b = u.battle, p = u.pos, d = u.desired;
    const st = STATE.get(b.world);
    // shooters with a wall between them and their target walk round it instead of
    // plinking at the stones (high lobs clear most things, so only flat shots check)
    const wpn = u.def.weapon, t = u.target;
    if (wpn.kind === 'ranged' && wpn.arc !== 'high' && t && t.alive && F.obs.length) {
      if ((u._losT = (u._losT || 0) - 1 / 60) <= 0) { u._losT = 0.4 + Math.random() * 0.2; u._noLos = losBlocked(this, F, st, u.chestPos, t.chestPos); }
      if (u._noLos) {
        const dx = t.pos.x - p.x, dz = t.pos.z - p.z, m = Math.hypot(dx, dz) || 1;
        d.x = (dx / m) * u.def.speed; d.z = (dz / m) * u.def.speed;
      }
    } else u._noLos = false;
    let sp = Math.hypot(d.x, d.z);
    if (F.anyWater) {
      const dep = this.waterDepth(p.x, p.z);
      if (dep > 0.05) {
        const k = 1 - 0.5 * clamp(dep / (0.75 * u.s), 0, 1);
        d.x *= k; d.z *= k; sp *= k;
        // a splash now and then from a wader on the move
        const v = u.rag.vel[0];
        if (st && Math.hypot(v.x, v.z) > 0.8 && (u._splashT = (u._splashT || Math.random() * 0.5) - 1 / 60) <= 0 && st.splash < 40) {
          u._splashT = 0.35 + Math.random() * 0.3;
          st.splash += 2;
          splash(b, p.x, p.y - u.skel.standHeight + dep, p.z, 0.7 * Math.sqrt(u.s));
        }
      }
    }
    if (!F.obs.length || sp < 0.05) return;
    const r = u.skel.radius, look = r + 1.1 + sp * 0.35;
    // knocked onto an obstacle and flailing up there: nudge off the nearest edge
    if (u.airT > 0.8 && st) {
      for (const o of F.obs) {
        if (st.broken[o.i] || p.y < o.top - 0.3) continue;
        if (closest(o, p.x, p.z, _cp)[2] > 0.1) continue;
        const nx = _cp[0] - p.x, nz = _cp[1] - p.z, m = Math.hypot(nx, nz) || 1;
        if (Math.random() < 0.1) u.rag.impulseAll((nx / m) * u.M * 1.5, u.M * 0.8, (nz / m) * u.M * 1.5);
      }
    }
    let ox = d.x, oz = d.z, touched = false;
    for (const o of F.obs) {
      // (small round things - trees, barrels, posts - units just bump past)
      if ((st && st.broken[o.i]) || o.R < 0.75) continue;
      if (Math.abs(p.x - o.x) > o.R + look || Math.abs(p.z - o.z) > o.R + look) continue;
      // low things (rails seen from a bridge deck, a step) don't need steering if
      // we're above them
      if (p.y - u.skel.standHeight > o.top - 0.25) continue;
      closest(o, p.x, p.z, _cp);
      const dist = _cp[2];
      if (dist > look) continue;
      let nx = p.x - _cp[0], nz = p.z - _cp[1];
      let m = Math.hypot(nx, nz);
      if (dist < 0) { nx = -nx; nz = -nz; }
      if (m < 1e-4) { nx = p.x - o.x; nz = p.z - o.z; m = Math.hypot(nx, nz) || 1; }
      nx /= m; nz /= m;
      const into = ox * nx + oz * nz;
      if (into >= 0) continue;
      const w = clamp(1 - (dist - r) / Math.max(0.2, look - r), 0, 1);
      // tangent (-nz, nx) always turns the same way round its obstacle, so `side` is
      // a sense of rotation: keep the one we committed to (also from a wall on to
      // the tower at its end), else head for the nearer end
      const tx = -nz, tz = nx;
      let side = u._avT > 0 ? u._avS : 0;
      if (!side) {
        const along = ox * tx + oz * tz;
        if (Math.abs(along) > 0.25 * sp) side = Math.sign(along);
        else if (o.shape === 'box') {
          const lx = (p.x - o.x) * o.cs - (p.z - o.z) * o.sn, lz = (p.x - o.x) * o.sn + (p.z - o.z) * o.cs;
          // the long axis, toward the end on our side of the middle
          const ax = o.hw >= o.hd ? [o.cs, -o.sn, lx] : [o.sn, o.cs, lz];
          side = Math.sign((ax[0] * tx + ax[1] * tz) * (ax[2] || (u.id % 2 ? 1 : -1))) || 1;
        } else side = u.id % 2 ? 1 : -1;
        u._avS = side;
      }
      u._avT = 1.5;
      // drop the push into it, and slide along it the chosen way at least as fast
      const along = ox * tx + oz * tz, want = side * Math.max(Math.abs(along), -into);
      ox += (tx * (want - along) - nx * into * 1.05) * w;
      oz += (tz * (want - along) - nz * into * 1.05) * w;
      if (dist < r * 0.6) { ox += nx * sp * 0.6; oz += nz * sp * 0.6; }
      touched = true;
    }
    if (!touched) { u._avT = (u._avT || 0) - 1 / 60; u._avK = 0; return; }
    // going round and round (two units chasing each other round the same wall):
    // if sliding hasn't brought us closer for a while, maybe turn back
    if (t) {
      const td = Math.hypot(t.pos.x - p.x, t.pos.z - p.z);
      if (!u._avK) { u._avK = 3; u._avD = td; }
      if ((u._avK -= 1 / 60) <= 0) {
        if (td > u._avD - 1 && Math.random() < 0.6) u._avS = -u._avS;
        u._avK = 3; u._avD = td;
      }
    }
    const m2 = Math.hypot(ox, oz) || 1;
    d.x = (ox / m2) * sp; d.z = (oz / m2) * sp;
  },
};

// is the straight line a -> b blocked by a rise in the ground (a mesa, a hill) or
// an obstacle taller than knee height?
function losBlocked(T, F, st, a, b) {
  const L = Math.hypot(b.x - a.x, b.z - a.z);
  const ns = Math.ceil(L / 2);
  for (let k = 1; k < ns; k++) {
    const f = k / ns;
    if (a.y + (b.y - a.y) * f < T.height(a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f) + 0.15) return true;
  }
  for (const o of F.obs) {
    if ((st && st.broken[o.i]) || o.h < 0.9) continue;
    // cheap reject: obstacle centre far from the segment
    const t = clamp(((o.x - a.x) * (b.x - a.x) + (o.z - a.z) * (b.z - a.z)) / (L * L || 1), 0, 1);
    if (Math.hypot(a.x + (b.x - a.x) * t - o.x, a.z + (b.z - a.z) * t - o.z) > o.R + 0.3) continue;
    if (segHit(o, a.x, a.y, a.z, b.x, b.y, b.z, 0.05)) return true;
  }
  return false;
}

// white puffs and droplets at the water surface (uses the stock FX kinds)
function splash(b, x, y, z, k = 1) {
  for (let i = 0; i < 3; i++) {
    const a = Math.random() * 6.28, r = Math.random() * 0.4 * k;
    b.emit('atrail', x + Math.cos(a) * r, y + 0.05 + Math.random() * 0.2, z + Math.sin(a) * r, 0.22 * k + Math.random() * 0.12);
  }
}

// ------------------------------------------------------------------ physics
// per physics world: obstacle colliders and which breakables are smashed
const STATE = new WeakMap();

export function addFeatureColliders(terrain, world) {
  const F = terrain.feat;
  if (!F || !F.obs.length) return;
  const st = { cols: [], broken: new Uint8Array(F.obs.length), splash: 0, patched: false };
  for (const o of F.obs) {
    const hh = (o.top - o.y0) / 2;
    const desc = o.shape === 'box' ? RAPIER.ColliderDesc.cuboid(o.hw, hh, o.hd) : RAPIER.ColliderDesc.cylinder(hh, o.r);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.rot);
    desc.setTranslation(o.x, o.y0 + hh, o.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setFriction(0.7).setCollisionGroups(GROUPS.ground);
    st.cols.push(world.createCollider(desc));
  }
  STATE.set(world, st);
}

function smash(b, st, o) {
  if (st.broken[o.i]) return;
  st.broken[o.i] = 1;
  b.world.removeCollider(st.cols[o.i], true);
  const y = o.ground + o.h * 0.5;
  b.emit('propbreak', o.x, y, o.z, o.i);
  b.emit('dust', o.x, o.ground, o.z, 3);
  b.sound('debris', { x: o.x, y, z: o.z }, 0.7, o.kind === 'ironfence' ? 1.4 : 1);
  // arrows that were stuck in it drop out
  for (let i = b.stuck.length - 1; i >= 0; i--) {
    const s = b.stuck[i];
    if (s.unit || s.held) continue;
    if (closest(o, s.pos.x, s.pos.z, _cp)[2] < 0.25 && s.pos.y > o.ground + 0.05) b.stuck.splice(i, 1);
  }
}

// segment (a -> b) against an obstacle: entry fraction t and world normal, or null
const _n = new THREE.Vector3();
function segHit(o, ax, ay, az, bx, by, bz, rad) {
  const hy = (o.top - o.y0) / 2, cy = o.y0 + hy;
  if (o.shape === 'cyl') {
    const dx = bx - ax, dz = bz - az, fx = ax - o.x, fz = az - o.z, R = o.r + rad;
    const A = dx * dx + dz * dz, B = 2 * (fx * dx + fz * dz), C = fx * fx + fz * fz - R * R;
    let t;
    if (C <= 0) t = 0;
    else {
      if (A < 1e-9) return null;
      const disc = B * B - 4 * A * C;
      if (disc < 0) return null;
      t = (-B - Math.sqrt(disc)) / (2 * A);
      if (t < 0 || t > 1) return null;
    }
    const y = ay + (by - ay) * t;
    if (y < o.y0 || y > o.top + rad) {
      // maybe it comes down through the top
      if (ay > o.top && by <= o.top) {
        const tt = (ay - o.top) / (ay - by);
        const x = ax + (bx - ax) * tt, z = az + (bz - az) * tt;
        if (Math.hypot(x - o.x, z - o.z) < R) return { t: tt, n: _n.set(0, 1, 0) };
      }
      return null;
    }
    const x = ax + dx * t, z = az + dz * t, m = Math.hypot(x - o.x, z - o.z) || 1;
    return { t, n: _n.set((x - o.x) / m, 0, (z - o.z) / m) };
  }
  // oriented box: slab test in its local frame
  const lp = (x, z) => [(x - o.x) * o.cs - (z - o.z) * o.sn, (x - o.x) * o.sn + (z - o.z) * o.cs];
  const [lax, laz] = lp(ax, az), [lbx, lbz] = lp(bx, bz);
  const A = [lax, ay - cy, laz], D = [lbx - lax, by - ay, lbz - laz], E = [o.hw + rad, hy + rad, o.hd + rad];
  let t0 = 0, t1 = 1, ax0 = -1, sgn = 1;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(D[k]) < 1e-9) { if (Math.abs(A[k]) > E[k]) return null; continue; }
    let ta = (-E[k] - A[k]) / D[k], tb = (E[k] - A[k]) / D[k], s = -1;
    if (ta > tb) { const q = ta; ta = tb; tb = q; s = 1; }
    if (ta > t0) { t0 = ta; ax0 = k; sgn = s; }
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  if (ax0 < 0) { // started inside: push out along the travel
    _n.set(-(bx - ax), -(by - ay), -(bz - az)).normalize();
    return { t: 0, n: _n };
  }
  const ln = [0, 0, 0]; ln[ax0] = sgn;
  // local -> world (rotation about y by rot)
  _n.set(ln[0] * o.cs + ln[2] * o.sn, ln[1], -ln[0] * o.sn + ln[2] * o.cs);
  return { t: t0, n: _n };
}

function stepFeatures(b, dt) {
  const T = b.terrain, F = T.feat;
  if (!F) return;
  const st = STATE.get(b.world);
  if (st) {
    st.splash = Math.max(0, st.splash - dt * 30);
    if (!st.patched) {
      // blasts smash nearby crates and fences
      st.patched = true;
      const orig = b.explode.bind(b);
      b.explode = (pos, r, ...rest) => {
        const out = orig(pos, r, ...rest);
        for (const o of F.obs) if (o.breakable && !st.broken[o.i] && Math.hypot(pos.x - o.x, pos.z - o.z) < r + o.R + 0.3 && pos.y < o.top + r) smash(b, st, o);
        return out;
      };
    }
  }
  // projectiles stop at obstacles
  if (F.obs.length && PROJ) {
    const list = b.projectiles;
    for (let i = list.length - 1; i >= 0; i--) {
      const pr = list[i], P = PROJ[pr.type];
      if (!P) continue;
      const a = pr.prev, e = pr.pos, segL = a.distanceTo(e);
      let best = null, bo = null;
      for (const o of F.obs) {
        if (st && st.broken[o.i]) continue;
        if (Math.abs(e.x - o.x) > o.R + segL + 1 || Math.abs(e.z - o.z) > o.R + segL + 1) continue;
        if (Math.min(a.y, e.y) > o.top + 0.5) continue;
        const h = segHit(o, a.x, a.y, a.z, e.x, e.y, e.z, Math.min(P.r, 0.3) * 0.5);
        if (h && (!best || h.t < best.t)) { best = { t: h.t, n: h.n.clone() }; bo = o; }
      }
      if (!best) continue;
      const hit = new THREE.Vector3().lerpVectors(a, e, best.t);
      const heavy = P.roll || P.explode || P.r >= 0.2;
      if (bo.breakable && heavy && st) smash(b, st, bo);
      let dead = false;
      if (P.explode && !P.fuse) {
        pr.pos.copy(hit).addScaledVector(best.n, 0.1);
        b.explode(pr.pos, pr.blast, pr.damage, pr.force, pr.owner, P.explode);
        dead = true;
      } else if (P.stick) {
        if (bo.breakable && st && !st.broken[bo.i] && pr.vel.length() > 30) { smash(b, st, bo); continue; }
        const tip = pr.vel.clone().normalize();
        hit.addScaledVector(tip, P.len * 0.2);
        if (!(st && st.broken[bo.i])) {
          b.stuck.push({ type: pr.type, unit: null, part: -1, pos: hit.clone(), quat: pr.quat.clone(), t: 600, id: pr.id });
          b.emit('dust', hit.x, hit.y, hit.z, 1);
          b.sound('thud', hit, 0.35, 1.3);
          dead = true;
        }
      } else if (P.ground) {
        pr.pos.copy(hit).addScaledVector(best.n, 0.05);
        dead = !!P.ground(b, pr);
        if (!dead) bounce(pr, best.n, P);
      } else {
        pr.pos.copy(hit).addScaledVector(best.n, (P.r || 0.1) * 0.6);
        bounce(pr, best.n, P);
        if (P.fuse && pr.fuse < 0) pr.fuse = P.fuse;
      }
      if (dead) list.splice(i, 1);
    }
  }
  // flying bodies and stomping giants smash breakables
  if (st && F.obs.length) {
    for (const o of F.obs) {
      if (!o.breakable || st.broken[o.i]) continue;
      b.grid.query(o.x, o.z, o.R + 1.5, (u) => {
        if (st.broken[o.i]) return;
        const v = u.rag.vel[0], spd = Math.hypot(v.x, v.y, v.z);
        const big = u.s > 1.6;
        if (spd < (big ? 0.8 : 5)) return;
        const p = u.pos;
        if (p.y - u.skel.standHeight > o.top + 0.3) return;
        if (closest(o, p.x, p.z, _cp)[2] < u.skel.radius + (big ? 0.5 : 0.35)) smash(b, st, o);
      });
    }
  }
  // splashes where projectiles hit the water
  if (F.anyWater && st) {
    for (const pr of b.projectiles) {
      if (pr._wet || pr.vel.y > 0) continue;
      const dep = T.waterDepth(pr.pos.x, pr.pos.z);
      if (dep > 0.05 && pr.pos.y < T.height(pr.pos.x, pr.pos.z) + dep) {
        pr._wet = true;
        if (st.splash < 40) { st.splash += 3; splash(b, pr.pos.x, T.height(pr.pos.x, pr.pos.z) + dep, pr.pos.z, 1.1); }
      }
    }
  }
}

function bounce(pr, n, P) {
  const vn = pr.vel.dot(n);
  if (vn < 0) pr.vel.addScaledVector(n, -vn * (P.roll ? 1.3 : 1.5));
  pr.vel.multiplyScalar(P.roll ? 0.7 : 0.5);
}

EXT.battleStep.push(stepFeatures);
