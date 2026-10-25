// Where everything at the Stratford Fall Fair sits (world metres, home island).
//
// The fair fills the flat strip south of the ring road, either side of the
// south avenue (x = 0, the road to the beach): x -120..120, z 166..288, ground
// y = 0. The entrance arch spans the avenue just south of the ring road; the
// midway runs east-west across the avenue at z = MIDWAY.z, with a row of
// rides north of it and a row south of it on each side. The avenue itself
// (|x| < AVENUE) stays clear for traffic; a pumpkin patch sits outside the
// east fence.
export const FAIR = { x0: -120, x1: 120, z0: 166, z1: 287, y: 0 };
export const MIDWAY = { z: 227, w: 12 };
export const AVENUE = 9;            // half-width kept clear round the avenue (road 10 m + verges)
export const CENTRE = { x: 0, z: 227 };
export const ARCH = { x: 0, z: 164 };
export const PATCH = { x: 132, z: 226, r: 12 };

// ride centres; each ride faces the midway (its sign stands on the midway side)
export const RIDES = {
  carousel: { x: -108, z: 192 },
  pirate: { x: -77, z: 190 },
  ferris: { x: -38, z: 186 },
  droptower: { x: -15, z: 195 },
  ringfire: { x: 29, z: 188 },
  zipper: { x: 68, z: 192 },
  starship: { x: 104, z: 194 },
  train: { x: -108, z: 262 },
  viking: { x: -74, z: 262 },
  tilt: { x: -42, z: 264 },
  gravitron: { x: -18, z: 262 },
  himalaya: { x: 27, z: 262 },
  topspin: { x: 64, z: 262 },
  sizzler: { x: 102, z: 262 },
};
export const onAvenue = (x, m = 0) => Math.abs(x) < AVENUE + m;
