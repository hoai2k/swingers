// Headless campaign battle: runs one level against a player army in Node.
//
//   import { fight, placeArmy } from './sim.mjs';
//   const r = await fight('t1', [['clubber', 7]], { seed: 3 });  // -> { win, time, alive: [blue, red] }
//
// The player's army is laid out the way the game's auto-formation does it
// (melee in front, ranged/support behind, rows across the field) in the Blue
// zone, with the front row mirrored to the enemy's front line so neither side
// gets a head start. Math.random is replaced by a seeded PRNG for each fight,
// so a (level, army, seed) triple always plays out the same way (as long as the
// units and physics don't change).
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src') + '/';

let mods = null;
export async function load() {
  if (mods) return mods;
  const { initPhysics } = await import(SRC + 'physics.js');
  const { Battle } = await import(SRC + 'battle.js');
  const { Terrain, MAPS, FIELD, ZONE_GAP } = await import(SRC + 'world.js');
  const { UNIT_BY_ID, UNITS, FACTIONS } = await import(SRC + 'units.js');
  const campaign = await import(SRC + 'campaign.js');
  const { makeSkeleton } = await import(SRC + 'body.js');
  const skels = new Map();
  const skelOf = (def) => { let s = skels.get(def.id); if (!s) skels.set(def.id, (s = makeSkeleton(def.build))); return s; };
  await initPhysics();
  const terrains = {};
  const terrainFor = (mapId) => {
    const i = Math.max(0, MAPS.findIndex((m) => m.id === mapId));
    if (!terrains[i]) { const t = new Terrain(MAPS[i], i + 1); t.buildMesh(); terrains[i] = t; }
    return terrains[i];
  };
  mods = { Battle, terrainFor, FIELD, ZONE_GAP, UNIT_BY_ID, UNITS, FACTIONS, campaign, skelOf };
  return mods;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// counts: [[unitId, n], ...] -> [{type, x, z}] in the Blue zone (x < 0).
// front: distance of the front row from the centre line.
export function placeArmy(counts, front = 8) {
  const { UNIT_BY_ID, FIELD, ZONE_GAP, skelOf } = mods;
  const radius = (def) => skelOf(def).radius;
  const order = counts.map(([id, n]) => [UNIT_BY_ID[id], n]).filter(([d, n]) => d && n > 0)
    .sort(([a], [b]) => (a.weapon.kind === 'melee' ? 0 : 1) - (b.weapon.kind === 'melee' ? 0 : 1) || b.hp - a.hp);
  const out = [];
  let d = Math.max(ZONE_GAP + 1, front), prevSp = 0, first = true;
  for (const [def, n] of order) {
    const sp = radius(def) * 2.3 + 0.35;
    d += first ? 0 : (prevSp + sp) / 2;
    first = false;
    let todo = n;
    const perRow = Math.max(1, Math.min(12, Math.floor((FIELD.z * 2 - 4) / sp)));
    while (todo > 0 && d <= FIELD.x - 1) {
      const k = Math.min(todo, perRow);
      for (let i = 0; i < k; i++) out.push({ type: def.id, x: -d, z: (i - (k - 1) / 2) * sp });
      todo -= k;
      if (todo > 0) d += sp;
    }
    prevSp = sp;
  }
  return out;
}

export const armyCost = (counts) => counts.reduce((s, [id, n]) => s + (mods.UNIT_BY_ID[id]?.cost || 0) * n, 0);
export const armySize = (counts) => counts.reduce((s, [, n]) => s + n, 0);

// One fight. opts: seed, maxTime (sim seconds; a timeout is a loss), dt.
export async function fight(levelId, counts, opts = {}) {
  const { Battle, terrainFor, campaign } = await load();
  const level = campaign.levelById(levelId);
  if (!level) throw new Error('no level ' + levelId);
  const enemy = campaign.enemyArmy(level);
  const front = Math.min(...enemy.map((a) => a.x));
  const blue = placeArmy(counts, front);
  const rnd = Math.random;
  Math.random = mulberry32((opts.seed ?? 1) * 7919 + 17);
  const maxTime = opts.maxTime ?? 120, dt = opts.dt ?? 1 / 60;
  let b;
  try {
    b = new Battle(terrainFor(level.map), [blue, enemy], null);
    while (!b.over && b.time < maxTime) b.step(dt);
    const s = b.stats();
    return { win: b.winner === 0, winner: b.winner, time: +b.time.toFixed(1), alive: [s[0].alive, s[1].alive], value: [s[0].value, s[1].value] };
  } finally {
    Math.random = rnd;
    b?.destroy();
  }
}
