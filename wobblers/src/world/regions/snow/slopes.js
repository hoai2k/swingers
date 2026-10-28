// Slippery snow and ice: the groomed piste, the ski-jump in-run and kicker and
// the frozen lake are thin slippery overlays on the terrain (physics.slippery:
// zero friction, the player slides down slopes, see player.js). A stepper adds
// the skiing feel on top: carve toward the stick, snow-plough to brake, a
// speed limit (higher on the jump), and skating pushes on the ice.
import * as THREE from 'three';
import { DT } from '../../../config.js';
import { LAKE, JUMP, PISTE_W, pisteLine } from './layout.js';

// collider handle -> 'piste' | 'jump' | 'ice'
export const snowSurfaces = new Map();

// A strip following the ground along a polyline [[x, z], ...] (resampled every
// ~2 m), `w` wide, `lift` above the terrain mesh. Static, slippery, split in
// pieces of ~30 m so each lands in its own kit chunk.
export function snowStrip(game, kit, R, line, w, kind, color, lift = 0.09) {
  // resample
  const pts = [];
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 2));
    for (let k = 0; k < n; k++) pts.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
  }
  pts.push(line[line.length - 1]);
  const cols = Math.max(2, Math.round(w / 2)) + 1;
  const rows = pts.map(([x, z], i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const nx = -tz, nz = tx, row = [];
    for (let c = 0; c < cols; c++) {
      const o = (c / (cols - 1) - 0.5) * w, px = x + nx * o, pz = z + nz * o;
      // lift the edges a touch less so the strip hugs the ground
      row.push([px, R.groundAt(px, pz) + lift * (c === 0 || c === cols - 1 ? 0.6 : 1), pz]);
    }
    return row;
  });
  const PIECE = 15;
  for (let r0 = 0; r0 < rows.length - 1; r0 += PIECE) {
    const r1 = Math.min(rows.length - 1, r0 + PIECE);
    const verts = [], idx = [];
    for (let r = r0; r <= r1; r++) for (const v of rows[r]) verts.push(...v);
    for (let r = 0; r < r1 - r0; r++) for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mid = rows[Math.floor((r0 + r1) / 2)][Math.floor(cols / 2)];
    kit.b(mid[0], mid[2]).add(g, color);
    const col = kit.phys.trimesh(new Float32Array(verts), new Uint32Array(idx), { slippery: true });
    snowSurfaces.set(col.handle, kind);
  }
  return rows;
}

export function buildSlopes(game, kit, R) {
  // ---- the groomed blue run
  const pl = pisteLine();
  const rows = snowStrip(game, kit, R, pl.map(([x, z]) => [x, z]), PISTE_W, 'piste', 0xf3f8ff, 0.22);
  // marker poles along both edges (blue run), every ~16 m
  for (let i = 4; i < rows.length - 4; i += 8) {
    for (const c of [0, rows[i].length - 1]) {
      const [x, y, z] = rows[i][c];
      kit.cyl(x, y + 0.9, z, 0.05, 1.8, 0x2a62c9, { collide: false, seg: 5 });
      kit.cyl(x, y + 1.65, z, 0.055, 0.25, 0xff8a3d, { collide: false, seg: 5 });
    }
  }
  // safety nets on the outside of the two hairpins
  for (const [x, z, yaw] of [[112, -963, Math.PI / 2], [-22, -888, -0.6]]) {
    const y = R.groundAt(x, z);
    for (let k = -2; k <= 2; k++) {
      const px = x + Math.sin(yaw) * k * 2.4 * 0 + Math.cos(yaw) * k * 2.4, pz = z - Math.sin(yaw) * k * 2.4;
      kit.cyl(px, R.groundAt(px, pz) + 0.8, pz, 0.06, 1.6, 0x333a44, { collide: false, seg: 5 });
    }
    kit.box(x, y + 0.9, z, 10, 1.1, 0.08, 0xff7a2a, { yaw });
  }

  // ---- ski jump: in-run strip, kicker, start deck with a gate, steps up the side
  const J = JUMP;
  snowStrip(game, kit, R, [[J.x, J.zTop - 2], [J.x, J.zLip]], 4.6, 'jump', 0xeef6ff, 0.1);
  for (let z = J.zTop; z < J.zLip; z += 3) for (const s of [-1, 1]) { // in-run side boards
    const x = J.x + s * 2.6;
    kit.box(x, R.groundAt(x, z) + 0.3, z, 0.15, 0.6, 3.05, 0x2a62c9, { euler: [Math.atan2(J.yTop - J.yLip, J.zLip - J.zTop), 0, 0] });
  }
  const yl = R.groundAt(J.x, J.zLip);
  const prof = [[0, 0.1], [1.5, 0.22], [3, 0.5], [4.5, 0.85]];
  kit.profile(J.x, yl, J.zLip, 0, 4.6, prof, 0xe6f2ff, { side: 0x2a62c9, collide: false });
  { // its top surface as a slippery 'jump' collider
    const v = [], ix = [];
    for (const [lz, ly] of prof) v.push(J.x - 2.3, yl + ly, J.zLip + lz, J.x + 2.3, yl + ly, J.zLip + lz);
    for (let i = 0; i < prof.length - 1; i++) { const a = i * 2; ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    snowSurfaces.set(kit.phys.trimesh(new Float32Array(v), new Uint32Array(ix), { slippery: true }).handle, 'jump');
  }
  const yt = R.groundAt(J.x, J.zTop - 6);
  kit.box(J.x, yt + 0.2, J.zTop - 5, 7, 0.4, 6, 0x9a6a42);
  for (const s of [-1, 1]) kit.cyl(J.x + s * 2.6, yt + 1.8, J.zTop - 2.4, 0.1, 3.2, 0xff3a3a, { seg: 6 });
  kit.box(J.x, yt + 3.3, J.zTop - 2.4, 5.4, 0.5, 0.1, 0xffffff, { collide: false });
  R.sign('SKI JUMP', J.x + 6.5, R.groundAt(J.x + 6.5, J.zLip + 8) + 2.6, J.zLip + 8, 0, 5, '#2a62c9', '#ffffff');
  kit.cyl(J.x + 6.5, R.groundAt(J.x + 6.5, J.zLip + 8) + 1.1, J.zLip + 8.1, 0.08, 2.2, 0x7a5032, { seg: 6 });
  // steps up the east side of the in-run
  {
    const sx = J.x + 4.4, n = 46, z0 = J.zLip + 2, z1 = J.zTop - 3;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, z = z0 + (z1 - z0) * t, gy = R.groundAt(sx, z);
      const top = R.groundAt(sx, z0) + (R.groundAt(sx, z1) - R.groundAt(sx, z0)) * ((i + 1) / n) + 0.1;
      kit.box(sx, Math.max(top, gy + 0.15) - 0.15, z, 1.6, 0.3 + Math.max(0, top - gy), Math.abs(z1 - z0) / n + 0.05, i % 2 ? 0x8a5a36 : 0x9a6a42);
    }
    // handrail
    kit.box(sx + 0.85, (R.groundAt(sx, z0) + R.groundAt(sx, z1)) / 2 + 1, (z0 + z1) / 2, 0.08, 0.08, Math.hypot(z1 - z0, R.groundAt(sx, z1) - R.groundAt(sx, z0)), 0x7a5032,
      { collide: false, euler: [Math.atan2(R.groundAt(sx, z1) - R.groundAt(sx, z0), z0 - z1), 0, 0] });
  }

  // ---- frozen lake
  const L = LAKE, top = L.y + 0.22;
  kit.cyl(L.x, top - 0.15, L.z, L.r, 0.3, 0xa8dcf2, { collide: false, seg: 40 });
  kit.cyl(L.x, top - 0.13, L.z, L.r * 0.82, 0.3, 0xc4ecfa, { collide: false, seg: 36 });
  for (let i = 0; i < 9; i++) { // pale scratch marks of skates
    const a = i * 0.7, r = 4 + (i * 2.3) % 15;
    kit.deco(L.x + Math.cos(a) * r, top + 0.02, L.z + Math.sin(a) * r, 0.12, 0.01, 4 + (i % 3) * 2, 0xe8f8ff, { yaw: a * 1.7 });
  }
  const ice = kit.phys.cylinder(L.x, top - 0.15, L.z, L.r, 0.3, { slippery: true });
  snowSurfaces.set(ice.handle, 'ice');
  // snowbank ring
  for (let i = 0; i < 34; i++) {
    const a = i / 34 * Math.PI * 2, x = L.x + Math.cos(a) * (L.r + 1.2), z = L.z + Math.sin(a) * (L.r + 1.2);
    kit.sphere(x, R.groundAt(x, z) + 0.1, z, 1.3 + (i % 3) * 0.3, 0xf4f8ff, { scale: [1.4, 0.55, 1.1], seg: 7 });
  }
  // fishing hole with a stool for the ice fisherman (or anyone)
  kit.cyl(L.x + 12, top + 0.02, L.z - 9, 0.7, 0.02, 0x1f4a7a, { collide: false, seg: 14 });
  kit.cyl(L.x + 12, top + 0.2, L.z - 7.5, 0.25, 0.4, 0x8a5a36, { seg: 8 });
  R.addSeat(game, { body: game.physics.staticBody, pos: [L.x + 12, top + 0.62, L.z - 7.5], yaw: Math.PI, label: 'Sit', hint: 'Gone fishing · Y get up', exit: [L.x + 12.9, top + 0.5, L.z - 6.6] });
  kit.box(L.x + 13.2, top + 0.2, L.z - 8.2, 0.5, 0.4, 0.4, 0x3f8cff); // tackle box
  R.sign('SKATING', L.x + 4, L.y + 2.6, L.z + L.r + 4, Math.PI, 4.5, '#6ac8ff', '#ffffff');
  for (const s of [-1, 1]) kit.cyl(L.x + 4 + s * 2.1, L.y + 1.2, L.z + L.r + 4.1, 0.08, 2.6, 0x7a5032, { seg: 6 });

  installSkiing(game);
}

// ---- skiing / skating feel ----------------------------------------------------------------
const VMAX = { piste: 13, jump: 17, ice: 7.5, air: 18 };
// wearing skis (snow/skis.js): much faster, quicker carving, a harder snow plough, little
// friction on groomed snow; 'powder' is the open mountain (only on skis)
const VMAX_SKI = { piste: 25, jump: 27, ice: 12, air: 30, powder: 15 };
const FRICTION_SKI = { piste: 0.1, jump: 0.1, powder: 0.9 };
function installSkiing(game) {
  const imp = (p, x, z) => {
    const m = p.totalMass || 60;
    p.hips.applyImpulse({ x: x * m * 0.55, y: 0, z: z * m * 0.55 }, true);
    p.chest.applyImpulse({ x: x * m * 0.45, y: 0, z: z * m * 0.45 }, true);
  };
  game.steppers.push(() => {
    for (const p of game.players) {
      if (!p.hips || p.seat) continue;
      if (p.state !== 'normal') { // flopped riders still slow down eventually
        if (p.region?.id !== 'snow') continue;
        const v = p.chest.linvel(), s = Math.hypot(v.x, v.z);
        if (s > 18 && v.y > -6) for (const b of p.bodies) { const bv = b.linvel(); b.setLinvel({ x: bv.x * 0.985, y: bv.y, z: bv.z * 0.985 }, true); }
        continue;
      }
      // on (or hovering just over) a snow surface: the ragdoll's ground ray
      // flickers on slopes, so don't insist on p.grounded
      let kind = p.groundCollider && p.groundDist <= 1.0 ? snowSurfaces.get(p.groundCollider.handle) : null;
      const sk = p.skis;
      if (!kind && sk?.slick && p.grounded) kind = 'powder';
      if (kind) p._snowAir = kind !== 'ice';
      else if (p.grounded || p.swimming) p._snowAir = false;
      if (!kind) { if (!p._snowAir) continue; kind = 'air'; } // flying off a jump: keep the momentum
      const v = p.hips.linvel(), s = Math.hypot(v.x, v.z);
      const st = game.input.get(p.deviceId)?.state || {}, mag = Math.min(1, Math.hypot(st.moveX || 0, st.moveY || 0));
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      let dvx = 0, dvz = 0;
      if (kind === 'ice') {
        if (mag > 0.2 && s < VMAX.ice) { dvx += fx * 3.2 * mag * DT; dvz += fz * 3.2 * mag * DT; } // skating push
        if (mag < 0.2 && s > 0.05) { const k = Math.min(s, 0.35 * DT); dvx -= v.x / s * k; dvz -= v.z / s * k; }
      } else if (sk && kind !== 'air') {
        if (sk.ploughing) { const k = Math.min(s, 8 * DT * mag); dvx -= v.x / s * k; dvz -= v.z / s * k; } // snow plough (pull back)
        else if (p.grounded && mag > 0.2 && s < 7) { // skating / poling to get going
          const cy = p.camera ? p.camera.yaw : p.yaw, wx = Math.sin(cy) * (st.moveY || 0) - Math.cos(cy) * (st.moveX || 0), wz = Math.cos(cy) * (st.moveY || 0) + Math.sin(cy) * (st.moveX || 0);
          if ((wx * fx + wz * fz) / mag > 0.3) { dvx += fx * 3.5 * mag * DT; dvz += fz * 3.5 * mag * DT; }
        }
      } else if (kind !== 'air' && s > 1.5 && mag > 0.2) {
        const dot = (v.x * fx + v.z * fz) / s;
        if (dot < -0.35) { const k = Math.min(s, 4 * DT * mag); dvx -= v.x / s * k; dvz -= v.z / s * k; } // snow plough
      }
      if (kind !== 'ice' && s > (sk ? 2 : 3.2)) {
        // faster than walking: undo the walk controller's pull back toward walking
        // pace (1 m/s² on slippery ground, 6 m/s² in the air), the carve steers instead
        const cy = p.camera ? p.camera.yaw : p.yaw, cfx = Math.sin(cy), cfz = Math.cos(cy);
        const mx = st.moveX || 0, my = st.moveY || 0, sp = mag > 0.05 ? (st.sprint ? 6.2 : 3.4) : 0;
        const ex = (cfx * my - cfz * mx) * sp - v.x, ez = (cfz * my + cfx * mx) * sp - v.z, el = Math.hypot(ex, ez);
        const acc = p.grounded ? 1 : (mag > 0.05 ? 6 : 0);
        if (el > 1e-3 && acc) { const k = Math.min(el, acc * DT); dvx -= ex / el * k; dvz -= ez / el * k; }
      }
      if (!p.grounded && kind !== 'ice' && kind !== 'air') { // keep sliding down the slope over the little hops
        const n = p.groundNormal;
        dvx += n.x * n.y * 9.81 * DT; dvz += n.z * n.y * 9.81 * DT;
      }
      // carve: turn the velocity toward where the player faces, keeping its speed
      if (kind !== 'air' && mag > 0.2 && s > 1.5 && !sk?.ploughing) {
        const cur = Math.atan2(v.x, v.z);
        let want = p.yaw, d = want - cur;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        if (Math.abs(d) < 2.2) {
          const rate = (kind === 'ice' ? 2.4 : sk ? (kind === 'powder' ? 2.2 : 2.8) : 1.8) * mag * DT, nd = Math.max(-rate, Math.min(rate, d));
          const na = cur + nd;
          dvx += Math.sin(na) * s - v.x; dvz += Math.cos(na) * s - v.z;
        }
      }
      // speed limit (air drag), and a little snow friction everywhere
      const vm = (sk ? VMAX_SKI : VMAX)[kind];
      if (s > vm) { const k = Math.min(s - vm, (s - vm) * 2.5 * DT + 0.02); dvx -= v.x / s * k; dvz -= v.z / s * k; }
      if (kind !== 'ice' && kind !== 'air' && s > 0.05) { const k = Math.min(s, (sk ? FRICTION_SKI[kind] : 0.25) * DT); dvx -= v.x / s * k; dvz -= v.z / s * k; }
      if (dvx || dvz) imp(p, dvx, dvz);
    }
  });
}
