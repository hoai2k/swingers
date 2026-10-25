// Player outfits: the customiser's Outfit row. Each piece adds geometry to body
// parts in their local frames (metres, the same frames as the NPC outfits in
// npc.js), read by Player.partMesh through player.outfit.
//
// Where they come from (src/unlocks.js locks them):
//   free  - always available
//   job   - finishing that job for the first time (themed on the job)
//   shop  - the town's clothes shop (SHOP_COSMETICS)
// Keep appending: saved looks store the index.
const FRONT = 0.205, BACK = -0.2;
const GOLD = 0xffc83a, WHITE = 0xffffff;

const stripes = (b, y, c) => { // two reflective bands round the chest
  for (const dy of [0, -0.12]) b.torus(0.205, 0.018, c, [0, y + dy, 0], [Math.PI / 2, 0, 0], 20);
};

export const OUTFIT_LIST = [
  { id: 'none', name: 'No outfit', from: 'free', build() {} },
  { id: 'scarf', name: 'Red scarf', from: 'free', build(n, b) {
    if (n !== 'chest') return;
    b.torus(0.15, 0.05, 0xff5a5a, [0, 0.235, 0], [Math.PI / 2, 0, 0], 14);
    b.box(0.08, 0.2, 0.03, 0xff5a5a, [0.07, 0.12, FRONT - 0.01], [0.1, 0, 0.15]);
  } },
  { id: 'backpack', name: 'Backpack', from: 'free', build(n, b, c) {
    if (n !== 'chest') return;
    b.rbox(0.32, 0.36, 0.15, 0.06, c, [0, -0.02, BACK - 0.06]);
    b.rbox(0.26, 0.12, 0.07, 0.03, 0x3a3a48, [0, -0.12, BACK - 0.14]);
    for (const s of [-1, 1]) b.box(0.04, 0.3, 0.02, 0x3a3a48, [s * 0.1, 0.02, FRONT - 0.02], [-0.15, 0, 0]);
  } },
  { id: 'tie', name: 'Tie', from: 'free', build(n, b) {
    if (n !== 'chest') return;
    b.box(0.07, 0.24, 0.025, 0x2a62c9, [0, -0.02, FRONT], [-0.12, 0, 0]);
    b.box(0.08, 0.05, 0.03, 0x1d4799, [0, 0.13, FRONT - 0.01]);
  } },
  { id: 'belt', name: 'Belt', from: 'free', build(n, b) {
    if (n !== 'hips') return;
    b.torus(0.17, 0.025, 0x3a2a1a, [0, 0.07, 0], [Math.PI / 2, 0, 0], 16);
    b.box(0.07, 0.05, 0.02, GOLD, [0, 0.07, 0.175]);
  } },
  // ---- job rewards (Wobbly Island)
  { id: 'pizzabag', name: 'Pizza delivery bag', from: 'job:pizza', build(n, b) {
    if (n !== 'chest') return;
    b.rbox(0.4, 0.3, 0.3, 0.04, 0xd8342c, [0, 0.0, BACK - 0.13]);
    b.box(0.2, 0.12, 0.01, WHITE, [0, 0.03, BACK - 0.285]);
    for (const s of [-1, 1]) b.box(0.04, 0.3, 0.02, 0x2a2a33, [s * 0.1, 0.02, FRONT - 0.02], [-0.15, 0, 0]);
  } },
  { id: 'firejacket', name: 'Firefighter jacket', from: 'job:fire', build(n, b) {
    if (n === 'chest') { b.rbox(0.47, 0.4, 0.42, 0.12, 0xc89a3a, [0, -0.02, 0]); stripes(b, 0.02, 0xd8f040); }
    if (n.startsWith('uArm')) b.cyl(0.085, 0.08, 0.2, 0xc89a3a, [0, 0, 0]);
  } },
  { id: 'lifejacket', name: 'Life jacket', from: 'job:lifeguard', build(n, b) {
    if (n !== 'chest') return;
    b.rbox(0.48, 0.36, 0.44, 0.1, 0xff8a1a, [0, 0, 0]);
    b.box(0.03, 0.3, 0.02, 0x2a2a33, [0, 0, 0.22]);
  } },
  { id: 'overalls', name: 'Farmer overalls', from: 'job:sheep', build(n, b) {
    if (n === 'chest') {
      b.rbox(0.3, 0.22, 0.03, 0.02, 0x3b5c9a, [0, -0.08, FRONT + 0.005], [-0.1, 0, 0]);
      for (const s of [-1, 1]) { b.box(0.05, 0.36, 0.02, 0x3b5c9a, [s * 0.11, 0.08, FRONT - 0.01], [-0.25, 0, 0]); b.box(0.05, 0.36, 0.02, 0x3b5c9a, [s * 0.11, 0.06, BACK + 0.01], [0.25, 0, 0]); b.sphere(0.022, GOLD, [s * 0.11, 0.04, FRONT + 0.02]); }
    }
    if (n === 'hips') b.sphere(0.185, 0x3b5c9a, [0, 0.0, 0], [1.02, 0.9, 0.95], 14);
  } },
  // ---- Bigtown
  { id: 'bowtie', name: 'Chauffeur bow tie', from: 'job:cab', build(n, b) {
    if (n !== 'chest') return;
    for (const s of [-1, 1]) b.cone(0.05, 0.09, 0x2a2a33, [s * 0.045, 0.15, FRONT + 0.0], [0, 0, s * Math.PI / 2], 6);
    b.sphere(0.025, 0x2a2a33, [0, 0.15, FRONT + 0.01]);
  } },
  { id: 'satchel', name: 'Courier satchel', from: 'job:courier', build(n, b) {
    if (n === 'chest') b.box(0.045, 0.62, 0.02, 0x6b4a2a, [0, 0.0, FRONT - 0.005], [0, 0, 0.75]);
    if (n === 'hips') { b.rbox(0.22, 0.18, 0.08, 0.03, 0x8a6a3a, [-0.17, 0.06, 0.06], [0, -0.6, 0]); b.box(0.22, 0.04, 0.085, 0x6b4a2a, [-0.17, 0.14, 0.06], [0, -0.6, 0]); }
  } },
  { id: 'hivis', name: 'Hi-vis vest', from: 'job:site', build(n, b) {
    if (n !== 'chest') return;
    b.rbox(0.46, 0.36, 0.41, 0.11, 0xc8f030, [0, -0.03, 0]);
    stripes(b, 0.0, 0xd0d4dc);
  } },
  { id: 'teamscarf', name: 'Team scarf', from: 'job:goals', build(n, b) {
    if (n !== 'chest') return;
    for (let i = 0; i < 5; i++) b.torus(0.15, 0.045, i % 2 ? WHITE : 0x2a62c9, [0, 0.215 + i * 0.012, 0], [Math.PI / 2, 0, 0], 14);
    for (let i = 0; i < 4; i++) b.box(0.08, 0.06, 0.03, i % 2 ? WHITE : 0x2a62c9, [-0.08, 0.15 - i * 0.06, FRONT - 0.005], [0.1, 0, -0.1]);
  } },
  // ---- Frostpeak
  { id: 'racebib', name: 'Race bib', from: 'job:slalom', build(n, b) {
    if (n !== 'chest') return;
    for (const z of [FRONT + 0.005, BACK - 0.005]) { b.box(0.24, 0.22, 0.01, WHITE, [0, -0.02, z]); b.box(0.1, 0.1, 0.012, 0xd8342c, [0, -0.02, z]); }
  } },
  { id: 'woollyscarf', name: 'Woolly scarf', from: 'job:cocoa', build(n, b) {
    if (n !== 'chest') return;
    b.torus(0.155, 0.06, 0x3fa8a0, [0, 0.235, 0], [Math.PI / 2, 0, 0], 14);
    for (const [x, r] of [[0.06, 0.12], [-0.05, -0.08]]) b.box(0.09, 0.3, 0.035, 0x3fa8a0, [x, 0.07, FRONT], [0.1, 0, r]);
    for (const x of [0.07, -0.06]) b.box(0.1, 0.03, 0.04, WHITE, [x, -0.06, FRONT + 0.01]);
  } },
  { id: 'rescuepack', name: 'Mountain rescue pack', from: 'job:rescue', build(n, b) {
    if (n !== 'chest') return;
    b.rbox(0.34, 0.4, 0.17, 0.06, 0xd8342c, [0, -0.02, BACK - 0.07]);
    b.box(0.12, 0.035, 0.01, WHITE, [0, 0.02, BACK - 0.16]); b.box(0.035, 0.12, 0.01, WHITE, [0, 0.02, BACK - 0.16]);
    b.capsule(0.05, 0.26, 0xffd23f, [0, 0.2, BACK - 0.08], [0, 0, Math.PI / 2]);
    for (const s of [-1, 1]) b.box(0.04, 0.3, 0.02, 0x2a2a33, [s * 0.1, 0.02, FRONT - 0.02], [-0.15, 0, 0]);
  } },
  // ---- Dusty Dunes
  { id: 'sheriff', name: "Sheriff's vest & star", from: 'job:outlaw', build(n, b) {
    if (n !== 'chest') return;
    for (const s of [-1, 1]) b.rbox(0.16, 0.34, 0.06, 0.03, 0x6b4a2a, [s * 0.11, -0.02, FRONT - 0.03], [0, s * 0.35, 0]);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; b.cone(0.022, 0.06, GOLD, [0.11 + Math.sin(a) * 0.03, 0.05 + Math.cos(a) * 0.03, FRONT + 0.03], [Math.PI / 2, 0, -a], 5); }
    b.cyl(0.03, 0.03, 0.015, GOLD, [0.11, 0.05, FRONT + 0.03], [Math.PI / 2, 0, 0], 10);
  } },
  { id: 'rallysash', name: 'Chequered rally sash', from: 'job:rally', build(n, b) {
    if (n !== 'chest') return;
    for (let i = 0; i < 8; i++) {
      const t = i / 7 - 0.5, x = t * 0.36, y = -t * 0.36;
      b.box(0.06, 0.06, 0.02, i % 2 ? WHITE : 0x22222a, [x, y, FRONT + 0.005], [0, 0, 0.78]);
      b.box(0.06, 0.06, 0.02, i % 2 ? 0x22222a : WHITE, [x + 0.04, y + 0.04, FRONT + 0.006], [0, 0, 0.78]);
    }
  } },
  { id: 'toolbelt', name: 'Digger tool belt', from: 'job:fossils', build(n, b) {
    if (n !== 'hips') return;
    b.torus(0.175, 0.03, 0x8a6a3a, [0, 0.07, 0], [Math.PI / 2, 0, 0], 16);
    for (const a of [-1.1, 1.1, 2.4]) b.rbox(0.08, 0.1, 0.05, 0.02, 0x6b4a2a, [Math.sin(a) * 0.19, 0.03, Math.cos(a) * 0.19], [0, a, 0]);
    b.box(0.03, 0.16, 0.02, 0x8a8f96, [0.2, -0.02, -0.05], [0, 0, 0.2]); // trowel
  } },
  // ---- Tiki Jungle
  { id: 'toothnecklace', name: 'Tooth necklace', from: 'job:raft', build(n, b) {
    if (n !== 'chest') return;
    b.torus(0.17, 0.012, 0x6b4a2a, [0, 0.18, 0.03], [Math.PI / 2 - 0.35, 0, 0], 18);
    for (let i = -2; i <= 2; i++) b.cone(0.022, 0.07, 0xf4ecd8, [i * 0.045, 0.1 - Math.abs(i) * 0.012, FRONT + 0.0], [Math.PI, 0, i * 0.15], 6);
  } },
  { id: 'amulet', name: 'Golden amulet', from: 'job:idol', build(n, b) {
    if (n !== 'chest') return;
    b.torus(0.16, 0.014, GOLD, [0, 0.18, 0.03], [Math.PI / 2 - 0.4, 0, 0], 18);
    b.cyl(0.07, 0.07, 0.02, GOLD, [0, 0.03, FRONT + 0.015], [Math.PI / 2, 0, 0], 16);
    b.sphere(0.03, 0x3fe0d0, [0, 0.03, FRONT + 0.03]);
  } },
  // ---- Coconut Cove
  { id: 'flippers', name: 'Flippers', from: 'job:rings', build(n, b) {
    if (!n.startsWith('lLeg')) return;
    b.rbox(0.17, 0.025, 0.3, 0.01, 0x2ab5a5, [0, -0.11, 0.17]);
  } },
  { id: 'lei', name: 'Flower lei', from: 'job:cleanup', build(n, b) {
    if (n !== 'chest') return;
    const cols = [0xff6fae, 0xffd23f, 0xffffff, 0xff8a3d];
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; b.sphere(0.04, cols[i % 4], [Math.sin(a) * 0.17, 0.2 - Math.max(0, Math.cos(a)) * 0.08, Math.cos(a) * 0.17], null, 8); }
  } },
  { id: 'captain', name: "Captain's jacket", from: 'job:watertaxi', build(n, b) {
    if (n === 'chest') {
      b.rbox(0.47, 0.4, 0.42, 0.12, 0x22305a, [0, -0.02, 0]);
      for (const y of [0.06, -0.04, -0.14]) b.sphere(0.02, GOLD, [0.05, y, 0.215]);
      for (const s of [-1, 1]) b.box(0.12, 0.03, 0.12, GOLD, [s * 0.27, 0.16, 0]);
    }
    if (n.startsWith('uArm')) b.cyl(0.085, 0.08, 0.2, 0x22305a, [0, 0, 0]);
  } },
  // ---- clothes shop
  { id: 'cape', name: 'Hero cape', from: 'shop', build(n, b) {
    if (n !== 'chest') return;
    b.box(0.46, 0.62, 0.02, 0xd8342c, [0, -0.12, BACK - 0.04], [0.12, 0, 0]);
    b.torus(0.16, 0.02, GOLD, [0, 0.22, 0], [Math.PI / 2, 0, 0], 14);
  } },
  { id: 'wings', name: 'Fairy wings', from: 'shop', build(n, b) {
    if (n !== 'chest') return;
    for (const s of [-1, 1]) {
      b.sphere(0.2, 0xc9e8ff, [s * 0.16, 0.1, BACK - 0.06], [0.9, 1.3, 0.12], 12);
      b.sphere(0.13, 0xe0c9ff, [s * 0.13, -0.16, BACK - 0.05], [0.9, 1.2, 0.12], 12);
    }
  } },
  { id: 'tutu', name: 'Tutu', from: 'shop', build(n, b) {
    if (n !== 'hips') return;
    b.cyl(0.2, 0.33, 0.1, 0xff8ac8, [0, 0.03, 0], null, 20);
    b.cyl(0.19, 0.29, 0.06, 0xffb8de, [0, 0.09, 0], null, 20);
  } },
  { id: 'apron', name: 'Chef apron', from: 'shop', build(n, b) {
    if (n === 'chest') b.rbox(0.34, 0.36, 0.03, 0.02, WHITE, [0, -0.16, FRONT + 0.01], [-0.12, 0, 0]);
    if (n === 'hips') b.rbox(0.3, 0.2, 0.03, 0.02, WHITE, [0, -0.02, 0.18], [-0.2, 0, 0]);
  } },
];

// player.outfit (read by Player.partMesh) for an outfit index
export function outfitFn(i, player) {
  const o = OUTFIT_LIST[i];
  return o && o.id !== 'none' ? (n, b) => o.build(n, b, player.color) : null;
}
// job id -> reward key ('outfit:<id>'), for unlocks.js and the job results card
export const JOB_OUTFITS = Object.fromEntries(OUTFIT_LIST.filter((o) => o.from.startsWith('job:')).map((o) => [o.from.slice(4), 'outfit:' + o.id]));
