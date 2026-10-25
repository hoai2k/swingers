// Up the mountain: the observatory and weather station on the summit plateau,
// the ice cave cut into the western hillside, the mountain cabin, the top
// station's lookout, plus Frostpeak's presents and coin clusters.
import * as THREE from 'three';
import { GLOW, Builder, matVC } from '../../../mesh.js';
import { chalet } from './village.js';
import { TOP, SUMMIT, CAVE, CABIN, LAKE, JUMP, HAMLET, LIFT, pisteLine } from './layout.js';

const ICE = 0xa8e0f8, ICE2 = 0x86c8ee, ICE3 = 0xd2f0ff, CRYSTAL = 0x7ff0ff, SNOW = 0xf6f9ff;
GLOW.set(CRYSTAL, 2);

export function buildPeak(game, kit, R) {
  observatory(game, kit, R);
  iceCave(game, kit, R);
  cabin(game, kit, R);
  topStation(game, kit, R);
  presentsAndCoins(game, kit, R);
}

function observatory(game, kit, R) {
  const { x, z, y } = SUMMIT;
  // round tower with a domed roof and a walkway ring on top of the wall
  kit.cyl(x, y + 3, z, 5.5, 6, 0xe8e4dc, { seg: 20 });
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; kit.deco(x + Math.cos(a) * 5.52, y + 3.4, z + Math.sin(a) * 5.52, 0.05, 1.0, 1.0, 0xffd98a, { yaw: Math.PI / 2 - a }); }
  kit.deco(x, y + 1.1, z + 5.52, 1.4, 2.2, 0.05, 0x3a5a8a);  // door
  kit.cyl(x, y + 6.1, z, 5.7, 0.2, 0xb8b8c0, { seg: 20 });
  kit.sphere(x, y + 6.2, z, 4.4, 0xf2f6fa, { collide: true, seg: 18 });
  kit.box(x, y + 8.2, z + 1.6, 1.1, 4.4, 2.4, 0x2a3a5a, { collide: false, euler: [-0.7, 0, 0] });   // the slit
  kit.cyl(x, y + 9.4, z + 2.6, 0.38, 3.4, 0xffffff, { collide: false, euler: [-0.85, 0, 0], seg: 10 }); // telescope tube
  kit.cyl(x, y + 10.55, z + 3.95, 0.42, 0.25, 0x2a2a33, { collide: false, euler: [-0.85, 0, 0], seg: 10 });
  // rail around the ring and a ladder up the south-east side
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; kit.cyl(x + Math.cos(a) * 5.55, y + 6.7, z + Math.sin(a) * 5.55, 0.04, 1.0, 0x5a5f6a, { collide: false, seg: 4 }); }
  kit.cyl(x, y + 7.2, z, 5.55, 0.06, 0x5a5f6a, { collide: false, seg: 24 });
  const la = Math.PI * 0.25, lx = x + Math.cos(la) * 5.75, lz = z + Math.sin(la) * 5.75;
  for (const s of [-1, 1]) kit.cyl(lx - Math.sin(la) * s * 0.35, y + 3.2, lz + Math.cos(la) * s * 0.35, 0.04, 6.4, 0x8a8f9a, { collide: false, seg: 5 });
  for (let k = 0; k < 16; k++) kit.box(lx, y + 0.3 + k * 0.4, lz, 0.05, 0.05, 0.75, 0x8a8f9a, { collide: false, yaw: -la });
  R.common.ladder(game, lx, lz, y, y + 6.2, -Math.cos(la), -Math.sin(la), 0.45);
  R.sign('OBSERVATORY', x, y + 3.2, z + 6.6, 0, 4.6, '#1e2a4a', '#ffe9a0');
  for (const k of [-1, 1]) kit.cyl(x + k * 2.0, y + 1.5, z + 6.55, 0.07, 3.0, 0x5a5f6a, { seg: 6 });
  // weather station: mast with a spinning anemometer and a wind vane, the
  // instrument hut, a solar panel
  const wx = x - 9, wz = z - 4, wy = R.groundAt(wx, wz);
  kit.cyl(wx, wy + 3, wz, 0.08, 6, 0xc8c8d0, { seg: 6 });
  kit.box(wx + 2.6, wy + 1.2, wz + 0.5, 1.2, 0.9, 0.9, 0xffffff);
  for (const s of [-1, 1]) kit.cyl(wx + 2.6 + s * 0.45, wy + 0.4, wz + 0.5, 0.04, 0.8, 0xffffff, { collide: false, seg: 4 });
  kit.box(wx - 1.8, wy + 0.9, wz + 1, 1.8, 0.06, 1.1, 0x22305a, { euler: [-0.6, 0.4, 0] });
  kit.cyl(wx - 1.8, wy + 0.45, wz + 1.2, 0.05, 0.9, 0x8a8f9a, { collide: false, seg: 4 });
  const ab = new Builder();
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; ab.cyl(0.015, 0.015, 0.55, 0x8a8f9a, [Math.cos(a) * 0.27, 0, Math.sin(a) * 0.27], [0, -a, Math.PI / 2], 4); ab.sphere(0.09, 0xff3a3a, [Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55], [1, 1, 0.5], 6); }
  ab.cyl(0.04, 0.04, 0.12, 0x8a8f9a, [0, 0, 0], null, 6);
  const anemo = ab.mesh(matVC); anemo.position.set(wx, wy + 6.1, wz); game.scene.add(anemo);
  const vb = new Builder();
  vb.box(0.03, 0.03, 0.9, 0x2a2a33, [0, 0, 0]); vb.cone(0.07, 0.18, 0x2a2a33, [0, 0, 0.5], [Math.PI / 2, 0, 0], 6); vb.box(0.02, 0.22, 0.25, 0xff8a1a, [0, 0, -0.4]);
  const vane = vb.mesh(matVC); vane.position.set(wx, wy + 5.5, wz); game.scene.add(vane);
  game.updaters.push((dt, t) => { anemo.rotation.y += dt * (4 + Math.sin(t * 0.3) * 2); vane.rotation.y = 0.6 + Math.sin(t * 0.17) * 0.5 + Math.sin(t * 1.3) * 0.08; });
  // flag and a bench for the view
  kit.cyl(x + 8, R.groundAt(x + 8, z + 6) + 3, z + 6, 0.06, 6, 0xdddddd, { seg: 5 });
  kit.box(x + 8, R.groundAt(x + 8, z + 6) + 5.5, z + 6.6, 0.03, 0.8, 1.2, 0x3f8cff, { collide: false });
  kit.bench(x + 6, z + 11, Math.PI * 0.1, R.groundAt(x + 6, z + 11));
  game.interiorLights.add(x, y + 3, z, { color: 0xffe0a0, intensity: 4, range: 7, fixture: 'none' });
}

function iceCave(game, kit, R) {
  const { x, z, y, w, d } = CAVE, hw = w / 2, hd = d / 2, H = 5.2;
  const L = new R.Local(kit, x, z, 0, y);
  // icy floor (slippery!)
  L.box(0, 0.1, 0, w - 1, 0.2, d - 1, ICE3, { slippery: true });
  // walls of stacked ice blocks along both sides and the back
  const rnd = R.rng(7);
  for (let lz = -hd + 1; lz < hd - 1.5; lz += 2.2) for (const s of [-1, 1]) {
    const t = 1.6 + rnd() * 0.8;
    L.box(s * (hw - 0.6), H / 2, lz, t, H, 2.4, rnd() < 0.5 ? ICE : ICE2, { yaw: (rnd() - 0.5) * 0.15 });
  }
  for (let lx = -hw + 1; lx < hw; lx += 2.4) L.box(lx, H / 2, -hd + 0.8, 2.6, H, 1.6 + rnd() * 0.6, rnd() < 0.5 ? ICE : ICE2);
  // roof slabs, snow heaped on top, icicles hanging inside
  for (let lz = -hd + 1; lz < hd - 1; lz += 3) {
    L.box(0, H + 0.4, lz + 1.5, w, 0.8, 3.1, ICE2);
    L.sphere(0, H + 1.5, lz + 1.5, 3.2, SNOW, { scale: [hw / 3 + 0.6, 0.45, 0.7] });
  }
  for (let i = 0; i < 26; i++) {
    const lx = (rnd() - 0.5) * (w - 3), lz = -hd + 2 + rnd() * (d - 4), len = 0.6 + rnd() * 1.4, p = L.v3(lx, H - len / 2, lz);
    kit.cone(p.x, p.y, p.z, 0.12 + rnd() * 0.1, len, ICE3, { euler: [Math.PI, 0, 0], seg: 5 });
  }
  // entrance arch with a curtain of icicles
  L.box(-hw + 1.4, H / 2, hd - 0.4, 2.8, H, 1.2, ICE); L.box(hw - 1.4, H / 2, hd - 0.4, 2.8, H, 1.2, ICE);
  L.box(0, H - 0.4, hd - 0.4, w, 1.6, 1.4, ICE2);
  for (let i = 0; i < 14; i++) { const p = L.v3(-hw + 3.2 + i * (w - 6.4) / 13, H - 1.6, hd); kit.cone(p.x, p.y, p.z, 0.14, 0.9 + (i % 3) * 0.4, ICE3, { euler: [Math.PI, 0, 0], seg: 5 }); }
  // glowing crystals and a frozen pool at the back
  for (let i = 0; i < 9; i++) {
    const s = i % 2 ? 1 : -1, lz = -hd + 3 + i * 2.2, p = L.v3(s * (hw - 1.8), 0.6, lz);
    for (let k = 0; k < 3; k++) kit.cone(p.x + (k - 1) * 0.25, p.y + k * 0.1, p.z + (k - 1) * 0.15, 0.18, 1.0 + k * 0.4, CRYSTAL, { euler: [(k - 1) * 0.3, 0, s * 0.25], seg: 5 });
  }
  L.cyl(0, 0.22, -hd + 4, 2.4, 0.06, 0x5ab8e8, { collide: false, seg: 18 });
  for (const lz of [-hd + 4, 0, hd - 5]) { const p = L.v3(0, H - 0.6, lz); game.interiorLights.add(p.x, p.y, p.z, { color: 0x8ad8ff, intensity: 5, range: 9, fixture: 'none' }); }
  R.sign('ICE CAVE', x - 5.5, y + 2.8, z + hd + 2.2, 0, 4.2, '#7ac8f0', '#ffffff');
  for (const s of [-1, 1]) kit.cyl(x - 5.5 + s * 1.9, y + 1.3, z + hd + 2.3, 0.08, 2.6, 0x7a5032, { seg: 6 });
}

function cabin(game, kit, R) {
  const { x, z, y } = CABIN;
  chalet(game, kit, R, x, z, 0.2, { y, w: 8, d: 6.5, wall: 0x8a5a36, roof: 0x5a3a22, chair: 0xc8343c, chair2: 0x3f6aa8, rug: 0x7a3a2a,
    extra: (L, w, d) => { // bunk, table, a stash of logs
      L.box(-w / 2 + 0.9, 0.45, -d / 2 + 1.4, 1.4, 0.3, 2.2, 0x6a4a32); L.deco(-w / 2 + 0.9, 0.65, -d / 2 + 1.4, 1.3, 0.12, 2.1, 0x3f6aa8);
      L.box(-w / 2 + 0.9, 1.8, -d / 2 + 1.4, 1.4, 0.2, 2.2, 0x6a4a32); L.deco(-w / 2 + 0.9, 1.95, -d / 2 + 1.4, 1.3, 0.12, 2.1, 0xc8343c);
      for (let i = 0; i < 6; i++) L.cyl(-w / 2 + 0.6 + (i % 3) * 0.32, 0.18 + (i / 3 | 0) * 0.3, d / 2 - 0.7, 0.15, 0.9, 0x8a5a36, { euler: [Math.PI / 2, 0, 0], collide: false, seg: 7 });
    } });
  // woodpile and an axe stump outside, a snowmobile parked
  const L = new R.Local(kit, x, z, 0.2, y);
  for (let i = 0; i < 9; i++) L.cyl(5.4, 0.2 + (i / 3 | 0) * 0.36, -1.5 + (i % 3) * 0.38, 0.18, 1.2, 0x8a5a36, { euler: [0, 0, Math.PI / 2], seg: 7 });
  L.box(5.4, 1.5, -1.1, 1.6, 0.1, 1.8, 0x5a3a22);
  L.cyl(4.6, 0.3, 2.2, 0.35, 0.6, 0x8a5a36, { seg: 8 });
  const [vx, vz] = L.w(-6, 3);
  R.vehicle('snowmobile', vx, vz, 0.2 + Math.PI / 2, 0xffd23f);
  kit.lamp(...L.w(3.6, 5), y);
}

function topStation(game, kit, R) {
  // lookout deck with a coin-op telescope at the top of the lift, a hut and a trail-map board
  const x = TOP.x0 + 4, z = TOP.z1 - 4, y = TOP.y;
  kit.box(x, y + 0.2, z, 6, 0.4, 5, 0x9a6a42);
  const L = new R.Local(kit, x, z, 0, y);
  L.rail(-3, 2.5, 3, 2.5, 0.4, 1.0, 0x7a5032); L.rail(-3, -2.5, -3, 2.5, 0.4, 1.0, 0x7a5032);
  L.cyl(1.5, 1.1, 1.6, 0.08, 1.4, 0x3f8cff, { seg: 6 }); L.cyl(1.5, 1.85, 1.75, 0.13, 0.5, 0x3f8cff, { euler: [-1.3, 0, 0], seg: 8 });
  kit.bench(TOP.x1 - 6, TOP.z0 + 6, Math.PI * 0.75, y);
  // warming hut
  const H = new R.Local(kit, TOP.x1 - 5, TOP.z0 + 12, -Math.PI / 2, y);
  H.box(0, 1.3, 0, 5, 2.6, 4, 0x9a6a42);
  H.deco(0, 1.1, 2.01, 1.1, 2.2, 0.05, 0x6a3a22); H.deco(1.6, 1.6, 2.01, 1.0, 0.8, 0.05, 0xffd98a);
  H.box(0, 2.9, 0, 5.6, 0.25, 4.6, 0xc8343c); H.box(0, 3.1, 0, 5.4, 0.2, 4.4, SNOW, { collide: false });
}

function presentsAndCoins(game, kit, R) {
  // presents (new Frostpeak cosmetics)
  const la = Math.PI * 0.25;
  R.present('snow-observatory', 'hat:skigoggles', SUMMIT.x + Math.cos(la + 0.7) * 4.95, SUMMIT.z + Math.sin(la + 0.7) * 4.95, SUMMIT.y + 7, 'on the observatory roof ring');
  R.present('snow-icecave', 'hat:bobble', CAVE.x, CAVE.z - CAVE.d / 2 + 4, CAVE.y + 2, 'at the back of the ice cave, by the frozen pool');
  R.present('snow-cabin', 'pants:Glacier', CABIN.x - 2.2, CABIN.z - 1.3, CABIN.y + 1.5, 'on the bottom bunk of the mountain cabin');
  // coins: around the plaza tree, down the blue run, over the ski-jump landing,
  // on the lake, in the ice cave, the summit, the jetty
  R.coins(24, -772, 12, 'ring', 8, 5.5);
  const pl = pisteLine();
  for (let i = 4; i < pl.length - 2; i += 5) R.coins(pl[i][0], pl[i][1], R.groundAt(pl[i][0], pl[i][1]) + 3, 'one', 1, 0);
  for (let i = 0; i < 6; i++) { const dz = 6 + i * 3.2, yy = JUMP.yLip + 2.6 + 1.6 * i - 0.42 * i * i; R.coins(JUMP.x, JUMP.zLip + dz, null, 'one', 1, 0, { y: yy + 1.2 }); }
  R.coins(LAKE.x, LAKE.z, LAKE.y + 3, 'ring', 10, 13, { lift: 0.2 });
  R.coins(LAKE.x, LAKE.z, LAKE.y + 3, 'one', 1, 0, { big: true });
  R.coins(CAVE.x, CAVE.z, CAVE.y + 3, 'line', 6, 16, { yaw: Math.PI / 2 });
  R.coins(SUMMIT.x, SUMMIT.z, SUMMIT.y + 9, 'ring', 6, 4.95);
  R.coins(SUMMIT.x, SUMMIT.z, SUMMIT.y + 14, 'one', 1, 0, { big: true }); // top of the dome
  R.coins(128, -744, 4, 'line', 5, 16, { yaw: Math.PI / 2 });
  R.coins(LIFT.x + 6, (LIFT.zb + LIFT.zt) / 2, null, 'one', 1, 0, { y: R.groundAt(LIFT.x + 6, (LIFT.zb + LIFT.zt) / 2) + 2 });
  R.coins(CABIN.x + 2, CABIN.z + 7, CABIN.y + 3, 'ring', 5, 2.5);
  R.coins(HAMLET.x0 + 10, HAMLET.z0 + 14, HAMLET.y + 3, 'ring', 4, 2);
}
