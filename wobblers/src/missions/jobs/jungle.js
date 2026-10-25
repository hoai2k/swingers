// Tiki Jungle jobs: the river raft race and the temple treasure run.
import { RIVER, TEMPLE, VILLAGE } from '../../world/regions/jungle.js';
import { race } from './race.js';

export const JUNGLE_JOBS = [
  {
    id: 'raft', name: 'River Rapids', icon: '🛶', island: 'jungle',
    blurb: 'Paddle the log raft down the river through every hoop',
    giver: { at: [-522, 802], yaw: 0, npc: { role: 'explorer', colors: { shirt: 0x55d85a, pants: 0x9a845a }, outfit: ['lifejacket'] }, lines: ['Fancy a river race?'], go: 'Jump down to the raft and paddle hard!', thanks: 'Rapid work!' },
    pay: 50, time: 200, gold: 80, silver: 125,
    vehicle: { type: 'lograft', at: [-520, 826, Math.PI / 2] }, vehicleName: 'a raft or canoe',
    steps: () => race(RIVER.slice(2).map(([x, z]) => [x, z]), { r: 8, water: true, vehicle: ['lograft', 'canoe', 'boat'], vehicleName: 'a raft or canoe' }),
  },
  {
    id: 'idol', name: 'Temple Treasure', icon: '🗿', island: 'jungle',
    blurb: 'Climb the temple, grab the golden idol from the top and carry it to the stilt village',
    giver: { at: [TEMPLE.x + 18, TEMPLE.z + 22], yaw: -Math.PI * 0.75, npc: { role: 'explorer' }, lines: ['Fortune and glory!'], go: 'Careful, it\'s heavy!', thanks: 'It belongs in a museum!' },
    pay: 55, time: 240, gold: 110, silver: 170,
    steps: [
      { type: 'items', kind: 'idol', spots: [[TEMPLE.x + 4, TEMPLE.z + 3.5, TEMPLE.y + 11.5]], zones: [{ x: (VILLAGE.x0 + VILLAGE.x1) / 2, z: (VILLAGE.z0 + VILLAGE.z1) / 2, r: 5, dy: 6 }], leash: 900,
        text: 'Get the idol from the top of the temple and bring it to the stilt village', hint: 'Grab it with LT / RT (or toss it in a jeep)', done: 'Treasure!' },
    ],
  },
];
