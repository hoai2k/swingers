// Blinking: every character (players and awake NPCs) shuts its eyes for a moment every few
// seconds, now and then twice in a row. A blink swaps the head to its face's closed-eye
// material (cosmetics.js faceMaterial(i, true)) and back; it only touches a head showing
// that face's open eyes, so the KO face, the 'wobbly' style's plain head and faces with
// hidden eyes (shades, robot: no closed version) are left alone.
import { faceMaterial } from './cosmetics.js';
import { STYLE } from './charstyle.js';

const SHUT = 0.13;               // seconds the eyes stay closed
const GAP = [2.2, 6.2];          // seconds between blinks
const DOUBLE = 0.18, DOUBLE_GAP = 0.28;

export function buildBlink(game) {
  const st = new WeakMap();
  game.updaters.push((dt) => {
    if (STYLE.mono) return;
    for (const list of [game.players, game.npcs?.list || []]) for (const p of list) {
      const hm = p.headMesh;
      if (!hm || p.parked) continue;
      let s = st.get(p);
      if (!s) { s = { t: 0.5 + Math.random() * GAP[1], shut: 0 }; st.set(p, s); }
      if (s.shut > 0) {
        if ((s.shut -= dt) <= 0) { const c = faceMaterial(p.face || 0, true); if (hm.material === c) hm.material = faceMaterial(p.face || 0); }
        continue;
      }
      if ((s.t -= dt) > 0) continue;
      s.t = Math.random() < DOUBLE ? DOUBLE_GAP : GAP[0] + Math.random() * (GAP[1] - GAP[0]);
      const open = faceMaterial(p.face || 0), closed = faceMaterial(p.face || 0, true);
      if (closed !== open && hm.material === open) { hm.material = closed; s.shut = SHUT; }
    }
  });
}
