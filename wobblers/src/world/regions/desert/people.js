// Dusty Dunes folk: desert NPC roles (registered with registerRole so other
// code can spawn them too, but spawned here from the def objects so a role of
// the same name from another region can't change their look), their hats and
// props, and where everybody stands, wanders or patrols.
import { registerRole, registerHat, OUTFITS } from '../../../npc.js';
import { TOWN, OASIS, DIG, GAS, MINE, PYRAMID, canyonZ, CANYON_Y } from './layout.js';

const PI = Math.PI, HAND = -0.13 * 1.0;

// ---- hats (head-local frame, R = head radius) ----------------------------------------------
registerHat('dd_sheriff', (b, R) => {
  b.cyl(R * 1.55, R * 1.55, 0.03, 0x7a4a26, [0, R * 0.6, 0], null, 22);
  b.cyl(R * 0.62, R * 0.78, R * 0.75, 0x7a4a26, [0, R * 0.98, 0], null, 16);
  b.cyl(R * 0.79, R * 0.79, R * 0.13, 0x3a2a1a, [0, R * 0.7, 0], null, 16);
  for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2; b.cone(R * 0.07, R * 0.2, 0xffd23f, [Math.sin(a) * R * 0.09, R * 0.98 + Math.cos(a) * R * 0.09, R * 0.74], [0, 0, -a], 4); }
});
registerHat('dd_prospector', (b, R) => {
  b.cyl(R * 1.35, R * 1.45, 0.04, 0x8a6a3a, [0, R * 0.62, 0], [0.12, 0, 0.06], 18);
  b.sphere(R * 0.8, 0x8a6a3a, [0, R * 0.85, 0], [1, 0.75, 1], 14);
  b.sphere(R * 0.72, 0xd8d8d8, [0, -R * 0.55, R * 0.62], [1.05, 0.95, 0.6], 12); // big grey beard
  b.sphere(R * 0.3, 0xd8d8d8, [0, -R * 0.05, R * 0.95], [1.6, 0.5, 0.6], 10);    // moustache
});
registerHat('dd_pith', (b, R) => {
  b.sphere(R * 1.08, 0xe8dcb0, [0, R * 0.45, 0], [1, 0.62, 1.05], 16);
  b.cyl(R * 1.3, R * 1.3, 0.03, 0xe8dcb0, [0, R * 0.42, 0], null, 20);
  for (const s of [-1, 1]) b.cyl(R * 0.22, R * 0.22, R * 0.12, 0x6b4a2a, [s * R * 0.28, R * 0.72, R * 0.88], [PI / 2 - 0.4, 0, 0], 10); // goggles
  b.box(R * 0.2, R * 0.06, R * 0.06, 0x6b4a2a, [0, R * 0.72, R * 0.92]);
});
registerHat('dd_keffiyeh', (b, R) => {
  b.sphere(R * 1.1, 0xf2eee4, [0, R * 0.2, -R * 0.08], [1, 0.95, 1.05], 16);
  b.box(R * 1.9, R * 1.4, R * 0.4, 0xf2eee4, [0, -R * 0.45, -R * 0.75], [0.3, 0, 0]);
  b.torus(R * 0.86, R * 0.1, 0x2a2a33, [0, R * 0.68, 0], [PI / 2, 0, 0], 18);
  b.torus(R * 0.86, R * 0.06, 0xc8343c, [0, R * 0.56, 0], [PI / 2, 0, 0], 18);
});
registerHat('dd_bandit', (b, R) => {
  b.cyl(R * 1.5, R * 1.5, 0.03, 0x2a2a33, [0, R * 0.6, 0], null, 22);
  b.cyl(R * 0.6, R * 0.76, R * 0.75, 0x2a2a33, [0, R * 0.98, 0], null, 16);
  b.box(R * 1.6, R * 0.5, R * 0.6, 0xc8343c, [0, -R * 0.35, R * 0.72], [-0.3, 0, 0]); // bandana mask
});

// ---- outfits + props ------------------------------------------------------------------------
const badge = (part, b) => { if (part === 'chest') { for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2; b.cone(0.022, 0.06, 0xffd23f, [0.1 + Math.sin(a) * 0.02, 0.05 + Math.cos(a) * 0.02, 0.215], [PI / 2, 0, -a], 4); } } };
const robe = (part, b) => {
  if (part === 'hips') b.cyl(0.21, 0.27, 0.42, 0xe8dcc0, [0, -0.08, 0], null, 14);
  if (part === 'chest') for (const s of [-1, 1]) b.box(0.07, 0.38, 0.03, 0xc8343c, [s * 0.1, -0.05, 0.205]);
};
const plaid = (part, b) => { if (part === 'chest') for (let i = 0; i < 3; i++) b.box(0.44, 0.03, 0.42, 0x7a1a1a, [0, -0.12 + i * 0.1, 0]); };
const props = {
  pickaxe(b) { b.cyl(0.02, 0.02, 1.0, 0x8a5a36, [0, HAND + 0.3, 0.05], null, 6); b.cyl(0.03, 0.012, 0.65, 0x8a8f96, [0, HAND + 0.78, 0.05], [0, 0, PI / 2], 6); },
  brush(b) { b.cyl(0.015, 0.015, 0.25, 0x8a5a36, [0, HAND - 0.06, 0.06], [1.2, 0, 0], 5); b.box(0.06, 0.08, 0.04, 0xe8c66a, [0, HAND - 0.12, 0.17]); },
  staff(b) { b.cyl(0.025, 0.025, 1.6, 0x8a5a36, [0, HAND + 0.3, 0.05], null, 6); b.torus(0.08, 0.02, 0x8a5a36, [0, HAND + 1.1, 0.12], [0, PI / 2, 0], 8); },
  spatula(b) { b.cyl(0.014, 0.014, 0.35, 0x2a2a33, [0, HAND - 0.05, 0.08], [1.0, 0, 0], 5); b.box(0.12, 0.01, 0.14, 0xcfcfcf, [0, HAND - 0.17, 0.24]); },
  glass(b) { b.cyl(0.04, 0.035, 0.1, 0xd8e8f0, [0, HAND + 0.02, 0.07], null, 8); b.cyl(0.036, 0.036, 0.05, 0xd8a03a, [0, HAND, 0.07], null, 8); },
};

// ---- roles ----------------------------------------------------------------------------------
export const DESERT_ROLES = {
  sheriff: { colors: { shirt: 0xe8dcc0, pants: 0x6b4a2a }, hat: 'dd_sheriff', face: 'Moustache', outfit: ['vest', 'belt', badge], prop: 'lasso', behaviour: 'patrol', speed: 0.5, flee: false,
    lines: ['Keep the peace, partner.', 'No funny business in my town!', 'Seen Wobbly Pete? He\'s in the cell.', 'Howdy, stranger.'],
    hitLines: ['You\'re under arrest!', 'That\'s a night in the cell for you!', 'Hey! I\'m the law!'], emotes: ['point', 'flex'] },
  prospector: { colors: { shirt: 0xc8343c, pants: 0x7a5a3a }, hat: 'dd_prospector', outfit: ['belt', plaid], prop: props.pickaxe, behaviour: 'wander', speed: 0.4,
    lines: ['Gold in them thar hills!', 'Ride the mine cart, it\'s a hoot!', 'Mind your head in the mine.', 'Eureka! ...oh, it\'s a rock.'],
    hitLines: ['Dagnabbit!', 'Varmint!', 'Watch it, whippersnapper!'], emotes: ['cheer', 'point'] },
  archaeologist: { colors: { shirt: 0xd8c89a, pants: 0x9a845a }, hat: 'dd_pith', outfit: ['backpack', 'belt', (n, b) => OUTFITS.scarf(n, b, 0xf2eee4)], prop: props.brush, behaviour: 'wander', speed: 0.45,
    lines: ['Careful! That\'s a T-Wobblesaurus!', 'Bones! Bones everywhere!', 'They say the pyramid hides a secret door...', 'Try the west side of the pyramid.'],
    hitLines: ['My specimens!', 'Ow! Have some respect for science!'], emotes: ['point', 'clap'] },
  camelHerder: { colors: { shirt: 0xe8dcc0, pants: 0xe8dcc0 }, hat: 'dd_keffiyeh', outfit: [robe], prop: props.staff, behaviour: 'wander', speed: 0.4,
    lines: ['My camels are friendly. Mostly.', 'Hop on a camel, press Y!', 'Cool water at the oasis.', 'Camels never get thirsty!'],
    hitLines: ['Hey! Mind the camels!', 'Rude!'], emotes: ['wave', 'bow'] },
  dinerCook: { colors: { shirt: 0xffffff, pants: 0x2a2a33 }, hat: 'chef', outfit: ['apron'], prop: props.spatula, behaviour: 'idle',
    lines: ['Order up!', 'Cactus burger, extra spicy?', 'Pie\'s fresh today!', 'Fill her up out front!'], emotes: ['wave', 'clap'] },
  bartender: { colors: { shirt: 0xffffff, pants: 0x2a2a33 }, hat: 'none', face: 'Moustache', outfit: ['vest', (n, b) => { if (n === 'chest') b.box(0.12, 0.05, 0.03, 0xc8343c, [0, 0.2, 0.2]); }], prop: props.glass, behaviour: 'idle',
    lines: ['What\'ll it be?', 'Sarsaparilla, coming up!', 'Play us a tune on that piano!', 'No brawling in my saloon!'], emotes: ['wave'] },
  outlaw: { colors: { shirt: 0x2a2a33, pants: 0x3b3b44 }, hat: 'dd_bandit', face: 'Grumpy', outfit: ['belt'], behaviour: 'idle', flee: false,
    lines: ['Lemme outta here!', 'I didn\'t do nothin\'!', 'Psst... got the key?', 'I\'ll be back...'], hitLines: ['Ow! Lawyer!'], emotes: ['laugh'] },
};
for (const [k, d] of Object.entries(DESERT_ROLES)) registerRole(k, { ...d, role: k });

function spawn(R, role, x, z, opts = {}, floorY = null) {
  const def = typeof role === 'string' && DESERT_ROLES[role] ? { ...DESERT_ROLES[role], role } : role;
  const n = R.npc(def, x, z, opts);
  // game.cullSmall measures distance from an object's position, and an NPC's group sits at the
  // origin (its parts carry world positions), so far from (0, 0) it would always be culled
  if (n) n.group.userData.noCull = true;
  if (n && floorY != null) { // indoors: keep them under the roof
    n.parkPos = { x, y: floorY + 0.05, z };
    n.groundY = function groundY(px, pz, fromY) { return Math.max(this.game.groundHeight(px, pz, Math.min(fromY ?? floorY + 2.5, floorY + 2.5)), floorY - 0.2) + 0.05; };
  }
  return n;
}

// NPC ragdolls cost ~25 ms each to build, so the desert folk are spawned lazily,
// one per physics step, the first time a player comes within ~200 m of the island.
export function buildPeople(game, kit, R) {
  const ST = TOWN.street, fy = TOWN.y + 0.3, queue = [], list = [];
  const pending = { push: (f) => queue.push(f) };
  pending.push(() => spawn(R, 'sheriff', -1003, ST - 2, { path: [[-1003, ST - 2], [-960, ST + 1], [-912, ST - 1], [-960, ST - 3], [-1003, ST - 5.5]] }));
  pending.push(() => spawn(R, 'bartender', -973, -50, { yaw: 0 }, fy));
  pending.push(() => spawn(R, 'outlaw', -998.5, -46.5, { yaw: 0 }, fy));
  pending.push(() => spawn(R, 'cowboy', -955, ST + 1, { area: { x: -960, z: ST, r: 20 } }));
  pending.push(() => spawn(R, 'cowboy', -978, -4, { area: { x: -976, z: -4, r: 6 }, colors: { shirt: 0xff8ab8, pants: 0x3b5c9a, hat: 0xf2e8d8 }, face: 'Lashes', lines: ['Howdy!', 'Wanna ride a horse? Press Y!', 'Yeehaw!'] }));
  pending.push(() => spawn(R, 'townsfolk', -942, -40, { behaviour: 'wander', area: { x: -942, z: -44, r: 4 }, colors: { shirt: 0x3f8cff }, hat: 'none', outfit: ['apron'], lines: ['Welcome to the general store!', 'Fresh beans!', 'Mind the barrels.'] }, fy));
  const sx = MINE.station - 20;
  pending.push(() => spawn(R, 'prospector', sx, canyonZ(sx) + 4.5, { area: { x: sx + 10, z: canyonZ(sx + 10) + 4, r: 9 } }));
  pending.push(() => spawn(R, 'archaeologist', (DIG.x0 + DIG.x1) / 2 + 2, (DIG.z0 + DIG.z1) / 2 + 3, { area: { x: (DIG.x0 + DIG.x1) / 2, z: (DIG.z0 + DIG.z1) / 2, r: 6 } }));
  pending.push(() => spawn(R, 'explorer', PYRAMID.x + PYRAMID.half + 8, PYRAMID.z - 6, { area: { x: PYRAMID.x + PYRAMID.half + 8, z: PYRAMID.z, r: 10 }, lines: ['This pyramid is ancient!', 'The stairs go all the way up!', 'I heard there\'s treasure inside...'] }));
  pending.push(() => spawn(R, 'camelHerder', OASIS.x + OASIS.r + 6, OASIS.z - 2, { area: { x: OASIS.x + OASIS.r + 8, z: OASIS.z, r: 8 } }));
  pending.push(() => spawn(R, 'dinerCook', GAS.x - 10.5, GAS.z - 9.2, { yaw: 0 }, GAS.y + 0.05));
  pending.push(() => spawn(R, 'townsfolk', -790, 46, { behaviour: 'idle', colors: { shirt: 0xffd23f }, hat: 'cowboy', lines: ['Ferry\'s on its way!', 'Welcome to Dusty Dunes!', 'Hot enough for ya?'] }));
  game.desertPeople = list;
  const [x0, x1, z0, z1] = R.bounds;
  let k = 0;
  const step = () => {
    if (!queue.length) return;
    if (!list.length && k++ % 30) return;
    if (!list.length && !game.players.some((p) => { const c = p.chest.translation(); return c.x > x0 - 200 && c.x < x1 + 200 && c.z > z0 - 200 && c.z < z1 + 200; })) return;
    const n = queue.shift()();
    if (n) list.push(n);
  };
  game.steppers.push(step);
  game.desertSpawnAll = () => { while (queue.length) { const n = queue.shift()(); if (n) list.push(n); } };
  void CANYON_Y;
}
