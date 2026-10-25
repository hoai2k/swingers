// Harbour Isle: a fishing harbour with two piers into the channel, the boat
// hire shack (speedboats, a sailboat, jet skis, a banana boat), crates, nets
// and barrels; and the red-and-white lighthouse on Little Key with a ladder to
// its gallery and a beam that sweeps the sea at night.
import * as THREE from 'three';
import { HARBOUR, LIGHTHOUSE } from '../tropical.js';
import { climb } from '../jungle/rides.js';
import { puffTexture } from '../jungle/river.js';

const WOOD = 0xb98a5a, POST = 0x7a5a3a, PIER_Y = 1.1;

export function buildHarbour(game, kit, R) {
  const Y = HARBOUR.y;
  // ---- piers ---------------------------------------------------------------------
  const pier = (x0, x1, z, w) => {
    kit.box((x0 + x1) / 2, PIER_Y - 0.12, z, x1 - x0, 0.24, w, WOOD);
    for (let x = x0 + 1; x <= x1; x += 4) for (const s of [-1, 1]) {
      const g = Math.max(R.groundAt(x, z + s * (w / 2 - 0.2)), -6);
      if (PIER_Y - g > 0.3) kit.cyl(x, (PIER_Y + g) / 2 - 0.1, z + s * (w / 2 - 0.2), 0.16, PIER_Y - g + 0.2, POST, { seg: 6 });
      kit.cyl(x, PIER_Y + 0.4, z + s * (w / 2 - 0.2), 0.12, 0.8, POST, { seg: 6, collide: false });
    }
    // ramp onto the quay if the ground is higher
    const g0 = R.groundAt(x0 - 1, z);
    if (g0 > PIER_Y + 0.2) kit.wedge(x0 - 1.6, PIER_Y, z, w, 3, g0 - PIER_Y, WOOD, { yaw: -Math.PI / 2 });
  };
  pier(HARBOUR.x1 - 2, 566, 610, 3.2);
  pier(HARBOUR.x1 - 2, 556, 630, 3.2);
  kit.box(563, PIER_Y - 0.12, 616, 6, 0.24, 9, WOOD);      // T end with a lamp
  kit.lamp(565, 619, PIER_Y);
  // ---- boat hire shack -------------------------------------------------------------
  const L = new R.Local(kit, 478, 610, Math.PI / 2, Y);
  L.box(0, -0.1, 0, 10, 0.2, 8, 0xa77b4a);
  L.wall(-4.5, -3.5, 4.5, -3.5, 3, 0.2, 0xff7fa0, []);
  L.wall(-4.5, 3.5, 4.5, 3.5, 3, 0.2, 0xff7fa0, [{ at: 4.5, w: 1.4, h: 2.3 }, { at: 1.8, w: 1.4, h: 1.0, sill: 1.0 }, { at: 7.2, w: 1.4, h: 1.0, sill: 1.0 }]);
  L.wall(-4.5, -3.5, -4.5, 3.5, 3, 0.2, 0xff7fa0, [{ at: 3.5, w: 1.6, h: 1.0, sill: 1.0 }]);
  L.wall(4.5, -3.5, 4.5, 3.5, 3, 0.2, 0xff7fa0, []);
  for (const s of [-1, 1]) L.box(0, 3.75, s * 2.0, 10.4, 0.18, 4.6, 0x2a62c9, { euler: [s * 0.42, 0, 0] });
  L.box(0, 4.55, 0, 10.4, 0.25, 0.4, 0x1f4aa0);
  const sg = L.v3(0, 3.2, 3.65);
  R.sign('BOAT HIRE', sg.x, sg.y, sg.z, Math.PI / 2, 4, '#ffffff', '#1f2b5c');
  game.interiorLights?.add(...Object.values(L.v3(0, 2.9, 0)), { color: 0xffe2b0, intensity: 7, range: 8 });
  // crates, barrels, nets, lobster pots, a fish rack
  const rnd = R.rng(5);
  for (let i = 0; i < 8; i++) { const x = 490 + rnd() * 8, z = 600 + rnd() * 38; kit.box(x, Y + 0.4, z, 0.8, 0.8, 0.8, i % 2 ? 0xb5773d : 0x9a6a3a, { yaw: rnd() * 3 }); }
  for (let i = 0; i < 6; i++) { const x = 486 + rnd() * 10, z = 622 + rnd() * 14; kit.cyl(x, Y + 0.5, z, 0.38, 1.0, 0x8a5a2a, { seg: 10 }); kit.deco(x, Y + 0.75, z, 0.8, 0.06, 0.8, 0x5a3a20); }
  for (const z of [636, 638.5]) { kit.cyl(462, Y + 0.35, z, 0.45, 0.7, 0xd9c08a, { seg: 8 }); }
  kit.deco(468, Y + 1.2, 636, 5, 2, 0.05, 0x6a8a7a, { yaw: 0.1 }); // net on a frame
  for (const x of [465.5, 470.5]) kit.cyl(x, Y + 1.1, 636, 0.08, 2.2, POST, { seg: 5 });
  // ---- boats -----------------------------------------------------------------------
  R.vehicle('speedboat', 548, 606, Math.PI / 2, 0xff3a5a);
  R.vehicle('speedboat', 560, 606, Math.PI / 2, 0x2a72e8);
  R.vehicle('sailboat', 548, 636.5, Math.PI / 2, 0x3fb8c8);
  R.vehicle('jetski', 550, 615.5, Math.PI / 2, 0x3cae4a);
  R.vehicle('jetski', 555, 615.5, Math.PI / 2, 0xff8a1a);
  R.vehicle('boat', 552, 624.5, Math.PI / 2, 0xd9342b);
  R.npc('captain', 482, 618, { yaw: Math.PI / 2 });
  R.npc('fisherman', 565.5, 613, { yaw: Math.PI / 2 });
  R.npc('fisherman', 553, 631.2, { yaw: 0 });
  R.coins(530, 610, PIER_Y + 3, 'line', 8, 50);
  R.coins(470, 620, Y + 3, 'ring', 8, 12);
  R.sign('HARBOUR', HARBOUR.x0 + 4, Y + 2.6, HARBOUR.z0 + 2, Math.PI, 3.6, '#1f2b5c', '#ffffff');
  kit.cyl(HARBOUR.x0 + 4 - 1.6, Y + 1.2, HARBOUR.z0 + 2, 0.1, 2.4, POST); kit.cyl(HARBOUR.x0 + 4 + 1.6, Y + 1.2, HARBOUR.z0 + 2, 0.1, 2.4, POST);

  buildLighthouse(game, kit, R);
}

function buildLighthouse(game, kit, R) {
  const { x, z } = LIGHTHOUSE, g = R.groundAt(x, z);
  kit.cyl(x, g + 0.3, z, 3.2, 1.8, 0x9a948a, { seg: 8 });
  const H = 16, r0 = 2.0, r1 = 1.45, n = 6, base = g + 1.2;
  for (let i = 0; i < n; i++) {
    const ra = r0 + (r1 - r0) * i / n, rb = r0 + (r1 - r0) * (i + 1) / n;
    kit.cyl(x, base + (i + 0.5) * H / n, z, ra, H / n + 0.01, i % 2 ? 0xffffff : 0xe8322b, { seg: 14, rTop: rb });
  }
  const top = base + H;
  kit.cyl(x, top + 0.15, z, 2.7, 0.3, 0x3a3f4a, { seg: 14 });                       // gallery deck
  kit.cyl(x, top + 1.2, z, 1.1, 1.8, 0x9fd8ff, { seg: 10, collide: false });       // lamp room glass
  kit.cyl(x, top + 1.2, z, 1.15, 1.8, 0x3a3f4a, { seg: 10, collide: true });         // its collider (invisible inside the glass)
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; kit.deco(x + Math.cos(a) * 1.12, top + 1.2, z + Math.sin(a) * 1.12, 0.08, 1.8, 0.08, 0x3a3f4a); }
  kit.cone(x, top + 2.6, z, 1.5, 1.2, 0xe8322b, { seg: 10 });
  kit.sphere(x, top + 3.3, z, 0.22, 0x3a3f4a, { seg: 6 });
  kit.sphere(x, top + 1.25, z, 0.55, 0xfff4c2, { seg: 8 });
  (game.lamps ||= []).push([x, top + 1.25, z]);
  // door + windows
  kit.deco(x, base + 1.1, z + r0 - 0.02, 1.0, 2.0, 0.12, 0x6b4a2a);
  for (const h of [6, 11]) kit.deco(x, base + h, z + r0 - 0.25 - h * 0.035, 0.6, 0.8, 0.12, 0x9fd8ff);
  // gallery rail with a gap at the ladder (east side)
  for (let i = 0; i < 16; i++) {
    const a0 = i / 16 * Math.PI * 2, a1 = (i + 1) / 16 * Math.PI * 2, am = (a0 + a1) / 2;
    if (Math.abs(Math.atan2(Math.sin(am), Math.cos(am))) < 0.25) continue;
    const rx = x + Math.cos(am) * 2.6, rz = z + Math.sin(am) * 2.6, len = 2.6 * (a1 - a0) + 0.05;
    kit.box(rx, top + 1.3, rz, 0.06, 0.06, len, 0xffffff, { yaw: -am });
    kit.deco(x + Math.cos(a0) * 2.6, top + 0.8, z + Math.sin(a0) * 2.6, 0.06, 1.0, 0.06, 0xffffff);
    game.physics.box(rx, top + 0.8, rz, 0.08, 1.0, len, { yaw: -am });
  }
  // ladder up the east side to the gallery
  const lx = x + 2.95;
  for (let y = base + 2; y < top; y += 4) kit.deco(lx - 0.6, y, z, 1.0, 0.08, 0.08, 0x3a3f4a);
  climb(game, kit, lx, z, base, top + 0.3, -1, 0, 0x3a3f4a);
  R.present('cove-lighthouse', 'hat:sailor', x - 1.8, z + 1.2, top + 1.5, 'on the lighthouse gallery');
  R.coins(x, z, top + 2, 'ring', 6, 2.1);
  R.sign('LIGHTHOUSE', x + 4.2, g + 2.4, z + 3.6, Math.PI / 2, 3.6, '#e8322b', '#ffffff');
  kit.cyl(x + 4.2, g + 1.1, z + 2, 0.1, 2.2, 0x6b4a2a); kit.cyl(x + 4.2, g + 1.1, z + 5.2, 0.1, 2.2, 0x6b4a2a);
  // the rotating beam (night only)
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const beam = new THREE.Group();
  for (const s of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(4, 60, 12, 1, true), beamMat);
    c.rotation.z = s * Math.PI / 2; c.position.x = -s * 30;
    beam.add(c);
  }
  beam.position.set(x, top + 1.25, z); beam.userData.noCull = true;
  game.scene.add(beam);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture(), color: 0xfff2b0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(6); glow.position.copy(beam.position); glow.userData.noCull = true;
  game.scene.add(glow);
  game.updaters.push((dt, t) => {
    const n = game.nightLight ?? 0;
    beam.visible = glow.visible = n > 0.15;
    beam.rotation.y = t * 0.6;
    beamMat.opacity = 0.09 * n;
  });
}
