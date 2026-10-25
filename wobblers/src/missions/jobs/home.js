// Wobbly Island jobs: pizza delivery, the fire brigade, a beach rescue and the farm round-up.
import { meshHeight } from '../../terrain.js';

const PEN = { x: 237, z: -128, h: 4.6 };
// sheep pen: four fence sides with a gate gap on the west side (toward the farm)
function buildPen(M, kit) {
  const { x, z, h } = PEN, y = (a, b) => meshHeight(a, b);
  const F = (x0, z0, x1, z1) => kit.fence(x0, z0, x1, z1, 0xf2e6c4, 1.1, Math.min(y(x0, z0), y(x1, z1)) - 0.05);
  F(x - h, z - h, x + h, z - h); F(x + h, z - h, x + h, z + h); F(x + h, z + h, x - h, z + h);
  F(x - h, z + h, x - h, z + 1.8); F(x - h, z - 1.8, x - h, z - h);
  kit.deco(x, y(x, z) + 0.03, z, h * 2 - 0.4, 0.04, h * 2 - 0.4, 0xc8b070); // straw floor
}

export const HOME_JOBS = [
  {
    id: 'pizza', name: 'Pizza Rush', icon: '🍕', island: 'home',
    blurb: 'Scoot hot pizzas to three front doors in the suburbs',
    giver: { at: [-7.4, -46], yaw: Math.PI / 2, npc: { role: 'chef', colors: { shirt: 0xffffff, pants: 0xd9342b } }, lines: ['Pizzas need delivering!', 'Hot and fresh!'], go: 'Don\'t let them go cold!', thanks: 'Bellissimo!' },
    pay: 40, time: 210, gold: 85, silver: 130,
    vehicle: { type: 'scooter', color: 0xe8322b }, vehicleName: 'the scooter',
    cargo: 'pizza',
    steps: [
      { type: 'reach', at: [97, 11.6], r: 3.2, text: 'Deliver to the house on the east avenue', done: 'Delivered!' },
      { type: 'reach', at: [11.6, -114], r: 3.2, text: 'Deliver to the house on the north avenue', done: 'Delivered!' },
      { type: 'reach', at: [-11.6, 132], r: 3.2, text: 'Last one: the house on the south avenue', take: true, done: 'All delivered!' },
    ],
  },
  {
    id: 'fire', name: 'Fire Brigade', icon: '🚒', island: 'home',
    blurb: 'Drive the fire truck up to each fire and hose it down',
    giver: { at: [-58.5, -46], yaw: Math.PI / 2, npc: { role: 'townsfolk', colors: { shirt: 0xe8322b, pants: 0x2a2a33, hat: 0xffd23f }, hat: 'helmet', outfit: ['belt'] }, lines: ['Fire! Fire!', 'Grab the truck!'], go: 'Sirens on, go go go!', thanks: 'Town saved!' },
    pay: 55, time: 180, gold: 70, silver: 110,
    vehicle: { type: 'firetruck', color: 0xe8322b }, vehicleName: 'the fire truck',
    steps: [
      { type: 'fires', spots: [[-30, -72, 1.3], [72, 32, 1.4], [-24, 72, 1.2]], vehicle: ['firetruck'], vehicleName: 'the fire truck', text: 'Put out the fires', hint: 'Drive up close to hose a fire', done: 'All out!' },
      { type: 'reach', at: [-62, -48], r: 7, vehicle: ['firetruck'], vehicleName: 'the fire truck', text: 'Bring the truck back to the station' },
    ],
  },
  {
    id: 'lifeguard', name: 'Beach Rescue', icon: '🛟', island: 'home',
    blurb: 'Someone is struggling out in the sea: swim (or boat) out and bring them back',
    giver: { at: [52, 309], yaw: Math.PI, npc: { role: 'lifeguard', colors: { shirt: 0xffd23f, pants: 0xe8322b } }, lines: ['Keep an eye on the water!'], go: 'Hurry, they\'re out past the buoys!', thanks: 'You\'re a lifesaver!' },
    pay: 45, time: 150, gold: 55, silver: 90,
    steps: [
      { type: 'follow', key: 'swimmer', npc: { role: 'townsfolk', outfit: ['lifejacket'] }, help: true, at: [92, 372], to: [64, 322], r: 5,
        text: 'Swim out to the swimmer', found: 'Oh thank goodness!', board: ['Phew, a boat!'], toText: 'Bring them back to the beach towel', thanks: 'Solid ground! Thank you!' },
    ],
  },
  {
    id: 'sheep', name: 'Sheep Round-up', icon: '🐑', island: 'home',
    blurb: 'Four sheep got out! Push, carry or chase them back into the pen',
    giver: { at: [230, -128], yaw: -Math.PI / 2, npc: 'farmer', lines: ['My sheep are loose!', 'Baa-d news, partner.'], go: 'They\'re skittish, go gently!', thanks: 'Ewe did it!' },
    pay: 45, time: 240, gold: 100, silver: 160,
    build: buildPen,
    steps: [
      { type: 'items', kind: 'sheep', keep: true, spots: [[252, -108], [262, -150], [238, -178], [196, -112]], zones: [{ x: PEN.x, z: PEN.z, r: PEN.h - 0.3 }],
        text: 'Get the sheep into the pen', hint: 'They run from you: herd them, or grab one (LT / RT) and carry it', done: 'Baa!' },
    ],
  },
];
