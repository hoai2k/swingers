// Friendly-fire / damage breakdown for one pairing:
//   node battles/dev/balance/ff.mjs squire+dy_hwacha clubber [runs]
// Prints, per attacking unit type, damage dealt to enemies and to its own side.
import { load, pickBudget, fight } from './lib.mjs';
const G = await load();
const { Unit } = await import(G.SRC_UNIT);
const [a, b, runs = 2] = process.argv.slice(2);
const dmg = {};
const orig = Unit.prototype.hit;
Unit.prototype.hit = function (amount, part, ix, iy, iz, attacker, kind) {
  const hp0 = this.hp;
  const r = orig.apply(this, arguments);
  const done = Math.max(0, hp0 - Math.max(0, this.hp));
  if (attacker && attacker.def) {
    const k = attacker.def.id + (attacker.team === this.team ? ' -> own side' : ' -> enemy');
    dmg[k] = (dmg[k] || 0) + done;
  }
  return r;
};
const { B } = pickBudget(G.UNIT_BY_ID, a, b);
for (let r = 0; r < +runs; r++) console.log(JSON.stringify(fight(G, { a, b, budget: B, swap: r % 2, seed: 1000 + r })));
for (const [k, v] of Object.entries(dmg).sort((x, y) => y[1] - x[1])) console.log(k.padEnd(36), Math.round(v / runs));
