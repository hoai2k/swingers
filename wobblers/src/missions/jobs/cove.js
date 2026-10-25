// Coconut Cove jobs: the jet-ski ring race, the beach clean-up and the water taxi.
import { RESORT, HARBOUR } from '../../world/regions/tropical.js';
import { race } from './race.js';
import { meshHeight } from '../../terrain.js';

const BINS = [[586, 712], [628, 712]]; // on the resort isle's north beach, by the parasols
// open-topped beach bins (no collider: litter dropped in falls to the bottom)
function buildBins(M, kit) {
  for (const [x, z] of BINS) {
    const y = meshHeight(x, z);
    kit.cyl(x, y + 0.5, z, 0.75, 1.0, 0x2f9a56, { seg: 14, collide: false });
    kit.cyl(x, y + 1.02, z, 0.8, 0.08, 0x1f6a3a, { seg: 14, collide: false });
    kit.deco(x, y + 0.03, z, 1.2, 0.05, 1.2, 0x1f6a3a);
  }
}

export const COVE_JOBS = [
  {
    id: 'rings', name: 'Ring Racer', icon: '🌊', island: 'tropical',
    blurb: 'Zoom the jet ski through the rings around the islets',
    giver: { at: [520, 612], yaw: Math.PI / 2, board: true },
    pay: 50, time: 170, gold: 80, silver: 120,
    vehicle: { type: 'jetski', color: 0x3fe0d0, at: [540, 606, Math.PI / 2] }, vehicleName: 'the jet ski',
    steps: () => race([[560, 640], [610, 690], [690, 690], [735, 760], [700, 850], [600, 865], [540, 850]], { r: 8, water: true, vehicle: true, vehicleName: 'the jet ski' }),
  },
  {
    id: 'cleanup', name: 'Beach Clean-up', icon: '🧹', island: 'tropical',
    blurb: 'Pick up the litter on the resort beach and toss it in the bins',
    giver: { at: [606, 713], yaw: Math.PI, npc: { role: 'surfer', colors: { shirt: 0xffd23f, pants: 0x3fe0d0 } }, lines: ['Keep the beach tidy, dude!'], go: 'Bins are by the path!', thanks: 'Totally pristine!' },
    pay: 45, time: 180, gold: 80, silver: 125,
    build: buildBins,
    steps: [
      { type: 'items', kind: 'can', kinds: ['can', 'bottle', 'bag'], spots: [[575, 707], [590, 704], [598, 706], [620, 705], [636, 707], [648, 705]], zones: BINS.map(([x, z]) => ({ x, z, r: 1.1 })),
        text: 'Put the litter in the bins', hint: 'Grab it (LT / RT) and drop it in, or punch to throw', done: 'Squeaky clean!' },
    ],
  },
  {
    id: 'watertaxi', name: 'Water Taxi', icon: '🚤', island: 'tropical',
    blurb: 'Ferry a guest from the harbour to the resort by speedboat',
    giver: { at: [(HARBOUR.x0 + HARBOUR.x1) / 2 + 22, HARBOUR.z0 + 4], yaw: Math.PI / 2, npc: { role: 'fisherman' }, lines: ['Boat\'s ready!'], go: 'Guest\'s on the jetty!', thanks: 'Five stars!' },
    pay: 45, time: 200, gold: 80, silver: 130,
    vehicle: { type: 'speedboat', color: 0xff3a5a }, vehicleName: 'the speedboat',
    steps: [
      { type: 'passenger', key: 'guest', npc: { role: 'businessman', colors: { shirt: 0xffffff, pants: 0xc8ad7a }, hat: 'sunhat', outfit: [] }, from: [552, 610], to: [600, 698], vehicle: true, r: 12,
        text: 'Pick up the guest on the jetty', rideText: 'Take them to the resort beach', hint: 'Pull up alongside and stop', board: 'To the resort, please!', thanks: 'What a ride!', done: 'Tip!' },
    ],
  },
];
