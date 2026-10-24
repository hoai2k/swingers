// Unit meshes: one THREE.Group per ragdoll part, with clothes, faces, hats and weapons.
import { THREE, clamp } from './util.js';
import { PART, NPARTS, makeSkeleton, forwardKinematics } from './body.js';
import { ITEMS, gripDir } from './items.js';
import { computePose, newPose } from './pose.js';

export const TEAM_COLORS = ['#3d72e3', '#e2403b'];
export const TEAM_DARK = ['#294e9e', '#9e2b28'];
export const TEAM_NAMES = ['Blue', 'Red'];

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, ...opts });
    matCache.set(key, m);
  }
  return m;
}
const metal = () => mat('#b9c2cc', { emissive: '#1a1d22' });
const gold = () => mat('#e8b93a', { emissive: '#3a2a05' });
const wood = () => mat('#8b5a2b');
const darkWood = () => mat('#5e3b1c');

const geoCache = new Map();
function geo(key, make) {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
}
const sphere = (r) => geo('s' + r.toFixed(3), () => new THREE.SphereGeometry(r, 16, 12));
const capsule = (r, len) => geo('c' + r.toFixed(3) + ':' + len.toFixed(3), () => new THREE.CapsuleGeometry(r, len, 5, 12));
const cyl = (rt, rb, h, n = 10) => geo(`y${rt.toFixed(3)}:${rb.toFixed(3)}:${h.toFixed(3)}:${n}`, () => new THREE.CylinderGeometry(rt, rb, h, n));
const box = (x, y, z) => geo(`b${x.toFixed(3)}:${y.toFixed(3)}:${z.toFixed(3)}`, () => new THREE.BoxGeometry(x, y, z));
const cone = (r, h, n = 10) => geo(`k${r.toFixed(3)}:${h.toFixed(3)}:${n}`, () => new THREE.ConeGeometry(r, h, n));

function mesh(g, m, x = 0, y = 0, z = 0, parent) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  if (parent) parent.add(o);
  return o;
}

// ---------------------------------------------------------------- faces
export const FACE_MATS = [];
function drawFace(kind) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.lineCap = 'round';
  g.translate(128, 64); g.scale(1.35, 1.35); g.translate(-128, -62);
  g.strokeStyle = '#1b1410'; g.fillStyle = '#1b1410';
  const ex = [100, 156], ey = 58;
  const eye = (x, y, r = 9) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
  if (kind === 'normal') {
    eye(ex[0], ey); eye(ex[1], ey);
    g.lineWidth = 6; g.beginPath(); g.moveTo(86, 38); g.lineTo(112, 36); g.moveTo(144, 36); g.lineTo(170, 38); g.stroke();
    g.lineWidth = 5; g.beginPath(); g.moveTo(118, 92); g.quadraticCurveTo(128, 96, 138, 92); g.stroke();
  } else if (kind === 'angry') {
    eye(ex[0], ey + 2, 8); eye(ex[1], ey + 2, 8);
    g.lineWidth = 9; g.beginPath(); g.moveTo(80, 30); g.lineTo(116, 46); g.moveTo(140, 46); g.lineTo(176, 30); g.stroke();
    g.beginPath(); g.ellipse(128, 94, 18, 11, 0, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.fillRect(114, 85, 28, 6);
  } else if (kind === 'scared') {
    g.fillStyle = '#fff'; g.beginPath(); g.arc(ex[0], ey, 16, 0, 7); g.arc(ex[1], ey, 16, 0, 7); g.fill();
    g.fillStyle = '#1b1410'; eye(ex[0], ey, 7); eye(ex[1], ey, 7);
    g.lineWidth = 6; g.beginPath(); g.moveTo(84, 30); g.lineTo(112, 22); g.moveTo(144, 22); g.lineTo(172, 30); g.stroke();
    g.beginPath(); g.ellipse(128, 98, 10, 14, 0, 0, 7); g.fill();
  } else if (kind === 'dead') {
    g.lineWidth = 8;
    for (const x of ex) { g.beginPath(); g.moveTo(x - 12, ey - 12); g.lineTo(x + 12, ey + 12); g.moveTo(x + 12, ey - 12); g.lineTo(x - 12, ey + 12); g.stroke(); }
    g.lineWidth = 5; g.beginPath(); g.moveTo(112, 94); g.lineTo(144, 94); g.stroke();
    g.fillStyle = '#e46a7a'; g.beginPath(); g.ellipse(136, 102, 7, 9, 0, 0, 7); g.fill();
  } else if (kind === 'happy') {
    g.lineWidth = 7;
    for (const x of ex) { g.beginPath(); g.arc(x, ey + 6, 11, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
    g.beginPath(); g.arc(128, 82, 20, 0.15 * Math.PI, 0.85 * Math.PI); g.closePath(); g.fill();
  } else if (kind === 'hurt') {
    g.lineWidth = 7;
    g.beginPath(); g.moveTo(ex[0] - 12, ey - 8); g.lineTo(ex[0] + 8, ey); g.lineTo(ex[0] - 12, ey + 8);
    g.moveTo(ex[1] + 12, ey - 8); g.lineTo(ex[1] - 8, ey); g.lineTo(ex[1] + 12, ey + 8); g.stroke();
    g.beginPath(); g.ellipse(128, 96, 14, 8, 0, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
export function initFaces() {
  if (FACE_MATS.length) return;
  for (const k of ['normal', 'angry', 'scared', 'dead', 'happy', 'hurt']) {
    FACE_MATS.push(new THREE.MeshBasicMaterial({ map: drawFace(k), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  }
}
function faceGeo(r) {
  return geo('face' + r.toFixed(3), () => {
    const len = Math.PI * 0.95;
    return new THREE.SphereGeometry(r * 1.015, 20, 10, Math.PI / 2 - len / 2, len, Math.PI * 0.18, Math.PI * 0.52);
  });
}

// ---------------------------------------------------------------- items
export function buildItem(name, s, team) {
  const g = new THREE.Group();
  const it = ITEMS[name];
  if (!it || name === 'none') return g;
  const L = it.len * s;
  const back = (it.back || 0) * L;
  const c = it.center ? -L / 2 : -back; // y where the item starts
  switch (name) {
    case 'club':
      mesh(cyl(0.07 * s, 0.035 * s, L), wood(), 0, L / 2, 0, g);
      mesh(sphere(0.1 * s), wood(), 0, L * 0.92, 0, g);
      break;
    case 'bone':
      mesh(cyl(0.035 * s, 0.035 * s, L), mat('#efe8d6'), 0, L / 2, 0, g);
      mesh(sphere(0.07 * s), mat('#efe8d6'), 0.03 * s, L, 0, g);
      mesh(sphere(0.07 * s), mat('#efe8d6'), -0.03 * s, L, 0, g);
      break;
    case 'big_axe': case 'axe': {
      mesh(cyl(0.035 * s, 0.035 * s, L), darkWood(), 0, L / 2, 0, g);
      const bw = (name === 'axe' ? 0.32 : 0.55) * s;
      const blade = mesh(box(0.04 * s, bw, bw * 0.9), name === 'axe' ? metal() : mat('#9b9b9b'), 0, L - bw * 0.45, bw * 0.4, g);
      blade.rotation.x = 0.1;
      break;
    }
    case 'pitchfork': case 'pitchfork_small': {
      mesh(cyl(0.03 * s, 0.03 * s, L), wood(), 0, c + L / 2, 0, g);
      const top = c + L;
      mesh(box(0.3 * s * (L > 1 ? 1 : 0.6), 0.04 * s, 0.04 * s), metal(), 0, top, 0, g);
      for (const x of [-0.13, 0, 0.13]) mesh(cyl(0.014 * s, 0.01 * s, 0.32 * s), metal(), x * s * (L > 1 ? 1 : 0.6), top + 0.16 * s, 0, g);
      break;
    }
    case 'sword': case 'greatsword': case 'kingsword': {
      const bw = (name === 'sword' ? 0.09 : name === 'greatsword' ? 0.13 : 0.2) * s;
      mesh(box(bw, L * 0.78, 0.025 * s), metal(), 0, L * 0.6, 0, g);
      mesh(box(bw * 3, 0.05 * s, 0.06 * s), name === 'kingsword' ? gold() : mat('#6b5a3a'), 0, L * 0.21, 0, g);
      mesh(cyl(0.035 * s, 0.035 * s, L * 0.2), darkWood(), 0, L * 0.1, 0, g);
      if (name === 'kingsword') mesh(sphere(0.06 * s), gold(), 0, 0, 0, g);
      break;
    }
    case 'lute': {
      const body = mesh(sphere(0.2 * s), mat('#b4783a'), 0, L * 0.25, 0, g);
      body.scale.set(1, 1.25, 0.5);
      mesh(box(0.06 * s, L * 0.55, 0.03 * s), darkWood(), 0, L * 0.7, 0, g);
      mesh(cyl(0.05 * s, 0.05 * s, 0.01 * s), mat('#3a2410'), 0, L * 0.3, 0.1 * s, g).rotation.x = Math.PI / 2;
      break;
    }
    case 'bow': {
      const R = L * 0.5, half = Math.PI * 0.36;
      const tg = geo('bow' + s.toFixed(3), () => {
        const t = new THREE.TorusGeometry(R, 0.028 * s, 5, 18, half * 2);
        t.rotateZ(-half); t.rotateY(-Math.PI / 2); t.translate(0, 0, -R);
        return t;
      });
      mesh(tg, mat('#7a4a22'), 0, 0, 0, g);
      const str = mesh(cyl(0.006 * s, 0.006 * s, 2 * R * Math.sin(half), 3), mat('#eeeeee'), 0, 0, -R * (1 - Math.cos(half)), g);
      str.castShadow = false;
      break;
    }
    case 'staff': {
      mesh(cyl(0.03 * s, 0.035 * s, L), darkWood(), 0, 0, 0, g);
      const orb = mesh(sphere(0.09 * s), new THREE.MeshBasicMaterial({ color: '#ffb347' }), 0, L / 2 + 0.06 * s, 0, g);
      orb.castShadow = false;
      break;
    }
    case 'spear_hand': {
      mesh(cyl(0.025 * s, 0.025 * s, L), wood(), 0, c + L / 2, 0, g);
      mesh(cone(0.05 * s, 0.22 * s, 6), mat('#9c9c9c'), 0, c + L + 0.08 * s, 0, g);
      break;
    }
    case 'hay_hand': mesh(box(0.5 * s, 0.4 * s, 0.4 * s), mat('#e2c35a'), 0, 0, 0.25 * s, g); break;
    case 'potion_hand': {
      mesh(sphere(0.09 * s), mat('#7be05a', { emissive: '#1a5a10' }), 0, 0, 0.08 * s, g);
      mesh(cyl(0.03 * s, 0.03 * s, 0.1 * s), mat('#cfe8d0'), 0, 0.1 * s, 0.08 * s, g);
      break;
    }
    case 'bomb_hand': mesh(sphere(0.13 * s), mat('#222222'), 0, 0, 0.1 * s, g); break;
  }
  return g;
}

function buildShield(kind, s, team) {
  const g = new THREE.Group();
  if (kind === 'wood') {
    const m = mesh(box(0.06 * s, 0.85 * s, 0.6 * s), wood(), 0, 0, 0, g);
    for (const z of [-0.18, 0, 0.18]) mesh(box(0.065 * s, 0.86 * s, 0.025 * s), darkWood(), 0.002, 0, z * s, g);
    m.rotation.set(0, 0, 0);
  } else {
    const d = mesh(cyl(0.34 * s, 0.34 * s, 0.05 * s, 16), mat(TEAM_COLORS[team]), 0, 0, 0, g);
    d.rotation.z = Math.PI / 2;
    const rim = mesh(geo('rim' + s.toFixed(3), () => new THREE.TorusGeometry(0.34 * s, 0.03 * s, 5, 18)), metal(), 0, 0, 0, g);
    rim.rotation.y = Math.PI / 2;
    mesh(sphere(0.07 * s), metal(), 0.03 * s, 0, 0, g);
  }
  return g;
}

// ---------------------------------------------------------------- hats & extras
function buildHat(kind, r, team) {
  const g = new THREE.Group();
  const tc = TEAM_COLORS[team];
  switch (kind) {
    case 'headband': mesh(cyl(r * 1.02, r * 1.02, r * 0.25, 14), mat('#a0522d'), 0, r * 0.35, 0, g); break;
    case 'feather':
      mesh(cyl(r * 1.02, r * 1.02, r * 0.22, 14), mat('#a0522d'), 0, r * 0.35, 0, g);
      mesh(cone(r * 0.12, r * 0.9, 5), mat(tc), 0, r * 1.1, -r * 0.8, g).rotation.x = -0.4;
      break;
    case 'skullcap': {
      const sk = mesh(sphere(r * 0.75), mat('#efe8d6'), 0, r * 0.7, 0.05 * r, g); sk.scale.set(1, 0.6, 1.1);
      for (const x of [-0.3, 0.3]) mesh(sphere(r * 0.13), mat('#222'), x * r, r * 0.68, r * 0.6, g);
      break;
    }
    case 'antlers':
      mesh(cyl(r * 1.02, r * 1.02, r * 0.3, 14), mat(tc), 0, r * 0.35, 0, g);
      for (const sd of [-1, 1]) {
        const a = mesh(cyl(r * 0.07, r * 0.09, r * 1.4, 5), mat('#e9dcc0'), sd * r * 0.8, r * 1.1, 0, g);
        a.rotation.z = -sd * 0.6;
        const b = mesh(cyl(r * 0.05, r * 0.07, r * 0.7, 5), mat('#e9dcc0'), sd * r * 1.05, r * 1.5, r * 0.15, g);
        b.rotation.z = sd * 0.3;
      }
      break;
    case 'curls':
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        mesh(sphere(r * 0.32), mat('#7a4b26'), Math.cos(a) * r * 0.75, r * 0.55 + Math.sin(i * 2) * r * 0.1, Math.sin(a) * r * 0.75 - r * 0.2, g);
      }
      mesh(sphere(r * 0.45), mat('#7a4b26'), 0, r * 0.85, -r * 0.1, g);
      break;
    case 'straw':
      mesh(cyl(r * 1.9, r * 1.9, r * 0.06, 18), mat('#e8cf76'), 0, r * 0.45, 0, g);
      mesh(cyl(r * 0.8, r * 0.95, r * 0.5, 14), mat('#e8cf76'), 0, r * 0.7, 0, g);
      mesh(cyl(r * 0.96, r * 0.96, r * 0.12, 14), mat(tc), 0, r * 0.52, 0, g);
      break;
    case 'cap':
      { const c = mesh(sphere(r * 1.0), mat(tc), 0, r * 0.25, 0, g); c.scale.set(1.02, 0.65, 1.02); }
      mesh(box(r * 1.1, r * 0.06, r * 0.8), mat(tc), 0, r * 0.35, r * 0.85, g);
      break;
    case 'hood': case 'hood_green': case 'nun': {
      const col = kind === 'hood_green' ? '#4e7a2e' : kind === 'nun' ? '#f4f4f4' : '#5a3e78';
      const h = mesh(sphere(r * 1.12), mat(col), 0, r * 0.1, -r * 0.12, g); h.scale.set(1, 1.05, 1);
      if (kind !== 'nun') mesh(cone(r * 0.5, r * 0.8, 8), mat(col), 0, r * 0.75, -r * 0.65, g).rotation.x = -1.0;
      else mesh(box(r * 1.6, r * 0.25, r * 0.1), mat(tc), 0, r * 0.55, r * 0.75, g);
      break;
    }
    case 'feathercap':
      { const c = mesh(sphere(r * 0.95), mat(tc), 0, r * 0.35, 0, g); c.scale.set(1.1, 0.5, 1.1); }
      mesh(cone(r * 0.1, r * 1.3, 5), mat('#ffd34a'), r * 0.5, r * 1.0, -r * 0.4, g).rotation.set(-0.6, 0, -0.5);
      break;
    case 'cap_metal':
      { const c = mesh(sphere(r * 1.04), metal(), 0, r * 0.15, 0, g); c.scale.set(1, 0.85, 1); }
      mesh(cyl(r * 1.1, r * 1.1, r * 0.08, 14), metal(), 0, r * 0.15, 0, g);
      break;
    case 'helm_knight': {
      const c = mesh(cyl(r * 1.06, r * 1.06, r * 1.6, 14), metal(), 0, r * 0.15, 0, g);
      mesh(box(r * 1.2, r * 0.12, r * 0.2), mat('#222'), 0, r * 0.15, r * 1.0, g);
      mesh(cone(r * 0.25, r * 0.8, 6), mat(tc), 0, r * 1.2, 0, g);
      g.userData.hidesFace = true;
      break;
    }
    case 'crown':
      mesh(cyl(r * 0.85, r * 0.8, r * 0.45, 12), gold(), 0, r * 0.95, 0, g);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        mesh(cone(r * 0.13, r * 0.35, 4), gold(), Math.cos(a) * r * 0.78, r * 1.3, Math.sin(a) * r * 0.78, g);
      }
      mesh(sphere(r * 0.11), mat('#d0203a'), 0, r * 0.95, r * 0.85, g);
      break;
    case 'viking':
      { const c = mesh(sphere(r * 1.05), metal(), 0, r * 0.2, 0, g); c.scale.set(1, 0.75, 1); }
      for (const sd of [-1, 1]) {
        const h = mesh(cone(r * 0.18, r * 0.9, 8), mat('#f2ead2'), sd * r * 1.0, r * 0.75, 0, g);
        h.rotation.z = -sd * 0.9;
      }
      break;
    case 'goggles':
      mesh(cyl(r * 1.02, r * 1.02, r * 0.18, 14), mat('#3a2a1a'), 0, r * 0.3, 0, g);
      for (const x of [-0.35, 0.35]) {
        const l = mesh(cyl(r * 0.24, r * 0.24, r * 0.2, 10), mat('#6fd0ff', { emissive: '#103040' }), x * r, r * 0.32, r * 0.92, g);
        l.rotation.x = Math.PI / 2;
      }
      break;
    case 'wizard':
      mesh(cyl(r * 1.7, r * 1.7, r * 0.06, 18), mat('#2b3c9a'), 0, r * 0.5, 0, g);
      { const c = mesh(cone(r * 0.85, r * 2.0, 12), mat('#2b3c9a'), 0, r * 1.5, -r * 0.1, g); c.rotation.x = -0.15; }
      mesh(sphere(r * 0.12), mat('#ffe14a', { emissive: '#5a4a00' }), r * 0.3, r * 1.0, r * 0.6, g);
      break;
  }
  return g;
}

// ---------------------------------------------------------------- whole unit
// Returns { parts: Group[], root: Group, face, items, skel }
export function buildUnitVisual(def, team, opts = {}) {
  initFaces();
  const skel = opts.skel || makeSkeleton(def.build);
  const s = skel.scale;
  const look = def.look;
  const root = new THREE.Group();
  const parts = [];
  const tc = TEAM_COLORS[team], td = TEAM_DARK[team];
  const skin = mat(look.skin || '#f2c8a0');
  const top = look.top;
  const chestMat = top === 'armor' ? metal() : top === 'robe_white' ? mat('#f4f4f4') : mat(tc);
  const legMat = look.legs ? mat(look.legs) : mat(td);
  const sleeve = look.bare ? skin : chestMat;
  for (let i = 0; i < NPARTS; i++) {
    const p = skel.parts[i];
    const g = new THREE.Group();
    g.name = p.name;
    parts.push(g);
    root.add(g);
    const len = p.hh * 2;
    switch (i) {
      case PART.pelvis: {
        const m = mesh(sphere(p.r), top === 'robe' || top === 'robe_white' || top === 'robe_blue' ? chestMat : legMat, 0, 0, 0, g);
        m.scale.set(1.05, 0.95, 1);
        if (top === 'loincloth') mesh(box(p.r * 1.3, p.r * 1.2, p.r * 2.1), mat('#7a5a3a'), 0, -p.r * 0.5, 0, g);
        if (top === 'robe' || top === 'robe_white' || top === 'robe_blue') {
          mesh(cyl(p.r * 1.05, p.r * 1.45, p.r * 2.2, 12), top === 'robe_white' ? chestMat : top === 'robe_blue' ? mat('#2b3c9a') : mat(td), 0, -p.r * 0.9, 0, g);
        }
        break;
      }
      case PART.chest: {
        const m = mesh(capsule(p.r, len), chestMat, 0, 0, 0, g);
        m.scale.set(1, 1, 0.92);
        const r = p.r;
        if (top === 'fur' || top === 'bare_belt') {
          if (look.bare) { m.material = skin; }
          mesh(cyl(r * 1.02, r * 1.02, r * 0.35, 14), mat(tc), 0, -len * 0.5 - r * 0.25, 0, g);
          if (top === 'fur') {
            const f = mesh(sphere(r * 1.03), mat('#a8794a'), 0, len * 0.3, 0, g); f.scale.set(1, 0.6, 1);
            const st = mesh(box(r * 0.5, len + r * 1.4, r * 2.06), mat(tc), r * 0.35, 0, 0, g); st.rotation.z = 0.5;
          } else {
            const st = mesh(box(r * 0.25, len + r * 1.6, r * 2.06), mat('#5a3a20'), 0, 0, 0, g); st.rotation.z = 0.6;
          }
        } else if (top === 'loincloth') {
          m.material = skin;
          mesh(cyl(r * 1.02, r * 1.02, r * 0.3, 14), mat(tc), 0, -len * 0.5 - r * 0.2, 0, g);
        } else if (top === 'armor') {
          mesh(box(r * 1.2, len + r * 1.2, r * 0.3), mat(tc), 0, -r * 0.1, r * 0.82, g);
          mesh(sphere(r * 0.45), metal(), r * 1.0, len * 0.5 + r * 0.3, 0, g).scale.set(1, 0.7, 1);
          mesh(sphere(r * 0.45), metal(), -r * 1.0, len * 0.5 + r * 0.3, 0, g).scale.set(1, 0.7, 1);
        } else if (top === 'royal') {
          mesh(cyl(r * 1.03, r * 1.03, r * 0.25, 14), gold(), 0, -len * 0.5 - r * 0.2, 0, g);
          mesh(box(r * 0.3, len + r * 1.8, r * 0.06), mat('#f5f0e0'), 0, 0, r * 0.95, g);
          const coll = mesh(cyl(r * 0.85, r * 0.95, r * 0.3, 14), mat('#f5f0e0'), 0, len * 0.5 + r * 0.6, 0, g);
          coll.castShadow = false;
        } else if (top === 'overalls') {
          mesh(box(r * 1.3, len + r * 0.6, r * 0.2), mat('#8a6a45'), 0, -r * 0.3, r * 0.85, g);
          for (const x of [-0.45, 0.45]) mesh(box(r * 0.15, len + r * 1.6, r * 2.04), mat('#8a6a45'), x * r, 0, 0, g);
        } else if (top === 'vest') {
          mesh(box(r * 0.8, len + r, r * 0.12), mat('#f3e6c8'), 0, 0, r * 0.88, g);
        } else if (top === 'apron') {
          mesh(box(r * 1.4, len + r * 1.4, r * 0.15), mat('#6a4a2a'), 0, -r * 0.3, r * 0.86, g);
        } else if (top === 'tunic' || top === 'robe' || top === 'robe_blue') {
          mesh(cyl(r * 1.03, r * 1.03, r * 0.22, 14), mat('#5a3a20'), 0, -len * 0.5 - r * 0.15, 0, g);
          if (top === 'robe_blue') m.material = mat('#2b3c9a');
          if (top !== 'tunic') mesh(box(r * 0.4, len + r * 1.6, r * 0.05), mat(tc), 0, 0, r * 0.94, g);
        } else if (top === 'robe_white') {
          mesh(box(r * 0.25, len + r * 1.2, r * 0.05), mat('#e33'), 0, 0, r * 0.96, g);
          mesh(box(r * 0.9, r * 0.25, r * 0.05), mat('#e33'), 0, len * 0.2, r * 0.96, g);
          mesh(cyl(r * 1.03, r * 1.03, r * 0.22, 14), mat(tc), 0, -len * 0.5 - r * 0.15, 0, g);
        }
        if (look.cape) {
          const cp = mesh(box(r * 2.0, len + r * 2.6, r * 0.08), mat(td), 0, -r * 0.5, -r * 0.95, g);
          cp.rotation.x = 0.12;
        }
        if (look.quiver) {
          const q = mesh(cyl(r * 0.22, r * 0.18, len + r * 1.4, 8), mat('#6a4020'), r * 0.4, r * 0.2, -r * 1.0, g);
          q.rotation.z = 0.5;
        }
        if (look.paint) {
          for (const x of [-0.5, 0.5]) mesh(box(r * 0.15, r * 0.7, r * 0.04), mat('#f4f4f4'), x * r, len * 0.2, r * 0.97, g);
        }
        break;
      }
      case PART.head: {
        const r = p.r;
        mesh(sphere(r), skin, 0, 0, 0, g);
        const hat = buildHat(look.hat, r, team);
        g.add(hat);
        if (!hat.userData.hidesFace) {
          const f = new THREE.Mesh(faceGeo(r), FACE_MATS[0]);
          f.castShadow = false;
          g.add(f);
          g.userData.face = f;
        }
        if (look.beard) {
          const b = mesh(sphere(r * 0.62), mat(look.beard), 0, -r * 0.55, r * 0.55, g);
          b.scale.set(1.1, 1.0, 0.7);
        }
        if (look.brow) {
          const b = mesh(box(r * 1.5, r * 0.25, r * 0.5), skin, 0, r * 0.38, r * 0.75, g);
          b.rotation.x = -0.3;
        }
        // nose
        mesh(sphere(r * 0.16), skin, 0, -r * 0.08, r * 0.98, g);
        break;
      }
      case PART.thighL: case PART.thighR:
        mesh(capsule(p.r, len), legMat, 0, 0, 0, g);
        break;
      case PART.shinL: case PART.shinR: {
        mesh(capsule(p.r, len), legMat, 0, 0, 0, g);
        const boot = mesh(sphere(p.r * 1.25), mat(look.bare ? '#7a5a3a' : '#3a2a1e'), 0, -len * 0.5, p.r * 0.45, g);
        boot.scale.set(1, 0.8, 1.45);
        break;
      }
      case PART.uarmL: case PART.uarmR:
        mesh(capsule(p.r, len), top === 'armor' ? metal() : sleeve, 0, 0, 0, g);
        break;
      case PART.farmL: case PART.farmR:
        mesh(capsule(p.r, len), top === 'armor' ? metal() : look.bare || top === 'vest' || top === 'overalls' || top === 'apron' ? skin : sleeve, 0, 0, 0, g);
        mesh(sphere(p.r * 1.35), top === 'armor' ? metal() : skin, 0, -len * 0.5 - p.r * 0.3, 0, g);
        break;
    }
  }
  // weapons
  const items = [];
  const w = def.weapon;
  const mount = (name, part) => {
    const it = ITEMS[name];
    if (!it || name === 'none') return;
    const obj = buildItem(name, s, team);
    obj.position.set(0, -skel.handOffset, 0);
    obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), gripDir(it, new THREE.Vector3()));
    parts[part].add(obj);
    items.push(obj);
  };
  if (w.style === 'dual') { mount(w.item, PART.farmL); mount(w.item2 || w.item, PART.farmR); }
  else if (w.item) mount(w.item, w.style === 'bow' ? PART.farmL : PART.farmR);
  if (w.shield) {
    const sh = buildShield(w.shield, s, team);
    sh.position.set(skel.parts[PART.farmL].r * 1.6, 0, 0);
    parts[PART.farmL].add(sh);
  }
  // Merge each part's static meshes (and each held item) into one vertex-coloured mesh.
  if (!opts.noBake) {
    root.updateMatrixWorld(true);
    for (const g of parts) {
      for (const it of [...g.children]) if (items.includes(it)) bake(it, it);
      bake(g, g, (o) => o !== g.userData.face && !items.some((it) => isDesc(o, it)));
    }
  }
  if (opts.ghost) {
    const gm = new THREE.MeshBasicMaterial({ color: opts.ghostColor || tc, transparent: true, opacity: 0.45, depthWrite: false });
    root.traverse((o) => { if (o.isMesh) { o.material = gm; o.castShadow = false; } });
    root.userData.ghostMat = gm;
  }
  return { root, parts, items, skel, face: parts[PART.head].userData.face || null, expr: 0 };
}

const BAKED = new THREE.MeshLambertMaterial({ vertexColors: true });
function isDesc(o, anc) { for (let p = o; p; p = p.parent) if (p === anc) return true; return false; }
// Replace the meshes under `node` (filtered) with a single merged mesh added to `node`.
function bake(node, frame, filter = () => true) {
  const meshes = [];
  node.traverse((o) => { if (o.isMesh && o !== node && filter(o)) meshes.push(o); });
  if (meshes.length < 2) return;
  const inv = new THREE.Matrix4().copy(frame.matrixWorld).invert();
  let nv = 0, ni = 0;
  for (const m of meshes) { nv += m.geometry.attributes.position.count; ni += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
  const idx = new Uint32Array(ni);
  let vo = 0, io = 0;
  const mtx = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new THREE.Vector3(), c = new THREE.Color();
  for (const m of meshes) {
    mtx.multiplyMatrices(inv, m.matrixWorld);
    nm.getNormalMatrix(mtx);
    const g = m.geometry, P = g.attributes.position, N = g.attributes.normal;
    c.copy(m.material.color || c.set('#ffffff'));
    if (m.material.emissive) c.add(m.material.emissive);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(mtx);
      pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      nor[(vo + i) * 3] = v.x; nor[(vo + i) * 3 + 1] = v.y; nor[(vo + i) * 3 + 2] = v.z;
      col[(vo + i) * 3] = c.r; col[(vo + i) * 3 + 1] = c.g; col[(vo + i) * 3 + 2] = c.b;
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.array[i] + vo;
    else for (let i = 0; i < P.count; i++) idx[io++] = vo + i;
    vo += P.count;
    m.parent.remove(m);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  geo.userData.own = true;
  const merged = new THREE.Mesh(geo, BAKED);
  merged.castShadow = true;
  node.add(merged);
  // drop now-empty groups
  node.traverse((o) => { if (o !== node && o.isGroup && !o.children.length) o.userData.empty = true; });
}

export function disposeVisual(vis) {
  vis.root.parent?.remove(vis.root);
  vis.root.traverse((o) => { if (o.isMesh && o.geometry.userData.own) o.geometry.dispose(); });
}

export function setExpression(vis, e) {
  if (vis.expr === e || !vis.face) return;
  vis.expr = e;
  vis.face.material = FACE_MATS[e];
}

// Pose a visual without physics (setup screen, portraits, title).
const _pose = newPose();
const _pos = Array.from({ length: NPARTS }, () => new THREE.Vector3());
const _yq = new THREE.Quaternion();
const _wq = new THREE.Quaternion();
const _pp = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
export function poseVisual(vis, x, y, z, yaw, st) {
  computePose(st, _pose);
  _pp.set(0, vis.skel.standHeight + (st.bob || 0), 0);
  forwardKinematics(vis.skel, _pp, _pose, _pos);
  _yq.setFromAxisAngle(UP, yaw);
  for (let i = 0; i < NPARTS; i++) {
    const g = vis.parts[i];
    g.position.copy(_pos[i]).applyQuaternion(_yq);
    g.position.x += x; g.position.y += y; g.position.z += z;
    g.quaternion.copy(_yq).multiply(_pose[i]);
  }
}

// ---------------------------------------------------------------- portraits
export function renderPortraits(defs, size = 128) {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(size, size);
  r.setPixelRatio(1);
  r.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#806a50', 2.2));
  const dl = new THREE.DirectionalLight('#ffffff', 1.6);
  dl.position.set(2, 3, 4);
  scene.add(dl);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const out = {};
  for (const def of defs) {
    for (const team of [0, 1]) {
      const vis = buildUnitVisual(def, team);
      const st = { phase: 0, amp: 0, style: def.weapon.style, attack: null, attackT: 0, headPitch: 0, headYaw: 0.2, mode: 'normal', t: 0 };
      poseVisual(vis, 0, 0, 0, 0.5, st);
      setExpression(vis, 1);
      scene.add(vis.root);
      const hgt = vis.skel.height;
      const box3 = new THREE.Box3().setFromObject(vis.root);
      const ctr = box3.getCenter(new THREE.Vector3());
      const ext = box3.getSize(new THREE.Vector3());
      const d = Math.max(ext.y, ext.x * 1.1) / (2 * Math.tan((15 * Math.PI) / 180)) * 1.02;
      cam.position.set(ctr.x + d * 0.25, ctr.y + hgt * 0.06, ctr.z + d);
      cam.lookAt(ctr);
      r.render(scene, cam);
      out[def.id + ':' + team] = r.domElement.toDataURL();
      scene.remove(vis.root);
    }
  }
  r.dispose();
  r.forceContextLoss?.();
  return out;
}
