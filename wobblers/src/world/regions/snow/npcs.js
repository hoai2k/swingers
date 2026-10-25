// Frostpeak folk: snow roles (registered here) and where they stand.
import { registerRole, registerHat, OUTFITS } from '../../../npc.js';
import { VILLAGE, LIFT, TOP, LAKE, CAVE, CABIN, HAMLET, SUMMIT, JUMP } from './layout.js';

// ---- hats ------------------------------------------------------------------------------
const goggles = (b, R, y = 0.2, frame = 0x222228) => {
  b.rbox(R * 1.25, R * 0.42, R * 0.3, R * 0.14, frame, [0, R * y, R * 0.9], [0.12, 0, 0]);
  b.rbox(R * 1.1, R * 0.32, R * 0.12, R * 0.1, 0xff7a3a, [0, R * y, R * 1.04], [0.12, 0, 0]);
  b.rbox(R * 1.0, R * 0.12, R * 0.12, R * 0.05, 0x5ac8ff, [0, R * (y + 0.07), R * 1.08], [0.12, 0, 0]);
  b.torus(R * 0.98, R * 0.08, frame, [0, R * y * 0.6, 0], [Math.PI / 2 - 0.12, 0, 0], 20);
};
registerHat('snow_helmet', (b, R, c) => { b.sphere(R * 1.07, c, [0, R * 0.32, 0], [1, 0.82, 1.05], 18); goggles(b, R, 0.25); });
registerHat('snow_beanie', (b, R, c) => { // bobble beanie with goggles pushed up
  b.sphere(R * 1.05, c, [0, R * 0.34, 0], [1, 0.8, 1.02], 16);
  b.cyl(R * 1.04, R * 1.06, R * 0.22, 0xffffff, [0, R * 0.22, 0], null, 18);
  b.sphere(R * 0.3, 0xffffff, [0, R * 1.18, 0], null, 10);
  goggles(b, R, 0.55);
});
registerHat('snow_headset', (b, R, c) => { // beanie + radio headset (lift operator)
  b.sphere(R * 1.05, c, [0, R * 0.34, 0], [1, 0.8, 1.02], 16);
  b.cyl(R * 1.04, R * 1.06, R * 0.2, c, [0, R * 0.2, 0], null, 18);
  for (const s of [-1, 1]) b.cyl(R * 0.32, R * 0.32, R * 0.2, 0x222228, [s * R * 1.02, R * 0.02, 0], [0, 0, Math.PI / 2], 12);
  b.torus(R * 1.05, R * 0.06, 0x222228, [0, R * 0.2, 0], [0, 0, 0], 18);
  b.cyl(R * 0.04, R * 0.04, R * 0.7, 0x222228, [R * 0.85, -R * 0.3, R * 0.55], [0.9, 0.5, 0], 6);
});
registerHat('snow_yeti', (b, R) => { // the yeti costume head: shaggy white hood, little horns, open face
  const fur = 0xf0f4f8;
  b.sphere(R * 1.18, fur, [0, R * 0.32, -R * 0.12], [1, 0.95, 1], 14);
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; b.sphere(R * 0.32, fur, [Math.sin(a) * R * 1.0, R * (0.75 + 0.12 * Math.cos(a * 3)), Math.cos(a) * R * 0.85 - R * 0.15], null, 7); }
  for (const s of [-1, 1]) b.cone(R * 0.16, R * 0.55, 0xc8d8e8, [s * R * 0.6, R * 1.3, -R * 0.1], [0, 0, -s * 0.45], 7);
  b.torus(R * 0.82, R * 0.16, fur, [0, R * 0.05, R * 0.55], [0.2, 0, 0], 14); // face opening rim
});
registerHat('snow_bobble', (b, R, c) => {
  b.sphere(R * 1.05, c, [0, R * 0.34, 0], [1, 0.8, 1.02], 16);
  for (let i = 0; i < 3; i++) b.cyl(R * (1.0 - i * 0.06), R * (1.02 - i * 0.06), R * 0.08, 0xffffff, [0, R * (0.25 + i * 0.25), 0], null, 18);
  b.sphere(R * 0.32, 0xff5a8a, [0, R * 1.2, 0], null, 10);
});

// ---- outfits and props ----------------------------------------------------------------
const puffer = (col) => (part, b) => { // puffy jacket rings
  if (part === 'chest') for (const y of [-0.12, 0.02, 0.15]) b.torus(0.25 - Math.abs(y) * 0.25, 0.045, col, [0, y, 0], [Math.PI / 2, 0, 0], 16);
};
const yetiFur = (part, b) => {
  const fur = 0xf0f4f8;
  if (part === 'chest') { for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; b.sphere(0.12, fur, [Math.sin(a) * 0.22, (i % 3) * 0.1 - 0.12, Math.cos(a) * 0.2], null, 6); } }
  if (part === 'hips') for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; b.sphere(0.1, fur, [Math.sin(a) * 0.2, -0.05, Math.cos(a) * 0.18], null, 6); }
};
const patrolCross = (part, b) => {
  if (part === 'chest') { b.box(0.16, 0.05, 0.02, 0xffffff, [0, 0.03, 0.205]); b.box(0.05, 0.16, 0.02, 0xffffff, [0, 0.03, 0.206]); }
};
const PROP = {
  snowboard: (b) => { b.rbox(0.28, 1.45, 0.04, 0.12, 0x3fe0d0, [-0.18, -0.13 + 0.15, 0.05]); b.box(0.2, 0.06, 0.06, 0x222228, [-0.18, 0.35, 0.08]); b.box(0.2, 0.06, 0.06, 0x222228, [-0.18, -0.25, 0.08]); },
  mug: (b) => { b.cyl(0.06, 0.055, 0.13, 0xffffff, [0, -0.11, 0.08], null, 10); b.sphere(0.05, 0xfff4e8, [0, -0.03, 0.08], [1, 0.4, 1], 8); b.torus(0.035, 0.012, 0xffffff, [0.07, -0.11, 0.08], [0, 0, 0], 8); },
  poles: (b) => { for (const x of [-0.04, 0.04]) b.cyl(0.012, 0.012, 1.1, 0x3a3f4a, [x, -0.5, 0.05], null, 5); },
  scope: (b) => { b.cyl(0.04, 0.05, 0.42, 0xffffff, [0, -0.1, 0.15], [1.2, 0, 0], 8); },
};

// ---- roles -------------------------------------------------------------------------------
registerRole('snowboarder', { colors: { shirt: 0x55d85a, pants: 0x2a2a33, hat: 0x2a2a33 }, hat: 'snow_helmet', outfit: ['backpack'], prop: PROP.snowboard,
  behaviour: 'wander', speed: 0.7, lines: ['Shred the gnar!', 'Did you see that 360?', 'Sick powder today!', 'Radical!'], emotes: ['cheer', 'dance'] });
registerRole('liftop', { colors: { shirt: 0xe8322b, pants: 0x2a2a33, hat: 0x2a2a33 }, hat: 'snow_headset', outfit: [puffer(0xc8282b)], behaviour: 'idle',
  lines: ['Sit down when the chair comes!', 'Mind the gap!', 'Keep the bar down!', 'Next chair, please!'], hitLines: ['Hey! I\'m working here!'], emotes: ['wave', 'point'] });
registerRole('yeti', { colors: { shirt: 0xf0f4f8, pants: 0xe8eef5 }, hat: 'snow_yeti', face: 'Surprised', outfit: [yetiFur], behaviour: 'wander', speed: 0.5,
  lines: ['RAWR! ...it\'s only a costume.', 'Have you seen a real yeti?', 'Grrr! Want a photo?', 'This suit is SO warm.'], hitLines: ['Ow! Yetis have feelings!'], emotes: ['flex', 'dance', 'wave'] });
registerRole('icefisher', { colors: { shirt: 0x3b5c9a, pants: 0x6a4a32, hat: 0xc8343c }, hat: 'snow_bobble', outfit: [puffer(0x2f4a7a), (n, b) => OUTFITS.scarf(n, b, 0xffd23f)], prop: 'rod', behaviour: 'sit',
  lines: ['Shh, they\'re biting.', 'Caught a frozen fish once!', 'Patience is the trick.'], emotes: ['point'] });
registerRole('cocoa', { colors: { shirt: 0x8a3a2a, pants: 0x4a2f1f, hat: 0xff5a5a }, hat: 'snow_bobble', outfit: ['apron'], prop: PROP.mug, behaviour: 'idle',
  lines: ['Hot cocoa! Marshmallows on top!', 'Warm your mittens!', 'Two coins a mug!'], emotes: ['wave', 'clap'] });
registerRole('skipatrol', { colors: { shirt: 0xd9342b, pants: 0xd9342b, hat: 0xd9342b }, hat: 'snow_helmet', outfit: [patrolCross, 'backpack'], behaviour: 'wander', speed: 0.7,
  lines: ['Ski safe!', 'Stay on the marked run!', 'Need a hand?'], emotes: ['wave', 'point'] });
registerRole('astronomer', { colors: { shirt: 0x3a3f5a, pants: 0x2a2a33, hat: 0x3f8cff }, hat: 'snow_bobble', face: 'Nerd', outfit: [(n, b) => OUTFITS.scarf(n, b, 0x3f8cff)], prop: PROP.scope, behaviour: 'wander', speed: 0.45,
  lines: ['Clear skies tonight!', 'Snow forecast: lots!', 'I can see Bigtown from here.', 'The stars up here are amazing.'], emotes: ['point', 'wave'] });
registerRole('snowskier', { colors: { shirt: 0xff5ac8, pants: 0x6a3c9a, hat: 0xffffff }, hat: 'snow_beanie', outfit: [puffer(0x3fe0d0)], prop: 'skis', behaviour: 'wander', speed: 0.6,
  lines: ['Fresh powder!', 'Race you down the blue run!', 'Brrr, my nose!', 'Love the chairlift!'], emotes: ['cheer', 'wave'] });

// Spawning a ragdoll NPC costs ~10 ms, so Frostpeak's folk are queued and
// spawned one per frame after the world is built (they start parked anyway).
export function spawnFolk(game, R) {
  const queue = [];
  const N = (role, x, z, o = {}) => queue.push([role, x, z, o]);
  const pump = () => {
    if (!queue.length) { const i = game.updaters.indexOf(pump); if (i >= 0) game.updaters.splice(i, 1); return; }
    const [role, x, z, o] = queue.shift();
    R.npc(role, x, z, o);
  };
  game.updaters.push(pump);
  game.snowFolkPending = () => queue.length;
  const V = VILLAGE;
  N('liftop', LIFT.x + 2.6 + 4.2, LIFT.zb + 3.4, { yaw: -Math.PI / 2 });
  N('liftop', LIFT.x - 2.6 - 4.2, LIFT.zt - 3.4, { yaw: Math.PI / 2, colors: { shirt: 0x3f8cff } });
  N('cocoa', 2, -787.5, { yaw: 0 });
  N('snowskier', -20, -806, { area: { x: -10, z: -805, r: 22 } });
  N('skier', 30, -790, { area: { x: 25, z: -795, r: 20 } });
  N('snowboarder', 15, -840, { area: { x: 10, z: -835, r: 14 } });
  N('snowskier', -40, -1076, { area: { x: -30, z: -1075, r: 9 }, colors: { shirt: 0xffd23f, pants: 0x2a62c9 } });
  N('snowboarder', -28, -1068, { area: { x: -28, z: -1074, r: 8 }, colors: { shirt: 0xff8a3d } });
  N('skipatrol', 60, -800, { area: { x: 45, z: -805, r: 25 } });
  N('yeti', CAVE.x + 2, CAVE.z + 18, { area: { x: CAVE.x, z: CAVE.z + 14, r: 10 } });
  N('icefisher', LAKE.x + 12, LAKE.z - 7.5);
  N('townsfolk', LAKE.x - 6, LAKE.z + 4, { area: { x: LAKE.x, z: LAKE.z, r: 18 }, hat: 'snow_bobble', colors: { shirt: 0xff5a8a, hat: 0xb46cff } });
  N('fisherman', (HAMLET.x0 + HAMLET.x1) / 2 + 6, HAMLET.z1 - 4, { area: { x: (HAMLET.x0 + HAMLET.x1) / 2, z: (HAMLET.z0 + HAMLET.z1) / 2, r: 14 } });
  N('astronomer', SUMMIT.x + 4, SUMMIT.z + 6, { area: { x: SUMMIT.x, z: SUMMIT.z, r: 9 } });
  N('townsfolk', CABIN.x, CABIN.z + 6, { area: { x: CABIN.x, z: CABIN.z + 4, r: 8 }, hat: 'beanie', colors: { shirt: 0x8a5a36, pants: 0x3b5c9a, hat: 0x55d85a } });
  N('skier', JUMP.x + 8, JUMP.zLip + 30, { area: { x: JUMP.x + 6, z: JUMP.zLip + 32, r: 10 } });
}
