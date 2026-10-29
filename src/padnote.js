// "Xbox controller highly recommended": the small note every game in this
// repo (Swingers, Wobblers, Spider Swingers, Wobbly Battles) shows on its
// title screen until a controller is connected. Each game places and styles
// it to match its own title; this module only knows the words, the icon and
// whether a pad is plugged in.
//
//   padNoteEl(className)      a DOM element (icon + text) for an HTML title;
//                             it hides itself while a pad is connected
//   drawPadNote(ctx, x, y, …) the same note drawn on a canvas title
//   padConnected()            true while any gamepad is connected

export const PAD_NOTE_TEXT = 'Xbox controller highly recommended';

// a controller silhouette (d-pad + two face buttons cut out), 24x24 viewBox
export const PAD_ICON_PATH = 'M7 6h10a5 5 0 0 1 4.9 6l-1 4.6a2.6 2.6 0 0 1-4.5 1.2L14.6 16H9.4l-1.8 1.8a2.6 2.6 0 0 1-4.5-1.2l-1-4.6A5 5 0 0 1 7 6zm0 3v1.5H5.5v1.5H7v1.5h1.5V12H10v-1.5H8.5V9H7zm9.5.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm2 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2z';
export const PAD_ICON_SVG = `<svg viewBox="0 0 24 24" width="1.25em" height="1.25em" aria-hidden="true" style="vertical-align:-0.25em"><path fill="currentColor" d="${PAD_ICON_PATH}"/></svg>`;

const els = new Set();
let connected = false;

function countPads(skipIndex = -1) {
  let n = 0;
  try {
    for (const p of navigator.getGamepads?.() || []) if (p && p.connected !== false && p.index !== skipIndex) n++;
  } catch { /* getGamepads can throw where gamepads are blocked */ }
  return n;
}

function refresh(skipIndex) {
  connected = countPads(skipIndex) > 0;
  for (const el of els) el.style.display = connected ? 'none' : '';
}

if (typeof window !== 'undefined') {
  window.addEventListener('gamepadconnected', () => { connected = true; for (const el of els) el.style.display = 'none'; });
  // the pad that left can still be listed during its own event: skip it
  window.addEventListener('gamepaddisconnected', (e) => refresh(e.gamepad ? e.gamepad.index : -1));
  refresh();
}

export function padConnected() { return connected; }

export function padNoteEl(className = 'padnote') {
  const el = document.createElement('div');
  el.className = className;
  el.innerHTML = `${PAD_ICON_SVG} ${PAD_NOTE_TEXT}`;
  if (connected) el.style.display = 'none';
  els.add(el);
  return el;
}

let iconPath = null;
// Draws the note centred on (x, y) (y is the text baseline) in `font` (a
// full canvas font string), `color`, with an optional soft shadow. Returns
// its width, or 0 when a pad is connected and nothing was drawn.
export function drawPadNote(ctx, x, y, { font, color, size, shadow = null, shadowBlur = 8 } = {}) {
  if (connected) return 0;
  iconPath = iconPath || new Path2D(PAD_ICON_PATH);
  ctx.save();
  ctx.font = font;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  const tw = ctx.measureText(PAD_NOTE_TEXT).width;
  const ic = size * 1.25, gap = size * 0.4;
  const w = ic + gap + tw;
  const left = x - w / 2;
  if (shadow) { ctx.shadowColor = shadow; ctx.shadowBlur = shadowBlur; }
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(PAD_NOTE_TEXT, left + ic + gap, y);
  // icon: same box as the SVG (1.25em, dropped 0.25em below the baseline)
  ctx.translate(left, y + size * 0.25 - ic);
  ctx.scale(ic / 24, ic / 24);
  ctx.fill(iconPath);
  ctx.restore();
  return w;
}
