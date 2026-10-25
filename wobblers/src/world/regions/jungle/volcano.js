// The volcano: a spiral trail (terrain road flats from jungle.js prepare) up
// to the rim, stairs over the rim down to a viewing ledge inside the crater,
// a glowing lava lake that flings anything touching it high out of the crater
// (no harm done, just a lot of "HOT HOT HOT!"), smoke puffs, and a long zip
// line from a launch deck on the trail down to the river treehouse.
import * as THREE from 'three';
import { LAVA, VOLCANO, TRAIL } from '../jungle.js';
import { zipLine, climb } from './rides.js';
import { puffTexture } from './river.js';
import { tone } from '../../common.js';

const POST = 0x6b4a2a, PLANK = 0x9a6a3a;

function lavaTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#ff4a12'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, r = 6 + Math.random() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const c = Math.random() < 0.5 ? '255,214,64' : '255,140,30';
    gr.addColorStop(0, `rgba(${c},0.95)`); gr.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 26; i++) { g.fillStyle = 'rgba(90,20,10,0.55)'; g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 256, 8 + Math.random() * 18, 4 + Math.random() * 8, Math.random() * 3, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildVolcano(game, kit, R) {
  const L = new R.Local(kit, 0, 0, 0);
  const { x: cx, z: cz } = LAVA;
  // ---- lava lake -----------------------------------------------------------------
  const tex = lavaTexture(); tex.repeat.set(3, 3);
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff, fog: true });
  const lake = new THREE.Mesh(new THREE.CircleGeometry(LAVA.r + 3, 28).rotateX(-Math.PI / 2), mat);
  lake.position.set(cx, LAVA.y, cz); lake.userData.noCull = true;
  game.scene.add(lake);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
  const glow = new THREE.Mesh(new THREE.CircleGeometry(LAVA.r + 3, 24).rotateX(-Math.PI / 2), glowMat);
  glow.position.set(cx, LAVA.y + 0.25, cz); glow.userData.noCull = true; glow.renderOrder = 3;
  game.scene.add(glow);
  // bubbling blobs
  const blobs = [];
  const bm = new THREE.MeshBasicMaterial({ color: 0xffd040 });
  for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), bm); m.userData.noCull = true; game.scene.add(m); blobs.push({ m, t: Math.random() * 3, x: 0, z: 0 }); }
  // smoke column
  const smokeMat = new THREE.SpriteMaterial({ map: puffTexture(), color: 0x8a8580, transparent: true, opacity: 0.5, depthWrite: false, fog: false });
  const puffs = [];
  for (let i = 0; i < 12; i++) { const s = new THREE.Sprite(smokeMat.clone()); s.userData.noCull = true; game.scene.add(s); puffs.push(s); }
  game.updaters.push((dt, t) => {
    tex.offset.set(t * 0.01, t * 0.013);
    tex.rotation = t * 0.01;
    glowMat.opacity = 0.25 + 0.15 * Math.sin(t * 1.7);
    for (const b of blobs) {
      b.t -= dt;
      if (b.t < 0) { b.t = 1.2 + Math.random() * 2; const a = Math.random() * 6.28, r = Math.random() * LAVA.r * 0.85; b.x = cx + Math.cos(a) * r; b.z = cz + Math.sin(a) * r; }
      const k = Math.max(0, Math.sin(b.t / 1.2 * Math.PI));
      b.m.position.set(b.x, LAVA.y - 0.3 + k * 0.5, b.z); b.m.scale.setScalar(0.3 + k);
    }
    puffs.forEach((s, i) => {
      const k = (t * 0.045 + i / puffs.length) % 1;
      s.position.set(cx + Math.sin(i * 2.3 + t * 0.1) * 4 + k * 18, LAVA.y + 6 + k * 70, cz + Math.cos(i * 1.9) * 4 - k * 10);
      s.scale.setScalar(8 + k * 26);
      s.material.opacity = 0.55 * (1 - k) * Math.min(1, k * 6);
    });
  });
  // ---- the lava flings you ----------------------------------------------------------
  const cool = new Map();
  const fling = (bodies, mass, x, z, who) => {
    let ox = x - cx, oz = z - cz; const l = Math.hypot(ox, oz) || 1; ox /= l; oz /= l;
    const a = Math.atan2(oz, ox) + (Math.random() - 0.5) * 0.8;
    const v = { x: Math.cos(a) * 7.5, y: 21 + Math.random() * 3, z: Math.sin(a) * 7.5 };
    for (const b of bodies) b.setLinvel(v, true);
    game.audio?.play('boing', { x, y: LAVA.y, z }, 1);
    tone(game, { x, y: LAVA.y, z }, 180, 900, 0.5, 0.25, 'sawtooth');
    void mass; void who;
  };
  game.steppers.push(() => {
    for (const p of game.players) {
      const t = p.hips.translation();
      if (t.y > LAVA.y + 1.0 || Math.hypot(t.x - cx, t.z - cz) > LAVA.r + 2.5) continue;
      if ((cool.get(p) || 0) > game.physics.time) continue;
      cool.set(p, game.physics.time + 0.8);
      if (p.seat) p.leaveSeat();
      p.knockOut(1.6);
      fling(p.bodies, 0, t.x, t.z);
      p.say?.('HOT HOT HOT!');
      game.ui?.toast?.(`P${p.index + 1}: HOT HOT HOT!`, p.color);
    }
    for (const o of game.physics.objects) {
      if (!o.body.isDynamic()) continue;
      const t = o.body.translation();
      if (t.y > LAVA.y + 1.2 || Math.abs(t.x - cx) > LAVA.r + 2.5 || Math.abs(t.z - cz) > LAVA.r + 2.5 || Math.hypot(t.x - cx, t.z - cz) > LAVA.r + 2.5) continue;
      if ((cool.get(o) || 0) > game.physics.time) continue;
      cool.set(o, game.physics.time + 0.8);
      fling([o.body], 0, t.x, t.z);
    }
    for (const v of game.vehicles) {
      const t = v.body.translation();
      if (t.y > LAVA.y + 1.5 || Math.hypot(t.x - cx, t.z - cz) > LAVA.r + 2.5) continue;
      if ((cool.get(v) || 0) > game.physics.time) continue;
      cool.set(v, game.physics.time + 0.8);
      fling([v.body], 0, t.x, t.z);
    }
  });
  game.lava = { ...LAVA, cool };

  // ---- trail furniture: start sign, marker posts, the rim stairs and viewing ledge -----
  const [sx, sz] = TRAIL[0];
  const gs = R.groundAt(sx, sz);
  R.sign('VOLCANO TRAIL', sx + 4, gs + 2.5, sz - 3, Math.PI * 0.85, 4.4, '#7a4a2a', '#fff4c2');
  kit.cyl(sx + 4 - 1.7, gs + 1.2, sz - 3 - 0.5, 0.1, 2.4, POST); kit.cyl(sx + 4 + 1.7, gs + 1.2, sz - 3 + 0.6, 0.1, 2.4, POST);
  for (let i = 1; i < TRAIL.length - 1; i += 2) {
    const [ax, az] = TRAIL[i], [bx, bz] = TRAIL[i + 1], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
    const ox = dz / l * 3.3, oz = -dx / l * 3.3;
    for (const s of [-1, 1]) { const x = ax + ox * s, z = az + oz * s; const g = R.groundAt(x, z); kit.cyl(x, g + 0.6, z, 0.1, 1.2, POST, { seg: 5 }); kit.deco(x, g + 1.25, z, 0.22, 0.12, 0.22, i % 4 ? 0xffd23f : 0xff5a3a); }
  }
  R.coins(...TRAIL[6], null, 'line', 5, 8, { yaw: Math.atan2(TRAIL[7][1] - TRAIL[6][1], TRAIL[7][0] - TRAIL[6][0]) });
  R.coins(...TRAIL[12], null, 'line', 5, 8, { yaw: Math.atan2(TRAIL[13][1] - TRAIL[12][1], TRAIL[13][0] - TRAIL[12][0]) });
  R.coins(...TRAIL[18], null, 'line', 5, 8, { yaw: Math.atan2(TRAIL[19][1] - TRAIL[18][1], TRAIL[19][0] - TRAIL[18][0]) });
  // rim stairs: from the trail's end straight toward the crater, over the rim and down
  const [ex, ez] = TRAIL[TRAIL.length - 1];
  let ux = cx - ex, uz = cz - ez; { const l = Math.hypot(ux, uz); ux /= l; uz /= l; }
  const r0 = Math.hypot(ex - cx, ez - cz);
  const ledgeR = LAVA.r + 4.5;
  const pts = [];
  for (let d = 0; d <= r0 - ledgeR + 0.01; d += 2) { const x = ex + ux * d, z = ez + uz * d; pts.push([x, z, R.groundAt(x, z) + 0.35]); }
  let peak = 0; pts.forEach((p, i) => { if (p[2] > pts[peak][2]) peak = i; });
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az, ay] = pts[i], [bx, bz, by] = pts[i + 1];
    if (Math.abs(by - ay) < 0.25) { kit.box((ax + bx) / 2, (ay + by) / 2 - 0.12, (az + bz) / 2, 1.8, 0.24, 2.05, PLANK, { yaw: Math.atan2(ux, uz) }); continue; }
    if (by > ay) L.stairs(ax, az, ay, bx, bz, by, 1.8, PLANK, 0x8a5a36); else L.stairs(bx, bz, by, ax, az, ay, 1.8, PLANK, 0x8a5a36);
  }
  // rope rails on the inside part
  for (let i = peak; i < pts.length - 1; i++) for (const s of [-1, 1]) {
    const [ax, az, ay] = pts[i], [bx, bz, by] = pts[i + 1], px = uz * s * 1.0, pz = -ux * s * 1.0;
    kit.cyl(ax + px, ay + 0.55, az + pz, 0.06, 1.1, POST, { seg: 5, collide: false });
    kit.deco((ax + bx) / 2 + px, (ay + by) / 2 + 1.05, (az + bz) / 2 + pz, 0.05, 0.05, 2.1, 0xd9c08a, { euler: [-Math.atan2(by - ay, 2), Math.atan2(ux, uz), 0] });
    L.solid((ax + bx) / 2 + px, (ay + by) / 2 + 0.6, (az + bz) / 2 + pz, 0.08, 1.2, 2.05, { yaw: Math.atan2(ux, uz) });
  }
  // the viewing ledge over the lava
  const lx = cx - ux * ledgeR, lz = cz - uz * ledgeR, ly = pts[pts.length - 1][2];
  kit.box(lx + ux * 1.2, ly - 0.15, lz + uz * 1.2, 4, 0.3, 4.4, PLANK, { yaw: Math.atan2(ux, uz) });
  const LL = new R.Local(kit, lx + ux * 1.2, lz + uz * 1.2, Math.atan2(ux, uz), ly);
  LL.rail(-2, 2.2, -0.6, 2.2, 0, 1.0, POST); LL.rail(0.6, 2.2, 2, 2.2, 0, 1.0, POST);
  // a gangway out over the crater, then a ladder down to a little platform just above the lava
  const yawU = Math.atan2(ux, uz);
  { const q = LL.v3(0, 0, 3.75); kit.box(q.x, ly - 0.15, q.z, 1.6, 0.3, 3.1, PLANK, { yaw: yawU }); }
  LL.rail(-0.8, 2.2, -0.8, 5.3, 0, 1.0, POST); LL.rail(0.8, 2.2, 0.8, 5.3, 0, 1.0, POST);
  const low = LAVA.y + 2.2, pl = LL.v3(0, 0, 6.6);
  kit.box(pl.x, low - 0.15, pl.z, 2.6, 0.3, 2.6, PLANK, { yaw: yawU });
  for (const [a, b] of [[-1.1, 5.5], [1.1, 5.5], [-1.1, 7.7], [1.1, 7.7]]) { const q = LL.v3(a, 0, b); const g = R.groundAt(q.x, q.z); if (low - g > 0.3) kit.cyl(q.x, (low + g) / 2, q.z, 0.12, low - g, POST, { seg: 5 }); }
  const lad = LL.v3(0, 0, 5.45);
  climb(game, kit, lad.x, lad.z, low, ly, -ux, -uz, POST);
  R.coins(pl.x, pl.z, low + 1.5, 'one', 1, 0, { big: true }); LL.rail(-2, -0.5, -2, 2.2, 0, 1.0, POST); LL.rail(2, -0.5, 2, 2.2, 0, 1.0, POST);
  for (const s of [-1, 1]) { const p = LL.v3(s * 1.9, 0, -2.4); const g = R.groundAt(p.x, p.z); if (ly - g > 0.5) kit.cyl(p.x, (ly + g) / 2, p.z, 0.15, ly - g, POST, { seg: 6 }); }
  const hot = LL.v3(0, 1.9, 2.25);
  R.sign('HOT LAVA', hot.x, hot.y, hot.z, Math.atan2(ux, uz) + Math.PI, 3.2, '#e8501a', '#ffffff');
  const pr = LL.v3(-1.2, 0, 0.4);
  R.present('jungle-volcano', 'hat:tikimask', pr.x, pr.z, ly + 1.5, 'on the viewing ledge inside the volcano crater');
  R.coins(cx, cz, null, 'ring', 8, LAVA.r * 0.6, { y: LAVA.y + 9 }); // floating over the lava: get flung through them
  R.coins(cx, cz, null, 'one', 1, 0, { big: true, y: LAVA.y + 16 });

  // ---- zip line from a launch deck on the trail to the river treehouse --------------------
  let best = 0, bd = 1e9;
  TRAIL.forEach(([x, z], i) => { const d = Math.hypot(x - (-640), z - 905); if (d < bd) { bd = d; best = i; } });
  const [zx, zz] = TRAIL[best];
  const T4 = { x: -462, z: 866 };
  let dx = T4.x - zx, dz = T4.z - zz; { const l = Math.hypot(dx, dz); dx /= l; dz /= l; }
  const zy = R.groundAt(zx, zz) + 0.3;
  const dkx = zx + dx * 5.5, dkz = zz + dz * 5.5;
  kit.box(dkx, zy - 0.15, dkz, 3.4, 0.3, 5, PLANK, { yaw: Math.atan2(dx, dz) });
  for (const [a, b] of [[-1.5, -2.2], [1.5, -2.2], [-1.5, 2.2], [1.5, 2.2]]) {
    const x = dkx + dz * a + dx * b, z = dkz - dx * a + dz * b, g = R.groundAt(x, z);
    if (zy - g > 0.4) kit.cyl(x, (zy + g) / 2 - 0.2, z, 0.16, zy - g + 0.4, POST, { seg: 6 });
  }
  const t4y = Math.max(R.groundAt(T4.x, T4.z) + 9.5, 14);
  const zl = zipLine(game, kit, { x: dkx + dx * 1.4, y: zy, z: dkz + dz * 1.4 }, { x: T4.x - dx * 2.6, y: t4y, z: T4.z - dz * 2.6 }, { name: 'volcano', endPost: false, color: 0xff5a3a });
  (game.jungleZips ||= []).push(zl);
  const sgn = { x: dkx - dz * 2.2, z: dkz + dx * 2.2 };
  R.sign('ZIP LINE', sgn.x, zy + 2.2, sgn.z, Math.atan2(dx, dz) + Math.PI, 3.2, '#d9534f', '#ffffff');
  kit.cyl(sgn.x, zy + 0.9, sgn.z, 0.09, 1.8, POST);
  R.npc('guide', TRAIL[0][0] + 2, TRAIL[0][1] + 4, { yaw: Math.PI, lines: ['Up we go! Mind the lava.', 'Zip line halfway up!', 'Best view on the island.'] });
  void VOLCANO;
}
