// The boards. Coordinates are world pixels, y grows downward, solids are
// specified by CENTER x,y plus width/height. Everything solid is grabbable
// unless marked deadly or grab:false. See level.js for the full format.
//
// Design notes: a standing player's hand latches ~110px above the surface it
// stands on, and ~90px around the body while hanging — vertical steps stay
// under ~130px and "leaps" expect a swing-fling.

function S(x, y, w, h, opts = {}) {
  return { x, y, w, h, ...opts };
}

// left + right boundary walls
function walls(w, h, t = 40) {
  return [S(t / 2, h / 2, t, h), S(w - t / 2, h / 2, t, h)];
}

export const LEVELS = [
  // -------------------------------------------------- 1. learn to grab/fling
  {
    name: 'GRAB SCHOOL',
    intro: 'Hold LT/RT to grab. Sticks move your arms — swing and let go!',
    w: 1600, h: 900,
    bg: ['#20304f', '#3a5a8c'], plat: '#4a5d8f', accent: '#ffd166',
    spawn: { x: 150, y: 780 },
    goal: { x: 1460, y: 760, r: 46 },
    solids: [
      ...walls(1600, 900),
      S(410, 870, 780, 60),               // left floor (20..800)
      S(660, 760, 150, 160),              // practice tower
      S(990, 560, 170, 44),               // handhold floating over the pit
      S(1390, 870, 380, 60),              // right floor (1200..1580)
      S(1000, 950, 400, 100, { deadly: true }), // spikes in the pit
    ],
    texts: [
      { x: 400, y: 330, text: 'HOLD  LT / RT  TO GRAB' },
      { x: 990, y: 380, text: 'SWING WITH THE STICK — RELEASE TO FLING' },
      { x: 400, y: 380, text: 'PUSH A STICK TO WAVE THAT ARM', size: 20 },
    ],
  },

  // ------------------------------------------------------------ 2. climbing
  {
    name: 'THE WALL',
    intro: 'Grab high, flip yourself over, repeat. Falling is free here.',
    w: 1600, h: 900,
    bg: ['#191527', '#2f2447'], plat: '#4f3f73', accent: '#ff9de2',
    spawn: { x: 120, y: 800 },
    goal: { x: 1470, y: 255, r: 46 },
    solids: [
      ...walls(1600, 900),
      S(800, 880, 1600, 40),              // safe floor
      S(280, 745, 320, 36),               // zig-zag ledges up
      S(600, 620, 240, 36),
      S(320, 495, 240, 36),
      S(640, 370, 240, 36),
      S(1000, 260, 220, 32),              // bridge
      S(1420, 330, 320, 36),              // goal tower
    ],
    powerups: [{ x: 1000, y: 180 }],
    texts: [{ x: 460, y: 180, text: 'GRAB A LEDGE AND PUSH WHERE YOU WANT TO GO' }],
  },

  // --------------------------------------------------------- 3. monkey bars
  {
    name: 'MONKEY BARS',
    intro: 'Hand over hand across the spikes. Alternate those triggers!',
    w: 1600, h: 900,
    bg: ['#2b1e3d', '#7a3b5e'], plat: '#5d4a7a', accent: '#ffb84d',
    spawn: { x: 130, y: 700 },
    goal: { x: 1480, y: 610, r: 46 },
    solids: [
      ...walls(1600, 900),
      S(230, 760, 420, 44),               // start floor
      S(420, 620, 150, 34),               // step 1
      S(350, 480, 180, 32),               // launch platform
      S(560, 350, 80, 26),                // the bars
      S(700, 350, 80, 26),
      S(840, 350, 80, 26),
      S(980, 350, 80, 26),
      S(1120, 350, 80, 26),
      S(830, 880, 780, 40, { deadly: true }), // spike floor
      S(1400, 700, 360, 40),              // landing
    ],
    powerups: [{ x: 840, y: 260 }],
  },

  // -------------------------------------------------------------- 4. ropes
  {
    name: 'ROPE CHASM',
    intro: 'Grab a rope, pump the swing, let go at the top of the arc.',
    w: 1600, h: 900,
    bg: ['#12261e', '#1e4d33'], plat: '#3a6b45', accent: '#b6f26d',
    spawn: { x: 120, y: 560 },
    goal: { x: 1480, y: 560, r: 46 },
    solids: [
      ...walls(1600, 900),
      S(200, 640, 360, 40),               // start platform
      S(1420, 640, 320, 40),              // goal platform
      S(800, 890, 880, 60, { deadly: true }), // spike chasm floor
    ],
    ropes: [
      { x: 450, y: 120, len: 470 },
      { x: 730, y: 120, len: 430 },
      { x: 1010, y: 120, len: 430 },
    ],
    powerups: [{ x: 780, y: 560 }],
  },

  // ------------------------------------------------------------ 5. spinners
  {
    name: 'SPIN CYCLE',
    intro: 'Grab the spinning bars, ride the momentum, release to launch.',
    w: 1600, h: 900,
    bg: ['#1c2226', '#2e3c44'], plat: '#50646e', accent: '#66e0ff',
    spawn: { x: 130, y: 700 },
    goal: { x: 1480, y: 150, r: 46 },
    solids: [
      ...walls(1600, 900),
      S(340, 780, 640, 50),               // start floor
      S(940, 420, 180, 30),               // mid rest platform
      S(1450, 220, 260, 36),              // goal platform
      S(1120, 880, 920, 40, { deadly: true }), // spikes under everything else
    ],
    spinners: [
      { x: 620, y: 540, len: 300, speed: 2.0 },
      { x: 1150, y: 280, len: 280, speed: -2.2 },
    ],
    powerups: [{ x: 940, y: 330 }],
  },

  // ------------------------------------------------------------ 6. balloons
  {
    name: 'BALLOON ASCENT',
    intro: 'One balloon lifts one robot. Fight for yours and float up!',
    w: 1200, h: 1300,
    bg: ['#4d8fc4', '#a8d8f0'], plat: '#e8eef5', accent: '#ff7eb6',
    spawn: { x: 600, y: 1200 },
    goal: { x: 600, y: 115, r: 46 },
    solids: [
      ...walls(1200, 1300),
      S(600, 1270, 1200, 60),             // floor
      S(200, 950, 240, 32),               // cloud rest ledges
      S(1000, 880, 240, 32),
      S(600, 650, 260, 32),
      S(200, 420, 240, 32),
      S(1000, 350, 240, 32),
      S(600, 180, 300, 36),               // goal platform
    ],
    balloons: [
      { x: 300, y: 1150 },
      { x: 600, y: 1120 },
      { x: 900, y: 1150 },
    ],
    powerups: [{ x: 600, y: 900 }],
  },

  // -------------------------------------------------------- 7. moving lava
  {
    name: 'LAVA FERRY',
    intro: 'Ride the ferries. The lava is not friendly.',
    w: 1600, h: 900,
    bg: ['#26090b', '#511217'], plat: '#6e3b2a', accent: '#ffae42',
    hazard: '#ff6b35',
    spawn: { x: 120, y: 620 },
    goal: { x: 1500, y: 405, r: 44 },
    solids: [
      ...walls(1600, 900),
      S(160, 700, 280, 40),               // start
      S(870, 600, 120, 30),               // island
      S(1480, 480, 200, 36),              // goal platform
      S(800, 885, 1560, 50, { deadly: true }), // lava
    ],
    movers: [
      { w: 150, h: 26, from: [420, 640], to: [720, 640], speed: 110 },
      { w: 150, h: 26, from: [1010, 540], to: [1330, 540], speed: 130, phase: 1 },
    ],
    powerups: [{ x: 870, y: 520 }],
  },

  // ------------------------------------------------------------- 8. finale
  {
    name: 'THE GAUNTLET',
    intro: 'Ropes, bars, spinners, spikes. Everything you know. GO!',
    w: 2000, h: 1000,
    bg: ['#0d1026', '#232a54'], plat: '#3c477e', accent: '#9dffb0',
    spawn: { x: 120, y: 800 },
    goal: { x: 1880, y: 190, r: 46 },
    solids: [
      ...walls(2000, 1000),
      S(170, 900, 300, 60),               // start floor
      S(360, 760, 120, 240),              // launch tower
      S(1030, 640, 180, 32),              // mid platform after ropes
      S(1200, 510, 70, 24),               // monkey bars
      S(1330, 510, 70, 24),
      S(1460, 510, 70, 24),
      S(1870, 260, 220, 32),              // goal platform
      S(1000, 985, 1960, 50, { deadly: true }), // spikes everywhere below
    ],
    ropes: [
      { x: 520, y: 140, len: 420 },
      { x: 800, y: 140, len: 420 },
    ],
    spinners: [{ x: 1680, y: 420, len: 280, speed: 2.1 }],
    powerups: [{ x: 800, y: 560 }, { x: 1330, y: 400 }],
  },
];
