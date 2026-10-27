// Battleground: Starbase Hangar (the Galactic faction's map). A huge hangar deck of
// grey metal plates with hazard stripes and glowing landing circles: low blast
// barriers, cargo containers, breakable supply crates and fuel tanks for cover on
// both halves, a raised control platform with a holo-table in the middle and a
// parked fighter at each end. Outside the field: the hangar walls and catwalks,
// roof trusses and a gantry crane, and two open hangar mouths onto space (stars, a
// ringed planet below the station, a moon and a distant cruiser).
//
// Map format: src/maps-new.js; obstacle / scenery hooks: src/ext.js, src/mapscene.js.
import { THREE } from '../util.js';
import { MAPS, MAP_H } from '../world.js';
import { register } from '../ext.js';

const { merged, T } = MAP_H;
const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const CYL = (rt, rb, h, n = 12) => new THREE.CylinderGeometry(rt, rb, h, n);
const shade = (c, k) => new THREE.Color(c).multiplyScalar(k);
const hash1 = (n) => { const s = Math.sin(n * 91.345 + 47.853) * 43758.5453; return s - Math.floor(s); };

// hangar size: mouths at x = +-MX, side walls at z = +-WZ, roof at ROOF
const MX = 74, WZ = 56, ROOF = 40, APRON = 94;
const TEAM = ['#3d72e3', '#e2403b'];
const C = {
  hull: '#d9dee6', hull2: '#aeb5c0', dark: '#2c323c', glass: '#1b3a5c', wall: '#3b4352', wall2: '#465062',
  rib: '#2d3440', steel: '#6c7686', yellow: '#f2c230', black: '#1c1e22', glow: '#46c8ff', glow2: '#9fe6ff',
};

// ------------------------------------------------------------------ obstacles
// (origin on the ground at the obstacle's centre, local x along its length)
const OBSTACLES = {
  // a parked fighter, nose toward the middle of the field
  sb_fighter(o, map, H, box, p, dn) {
    const L = o.hw * 2, W = o.hd * 2, s = o.x < 0 ? 1 : -1, team = TEAM[o.x < 0 ? 0 : 1];
    const X = (x) => x * s, ry = s > 0 ? 0 : Math.PI;
    const y0 = 1.25; // fuselage axis
    // fuselage, nose cone and cockpit
    p.push([CYL(0.95, 1.05, L * 0.6, 14), C.hull, T(X(-L * 0.08), y0, 0, 1, 1, 1, 0, 0, Math.PI / 2)]);
    p.push([new THREE.ConeGeometry(0.95, L * 0.3, 14), C.hull, T(X(L * 0.37), y0, 0, 1, 1, 1, 0, ry, -Math.PI / 2)]);
    p.push([new THREE.SphereGeometry(0.75, 14, 8), C.glass, T(X(L * 0.12), y0 + 0.7, 0, 1.7, 0.75, 0.9)]);
    p.push([BOX(L * 0.62, 0.14, 0.32), team, T(X(-L * 0.08), y0 + 0.6, 0.78)]);
    p.push([BOX(L * 0.62, 0.14, 0.32), team, T(X(-L * 0.08), y0 + 0.6, -0.78)]);
    // swept wings with wingtip cannons
    for (const sz of [-1, 1]) {
      p.push([BOX(L * 0.32, 0.18, W * 0.42), C.hull2, T(X(-L * 0.16), y0 - 0.1, sz * W * 0.26, 1, 1, 1, 0, sz * s * 0.38, 0)]);
      p.push([BOX(L * 0.26, 0.2, 0.45), team, T(X(-L * 0.2), y0 - 0.05, sz * (W / 2 - 0.35))]);
      p.push([CYL(0.16, 0.16, L * 0.42, 8), C.dark, T(X(L * 0.0), y0 - 0.05, sz * (W / 2 - 0.2), 1, 1, 1, 0, 0, Math.PI / 2)]);
      // engines at the back
      p.push([CYL(0.5, 0.58, L * 0.24, 12), C.steel, T(X(-L * 0.36), y0 + 0.05, sz * 0.95, 1, 1, 1, 0, 0, Math.PI / 2)]);
      p.push([CYL(0.42, 0.42, 0.06, 12), '#ff8a3a', T(X(-L * 0.485), y0 + 0.05, sz * 0.95, 1, 1, 1, 0, 0, Math.PI / 2)]);
    }
    p.push([BOX(L * 0.24, 1.15, 0.16), C.hull2, T(X(-L * 0.36), y0 + 1.0, 0, 1, 1, 1, 0, 0, s * 0.35)]); // tail fin
    p.push([BOX(L * 0.12, 0.3, 0.18), team, T(X(-L * 0.4), y0 + 1.45, 0, 1, 1, 1, 0, 0, s * 0.35)]);
    // landing struts and pads
    for (const [x, z] of [[L * 0.3, 0], [-L * 0.25, 1.6], [-L * 0.25, -1.6]]) {
      p.push([CYL(0.09, 0.12, y0 + dn, 6), C.dark, T(X(x), (y0 - dn) / 2, z)]);
      p.push([CYL(0.3, 0.34, 0.12, 8), C.dark, T(X(x), 0.05, z)]);
    }
  },
  // a low armoured blast barrier
  sb_barrier(o, map, H, box, p, dn) {
    const L = o.hw * 2, D = o.hd * 2, h = o.h;
    box(L, h * 0.55 + dn, D, '#59626f', 0, (h * 0.55 - dn) / 2, 0);
    box(L - 0.1, h * 0.45, D * 0.7, '#68717e', 0, h * 0.775, 0);
    box(L + 0.04, 0.12, D * 0.74, '#3a414b', 0, h, 0);
    // hazard chevrons on both faces
    const n = Math.max(2, Math.round(L / 0.7));
    for (let i = 0; i < n; i++) for (const sz of [-1, 1]) {
      box(0.32, 0.22, 0.03, i % 2 ? C.yellow : C.black, -L / 2 + (i + 0.5) * (L / n), h * 0.36, sz * (D / 2 + 0.01), 0, 0, 0.6);
    }
    for (const sx of [-1, 1]) box(0.18, h * 0.95, D + 0.06, '#3a414b', sx * (L / 2 - 0.09), h * 0.47, 0);
  },
  // a shipping container
  sb_cargo(o, map, H, box, p, dn) {
    const L = o.hw * 2, D = o.hd * 2, h = o.h;
    const col = ['#c8642e', '#2f7f86', '#7a808a', '#a8352e'][Math.floor(hash1(o.seed) * 4)];
    box(L, h + dn, D, col, 0, (h - dn) / 2, 0);
    const n = Math.round(L / 0.55);
    for (let i = 1; i < n; i++) for (const sz of [-1, 1]) box(0.12, h - 0.25, 0.06, shade(col, 0.82), -L / 2 + (i * L) / n, h / 2, sz * (D / 2 + 0.02));
    for (const y of [0.06, h - 0.06]) for (const sz of [-1, 1]) box(L + 0.06, 0.14, 0.14, shade(col, 0.7), 0, y, sz * (D / 2 - 0.04));
    for (const sx of [-1, 1]) {
      box(0.08, h - 0.2, D - 0.1, shade(col, 0.9), sx * (L / 2 + 0.02), h / 2, 0);
      for (const z of [-D * 0.18, D * 0.18]) box(0.1, h - 0.4, 0.06, '#d0d4da', sx * (L / 2 + 0.06), h / 2, z);
    }
    box(L * 0.3, 0.5, 0.04, '#f2f2f2', -L * 0.2, h * 0.7, D / 2 + 0.05); // stencilled panel
    box(L * 0.3, 0.5, 0.04, '#f2f2f2', L * 0.2, h * 0.7, -D / 2 - 0.05);
  },
  // a fuel tank on a cradle
  sb_tank(o, map, H, box, p, dn) {
    const r = o.r, h = o.h;
    p.push([CYL(r, r, h - r * 0.5 + dn, 16), '#c9ced6', T(0, (h - r * 0.5 - dn) / 2, 0)]);
    p.push([new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#c9ced6', T(0, h - r * 0.5, 0, 1, 0.5, 1)]);
    for (const y of [0.25, h * 0.45]) p.push([CYL(r + 0.04, r + 0.04, 0.22, 16), y < 1 ? C.yellow : '#d04a3a', T(0, y, 0)]);
    p.push([CYL(r + 0.06, r + 0.1, 0.25, 16), C.dark, T(0, 0.1, 0)]);
    box(0.25, 0.25, r * 2.4, C.steel, r * 0.6, h * 0.7, 0, 0.3, 0, 0);
  },
  // the control console with the holo-table (its hologram is added by the scenery)
  sb_holo(o, map, H, box, p, dn) {
    const r = o.r, h = o.h;
    p.push([CYL(r * 0.6, r * 0.75, h + dn, 10), C.wall2, T(0, (h - dn) / 2, 0)]);
    p.push([CYL(r, r * 0.8, 0.25, 16), C.steel, T(0, h - 0.1, 0)]);
    p.push([CYL(r * 0.85, r * 0.85, 0.04, 16), '#123a5a', T(0, h + 0.04, 0)]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      box(0.5, 0.06, 0.32, '#1b2836', Math.cos(a) * (r + 0.05), h * 0.62, Math.sin(a) * (r + 0.05), 0, -a, 0.6);
    }
  },
};

// ------------------------------------------------------------------ the map
const STARBASE = {
  id: 'starbase', name: 'Starbase Hangar', music: 'battle_galactic', // (the Galactic theme, once delivered)
  ground: ['#7c838e', '#868d98', '#727984'], patch: '#7a818c', dirt: '#5e646e', high: '#7c838e', far: '#646b76', rock: '#3c424c',
  sky: ['#02030a', '#0a1028'], fog: '#0b1124', fogNear: 110, fogFar: 520, sun: '#cfe0ff', sunI: 2.1, hemiGround: '#3a4560', hemiI: 1.3,
  hills: 0, bumps: 0, trees: ['pine'], grass: '#6c737e', grassTip: '#8a919c', tufts: 0,
  flowers: null, bushes: '#4a515c', props: 'starbase', mountains: '#0b1124',
  stone: '#5a6370', wood: '#77808e',
  // the deck ends a little beyond the hangar mouths and the walls: space below
  shape(x, z, y) {
    const ex = Math.abs(x) - APRON, ez = Math.abs(z) - (WZ + 4);
    const e = Math.max(ex, ez);
    return e > 0 ? y - Math.min(1, e / 3) * 70 : y;
  },
  layout(L) {
    // floor tints: darker deck plates here and there, the control platform deck
    for (let i = 0; i < 18; i++) {
      const x = -6 - Math.floor(hash1(i * 3.1) * 6) * 6 - 3, z = (Math.floor(hash1(i * 7.7) * 10) - 5) * 6 + 3;
      L.paint(x, z, 3, 3, hash1(i) < 0.5 ? '#6e757f' : '#8e95a0', { soft: 0.6, noise: 0.1 });
    }
    L.plateau(0, 0, 4.5, 5.5, 0.8, 2.4, 0, true); // the raised control platform (low enough to shoot over)
    L.paint(0, 0, 4.6, 5.6, '#4c5562', { soft: 0.8, noise: 0.15 }, true);
    L.paint(0, 0, 7.6, 8.6, '#5d6571', { soft: 1, noise: 0.15 }, true);
    L.cyl('sb_holo', 0, 0, 0.95, 1.1, {}, true);
    // a parked fighter at each end on its landing circle
    L.box('sb_fighter', -35, 10, 4.6, 3.2, 2.4, 0);
    // blast barriers
    L.wall(-16, 7, -16, 13, 1.15, 0.7, 'sb_barrier');
    L.wall(-13.5, -11, -8.5, -14.5, 1.15, 0.7, 'sb_barrier');
    L.wall(-27, -3, -27, 3, 1.15, 0.7, 'sb_barrier');
    L.wall(-7, 24.5, -1.5, 25.5, 1.15, 0.7, 'sb_barrier');
    // cargo containers, supply crates (breakable) and fuel tanks
    L.box('sb_cargo', -24, 21, 2.9, 1.25, 2.6, 0.15);
    L.box('sb_cargo', -31, -18, 1.25, 2.9, 2.6, 0.1);
    L.crates(-19, -25, 5, 0.4);
    L.crates(-21.5, 5, 3, 0.3);
    L.crates(-38, -6, 3, 0.8);
    L.crates(-10, 30, 2, -0.3);
    L.cyl('sb_tank', -39, 24, 1.1, 2.6);
    L.cyl('sb_tank', -36.2, 26.2, 0.85, 2.1);
  },
};
MAPS.push(STARBASE);

// ------------------------------------------------------------------ helpers
// flat quad from four (x, z) corners (counter-clockwise seen from above) at height y
function quad(pts, y) {
  const g = new THREE.BufferGeometry(), a = pts;
  const v = [a[0], a[1], a[2], a[0], a[2], a[3]].flatMap(([x, z]) => [x, y, z]);
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(18).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return g;
}
// a rectangle decal centred (x, z), w along its rot axis, d across
function rect(parts, x, z, w, d, rot, col, y = 0.02) {
  const c = Math.cos(rot), s = Math.sin(rot), hw = w / 2, hd = d / 2;
  const P = (u, v) => [x + u * c + v * s, z - u * s + v * c];
  parts.push([quad([P(-hw, hd), P(hw, hd), P(hw, -hd), P(-hw, -hd)], y), col]);
}
// a hazard band from (x0,z0) to (x1,z1), w wide: yellow with slanted black bars
function hazard(parts, x0, z0, x1, z1, w, y = 0.02) {
  const L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L, vx = -uz, vz = ux;
  const P = (u, v) => [x0 + ux * u + vx * v, z0 + uz * u + vz * v];
  const bar = (q) => parts.push([quad(q.map(([u, v]) => P(u, v)), y), C.black]);
  parts.push([quad([P(0, w / 2), P(L, w / 2), P(L, -w / 2), P(0, -w / 2)].reverse(), y - 0.004), C.yellow]);
  const per = w * 1.3, bw = per / 2;
  for (let u = 0; u + bw + w < L; u += per) bar([[u, -w / 2], [u + bw, -w / 2], [u + bw + w * 0.8, w / 2], [u + w * 0.8, w / 2]].reverse());
}
// fix the winding so every decal faces up
function upQuad(g) {
  const p = g.attributes.position.array;
  const ax = p[3] - p[0], az = p[5] - p[2], bx = p[6] - p[0], bz = p[8] - p[2];
  if (ax * bz - az * bx > 0) { // clockwise from above: swap to face +y
    for (const k of [0, 1, 2]) { const t = p[3 + k]; p[3 + k] = p[6 + k]; p[6 + k] = t; }
    for (const k of [0, 1, 2]) { const t = p[12 + k]; p[12 + k] = p[15 + k]; p[15 + k] = t; }
  }
  return g;
}
const flatRing = (r0, r1, n = 48) => new THREE.RingGeometry(r0, r1, n).rotateX(-Math.PI / 2);

// The generic nature pass (trees, rocks, pebbles, bushes, tufts, clouds, the mountain
// ring) runs before a map's set dressing; a deck in space has none of it. Everything
// instanced in the group at this point, and the mountain ring, belongs to that pass.
function stripNature(group) {
  for (const o of [...group.children]) {
    const mountains = o.isMesh && !o.isInstancedMesh && o.frustumCulled === false && !o.material.isShaderMaterial;
    if (o.isInstancedMesh || mountains) { group.remove(o); o.geometry.dispose(); }
  }
}

function mesh(geo, mat, shadow = false) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow; m.receiveShadow = true;
  return m;
}

// ------------------------------------------------------------------ set dressing
function scenery(group, map, terrain, H, kit) {
  stripNature(group);
  const lam = (o = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, ...o });
  const decalMat = lam({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const at = kit.at;

  // cool hangar light from the ceiling panels
  group.add(new THREE.HemisphereLight('#8fb2ff', '#2c3446', 1.05));

  // ---- floor markings
  const dec = [], glow = [];
  for (let x = -MX + 2; x <= MX - 2; x += 6) rect(dec, x, 0, 0.09, WZ * 2, 0, '#5c636d', 0.012);
  for (let z = -WZ + 2; z <= WZ - 2; z += 6) rect(dec, 0, z, MX * 2 + 40, 0.09, 0, '#5c636d', 0.012);
  for (const s of [-1, 1]) {
    hazard(dec, -60, s * 33.6, 60, s * 33.6, 1.2);
    hazard(dec, s * (MX - 2), -46, s * (MX - 2), 46, 1.6);
    hazard(dec, s * APRON - s * 1, -WZ, s * APRON - s * 1, WZ, 1.6);
  }
  // around the foot of the control platform
  const px = 8.4, pz = 9.4;
  hazard(dec, -px, -pz, px, -pz, 0.9); hazard(dec, px, pz, -px, pz, 0.9);
  hazard(dec, px, -pz, px, pz, 0.9); hazard(dec, -px, pz, -px, -pz, 0.9);
  // taxi lines from the mouths to the fighters' circles (dashed yellow)
  for (const s of [-1, 1]) {
    for (let x = 41; x < APRON - 2; x += 3) rect(dec, s * x, s * -10, 1.6, 0.22, 0, C.yellow, 0.016);
    for (let x = 4; x < 32; x += 3) rect(dec, s * -(x + 9), s * 31, 1.6, 0.22, 0, '#e6e9ee', 0.016);
  }
  // the control platform deck plates (top is flat at its plateau height)
  const top = at(0, 0);
  group.add(platformDeck(at, top, lam({ flatShading: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
  for (const sx of [-1, 1]) {
    glow.push([BOX(0.12, 0.05, 11), C.glow, T(sx * 4.45, top + 0.03, 0)]);
    glow.push([BOX(9, 0.05, 0.12), C.glow, T(0, top + 0.03, sx * 5.45)]);
  }
  // glowing landing circles: under each fighter, a big ring round the platform
  const rings = [];
  for (const o of terrain.feat.obs) if (o.kind === 'sb_fighter') rings.push([o.x, o.z, 6.6, 0.02]);
  rings.push([0, 0, 12.2, 0.02]);
  for (const [x, z, r, y] of rings) {
    glow.push([flatRing(r - 0.35, r, 64), C.glow, T(x, y + 0.012, z)]);
    glow.push([flatRing(r * 0.72 - 0.15, r * 0.72, 64), C.glow2, T(x, y + 0.012, z)]);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; glow.push([BOX(1.1, 0.01, 0.22), C.glow, T(x + Math.cos(a) * (r - 1.1), y + 0.016, z + Math.sin(a) * (r - 1.1), 1, 1, 1, 0, -a, 0)]); }
  }
  glow.push([flatRing(2.2, 2.45, 40), C.glow, T(0, top + 0.02, 0)]);
  for (const g of dec) upQuad(g[0]);
  const dm = mesh(merged(dec), decalMat); dm.renderOrder = 1;
  group.add(dm);

  // ---- hangar walls (both long sides) with ribs, catwalks and light strips
  // each piece is its own pair of meshes (lit + glowing) so it can hide while the
  // camera is outside it, looking in (see the scene hook at the end)
  const sec = {}, S = (k) => (sec[k] ||= { p: [], g: [] });
  const H2 = ROOF + 2;
  for (const s of [-1, 1]) {
    const z = s * (WZ + 1), { p: wall, g: glow } = S('side' + s);
    wall.push([BOX(MX * 2 + 6, H2, 2), C.wall, T(0, H2 / 2 - 1, z)]);
    // panels in two shades
    for (let x = -MX + 6; x < MX; x += 12) for (let y = 3; y < ROOF - 4; y += 7) {
      wall.push([BOX(11.2, 6.4, 0.3), hash1(x * 0.3 + y) < 0.5 ? C.wall2 : shade(C.wall, 1.1), T(x, y + 2, z - s * 1.1)]);
    }
    for (let x = -MX; x <= MX; x += 12) {
      wall.push([BOX(1.8, H2, 1.8), C.rib, T(x, H2 / 2 - 1, z - s * 1.4)]);
      glow.push([BOX(0.25, ROOF - 10, 0.1), C.glow, T(x, (ROOF - 10) / 2 + 4, z - s * 2.35)]);
    }
    // catwalks at two levels with railings
    for (const y of [9, 21]) {
      wall.push([BOX(MX * 2, 0.35, 3), C.steel, T(0, y, z - s * 2.9)]);
      wall.push([BOX(MX * 2, 0.12, 0.12), C.yellow, T(0, y + 1.1, z - s * 4.3)]);
      for (let x = -MX; x <= MX; x += 3) wall.push([BOX(0.1, 1.1, 0.1), C.steel, T(x, y + 0.55, z - s * 4.3)]);
      glow.push([BOX(MX * 2, 0.12, 0.05), C.glow2, T(0, y - 0.25, z - s * 4.35)]);
    }
    // big bay doors at floor level, lit numbers above
    for (const x of [-48, -16, 16, 48]) {
      wall.push([BOX(14, 7.5, 0.4), '#2a303a', T(x, 3.75, z - s * 1.3)]);
      for (let k = 0; k < 7; k++) wall.push([BOX(14, 0.12, 0.1), '#1e232b', T(x, 0.6 + k, z - s * 1.55)]);
      hazardWall(wall, x, z - s * 1.5, 14);
      glow.push([BOX(4, 1.2, 0.1), x < 0 ? TEAM[0] : TEAM[1], T(x, 9.6, z - s * 1.3)]);
    }
    // the wall foot: a dark skirting
    wall.push([BOX(MX * 2 + 6, 0.8, 0.6), C.dark, T(0, 0.4, z - s * 1.2)]);
  }
  // ---- the hangar mouths: a lintel above, jambs at the sides, light along the edges
  for (const s of [-1, 1]) {
    const x = s * (MX + 1), { p: wall, g: glow } = S('mouth' + s);
    wall.push([BOX(4, H2 - 28, WZ * 2 + 4), C.wall, T(x, 28 + (H2 - 28) / 2 - 1, 0)]);
    wall.push([BOX(4.4, 1.2, WZ * 2 + 4), C.dark, T(x, 28, 0)]);
    for (const sz of [-1, 1]) {
      wall.push([BOX(5, 28, WZ - 46 + 2), C.wall2, T(x, 14, sz * (46 + (WZ - 46) / 2 + 1))]);
      glow.push([BOX(0.3, 27, 0.3), C.glow, T(x - s * 2.6, 14, sz * 46.2)]);
    }
    glow.push([BOX(0.3, 0.3, 92), C.glow, T(x - s * 2.3, 27.3, 0)]);
    for (let z = -44; z <= 44; z += 8) glow.push([BOX(1.6, 0.25, 1.6), '#e8f4ff', T(x - s * 1.2, 27.35, z)]);
    // the apron outside: a lip and running lights along the edge
    S('floor').p.push([BOX(2, 1.2, WZ * 2 + 8), C.dark, T(s * (APRON + 0.6), -0.5, 0)]);
    for (let z = -WZ; z <= WZ; z += 4) S('floor').g.push([BOX(0.4, 0.2, 0.4), z % 8 ? '#ff7a3a' : C.glow2, T(s * (APRON - 0.6), 0.12, z)]);
  }
  // ---- the roof: trusses across the hangar, a gantry crane, light panels. The roof
  // plate faces down only, so a camera above the roof still sees the battle.
  const roof = new THREE.PlaneGeometry(MX * 2 + 6, WZ * 2 + 4).rotateX(Math.PI / 2);
  const { p: wall, g: rglow } = S('roof');
  wall.push([roof, '#1d2330', T(0, ROOF, 0)]);
  for (let x = -MX + 6; x < MX; x += 12) {
    for (const y of [ROOF - 7, ROOF - 1.5]) wall.push([BOX(0.7, 0.7, WZ * 2), C.steel, T(x, y, 0)]);
    for (let z = -WZ + 4; z < WZ - 2; z += 7) {
      wall.push([BOX(0.35, 5.5, 0.35), C.rib, T(x, ROOF - 4.25, z)]);
      wall.push([BOX(0.3, 8.5, 0.3), C.rib, T(x, ROOF - 4.25, z + 3.5, 1, 1, 1, Math.atan2(7, 5.5), 0, 0)]);
    }
    for (let z = -WZ + 8; z < WZ - 6; z += 14) rglow.push([BOX(4.5, 0.1, 2.4), '#dcecff', T(x + 6, ROOF - 0.3, z)]);
  }
  // gantry crane over the Blue end and its mirror over the Red end
  for (const s of [-1, 1]) {
    const x = s * 34;
    for (const dx of [-1.2, 1.2]) wall.push([BOX(0.9, 1.6, WZ * 2), C.yellow, T(x + dx, ROOF - 9, 0)]);
    wall.push([BOX(4, 1.8, 3), '#d5a020', T(x, ROOF - 10.6, s * 10)]);
    wall.push([CYL(0.06, 0.06, 6, 4), C.dark, T(x - 0.6, ROOF - 14.5, s * 10)]);
    wall.push([CYL(0.06, 0.06, 6, 4), C.dark, T(x + 0.6, ROOF - 14.5, s * 10)]);
    wall.push([BOX(1.8, 0.5, 0.8), C.dark, T(x, ROOF - 17.6, s * 10)]);
    for (const sz of [-1, 1]) wall.push([BOX(4, 3, 3), C.yellow, T(x, ROOF - 9.5, sz * (WZ - 1.5))]);
  }
  group.add(mesh(merged(glow), glowMat)); // floor lights
  const wallMat = lam({ flatShading: true }), parts = {};
  for (const [k, { p, g }] of Object.entries(sec)) {
    parts[k] = [p.length && mesh(merged(p), wallMat), g.length && mesh(merged(g), glowMat)].filter(Boolean);
    group.add(...parts[k]);
  }
  // hide the roof while the camera is above it, and a wall or mouth while the camera
  // is out beyond it, so the battle stays in view from anywhere
  const show = (k, on) => { for (const m of parts[k] || []) m.visible = on; };
  const scene = group.parent;
  if (scene) scene.onBeforeRender = (r, sc, cam) => {
    const p = cam.position;
    show('roof', p.y < ROOF - 0.5);
    for (const s of [-1, 1]) { show('side' + s, s * p.z < WZ); show('mouth' + s, s * p.x < MX + 3); }
  };

  // ---- obstacle lights: fighter engines and cockpits, barrier strips, the hologram
  const ol = [];
  for (const o of terrain.feat.obs) {
    const M = T(o.x, o.ground, o.z, 1, 1, 1, 0, o.rot, 0);
    const add = (g, c, m) => ol.push([g, c, M.clone().multiply(m)]);
    if (o.kind === 'sb_fighter') {
      const s = o.x < 0 ? 1 : -1, L = o.hw * 2;
      for (const sz of [-1, 1]) add(CYL(0.36, 0.36, 0.05, 12), '#ffb060', T(-s * L * 0.49, 1.3, sz * 0.95, 1, 1, 1, 0, 0, Math.PI / 2));
      for (const sz of [-1, 1]) add(BOX(0.2, 0.12, 0.2), sz > 0 ? '#5aff7a' : '#ff4a4a', T(-s * L * 0.2, 1.25, sz * (o.hd - 0.05)));
    } else if (o.kind === 'sb_barrier') {
      add(BOX(o.hw * 2 - 0.4, 0.06, 0.08), C.glow, T(0, o.h + 0.07, 0));
    } else if (o.kind === 'sb_cargo') {
      for (const sx of [-1, 1]) add(BOX(0.12, 0.12, 0.12), '#ffb040', T(sx * (o.hw - 0.2), o.h + 0.06, 0));
    } else if (o.kind === 'sb_tank') {
      add(BOX(0.16, 0.3, 0.05), '#5aff7a', T(0, o.h * 0.6, o.r + 0.02));
    }
  }
  if (ol.length) group.add(mesh(merged(ol), glowMat));
  const holo = terrain.feat.obs.find((o) => o.kind === 'sb_holo');
  if (holo) {
    const hm = new THREE.MeshBasicMaterial({ color: '#5ad8ff', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const hg = new THREE.Group();
    hg.position.set(holo.x, holo.top + 0.05, holo.z);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.2, 1.2, 20, 1, true), hm);
    cone.position.y = 0.6;
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), new THREE.MeshBasicMaterial({ color: '#8fe8ff', wireframe: true, transparent: true, opacity: 0.8 }));
    ball.position.y = 1.55;
    const orbit = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.025, 4, 40), hm);
    orbit.position.y = 1.55; orbit.rotation.x = 1.2;
    hg.add(cone, ball, orbit);
    ball.onBeforeRender = () => { const t = performance.now() / 1000; ball.rotation.y = t * 0.6; orbit.rotation.z = t * 0.9; };
    group.add(hg);
  }
  // the air shields across the mouths (faint blue)
  const shield = new THREE.MeshBasicMaterial({ color: '#3a8cff', transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(92, 27.4), shield);
    m.position.set(s * (MX + 0.2), 13.7, 0); m.rotation.y = Math.PI / 2;
    group.add(m);
  }

  // ---- space: stars, a ringed planet below the station, a moon, a distant cruiser
  space(group);
}

// the control platform's skin: a grid that follows the plateau (deck plates on top,
// ribbed ramps down the sides), drawn just above the ground
function platformDeck(at, top, mat) {
  const R = 0.4, nx = 42, nz = 48, x0 = -nx * R / 2, z0 = -nz * R / 2;
  const pos = [], col = [], idx = [], c = new THREE.Color();
  const plate = new THREE.Color('#4a5360'), seam = new THREE.Color('#353c47'), rib = new THREE.Color('#5d6673'), groove = new THREE.Color('#383f4a');
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + i * R, z = z0 + j * R, h = at(x, z);
    pos.push(x, h + 0.025, z);
    if (h > top - 0.02) c.copy((Math.abs(x) % 2 < 0.25 || Math.abs(z) % 2 < 0.25) ? seam : plate);
    else {
      const lx = Math.abs(x) - 4.5, lz = Math.abs(z) - 5.5;
      const d = lx > 0 && lz > 0 ? Math.hypot(lx, lz) : Math.max(lx, lz);
      c.copy(Math.floor(d / 0.4) % 2 ? rib : groove);
    }
    col.push(c.r, c.g, c.b);
  }
  const n = nx + 1;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * n + i, b = a + 1, cc = a + n, d = cc + 1;
    if (Math.max(pos[a * 3 + 1], pos[b * 3 + 1], pos[cc * 3 + 1], pos[d * 3 + 1]) < 0.05) continue;
    idx.push(a, cc, b, b, cc, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}

// a band of hazard chevrons above a bay door
function hazardWall(parts, x, z, w) {
  const n = Math.round(w / 0.8);
  for (let i = 0; i < n; i++) parts.push([BOX(0.4, 0.5, 0.06), i % 2 ? C.yellow : C.black, T(x - w / 2 + (i + 0.5) * (w / n), 7.9, z, 1, 1, 1, 0, 0, 0.6)]);
}

function space(group) {
  // stars: one points cloud on a big sphere, a denser band for the galaxy
  const n = 3200, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    let x, y, z;
    if (i < 900) { // the milky band: a tilted great circle
      const a = hash1(i * 1.7) * Math.PI * 2, w = (hash1(i * 3.3) - 0.5) * 0.35;
      x = Math.cos(a); y = Math.sin(a) * 0.45 + w; z = Math.sin(a) * 0.89 - w * 0.5;
    } else {
      const u = hash1(i * 2.1) * 2 - 1, a = hash1(i * 5.3) * Math.PI * 2, r = Math.sqrt(1 - u * u);
      x = r * Math.cos(a); y = u; z = r * Math.sin(a);
    }
    const m = 820 / Math.hypot(x, y, z);
    pos[i * 3] = x * m; pos[i * 3 + 1] = y * m; pos[i * 3 + 2] = z * m;
    const k = hash1(i * 9.1);
    c.set(k < 0.15 ? '#ffd8a8' : k < 0.35 ? '#a8c8ff' : '#ffffff').multiplyScalar(0.45 + hash1(i * 4.7) * 0.55);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false }));
  stars.frustumCulled = false; stars.renderOrder = -9;
  group.add(stars);

  // soft nebula clouds: billboards with a radial-gradient texture
  const tex = glowTexture();
  for (const [x, y, z, w, h, col, op] of [[-700, 120, 260, 520, 300, '#5a3aa8', 0.5], [-640, -80, 40, 380, 260, '#2a5ab0', 0.4], [500, 260, 420, 420, 240, '#8a3a9a', 0.32], [200, 380, -620, 500, 300, '#2a6ab0', 0.3]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, color: col, transparent: true, opacity: op, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); m.renderOrder = -8; m.frustumCulled = false;
    group.add(m);
  }

  // the ringed planet, shaded on the vertices (lit from the upper left), below the deck
  const lit = new THREE.Vector3(-0.4, 0.75, 0.5).normalize();
  const shaded = (geo, a, b, bands = 0) => {
    const p = geo.attributes.position, nr = geo.attributes.normal, cl = new Float32Array(p.count * 3), ca = new THREE.Color(a), cb = new THREE.Color(b), t = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const d = nr.getX(i) * lit.x + nr.getY(i) * lit.y + nr.getZ(i) * lit.z;
      t.copy(ca);
      if (bands) t.lerp(cb, 0.5 + 0.5 * Math.sin(p.getY(i) * bands));
      t.multiplyScalar(0.08 + 0.92 * Math.max(0, d) ** 0.8);
      cl[i * 3] = t.r; cl[i * 3 + 1] = t.g; cl[i * 3 + 2] = t.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    return geo;
  };
  const planet = new THREE.Mesh(shaded(new THREE.SphereGeometry(230, 48, 32), '#e8a868', '#b8643a', 14), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  planet.position.set(640, -270, -80);
  const ringGeo = new THREE.RingGeometry(290, 430, 96, 3);
  { // banded ring colours via the radius
    const p = ringGeo.attributes.position, cl = new Float32Array(p.count * 3), t = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i), p.getY(i)), k = (r - 290) / 140;
      t.set(k < 0.3 ? '#c8a07a' : k < 0.45 ? '#6a5040' : k < 0.8 ? '#e8cfa8' : '#a88a6a');
      cl[i * 3] = t.r; cl[i * 3 + 1] = t.g; cl[i * 3 + 2] = t.b;
    }
    ringGeo.setAttribute('color', new THREE.BufferAttribute(cl, 3));
  }
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75, side: THREE.DoubleSide, fog: false, depthWrite: false }));
  ring.position.copy(planet.position);
  ring.rotation.set(-Math.PI / 2 + 0.32, 0.18, 0);
  for (const m of [planet, ring]) { m.frustumCulled = false; m.renderOrder = -7; group.add(m); }
  // the moon, out of the other mouth
  const moonGeo = new THREE.IcosahedronGeometry(55, 4);
  shaded(moonGeo, '#d4d8e2', '#9aa0b0', 0);
  { // craters: darker patches on the vertex colours
    const p = moonGeo.attributes.position, cl = moonGeo.attributes.color, v = new THREE.Vector3();
    const cr = [...Array(14)].map((_, i) => [new THREE.Vector3(hash1(i * 3.3) - 0.5, hash1(i * 5.1) - 0.5, hash1(i * 7.9) - 0.5).normalize(), 0.12 + hash1(i * 2.2) * 0.22]);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      let k = 1;
      for (const [d, r] of cr) { const a = v.angleTo(d); if (a < r) k *= a > r * 0.75 ? 1.12 : 0.72; }
      cl.setXYZ(i, cl.getX(i) * k, cl.getY(i) * k, cl.getZ(i) * k);
    }
  }
  const moon = new THREE.Mesh(moonGeo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  moon.position.set(-620, -40, 190); moon.frustumCulled = false; moon.renderOrder = -7;
  group.add(moon);
  // a distant cruiser hanging off the planet side
  const cr = [];
  cr.push([new THREE.ConeGeometry(14, 90, 4), '#9aa2b0', T(0, 0, 0, 1, 1, 0.35, 0, Math.PI / 4, -Math.PI / 2)]);
  cr.push([BOX(26, 10, 14), '#7a8290', T(-34, 6, 0)]);
  cr.push([BOX(8, 6, 6), '#8a92a0', T(-38, 13, 0)]);
  const cm = new THREE.Mesh(merged(cr), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, color: '#9aa8c8' }));
  cm.position.set(560, 70, 300); cm.rotation.y = 0.5; cm.frustumCulled = false; cm.renderOrder = -6;
  group.add(cm);
  const eg = new THREE.Mesh(BOX(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#7ad8ff', fog: false }));
  eg.position.set(560 - Math.cos(0.5) * 47, 70 + 6, 300 + Math.sin(0.5) * 47); eg.scale.set(3, 7, 10); eg.rotation.y = 0.5;
  group.add(eg);
}

// a white radial falloff (cached: the scene disposes geometry, not textures)
let _glowTex = null;
function glowTexture() {
  if (_glowTex) return _glowTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const x = cv.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.35, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  _glowTex = new THREE.CanvasTexture(cv);
  _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}

register({ obstacles: OBSTACLES, scenery: { starbase: scenery } });
