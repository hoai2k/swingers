// Phone booths: red call boxes (sign text `PHONE`) round the islands. Y at a
// booth (a use spot) opens the garage list: every vehicle this player has
// (the phone's list minus anything still locked at the car dealer), and the
// chosen one pops in on a clear spot right outside the booth. It is the
// phone's own panel and spawner (phone.js PhonePanel / callVehicle with a
// `from` point), so the one-called-vehicle-per-player rule still holds.
// Booths are drawn on the map (game.mapOverlays) and listed in game.booths.
import { Local, useSpot } from './common.js';
import { signMesh } from '../mesh.js';
import { PhonePanel, CALLABLE } from '../phone.js';

// [name, x, z, yaw] — yaw faces the open front (where vehicles appear), found
// by a clearance probe: flat ground, nothing in the box, room for a car ahead.
export const BOOTHS = [
  ['Town', -36, -52, Math.PI],
  ['Fun Park', -180, 10, Math.PI],
  ['South pier', -134, 316, -Math.PI / 2],
  ['North pier', -99, -324, -Math.PI / 2],
  ['Bigtown', 900, -8, 0],
  ['Bigtown bridge', 759, 109, 0],
  ['Frostpeak village', -1, -801, 0],
  ['Frostpeak dock', 73, -745, -Math.PI / 2],
  ['Dustville', -960, -30, 0],
  ['Desert dock', -772, 40, Math.PI / 2],
  ['Stilt village', -409, 764, Math.PI / 2],
  ['Coconut Cove harbour', 469, 619, 0],
];

const RED = 0xd42a2a, DARK = 0xa01c1c, GLASS = 0xbfe6ff;

// The vehicles a player can take from a booth: everything on the phone that
// isn't locked (bought at the car dealer, or free).
export const garageList = (game) => CALLABLE.filter((c) => !game.vehicleLock?.(c.id));

function booth(game, kit, name, x, z, yaw) {
  const y0 = game.groundHeight(x, z, game.terrain.groundAt(x, z) + 4);
  const L = new Local(kit, x, z, yaw, y0);
  L.box(0, 0.06, 0, 1.4, 0.12, 1.4, 0x8a8a92);                       // step
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) L.box(sx * 0.6, 1.3, sz * 0.6, 0.14, 2.4, 0.14, RED);
  L.box(0, 1.3, -0.6, 1.06, 2.4, 0.08, RED);                          // back wall
  for (const sx of [-1, 1]) {                                          // glazed sides: frame bars + panes
    L.box(sx * 0.6, 1.25, 0, 0.06, 2.3, 1.06, GLASS, { round: 0.01 });
    for (const yy of [0.55, 1.05, 1.55, 2.05]) L.deco(sx * 0.63, yy, 0, 0.04, 0.05, 1.08, RED);
    L.deco(sx * 0.63, 1.3, 0, 0.04, 2.4, 0.05, RED);
  }
  L.deco(0, 0.4, 0.6, 1.06, 0.08, 0.06, RED);                         // door frame
  L.box(0, 2.58, 0, 1.36, 0.22, 1.36, RED);                           // roof
  L.deco(0, 2.76, 0, 1.1, 0.14, 1.1, DARK, { round: 0.04 });
  L.deco(0, 2.9, 0, 0.5, 0.14, 0.5, DARK, { round: 0.04 });
  // the telephone on the back wall
  L.deco(0, 1.45, -0.52, 0.34, 0.46, 0.1, 0x2a2a30);
  L.deco(0, 1.6, -0.45, 0.28, 0.08, 0.06, 0x111111);
  L.deco(0, 1.35, -0.47, 0.12, 0.12, 0.03, 0xdddddd);
  // PHONE signs on all four sides of the roof band
  for (let k = 0; k < 4; k++) {
    const s = signMesh('PHONE', 1.08, '#d42a2a', '#ffffff');
    const a = yaw + k * Math.PI / 2, p = L.v3(Math.sin(k * Math.PI / 2) * 0.69, 2.58, Math.cos(k * Math.PI / 2) * 0.69);
    s.position.set(p.x, p.y, p.z); s.rotation.y = a;
    game.scene.add(s);
  }
  // use spot: inside the booth (Y from inside or right in front)
  const sp = L.v3(0, 1.1, 0.15);
  const from = L.v3(0, 1.0, 0.9); from.yaw = yaw;
  const seat = useSpot(game, sp.x, sp.y, sp.z, 'Phone booth', (p) => openGarage(game, p, from, name));
  seat.labelFor = () => 'Phone booth <small>your vehicles</small>';
  return { name, x, z, yaw, y: y0, from, seat };
}

export function openGarage(game, p, from, name = 'Phone booth') {
  const ui = game.ui;
  if (!ui) return;
  const list = garageList(game);
  ui.setPanel(p, new PhonePanel(ui, p, {
    list, from, title: 'Garage', sub: name.toLowerCase(),
    done: (c) => `${c.name} is waiting outside!`,
  }));
}

export function buildBooths(game, kit) {
  game.physics.world.updateSceneQueries?.(); // see the static world built so far
  game.booths = BOOTHS.map(([name, x, z, yaw]) => booth(game, kit, name, x, z, yaw));
  (game.mapOverlays ||= []).push((ctx, sx, sy, p, zoom, s) => {
    const W = ctx.canvas.width, H = ctx.canvas.height, k = Math.max(0.7, s);
    for (const b of game.booths) {
      const X = sx(b.x), Y = sy(b.z);
      if (X < -20 || X > W + 20 || Y < -20 || Y > H + 20) continue;
      const w = 7 * k, h = 11 * k;
      ctx.fillStyle = '#d42a2a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.rect(X - w / 2, Y - h / 2, w, h); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#bfe6ff'; ctx.fillRect(X - w * 0.28, Y - h * 0.18, w * 0.56, h * 0.5);
      if (zoom > 1.2) {
        ctx.font = `800 ${Math.round(10 * k)}px "Trebuchet MS", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(20,30,60,.8)'; ctx.lineWidth = 3; ctx.fillStyle = '#fff';
        ctx.strokeText('Phone', X, Y + h / 2 + 8 * k); ctx.fillText('Phone', X, Y + h / 2 + 8 * k);
      }
    }
  });
}
