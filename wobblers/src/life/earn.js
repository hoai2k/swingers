// Sandbox ways to earn coins besides the pickups (coins.js):
//  - discovering a map area for the first time (src/map.js AREAS; saved)
//  - stunts: big air in a wheeled vehicle ("Stunt! +5", more for longer air)
//  - mini-games: world/stunts.js and world/fun.js call game.life.reward(...)
//    for baskets, bowling strikes and knocking down the cans.
import { AREAS } from '../map.js';
import { life, saveLife } from './state.js';

export const AREA_REWARD = 10;

export function buildEarning(game) {
  // ---- first visits -----------------------------------------------------
  let tick = 0;
  game.steppers.push(() => {
    if (++tick % 30) return; // twice a second is plenty
    for (const a of AREAS) {
      if (life.areas.includes(a.name)) continue;
      const R = a.r ?? (a.big ? 45 : 26);
      const p = game.players.find((pl) => { const t = pl.chest?.translation(); return t && Math.hypot(t.x - a.x, t.z - a.z) < R; });
      if (!p) continue;
      life.areas.push(a.name); saveLife();
      game.wallet.add(p, AREA_REWARD, 'New place!');
      game.ui?.toast(`P${p.index + 1} discovered <b>${a.name}</b>! <small>+${AREA_REWARD} coins · ${life.areas.length}/${AREAS.length}</small>`, p.color);
    }
  });

  // ---- vehicle stunts ----------------------------------------------------
  const air = new Map(); // vehicle -> { max, driver, cool }
  game.steppers.push(() => {
    for (const v of game.vehicles) {
      const d = v.def || {};
      if (d.heli || d.boat || !v.wheels?.length || v.destroyed) continue;
      const driver = v.seats?.find((s) => s.kind === 'driver')?.occupant;
      let r = air.get(v);
      if (!r) { r = { max: 0, driver: null, cool: 0 }; air.set(v, r); }
      if (r.cool > 0) r.cool -= 1 / 60;
      const at = v.airTime || 0;
      if (at > 0) { if (driver) { r.max = Math.max(r.max, at); r.driver = driver; } continue; }
      // landed
      if (r.max > 1.0 && r.driver && r.cool <= 0 && game.players.includes(r.driver)) {
        const amt = Math.min(30, 5 + Math.floor((r.max - 1.0) * 6));
        game.wallet.add(r.driver, amt, `Stunt! ${r.max.toFixed(1)}s air`);
        r.cool = 2;
      }
      r.max = 0; r.driver = null;
    }
  });
}

// Mini-game prize: pays `player`, or the nearest player to `pos` within 25 m.
export function reward(game, player, amount, reason, pos) {
  if (!game.wallet) return;
  if (!player && pos) {
    let bd = 25;
    for (const p of game.players) { const t = p.chest?.translation(); if (!t) continue; const d = Math.hypot(t.x - pos.x, t.z - pos.z); if (d < bd) { bd = d; player = p; } }
  }
  if (player) game.wallet.add(player, amount, reason);
}
