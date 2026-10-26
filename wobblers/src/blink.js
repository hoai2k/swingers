// Blinking: every character (players and awake NPCs) blinks every few seconds, now and then
// twice in a row. A blink plays its face's blink frames (cosmetics.js faceMaterial(i, frame):
// eyes closing, sunglasses lifting, robot screens flashing, hearts beating, spirals spinning)
// and goes back to the open face. It only touches a head showing that face's open or blink
// materials, so the KO face and the 'wobbly' style's plain head are left alone.
import { faceMaterial, faceBlinkFrames, faceBlinkTime } from './cosmetics.js';
import { STYLE } from './charstyle.js';

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
      if (!s) { s = { t: 0.5 + Math.random() * GAP[1], frame: 0, ft: 0 }; st.set(p, s); }
      const face = p.face || 0;
      if (s.frame) { // mid-blink: next frame, or back to the open face
        if ((s.ft -= dt) > 0) continue;
        if (hm.material !== faceMaterial(face, s.frame)) { s.frame = 0; continue; } // something else took the head (KO)
        s.frame++;
        if (s.frame > faceBlinkFrames(face)) { s.frame = 0; hm.material = faceMaterial(face); }
        else { hm.material = faceMaterial(face, s.frame); s.ft = faceBlinkTime(face); }
        continue;
      }
      if ((s.t -= dt) > 0) continue;
      s.t = Math.random() < DOUBLE ? DOUBLE_GAP : GAP[0] + Math.random() * (GAP[1] - GAP[0]);
      if (hm.material === faceMaterial(face)) { s.frame = 1; s.ft = faceBlinkTime(face); hm.material = faceMaterial(face, 1); }
    }
  });
}
