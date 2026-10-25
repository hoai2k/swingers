// Where everything on the Stratford Fall Fair island sits (world metres).
//
// The island is an oval north-east of home (centre ~ (840, -845)) with an
// orchard hill on its north-east lobe. The fairground is one flat plot
// (FAIR, y = FAIR.y) with a dirt midway along z = MIDWAY.z from the entrance
// arch on the west side (x = FAIR.x0) to the east fence; seven rides line each
// side of the midway (north row NR, south row SR). The ferry dock is on the
// west coast, a short path from the arch.
export const FAIR = { x0: 700, x1: 985, z0: -945, z1: -745, y: 2.2 };
export const MIDWAY = { z: -845, w: 12 };
export const CENTRE = { x: 842, z: -845 };
export const ENTRANCE = { x: FAIR.x0, z: MIDWAY.z };
export const DOCK = { x: 652, z: -858 };
export const HILL = { x: 1010, z: -985, h: 15, r: 45 };
export const PATCH = { x: 1035, z: -900, r: 22 };   // pumpkin patch east of the fair
export const ORCHARD = { x: 1000, z: -985 };

// ride centres; each ride faces the midway (its sign stands on the midway side)
export const RIDES = {
  carousel: { x: 727, z: -886 },
  pirate: { x: 766, z: -898 },
  ferris: { x: 807, z: -905 },
  ringfire: { x: 846, z: -905 },
  zipper: { x: 884, z: -900 },
  droptower: { x: 921, z: -890 },
  starship: { x: 958, z: -888 },
  train: { x: 728, z: -793 },
  viking: { x: 770, z: -792 },
  tilt: { x: 812, z: -797 },
  gravitron: { x: 849, z: -799 },
  himalaya: { x: 887, z: -796 },
  topspin: { x: 925, z: -794 },
  sizzler: { x: 960, z: -798 },
};
