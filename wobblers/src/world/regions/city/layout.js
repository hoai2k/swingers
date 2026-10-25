// Bigtown street plan: avenues (north-south, constant x) and streets
// (east-west, constant z), their intersections, and the city blocks between
// them. Everything else in city/ places itself from these numbers.
//
//   avenues x = 700 (Brick Row), 770, 840, 910, 980, 1050 (harbour side)
//   streets z = -150, -75, 0, 60, 118 (Bridge Street, the bridge lands at x = 740),
//               180 (Market Street), 236 (Seaside Road)
//
// Road surface = the terrain plate (y = 2, painted asphalt by city.js color());
// blocks are kerbed slabs 0.18 m high (block top SW = 2.18).
export const Y = 2;            // street level
export const KERB = 0.18;
export const SW = Y + KERB;    // pavement / block top
export const RW = 6;           // road half width (2 lanes + parking strips)

// [x, z0, z1]
export const AVES = [
  [700, -235, 66], [700, 130, 236],
  [770, -235, 242], [840, -144, 242], [910, -235, 242], [980, -235, 186], [1050, -81, 124],
];
// [z, x0, x1]
export const STREETS = [
  [-150, 694, 986], [-75, 694, 1104], [0, 694, 1104], [60, 694, 1104],
  [118, 736, 1056], [180, 694, 1056], [236, 694, 916],
];

export const onAve = (x, z, m = 0) => AVES.some(([ax, z0, z1]) => Math.abs(x - ax) < RW + m && z > z0 - m && z < z1 + m);
export const onStreet = (x, z, m = 0) => STREETS.some(([sz, x0, x1]) => Math.abs(z - sz) < RW + m && x > x0 - m && x < x1 + m);
export const onRoad = (x, z, m = 0) => onAve(x, z, m) || onStreet(x, z, m);

// Intersections (where an avenue and a street cross), with which arms exist.
export function intersections() {
  const out = [];
  for (const [ax, az0, az1] of AVES) for (const [sz, sx0, sx1] of STREETS) {
    if (sz < az0 - 1 || sz > az1 + 1 || ax < sx0 - 1 || ax > sx1 + 1) continue;
    out.push({ x: ax, z: sz, n: sz - az0 > RW + 2, s: az1 - sz > RW + 2, w: ax - sx0 > RW + 2, e: sx1 - ax > RW + 2 });
  }
  return out;
}

// Blocks: [x0, x1, z0, z1, kind, name]. Kinds are handled in city/*.js.
const C = [[656, 694], [706, 764], [776, 834], [846, 904], [916, 974], [986, 1044], [1056, 1104]];
const R = [[-250, -156], [-144, -81], [-69, -6], [6, 54], [66, 112], [124, 174], [186, 230]];
const blk = (ci, ri, kind, name, ci2 = ci, ri2 = ri) => [C[ci][0], C[ci2][1], R[ri][0], R[ri2][1], kind, name];
export const BLOCKS = [
  // north: Brick Row, stadium, building site, (park is its own area)
  blk(1, 0, 'rowhouses', 'Brick Row'),
  blk(2, 0, 'stadium', 'Stadium', 3),
  blk(4, 0, 'construction', 'Building Site'),
  // downtown
  blk(1, 1, 'rowhouses', 'Brick Row'),
  blk(2, 1, 'towers2', ''),
  blk(3, 1, 'bigtower', 'Bigtown Tower'),
  blk(4, 1, 'bank', ''),
  blk(1, 2, 'hotel', ''),
  blk(2, 2, 'lobbytower', ''),
  blk(3, 2, 'plaza', 'Central Plaza'),
  blk(4, 2, 'towers2', ''),
  blk(5, 2, 'garage', 'Parking Garage'),
  blk(6, 2, 'court', ''),
  blk(1, 3, 'shops', ''),
  blk(2, 3, 'tower', ''),
  blk(3, 3, 'offices', ''),
  blk(4, 3, 'towers2', ''),
  blk(5, 3, 'police', ''),
  blk(6, 3, 'shops', ''),
  // Bridge Street
  [706, 736, 66, 104, 'landing', ''],
  blk(2, 4, 'tallhotel', ''),
  blk(3, 4, 'cinema', ''),
  blk(4, 4, 'diner', ''),
  blk(5, 4, 'depot', 'Bus Depot'),
  blk(6, 4, 'beachshops', ''),
  // Market Street and the south
  [706, 764, 136, 174, 'terraces', 'Seaside Terraces'],
  blk(2, 5, 'market', 'Market Street'),
  blk(3, 5, 'market', ''),
  blk(4, 5, 'market', ''),
  blk(1, 6, 'terraces', ''),
  blk(2, 6, 'apartments', ''),
  blk(3, 6, 'apartments', ''),
  blk(4, 6, 'apartments', ''),
];

export const PARK = { x0: 986, x1: 1128, z0: -250, z1: -81 };
export const POND = { x0: 996, x1: 1030, z0: -128, z1: -100, floor: 0.4, level: 1.75 };
export const BEACH = { x0: 1060, x1: 1140, z0: 124, z1: 262 };
