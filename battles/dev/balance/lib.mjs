// Headless equal-gold battle harness (Node). See battles/BALANCE.md.
// Imports the game modules directly; nothing here is loaded by the game.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SRC = process.env.SRC ? path.resolve(process.env.SRC) + '/' : path.resolve(HERE, '../../src') + '/';

let G = null;
export async function load() {
  if (G) return G;
  const { initPhysics } = await import(SRC + 'physics.js');
  const { Battle } = await import(SRC + 'battle.js');
  const { Terrain, MAPS } = await import(SRC + 'world.js');
  const { UNIT_BY_ID, UNITS } = await import(SRC + 'units.js');
  const { makeSkeleton } = await import(SRC + 'body.js');
  await initPhysics();
  const terrain = new Terrain(MAPS[0], 1);
  terrain.buildMesh();
  G = { Battle, terrain, UNIT_BY_ID, UNITS, makeSkeleton };
  return G;
}

// ---- reference panel -------------------------------------------------------
// cheap / mid / elite single-type armies plus one mixed army.
export const PANEL = ['clubber', 'squire', 'archer', 'knight', 'chieftain', 'ww_gunslinger', 'giant', 'king', 'mix'];
// mixed reference army: gold shares (filled in this order, remainder in clubbers)
const MIX = [['knight', 0.35], ['archer', 0.25], ['squire', 0.3]];

const costOf = (U, spec) => (spec === 'mix' || spec.includes('+') ? null : U[spec].cost);

// Army as a list of unit ids for a gold budget.
// 'a+b' = half the gold in a, half in b; 'a+b@0.25' = a quarter in b. Support and
// artillery units are scored inside a squire frontline this way.
export function armyList(U, spec, budget) {
  if (spec.includes('+')) {
    const [p, qs] = spec.split('+');
    const [q, share = 0.5] = qs.split('@');
    const nq = Math.max(1, Math.round((budget * share) / U[q].cost));
    const np = Math.max(1, Math.round((budget - nq * U[q].cost) / U[p].cost));
    return [...Array(np).fill(p), ...Array(nq).fill(q)];
  }
  if (spec === 'mix') {
    const out = [];
    let left = budget;
    for (const [id, share] of MIX) {
      const n = Math.floor((budget * share) / U[id].cost + 0.25);
      for (let i = 0; i < n && left >= U[id].cost; i++) { out.push(id); left -= U[id].cost; }
    }
    while (left >= 35) { out.push('clubber'); left -= 70; }
    return out;
  }
  const n = Math.max(1, Math.round(budget / U[spec].cost));
  return Array(n).fill(spec);
}
const spend = (U, list) => list.reduce((s, id) => s + U[id].cost, 0);

// Budget for an equal-gold pairing: the smallest budget >= max(1200, both costs) whose
// armies differ by under 4% in gold (searched up to 3x; else the closest found).
export const MAX_ARMY = 60;
export function pickBudget(U, a, b) {
  const ca = costOf(U, a), cb = costOf(U, b);
  const base = Math.max(1200, ca || 0, cb || 0);
  let best = null;
  for (let B = base; B <= base * 3; B += 10) {
    const la = armyList(U, a, B), lb = armyList(U, b, B);
    if (la.length > MAX_ARMY || lb.length > MAX_ARMY) continue;
    const sa = spend(U, la), sb = spend(U, lb);
    const mis = Math.abs(sa - sb) / Math.max(sa, sb);
    if (!best || mis < best.mis - 0.005) best = { B, mis, sa, sb };
    if (mis < 0.04) break;
  }
  return best || { B: base, mis: 1 };
}

const isBack = (def) => ['heal', 'bard'].includes(def.weapon.kind) || (def.weapon.range || 0) >= 8;

// Placement for team 0 (x < 0). Front rank faces +x. Back-liners go behind.
// Team 1 gets the point mirror (-x, -z), matching the point-symmetric terrain.
export function layout(G, list) {
  const U = G.UNIT_BY_ID;
  const front = list.filter((id) => !isBack(U[id])), back = list.filter((id) => isBack(U[id]));
  const out = [];
  let x = -6; // front edge (zone gap is +-3)
  for (const group of [front, back]) {
    if (!group.length) continue;
    const sp = Math.max(...group.map((id) => G.makeSkeleton(U[id].build).radius)) * 2.3 + 0.45;
    const cols = Math.max(1, Math.min(Math.floor(50 / sp), Math.ceil(Math.sqrt(group.length * 2.5))));
    const rows = Math.ceil(group.length / cols);
    group.forEach((id, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const inRow = r === rows - 1 ? group.length - r * cols : cols;
      out.push({ type: id, x: x - sp / 2 - r * sp, z: (c - (inRow - 1) / 2) * sp });
    });
    x -= rows * sp + 1;
  }
  for (const u of out) u.x = Math.max(u.x, -40);
  return out;
}
export const mirror = (army) => army.map((u) => ({ type: u.type, x: -u.x, z: -u.z }));

// OVERRIDE='{"clubber":{"cost":80,"weapon.damage":20}}' tries stats without editing files.
export function applyOverrides(G, json) {
  if (!json) return;
  if (typeof json === 'string' && json.startsWith('@')) json = fs.readFileSync(json.slice(1), 'utf8');
  const o = typeof json === 'string' ? JSON.parse(json) : json;
  for (const [id, fields] of Object.entries(o)) {
    const def = G.UNIT_BY_ID[id];
    if (!def) throw new Error('OVERRIDE: unknown unit ' + id);
    for (const [k, v] of Object.entries(fields)) {
      const keys = k.split('.');
      let obj = def;
      for (const kk of keys.slice(0, -1)) obj = obj[kk];
      obj[keys.at(-1)] = v;
    }
  }
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// hp-weighted gold still standing, per team
function valueLeft(bt, t) {
  return bt.teams[t].reduce((s, u) => s + (u.alive ? u.def.cost * Math.max(0, Math.min(1, u.hp / u.maxHp)) : 0), 0);
}

// One battle. a plays team (swap ? 1 : 0). Returns score for a in [-1, 1]:
// (a's hp-weighted value left / a's start) - (b's ... / b's start).
export function fight(G, job) {
  const { a, b, budget, swap, seed, maxT = 120 } = job;
  Math.random = mulberry32(seed);
  const U = G.UNIT_BY_ID;
  const la = armyList(U, a, budget), lb = armyList(U, b, budget);
  const A = layout(G, la), B = mirror(layout(G, lb));
  // B's layout was built for team 0 and mirrored onto team 1
  const armies = swap ? [layout(G, lb), mirror(A)] : [A, B];
  const bt = new G.Battle(G.terrain, armies, null);
  const ia = swap ? 1 : 0;
  const start = [bt.startValue[ia], bt.startValue[1 - ia]];
  const t0 = performance.now();
  let f = 0;
  for (; f < 60 * maxT && !bt.over; f++) bt.step(1 / 60);
  const ms = (performance.now() - t0) / Math.max(1, f);
  const va = valueLeft(bt, ia), vb = valueLeft(bt, 1 - ia);
  const res = {
    a, b, budget, swap, seed,
    na: la.length, nb: lb.length, ga: start[0], gb: start[1],
    win: bt.winner === ia ? 1 : bt.winner === 1 - ia ? -1 : 0,
    fa: va / start[0], fb: vb / start[1], t: +bt.time.toFixed(1), ms: +ms.toFixed(2),
  };
  res.score = +(res.fa - res.fb).toFixed(4);
  bt.destroy();
  return res;
}
