// Frostpeak jobs: the downhill gate race, hot cocoa for skiers and a snowmobile rescue.
import { pisteLine, VILLAGE, CAVE, LAKE } from '../../world/regions/snow/layout.js';
import { race } from './race.js';

// gates every ~50 m down the groomed piste, ending in the village
function gates() {
  const L = pisteLine(), out = [];
  let acc = 0;
  for (let i = 1; i < L.length; i++) {
    acc += Math.hypot(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1]);
    if (acc >= 50) { out.push([L[i][0], L[i][1]]); acc = 0; }
  }
  const end = L[L.length - 1];
  if (out.length && Math.hypot(out[out.length - 1][0] - end[0], out[out.length - 1][1] - end[1]) < 25) out.pop();
  out.push([end[0], end[1]]);
  return out;
}

export const SNOW_JOBS = [
  {
    id: 'slalom', name: 'Downhill Dash', icon: '⛷️', island: 'snow',
    blurb: 'Race down the piste through every gate: on foot, sled or snowmobile',
    giver: { at: [-42, -1072], yaw: Math.PI, npc: { role: 'skier', colors: { shirt: 0x2a62c9, pants: 0xffffff, hat: 0xe8322b } }, lines: ['Ready to race?'], go: 'Three, two, one... GO!', thanks: 'Speedy!' },
    pay: 50, time: 200, gold: 75, silver: 115,
    steps: () => race(gates(), { r: 9, text: 'Gate', finish: 'Through the finish gate!' }),
  },
  {
    id: 'cocoa', name: 'Hot Cocoa Run', icon: '☕', island: 'snow',
    blurb: 'Four chilly skiers want hot cocoa: find them all before it goes cold',
    giver: { at: [8, -812], yaw: 0, npc: { role: 'chef', colors: { shirt: 0xffffff, pants: 0x6b3a1a }, outfit: ['apron', 'scarf'] }, lines: ['Cocoa, anyone?'], go: 'Keep it hot!', thanks: 'Lovely and warm!' },
    pay: 40, time: 160, gold: 70, silver: 110,
    cargo: 'cocoa',
    steps: [
      { type: 'touch', npc: { role: 'skier' }, spots: [[LAKE.x + 14, LAKE.z - 22], [-56, -822], [48, -770], [70, -832]], r: 2.4,
        lines: ['Brrr!', 'So cold!', 'Cocoa?!'], thanks: ['Ahh, toasty!', 'Thanks!', 'Mmm, marshmallows!', 'You\'re a star!'], text: 'Hand out the cocoa', take: true, done: 'Toasty!' },
    ],
  },
  {
    id: 'rescue', name: 'Mountain Rescue', icon: '🏔️', island: 'snow',
    blurb: 'A climber is stuck by the ice cave: fetch them on the snowmobile',
    giver: { at: [58, -812], yaw: Math.PI / 2, npc: { role: 'townsfolk', colors: { shirt: 0xe8322b, pants: 0x2a2a33, hat: 0xffffff }, hat: 'beanie', outfit: ['backpack'] }, lines: ['Mountain rescue, on call!'], go: 'They\'re up by the ice cave!', thanks: 'Another one safe!' },
    pay: 60, time: 220, gold: 95, silver: 150,
    vehicle: { type: 'snowmobile', color: 0xe8322b }, vehicleName: 'the snowmobile',
    steps: [
      { type: 'follow', key: 'climber', npc: { role: 'explorer', colors: { shirt: 0xff8a1a, pants: 0x3b5c9a }, hat: 'beanie' }, at: [CAVE.x + 2, CAVE.z + CAVE.d / 2 + 4], to: [0, (VILLAGE.z0 + VILLAGE.z1) / 2], r: 9,
        helpLines: ['Help! Over here!', 'I\'m frozen!'], text: 'Find the climber by the ice cave', found: 'Thank goodness!', board: ['Hold on tight!'], toText: 'Bring them back to the village', thanks: 'Hot bath, here I come!' },
    ],
  },
];
