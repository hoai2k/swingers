// Teenagers at the Stratford Fall Fair: a `teen` NPC role (casual colourful
// clothes, caps and beanies, hoodies, phones / candy floss / sodas / caramel
// apples) and the crowd spawned round the midway and the ride queues.
//
// Spawning a ragdoll NPC costs a few ms, so the crowd is spawned lazily: once
// any player comes within SPAWN_R of the fair, one teen per physics step.
// Only the 16 nearest NPCs are ever simulated (npc.js); the rest are parked.
import { registerRole, OUTFITS } from '../../npc.js';
import { S } from '../../player.js';
import { MIDWAY, RIDES, CENTRE, PATCH, ARCH, AVENUE } from './layout.js';

const HAND = -0.13 * S; // npc.js HAND_OFF (mitten centre in the lower-arm frame)
export const TEEN_PROPS = {
  phone(b) { b.rbox(0.09, 0.17, 0.02, 0.01, 0x1e1e24, [0, HAND + 0.04, 0.1], [-0.5, 0, 0]); b.box(0.075, 0.14, 0.005, 0x6fb8ff, [0, HAND + 0.045, 0.112], [-0.5, 0, 0]); },
  candyfloss(b) { b.cyl(0.012, 0.012, 0.32, 0xf6ead0, [0, HAND + 0.1, 0.06], null, 5); b.sphere(0.13, 0xff9ad5, [0, HAND + 0.32, 0.06], [1, 1.15, 1], 8); b.sphere(0.09, 0xffc0e6, [0.05, HAND + 0.38, 0.09], null, 7); },
  soda(b) { b.cyl(0.05, 0.04, 0.15, 0xd8321e, [0, HAND + 0.03, 0.07], null, 10); b.cyl(0.052, 0.052, 0.03, 0xffffff, [0, HAND + 0.08, 0.07], null, 10); b.cyl(0.006, 0.006, 0.12, 0xffffff, [0.015, HAND + 0.14, 0.07], [0, 0, 0.2], 4); },
  apple(b) { b.cyl(0.01, 0.01, 0.2, 0xf6ead0, [0, HAND + 0.06, 0.06], null, 4); b.sphere(0.065, 0xb5501e, [0, HAND + 0.19, 0.06], [1, 0.9, 1], 10); b.sphere(0.06, 0xd8321e, [0, HAND + 0.21, 0.06], null, 8); },
  cornDog(b) { b.cyl(0.01, 0.01, 0.16, 0xf6ead0, [0, HAND + 0.05, 0.06], null, 4); b.capsule(0.035, 0.13, 0xc8862a, [0, HAND + 0.2, 0.06]); },
};
const hoodie = (color) => (part, b) => {
  if (part !== 'chest') return;
  b.torus(0.13, 0.05, color, [0, 0.2, -0.12], [1.1, 0, 0], 12);
  b.rbox(0.24, 0.1, 0.03, 0.02, color, [0, -0.14, 0.205]);
  for (const s of [-1, 1]) b.cyl(0.008, 0.008, 0.12, 0xffffff, [s * 0.05, 0.1, 0.21], null, 4);
};

const SHIRTS = [0xff5a8a, 0x3fe0d0, 0xffd23f, 0x9b5cff, 0xff8a1a, 0x55d85a, 0x3f8cff, 0xff4040, 0xffffff, 0x2a2a33, 0xe8742a, 0x7a2430];
const PANTS = [0x3b5c9a, 0x2a2a33, 0x6a6f7a, 0xc8ad7a, 0x3b5c9a, 0x5a3a24];
const HATS = ['cap', 'cap', 'beanie', 'beanie', 'bucket', 'none', 'none', 'none'];
const FACES = ['Happy', 'Joyful', 'Cool shades', 'Cheeky', 'Star eyes', 'Winky', 'Tongue out', 'Heart eyes', 'Surprised', 'Lashes', 'Nerd'];
const PROPS = ['phone', 'phone', 'candyfloss', 'soda', 'apple', 'cornDog', null, null];
export const TEEN_LINES = ['This ride is sick!', 'Again! Again!', 'Best fair ever!', 'Did you see the Zipper?!', 'I\'m gonna hurl...', 'Candy floss!!',
  'Let\'s do the Gravitron!', 'No way, it\'s so high!', 'Selfie!', 'Wanna go on the Ferris wheel?', 'The Drop Tower is wild!', 'Ring of Fire, let\'s go!',
  'Pumpkin spice everything!', 'My mum said be home by nine...', 'Race you to the Himalaya!', 'Do you wanna go faster?!'];

registerRole('teen', {
  behaviour: 'wander', speed: 0.7, lines: TEEN_LINES,
  hitLines: ['Dude!', 'Hey, not cool!', 'Rude!', 'Watch it!', 'Bro!'], emotes: ['dance', 'laugh', 'cheer', 'wave', 'point', 'clap'],
});

// a random teen look (deterministic for spawn index i)
function look(i) {
  const r = (k) => Math.abs(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;
  const pick = (a, k) => a[Math.floor(r(k) * a.length)];
  const shirt = pick(SHIRTS, 1), hat = pick(HATS, 2), prop = pick(PROPS, 4);
  const outfit = [];
  if (r(5) < 0.45) outfit.push(hoodie(shirt));
  if (r(6) < 0.25) outfit.push('backpack');
  else if (r(6) < 0.45) outfit.push((n, b) => OUTFITS.scarf(n, b, pick([0xe8742a, 0xd8321e, 0xf2b631, 0x7a2430], 7)));
  return {
    colors: { shirt, pants: pick(PANTS, 3), hat: pick(SHIRTS, 8) },
    hat, face: pick(FACES, 9), outfit, prop: prop ? TEEN_PROPS[prop] : undefined,
  };
}

export const SPAWN_R = 260;

export function spawnTeens(game, R, F) {
  const list = [];
  const add = (x, z, o = {}) => list.push([x, z, { ...look(list.length), ...o }]);
  // wanderers along the midway (either side of the avenue)
  for (let i = 0; i < 14; i++) {
    const k = i % 2 ? 1 : -1, x = k * (AVENUE + 8 + Math.floor(i / 2) * 15), z = MIDWAY.z + (i % 4 < 2 ? 3 : -3);
    add(x, z, { area: { x, z: MIDWAY.z, r: 18 } });
  }
  // little groups hanging out by the rides (standing, chatting, looking round)
  const groups = [['ferris', 3], ['gravitron', 3], ['zipper', 2], ['droptower', 3], ['himalaya', 2], ['ringfire', 3], ['tilt', 2], ['sizzler', 2], ['pirate', 2], ['carousel', 2], ['topspin', 2]];
  for (const [ride, n] of groups) {
    const at = RIDES[ride], side = Math.sign(MIDWAY.z - at.z), gz = MIDWAY.z - side * 9.5, gx = at.x + (ride === 'droptower' ? -6 : 3);
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2 + ride.length, x = gx + Math.sin(a) * 1.3, z = gz + Math.cos(a) * 1.3;
      add(x, z, { behaviour: 'idle', yaw: Math.atan2(gx - x, gz - z) });
    }
  }
  // riders strapped to the Gravitron / Starship 2000 wall pads (every other pad, first in the
  // spawn queue so they are on board when you walk in)
  for (const label of ['Ride Gravitron', 'Ride Starship 2000']) {
    const seats = F.seats.filter((s) => s.label === label);
    seats.forEach((s, i) => {
      if (i % 2) return;
      const t = s.body.translation();
      list.unshift([t.x + s.pos[0], t.z + s.pos[2], { ...look(list.length), behaviour: 'ride', rideSeat: s, area: { x: t.x, z: t.z, r: 3 } }]);
    });
  }
  // a few on the benches, at the pumpkin patch and by the entrance arch
  for (const x of [-110, -52, 24, 82]) add(x, MIDWAY.z - 7, { behaviour: 'sit' });
  for (let i = 0; i < 3; i++) add(PATCH.x - 6, PATCH.z - 5 + i * 5, { area: { x: PATCH.x, z: PATCH.z, r: 10 } });
  for (let i = 0; i < 2; i++) add(ARCH.x + (i ? 11 : -11), ARCH.z + 6, { area: { x: ARCH.x + (i ? 13 : -13), z: ARCH.z + 8, r: 5 } });
  // lazy spawn: one per physics step once a player is near
  let k = 0, started = false;
  const step = () => {
    if (!started) {
      if (k++ % 30) return;
      started = game.players.some((p) => { const t = p.chest.translation(); return Math.hypot(t.x - CENTRE.x, t.z - CENTRE.z) < SPAWN_R; });
      if (!started) return;
    }
    const it = list.shift();
    if (it) game.npcs?.spawn('teen', it[0], it[1], it[2]);
    if (!list.length) { const i = game.steppers.indexOf(step); if (i >= 0) game.steppers.splice(i, 1); }
  };
  game.steppers.push(step);
  F.teensPending = () => list.length;
  F.teenCount = list.length;
}
