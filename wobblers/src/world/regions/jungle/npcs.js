// NPC roles for Tiki Jungle and Coconut Cove (registerRole) plus the outfit
// bits they share: grass skirt, flower lei, a parrot on the shoulder, a
// Hawaiian shirt pattern, a paddle and a cocktail to hold.
import { registerRole, registerHat, OUTFITS } from '../../../npc.js';
import { S } from '../../../player.js';

const LEI = [0xff5a8a, 0xffd23f, 0xffffff, 0xff8a3d, 0xb46cff];
export const OUT = {
  grassSkirt(part, b) {
    if (part !== 'hips') return;
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; b.box(0.07, 0.3, 0.02, i % 2 ? 0xc8a85a : 0xa8903f, [Math.sin(a) * 0.19, -0.06, Math.cos(a) * 0.19], [0.15, a, 0, 'YXZ']); }
  },
  lei(part, b) {
    if (part !== 'chest') return;
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; b.sphere(0.045, LEI[i % LEI.length], [Math.sin(a) * 0.17, 0.2 - Math.max(0, Math.cos(a)) * 0.07, Math.cos(a) * 0.17], null, 6); }
  },
  parrot(part, b) {
    if (part !== 'chest') return;
    const x = 0.2, y = 0.3, z = -0.02;
    b.sphere(0.08, 0xe8322b, [x, y, z], [0.9, 1.2, 1], 8);
    b.sphere(0.06, 0xe8322b, [x, y + 0.12, z + 0.02], null, 8);
    b.cone(0.025, 0.06, 0xffd23f, [x, y + 0.11, z + 0.09], [Math.PI / 2, 0, 0], 5);
    b.box(0.04, 0.16, 0.03, 0x3f8cff, [x, y - 0.13, z - 0.06], [0.4, 0, 0]);
    for (const s of [-1, 1]) b.box(0.02, 0.1, 0.08, 0x3cae4a, [x + s * 0.07, y, z - 0.01], [0, 0, s * 0.2]);
  },
  hawaiian(part, b) {
    if (part !== 'chest') return;
    for (const [x, y, c] of [[0.1, 0.05, 0xffd23f], [-0.12, -0.08, 0xffffff], [0.05, -0.15, 0xff5a8a], [-0.06, 0.12, 0xffffff]]) b.sphere(0.04, c, [x, y, 0.2], [1, 1, 0.4], 6);
  },
  bowtie(part, b) {
    if (part !== 'chest') return;
    for (const s of [-1, 1]) b.cone(0.05, 0.08, 0x1e1e24, [s * 0.04, 0.2, 0.2], [0, 0, s * Math.PI / 2], 4);
  },
  whistle(part, b) {
    if (part !== 'chest') return;
    b.torus(0.15, 0.01, 0xffffff, [0, 0.12, 0.05], [1.2, 0, 0], 12);
    b.box(0.03, 0.03, 0.07, 0xffd23f, [0, 0.0, 0.21]);
  },
};

const HAND = -0.13 * S; // npc.js HAND_OFF
const PROPS = {
  paddle(b) { b.cyl(0.02, 0.02, 1.5, 0xb98a5a, [0, HAND + 0.2, 0.05], null, 5); b.box(0.16, 0.38, 0.03, 0xd9542b, [0, HAND - 0.55, 0.05]); },
  cocktail(b) { b.cyl(0.05, 0.02, 0.1, 0xffd23f, [0, HAND + 0.04, 0.08], null, 8); b.cone(0.07, 0.05, 0xff5a8a, [0.02, HAND + 0.14, 0.08], null, 6); },
  shaker(b) { b.cyl(0.04, 0.045, 0.18, 0xc8ccd2, [0, HAND + 0.03, 0.08], null, 8); },
  spear(b) { b.cyl(0.02, 0.02, 1.7, 0x7a5032, [0, HAND + 0.3, 0.05], null, 5); b.cone(0.04, 0.16, 0xc8ccd2, [0, HAND + 1.2, 0.05], null, 5); },
  binoculars(b) { for (const s of [-1, 1]) b.cyl(0.03, 0.03, 0.1, 0x222228, [s * 0.04, HAND, 0.1], [Math.PI / 2, 0, 0], 8); },
};

registerHat('leafcrown', (b, R) => {
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; b.box(R * 0.22, R * 0.55, 0.02, i % 2 ? 0x3cae4a : 0x2f8f35, [Math.sin(a) * R * 0.86, R * 0.82, Math.cos(a) * R * 0.86], [0.25, a, 0, 'YXZ']); }
  b.torus(R * 0.86, R * 0.06, 0x7a5032, [0, R * 0.62, 0], [Math.PI / 2, 0, 0], 16);
});
registerHat('captain', (b, R) => {
  b.cyl(R * 0.85, R * 0.8, R * 0.32, 0xffffff, [0, R * 0.78, 0], null, 18);
  b.cyl(R * 0.82, R * 0.82, R * 0.12, 0x1f2b5c, [0, R * 0.66, 0], null, 18);
  b.box(R * 1.0, 0.02, R * 0.5, 0x1e1e24, [0, R * 0.6, R * 0.75], [0.25, 0, 0]);
  b.sphere(R * 0.1, 0xffd23f, [0, R * 0.78, R * 0.84], null, 6);
});

// ---- Tiki Jungle -----------------------------------------------------------------
registerRole('tiki', {
  colors: { shirt: 0xd9542b, pants: 0x8a6a3a }, hat: 'leafcrown', outfit: [OUT.grassSkirt, OUT.lei], prop: PROPS.spear, behaviour: 'wander',
  lines: ['Aloha!', 'Welcome to our village!', 'Mind the lava!', 'Try the zip line!', 'The temple has a secret...'], emotes: ['dance', 'wave', 'cheer'],
});
registerRole('guide', {
  colors: { shirt: 0x5a7a3a, pants: 0xc8ad7a, hat: 0x5a7a3a }, hat: 'bucket', outfit: ['vest', 'belt', 'backpack'], prop: PROPS.binoculars, behaviour: 'idle',
  lines: ['Jungle tours! Take a jeep!', 'The volcano trail starts west.', 'Raft ride at the waterfall!', 'Stay on the path!'], emotes: ['point', 'wave'],
});
registerRole('parrotkeeper', {
  colors: { shirt: 0x3fe0d0, pants: 0x3c8a3c, hat: 0xffd23f }, hat: 'straw', outfit: [OUT.parrot, OUT.hawaiian], behaviour: 'wander',
  lines: ['Polly says hello!', 'SQUAWK!', 'Pretty bird, pretty bird!', 'Have you seen my other parrot?'], emotes: ['laugh', 'wave'],
});
registerRole('rafter', {
  colors: { shirt: 0xffd23f, pants: 0x2a62c9, hat: 0xd9542b }, hat: 'helmet', outfit: ['lifejacket'], prop: PROPS.paddle, behaviour: 'idle',
  lines: ['Hop on the raft!', 'Rapids ahead!', 'Hold on tight!'], emotes: ['cheer', 'point'],
});

// ---- Coconut Cove -----------------------------------------------------------------
registerRole('tourist', {
  random: true, outfit: [OUT.hawaiian], prop: 'camera', behaviour: 'wander', hat: 'sunhat',
  lines: ['What a view!', 'Say cheese!', 'I love it here!', 'Where is the pool bar?', 'Sunburn incoming...'], emotes: ['wave', 'point', 'laugh'],
});
registerRole('bartender', {
  colors: { shirt: 0xffffff, pants: 0x2a2a33 }, hat: 'none', outfit: [OUT.bowtie, OUT.lei], prop: PROPS.shaker, behaviour: 'idle',
  lines: ['Coconut cocktail?', 'One fruity punch, coming up!', 'Cheers!', 'Happy hour all day!'], emotes: ['wave', 'bow'],
});
registerRole('captain', {
  colors: { shirt: 0x1f2b5c, pants: 0xffffff }, hat: 'captain', face: 'Moustache', behaviour: 'idle',
  lines: ['Ahoy!', 'Boats for hire!', 'Fair winds today.'], emotes: ['wave', 'point'],
});
registerRole('islander', {
  colors: { shirt: 0xff8a3d, pants: 0x3fe0d0 }, hat: 'sunhat', outfit: [OUT.lei], prop: PROPS.cocktail, behaviour: 'sit',
  lines: ['Ahh, paradise.', 'Five more minutes...', 'Pass the sun cream!'], emotes: ['laugh', 'wave'],
});
void OUTFITS;
