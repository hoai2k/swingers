// Battleground: Shibuya Crossing (the Jujutsu Kaisen faction's map): the scramble
// crossing on Halloween night. Dark asphalt with bold zebra stripes (a big X and a
// crossing along each side), abandoned cars and taxis left at angles, traffic-light
// poles and lamp posts, a subway entrance in the middle, road barriers, crowd fences
// and pumpkins. Outside the field: sidewalks, street lights, tall buildings with lit
// windows, neon signs and big screens, the elevated railway with a stopped train, a
// moon, and the curtain: a dark, shimmering dome over the whole district.
//
// Map format: src/maps-new.js; obstacle / scenery hooks: src/ext.js, src/mapscene.js.
import { THREE } from '../util.js';
import { MAPS, MAP_H } from '../world.js';
import { register } from '../ext.js';

const { merged, T } = MAP_H;
const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const CYL = (rt, rb, h, n = 10) => new THREE.CylinderGeometry(rt, rb, h, n);
const shade = (c, k) => new THREE.Color(c).multiplyScalar(k);
const hash1 = (n) => { const s = Math.sin(n * 91.345 + 47.853) * 43758.5453; return s - Math.floor(s); };

// building lines: fronts at z = +-BZ (long sides) and x = +-BX (ends); roads leave the
// crossing at |x| < ROAD (north / south) and |z| < ROAD (east / west)
const BZ = 44, BX = 54, ROAD = 10;
const CAR_COLS = ['#c8ccd4', '#2a2c34', '#a8252c', '#3a5a8a', '#e8e8ea', '#5a6a4a'];
const POLE = '#5c606a';
const SUBWAY_CANOPY = 2.9;

// ------------------------------------------------------------------ obstacles
const OBSTACLES = {
  // an abandoned car or taxi (sub: 'taxi' | 'taxi2' | colour index); front is local +x
  shb_car(o, map, H, box, p, dn) {
    const L = o.hw * 2, W = o.hd * 2, h = o.h;
    const taxi = o.sub === 'taxi' || o.sub === 'taxi2';
    const col = o.sub === 'taxi' ? '#f2b632' : o.sub === 'taxi2' ? '#1f2a4a' : CAR_COLS[o.sub % CAR_COLS.length];
    box(L * 0.9, 0.3 + dn, W * 0.86, '#141418', 0, (0.3 - dn) / 2, 0);
    box(L, 0.62, W, col, 0, 0.62, 0); // body
    box(L * 0.18, 0.12, W * 0.96, shade(col, 0.85), L * 0.43, 0.9, 0, 0, 0, -0.25); // bonnet slope
    box(L * 0.52, 0.5, W * 0.9, col, -L * 0.06, 1.18, 0); // cabin
    box(L * 0.5, 0.34, W * 0.92, '#1a2030', -L * 0.06, 1.18, 0); // windows band
    box(0.06, 0.34, W * 0.78, '#1a2030', L * 0.2 + 0.01, 1.16, 0, 0, 0, 0.5); // windscreen
    box(L * 1.01, 0.12, W * 1.02, '#3a3a40', 0, 0.36, 0); // bumper line
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      p.push([CYL(0.33, 0.33, 0.24, 12), '#111114', T(sx * L * 0.3, 0.33, sz * (W / 2 - 0.08), 1, 1, 1, Math.PI / 2, 0, 0)]);
      p.push([CYL(0.17, 0.17, 0.26, 8), '#9a9ca4', T(sx * L * 0.3, 0.33, sz * (W / 2 - 0.08), 1, 1, 1, Math.PI / 2, 0, 0)]);
    }
    if (taxi) {
      box(0.5, 0.22, 0.16, '#f4f0e0', -L * 0.05, h + 0.02, 0); // roof sign (lit by the scenery)
      box(L * 0.98, 0.1, W * 1.01, o.sub === 'taxi' ? '#202020' : '#e8e8e8', 0, 0.7, 0); // side stripe
    }
    if (hash1(o.seed * 3) < 0.5) box(1.0, 0.55, 0.06, col, L * 0.06 + 0.3, 0.7, W / 2 + 0.35, 0, -0.75, 0); // a door left open
  },
  // a delivery van
  shb_van(o, map, H, box, p, dn) {
    const L = o.hw * 2, W = o.hd * 2, h = o.h;
    box(L * 0.92, 0.3 + dn, W * 0.86, '#141418', 0, (0.3 - dn) / 2, 0);
    box(L, h - 0.35, W, '#e6e6e2', 0, 0.3 + (h - 0.35) / 2, 0);
    box(0.06, 0.6, W * 0.84, '#1a2030', L / 2 + 0.01, h - 0.6, 0);
    box(0.4, 0.42, W * 1.01, '#1a2030', L / 2 - 0.5, h - 0.6, 0);
    box(L * 0.6, 0.5, 0.04, '#2f8a4a', -L * 0.12, h * 0.55, W / 2 + 0.02);
    box(L * 0.6, 0.5, 0.04, '#2f8a4a', -L * 0.12, h * 0.55, -W / 2 - 0.02);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push([CYL(0.36, 0.36, 0.26, 12), '#111114', T(sx * L * 0.32, 0.36, sz * (W / 2 - 0.1), 1, 1, 1, Math.PI / 2, 0, 0)]);
  },
  // the subway entrance: glass sides, a canopy, stairs going down at both ends
  shb_subway(o, map, H, box, p, dn) {
    // the solid part is the low wall round the stairwell (o.h); the canopy stands on
    // thin posts above head height, so shots and shells fly under it
    const L = o.hw * 2, W = o.hd * 2, h = o.h, ch = SUBWAY_CANOPY;
    box(L + 0.3, 0.2 + dn, W + 0.3, '#6a6870', 0, (0.2 - dn) / 2, 0);
    box(L - 0.3, 0.04, W - 0.4, '#07070a', 0, 0.21, 0); // the stairwell
    for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) box(0.32, 0.06, W - 0.5, '#3a3a42', sx * (L / 2 - 0.4 - i * 0.34), 0.2 - i * 0.002, 0);
    for (const sz of [-1, 1]) {
      box(L - 0.2, h - 0.2, 0.14, '#4a4e58', 0, 0.1 + (h - 0.2) / 2, sz * (W / 2 - 0.07)); // low wall
      box(L - 0.1, 0.1, 0.24, '#8a8e98', 0, h, sz * (W / 2 - 0.07)); // its coping
      box(L - 0.2, 0.9, 0.04, '#a8cce4', 0, h + 0.5, sz * (W / 2 - 0.07)); // a glass rail
    }
    for (const sx of [-1, 1]) {
      box(0.14, h - 0.2, W - 0.3, '#4a4e58', sx * (L / 2 - 0.07), 0.1 + (h - 0.2) / 2, 0, 0, 0, 0);
      for (const sz of [-1, 1]) box(0.12, ch - 0.2, 0.12, '#30343c', sx * (L / 2 - 0.1), (ch - 0.2) / 2 + 0.2, sz * (W / 2 - 0.1));
    }
    box(L + 0.6, 0.2, W + 0.6, '#4a7a5a', 0, ch, 0); // canopy
    box(L + 0.64, 0.08, W + 0.64, '#c8ccd4', 0, ch - 0.12, 0);
    box(1.6, 0.7, 0.3, '#20242c', 0, ch + 0.45, 0); // the sign box (lit by the scenery)
  },
  // a traffic-light pole: an arm reaching over the road toward the middle
  shb_signal(o, map, H, box, p, dn) {
    const h = o.h, a = Math.atan2(-o.z, -o.x); // toward the centre (local = world axes: rot 0)
    const ux = Math.cos(a), uz = Math.sin(a), ry = -a;
    p.push([CYL(0.12, 0.15, h + dn, 8), POLE, T(0, (h - dn) / 2, 0)]);
    p.push([CYL(0.24, 0.3, 0.3, 8), '#3a3e46', T(0, 0.15, 0)]);
    p.push([BOX(3.6, 0.12, 0.12), POLE, T(ux * 1.8, h - 0.1, uz * 1.8, 1, 1, 1, 0, ry, 0)]);
    p.push([BOX(1.25, 0.42, 0.32), '#2a2c32', T(ux * 3.3, h - 0.42, uz * 3.3, 1, 1, 1, 0, ry + Math.PI / 2, 0)]); // vehicle signal
    p.push([BOX(0.34, 0.62, 0.3), '#2a2c32', T(ux * 0.3, 2.7, uz * 0.3, 1, 1, 1, 0, ry, 0)]); // pedestrian signal
    p.push([BOX(0.04, 0.5, 0.5), '#e8e8e8', T(-ux * 0.2, 3.6, -uz * 0.2, 1, 1, 1, 0, ry, 0)]); // a street-name plate
  },
  // a street lamp with a head reaching over the road
  shb_lamp(o, map, H, box, p, dn) {
    const h = o.h, a = Math.atan2(-o.z, -o.x), ux = Math.cos(a), uz = Math.sin(a);
    p.push([CYL(0.1, 0.14, h + dn, 8), POLE, T(0, (h - dn) / 2, 0)]);
    p.push([BOX(1.6, 0.1, 0.1), POLE, T(ux * 0.8, h - 0.05, uz * 0.8, 1, 1, 1, 0, -a, 0)]);
    p.push([BOX(0.9, 0.18, 0.4), '#3a3e46', T(ux * 1.5, h - 0.15, uz * 1.5, 1, 1, 1, 0, -a, 0)]);
    p.push([CYL(0.2, 0.26, 0.4, 8), '#3a3e46', T(0, 0.2, 0)]);
    if (hash1(o.seed) < 0.6) p.push([BOX(0.05, 1.4, 0.5), '#ff8a1a', T(ux * 0.13, h * 0.55, uz * 0.13, 1, 1, 1, 0, -a, 0)]); // a Halloween banner
  },
  // an A-frame road barrier, red and white
  shb_barrier(o, map, H, box, p, dn) {
    const L = o.hw * 2, h = o.h;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.08, h + 0.05, 0.08, '#d8d8d8', sx * (L / 2 - 0.12), h / 2, sz * 0.18, sz * 0.2, 0, 0);
    const n = 6;
    for (let i = 0; i < n; i++) for (const y of [h * 0.55, h * 0.85]) box(L / n, 0.24, 0.06, i % 2 ? '#e8e8e8' : '#d8262a', -L / 2 + (i + 0.5) * (L / n), y, 0);
    box(0.25, 0.25, 0.06, '#ffb030', 0, h + 0.15, 0);
  },
};

// ------------------------------------------------------------------ the map
const SHIBUYA = {
  id: 'shibuya', name: 'Shibuya Crossing',
  ground: ['#2d2d35', '#34343c', '#27272e'], patch: '#303038', dirt: '#2a2a31', high: '#2d2d35', far: '#2a2830', rock: '#3a3a44',
  sky: ['#0e0a2c', '#3a2a72'], fog: '#211a46', fogNear: 130, fogFar: 560, sun: '#b4bcff', sunI: 1.9, hemiGround: '#2a2040', hemiI: 1.25,
  hills: 0, bumps: 0, trees: ['pine'], grass: '#3a3a44', grassTip: '#4a4a54', tufts: 0,
  flowers: null, bushes: '#2a3a30', props: 'shibuya', mountains: '#211a46',
  stone: '#8a8c96', wood: '#6a5040',
  layout(L) {
    // asphalt shading: worn lanes and patches
    L.paint(0, 0, 44, 2.4, '#323239', { soft: 3, noise: 0.5 }, true);
    for (let i = 0; i < 8; i++) L.paint(-8 - hash1(i) * 30, (hash1(i * 3.7) - 0.5) * 56, 2 + hash1(i * 5) * 3, 1.5 + hash1(i * 9) * 2, '#25252b', { soft: 1.5, noise: 0.4, rot: hash1(i * 2) * 3 });
    L.box('shb_subway', 0, 0, 2.6, 1.5, 1.2, 0, {}, true); // low walls; canopy above
    // abandoned cars and taxis
    L.box('shb_car', -12, 9, 2.1, 0.92, 1.45, 0.45, { sub: 'taxi' });
    L.box('shb_car', -21, -14, 2.1, 0.92, 1.45, -0.35, { sub: 2 });
    L.box('shb_car', -8.5, -22, 2.1, 0.92, 1.45, 1.25, { sub: 4 });
    L.box('shb_car', -28, 19, 2.1, 0.92, 1.45, 2.7, { sub: 'taxi2' });
    L.box('shb_car', -3.5, 27.5, 2.1, 0.92, 1.45, 0.12, { sub: 1 });
    L.box('shb_van', -34, -6, 2.5, 1.05, 2.15, 1.6);
    // traffic lights at the corners, lamp posts along the edges
    L.cyl('shb_signal', -40, 30.5, 0.3, 5.6);
    L.cyl('shb_signal', -40, -30.5, 0.3, 5.6);
    L.cyl('shb_signal', -14, 31, 0.3, 5.6);
    L.cyl('shb_lamp', -26, -31, 0.25, 7);
    L.cyl('shb_lamp', -2.5, -31, 0.25, 7);
    // road barriers, crowd fences (breakable) and Halloween pumpkins
    L.box('shb_barrier', -17, 3, 1.0, 0.3, 0.95, 1.4);
    L.box('shb_barrier', -25, -24, 1.0, 0.3, 0.95, 0.3);
    L.box('shb_barrier', -37, 13, 1.0, 0.3, 0.95, 0.1);
    L.fence(-21, 26, -14, 27.5, 'ironfence');
    L.fence(-30, -12, -30, -19, 'ironfence');
    L.cyl('pumpkin', -6, 6, 0.45, 0.6);
    L.cyl('pumpkin', -24, -4, 0.42, 0.55);
    L.cyl('pumpkin', -15, 18, 0.45, 0.6);
    L.cyl('pumpkin', -36, 26, 0.4, 0.55);
  },
};
MAPS.push(SHIBUYA);

// ------------------------------------------------------------------ geometry helpers
// textured / coloured triangle soup: position + uv + colour, for MeshBasic materials
class Acc {
  constructor() { this.pos = []; this.uv = []; this.col = []; }
  // quad a-b-c-d (counter-clockwise seen from its front), uv rect [u0, v0, u1, v1]
  quad(a, b, c, d, r, col = '#ffffff') {
    const cc = new THREE.Color(col);
    const P = [a, b, c, a, c, d], U = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[1]], [r[2], r[3]], [r[0], r[3]]];
    for (let i = 0; i < 6; i++) { this.pos.push(...P[i]); this.uv.push(...U[i]); this.col.push(cc.r, cc.g, cc.b); }
  }
  // a vertical rectangle on the plane with outward normal (nx, nz) at the given centre
  wallQuad(cx, cy, cz, nx, nz, w, h, r, col, off = 0.04) {
    const rx = nz, rz = -nx; // right, seen from the front
    const x = cx + nx * off, z = cz + nz * off;
    this.quad([x - rx * w / 2, cy - h / 2, z - rz * w / 2], [x + rx * w / 2, cy - h / 2, z + rz * w / 2], [x + rx * w / 2, cy + h / 2, z + rz * w / 2], [x - rx * w / 2, cy + h / 2, z - rz * w / 2], r, col);
  }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
  get empty() { return !this.pos.length; }
}

// flat quad from four (x, z) corners at height y, facing up
function flat(parts, pts, y, col) {
  const g = new THREE.BufferGeometry();
  const ax = pts[1][0] - pts[0][0], az = pts[1][1] - pts[0][1], bx = pts[2][0] - pts[0][0], bz = pts[2][1] - pts[0][1];
  const q = ax * bz - az * bx > 0 ? [pts[0], pts[2], pts[1], pts[0], pts[3], pts[2]] : [pts[0], pts[1], pts[2], pts[0], pts[2], pts[3]];
  g.setAttribute('position', new THREE.Float32BufferAttribute(q.flatMap(([x, z]) => [x, y, z]), 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(q.flatMap(() => [0, 1, 0]), 3));
  parts.push([g, col]);
}
// a band from (x0,z0) to (x1,z1), w wide, of zebra bars `bar` wide every `per`
function zebra(parts, x0, z0, x1, z1, w, bar = 0.95, per = 1.9) {
  const L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L, vx = -uz, vz = ux;
  const P = (u, v) => [x0 + ux * u + vx * v, z0 + uz * u + vz * v];
  for (let u = (L % per) / 2; u + bar <= L; u += per) flat(parts, [P(u, -w / 2), P(u + bar, -w / 2), P(u + bar, w / 2), P(u, w / 2)], 0.02, '#e9e9ec');
}
function rect(parts, x, z, w, d, rot, col, y = 0.02) {
  const c = Math.cos(rot), s = Math.sin(rot), P = (u, v) => [x + u * c + v * s, z - u * s + v * c];
  flat(parts, [P(-w / 2, -d / 2), P(w / 2, -d / 2), P(w / 2, d / 2), P(-w / 2, d / 2)], y, col);
}

// ------------------------------------------------------------------ textures (cached)
let TEX = null;
function textures() {
  if (TEX) return TEX;
  const mk = (w, h, draw) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  // windows: 8 columns x 8 floors, some lit (warm, cool, dim), dark frames
  const win = mk(256, 256, (x, w) => {
    x.fillStyle = '#121019'; x.fillRect(0, 0, w, w);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      const r = hash1(i * 17.3 + j * 5.1);
      x.fillStyle = r < 0.16 ? '#f4c27a' : r < 0.24 ? '#a8ccf0' : r < 0.28 ? '#e88ac0' : r < 0.36 ? '#4a3e3a' : r < 0.7 ? '#221f30' : '#1a1826';
      x.fillRect(i * 32 + 4, j * 32 + 6, 24, 20);
      if (r < 0.28) { x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(i * 32 + 15, j * 32 + 6, 2, 20); }
    }
  });
  win.wrapS = win.wrapT = THREE.RepeatWrapping;
  // the screens and signs atlas (1024 x 1024), regions in REG
  const atlas = mk(1024, 1024, (x) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, 1024, 1024);
    const text = (s, cx, cy, size, fill, stroke, font = 'bold') => {
      x.font = `${font} ${size}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      if (stroke) { x.lineWidth = size * 0.12; x.strokeStyle = stroke; x.strokeText(s, cx, cy); }
      x.fillStyle = fill; x.fillText(s, cx, cy);
    };
    // S1: Halloween
    let g = x.createLinearGradient(0, 0, 0, 288); g.addColorStop(0, '#3a1260'); g.addColorStop(1, '#ff7a1a');
    x.fillStyle = g; x.fillRect(0, 0, 512, 288);
    x.fillStyle = '#ffe8a0'; x.beginPath(); x.arc(420, 70, 46, 0, 7); x.fill();
    for (const [px, py, r] of [[90, 210, 52], [190, 228, 36], [430, 225, 44]]) {
      x.fillStyle = '#ff8a1a'; x.beginPath(); x.ellipse(px, py, r * 1.15, r, 0, 0, 7); x.fill();
      x.fillStyle = '#2a1000';
      for (const sx of [-1, 1]) { x.beginPath(); x.moveTo(px + sx * r * 0.45, py - r * 0.35); x.lineTo(px + sx * r * 0.2, py - r * 0.05); x.lineTo(px + sx * r * 0.65, py - r * 0.05); x.fill(); }
      x.fillRect(px - r * 0.5, py + r * 0.25, r, r * 0.18);
      x.fillStyle = '#3f6a2a'; x.fillRect(px - 4, py - r - 10, 8, 14);
    }
    text('HALLOWEEN', 256, 92, 68, '#ffffff', '#c0207a');
    text('10.31  SHIBUYA', 256, 150, 30, '#ffe060');
    // S2: cursed energy
    x.fillStyle = '#06020c'; x.fillRect(512, 0, 512, 288);
    g = x.createRadialGradient(768, 120, 10, 768, 120, 220); g.addColorStop(0, '#b05aff'); g.addColorStop(0.4, '#4a1a8a'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(512, 0, 512, 288);
    x.fillStyle = '#f4e8ff'; x.beginPath(); x.ellipse(768, 110, 90, 40, 0, 0, 7); x.fill();
    x.fillStyle = '#5a1aa0'; x.beginPath(); x.arc(768, 110, 34, 0, 7); x.fill();
    x.fillStyle = '#0a0010'; x.beginPath(); x.arc(768, 110, 14, 0, 7); x.fill();
    text('CURSED ENERGY', 768, 205, 44, '#e8c8ff', '#3a0a6a');
    text('DOMAIN EXPANSION', 768, 252, 26, '#b080ff');
    // S3: SHIBUYA pop
    for (let i = -6; i < 14; i++) { x.fillStyle = i % 2 ? '#20d0e0' : '#ff4ab0'; x.beginPath(); x.moveTo(i * 48, 288); x.lineTo(i * 48 + 48, 288); x.lineTo(i * 48 + 48 + 160, 576); x.lineTo(i * 48 + 160, 576); x.fill(); }
    text('SHIBUYA', 256, 410, 96, '#ffffff', '#1a1a40');
    text('SCRAMBLE', 256, 492, 40, '#fff27a', '#1a1a40');
    // S4: ramen
    x.fillStyle = '#b8161e'; x.fillRect(512, 288, 512, 288);
    x.fillStyle = '#fff2d8'; x.beginPath(); x.arc(660, 470, 90, 0, Math.PI); x.fill();
    x.strokeStyle = '#f2d060'; x.lineWidth = 6;
    for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(590 + i * 30, 470); x.bezierCurveTo(600 + i * 30, 400, 640 + i * 20, 380, 700, 340); x.stroke(); }
    text('RAMEN', 850, 420, 72, '#ffe060', '#5a0000');
    text('OPEN 24H', 850, 500, 34, '#ffffff');
    // vertical signs (128 x 352 each) on the row at y = 576
    const V = [['KARAOKE', '#ff3a9a'], ['RAMEN', '#ffb020'], ['HOTEL', '#3ad0ff'], ['SUSHI', '#ff5a3a'], ['BAR', '#9a5aff'], ['109', '#ff3a5a'], ['GAME', '#3aff8a'], ['CAFE', '#ffe060']];
    V.forEach(([s, c], i) => {
      const x0 = i * 128, y0 = 576;
      x.fillStyle = '#100c18'; x.fillRect(x0, y0, 128, 352);
      x.strokeStyle = c; x.lineWidth = 8; x.strokeRect(x0 + 8, y0 + 8, 112, 336);
      const n = s.length, step = Math.min(64, 320 / n);
      for (let k = 0; k < n; k++) text(s[k], x0 + 64, y0 + 176 + (k - (n - 1) / 2) * step, Math.min(78, step * 1.05), '#ffffff', c);
    });
    // horizontal signs (512 x 96) on the bottom row
    [['SHIBUYA STATION', '#3ab04a'], ['HACHIKO EXIT', '#3a8aff']].forEach(([s, c], i) => {
      x.fillStyle = c; x.fillRect(i * 512, 928, 512, 96);
      x.fillStyle = '#ffffff'; x.fillRect(i * 512 + 6, 934, 500, 84);
      text(s, i * 512 + 256, 976, 50, c);
    });
  });
  // ticker: a strip of text that scrolls (its own texture so only it moves)
  const ticker = mk(1024, 64, (x) => {
    x.fillStyle = '#0a0612'; x.fillRect(0, 0, 1024, 64);
    x.font = 'bold 44px sans-serif'; x.textBaseline = 'middle'; x.fillStyle = '#ffb030';
    x.fillText('★ HAPPY HALLOWEEN ★ SHIBUYA 10.31 ★ CURTAIN WARNING ★ STAY INDOORS ★', 6, 34);
  });
  ticker.wrapS = THREE.RepeatWrapping;
  TEX = { win, atlas, ticker };
  return TEX;
}
// atlas regions in pixels -> uv rect [u0, v0, u1, v1]
const px = (x, y, w, h) => [x / 1024, 1 - (y + h) / 1024, (x + w) / 1024, 1 - y / 1024];
const REG = {
  halloween: px(0, 0, 512, 288), cursed: px(512, 0, 512, 288), shibuya: px(0, 288, 512, 288), ramen: px(512, 288, 512, 288),
  v: (i) => px(i * 128 + 2, 578, 124, 348), h: (i) => px(i * 512, 928, 512, 96),
};

// The generic nature pass (trees, rocks, pebbles, bushes, tufts, the mountain ring)
// runs before a map's set dressing; a city has none of it. Everything instanced in
// the group at this point belongs to that pass (the curtain hides the clouds too).
function stripNature(group) {
  for (const o of [...group.children]) {
    const mountains = o.isMesh && !o.isInstancedMesh && o.frustumCulled === false && !o.material.isShaderMaterial;
    if (o.isInstancedMesh || mountains) { group.remove(o); o.geometry.dispose(); }
  }
}

// ------------------------------------------------------------------ set dressing
function scenery(group, map, terrain, H, kit) {
  stripNature(group);
  const tex = textures();
  const lam = (o = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, ...o });
  const litMat = lam({ flatShading: true });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const winMat = new THREE.MeshBasicMaterial({ vertexColors: true, map: tex.win });
  const scrMat = new THREE.MeshBasicMaterial({ vertexColors: true, map: tex.atlas });
  const tickMat = new THREE.MeshBasicMaterial({ vertexColors: true, map: tex.ticker });
  const decalMat = lam({ emissive: '#3a3a42', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

  // night-time fill: violet from above, warm street glow from below
  group.add(new THREE.HemisphereLight('#8a84ff', '#5a3a50', 0.95));

  // pieces are grouped by region (N / S / E / W / corners / the street) so the ones
  // between the camera and the crossing can hide (see the scene hook at the end)
  const regs = {};
  const R = (x, z) => {
    const k = (z > BZ - 4 ? 'N' : z < -BZ + 4 ? 'S' : '') + (x > BX - 4 ? 'E' : x < -BX + 4 ? 'W' : '');
    return (regs[k] ||= { lit: [], glow: [], win: new Acc(), scr: new Acc(), tick: new Acc() });
  };
  const street = R(0, 0);

  // ---- road markings: the zebra X, a crossing along each side, lane lines beyond
  const dec = [];
  zebra(dec, -27, -19, 27, 19, 5.5);
  zebra(dec, -27, 19, 27, -19, 5.5);
  for (const s of [-1, 1]) {
    zebra(dec, -32, s * 28.5, 32, s * 28.5, 5);
    zebra(dec, s * 38, -21, s * 38, 21, 5);
    // the roads leaving the crossing: crossings at the mouths, dashed centre lines
    zebra(dec, -ROAD + 1, s * (BZ - 5.5), ROAD - 1, s * (BZ - 5.5), 4);
    zebra(dec, s * (BX - 5.5), -ROAD + 1, s * (BX - 5.5), ROAD - 1, 4);
    for (let d = BZ + 1; d < 118; d += 6) rect(dec, 0, s * d, 0.25, 3, 0, '#e9e9ec');
    for (let d = BX + 1; d < 118; d += 6) rect(dec, s * d, 0, 3, 0.25, 0, '#e9e9ec');
    for (const o of [-ROAD + 0.6, ROAD - 0.6]) { rect(dec, o, s * 80, 0.18, 70, 0, '#e8c040'); rect(dec, s * 86, o, 64, 0.18, 0, '#e8c040'); }
    // stop lines
    rect(dec, s * 3.5, s * (BZ - 9), 6, 0.45, 0, '#e9e9ec');
    rect(dec, s * (BX - 9), -s * 3.5, 0.45, 6, 0, '#e9e9ec');
  }
  const dm = new THREE.Mesh(merged(dec), decalMat); dm.receiveShadow = true; dm.renderOrder = 1;
  group.add(dm);

  // ---- sidewalks (raised a little) with kerbs, in each corner of the crossing
  const side = street.lit;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const slab = (x0, x1, z0, z1) => {
      side.push([BOX(x1 - x0, 0.16, z1 - z0), '#55535e', T(sx * (x0 + x1) / 2, 0.08, sz * (z0 + z1) / 2)]);
      for (let x = x0 + 2; x < x1; x += 2.5) side.push([BOX(0.05, 0.02, z1 - z0), '#4a4852', T(sx * x, 0.165, sz * (z0 + z1) / 2)]);
    };
    slab(ROAD, BX + 30, BZ - 8, BZ + 30); // along the long side (and under the corner)
    slab(BX - 8, BX + 30, ROAD, BZ - 8); // along the end
    side.push([BOX(BX + 30 - ROAD, 0.2, 0.3), '#8a8892', T(sx * (BX + 30 + ROAD) / 2, 0.1, sz * (BZ - 8))]); // kerbs
    side.push([BOX(0.3, 0.2, BZ - 8 - ROAD), '#8a8892', T(sx * (BX - 8), 0.1, sz * (BZ - 8 + ROAD) / 2)]);
  }
  // street lamps and guard rails along the kerbs
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const lamp = (x, z, ax, az) => {
      const r = R(x, z);
      r.lit.push([CYL(0.1, 0.13, 7, 6), POLE, T(x, 3.5, z)]);
      r.lit.push([BOX(1.4, 0.09, 0.09), POLE, T(x + ax * 0.7, 6.95, z + az * 0.7, 1, 1, 1, 0, Math.atan2(-az, ax), 0)]);
      r.glow.push([BOX(0.7, 0.12, 0.35), '#ffe2a8', T(x + ax * 1.3, 6.85, z + az * 1.3, 1, 1, 1, 0, Math.atan2(-az, ax), 0)]);
    };
    for (let x = ROAD + 4; x < BX + 26; x += 12) lamp(sx * x, sz * (BZ - 7.4), 0, -sz);
    for (let z = ROAD + 4; z < BZ - 9; z += 12) lamp(sx * (BX - 7.4), sz * z, -sx, 0);
    for (let x = ROAD + 2; x < BX - 9; x += 2.4) street.lit.push([BOX(0.08, 0.9, 0.08), '#c8ccd4', T(sx * x, 0.6, sz * (BZ - 7.8))]);
    street.lit.push([BOX(BX - 9 - ROAD - 2, 0.1, 0.08), '#c8ccd4', T(sx * (BX - 9 + ROAD + 2) / 2, 1.0, sz * (BZ - 7.8))]);
  }

  // ---- buildings
  let seed = 1;
  const rnd = () => hash1(seed++ * 1.618);
  const TINTS = ['#d8d4e4', '#e4d4c4', '#c4cce4', '#e0c8d8', '#ccdcd0'];
  const NEON = ['#ff3a9a', '#3ad0ff', '#ffb020', '#9a5aff', '#3aff8a', '#ff5a3a', '#fff060'];
  // an axis-aligned building x0..x1, z0..z1, h tall; front: outward normal of the face
  // looking at the crossing ([nx, nz]) or null for a back-row block
  function building(x0, x1, z0, z1, h, front) {
    const r = R((x0 + x1) / 2, (z0 + z1) / 2), A = r.win, tint = TINTS[Math.floor(rnd() * TINTS.length)];
    const u0 = Math.floor(rnd() * 8) / 8, faces = [
      [[x0, z1], [x1, z1], 0, 1], [[x1, z0], [x0, z0], 0, -1], [[x1, z1], [x1, z0], 1, 0], [[x0, z0], [x0, z1], -1, 0]];
    for (const [a, b, nx, nz] of faces) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), k = nx ? 0.8 : 1;
      A.quad([a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], h, b[1]], [a[0], h, a[1]], [u0, 0, u0 + len / 16, h / 28], shade(tint, k));
    }
    A.quad([x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0], [0.001, 0.001, 0.002, 0.002], '#ffffff'); // roof (a dark texel)
    // rooftop clutter
    r.lit.push([BOX(x1 - x0 + 0.3, 0.6, z1 - z0 + 0.3), '#2a2834', T((x0 + x1) / 2, h + 0.1, (z0 + z1) / 2)]);
    if (rnd() < 0.6) r.lit.push([CYL(1.2, 1.2, 2.2, 10), '#4a4856', T(x0 + 3, h + 1.5, z0 + 3)]);
    if (rnd() < 0.5) r.lit.push([BOX(3, 1.6, 2), '#3a3846', T(x1 - 3, h + 1, z1 - 3)]);
    if (h > 40) r.glow.push([BOX(0.4, 0.4, 0.4), '#ff2a2a', T((x0 + x1) / 2, h + 1.2, (z0 + z1) / 2)]); // aircraft light
    if (!front) return;
    // the street face: shopfronts, neon bands, vertical signs
    const [nx, nz] = front, w = nx ? z1 - z0 : x1 - x0;
    const fx = nx > 0 ? x1 : nx < 0 ? x0 : (x0 + x1) / 2, fz = nz > 0 ? z1 : nz < 0 ? z0 : (z0 + z1) / 2;
    const rx = nz, rz = -nx, at = (u, y, off) => T(fx + rx * u + nx * off, y, fz + rz * u + nz * off, 1, 1, 1, 0, Math.atan2(-rz, rx), 0);
    const shop = NEON[Math.floor(rnd() * NEON.length)];
    r.glow.push([BOX(w - 0.6, 3.0, 0.1), shade('#ffd8a0', 0.85), at(0, 2.0, 0.08)]);
    for (let u = -w / 2 + 2.5; u < w / 2 - 1; u += 3) r.lit.push([BOX(0.25, 3.1, 0.2), '#1a1822', at(u, 2.0, 0.12)]);
    r.lit.push([BOX(w, 0.9, 1.4), '#24222c', at(0, 4.0, 0.6)]); // awning
    r.glow.push([BOX(w - 0.2, 0.18, 0.1), shop, at(0, 3.6, 1.32)]);
    const bands = 1 + Math.floor(rnd() * 2);
    for (let i = 0; i < bands; i++) r.glow.push([BOX(w - 1, 0.25, 0.12), NEON[Math.floor(rnd() * NEON.length)], at(0, 7 + rnd() * (h - 12), 0.12)]);
    const ns = Math.min(3, Math.floor(w / 6));
    for (let i = 0; i < ns; i++) {
      const u = -w / 2 + (i + 0.5) * (w / ns) + (rnd() - 0.5) * 1.5, y = 6 + 6.5 + rnd() * Math.max(0, h - 22);
      r.lit.push([BOX(2.4, 9.2, 0.25), '#16121e', at(u, y, 0.2)]);
      r.scr.wallQuad(fx + rx * u, y, fz + rz * u, nx, nz, 2.2, 9, REG.v([0, 1, 2, 3, 4, 6, 7][Math.floor(rnd() * 7)]), '#ffffff', 0.36);
    }
  }
  // a row of buildings along a frontage from a to b (along x or z), front at f
  function row(a, b, f, axis, s, deep, hMin, hMax, front) {
    for (let u = a; u < b - 4;) {
      const w = Math.min(b - u, 9 + rnd() * 8), h = hMin + rnd() * (hMax - hMin), d = deep * (0.75 + rnd() * 0.4);
      const g = rnd() < 0.3 ? 1 : 0.4; // a small alley now and then
      if (axis === 'x') building(u, u + w - g, Math.min(f, f + s * d), Math.max(f, f + s * d), h, front && [0, -s]);
      else building(Math.min(f, f + s * d), Math.max(f, f + s * d), u, u + w - g, h, front && [-s, 0]);
      u += w;
    }
  }
  for (const s of [-1, 1]) {
    row(-BX - 6, -ROAD - 2, s * BZ, 'x', s, 20, 18, 46, true);
    row(ROAD + 2, BX + 6, s * BZ, 'x', s, 20, 18, 46, true);
    row(-BX - 4, -ROAD - 4, s * (BZ + 26), 'x', s, 30, 38, 80, false);
    row(ROAD + 4, BX + 4, s * (BZ + 26), 'x', s, 30, 38, 80, false);
    if (s > 0) { // the east end: shops; behind, towers
      row(ROAD + 2, BZ - 6, BX, 'z', 1, 18, 20, 44, true);
      row(-BZ + 6, -ROAD - 2, BX, 'z', 1, 18, 20, 44, true);
      row(ROAD + 4, BZ + 2, BX + 24, 'z', 1, 30, 40, 76, false);
      row(-BZ - 2, -ROAD - 4, BX + 24, 'z', 1, 30, 40, 76, false);
    }
    // corner blocks
    for (const sx of [-1, 1]) if (!(sx > 0 && s > 0)) building(sx > 0 ? BX + 8 : -BX - 30, sx > 0 ? BX + 30 : -BX - 8, s > 0 ? BZ + 8 : -BZ - 30, s > 0 ? BZ + 30 : -BZ - 8, 50 + rnd() * 25, null);
  }
  // the big screens facing the crossing (a QFRONT-style one on the north side)
  const screen = (x, y, z, nx, nz, w, h, reg) => {
    const r = R(x, z);
    r.lit.push([BOX(nx ? 0.6 : w + 0.8, h + 0.8, nx ? w + 0.8 : 0.6), '#121018', T(x + nx * 0.3, y, z + nz * 0.3)]);
    r.scr.wallQuad(x, y, z, nx, nz, w, h, reg, '#ffffff', 0.64);
  };
  screen(26, 21, BZ, 0, -1, 17, 9.5, REG.halloween);
  screen(-30, 17, -BZ, 0, 1, 13, 7.3, REG.cursed);
  screen(BX, 18, 26, -1, 0, 12, 6.8, REG.shibuya);
  screen(-34, 22, BZ, 0, -1, 11, 6.2, REG.ramen);
  screen(BX, 15, -27, -1, 0, 11, 6.2, REG.cursed);
  // scrolling tickers under two screens
  for (const [x, y, z, nx, nz, w] of [[26, 14.9, BZ, 0, -1, 17], [-30, 12.3, -BZ, 0, 1, 13]]) R(x, z).tick.wallQuad(x, y, z, nx, nz, w, 1.2, [0, 0, w / 22, 1], '#ffffff', 0.66);

  // the round "109"-style tower on the north-east corner
  {
    const r = R(70, 62), cx = BX + 16, cz = BZ + 16, rad = 11, h = 52;
    const cyl = new THREE.CylinderGeometry(rad, rad, h, 28, 1, true).toNonIndexed();
    const P = cyl.attributes.position, U = cyl.attributes.uv;
    for (let i = 0; i < P.count; i += 3) {
      const tri = [0, 1, 2].map((k) => [P.getX(i + k) + cx, P.getY(i + k) + h / 2, P.getZ(i + k) + cz]);
      const uv = [0, 1, 2].map((k) => [U.getX(i + k) * (2 * Math.PI * rad) / 16, U.getY(i + k) * h / 28]);
      for (let k = 0; k < 3; k++) { r.win.pos.push(...tri[k]); r.win.uv.push(...uv[k]); r.win.col.push(1, 0.92, 0.95); }
    }
    r.lit.push([CYL(rad + 0.4, rad + 0.4, 1.2, 28), '#2a2834', T(cx, h + 0.5, cz)]);
    r.lit.push([CYL(rad * 0.6, rad * 0.7, 6, 20), '#2a2834', T(cx, h + 4, cz)]);
    const a = Math.atan2(-cz, -cx), nx = Math.cos(a), nz = Math.sin(a);
    r.lit.push([BOX(3.4, 15, 0.4), '#16121e', T(cx + nx * (rad + 0.3), 30, cz + nz * (rad + 0.3), 1, 1, 1, 0, -a + Math.PI / 2, 0)]);
    r.scr.wallQuad(cx + nx * rad, 30, cz + nz * rad, nx, nz, 3.2, 14.6, REG.v(5), '#ffffff', 0.55);
    for (const y of [10, 20, 40]) r.glow.push([new THREE.TorusGeometry(rad + 0.15, 0.12, 4, 40), y === 40 ? '#ff3a5a' : '#ffd8a0', T(cx, y, cz, 1, 1, 1, Math.PI / 2, 0, 0)]);
    r.glow.push([BOX(rad * 1.6, 3, 0.1), '#ffd8a0', T(cx + nx * (rad + 0.05), 2, cz + nz * (rad + 0.05), 1, 1, 1, 0, -a + Math.PI / 2, 0)]);
  }

  // ---- the west end: the elevated railway with a stopped train, the station behind
  {
    const r = R(-70, 0), x = -BX - 8;
    r.lit.push([BOX(7, 1.4, 240), '#5a5862', T(x, 8, 0)]);
    for (const sx of [-1, 1]) r.lit.push([BOX(0.4, 1.2, 240), '#6a6872', T(x + sx * 3.3, 9.3, 0)]);
    for (let z = -112; z <= 112; z += 16) if (Math.abs(z) > ROAD + 2) r.lit.push([BOX(2, 7.4, 3.5), '#4a4852', T(x, 3.6, z)]);
    for (let i = 0; i < 6; i++) {
      const z = -48 + i * 19.5;
      r.lit.push([BOX(3, 3.3, 19), '#c8ccd2', T(x, 10.4, z)]);
      r.lit.push([BOX(3.04, 0.35, 19.02), '#3ab04a', T(x, 9.4, z)]);
      r.lit.push([BOX(2.6, 0.3, 18.6), '#9a9ea6', T(x, 12.15, z)]);
      r.glow.push([BOX(3.06, 0.9, 16.5), '#fff0c8', T(x, 10.9, z)]);
    }
    building(-BX - 50, -BX - 14, -BZ + 2, BZ - 2, 16, null); // the station
    r.lit.push([BOX(0.5, 3, 24), '#20242c', T(-BX - 13.6, 19, 0)]);
    r.scr.wallQuad(-BX - 13.6, 19, 0, 1, 0, 22, 2.8, REG.h(0), '#ffffff', 0.3);
    r.lit.push([BOX(0.5, 2.2, 14), '#20242c', T(-BX + 6.5, 3.2, -26)]);
    r.scr.wallQuad(-BX + 6.5, 3.2, -26, 1, 0, 13, 2, REG.h(1), '#ffffff', 0.3);
    // the plaza in front: a dog statue on a plinth, and a few planters
    const dog = [[BOX(1.6, 1.2, 1.6), '#6a6872', T(0, 0.6, 0)], [BOX(1.2, 0.55, 0.45), '#7a6a3a', T(0, 1.65, 0)], [BOX(0.4, 0.6, 0.4), '#7a6a3a', T(0.45, 2.05, 0)],
      [BOX(0.45, 0.32, 0.36), '#7a6a3a', T(0.75, 2.35, 0)], [BOX(0.12, 0.6, 0.12), '#7a6a3a', T(-0.45, 1.3, 0.15)], [BOX(0.12, 0.6, 0.12), '#7a6a3a', T(0.4, 1.3, -0.15)],
      [BOX(0.1, 0.2, 0.08), '#6a5a2a', T(0.62, 2.6, 0.12)], [BOX(0.1, 0.2, 0.08), '#6a5a2a', T(0.62, 2.6, -0.12)]];
    for (const [g, c, m] of dog) r.lit.push([g, c, T(-BX + 2, 0.16, -18, 1, 1, 1, 0, 0.6, 0).multiply(m)]);
  }

  // ---- obstacle lights: headlights, taxi signs, signals, lamp heads, the subway sign
  const ol = street.glow;
  for (const o of terrain.feat.obs) {
    const M = T(o.x, o.ground, o.z, 1, 1, 1, 0, o.rot, 0);
    const add = (g, c, m) => ol.push([g, c, M.clone().multiply(m)]);
    if (o.kind === 'shb_car' || o.kind === 'shb_van') {
      const L = o.hw * 2, W = o.hd * 2;
      for (const sz of [-1, 1]) {
        add(BOX(0.06, 0.16, 0.36), '#fff4d0', T(L / 2 + 0.01, 0.72, sz * (W / 2 - 0.3)));
        add(BOX(0.06, 0.14, 0.3), '#ff2a2a', T(-L / 2 - 0.01, 0.75, sz * (W / 2 - 0.25)));
        add(BOX(0.12, 0.1, 0.1), '#ff9a1a', T(L / 2 - 0.05, 0.66, sz * (W / 2 - 0.02)));
      }
      if (o.sub === 'taxi' || o.sub === 'taxi2') add(BOX(0.46, 0.18, 0.18), '#ffe060', T(-L * 0.05, o.h + 0.03, 0));
    } else if (o.kind === 'shb_signal') {
      const a = Math.atan2(-o.z, -o.x), ux = Math.cos(a), uz = Math.sin(a), ry = -a;
      const back = T(ux * 3.3, o.h - 0.42, uz * 3.3, 1, 1, 1, 0, ry + Math.PI / 2, 0);
      add(BOX(0.28, 0.28, 0.06), '#ff3a2a', back.clone().multiply(T(-0.38, 0, 0.17)));
      add(BOX(0.28, 0.28, 0.06), '#ff3a2a', back.clone().multiply(T(-0.38, 0, -0.17)));
      add(BOX(0.24, 0.24, 0.06), '#ff3a2a', T(ux * 0.3 + ux * 0.16, 2.85, uz * 0.3 + uz * 0.16, 1, 1, 1, 0, ry + Math.PI / 2, 0));
    } else if (o.kind === 'shb_lamp') {
      const a = Math.atan2(-o.z, -o.x), ux = Math.cos(a), uz = Math.sin(a);
      add(BOX(0.8, 0.06, 0.32), '#ffe8b0', T(ux * 1.5, o.h - 0.25, uz * 1.5, 1, 1, 1, 0, -a, 0));
    } else if (o.kind === 'shb_subway') {
      for (const sz of [-1, 1]) add(BOX(1.4, 0.5, 0.04), '#2a8aff', T(0, SUBWAY_CANOPY + 0.45, sz * 0.17));
      for (const sz of [-1, 1]) for (const dx of [-0.3, 0, 0.3]) add(BOX(0.1, dx ? 0.36 : 0.22, 0.02), '#ffffff', T(dx, SUBWAY_CANOPY + (dx ? 0.45 : 0.5), sz * 0.2));
      add(BOX(o.hw * 2 - 0.4, 0.06, o.hd * 2 - 0.4), '#d8ecff', T(0, SUBWAY_CANOPY - 0.17, 0));
    }
  }

  // ---- build each region's meshes
  const parts = {};
  for (const [k, r] of Object.entries(regs)) {
    const list = [];
    if (r.lit.length) list.push(new THREE.Mesh(merged(r.lit), litMat));
    if (r.glow.length) list.push(new THREE.Mesh(merged(r.glow), glowMat));
    if (!r.win.empty) list.push(new THREE.Mesh(r.win.geo(), winMat));
    if (!r.scr.empty) list.push(new THREE.Mesh(r.scr.geo(), scrMat));
    if (!r.tick.empty) list.push(new THREE.Mesh(r.tick.geo(), tickMat));
    for (const m of list) { m.receiveShadow = true; m.castShadow = k === '' && m.material === litMat; group.add(m); }
    parts[k] = list;
  }

  // ---- the moon and the curtain over the district
  const moon = new THREE.Mesh(new THREE.SphereGeometry(30, 24, 12), new THREE.MeshBasicMaterial({ color: '#f4ecd0', fog: false }));
  moon.position.set(-260, 330, -420); moon.renderOrder = -9;
  group.add(moon);
  const veil = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
    uniforms: { t: { value: 0 } },
    vertexShader: 'varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float t; varying vec3 vp;
      void main(){
        float h = clamp(vp.y, 0.0, 1.0), ang = atan(vp.z, vp.x);
        // thin wavering threads running down from the top, pulses flowing along them
        float m = abs(sin(ang * 34.0 + sin(h * 7.0 + t * 0.35) * 1.4));
        float threads = pow(1.0 - m, 12.0);
        float flow = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(h * 22.0 - t * 1.3 + ang * 2.0), 3.0);
        float rings = pow(abs(sin(h * 28.0 - t * 0.4)), 60.0);
        float sh = threads * flow + rings * 0.35;
        vec3 c = mix(vec3(0.015, 0.0, 0.04), vec3(0.6, 0.3, 1.0), clamp(sh * 0.9 + 0.05, 0.0, 1.0));
        float a = 0.3 + 0.28 * h + sh * 0.3;
        gl_FragColor = vec4(c, a);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(175, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2), veil);
  dome.position.y = -6; dome.renderOrder = -2; dome.frustumCulled = false;
  group.add(dome);
  // a faint glowing rim where the curtain meets the ground
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(174, 174, 10, 64, 1, true), new THREE.MeshBasicMaterial({ color: '#6a3acc', transparent: true, opacity: 0.18, side: THREE.BackSide, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  rim.position.y = -1; rim.renderOrder = -2; rim.frustumCulled = false;
  group.add(rim);

  // hide the blocks between the camera and the crossing; animate the curtain, the
  // tickers and the screens' flicker
  const scene = group.parent;
  if (scene) scene.onBeforeRender = (rr, sc, cam) => {
    const p = cam.position, t = performance.now() / 1000;
    for (const [k, list] of Object.entries(parts)) {
      const hide = (k.includes('N') && p.z > BZ - 6) || (k.includes('S') && p.z < -BZ + 6) || (k.includes('E') && p.x > BX - 6) || (k.includes('W') && p.x < -BX + 6);
      for (const m of list) m.visible = !hide;
    }
    veil.uniforms.t.value = t;
    tex.ticker.offset.x = (t * 0.05) % 1;
    const f = 0.88 + 0.12 * Math.sin(t * 2.3) * Math.sin(t * 0.7);
    scrMat.color.setRGB(f, f, f);
  };
}

register({ obstacles: OBSTACLES, scenery: { shibuya: scenery } });
