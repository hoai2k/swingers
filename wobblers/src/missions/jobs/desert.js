// Dusty Dunes jobs: catch the Cactus Kid, the dune-buggy rally and the fossil dig.
import { TOWN, OASIS, DIG } from '../../world/regions/desert/layout.js';
import { race } from './race.js';

const ST = TOWN.street; // main street z
// sheriff's office (town.js sheriff(): local frame at (-1001, ST - 13), floor y 4.3, door at local (-2.5, 5))
const JAIL_DOOR = [-1003.5, ST - 5.5];
const CELL = [-997.2, TOWN.y + 0.45, ST - 16.2];

export const DESERT_JOBS = [
  {
    id: 'outlaw', name: 'Wanted: Cactus Kid', icon: '🤠', island: 'desert',
    blurb: 'The Cactus Kid is hiding out at the oasis: catch him and march him to jail',
    giver: { at: [-1008, ST - 4.5], yaw: Math.PI, npc: { role: 'cowboy', colors: { shirt: 0xe8dcc0, pants: 0x6b4a2a, hat: 0x3a2a1a }, face: 'Moustache', lines: ['Deputy wanted!'] }, lines: ['That varmint\'s at the oasis!'], go: 'Bring him in, deputy!', thanks: 'Justice is served!' },
    pay: 70, time: 260, gold: 120, silver: 180,
    steps: [
      { type: 'catch', key: 'kid', npc: { role: 'cowboy', colors: { shirt: 0x4f9a3a, pants: 0x3b5c9a, hat: 0x2a5a2a }, face: 'Cool shades', lines: ['Can\'t catch me!', 'Too slow, sheriff!', 'Yeehaw!'] },
        at: [OASIS.x + OASIS.r + 8, OASIS.z - 6], area: { x: OASIS.x, z: OASIS.z, r: OASIS.r + 34 }, scare: 18, speed: 0.8,
        taunts: ['Nyah nyah!', 'Come and get me!'], caught: 'Aw shucks! You got me!', text: 'Catch the Cactus Kid', hint: 'Grab him (LT / RT), punch him over, or corner him', done: 'Gotcha!' },
      { type: 'follow', key: 'kid', skipReach: true, to: JAIL_DOOR, r: 3.5, jail: CELL, board: ['Fine, I\'ll ride along...'], toText: 'March him to the sheriff\'s office', thanks: 'I\'ll be back!' },
    ],
  },
  {
    id: 'rally', name: 'Dune Buggy Rally', icon: '🏁', island: 'desert',
    blurb: 'Hit every checkpoint around the dunes in the buggy',
    giver: { at: [-1106, -24], yaw: Math.PI / 2, board: true },
    pay: 45, time: 170, gold: 75, silver: 110,
    vehicle: { type: 'buggy', color: 0xff4d3d }, vehicleName: 'the buggy',
    steps: () => race([[-1150, 15], [-1170, 72], [-1160, 160], [-1100, 168], [-1045, 85], [-1060, 15], [-1100, -16]], { r: 9, vehicle: true, vehicleName: 'the buggy' }),
  },
  {
    id: 'fossils', name: 'Fossil Dig', icon: '🦴', island: 'desert',
    blurb: 'Three dinosaur bones are buried around the dig site: find them and bring them back',
    giver: { at: [(DIG.x0 + DIG.x1) / 2 + 2, DIG.z1 + 6], yaw: Math.PI, npc: { role: 'explorer', colors: { shirt: 0xd8c896, pants: 0x9a845a }, prop: 'shovel' }, lines: ['Bones! Bones everywhere!'], go: 'Look for the sparkle in the sand!', thanks: 'A T-Wobble-saurus!' },
    pay: 40, time: 170, gold: 65, silver: 110,
    steps: [
      { type: 'touch', hidden: true, dig: true, reveal: 9, area: { x: (DIG.x0 + DIG.x1) / 2, z: (DIG.z0 + DIG.z1) / 2, r: 16 }, r: 1.8,
        spots: [[DIG.x0 - 6, DIG.z0 - 4], [DIG.x1 + 5, DIG.z0 + 3], [DIG.x0 + 2, DIG.z1 + 8]], text: 'Search the dig site for bones', hint: 'Walk over a bone to dig it up', give: 'fossil', done: 'Got them all!' },
      { type: 'reach', at: [(DIG.x0 + DIG.x1) / 2 + 2, DIG.z1 + 4.6], r: 3, text: 'Bring the bones to the professor', take: true },
    ],
  },
];
