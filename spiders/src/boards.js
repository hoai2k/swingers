// The 10 battle boards (VS and survival). Plain data, see board.js for the
// format and shapes.js for the builders. Every board: 8 spawns spread out,
// a distinct challenge, nothing boxy.
//
// Reach (spider.js SP): jump ~160 units high, web up to 860 (the rope snaps
// to 90% of the hit distance), so every surface here is within ~800 of
// another one a spider can stand on. `bgFile` is a dedicated backdrop the
// owner may deliver later (image-requests.md); until then the theme's shared
// background is used.

import { blob, island, rrect, capsule, arc, terrain, smoothPoly, star, ngon, shard, spike, gear, ring, wall, rotate } from './shapes.js';

const W = 1920;
const mirror = (pts) => pts.map(([x, y]) => [W - x, y]).reverse();

// --- 1. Canopy: islands over a bottomless jungle ------------------------------
const canopy = {
  id: 'canopy',
  name: 'Canopy',
  theme: 'jungle',
  bgFile: 'bg_canopy.jpg',
  tagline: 'Islands over a bottomless jungle. Miss a swing and you are gone.',
  solids: [
    { poly: island(330, 720, 440, 190, { seed: 1 }) },
    { poly: island(1590, 720, 440, 190, { seed: 2 }) },
    { poly: island(960, 570, 360, 150, { seed: 3 }) },
    { poly: blob(650, 905, 78, 30, { seed: 7, flatTop: 0.3 }) },
    { poly: blob(1270, 905, 78, 30, { seed: 8, flatTop: 0.3 }) },
    // great branches reaching in from the trees off-screen
    { poly: capsule(-60, 110, 560, 236, 28, 5) },
    { poly: capsule(1980, 110, 1360, 236, 28, 5) },
    { poly: blob(960, 165, 165, 48, { seed: 4 }) },
    // mossy boulders hanging in the canopy
    { circle: [575, 430, 40] },
    { circle: [1345, 430, 40] },
  ],
  spawns: [[220, 650], [440, 650], [1480, 650], [1700, 650], [880, 500], [1040, 500], [280, 120], [1640, 120]],
  dropPoints: [[330, -30], [960, -30], [1590, -30]],
  enemySpawns: [[-60, 300], [W + 60, 300], [960, -60], [-60, 600], [W + 60, 600]],
  killY: 1180,
  decor: [
    { type: 'silhouette', color: 'rgba(10,40,20,0.35)', poly: [[0, 1080], [0, 0], [90, 0], [120, 400], [70, 1080]] },
    { type: 'silhouette', color: 'rgba(10,40,20,0.35)', poly: [[1920, 1080], [1920, 0], [1830, 0], [1800, 400], [1850, 1080]] },
    { type: 'rays', x: 960, y: -100, n: 5, spread: 0.9, len: 1300, color: 'rgba(230,255,190,0.07)' },
    { type: 'vine', x: 200, y: 140, len: 260 }, { type: 'vine', x: 420, y: 200, len: 180 },
    { type: 'vine', x: 1720, y: 140, len: 240 }, { type: 'vine', x: 1500, y: 200, len: 200 },
    { type: 'vine', x: 900, y: 200, len: 140 }, { type: 'vine', x: 1030, y: 200, len: 110 },
    { type: 'fog', y: 1000, h: 160, color: 'rgba(30,90,50,0.5)' },
    { type: 'motes', n: 30, color: 'rgba(220,255,180,0.5)', dir: -1, seed: 5 },
    { type: 'cobweb', x: 0, y: 0, r: 110 },
  ],
};

// --- 2. Hollow: a closed cave of stalactites -----------------------------------
const hollowCeil = terrain(0, W, [70, 130, 150, 110, 170, 130, 150, 120, 160, 110, 140, 70], -60, { smooth: 2 });
const hollow = {
  id: 'hollow',
  name: 'Stalactite Hollow',
  theme: 'cave',
  bgFile: 'bg_hollow.jpg',
  tagline: 'A sealed cavern: the ceiling is a floor too. Watch the fangs.',
  solids: [
    // stalactites
    { poly: spike(520, 130, 90, 230, { seed: 1, bend: 10 }) },
    { poly: spike(760, 150, 60, 140, { seed: 2 }) },
    { poly: spike(1160, 150, 64, 150, { seed: 3, bend: -6 }) },
    { poly: spike(1400, 130, 92, 240, { seed: 4, bend: -10 }) },
    { poly: spike(960, 140, 50, 90, { seed: 5 }) },
    // stalagmites
    { poly: spike(640, 990, 80, 130, { dir: -1, seed: 6 }) },
    { poly: spike(1280, 990, 80, 120, { dir: -1, seed: 7 }) },
    { poly: terrain(0, W, [930, 965, 990, 980, 1000, 985, 995, 1000, 980, 995, 965, 930], 1140, { smooth: 2 }) },
    { poly: hollowCeil },
    { poly: wall(0, 1080, [150, 120, 90, 130, 170, 110, 80, 100], -60, { smooth: 2 }) },
    { poly: mirror(wall(0, 1080, [150, 120, 90, 130, 170, 110, 80, 100], -60, { smooth: 2 })) },
    // ledges and the hanging boulder
    { poly: blob(400, 560, 140, 42, { seed: 11, flatTop: 0.35 }) },
    { poly: blob(1520, 560, 140, 42, { seed: 12, flatTop: 0.35 }) },
    { circle: [960, 600, 105] },
  ],
  spawns: [[330, 900], [820, 920], [1100, 920], [1590, 900], [400, 470], [1520, 470], [960, 470], [960, 950]],
  dropPoints: [[400, 300], [960, 300], [1520, 300]],
  enemySpawns: [[260, 300], [1660, 300], [700, 300], [1220, 300], [260, 800], [1660, 800]],
  killY: 1180,
  decor: [
    { type: 'light', x: 960, y: 600, r: 420, color: '#6a7cff' },
    { type: 'crystals', x: 300, y: 940, n: 4, color: '#8fd8ff', seed: 1 },
    { type: 'crystals', x: 1620, y: 940, n: 5, color: '#c69bff', seed: 2 },
    { type: 'crystals', x: 1000, y: 160, n: 3, color: '#8fd8ff', seed: 3, dir: 1 },
    { type: 'light', x: 300, y: 920, r: 180, color: '#8fd8ff' },
    { type: 'light', x: 1620, y: 920, r: 180, color: '#c69bff' },
    { type: 'drips', xs: [520, 1400, 760, 1160], ys: [360, 370, 290, 300], seed: 3 },
    { type: 'cobweb', x: 140, y: 150, r: 130 },
    { type: 'cobweb', x: 1780, y: 150, r: 130, a0: Math.PI / 2 },
    { type: 'motes', n: 20, color: 'rgba(160,200,255,0.35)', dir: 1, seed: 8 },
  ],
};

// --- 3. Caldera: lava below, rocks that rise and sink --------------------------
const calderaCliff = smoothPoly([[-60, 1100], [-60, 330], [80, 300], [190, 330], [250, 420], [230, 520], [300, 600], [330, 720], [290, 860], [320, 1100]], 1);
const caldera = {
  id: 'caldera',
  name: 'Caldera',
  theme: 'volcano',
  bgFile: 'bg_caldera.jpg',
  tagline: 'A lava lake. The stepping stones breathe up and down.',
  solids: [
    { poly: terrain(0, W, [1000, 1010, 995, 1008, 998, 1012, 996, 1006, 1000], 1100, { smooth: 1 }), mat: 'lava' },
    { poly: calderaCliff },
    { poly: mirror(calderaCliff) },
    // the broken crater rim arching overhead
    { poly: arc(960, 760, 620, 680, Math.PI + 0.38, 1.5 * Math.PI - 0.065, 10) },
    { poly: arc(960, 760, 620, 680, 1.5 * Math.PI + 0.065, 2 * Math.PI - 0.38, 10) },
    { circle: [640, 380, 36] },
    { circle: [1280, 380, 36] },
    // breathing stepping stones
    { poly: blob(800, 640, 95, 32, { seed: 21, flatTop: 0.4 }), bob: { dx: 0, dy: 50, period: 4.2 } },
    { poly: blob(1120, 640, 95, 32, { seed: 22, flatTop: 0.4 }), bob: { dx: 0, dy: -50, period: 4.2 } },
    { poly: blob(560, 780, 90, 30, { seed: 23, flatTop: 0.4 }), bob: { dx: 0, dy: 70, period: 5.1 } },
    { poly: blob(1360, 780, 90, 30, { seed: 24, flatTop: 0.4 }), bob: { dx: 0, dy: -70, period: 5.1 } },
    { poly: blob(960, 820, 110, 32, { seed: 25, flatTop: 0.4 }), bob: { dx: 0, dy: 60, period: 3.6 } },
  ],
  spawns: [[120, 250], [1800, 250], [700, 70], [1220, 70], [640, 320], [1280, 320], [800, 570], [1120, 570]],
  dropPoints: [[640, -30], [1280, -30], [960, -30]],
  enemySpawns: [[-60, 200], [W + 60, 200], [960, -60], [400, -60], [1520, -60]],
  killY: 1180,
  decor: [
    { type: 'silhouette', color: 'rgba(20,4,4,0.45)', poly: [[300, 1080], [560, 560], [700, 520], [900, 640], [1100, 600], [1300, 520], [1460, 600], [1640, 1080]] },
    { type: 'light', x: 960, y: 1060, r: 700, color: '#ff6a2a' },
    { type: 'light', x: 300, y: 1050, r: 300, color: '#ff8a3a' },
    { type: 'light', x: 1620, y: 1050, r: 300, color: '#ff8a3a' },
    { type: 'motes', n: 45, color: 'rgba(255,170,80,0.75)', dir: -1, seed: 9 },
    { type: 'smoke', x: 960, y: 1000, n: 6 },
  ],
};

// --- 4. Foundry: everything turns -------------------------------------------
const foundry = {
  id: 'foundry',
  name: 'Gearworks',
  theme: 'factory',
  bgFile: 'bg_foundry.jpg',
  tagline: 'Spinning gears and a turning cage. Hold on, the ground moves.',
  solids: [
    { poly: terrain(0, W, [955, 955, 965, 985, 1000, 1000, 985, 965, 955, 955], 1100, { smooth: 2 }) },
    // the turning cage around a fixed hub
    ...ring(960, 560, 225, 258, 3, 0.62, -Math.PI / 2, 9).map((poly) => ({ poly, spin: { cx: 960, cy: 560, speed: 0.45 } })),
    { circle: [960, 560, 72] },
    // corner gears
    { poly: gear(330, 330, 102, 132, 10), spin: { cx: 330, cy: 330, speed: 0.7 } },
    { poly: gear(1590, 330, 102, 132, 10), spin: { cx: 1590, cy: 330, speed: -0.7 } },
    { poly: gear(150, 650, 52, 72, 8), spin: { cx: 150, cy: 650, speed: -1.1 } },
    { poly: gear(1770, 650, 52, 72, 8), spin: { cx: 1770, cy: 650, speed: 1.1 } },
    // pipe along the ceiling and slanted girders
    { poly: capsule(-80, 40, 2000, 40, 24, 4) },
    { poly: capsule(600, 64, 760, 210, 16, 4) },
    { poly: capsule(1320, 64, 1160, 210, 16, 4) },
    // catwalks
    { poly: shard(330, 760, 300, 30, 0.08, 12) },
    { poly: shard(1590, 760, 300, 30, -0.08, 12) },
  ],
  spawns: [[200, 900], [560, 900], [1360, 900], [1720, 900], [960, 445], [960, 920], [330, 700], [1590, 700]],
  dropPoints: [[560, 120], [1360, 120], [960, 120]],
  enemySpawns: [[-60, 880], [W + 60, 880], [-60, 500], [W + 60, 500], [960, -60]],
  killY: 1180,
  decor: [
    { type: 'bggear', x: 960, y: 560, r: 420, teeth: 16, speed: -0.12, color: 'rgba(0,0,0,0.22)' },
    { type: 'bggear', x: 560, y: 980, r: 220, teeth: 12, speed: 0.2, color: 'rgba(0,0,0,0.2)' },
    { type: 'bggear', x: 1460, y: 160, r: 180, teeth: 10, speed: -0.25, color: 'rgba(0,0,0,0.18)' },
    { type: 'light', x: 960, y: 560, r: 300, color: '#ffb030' },
    { type: 'lamp', x: 560, y: 64, len: 120 }, { type: 'lamp', x: 1360, y: 64, len: 120 },
    { type: 'motes', n: 22, color: 'rgba(255,200,120,0.55)', dir: 1, seed: 4 },
  ],
};

// --- 5. Skyway: platforms on the move ----------------------------------------
const cloud = (cx, cy, rx, ry, seed) => blob(cx, cy, rx, ry * 1.35, { seed, flatTop: 0.5, rough: 0.2, n: 26 });
const skyway = {
  id: 'skyway',
  name: 'Skyway',
  theme: 'sky',
  bgFile: 'bg_skyway.jpg',
  tagline: 'Cloud lifts and ferries over open sky. Ride the timing.',
  solids: [
    { poly: island(250, 800, 380, 140, { seed: 31 }) },
    { poly: island(1670, 800, 380, 140, { seed: 32 }) },
    { poly: cloud(960, 150, 190, 46, 33) },
    { poly: cloud(470, 240, 90, 30, 34) },
    { poly: cloud(1450, 240, 90, 30, 35) },
    // lifts
    { poly: cloud(690, 690, 110, 30, 36), move: { path: [[0, 0], [0, -280]], period: 6 } },
    { poly: cloud(1230, 410, 110, 30, 37), move: { path: [[0, 0], [0, 280]], period: 6 } },
    // the low ferry
    { poly: cloud(700, 950, 105, 28, 38), move: { path: [[0, 0], [520, 0]], period: 7.5 } },
    // the roundabout in the middle
    { poly: cloud(960, 560, 85, 26, 39), move: { path: [[-210, 0], [0, -130], [210, 0], [0, 130]], period: 10 } },
    // edge elevators
    { poly: cloud(110, 470, 80, 26, 40), move: { path: [[0, 60], [0, -170]], period: 5 } },
    { poly: cloud(1810, 470, 80, 26, 41), move: { path: [[0, -170], [0, 60]], period: 5 } },
  ],
  spawns: [[160, 740], [350, 740], [1570, 740], [1760, 740], [880, 90], [1040, 90], [470, 190], [1450, 190]],
  dropPoints: [[250, -30], [1670, -30], [960, -30]],
  enemySpawns: [[-60, 300], [W + 60, 300], [960, -60], [-60, 650], [W + 60, 650]],
  killY: 1180,
  decor: [
    { type: 'cloudbank', y: 1010, color: 'rgba(255,255,255,0.55)', seed: 2 },
    { type: 'clouds', n: 6, color: 'rgba(255,255,255,0.18)', seed: 4, speed: 18 },
    { type: 'motes', n: 14, color: 'rgba(255,255,255,0.5)', dir: 1, seed: 6 },
  ],
};

// --- 6. Glasshouse: panes that shatter and grow back --------------------------
const tower = smoothPoly([[100, 1100], [110, 560], [140, 430], [210, 390], [280, 430], [305, 560], [320, 1100]], 1);
const glassRespawn = 7;
const glasshouse = {
  id: 'glasshouse',
  name: 'Moon Conservatory',
  theme: 'night',
  bgFile: 'bg_glasshouse.jpg',
  tagline: 'Glass breaks under fire and grows back. Don\'t trust the roof.',
  solids: [
    { poly: tower },
    { poly: mirror(tower) },
    { poly: terrain(0, W, [965, 960, 968, 972, 975, 975, 972, 968, 960, 965], 1100, { smooth: 2 }) },
    // the keystone the roof hangs from
    { poly: ngon(960, 165, 62, 8, Math.PI / 8) },
    { circle: [560, 300, 30] },
    { circle: [1360, 300, 30] },
    // glass roof
    { poly: shard(590, 300, 620, 22, -0.335, 8), mat: 'glass', respawn: glassRespawn },
    { poly: mirror(shard(590, 300, 620, 22, -0.335, 8)), mat: 'glass', respawn: glassRespawn },
    // the glass dome over the centre bed
    ...ring(960, 975, 300, 324, 8, 0.11, Math.PI, 3).slice(0, 4).map((poly) => ({ poly, mat: 'glass', respawn: glassRespawn })),
    // glass shelves
    { poly: shard(520, 640, 210, 20, 0.05, 8), mat: 'glass', respawn: glassRespawn },
    { poly: shard(1400, 640, 210, 20, -0.05, 8), mat: 'glass', respawn: glassRespawn },
    // planters
    { poly: blob(960, 960, 110, 34, { seed: 51, flatTop: 0.5, flatBottom: 0.5 }) },
  ],
  spawns: [[210, 330], [1710, 330], [470, 900], [1450, 900], [800, 900], [1120, 900], [560, 240], [1360, 240]],
  dropPoints: [[210, -30], [1710, -30], [960, -30]],
  enemySpawns: [[-60, 860], [W + 60, 860], [960, -60], [-60, 300], [W + 60, 300]],
  killY: 1180,
  decor: [
    { type: 'stars', n: 90, seed: 3 },
    { type: 'light', x: 960, y: 840, r: 360, color: '#9fffd0' },
    { type: 'frame', poly: [[200, 400], [960, 170], [1720, 400]] },
    { type: 'plants', x: 960, y: 940, n: 7, seed: 2, color: 'rgba(60,140,110,0.7)' },
    { type: 'plants', x: 600, y: 960, n: 4, seed: 5, color: 'rgba(40,110,90,0.6)' },
    { type: 'plants', x: 1320, y: 960, n: 4, seed: 7, color: 'rgba(40,110,90,0.6)' },
    { type: 'motes', n: 18, color: 'rgba(190,255,220,0.6)', dir: -1, seed: 12 },
  ],
};

// --- 7. Glacier: slopes you can't cling to ----------------------------------
const slopeL = [[-60, 1120], [-60, 520], [80, 515], [300, 600], [520, 700], [740, 900], [700, 1120]];
const glacier = {
  id: 'glacier',
  name: 'Glacier Rift',
  theme: 'frost',
  bgFile: 'bg_glacier.jpg',
  tagline: 'Ice won\'t hold you. Slide too far and the rift takes you.',
  solids: [
    { poly: smoothPoly(slopeL, 1), mat: 'ice' },
    { poly: mirror(smoothPoly(slopeL, 1)), mat: 'ice' },
    // rock you can grip
    { poly: blob(420, 690, 85, 55, { seed: 61 }) },
    { poly: blob(1500, 690, 85, 55, { seed: 62 }) },
    { poly: blob(960, 905, 120, 48, { seed: 63, flatTop: 0.3 }) },
    { poly: island(250, 250, 300, 90, { seed: 64 }) },
    { poly: island(1670, 250, 300, 90, { seed: 65 }) },
    { poly: blob(960, 150, 150, 58, { seed: 66 }) },
    { poly: blob(600, 430, 72, 28, { seed: 67, flatTop: 0.4 }) },
    { poly: blob(1320, 430, 72, 28, { seed: 68, flatTop: 0.4 }) },
    // icicles and the ice bridge
    { poly: spike(900, 190, 46, 120, { seed: 71 }), mat: 'ice' },
    { poly: spike(1020, 190, 40, 95, { seed: 72 }), mat: 'ice' },
    { poly: spike(200, 310, 40, 90, { seed: 73 }), mat: 'ice' },
    { poly: spike(1720, 310, 40, 90, { seed: 74 }), mat: 'ice' },
    { poly: shard(960, 560, 240, 26, 0, 12), mat: 'ice' },
  ],
  spawns: [[420, 610], [1500, 610], [960, 830], [960, 70], [600, 370], [1320, 370], [200, 180], [1720, 180]],
  dropPoints: [[600, -30], [1320, -30], [960, -30]],
  enemySpawns: [[-60, 300], [W + 60, 300], [960, -60], [-60, 450], [W + 60, 450]],
  killY: 1180,
  decor: [
    { type: 'fog', y: 1010, h: 200, color: 'rgba(40,80,120,0.55)' },
    { type: 'motes', n: 70, color: 'rgba(255,255,255,0.8)', dir: 1, seed: 7 },
  ],
};

// --- 8. Sweets: bouncy gumdrops, only the canes hold ----------------------------
const caneColor = { color: '#f6f0f4', top: '#ff4a7a' };
const cane = (x, dir) => [
  { poly: capsule(x, -60, x, 220, 15, 4), ...caneColor, stripes: true },
  { poly: arc(x + dir * 60, 220, 45, 75, dir > 0 ? 0 : Math.PI, dir > 0 ? Math.PI : 0, 10).map(([a, b]) => [a, b]), ...caneColor, stripes: true },
];
const sweets = {
  id: 'sweets',
  name: 'Gumdrop Grove',
  theme: 'candy',
  bgFile: 'bg_sweets.jpg',
  tagline: 'Gumdrops bounce you, nothing sweet will hold you. Hook the canes.',
  solids: [
    { poly: blob(380, 950, 100, 78, { seed: 81, flatBottom: 0.5 }), mat: 'bouncy', color: '#5ad17a' },
    { poly: blob(960, 975, 120, 86, { seed: 82, flatBottom: 0.5 }), mat: 'bouncy', color: '#ffb030' },
    { poly: blob(1540, 950, 100, 78, { seed: 83, flatBottom: 0.5 }), mat: 'bouncy', color: '#7a8aff' },
    // lollipops
    { poly: capsule(640, 560, 640, 960, 10, 3), color: '#fff8f0', top: '#fff8f0' },
    { poly: capsule(1280, 560, 1280, 960, 10, 3), color: '#fff8f0', top: '#fff8f0' },
    { poly: terrain(0, W, [930, 950, 965, 945, 930, 950, 975, 960, 940, 935, 955, 940, 925], 1100, { smooth: 2 }) },
    { circle: [640, 500, 70], color: '#ff5aa0', top: '#ffd0e6', swirl: true },
    { circle: [1280, 500, 70], color: '#5ac8ff', top: '#d0f0ff', swirl: true },
    // candy canes hanging from above
    ...cane(300, 1), ...cane(1620, -1),
    // cotton candy cloud and a jelly bean trampoline
    { poly: blob(960, 200, 160, 50, { seed: 84, rough: 0.2 }), color: '#ffc2e6', top: '#ffffff' },
    { poly: capsule(850, 690, 1070, 690, 24, 5), mat: 'bouncy', color: '#c070ff' },
  ],
  spawns: [[170, 860], [1750, 860], [800, 880], [640, 400], [1280, 400], [360, 225], [1560, 225], [960, 120]],
  dropPoints: [[640, -30], [1280, -30], [960, -30]],
  enemySpawns: [[-60, 820], [W + 60, 820], [960, -60], [-60, 400], [W + 60, 400]],
  killY: 1180,
  decor: [
    { type: 'sprinkles', n: 60, seed: 3 },
  ],
};

// --- 9. Storm: one bowl in the sky, rocks circling it ------------------------
const stormShard = smoothPoly([[112, 296], [130, 282], [172, 280], [214, 284], [240, 300], [245, 340], [228, 420], [250, 500], [205, 535], [150, 512], [118, 430], [138, 360]], 1);
const storm = {
  id: 'storm',
  name: 'Eye of the Storm',
  theme: 'storm',
  bgFile: 'bg_storm.jpg',
  tagline: 'One bowl, nothing below. Swing from the stones the wind carries round.',
  solids: [
    { poly: arc(960, 470, 300, 345, 0.07, Math.PI - 0.07, 18) },
    // stones orbiting the bowl (spin about its centre)
    { circle: [960 + 455, 470, 36], spin: { cx: 960, cy: 470, speed: 0.24 } },
    { circle: [960 - 228, 470 + 394, 36], spin: { cx: 960, cy: 470, speed: 0.24 } },
    { circle: [960 - 228, 470 - 394, 36], spin: { cx: 960, cy: 470, speed: 0.24 } },
    // torn pillars at the sides, high stones, low ledges
    { poly: stormShard },
    { poly: mirror(stormShard) },
    { poly: blob(440, 140, 80, 34, { seed: 91 }) },
    { poly: blob(1480, 140, 80, 34, { seed: 92 }) },
    { poly: island(230, 790, 260, 110, { seed: 93 }) },
    { poly: island(1690, 790, 260, 110, { seed: 94 }) },
  ],
  spawns: [[820, 700], [1100, 700], [230, 720], [1690, 720], [170, 215], [1750, 215], [440, 70], [1480, 70]],
  dropPoints: [[960, -30], [440, -30], [1480, -30]],
  enemySpawns: [[-60, 250], [W + 60, 250], [960, -60], [-60, 650], [W + 60, 650]],
  killY: 1180,
  decor: [
    { type: 'vortex', x: 960, y: 470, r: 700 },
    { type: 'lightning', seed: 5 },
    { type: 'rain', n: 90, seed: 2 },
  ],
};

// --- 10. Dunes: ruins on solid sand, open sky ------------------------------
const dunes = {
  id: 'dunes',
  name: 'Sunken Ruins',
  theme: 'desert',
  bgFile: 'bg_dunes.jpg',
  tagline: 'Solid sand and open sky. The broken arch is the only way up.',
  solids: [
    // the broken arch
    { poly: arc(960, 960, 330, 400, Math.PI, Math.PI + 1.25, 12) },
    { poly: arc(960, 960, 330, 400, 2 * Math.PI - 1.0, 2 * Math.PI, 10) },
    // temple remnant: column + tilted lintel
    { poly: capsule(300, 960, 300, 480, 42, 4) },
    { poly: shard(390, 430, 420, 50, 0.1, 14) },
    // fallen pillars
    { poly: shard(1560, 770, 120, 330, 0.07, 12) },
    { poly: shard(1360, 905, 240, 46, -0.1, 16) },
    { poly: shard(660, 905, 220, 50, 0.18, 18) },
    // cliff overhang top-right and a balanced boulder
    { poly: blob(1800, 170, 230, 100, { seed: 101, flatTop: 0.4 }) },
    { circle: [1110, 935, 56] },
    { poly: terrain(0, W, [880, 910, 945, 930, 900, 920, 955, 950, 905, 900, 935, 915, 880], 1100, { smooth: 2 }) },
  ],
  spawns: [[120, 820], [560, 830], [1350, 790], [1820, 810], [815, 540], [1572, 550], [430, 350], [1780, 40]],
  dropPoints: [[560, -30], [1350, -30], [960, -30], [120, -30]],
  enemySpawns: [[-60, 780], [W + 60, 780], [960, -60], [-60, 300], [W + 60, 300]],
  killY: 1180,
  decor: [
    { type: 'silhouette', color: 'rgba(120,60,20,0.18)', poly: [[0, 820], [300, 700], [520, 760], [900, 640], [1300, 760], [1600, 680], [1920, 760], [1920, 1080], [0, 1080]] },
    { type: 'motes', n: 26, color: 'rgba(255,230,180,0.5)', dir: 0.2, drift: 60, seed: 11 },
  ],
};

export const BOARDS = [canopy, hollow, caldera, foundry, skyway, glasshouse, glacier, sweets, storm, dunes];
