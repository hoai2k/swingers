// Maps with terrain features (see src/features.js for the Layout methods). Every
// feature listed is mirrored through the field centre (x, z) -> (-x, -z) unless its
// last argument is true (a centre piece that is its own mirror), so both armies get
// the same ground. Blue sets up on x < -3, Red on x > 3; the field is 84 x 64 m.
//
// Extra map keys used here: layout(L), stone / wood (obstacle colours), water / bed
// (water and river-bed colours), shape(x, z, y, out) (reshape the land outside the
// field), sea (a sea plane), tufts (grass density in the field), fogNear/fogFar.

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

export const NEW_MAPS = [
  {
    id: 'castle', name: 'Castle Courtyard',
    ground: ['#6fb53e', '#8ccc4c', '#55982f'], patch: '#b8d35a', dirt: '#a48a5c', high: '#9ccf52', far: '#5d9a40', rock: '#9b978c',
    sky: ['#4c97e6', '#d4ecfb'], fog: '#c8e2f2', sun: '#fff1d6', sunI: 2.7, hemiGround: '#5e8a3a', hemiI: 1.25,
    hills: 1.15, bumps: 0.3, trees: ['oak', 'pine', 'oak'], grass: '#7cc43e', grassTip: '#b8e86a',
    flowers: ['#ffffff', '#ffe14a', '#ff7fb3'], bushes: '#3f8f2e', props: 'castle', mountains: '#86a8c6',
    stone: '#b3ad9f', wood: '#8a6038', roof: '#5d6a8a', tufts: 0.5,
    layout(L) {
      L.paint(0, 0, 13, 31, '#bdb29a', { soft: 2.5, noise: 0.5 }, true); // cobbled courtyard
      // the courtyard walls: one per side, two gateways each, towers at the gates
      L.wall(-14, -31.5, -14, -21, 3.2, 1.1);
      L.wall(-14, 21, -14, 31.5, 3.2, 1.1);
      L.wall(-14, -12, -14, 12, 3.2, 1.1);
      for (const z of [-21, -12, 12, 21]) L.cyl('tower', -14, z, 1.45, 4.6);
      for (const z of [-31.8, 31.8]) L.cyl('tower', -14, z, 1.9, 5.4);
      L.cyl('well', 0, 0, 1.5, 1.05, {}, true);
      // archer platforms behind the walls
      L.plateau(-30, 0, 3.5, 7, 2.2, 3.6);
      L.paint(-30, 0, 4.4, 7.9, '#a8a090', { soft: 1.2, noise: 0.4 });
      L.crates(-8.5, 26, 4, 0.2);
      L.crates(-18.5, -7, 3, -0.4);
      L.crates(-7, -17, 3, 0.9);
      L.tree('oak', -38, 27, 1.05);
      L.tree('pine', -36, -26, 1.1);
    },
  },
  {
    id: 'river', name: 'River Crossing',
    ground: ['#64b23c', '#86cc48', '#4a9530'], patch: '#b8d85a', dirt: '#9c8456', high: '#98d050', far: '#5a9a3c', rock: '#9a9a90',
    sky: ['#4a9ce8', '#d2ebfb'], fog: '#c6e2f2', sun: '#fff3da', sunI: 2.7, hemiGround: '#5a8a3a', hemiI: 1.25,
    hills: 1, bumps: 0.4, trees: ['oak', 'willow', 'oak', 'pine'], grass: '#7cc43e', grassTip: '#bce86c',
    flowers: ['#ffffff', '#ffe14a', '#b07aff', '#6ab4ff'], bushes: '#3f8f2e', props: 'river', mountains: '#7fa6c4',
    stone: '#a8a69c', wood: '#8a6038', water: '#3c9ad6', bed: '#a6946c', tufts: 0.6,
    layout(L) {
      L.river(3, 0.07, 10, 0.95, 0.55); // shallower ford in the middle
      L.bridge(-6.3, 17, 11.8, 17, 4.6);
      L.paint(-19, 17, 13, 1.7, '#b59a6a', { soft: 1.5 });
      L.hill(-25, 12, 9, 3.2);
      L.fence(-12, -4, -12, -13);
      L.fence(-11, 22.5, -11, 29);
      L.tree('willow', -9.8, 7.5);
      L.tree('oak', -33, -22, 1.2);
      L.tree('oak', -38, -5);
      L.rock(-21, -26, 1.2);
      L.crates(-17, -16, 2, 0.4);
    },
  },
  {
    id: 'cove', name: 'Pirate Cove',
    ground: ['#ecd49a', '#f6e2b0', '#dcc083'], patch: '#e4c98a', dirt: '#c8a86a', high: '#b8d070', far: '#a6c074', rock: '#a89a86',
    sky: ['#3fa2ec', '#dff3fb'], fog: '#d6eef6', sun: '#fff4dc', sunI: 2.9, hemiGround: '#b8a070', hemiI: 1.25,
    hills: 0.9, bumps: 0.35, trees: ['palm', 'palm', 'jungle'], grass: '#b4b860', grassTip: '#e0dc8a',
    flowers: null, bushes: '#4e9a3c', props: 'beach', mountains: '#8fb6a0',
    stone: '#a89a86', wood: '#8a6440', water: '#2fc4c8', bed: '#e2c890', sea: -0.9, tufts: 0.25,
    // the land falls away into the sea beyond the far edge
    shape(x, z, y, out) {
      const k = smooth(clamp01((z - 38) / 22));
      return k > 0 ? Math.min(y, y * (1 - k) - 4 * k) : y;
    },
    layout(L) {
      L.pool(0, 0, 11, 0.85, true); // the lagoon
      L.hill(0, 0, 3.8, 1.35, true); // its sandbar island
      L.paint(0, 0, 13.5, 13.5, '#d6b47a', { round: true, soft: 3 }, true);
      L.tree('palm', 0, 0, 1, true);
      L.box('chest', 1.4, -1.1, 0.5, 0.35, 0.65, 0.4);
      L.bridge(-14.5, 7, 14.5, 7, 3.2); // boardwalks across the lagoon
      L.box('hull', -22, -17, 5, 1.7, 2.3, 0.5);
      L.crates(-16, 22, 5, 0.3);
      L.crates(-31, -4, 3, -0.6);
      L.tree('palm', -36, 24);
      L.tree('palm', -27, 28.5, 1.1);
      L.tree('palm', -38, -16, 0.95);
      L.rock(-10, -25, 1.4);
      L.rock(-33, 9, 1.0);
    },
  },
  {
    id: 'volcano', name: 'Volcano Jungle',
    ground: ['#4f9a36', '#69b444', '#3c7d2a'], patch: '#86b03e', dirt: '#7a5838', high: '#6f9a3a', far: '#4f7a3a', rock: '#7b6e62',
    sky: ['#7aa6c8', '#f0d8b0'], fog: '#d8cfb2', sun: '#ffe2b0', sunI: 2.6, hemiGround: '#5a6a30', hemiI: 1.2,
    hills: 1.35, bumps: 0.6, trees: ['jungle', 'palm', 'jungle'], grass: '#5aa83a', grassTip: '#a4d860',
    flowers: ['#ff5a4a', '#ffb02a', '#ff7fd0'], bushes: '#2f7a2e', props: 'jungle', mountains: '#6c7a6a',
    stone: '#8a7c6c', wood: '#6a4c30', water: '#2a1c14', waterLight: 0, waterOpacity: 0.93, bed: '#3a281c', tufts: 0.6,
    layout(L) {
      L.plateau(-22, 15, 5, 4, 3, 5, 0.35); // rocky mesas
      L.paint(-22, 15, 5.5, 4.5, '#94806a', { rot: 0.35, soft: 1.5 });
      L.pool(-13, -10, 4.2, 0.6); // tar pits
      L.paint(-13, -10, 6.2, 6.2, '#6a5034', { round: true, soft: 2 });
      L.hill(-34, -14, 7, 2.2);
      L.rock(-6, 22, 1.6);
      L.rock(-30, -3, 1.3);
      L.rock(-37, 21, 1.1);
      L.rock(-19, -25, 1.8, 2.2);
      L.box('log', -7, 7, 2.4, 0.42, 0.85, 0.8);
      L.tree('jungle', -38, -26, 1.1);
      L.tree('palm', -27, -30);
      L.tree('jungle', -10, 30, 1.2);
      L.tree('palm', -40, 6);
    },
  },
  {
    id: 'canyon', name: 'Canyon Ruins',
    ground: ['#dcae74', '#e8c18a', '#c99660'], patch: '#d6a468', dirt: '#b97a4a', high: '#d69060', far: '#c8865a', rock: '#b8643e',
    sky: ['#4f9fe0', '#f8dcb0'], fog: '#f0d2a8', sun: '#fff0cc', sunI: 2.9, hemiGround: '#b38058', hemiI: 1.2,
    hills: 2.0, bumps: 0.4, trees: ['cactus'], grass: '#b9a35a', grassTip: '#dcc77a',
    flowers: null, bushes: '#8a8a48', props: 'canyon', mountains: '#c27a52',
    stone: '#d8b88a', wood: '#7a5838', tufts: 0.3,
    layout(L) {
      L.plateau(0, 30, 46, 4.5, 5, 10); // the canyon rims along both long edges
      L.plateau(0, 0, 4.5, 6, 2.2, 5, 0, true); // the central mesa
      L.paint(0, 0, 5, 6.5, '#c98e5a', { soft: 1.5 }, true);
      L.paint(-24, 0, 16, 2, '#e6c896', { soft: 2 });
      L.ruin(-17, 5, -17, 13);
      L.ruin(-24, -11, -17, -15, 1, 2.2);
      // a small ruined temple: four columns (two broken) and one fallen
      L.cyl('pillar', -33.5, -3.5, 0.55, 3.8);
      L.cyl('pillar', -26.5, -3.5, 0.55, 1.9, { broken: true });
      L.cyl('pillar', -33.5, 3.5, 0.55, 2.4, { broken: true });
      L.cyl('pillar', -26.5, 3.5, 0.55, 3.8);
      L.box('fallen', -10, -9, 1.9, 0.5, 1.0, 0.9);
      L.cyl('pot', -20, -4, 0.42, 0.9);
      L.cyl('pot', -21, -2.9, 0.38, 0.8);
      L.cyl('pot', -37, 10, 0.42, 0.9);
      L.rock(-38, -12, 1.5);
    },
  },
  {
    id: 'graveyard', name: 'Spooky Graveyard',
    ground: ['#4f6a5a', '#5d7a68', '#3f584a'], patch: '#6a7a5a', dirt: '#5a5048', high: '#6a7e72', far: '#3e4e5a', rock: '#7a7e88',
    sky: ['#151a3a', '#4b4a78'], fog: '#3a3d5e', fogNear: 70, fogFar: 330, sun: '#cfd8ff', sunI: 1.8, hemiGround: '#2c2c40', hemiI: 1.2,
    hills: 1.1, bumps: 0.4, trees: ['dead', 'dead', 'pine'], grass: '#4d6656', grassTip: '#7a9a86',
    flowers: null, bushes: '#34483c', props: 'graveyard', mountains: '#2e3350',
    stone: '#8a8c96', wood: '#5a4a3e', tufts: 0.5,
    layout(L) {
      L.box('mausoleum', 0, 0, 3, 4, 4.6, 0, {}, true);
      L.paint(0, 0, 5, 6, '#6a6b72', { soft: 1.5, noise: 0.4 }, true);
      L.paint(0, 0, 40, 1.6, '#5a5048', { soft: 1.5 });
      // rows of tombstones with walkable aisles
      let k = 0;
      for (const x of [-9, -13, -17, -21]) for (const z of [-26, -20.5, -15, -9.5, 9.5, 15, 20.5, 26]) {
        k++;
        if ((k * 37) % 11 < 2) continue;
        const sub = (k * 7) % 3;
        L.box('tomb', x + ((k * 13) % 5) * 0.12, z, 0.16, sub === 1 ? 0.5 : 0.45, sub === 2 ? 1.25 : 1.0, ((k * 29) % 7 - 3) * 0.03, { sub });
      }
      L.fence(-26, -31, -26, -21, 'ironfence');
      L.fence(-26, 3, -26, 11, 'ironfence');
      L.hill(-33, -16, 8, 2.4);
      L.tree('dead', -36, 8);
      L.tree('dead', -29, 27, 1.2);
      L.tree('dead', -4, -28);
      L.cyl('pumpkin', -24, -6, 0.45, 0.6);
      L.cyl('pumpkin', -6, 14, 0.4, 0.55);
    },
  },
];
