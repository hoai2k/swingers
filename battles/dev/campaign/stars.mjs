// Star thresholds and budget from solver results (shared by solve.mjs and apply.mjs).
//   cheapest: cheapest reliable win; alt: cheapest win without the cheapest army's
//   main unit; mono: cheapest single-unit-type win (costs in gold, or undefined).
//
// 3 stars: the cheapest win +20%, raised towards the alt win (at most +35%) so a
//          nerf to one unit doesn't lock 3 stars away.
// 2 stars: a "reasonable" army (the cheaper of mono and alt) +15%, at least 1.15x
//          the 3-star gold and at most 2x it.
// budget:  room for the reasonable army +30% and the cheapest +60%, and at least
//          1.15x the 2-star gold; never lowered below the level's current budget.
const up50 = (g) => Math.ceil(g / 50) * 50;
const up100 = (g) => Math.ceil(g / 100) * 100;
export function starsFrom({ cheapest, alt, mono }, budget = 0) {
  if (!cheapest) return null;
  const c = cheapest, a = alt ?? Infinity, m = mono ?? Infinity;
  const g3 = up50(Math.max(c * 1.2, Math.min(a, c * 1.35)));
  const simple = Math.min(m, a);
  const g2 = up50(Math.max(g3 * 1.15, Math.min(simple * 1.15, g3 * 2)));
  const need = up100(Math.max(g2 * 1.15, Number.isFinite(simple) ? simple * 1.3 : 0, c * 1.6));
  return { g3, g2, budget: Math.max(budget, need), need };
}
