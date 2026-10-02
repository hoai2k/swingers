// The boards. Coordinates are world pixels, y grows downward, solids are
// specified by CENTER x,y plus width/height. Everything solid is grabbable
// unless marked deadly or grab:false. See level.js for the full format.
//
// Design rules (measured against the physics — see scratchpad/validate.mjs):
//   standing latch reach: target underside <= ~105px above the stand top
//   hanging bar-to-bar reach: centers <= ~148px apart
//   swing-fling gaps: easy <= 270, medium <= 390, hard <= 470 px
//   rope catch: rope tail within ~95px of the stander's body
//   spinner catch: tip sweep passes within ~88px
//   balloon catch: hover home <= ~100px above the stander's body
//   bounce pad (flat, from standing): bounce 12 -> ~170px rise, 16 -> ~275,
//     18 -> ~335, 20 -> ~400, 22 -> ~470 (body center); tilted pads keep the
//     speed but trade height for distance
//   updraft fy -1.3: ~6 px/tick at the top of a 750px vent; a rider hovers
//     where the zone ends, so every vent needs a nudge zone or handhold there
// Each board carries a `route` — the intended solution as typed hops —
// which the validator checks against these envelopes. Gimmick hops
// (bounce, slide, vent, windFling, hangDown, walk) were checked by scripted
// physics probes instead (teleport + mocked sticks, see main.js __hh).
//
// Heave Ho-style structure: single-screen rooms, goal visible from spawn,
// one gimmick per room (twisted and combined as difficulty rises), cheap
// deaths, chains optional but helpful.
//
// The 30 boards, one distinct challenge each:
//   EASY    grab+swing, ledge climb, stone flings, hand-over-hand, ropes,
//           ferry, balloon, spinner, trampolines, ice (grab to brake)
//   MEDIUM  monkey bars over spikes, spinner launch, timed lava lifts,
//           over/under, rope chain, precision landings, balloon steering,
//           wheel-to-bars momentum, crumbling bridge, climbing DOWN
//   HARD    everything mixed, spike sandwich, long-distance, wheel
//           hand-offs, balloon gusts, ferry hopping, wheel tower, fling
//           corridor, wind vents, the summit
// Long hard boards get a checkpoint flag so a slip costs a section, not
// the whole board.

function S(x, y, w, h, opts = {}) {
  return { x, y, w, h, ...opts };
}

// left + right boundary walls (full height)
function walls(w, h, t = 40) {
  return [S(t / 2, h / 2, t, h), S(w - t / 2, h / 2, t, h)];
}

// One boundary wall with the y1..y2 span REMOVED. A floor stub and a top
// piece remain — the wall still frames the room and catches overshoots —
// but the gap is wider than any grab reach, so the wall can't be climbed
// from the floor to the decks (no more walk-right-shimmy-up cheese routes).
// Bodies that fly out through the gap die out-of-bounds like any fall.
function gapWall(x, h, y1, y2, t = 40) {
  return [S(x, y1 / 2, t, y1), S(x, (y2 + h) / 2, t, h - y2)];
}

const PAL = {
  meadow:  { theme: 'meadow', bg: ['#20304f', '#3a5a8c'], plat: '#4a5d8f', accent: '#ffd166' },
  cave:    { theme: 'cave', bg: ['#191527', '#2f2447'], plat: '#4f3f73', accent: '#ff9de2' },
  sunset:  { theme: 'sunset', bg: ['#2b1e3d', '#7a3b5e'], plat: '#5d4a7a', accent: '#ffb84d' },
  jungle:  { theme: 'jungle', bg: ['#12261e', '#1e4d33'], plat: '#3a6b45', accent: '#b6f26d' },
  factory: { theme: 'factory', bg: ['#1c2226', '#2e3c44'], plat: '#50646e', accent: '#66e0ff' },
  sky:     { theme: 'sky', bg: ['#4d8fc4', '#a8d8f0'], plat: '#e8eef5', accent: '#ff7eb6' },
  volcano: { theme: 'volcano', bg: ['#26090b', '#511217'], plat: '#6e3b2a', accent: '#ffae42', hazard: '#ff6b35' },
  night:   { theme: 'night', bg: ['#0d1026', '#232a54'], plat: '#3c477e', accent: '#9dffb0' },
  candy:   { theme: 'candy', bg: ['#33203f', '#5e2f63'], plat: '#7a4d8a', accent: '#ffd1f0' },
  frost:   { theme: 'frost', bg: ['#16283a', '#2c4a63'], plat: '#527a99', accent: '#bdf3ff' },
  desert:  { theme: 'desert', bg: ['#2a1d1f', '#6e4631'], plat: '#8a6748', accent: '#ffcf6b' },
  storm:   { theme: 'storm', bg: ['#1a2130', '#46566e'], plat: '#5f6f88', accent: '#9fe3ff' },
};

// The lobby playground: join, warm up on one of everything, press PLAY.
export const PRACTICE = {
  name: 'PLAYGROUND',
  w: 1600, h: 900,
  ...PAL.meadow,
  spawn: { x: 300, y: 780 },
  solids: [
    ...walls(1600, 900),
    S(800, 870, 1600, 60),               // floor (top 840)
    S(1150, 740, 140, 200),              // climb tower (top 640)
    S(650, 560, 160, 40),                // floating handhold
    S(950, 420, 80, 26),                 // a monkey bar
  ],
  ropes: [{ x: 1260, y: 120, len: 460 }],
  balloons: [{ x: 450, y: 740 }],
  texts: [
    { x: 650, y: 480, text: 'GRAB • SWING • FLING', size: 22 },
    { x: 800, y: 250, text: 'WARM UP — PRESS PLAY WHEN READY', size: 26 },
  ],
};

export const LEVELS = [
  // ══════════════════════════════ EASY ══════════════════════════════
  {
    name: 'GRAB SCHOOL', diff: 'easy',
    intro: 'Hold LT/RT to grab. Sticks steer — push where you want to go!',
    w: 1600, h: 900, ...PAL.meadow,
    spawn: { x: 150, y: 780 },
    goal: { x: 1460, y: 760, r: 46 },
    solids: [
      ...walls(1600, 900),
      S(410, 870, 780, 60),
      S(660, 760, 150, 160),
      S(990, 560, 170, 44),
      S(1390, 870, 380, 60),
      S(1000, 950, 400, 100, { deadly: true }),
    ],
    texts: [
      { x: 400, y: 330, text: 'HOLD  LT / RT  TO GRAB' },
      { x: 990, y: 380, text: 'SWING WITH THE STICK — RELEASE TO FLING' },
    ],
    route: [
      { move: 'climb', x: 660, y: 659 },
      { move: 'fling', x: 910, y: 580, from: { x: 720, y: 659 } },
      { move: 'swingCatch', x: 1250, y: 819, from: { x: 1050, y: 660 } },
    ],
  },
  {
    name: 'THE WALL', diff: 'easy',
    intro: 'Grab a ledge and push where you want to go. Falling is free here.',
    w: 1600, h: 900, ...PAL.cave,
    spawn: { x: 120, y: 800 },
    goal: { x: 1470, y: 255, r: 46 },
    solids: [
      S(20, 450, 40, 900),
      ...gapWall(1580, 900, 400, 700),   // right wall: unclimbable gap
      S(800, 880, 1600, 40),
      S(280, 745, 320, 36),
      S(600, 620, 240, 36),
      S(320, 495, 240, 36),
      S(640, 370, 240, 36),
      S(1000, 260, 220, 32),
      S(1420, 330, 320, 36),
    ],
    powerups: [{ x: 1000, y: 180 }],
    texts: [{ x: 460, y: 180, text: 'GRAB A LEDGE AND PUSH WHERE YOU WANT TO GO' }],
    route: [
      { move: 'standLatch', x: 280, y: 763, from: { x: 280, y: 839 } },
      { move: 'standLatch', x: 510, y: 638, from: { x: 500, y: 706 } },
      { move: 'standLatch', x: 430, y: 513, from: { x: 420, y: 581 } },
      { move: 'standLatch', x: 530, y: 388, from: { x: 540, y: 456 } },
      { move: 'fling', x: 900, y: 276, from: { x: 750, y: 331 } },
      { move: 'fling', x: 1270, y: 312, from: { x: 1100, y: 223 } },
    ],
  },
  {
    name: 'BALLOON ASCENT', diff: 'easy',
    intro: 'One balloon lifts one robot. Grab on and float up!',
    w: 1200, h: 1300, ...PAL.sky,
    spawn: { x: 600, y: 1200 },
    goal: { x: 600, y: 115, r: 46 },
    solids: [
      S(20, 250, 40, 500),                 // left wall pieces: platform bands
      S(20, 935, 40, 130),                 //   stay backed, the spans between
      S(20, 1270, 40, 60),                 //   them are unclimbable gaps
      S(1180, 215, 40, 430),               // right wall pieces: same idea
      S(1180, 865, 40, 130),
      S(1180, 1235, 40, 130),
      S(600, 1270, 1200, 60),
      S(200, 950, 240, 32),
      S(1000, 880, 240, 32),
      S(600, 650, 260, 32),
      S(200, 420, 240, 32),
      S(1000, 350, 240, 32),
      S(600, 180, 300, 36),
    ],
    balloons: [{ x: 300, y: 1150 }, { x: 600, y: 1120 }, { x: 900, y: 1150 }],
    powerups: [{ x: 600, y: 900 }],
    route: [
      { move: 'balloonCatch', x: 600, y: 1120, from: { x: 600, y: 1219 } },
      { move: 'ride', x: 600, y: 300 },
    ],
  },
  {
    name: 'STEPPING STONES', diff: 'easy',
    intro: 'Hop stone to stone. Miss? The valley floor is soft — climb back.',
    w: 1600, h: 900, ...PAL.jungle,
    spawn: { x: 120, y: 800 },
    goal: { x: 1450, y: 620, r: 46 },
    solids: [
      S(20, 450, 40, 900),
      ...gapWall(1580, 900, 540, 800),   // right wall: unclimbable gap
      S(800, 880, 1600, 40),               // safe valley floor
      S(300, 780, 220, 160),               // stones (tops ~700)
      S(640, 785, 200, 150),
      S(980, 780, 200, 160),
      S(1320, 775, 220, 170),
    ],
    texts: [{ x: 800, y: 320, text: 'LITTLE FLINGS — STONE TO STONE' }],
    route: [
      { move: 'climb', x: 300, y: 679 },
      { move: 'fling', x: 640, y: 689, from: { x: 380, y: 679 } },
      { move: 'fling', x: 980, y: 679, from: { x: 720, y: 689 } },
      { move: 'fling', x: 1320, y: 669, from: { x: 1060, y: 679 } },
    ],
  },
  {
    name: 'FIRST SWING', diff: 'easy',
    intro: 'Hand over hand along the holds. The floor below is safe.',
    w: 1600, h: 900, ...PAL.sunset,
    spawn: { x: 150, y: 620 },
    goal: { x: 1400, y: 545, r: 46 },
    solids: [
      S(20, 450, 40, 900),
      ...gapWall(1580, 900, 620, 840),   // right wall: unclimbable gap
      S(800, 880, 1600, 40),               // safe floor
      S(270, 700, 500, 44),                // start deck (top 678)
      S(545, 540, 80, 40),                 // holds at 140 spacing (bottoms 560)
      S(685, 540, 80, 40),
      S(825, 540, 80, 40),
      S(965, 540, 80, 40),
      S(1350, 615, 460, 44),               // landing deck (top 593 — high
                                           // enough that the safe floor can't
                                           // hop onto it; swing in instead)
    ],
    texts: [{ x: 800, y: 300, text: 'ALTERNATE THE TRIGGERS' }],
    route: [
      { move: 'standLatch', x: 545, y: 560, from: { x: 500, y: 657 } },
      { move: 'hangReach', x: 685, y: 560 },
      { move: 'hangReach', x: 825, y: 560 },
      { move: 'hangReach', x: 965, y: 560 },
      { move: 'swingCatch', x: 1160, y: 572, from: { x: 985, y: 630 } },
    ],
  },
  {
    name: 'ROPE GARDEN', diff: 'easy',
    intro: 'Two gentle ropes. Let go at the top of the arc.',
    w: 1600, h: 900, ...PAL.jungle,
    spawn: { x: 150, y: 560 },
    goal: { x: 1430, y: 560, r: 46 },
    solids: [
      S(20, 450, 40, 900),
      ...gapWall(1580, 900, 620, 850),   // right wall: unclimbable gap
      S(800, 880, 1600, 40),               // safe floor below
      S(240, 640, 440, 44),                // start (top 618)
      S(800, 700, 320, 40),                // mid island (top 680)
      S(1360, 612, 440, 44),               // goal deck (top 590 — swing in;
                                           // too high to hop from the floor)
    ],
    ropes: [
      { x: 520, y: 120, len: 420 },
      { x: 990, y: 120, len: 480 },
    ],
    route: [
      { move: 'ropeCatch', x: 520, y: 540, from: { x: 450, y: 597 } },
      { move: 'swingCatch', x: 720, y: 659, from: { x: 560, y: 600 } },
      { move: 'ropeCatch', x: 990, y: 600, from: { x: 940, y: 659 } },
      { move: 'swingCatch', x: 1180, y: 569, from: { x: 1040, y: 640 } },
    ],
  },
  {
    name: 'FERRY RIDE', diff: 'easy',
    intro: 'All aboard. One slow ferry — stay out of the freezing water.',
    w: 1600, h: 900, ...PAL.frost,
    spawn: { x: 150, y: 560 },
    goal: { x: 1430, y: 560, r: 46 },
    solids: [
      S(20, 450, 40, 900),
      ...gapWall(1580, 900, 640, 840),   // right wall: unclimbable gap
      S(230, 880, 460, 40),                // start-side shore
      S(1415, 880, 370, 40),               // goal-side shore
      S(845, 902, 770, 45, { deadly: true }),  // freezing water — ride, don't wade
      S(240, 640, 440, 44),
      S(1360, 640, 440, 44),
    ],
    movers: [{ w: 170, h: 26, from: [560, 660], to: [1040, 660], speed: 90 }],
    route: [
      { move: 'mover', x: 560, y: 660, from: { x: 450, y: 597 }, halfw: 85 },
      { move: 'ride', x: 1040, y: 660 },
      { move: 'drop', x: 1200, y: 597 },
    ],
  },
  {
    name: 'GENTLE SPIN', diff: 'easy',
    intro: 'Catch the slow wheel, ride it around, let go at the top.',
    w: 1600, h: 900, ...PAL.factory,
    spawn: { x: 150, y: 620 },
    goal: { x: 1330, y: 430, r: 46 },
    solids: [
      S(20, 450, 40, 900),
      ...gapWall(1580, 900, 560, 820),   // right wall: unclimbable gap
      S(800, 880, 1600, 40),               // safe floor
      S(280, 700, 520, 50),                // start deck (top 675)
      S(1240, 520, 400, 44),               // landing (top 498)
    ],
    spinners: [{ x: 700, y: 560, len: 280, speed: 1.1 }],
    route: [
      { move: 'spinCatch', x: 700, y: 560, len: 280, from: { x: 530, y: 654 } },
      { move: 'spinFling', x: 1100, y: 498, hub: { x: 700, y: 560 } },
    ],
  },
  {
    name: 'BOUNCE HOUSE', diff: 'easy',
    intro: 'Trampolines! Land on a pad and it flings you along its arrows.',
    w: 1600, h: 900, ...PAL.candy,
    spawn: { x: 150, y: 800 },
    goal: { x: 1430, y: 235, r: 46 },
    solids: [
      S(20, 450, 40, 900),
      ...gapWall(1580, 900, 340, 820),   // right wall: unclimbable gap
      S(800, 880, 1600, 40),               // safe floor (top 860)
      S(330, 845, 150, 30, { bounce: 16 }),            // pad 1: straight up
      S(430, 520, 170, 30),                // ledge you catch at the top
      S(640, 680, 140, 26, { bounce: 20, angle: 0.35 }), // pad 2: tilted right
      S(980, 450, 260, 30),                // landing (top 435)
      S(1190, 478, 120, 24, { bounce: 17, angle: 0.45 }), // pad 3
      S(1440, 300, 240, 32),               // goal shelf (top 284)
    ],
    texts: [{ x: 760, y: 170, text: 'BOUNCE UP • GRAB THE LEDGE • CLIMB ON' }],
    route: [
      { move: 'bounce', x: 330, y: 534 },
      { move: 'climb', x: 430, y: 484 },
      { move: 'bounce', x: 900, y: 414 },
      { move: 'bounce', x: 1380, y: 263 },
    ],
  },
  {
    name: "SLIP 'N' SLIDE", diff: 'easy',
    intro: "Ice can't be grabbed. Grab the rough stuff to stop!",
    w: 1600, h: 900, ...PAL.frost,
    spawn: { x: 150, y: 200 },
    goal: { x: 1510, y: 650, r: 40 },
    solids: [
      ...walls(1600, 900),
      S(800, 885, 1520, 50, { deadly: true }),     // freezing water
      S(190, 260, 300, 36),                // start deck (top 242)
      S(580, 362, 520, 28, { ice: true, angle: 0.395 }),  // the big slide
      S(900, 490, 180, 30),                // rough brake pad (top 475)
      S(1040, 380, 80, 24),                // rough bars over the water
      S(1180, 380, 80, 24),
      S(1320, 380, 80, 24),
      S(1345, 600, 250, 28, { ice: true, angle: 0.4 }),   // run-out slide
      S(1490, 720, 140, 40),               // goal deck (top 700)
    ],
    texts: [{ x: 800, y: 150, text: "GRAB TO BRAKE — ICE IS TOO SLICK TO HOLD" }],
    route: [
      { move: 'slide', x: 900, y: 454 },
      { move: 'standLatch', x: 1040, y: 392, from: { x: 960, y: 454 } },
      { move: 'hangReach', x: 1180, y: 392 },
      { move: 'hangReach', x: 1320, y: 392 },
      { move: 'drop', x: 1360, y: 560 },
      { move: 'slide', x: 1500, y: 679 },
    ],
  },

  // ═════════════════════════════ MEDIUM ═════════════════════════════
  {
    name: 'MONKEY BARS', diff: 'medium',
    intro: 'Hand over hand across the spikes. Alternate those triggers!',
    w: 1600, h: 900, ...PAL.sunset,
    spawn: { x: 130, y: 700 },
    goal: { x: 1480, y: 610, r: 46 },
    solids: [
      ...walls(1600, 900),
      S(230, 760, 420, 44),
      S(420, 620, 150, 34),
      S(390, 480, 180, 32),
      S(545, 350, 80, 26),
      S(685, 350, 80, 26),
      S(825, 350, 80, 26),
      S(965, 350, 80, 26),
      S(1105, 350, 80, 26),
      S(830, 880, 780, 40, { deadly: true }),
      S(1400, 700, 360, 40),
    ],
    powerups: [{ x: 840, y: 260 }],
    route: [
      { move: 'standLatch', x: 420, y: 637, from: { x: 380, y: 717 } },
      { move: 'standLatch', x: 400, y: 496, from: { x: 440, y: 582 } },
      { move: 'standLatch', x: 545, y: 363, from: { x: 470, y: 443 } },
      { move: 'hangReach', x: 685, y: 363 },
      { move: 'hangReach', x: 825, y: 363 },
      { move: 'hangReach', x: 965, y: 363 },
      { move: 'hangReach', x: 1105, y: 363 },
      { move: 'swingCatch', x: 1300, y: 679, from: { x: 1135, y: 520 } },
    ],
  },
  {
    name: 'SPIN CYCLE', diff: 'medium',
    intro: 'Grab the spinning bars, ride the momentum, release to launch.',
    w: 1600, h: 900, ...PAL.factory,
    spawn: { x: 130, y: 700 },
    goal: { x: 1480, y: 150, r: 46 },
    solids: [
      ...walls(1600, 900),
      S(340, 780, 640, 50),
      S(940, 420, 180, 30),
      S(1450, 220, 260, 36),
      S(1120, 880, 920, 40, { deadly: true }),
    ],
    spinners: [
      { x: 620, y: 540, len: 300, speed: 2.0 },
      { x: 1150, y: 280, len: 280, speed: -2.2 },
    ],
    powerups: [{ x: 940, y: 330 }],
    route: [
      { move: 'spinCatch', x: 620, y: 540, len: 300, from: { x: 620, y: 734 } },
      { move: 'spinFling', x: 940, y: 405, hub: { x: 620, y: 540 } },
      { move: 'spinCatch', x: 1150, y: 280, len: 280, from: { x: 1020, y: 384 } },
      { move: 'spinFling', x: 1380, y: 202, hub: { x: 1150, y: 280 } },
    ],
  },
  {
    name: 'LAVA LIFTS', diff: 'medium',
    intro: 'Lifts rise and sink out of the lava. Step on and off at the right time.',
    w: 1400, h: 900, ...PAL.volcano,
    spawn: { x: 120, y: 540 },
    goal: { x: 1250, y: 330, r: 44 },
    solids: [
      ...walls(1400, 900),
      S(160, 620, 280, 40),                // start (top 600)
      S(570, 450, 140, 30),                // high ledge (top 435)
      S(870, 760, 140, 30),                // low ledge, just over the lava (top 745)
      S(1235, 400, 250, 36),               // goal deck (top 382)
      S(700, 885, 1360, 50, { deadly: true }),
    ],
    movers: [
      { w: 140, h: 26, from: [400, 780], to: [400, 520], speed: 100 },           // up...
      { w: 140, h: 26, from: [715, 520], to: [715, 780], speed: 100 },           // ...down...
      { w: 140, h: 26, from: [1015, 780], to: [1015, 420], speed: 110, phase: 0.5 }, // ...UP
    ],
    powerups: [{ x: 570, y: 380 }],
    route: [
      { move: 'mover', x: 400, y: 600, from: { x: 260, y: 579 }, halfw: 70 },
      { move: 'ride', x: 400, y: 520 },
      { move: 'standLatch', x: 500, y: 465, from: { x: 455, y: 486 } },
      { move: 'drop', x: 715, y: 486 },
      { move: 'ride', x: 715, y: 780 },
      { move: 'walk', x: 870, y: 724 },
      { move: 'mover', x: 1015, y: 780, from: { x: 920, y: 724 }, halfw: 70 },
      { move: 'ride', x: 1015, y: 420 },
      { move: 'standLatch', x: 1110, y: 400, from: { x: 1070, y: 386 } },
    ],
  },
  {
    name: 'OVER UNDER', diff: 'medium',
    intro: 'Over the wall, then under the slab — spikes below the whole way.',
    w: 1600, h: 900, ...PAL.cave,
    spawn: { x: 150, y: 700 },
    goal: { x: 1490, y: 610, r: 44 },
    solids: [
      ...walls(1600, 900),
      S(220, 760, 400, 50),                // start (top 735)
      S(560, 600, 80, 420),                // tall wall (top 390)
      S(760, 810, 240, 40),                // drop zone (top 790)
      S(830, 690, 100, 30),                // step to reach the slab (top 675)
      S(1120, 560, 480, 40),               // long slab (bottom 580)
      S(1480, 700, 200, 44),               // end (top 678)
      S(1120, 880, 480, 40, { deadly: true }),
    ],
    route: [
      { move: 'climb', x: 560, y: 369 },
      { move: 'drop', x: 760, y: 769 },
      { move: 'standLatch', x: 830, y: 675, from: { x: 830, y: 769 } },
      { move: 'standLatch', x: 900, y: 580, from: { x: 860, y: 654 } },
      { move: 'hangReach', x: 1030, y: 580 },
      { move: 'hangReach', x: 1160, y: 580 },
      { move: 'hangReach', x: 1290, y: 580 },
      { move: 'swingCatch', x: 1450, y: 678, from: { x: 1360, y: 668 } },
    ],
  },
  {
    name: 'PENDULUM ALLEY', diff: 'medium',
    intro: 'Three long ropes, one island. Big swings win.',
    w: 1600, h: 900, ...PAL.night,
    spawn: { x: 120, y: 540 },
    goal: { x: 1480, y: 520, r: 46 },
    solids: [
      ...walls(1600, 900),
      S(200, 600, 360, 44),                // start (top 578)
      S(760, 700, 160, 36),                // rest island (top 682)
      S(1420, 600, 360, 44),               // goal deck (top 578)
      S(800, 890, 1000, 60, { deadly: true }),
    ],
    ropes: [
      { x: 450, y: 110, len: 470 },
      { x: 760, y: 110, len: 440 },
      { x: 1070, y: 110, len: 440 },
    ],
    route: [
      { move: 'ropeCatch', x: 450, y: 580, from: { x: 370, y: 557 } },
      { move: 'ropeSwing', x: 760, y: 110 },
      { move: 'ropeSwing', x: 1070, y: 110 },
      { move: 'swingCatch', x: 1290, y: 557, from: { x: 1130, y: 560 } },
    ],
  },
  {
    name: 'SPIKE STAIRS', diff: 'medium',
    intro: 'The landings are half spikes. Aim your flips carefully.',
    w: 1600, h: 900, ...PAL.volcano,
    spawn: { x: 150, y: 780 },
    goal: { x: 1480, y: 270, r: 44 },
    solids: [
      ...walls(1600, 900),
      S(300, 860, 600, 80),                // start floor (top 820)
      S(700, 700, 220, 36),                // ledges, rises of 120
      S(760, 668, 100, 14, { deadly: true }),   // spike strip on the back half
      S(980, 580, 220, 36),
      S(1040, 548, 100, 14, { deadly: true }),
      S(1260, 460, 220, 36),
      S(1320, 428, 100, 14, { deadly: true }),
      S(1480, 360, 200, 40),               // goal platform (top 340)
      S(1150, 880, 900, 40, { deadly: true }),  // spike pit below
    ],
    route: [
      { move: 'standLatch', x: 595, y: 718, from: { x: 560, y: 799 } },
      { move: 'flingCatch', x: 875, y: 598, from: { x: 650, y: 661 } },
      { move: 'flingCatch', x: 1155, y: 478, from: { x: 930, y: 541 } },
      { move: 'flingCatch', x: 1390, y: 380, from: { x: 1210, y: 421 } },
    ],
  },
  {
    name: 'BALLOON CHIMNEY', diff: 'medium',
    intro: 'Steer your balloon through the zigzag. Mind the spiky undersides.',
    w: 1000, h: 1400, ...PAL.candy,
    spawn: { x: 500, y: 1300 },
    goal: { x: 500, y: 90, r: 46 },
    solids: [
      ...walls(1000, 1400),
      S(500, 1370, 1000, 60),              // floor (top 1340)
      S(250, 1050, 500, 60),               // jut from left wall (safe top)
      S(250, 1096, 500, 16, { deadly: true, spikeDir: 'down' }),
      S(750, 800, 500, 60),                // jut from right wall
      S(750, 846, 500, 16, { deadly: true, spikeDir: 'down' }),
      S(250, 550, 500, 60),                // jut from left wall
      S(250, 596, 500, 16, { deadly: true, spikeDir: 'down' }),
      S(500, 160, 300, 40),                // goal shelf (top 140)
    ],
    balloons: [{ x: 350, y: 1240 }, { x: 650, y: 1240 }],
    route: [
      { move: 'balloonCatch', x: 350, y: 1240, from: { x: 350, y: 1319 } },
      { move: 'ride', x: 750, y: 950 },
      { move: 'ride', x: 250, y: 700 },
      { move: 'ride', x: 500, y: 250 },
    ],
  },
  {
    name: 'WINDMILL PASS', diff: 'medium',
    intro: 'Wheel, bars, wheel. Keep your momentum through the middle.',
    w: 1600, h: 900, ...PAL.factory,
    spawn: { x: 150, y: 640 },
    goal: { x: 1460, y: 410, r: 44 },
    solids: [
      ...walls(1600, 900),
      S(240, 700, 440, 50),                // start (top 675)
      S(600, 600, 140, 32),                // step (top 584)
      S(1020, 360, 70, 24),                // bars
      S(1160, 360, 70, 24),
      S(1400, 500, 280, 44),               // goal tower (top 478)
      S(1000, 880, 1200, 40, { deadly: true }),
    ],
    spinners: [{ x: 740, y: 480, len: 280, speed: 1.7 }],
    route: [
      { move: 'standLatch', x: 600, y: 616, from: { x: 560, y: 654 } },
      { move: 'spinCatch', x: 740, y: 480, len: 280, from: { x: 620, y: 563 } },
      { move: 'spinFling', x: 1020, y: 372, hub: { x: 740, y: 480 } },
      { move: 'hangReach', x: 1160, y: 372 },
      { move: 'swingCatch', x: 1330, y: 478, from: { x: 1190, y: 460 } },
    ],
  },
  {
    name: 'CRUMBLE BRIDGE', diff: 'medium',
    intro: "Old stones crack under you. Don't stop moving!",
    w: 1600, h: 900, ...PAL.desert,
    spawn: { x: 140, y: 640 },
    goal: { x: 1460, y: 580, r: 46 },
    solids: [
      ...walls(1600, 900),
      S(170, 700, 300, 44),                // start (top 678)
      S(385, 690, 110, 30, { crumble: 0.9 }),   // the crumbling bridge
      S(495, 690, 110, 30, { crumble: 0.9 }),
      S(605, 690, 110, 30, { crumble: 0.9 }),
      S(715, 690, 110, 30, { crumble: 0.9 }),
      S(860, 690, 140, 44),                // solid rest island (top 668)
      S(1000, 560, 80, 26, { crumble: 1.3 }),  // crumbling monkey bars
      S(1140, 560, 80, 26, { crumble: 1.3 }),
      S(1280, 560, 80, 26, { crumble: 1.3 }),
      S(1460, 660, 200, 44),               // goal deck (top 638)
      S(840, 880, 1440, 40, { deadly: true }),
    ],
    texts: [{ x: 800, y: 300, text: 'KEEP MOVING — IT GROWS BACK' }],
    route: [
      { move: 'walk', x: 860, y: 647 },
      { move: 'standLatch', x: 1000, y: 573, from: { x: 915, y: 647 } },
      { move: 'hangReach', x: 1140, y: 573 },
      { move: 'hangReach', x: 1280, y: 573 },
      { move: 'swingCatch', x: 1390, y: 638, from: { x: 1300, y: 650 } },
    ],
  },
  {
    name: 'DOWN THE WELL', diff: 'medium',
    intro: 'Climb DOWN. Hang, reach below you, then let go up top.',
    w: 1000, h: 1400, ...PAL.cave,
    spawn: { x: 120, y: 160 },
    goal: { x: 690, y: 1245, r: 40 },
    solids: [
      S(20, 700, 40, 1400, { ice: true }),   // slick walls: no shimmying down
      S(980, 700, 40, 1400, { ice: true }),
      S(190, 220, 300, 36),                // start ledge (top 202)
      S(410, 340, 80, 24),                 // bars stepping down-right
      S(500, 470, 80, 24),
      S(590, 600, 80, 24),
      S(840, 700, 240, 30),                // rest ledge (top 685) + flag
      S(650, 850, 80, 24),                 // bars stepping down-left
      S(560, 980, 80, 24),
      S(450, 1150, 80, 24),
      S(560, 1205, 80, 24),                // low bar into the nook
      S(650, 1110, 220, 30, { deadly: true }),   // spiked lid: no dropping in
      S(650, 1310, 220, 40),               // goal nook under the lid (top 1290)
      S(500, 1380, 920, 40, { deadly: true }),   // spiky well floor
    ],
    checkpoints: [{ x: 860, y: 664 }],
    texts: [{ x: 640, y: 150, text: 'REACH DOWN • GRAB • LET GO ABOVE' }],
    route: [
      { move: 'hangDown', x: 340, y: 202 },
      { move: 'hangDown', x: 410, y: 340 },
      { move: 'hangDown', x: 500, y: 470 },
      { move: 'hangDown', x: 590, y: 600 },
      { move: 'swingCatch', x: 720, y: 685, from: { x: 600, y: 690 } },
      { move: 'hangDown', x: 720, y: 700 },
      { move: 'hangDown', x: 650, y: 850 },
      { move: 'hangDown', x: 560, y: 980 },
      { move: 'hangDown', x: 450, y: 1150 },
      { move: 'hangReach', x: 560, y: 1217 },
      { move: 'walk', x: 690, y: 1269 },
    ],
  },

  // ══════════════════════════════ HARD ══════════════════════════════
  {
    name: 'THE GAUNTLET', diff: 'hard',
    intro: 'Ropes, bars, spinners, spikes. Everything you know. GO!',
    w: 2000, h: 1000, ...PAL.night,
    spawn: { x: 120, y: 800 },
    goal: { x: 1880, y: 190, r: 46 },
    solids: [
      ...walls(2000, 1000),
      S(170, 900, 300, 60),
      S(360, 760, 120, 240),
      S(1050, 640, 180, 32),
      S(1200, 510, 70, 24),
      S(1330, 510, 70, 24),
      S(1460, 510, 70, 24),
      S(1870, 260, 220, 32),
      S(1000, 985, 1960, 50, { deadly: true }),
    ],
    ropes: [
      { x: 500, y: 140, len: 460 },
      { x: 800, y: 140, len: 440 },
    ],
    spinners: [{ x: 1620, y: 440, len: 280, speed: 2.1 }],
    powerups: [{ x: 800, y: 560 }, { x: 1330, y: 400 }],
    checkpoints: [{ x: 1060, y: 603 }],
    route: [
      { move: 'climb', x: 360, y: 619 },
      { move: 'ropeCatch', x: 500, y: 600, from: { x: 420, y: 619 } },
      { move: 'ropeSwing', x: 800, y: 140 },
      { move: 'swingCatch', x: 1050, y: 624, from: { x: 880, y: 570 } },
      { move: 'standLatch', x: 1200, y: 522, from: { x: 1130, y: 603 } },
      { move: 'hangReach', x: 1330, y: 522 },
      { move: 'hangReach', x: 1460, y: 522 },
      { move: 'spinCatch', x: 1620, y: 440, len: 280, from: { x: 1460, y: 598 } },
      { move: 'spinFling', x: 1790, y: 244, hub: { x: 1620, y: 440 } },
    ],
  },
  {
    name: 'SPIKE CEILING', diff: 'hard',
    intro: 'Spikes above, spikes below. Controlled swings only — no flips.',
    w: 1600, h: 900, ...PAL.volcano,
    spawn: { x: 120, y: 640 },
    goal: { x: 1500, y: 620, r: 44 },
    solids: [
      ...walls(1600, 900),
      S(150, 700, 260, 44),                // start (top 678)
      S(390, 560, 140, 28),                // launch block (top 546)
      S(500, 420, 70, 24),                 // bars at 145 spacing
      S(645, 420, 70, 24),
      S(790, 420, 70, 24),
      S(935, 420, 70, 24),
      S(1080, 420, 70, 24),
      S(1225, 420, 70, 24),
      S(1480, 700, 240, 44),               // end (top 678)
      S(830, 880, 1100, 40, { deadly: true }),           // spike floor
      S(875, 300, 1250, 40, { deadly: true, spikeDir: 'down' }), // spike ceiling
    ],
    route: [
      { move: 'standLatch', x: 390, y: 574, from: { x: 340, y: 657 } },
      { move: 'standLatch', x: 500, y: 432, from: { x: 440, y: 525 } },
      { move: 'hangReach', x: 645, y: 432 },
      { move: 'hangReach', x: 790, y: 432 },
      { move: 'hangReach', x: 935, y: 432 },
      { move: 'hangReach', x: 1080, y: 432 },
      { move: 'hangReach', x: 1225, y: 432 },
      { move: 'swingCatch', x: 1420, y: 678, from: { x: 1255, y: 520 } },
    ],
  },
  {
    name: 'LONG HAUL', diff: 'hard',
    intro: 'One island. One breath. A very long way across the spikes.',
    w: 2000, h: 1000, ...PAL.jungle,
    spawn: { x: 120, y: 720 },
    goal: { x: 1900, y: 660, r: 44 },
    solids: [
      ...walls(2000, 1000),
      S(170, 800, 300, 50),                // start (top 775)
      S(760, 700, 160, 40),                // island (top 680)
      S(1150, 560, 120, 36),               // handholds (bottom 578)
      S(1290, 560, 120, 36),
      S(1840, 760, 280, 50),               // end (top 735)
      S(1150, 980, 1660, 40, { deadly: true }),
    ],
    ropes: [
      { x: 400, y: 120, len: 620 },
      { x: 1560, y: 120, len: 520 },
    ],
    powerups: [{ x: 760, y: 600 }],
    checkpoints: [{ x: 760, y: 659 }],
    route: [
      { move: 'ropeCatch', x: 400, y: 740, from: { x: 310, y: 754 } },
      { move: 'swingCatch', x: 700, y: 680, from: { x: 480, y: 700 } },
      { move: 'fling', x: 1150, y: 578, from: { x: 820, y: 659 } },
      { move: 'hangReach', x: 1290, y: 578 },
      { move: 'swingCatch', x: 1560, y: 640, from: { x: 1310, y: 666 } },
      { move: 'swingCatch', x: 1760, y: 735, from: { x: 1620, y: 660 } },
    ],
  },
  {
    name: 'SPINNER GAUNTLET', diff: 'hard',
    intro: 'Three wheels, alternating spins. Time every hand-off.',
    w: 1600, h: 900, ...PAL.factory,
    spawn: { x: 120, y: 700 },
    goal: { x: 1520, y: 310, r: 44 },
    solids: [
      ...walls(1600, 900),
      S(140, 760, 240, 50),                // start (top 735)
      S(360, 640, 120, 30),                // step (top 625)
      S(1480, 400, 180, 40),               // goal tower (top 380)
      S(920, 880, 1320, 40, { deadly: true }),
    ],
    spinners: [
      { x: 500, y: 560, len: 280, speed: 2.0 },
      { x: 900, y: 460, len: 280, speed: -2.2 },
      { x: 1300, y: 560, len: 280, speed: 2.0 },
    ],
    route: [
      { move: 'standLatch', x: 305, y: 655, from: { x: 230, y: 714 } },
      { move: 'spinCatch', x: 500, y: 560, len: 280, from: { x: 380, y: 604 } },
      { move: 'spinTransfer', hubA: { x: 500, y: 560 }, hubB: { x: 900, y: 460 }, lenA: 280, lenB: 280 },
      { move: 'spinTransfer', hubA: { x: 900, y: 460 }, hubB: { x: 1300, y: 560 }, lenA: 280, lenB: 280 },
      { move: 'spinFling', x: 1420, y: 380, hub: { x: 1300, y: 560 } },
    ],
  },
  {
    name: 'BALLOON STORM', diff: 'hard',
    intro: 'Storm gusts shove you at the spikes. Wait out the gusts on the ledges!',
    w: 1000, h: 1500, ...PAL.sky,
    spawn: { x: 500, y: 1400 },
    goal: { x: 500, y: 140, r: 46 },
    solids: [
      ...walls(1000, 1500),
      S(500, 1470, 1000, 60),              // floor (top 1440)
      S(200, 1150, 400, 50, { deadly: true }),
      S(850, 1120, 200, 32),               // safe rest opposite each outcrop
      S(800, 900, 400, 50, { deadly: true }),
      S(150, 870, 200, 32),
      S(200, 650, 400, 50, { deadly: true }),
      S(850, 620, 200, 32),
      S(800, 400, 400, 50, { deadly: true }),
      S(500, 220, 280, 40),                // goal shelf (top 200)
    ],
    balloons: [{ x: 300, y: 1330 }, { x: 600, y: 1330 }, { x: 850, y: 1330 }],
    // storm gusts come in pulses (they flicker just before they blow) and
    // push toward the outcrop above — shelter on the rest ledges and go in
    // the lulls
    winds: [
      { x: 500, y: 1040, w: 920, h: 170, fx: 0.26, fy: 0, period: 4.5, on: 1.6 },
      { x: 500, y: 785, w: 920, h: 170, fx: -0.26, fy: 0, period: 4.5, on: 1.6, phase: 1.5 },
      { x: 500, y: 535, w: 920, h: 170, fx: 0.26, fy: 0, period: 4.5, on: 1.6, phase: 3 },
    ],
    route: [
      { move: 'balloonCatch', x: 600, y: 1330, from: { x: 600, y: 1419 } },
      { move: 'ride', x: 750, y: 1150 },
      { move: 'ride', x: 250, y: 900 },
      { move: 'ride', x: 750, y: 650 },
      { move: 'ride', x: 250, y: 400 },
      { move: 'ride', x: 500, y: 280 },
    ],
  },
  {
    name: 'COUNTERWEIGHT', diff: 'hard',
    intro: 'Two quick ferries, opposite ways. Jump ship mid-crossing!',
    w: 1600, h: 900, ...PAL.frost,
    spawn: { x: 120, y: 620 },
    goal: { x: 1500, y: 440, r: 44 },
    solids: [
      ...walls(1600, 900),
      S(160, 700, 280, 40),                // start (top 680)
      S(1460, 520, 240, 40),               // goal deck (top 500)
      S(800, 885, 1560, 50, { deadly: true }),
    ],
    movers: [
      { w: 135, h: 26, from: [400, 640], to: [900, 640], speed: 150 },
      { w: 135, h: 26, from: [1200, 560], to: [700, 560], speed: 150, phase: 1 },
    ],
    route: [
      { move: 'mover', x: 400, y: 640, from: { x: 280, y: 659 }, halfw: 67 },
      { move: 'ride', x: 800, y: 640 },
      { move: 'mover', x: 800, y: 560, from: { x: 800, y: 606 }, halfw: 67 },
      { move: 'ride', x: 1200, y: 560 },
      { move: 'drop', x: 1360, y: 479 },
    ],
  },
  {
    name: 'CLOCK TOWER', diff: 'hard',
    intro: 'The walls are razors. The wheels are the only way up.',
    w: 900, h: 1400, ...PAL.night,
    spawn: { x: 450, y: 1300 },
    goal: { x: 450, y: 150, r: 46 },
    solids: [
      ...walls(900, 1400),
      S(450, 1370, 900, 60),               // floor (top 1340)
      S(70, 700, 60, 1150, { deadly: true, spikeDir: 'right' }),   // razor walls
      S(830, 700, 60, 1150, { deadly: true, spikeDir: 'left' }),
      S(450, 240, 240, 40),                // goal shelf (top 220)
    ],
    spinners: [
      { x: 450, y: 1100, len: 300, speed: 1.6 },
      { x: 450, y: 800, len: 300, speed: -1.8 },
      { x: 450, y: 500, len: 300, speed: 2.0 },
    ],
    route: [
      { move: 'spinCatch', x: 450, y: 1100, len: 300, from: { x: 450, y: 1319 } },
      { move: 'spinTransfer', hubA: { x: 450, y: 1100 }, hubB: { x: 450, y: 800 }, lenA: 300, lenB: 300 },
      { move: 'spinTransfer', hubA: { x: 450, y: 800 }, hubB: { x: 450, y: 500 }, lenA: 300, lenB: 300 },
      { move: 'spinFling', x: 450, y: 260, hub: { x: 450, y: 500 } },
    ],
  },
  {
    name: 'RAZOR RUN', diff: 'hard',
    intro: 'A corridor of teeth. Fling grip to grip and do not sag.',
    w: 1600, h: 900, ...PAL.volcano,
    spawn: { x: 100, y: 620 },
    goal: { x: 1530, y: 620, r: 44 },
    solids: [
      ...gapWall(20, 900, 460, 820),      // left wall: unclimbable gap
      ...gapWall(1580, 900, 460, 820),   // right wall: unclimbable gap
      S(110, 700, 180, 44),                // start (top 678)
      S(800, 340, 1600, 40),               // ceiling slab
      S(500, 376, 300, 16, { deadly: true, spikeDir: 'down' }),
      S(1100, 376, 300, 16, { deadly: true, spikeDir: 'down' }),
      S(400, 560, 110, 30),                // mid-air grips (bottom 575)
      S(700, 600, 110, 30),
      S(1000, 560, 110, 30),
      S(1300, 600, 110, 30),
      S(1500, 700, 200, 44),               // end (top 678)
      S(800, 880, 1200, 40, { deadly: true }),
    ],
    route: [
      { move: 'flingCatch', x: 400, y: 575, from: { x: 180, y: 657 } },
      { move: 'swingCatch', x: 700, y: 615, from: { x: 440, y: 660 } },
      { move: 'swingCatch', x: 1000, y: 575, from: { x: 740, y: 690 } },
      { move: 'swingCatch', x: 1300, y: 615, from: { x: 1040, y: 660 } },
      { move: 'swingCatch', x: 1470, y: 678, from: { x: 1340, y: 690 } },
    ],
  },
  {
    name: 'UPDRAFT', diff: 'hard',
    intro: 'Ride the vents up, let the tailwind carry you over. Spiky caps up top!',
    w: 1600, h: 1000, ...PAL.storm,
    spawn: { x: 140, y: 760 },
    goal: { x: 1490, y: 290, r: 44 },
    solids: [
      ...walls(1600, 1000),
      S(160, 840, 280, 40),                // start (top 820)
      S(390, 120, 220, 40, { deadly: true, spikeDir: 'down' }),  // vent 1 cap
      S(500, 330, 80, 24),                 // exit bars beside vent 1
      S(640, 330, 80, 24),
      S(780, 330, 80, 24),
      S(1320, 110, 240, 40, { deadly: true, spikeDir: 'down' }), // vent 2 cap
      S(1440, 680, 40, 600, { ice: true }),   // slick backstop beside vent 2
      S(1490, 362, 180, 30),               // goal shelf on top (top 347)
      S(800, 980, 1520, 40, { deadly: true }),
    ],
    winds: [
      { x: 390, y: 595, w: 160, h: 750, fx: 0, fy: -1.3 },      // vent 1
      { x: 1040, y: 380, w: 360, h: 300, fx: 0.35, fy: -0.35 }, // tailwind
      { x: 1320, y: 600, w: 200, h: 740, fx: 0, fy: -1.3 },     // vent 2
      // gentle sideways nudges at the top of each vent: nobody hovers
      // forever — they drift out toward the next handhold
      { x: 420, y: 280, w: 220, h: 120, fx: 0.3, fy: 0 },
      { x: 1360, y: 280, w: 160, h: 120, fx: 0.35, fy: 0 },
    ],
    texts: [{ x: 1000, y: 200, text: 'THE WIND CARRIES YOU ACROSS' }],
    route: [
      { move: 'vent', x: 390, y: 330 },
      { move: 'hangReach', x: 500, y: 342 },
      { move: 'hangReach', x: 640, y: 342 },
      { move: 'hangReach', x: 780, y: 342 },
      { move: 'windFling', x: 1320, y: 420, from: { x: 810, y: 420 } },
      { move: 'vent', x: 1398, y: 400 },
      { move: 'standLatch', x: 1400, y: 377, from: { x: 1398, y: 400 } },
    ],
  },
  {
    name: 'SUMMIT', diff: 'hard',
    intro: 'Climb, swing, spin, sail. The whole mountain in one board.',
    w: 2000, h: 1200, ...PAL.frost,
    spawn: { x: 150, y: 940 },
    goal: { x: 1920, y: 570, r: 46 },
    solids: [
      ...walls(2000, 1200),
      S(150, 1000, 260, 50),               // start (top 975)
      S(430, 880, 140, 40),                // climbing blocks
      S(620, 780, 140, 40),
      S(430, 680, 140, 40),
      S(620, 580, 140, 40),
      S(1900, 650, 160, 36),               // goal tower (top 632)
      S(1000, 1180, 1960, 40, { deadly: true }),
    ],
    ropes: [{ x: 900, y: 100, len: 540 }],
    spinners: [{ x: 1300, y: 500, len: 280, speed: 2.0 }],
    movers: [{ w: 140, h: 26, from: [1550, 800], to: [1850, 800], speed: 150 }],
    powerups: [{ x: 900, y: 720 }, { x: 1550, y: 650 }],
    checkpoints: [{ x: 620, y: 539 }],
    route: [
      { move: 'standLatch', x: 365, y: 900, from: { x: 280, y: 954 } },
      { move: 'standLatch', x: 555, y: 800, from: { x: 470, y: 839 } },
      { move: 'standLatch', x: 495, y: 700, from: { x: 580, y: 739 } },
      { move: 'standLatch', x: 555, y: 600, from: { x: 470, y: 639 } },
      { move: 'fling', x: 900, y: 640, from: { x: 660, y: 539 } },
      { move: 'ropeToSpinner', hub: { x: 1300, y: 500 }, anchor: { x: 900, y: 100 }, len: 540 },
      { move: 'spinFling', x: 1600, y: 780, hub: { x: 1300, y: 500 } },
      { move: 'mover', x: 1600, y: 800, from: { x: 1600, y: 760 }, halfw: 70 },
      { move: 'ride', x: 1850, y: 800 },
      { move: 'standLatch', x: 1850, y: 668, from: { x: 1850, y: 766 } },
    ],
  },
];
