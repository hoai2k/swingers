// Shared bits for the arcade games (src/arcade/*.js).
//
// A game is a class with a fixed native size (W x H "pixels", drawn at 2x for
// crisp text) and this interface, all driven at a fixed 60 Hz by the cabinet
// session (index.js):
//   static id / title / slots    save key, marquee text (= signMesh text), player slots
//   reset()                       a new game
//   step(inputs)                  one 1/60 s tick; inputs[i] = { x, y, fire, fireP } for a
//                                 human in slot i, or null: the game's own AI plays that
//                                 slot (attract-mode demo, Paddle Ball's CPU)
//   draw(g)                       paint the whole screen (native coordinates)
//   score, over                   current score (slot 0) and game-over flag
//   snd                           fn(name) the session points at its bleeps (null = silent)
//   hi                            best score so far (shown on the screen)

export const STEP = 1 / 60;

// Pixel-ish text. size in native pixels; align 'left' | 'center' | 'right'.
export function txt(g, s, x, y, col = '#fff', size = 8, align = 'left') {
  g.fillStyle = col;
  g.font = `bold ${size}px "Courier New", monospace`;
  g.textAlign = align; g.textBaseline = 'top';
  g.fillText(String(s), x, y);
}

// Draw a pixel bitmap given as rows of '#'/'.' at (x, y) with pixel size k.
export function bitmap(g, rows, x, y, col, k = 1) {
  g.fillStyle = col;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) if (row[c] !== '.' && row[c] !== ' ') g.fillRect(x + c * k, y + r * k, k, k);
  }
}

// Small seeded random (games reset to varied but reproducible-ish layouts).
export function rng(seed = (Math.random() * 1e9) | 0) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const pad = (n, w = 6) => String(Math.max(0, n | 0)).padStart(w, '0');
