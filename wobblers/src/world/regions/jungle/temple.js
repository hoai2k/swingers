// Temple ruins: a mossy stepped pyramid on a terrace west of the village.
// Three lever posts stand round it, each topped by a coloured stone; a carved
// tablet beside the sealed stone door shows the order to pull them in (Y).
// The right order lights the braziers and the door rumbles down into the
// floor, opening the treasure chamber (a present, gold coins); a wrong pull
// fizzles and resets. The door closes again after a while.
import * as THREE from 'three';
import { RAPIER } from '../../../physics.js';
import { Builder } from '../../../mesh.js';
import { TEMPLE } from '../jungle.js';
import { useSpot, chime, tone, clunk } from '../../common.js';

const STONE = 0x8f8a78, STONE2 = 0x7d786a, MOSS = 0x5a8a3a, DARK = 0x4a463c;
const GEMS = { red: 0xe8322b, blue: 0x2a72e8, gold: 0xffc61a };
const ORDER = ['red', 'blue', 'gold'];

export function buildTemple(game, kit, R) {
  const { x: X, z: Z, y: Y } = TEMPLE;
  const L = new R.Local(kit, X, Z, 0, Y);
  const H1 = 4.2, W1 = 24, T = 2.6;
  // ---- tier 1: hollow (the chamber), door on the east face (+x) ------------------------
  const h = W1 / 2;
  L.wall(-h, -h, h, -h, H1, T, STONE, []);
  L.wall(-h, h, h, h, H1, T, STONE, []);
  L.wall(-h, -h + T / 2, -h, h - T / 2, H1, T, STONE2, []);
  L.wall(h, -h + T / 2, h, h - T / 2, H1, T, STONE2, [{ at: h - T / 2, w: 3, h: 3.2 }]);
  L.box(0, H1 + 0.4, 0, W1, 0.8, W1, STONE2);             // roof of the chamber = tier 1 top
  L.box(0, 0.08, 0, W1 - 2 * T, 0.16, W1 - 2 * T, DARK);    // chamber floor
  // ---- upper tiers + shrine -----------------------------------------------------------
  L.box(0, H1 + 0.8 + 1.75, 0, 17, 3.5, 17, STONE);
  L.box(0, H1 + 0.8 + 3.5 + 1.5, 0, 11, 3, 11, STONE2);
  const topY = H1 + 0.8 + 3.5 + 3;
  for (const [a, b] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) L.cyl(a, topY + 1.4, b, 0.4, 2.8, STONE, { seg: 6 });
  L.box(0, topY + 3.0, 0, 6, 0.6, 6, STONE2);
  L.box(0, topY + 3.6, 0, 4, 0.6, 4, STONE);
  // tiki face on the shrine's front
  L.box(0, topY + 1.2, -1.5, 1.6, 2.4, 1.2, 0x8a6a4a);
  for (const sx of [-1, 1]) L.deco(sx * 0.35, topY + 1.7, -2.12, 0.4, 0.3, 0.05, 0xffffff);
  L.deco(0, topY + 0.8, -2.12, 0.8, 0.2, 0.05, 0xffffff);
  R.coins(X, Z, Y + topY + 1, 'one', 1, 0, { big: true });
  // stairs up the north face (-z), all the way to the top
  L.stairs(0, -h - 5.5, 0, 0, -h + 0.2, H1 + 0.8, 4, STONE, STONE2);
  L.stairs(0, -8.5 - 3.5, H1 + 0.8, 0, -8.5 + 0.2, H1 + 4.3, 4, STONE, STONE2);
  L.stairs(0, -5.5 - 3, H1 + 4.3, 0, -5.5 + 0.2, topY, 4, STONE, STONE2);
  // moss, cracks, vines, broken pillars around the terrace
  const rnd = R.rng(31);
  for (let i = 0; i < 40; i++) {
    const side = (rnd() * 4) | 0, t = (rnd() - 0.5) * W1 * 0.9, y = rnd() * H1;
    const [lx, lz, yaw] = [[t, -h - T / 2 + 1.25, 0], [t, h + T / 2 - 1.25, 0], [-h - 0.05, t, Math.PI / 2], [h + 0.05, t, Math.PI / 2]][side];
    if (side === 3 && Math.abs(t) < 2.5) continue;
    L.deco(lx, y + 0.5, lz + (side === 0 ? -0.05 : side === 1 ? 0.05 : 0), 1 + rnd() * 2, 0.6 + rnd(), 0.12, rnd() < 0.6 ? MOSS : 0x6a9a42, { yaw });
  }
  for (let i = 0; i < 10; i++) { const a = rnd() * 6.28; L.deco(Math.cos(a) * 8.5, H1 + 0.8 + 3.5 - 1.2, Math.sin(a) * 8.5, 0.08, 2.6, 0.08, 0x3f7a2a); }
  for (const [px, pz, ph] of [[-17, -8, 3.5], [-17, 8, 1.6], [17, 15, 2.6], [-8, 17, 4], [9, -18, 1.2], [18, -12, 3.2]]) {
    L.cyl(px, ph / 2, pz, 0.6, ph, STONE, { seg: 6 });
    if (ph > 3) L.box(px, ph + 0.2, pz, 1.6, 0.4, 1.6, STONE2);
  }
  for (let i = 0; i < 8; i++) { const a = rnd() * 6.28, r = 15 + rnd() * 5; L.box(Math.cos(a) * r, 0.4, Math.sin(a) * r, 1.2, 0.8, 0.9, STONE2, { yaw: rnd() * 3 }); }

  // ---- the chamber: idol, gold, the present ------------------------------------------
  L.box(-6, 0.6, 0, 1.6, 1.2, 1.6, STONE2);
  L.box(-6, 1.7, 0, 0.9, 1.0, 0.9, 0xffc61a);
  L.deco(-5.53, 1.85, -0.2, 0.05, 0.16, 0.16, 0x1e1e24); L.deco(-5.53, 1.85, 0.2, 0.05, 0.16, 0.16, 0x1e1e24);
  for (let i = 0; i < 12; i++) { const a = i * 0.9, r = 1.5 + (i % 3) * 0.5; L.sphere(-6 + Math.cos(a) * r, 0.25, Math.sin(a) * r, 0.3 + (i % 2) * 0.12, 0xffc61a, { scale: [1, 0.5, 1], seg: 6 }); }
  for (const [a, b] of [[-8, -7], [-8, 7], [6, -7], [6, 7]]) { const p = L.v3(a, 0, b); torch(kit, p.x, p.z, Y); }
  game.interiorLights?.add(X - 2, Y + H1 - 0.3, Z, { color: 0xffb060, intensity: 8, range: 12, fixture: 'none' });
  R.present('jungle-temple', 'hat:parrot', X - 4.2, Z, Y + 2.5, 'in the treasure chamber of the temple ruins (pull the levers in the right order)');
  R.coins(X - 6, Z, Y + 2.5, 'ring', 10, 3.2);
  R.coins(X - 6, Z, Y + 3.5, 'one', 1, 0, { big: true, lift: 0.8 });

  // ---- the sealed door: kinematic slab that sinks into the floor -------------------------
  const W = game.physics.world;
  const dp = L.v3(h - T / 2, 1.6, 0);
  const db = new Builder();
  db.box(0.6, 3.2, 3, STONE2, [0, 0, 0]);
  db.box(0.66, 0.5, 0.5, 0xffc61a, [0, 0.6, 0]);
  for (const s of [-1, 1]) db.box(0.66, 2.6, 0.12, DARK, [0, 0, s * 0.8]);
  const dmesh = db.mesh(); game.scene.add(dmesh);
  const dbody = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(dp.x, dp.y, dp.z));
  W.createCollider(RAPIER.ColliderDesc.cuboid(0.3, 1.6, 1.5).setCollisionGroups(R.common.VEH_GROUPS), dbody);
  game.physics.objects.push({ body: dbody, mesh: dmesh, buoy: null, kind: 'ride' });
  // the tablet with the order (coloured stones) beside the door
  const tb = L.v3(h + 0.3, 0, 3.4);
  kit.box(tb.x + 0.6, Y + 1.0, tb.z, 0.3, 2.0, 1.6, STONE);
  ORDER.forEach((c, i) => kit.sphere(tb.x + 0.79, Y + 1.6 - i * 0.5, tb.z, 0.17, GEMS[c], { scale: [0.5, 1, 1], seg: 8 }));
  R.sign('TEMPLE RUINS', X + h + 9, Y + 2.4, Z - 6, Math.PI / 2, 4.2, '#7d786a', '#ffe36a');
  kit.cyl(X + h + 9, Y + 1, Z - 7.7, 0.12, 2.4, 0x6b4a2a); kit.cyl(X + h + 9, Y + 1, Z - 4.3, 0.12, 2.4, 0x6b4a2a);

  // ---- levers ------------------------------------------------------------------------------
  const st = { pulled: [], open: 0, doorY: 0 };
  const levers = [];
  const spots = { red: [0, -h - 8.5, Math.PI], gold: [-h - 4.5, 4, -Math.PI / 2], blue: [-3, h + 4.5, 0] };
  for (const [color, [lx, lz, yaw]] of Object.entries(spots)) {
    const p = L.v3(lx, 0, lz), g = Y;
    kit.box(p.x, g + 0.5, p.z, 1.0, 1.0, 1.0, STONE);
    kit.cyl(p.x, g + 1.3, p.z, 0.25, 0.6, STONE2, { seg: 6 });
    kit.sphere(p.x, g + 1.75, p.z, 0.32, GEMS[color], { seg: 8 });
    // lever arm: a small mesh that tips over when pulled
    const lb = new Builder();
    lb.cyl(0.05, 0.05, 1.1, 0x6b4a2a, [0, 0.55, 0], null, 6);
    lb.sphere(0.12, 0x2a2a2a, [0, 1.1, 0], null, 8);
    const arm = lb.mesh(); arm.position.set(p.x + Math.sin(yaw) * 0.55, g + 0.7, p.z + Math.cos(yaw) * 0.55); arm.rotation.set(0, yaw, -0.5);
    game.scene.add(arm);
    // brazier with a flame that lights up
    const bp = { x: p.x - Math.cos(yaw) * 1.6, z: p.z + Math.sin(yaw) * 1.6 };
    kit.cyl(bp.x, g + 0.6, bp.z, 0.18, 1.2, STONE2, { seg: 6 });
    kit.cyl(bp.x, g + 1.3, bp.z, 0.45, 0.3, DARK, { seg: 8, rTop: 0.55 });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 6), new THREE.MeshBasicMaterial({ color: 0xffa030 }));
    flame.position.set(bp.x, g + 1.9, bp.z); flame.visible = false;
    game.scene.add(flame);
    const lever = { color, arm, flame, on: false, p };
    levers.push(lever);
    useSpot(game, p.x + Math.sin(yaw) * 0.9, g + 1.0, p.z + Math.cos(yaw) * 0.9, 'Pull lever', (player) => pull(lever, player));
  }
  const reset = () => { st.pulled = []; for (const l of levers) { l.on = false; l.flame.visible = false; } };
  function pull(lever, player) {
    if (st.open > 0 || lever.on || st.resetT > 0) return;
    lever.on = true; lever.flame.visible = true; st.pulled.push(lever.color);
    clunk(game, lever.p, 0.6);
    const k = st.pulled.length - 1;
    if (st.pulled[k] !== ORDER[k]) {
      tone(game, lever.p, 220, 110, 0.5, 0.3, 'square');
      game.ui?.toast?.('The flames sputter out... wrong order!', player.color);
      st.resetT = 0.9;
      return;
    }
    chime(game, lever.p, [64 + k * 4, 68 + k * 4], 0.2);
    if (st.pulled.length === ORDER.length) {
      st.open = 45;
      chime(game, { x: X, y: Y + 2, z: Z }, [60, 64, 67, 72, 76], 0.3);
      game.ui?.toast?.(`P${player.index + 1} opened the temple door!`, player.color);
      game.life?.reward(player, 15, 'Temple puzzle!', { x: dp.x, y: dp.y, z: dp.z });
    }
  }
  game.physics.animate(dbody, (t, dt) => {
    if (st.open > 0) { st.open -= dt; if (st.open <= 0) reset(); }
    if (st.resetT > 0) { st.resetT -= dt; if (st.resetT <= 0) reset(); }
    const target = st.open > 0 ? -3.35 : 0;
    const prev = st.doorY;
    st.doorY += Math.max(-1.2 * dt, Math.min(1.2 * dt, target - st.doorY));
    if (Math.abs(st.doorY - prev) > 1e-4 && ((t * 8) | 0) % 2 === 0 && Math.random() < 0.15) tone(game, dp, 60, 50, 0.2, 0.15, 'sawtooth');
    dbody.setNextKinematicTranslation({ x: dp.x, y: dp.y + st.doorY, z: dp.z });
  });
  game.updaters.push((dt, t) => { for (const l of levers) { l.arm.rotation.z += ((l.on ? 0.5 : -0.5) - l.arm.rotation.z) * Math.min(1, dt * 8); if (l.on) l.flame.scale.set(1, 0.85 + Math.sin(t * 13 + l.p.x) * 0.15, 1); } });
  game.temple = { levers, st, pull: (c, p) => pull(levers.find((l) => l.color === c), p), door: dbody, ORDER };
  R.npc('explorer', X + h + 6, Z + 4, { area: { x: X + h + 6, z: Z, r: 8 }, lines: ['The stones hold the secret...', 'Red, then blue, then gold? Hmm.', 'This temple is ancient!'] });
}

function torch(kit, x, z, y) {
  kit.cyl(x, y + 0.9, z, 0.08, 1.8, 0x6b4a2a, { seg: 5, collide: false });
  kit.cone(x, y + 2.0, z, 0.16, 0.4, 0xfff4c2, { seg: 5 });
  (kit.game.lamps ||= []).push([x, y + 2.0, z]);
}
