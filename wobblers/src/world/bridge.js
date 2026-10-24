// The Bigtown Bridge: a drivable suspension bridge from the home island's east
// road (z = 118, flattened in terrain.js HOME_EXTRA_FLAT) across the sea to the
// city's west shore. Static: the deck is one smooth trimesh following the
// profile bridgeY(x) (ramps eased in and out), railings are box colliders, the
// towers and piers collide, cables and hangers are visual only.
import * as THREE from 'three';
import { meshHeight, SEA_FLOOR } from '../terrain.js';

export const BRIDGE = {
  z: 118, x0: 232, x1: 740,          // deck ends (home road end, city ground)
  rise: [232, 410], fall: [600, 740], // ramps
  deckY: 12, startY: 0.06, endY: 2.04, // top of the deck: level span / ends
  half: 8, road: 5,                    // half widths: deck, carriageway
  towers: [445, 585], towerTop: 52, cableZ: 8.5,
};
const sstep = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };

// Height of the deck surface at x (the start / end heights outside the bridge).
export function bridgeY(x) {
  const B = BRIDGE;
  if (x <= B.fall[0]) return B.startY + (B.deckY - B.startY) * sstep((x - B.rise[0]) / (B.rise[1] - B.rise[0]));
  return B.endY + (B.deckY - B.endY) * (1 - sstep((x - B.fall[0]) / (B.fall[1] - B.fall[0])));
}

const COL = { asphalt: 0x4d5058, walk: 0xb9b4aa, side: 0xa9a59c, under: 0x8a8780, line: 0xf4f4f4, yellow: 0xffd23f, rail: 0x7d8a9c, tower: 0x8e9bb0, cable: 0x6f7c90, pier: 0x9c978d };

// A strip following the deck profile between lateral offsets zA..zB (relative
// to the bridge centre line), dy above the surface. kind: 'top' | 'bottom' | 'side+' | 'side-'.
function strip(xa, xb, zA, zB, dy, kind, dy2 = dy) {
  const P = [];
  const Z = BRIDGE.z, n = Math.max(1, Math.ceil((xb - xa) / 4));
  for (let i = 0; i < n; i++) {
    const x0 = xa + (xb - xa) * i / n, x1 = xa + (xb - xa) * (i + 1) / n;
    const y0 = bridgeY(x0), y1 = bridgeY(x1);
    let A, B, C, D;
    if (kind === 'top' || kind === 'bottom') {
      A = [x0, y0 + dy, Z + zA]; B = [x1, y1 + dy, Z + zA]; C = [x0, y0 + dy, Z + zB]; D = [x1, y1 + dy, Z + zB];
      if (kind === 'bottom') [C, B] = [B, C];
    } else { // vertical side at lateral offset zA from dy (top) down to dy2
      A = [x0, y0 + dy, Z + zA]; B = [x1, y1 + dy, Z + zA]; C = [x0, y0 + dy2, Z + zA]; D = [x1, y1 + dy2, Z + zA];
      if (kind === 'side-') [C, B] = [B, C];
    }
    if (kind === 'bottom' || kind === 'side-') P.push(...A, ...C, ...B, ...C, ...D, ...B);
    else P.push(...A, ...C, ...B, ...B, ...C, ...D);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.computeVertexNormals();
  return g;
}

export function buildBridge(game, kit) {
  const B = BRIDGE, Z = B.z, H = B.half, R = B.road;
  const PIECE = 40;
  // ---- deck: visual pieces (kept per 40 m so far culling and chunks stay local) + one trimesh
  for (let xa = B.x0; xa < B.x1; xa += PIECE) {
    const xb = Math.min(B.x1, xa + PIECE), b = kit.b((xa + xb) / 2, Z);
    b.add(strip(xa, xb, -R, R, 0, 'top'), COL.asphalt);
    b.add(strip(xa, xb, -H, -R, 0.12, 'top'), COL.walk);
    b.add(strip(xa, xb, R, H, 0.12, 'top'), COL.walk);
    b.add(strip(xa, xb, -R, -R, 0.12, 'side-', 0), COL.side); // kerbs
    b.add(strip(xa, xb, R, R, 0.12, 'side+', 0), COL.side);
    b.add(strip(xa, xb, H, H, 0.12, 'side+', -1.3), COL.side);
    b.add(strip(xa, xb, -H, -H, 0.12, 'side-', -1.3), COL.side);
    b.add(strip(xa, xb, -H, H, -1.3, 'bottom'), COL.under);
    // markings: edge lines and a dashed yellow centre line
    for (const s of [-1, 1]) b.add(strip(xa, xb, s * (R - 0.45), s * (R - 0.3), 0.015, 'top'), COL.line);
    for (let x = xa + 1; x < xb - 1; x += 6) b.add(strip(x, Math.min(x + 3, xb), -0.1, 0.1, 0.015, 'top'), COL.yellow);
  }
  // collider: the carriageway and walkways as one surface (kerbs are only 12 cm)
  const V = [], I = [];
  for (let x = B.x0; x <= B.x1 + 0.01; x += 2) {
    const y = bridgeY(x), k = V.length / 3;
    V.push(x, y, Z - H, x, y, Z + H);
    if (x > B.x0) I.push(k - 2, k, k - 1, k - 1, k, k + 1);
  }
  game.physics.trimesh(new Float32Array(V), new Uint32Array(I), { friction: 0.9 });
  // ---- railings: posts (visual) and a top rail + a mid rail (colliders per 8 m)
  for (let xa = B.x0 + 4; xa < B.x1 - 4; xa += 8) {
    const xb = xa + 8, ya = bridgeY(xa), yb = bridgeY(xb), xm = (xa + xb) / 2, ym = (ya + yb) / 2;
    const ang = Math.atan2(yb - ya, 8), len = Math.hypot(8, yb - ya);
    for (const s of [-1, 1]) {
      const z = Z + s * (H - 0.3);
      kit.deco(xm, ym + 0.12 + 1.1, z, len, 0.12, 0.14, COL.rail, { euler: [0, 0, ang] });
      kit.box(xm, ym + 0.12 + 0.55, z, len, 1.1, 0.06, 0xe8e4dc, { euler: [0, 0, ang] }); // mesh panel (collides)
      for (let k = 0; k < 4; k++) { const x = xa + k * 2; kit.deco(x, bridgeY(x) + 0.12 + 0.55, z, 0.1, 1.1, 0.1, COL.rail); }
    }
  }
  // ---- towers
  const T = B.towerTop;
  for (const tx of B.towers) {
    const y0 = SEA_FLOOR;
    for (const s of [-1, 1]) {
      const z = Z + s * (H + 1.6);
      kit.box(tx, (y0 + T) / 2, z, 2.4, T - y0, 2.4, COL.tower);
      kit.deco(tx, y0 + 6, z, 3.4, 12, 3.4, 0x8f8b82); // footing
    }
    for (const y of [B.deckY - 1.8, 32, T - 2]) kit.box(tx, y, Z, 2.0, 2.2, 2 * (H + 1.6), COL.tower);
    kit.deco(tx, T + 0.6, Z - (H + 1.6), 2.8, 1.2, 2.8, 0x6f7c90); kit.deco(tx, T + 0.6, Z + (H + 1.6), 2.8, 1.2, 2.8, 0x6f7c90);
  }
  // ---- main cables (sag between the towers, down to anchors on the deck) + hangers
  const [t0, t1] = B.towers, mid = (t0 + t1) / 2, sagY = B.deckY + 3.0, a0 = B.rise[1] - 30, a1 = B.fall[0] + 40;
  const cableY = (x) => {
    if (x < t0) return bridgeY(a0) + 1.2 + (T - 0.5 - bridgeY(a0) - 1.2) * ((x - a0) / (t0 - a0)) ** 1.3;
    if (x > t1) return bridgeY(a1) + 1.2 + (T - 0.5 - bridgeY(a1) - 1.2) * ((a1 - x) / (a1 - t1)) ** 1.3;
    const u = (x - mid) / (t1 - mid);
    return sagY + (T - 0.5 - sagY) * u * u;
  };
  for (const s of [-1, 1]) {
    const z = Z + s * B.cableZ;
    let px = a0, py = cableY(a0);
    for (let x = a0 + 5; x <= a1 + 0.01; x += 5) {
      const y = cableY(x), len = Math.hypot(5, y - py);
      kit.b((x + px) / 2, z).cyl(0.32, 0.32, len, COL.cable, [(x + px) / 2, (y + py) / 2, z], [0, 0, Math.atan2(-5, y - py)], 8);
      px = x; py = y;
    }
    for (let x = a0 + 7; x < a1; x += 7) {
      if (Math.abs(x - t0) < 2 || Math.abs(x - t1) < 2) continue;
      const yt = cableY(x), yb = bridgeY(x) + 0.1;
      if (yt - yb < 0.6) continue;
      kit.b(x, z).cyl(0.07, 0.07, yt - yb, 0x3a3a40, [x, (yt + yb) / 2, z], null, 5);
    }
  }
  // ---- piers under the ramps and side spans
  for (let x = B.x0 + 40; x < B.x1 - 10; x += 40) {
    if (B.towers.some((t) => Math.abs(t - x) < 60) || (x > t0 && x < t1)) continue;
    const top = bridgeY(x) - 1.3, g = Math.max(meshHeight(x, Z), SEA_FLOOR);
    if (top - g < 1.5) continue;
    for (const s of [-1, 1]) kit.cyl(x, (top + g) / 2, Z + s * 4.5, 0.9, top - g, COL.pier, { seg: 10 });
    kit.box(x, top - 0.5, Z, 1.6, 1.0, 11, COL.pier);
  }
  // ---- on the map: deck, then a dashed centre line
  const fm = game.mapFeatures ||= [];
  fm.push({ pts: [[B.x0, Z], [B.x1, Z]], w: 2 * H, color: '#8e9bb0', minPx: 3 });
  fm.push({ pts: [[B.x0, Z], [B.x1, Z]], w: 2 * R, color: '#5b5f69', minPx: 2 });
  fm.push({ pts: [[B.x0, Z], [B.x1, Z]], w: 0.4, color: 'rgba(255,255,255,.85)', dash: [3, 4] });
  // ---- lamps along the walkways
  for (let x = B.x0 + 20, k = 0; x < B.x1 - 10; x += 36, k++) {
    if (B.towers.some((t) => Math.abs(t - x) < 6)) continue;
    const s = k % 2 ? 1 : -1;
    kit.lamp(x, Z + s * (H - 0.9), bridgeY(x) + 0.12);
  }
}
