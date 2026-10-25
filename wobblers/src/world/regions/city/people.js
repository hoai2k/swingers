// Bigtown's people and vehicles: city NPC roles (police officer, builder,
// street performer, hot-dog vendor, tourist, doorman, jogger, footballer,
// gardener, bin worker) and city vehicle types (taxi, limo, delivery truck,
// garbage truck, city bus), plus where they all are.
import { registerRole, OUTFITS } from '../../../npc.js';
import { VEHICLES, registerVehicle } from '../../../vehicles.js';
import { registerCallable } from '../../../phone.js';
import { signMesh } from '../../../mesh.js';

// ---- outfits / props -----------------------------------------------------------------
const hiVis = (part, b) => {
  if (part !== 'chest') return;
  for (const s of [-1, 1]) b.rbox(0.17, 0.36, 0.05, 0.02, 0xff8a1a, [s * 0.11, -0.02, 0.19], [0, s * 0.3, 0]);
  b.box(0.42, 0.04, 0.44, 0xe8f060, [0, -0.08, 0]);
  b.rbox(0.4, 0.34, 0.05, 0.02, 0xff8a1a, [0, -0.02, -0.2]);
};
const badge = (part, b) => { if (part === 'chest') { b.box(0.07, 0.08, 0.02, 0xffd23f, [-0.09, 0.07, 0.205]); b.box(0.32, 0.05, 0.02, 0x1f2b5c, [0, -0.17, 0.205]); } };
const redCoat = (part, b) => { if (part === 'chest') { for (const y of [0.08, -0.04, -0.16]) b.sphere(0.022, 0xffd23f, [0, y, 0.205], null, 6); b.box(0.42, 0.06, 0.44, 0xffd23f, [0, 0.18, 0]); } };
const jersey = (n) => (part, b) => { if (part === 'chest') b.box(0.12, 0.16, 0.02, 0xffffff, [0, 0.0, -0.205]); };
const HAND = -0.13 * 0.85; // ~ lower-arm hand offset used by npc.js props
const props = {
  guitar(b) {
    b.sphere(0.2, 0xc8803a, [0.05, HAND - 0.25, 0.12], [1, 1.2, 0.4], 12);
    b.cyl(0.05, 0.05, 0.02, 0x222222, [0.05, HAND - 0.2, 0.18], [Math.PI / 2, 0, 0], 10);
    b.box(0.05, 0.55, 0.03, 0x6b4a2a, [0.05, HAND + 0.15, 0.12]);
  },
  hotdog(b) { b.capsule(0.05, 0.16, 0xf2c27a, [0, HAND - 0.02, 0.08], [0, 0, Math.PI / 2]); b.capsule(0.03, 0.22, 0xc8503a, [0, HAND + 0.01, 0.08], [0, 0, Math.PI / 2]); },
  hammer(b) { b.cyl(0.02, 0.02, 0.4, 0x8a5a36, [0, HAND - 0.12, 0.05], null, 6); b.box(0.16, 0.06, 0.06, 0x666666, [0, HAND - 0.32, 0.05]); },
  whistle(b) { b.box(0.06, 0.03, 0.03, 0xdddddd, [0, HAND, 0.08]); },
  bag(b) { b.rbox(0.3, 0.32, 0.12, 0.04, 0xff6fae, [0, HAND - 0.22, 0]); },
  rake(b) { b.cyl(0.02, 0.02, 1.5, 0x8a5a36, [0, HAND + 0.2, 0.05], null, 6); b.box(0.36, 0.04, 0.04, 0x777777, [0, HAND - 0.55, 0.05]); },
  binbag(b) { b.sphere(0.2, 0x222228, [0, HAND - 0.28, 0], [1, 1.2, 1], 10); },
};

// ---- roles -------------------------------------------------------------------------
registerRole('police', {
  colors: { shirt: 0x2a4a9a, pants: 0x1f2b5c, hat: 0x1f2b5c }, hat: 'cap', outfit: ['belt', badge], prop: props.whistle, behaviour: 'patrol', speed: 0.5,
  lines: ['Move along, citizen!', 'No jaywalking!', 'Keep it wobbly.', 'Seen anything suspicious?', 'Stay safe out there!'],
  hitLines: ['Hey! That\'s an officer!', 'You\'re nicked!', 'Assaulting an officer?!'], emotes: ['point', 'wave'], flee: false,
});
registerRole('builder', {
  colors: { shirt: 0x6a6a72, pants: 0x8a6a3a, hat: 0xffd23f }, hat: 'hardhat', outfit: [hiVis, 'belt'], prop: props.hammer, behaviour: 'wander',
  lines: ['Hard hats on, please!', 'Mind the girders!', 'Tea break soon...', 'This\'ll be the tallest one yet!', 'Don\'t touch the crane!'],
  emotes: ['point', 'flex'], flee: false,
});
registerRole('performer', {
  colors: { shirt: 0xb46cff, pants: 0x2a2a33, hat: 0x2a2a33 }, hat: 'tophat', face: 'Cool shades', outfit: [(n, b) => OUTFITS.scarf(n, b, 0xffd23f)], prop: props.guitar, behaviour: 'idle',
  lines: ['Thank you, thank you!', 'Any requests?', 'Tips appreciated!', 'This one\'s a classic!'], emotes: ['dance', 'bow', 'cheer', 'dance'],
});
registerRole('hotdogvendor', {
  colors: { shirt: 0xffffff, pants: 0x2a2a33, hat: 0xe8322b }, hat: 'cap', outfit: ['apron'], prop: props.hotdog, behaviour: 'idle',
  lines: ['Hot dogs! Get your hot dogs!', 'Extra mustard?', 'Best dogs in Bigtown!', 'Press Y at the cart, pal!'], emotes: ['wave', 'point'],
});
registerRole('tourist', {
  colors: { shirt: 0xff7fc8, pants: 0xc8ad7a, hat: 0xffe080 }, hat: 'sunhat', face: 'Cool shades', outfit: ['backpack'], prop: 'camera', behaviour: 'wander', speed: 0.45,
  lines: ['Is that Bigtown Tower?!', 'Say cheese!', 'Which way to the beach?', 'So many tall buildings!', 'I love this city!'], emotes: ['point', 'cheer', 'wave'],
});
registerRole('doorman', {
  colors: { shirt: 0xc8343c, pants: 0x2a2a33, hat: 0x2a2a33 }, hat: 'tophat', face: 'Moustache', outfit: [redCoat], behaviour: 'idle',
  lines: ['Welcome to the hotel!', 'Lovely to see you.', 'Mind the revolving door!', 'Shall I call you a taxi?'], emotes: ['bow', 'wave'], flee: false,
});
registerRole('jogger', {
  colors: { shirt: 0x55d85a, pants: 0x2a2a33, hat: 0xffffff }, hat: 'cap', behaviour: 'wander', speed: 1.0,
  lines: ['On your left!', 'Ten more laps!', 'Feel the burn!'], emotes: ['flex'],
});
registerRole('footballer', {
  colors: { shirt: 0xe8322b, pants: 0xffffff }, hat: 'none', outfit: [jersey(9)], behaviour: 'wander', speed: 0.8,
  lines: ['Pass it here!', 'Gooooal!', 'Kick the big ball into the net!'], emotes: ['cheer', 'flex'],
});
registerRole('gardener', {
  colors: { shirt: 0x3c8a3c, pants: 0x6a4a2a }, hat: 'straw', outfit: ['apron'], prop: props.rake, behaviour: 'wander', speed: 0.4,
  lines: ['Keep off the flower beds!', 'Lovely day in the park.', 'The ducks are hungry.'], emotes: ['wave'],
});
registerRole('binworker', {
  colors: { shirt: 0x3a8a4a, pants: 0x2a2a33, hat: 0x3a8a4a }, hat: 'cap', outfit: [hiVis], prop: props.binbag, behaviour: 'wander',
  lines: ['Keep Bigtown tidy!', 'Bin day!', 'Phew, smelly one.'], emotes: ['wave'],
});
registerRole('shopper', {
  random: true, prop: props.bag, behaviour: 'wander', lines: ['Sale on at the shops!', 'Ooh, shiny!', 'Just browsing.', 'Hello!'], emotes: ['wave', 'clap'],
});

// ---- vehicles ---------------------------------------------------------------------------
const car = VEHICLES.car;
registerVehicle('taxi', {
  ...car, horn: 'car',
  mesh(b, def, color, P, v) {
    v.meshCar(P);
    const h = def.half, co = def.cabin.off, ch = def.cabin.half, top = co[1] + ch[1];
    for (let i = 0; i < 14; i++) for (const sx of [-1, 1]) b.box(0.02, 0.07, h[2] * 2 / 14, i % 2 ? 0x111111 : 0xffffff, [sx * (h[0] + 0.012), 0.2, -h[2] + (i + 0.5) * h[2] * 2 / 14]);
    b.rbox(0.8, 0.26, 0.3, 0.06, 0xffffff, [0, top + 0.13, co[2]]);
    for (const sd of [1, -1]) {
      const s = signMesh('TAXI', 0.75, '#ffd23f', '#222228');
      s.position.set(0, top + 0.14, co[2] + sd * 0.16); if (sd < 0) s.rotation.y = Math.PI;
      P.shell.add(s);
    }
  },
});
registerCallable({ id: 'taxi', type: 'taxi', name: 'Taxi', icon: 'car', color: 0xffc81e }, 'police');

registerVehicle('limo', {
  ...car, mass: 1700, half: [0.98, 0.32, 3.4], cabin: { half: [0.9, 0.45, 2.4], off: [0, 0.76, -0.45] },
  axles: [{ z: 2.55, x: 0.88, y: -0.1, r: 0.4, rest: 0.34, steer: 1, drive: 0.3 }, { z: -2.5, x: 0.88, y: -0.1, r: 0.4, rest: 0.34, steer: 0, drive: 0.7, hand: true }],
  accel: 7.5, maxSpeed: 24, steer: 0.6, grip: 1.4, camDist: 11, lights: { head: [0.05, 3.38], tail: [0.08, -3.4] },
  seats: [{ pos: [0.42, 0.14, 1.4], kind: 'driver' }, { pos: [-0.42, 0.14, 1.4] }, { pos: [0.42, 0.14, -0.6] }, { pos: [-0.42, 0.14, -0.6] }, { pos: [0.42, 0.14, -1.9] }, { pos: [-0.42, 0.14, -1.9] }],
  mesh(b, def, color, P, v) { v.meshCar(P); b.box(0.2, 0.05, 0.05, 0xdddddd, [0, def.half[1] + 0.05, def.half[2] - 0.1]); },
});

// box truck / garbage truck: chassis, cab in front, a body behind
const truck = (body) => ({
  mass: 3200, half: [1.1, 0.35, 3.2], cabin: { half: [1.05, 0.75, 0.85], off: [0, 1.1, 2.25] },
  axles: [{ z: 2.3, x: 0.98, y: -0.12, r: 0.5, rest: 0.42, steer: 1, drive: 0.3 }, { z: -2.0, x: 0.98, y: -0.12, r: 0.5, rest: 0.42, steer: 0, drive: 0.7, hand: true }],
  accel: 6.5, maxSpeed: 20, rev: 8, brakeDecel: 10, steer: 0.6, grip: 1.25, susp: { k: 17, c: 1.6 }, com: [0, -0.3, 0.2],
  seats: [{ pos: [0.45, 0.62, 2.2], kind: 'driver' }, { pos: [-0.45, 0.62, 2.2] }],
  camH: 2.6, camDist: 12, horn: 'truck', voice: 'bus', lights: { head: [0.1, 3.18], tail: [0.15, -3.2] },
  colliders(add, C, def) {
    const h = def.half;
    add(C.roundCuboid(h[0] - 0.08, h[1] - 0.08, h[2] - 0.08, 0.08));
    add(C.roundCuboid(...def.cabin.half.map((x) => x - 0.1), 0.1).setTranslation(...def.cabin.off));
    add(C.cuboid(1.08, body.h / 2, 2.15).setTranslation(0, h[1] + body.h / 2, -1.05));
  },
  mesh(b, def, color, P, v) {
    const { glass, dark } = P, h = def.half, co = def.cabin.off, ch = def.cabin.half;
    b.rbox(h[0] * 2, h[1] * 2, h[2] * 2, 0.1, 0x3a3f48, [0, 0, 0]);
    b.rbox(ch[0] * 2, ch[1] * 2, ch[2] * 2, 0.15, color, [0, co[1], co[2]]);
    glass.box(ch[0] * 2 - 0.2, 0.7, 0.04, 0, [0, co[1] + 0.3, co[2] + ch[2] + 0.01], [-0.1, 0, 0]);
    for (const sx of [-1, 1]) glass.box(0.04, 0.55, ch[2] * 1.2, 0, [sx * (ch[0] + 0.01), co[1] + 0.3, co[2] + 0.1]);
    b.box(1.2, 0.3, 0.06, 0xbbbbbb, [0, 0.15, h[2] + 0.02]);
    for (const a of def.axles) for (const sx of [-1, 1]) b.cyl(a.r + 0.07, a.r + 0.07, 0.1, dark, [sx * (h[0] - 0.02), a.y + 0.05, a.z], [0, 0, Math.PI / 2], 14);
    v.dash(b, 0.45, 0.85, co[2] + ch[2] - 0.15, 1.9);
    body.mesh(b, def, color, P, v);
  },
});
registerVehicle('delivery', truck({
  h: 2.4,
  mesh(b, def, color, P) {
    const h = def.half;
    b.rbox(2.2, 2.4, 4.3, 0.08, 0xf4f4f4, [0, h[1] + 1.2, -1.05]);
    b.box(2.22, 0.12, 4.32, color, [0, h[1] + 0.3, -1.05]);
    for (const sx of [-1, 1]) {
      const s = signMesh('DELIVERY', 3.2, '#ff8a1a', '#ffffff');
      s.position.set(sx * 1.115, h[1] + 1.5, -1.05); s.rotation.y = sx * Math.PI / 2;
      P.shell.add(s);
    }
    b.box(1.9, 2.0, 0.04, 0xdddddd, [0, h[1] + 1.2, -3.21]);
  },
}));
registerVehicle('garbage', truck({
  h: 2.2,
  mesh(b, def, color, P) {
    const h = def.half;
    b.rbox(2.16, 2.2, 3.6, 0.2, color, [0, h[1] + 1.1, -0.7]);
    b.rbox(2.16, 1.8, 1.2, 0.2, 0x55595f, [0, h[1] + 0.95, -3.0], [0.35, 0, 0]);
    for (const sx of [-1, 1]) b.box(0.03, 0.3, 3.4, 0xffd23f, [sx * 1.09, h[1] + 0.6, -0.7]);
    b.box(1.6, 0.1, 0.3, 0x333333, [0, 0.3, -3.25]);
  },
}));
registerVehicle('citybus', {
  ...VEHICLES.bus,
  mesh(b, def, color, P, v) {
    v.meshBus(P);
    const ch = def.cabin.half, co = def.cabin.off, top = co[1] + ch[1];
    const s = signMesh('CITY BUS', 1.9, '#222228', '#ffb020');
    s.position.set(0, top - 0.11, ch[2] + 0.04); P.shell.add(s);
    for (const sx of [-1, 1]) b.box(0.03, 0.3, ch[2] * 2 - 0.4, 0x2a62c9, [sx * (ch[0] + 0.012), 1.0, 0]);
  },
});

// ---- placement ----------------------------------------------------------------------
export function buildPeople(game, R) {
  // vehicles parked along the kerbs (lanes are at +-3 m from a road's centre line; parking strip at +-4.6)
  // spawned when a player first heads for Bigtown (R.later, see city.js), not at load
  const V = (type, x, z, yaw, c, o) => R.later(() => R.vehicle(type, x, z, yaw, c, o));
  V('taxi', 745, 75, Math.PI, 0xffc81e); V('taxi', 745, 83, Math.PI, 0xffc81e); V('taxi', 745, 91, Math.PI, 0xffc81e); // taxi rank at the bridge
  V('taxi', 844.6, -40, 0, 0xffc81e);
  V('limo', 765.4, -30, Math.PI, 0x16161c);                       // outside the hotel
  V('limo', 880, 64.6, Math.PI / 2, 0xf4f4f4);
  V('delivery', 774.6, 150, Math.PI, 0xff8a1a); // Market Street deliveries
  V('delivery', 925, 175.4, -Math.PI / 2, 0x3f8cff);
  V('garbage', 984.6, 30, Math.PI, 0x3a8a4a);
  V('citybus', 1015, 84.5, Math.PI / 2, 0xf4f4f4);
  V('citybus', 1015, 93.5, Math.PI / 2, 0x3f8cff);
  V('car', 765.4, 20, 0, 0xff4d4d); V('car', 774.6, 100, Math.PI, 0x4fd16a); V('car', 905.4, -110, 0, 0xb46cff);
  V('sports', 1054.6, 30, 0, 0xffd23f); V('pickup', 935, -145.4, Math.PI / 2, 0xc8503a); V('van', 935, 64.6, Math.PI / 2, 0xffffff);
  V('scooter', 812, 176, Math.PI / 2, 0xff7fc8);

  // people
  const N = (role, x, z, o = {}) => R.later(() => R.npc(role, x, z, o));
  N('doorman', 752, -34, { yaw: Math.PI / 2 });
  N('doorman', 871, -95.5, { yaw: 0, lines: ['Welcome to Bigtown Tower!', 'Elevator\'s round the side!', 'Great view from the top!'] });
  N('businessman', 870, -60, { area: { x: 875, z: -40, r: 25 } });
  N('businessman', 805, -30, { area: { x: 805, z: -30, r: 20 } });
  N('businessman', 945, 20, { area: { x: 945, z: 25, r: 20 } });
  N('businessman', 945, -105, { area: { x: 945, z: -110, r: 20 } });
  N('police', 848, -40, { path: [[848, -67], [902, -67], [902, -8], [848, -8]] });
  N('police', 1003, 40, { yaw: 0 });
  N('police', 778, 150, { path: [[778, 127], [778, 228], [832, 228], [832, 127]] });
  N('performer', 868, -26, { yaw: Math.PI });
  N('hotdogvendor', 860, -23, { yaw: 0 });
  N('tourist', 880, -50, { area: { x: 875, z: -50, r: 22 } });
  N('tourist', 880, -15, { area: { x: 875, z: -30, r: 22 } });
  N('tourist', 1070, 160, { area: { x: 1085, z: 170, r: 25 } });
  N('taxi', 750, 70, { yaw: -Math.PI / 2 });
  N('taxi', 848.5, -46, { yaw: -Math.PI / 2 });
  N('builder', 935, -170, { area: { x: 940, z: -190, r: 18 } });
  N('builder', 955, -220, { area: { x: 945, z: -215, r: 15 } });
  N('builder', 925, -230, { behaviour: 'idle', yaw: 0.5 });
  N('jogger', 1000, -90, { area: { x: 1050, z: -150, r: 50 } });
  N('jogger', 1062, 150, { area: { x: 1062, z: 180, r: 50 } });
  N('gardener', 1030, -140, { area: { x: 1030, z: -140, r: 20 } });
  N('footballer', 830, -200, { area: { x: 840, z: -200, r: 22 } });
  N('footballer', 850, -195, { area: { x: 840, z: -200, r: 22 }, colors: { shirt: 0x2a62c9 } });
  N('binworker', 962, 26, { area: { x: 940, z: 30, r: 20 } });
  N('chef', 786, 172, { behaviour: 'idle', yaw: Math.PI, lines: ['Pizza, fresh from the oven!', 'Mamma mia!'] });
  N('shopper', 860, 150, { area: { x: 870, z: 180, r: 28 } });
  N('shopper', 930, 150, { area: { x: 900, z: 180, r: 28 } });
  N('shopper', 800, 190, { area: { x: 820, z: 180, r: 24 } });
  N('lifeguard', 1112, 210, { yaw: Math.PI });
  N('surfer', 1095, 185, { area: { x: 1095, z: 190, r: 18 } });
  N('fisherman', 1101.5, 252, { yaw: Math.PI / 2 });
  N('townsfolk', 735, -120, { area: { x: 735, z: -150, r: 30 } });
  N('townsfolk', 735, 160, { area: { x: 735, z: 175, r: 20 } });
  N('townsfolk', 1015, -40, { area: { x: 1015, z: -30, r: 15 } });
}
