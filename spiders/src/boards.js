// The 10 battle boards (VS and survival). Plain data, see board.js for the
// format and shapes.js for the builders. Every board: 8 spawns spread out,
// distinct challenge, nothing boxy.

import { blob, island, rrect, capsule, arc, terrain, smoothPoly, star, ngon } from './shapes.js';

export const BOARDS = [
  {
    id: 'canopy',
    name: 'Canopy',
    theme: 'jungle',
    tagline: 'Floating islands over a bottomless jungle',
    solids: [
      { poly: island(360, 760, 420, 170, { seed: 1 }) },
      { poly: island(1560, 760, 420, 170, { seed: 2 }) },
      { poly: island(960, 560, 360, 140, { seed: 3 }) },
      { poly: blob(960, 180, 160, 60, { seed: 4 }) },
      { poly: blob(420, 300, 110, 50, { seed: 5 }) },
      { poly: blob(1500, 300, 110, 50, { seed: 6 }) },
      { circle: [960, 900, 60] },
    ],
    spawns: [[260, 700], [1660, 700], [460, 700], [1460, 700], [960, 500], [420, 230], [1500, 230], [960, 100]],
    decor: [{ type: 'vine', x: 300, y: 0, len: 220 }, { type: 'vine', x: 1600, y: 0, len: 260 }, { type: 'motes', n: 30, color: 'rgba(220,255,180,0.5)', dir: -1 }],
  },
];
