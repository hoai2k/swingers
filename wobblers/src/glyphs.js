// Button prompts: Xbox-style glyphs for pads (A green, B red, X blue,
// Y yellow circles, pill-shaped triggers and bumpers) and key caps for the
// two keyboard schemes.

const KEYS = {
  kb1: { A: 'Space', B: 'X', X: 'G', Y: 'F', LT: 'LMB', RT: 'RMB', LB: 'Shift', RB: '1', START: 'Esc', BACK: 'Bksp', EMOTE: '1', MAP: 'M', PHONE: 'P', WAVE: '2', CHEER: '3', DANCE: '4', GAS: 'W', BRAKE: 'S', HORN: 'H', DPAD: '1-4', LS: 'WASD', RS: 'Mouse', OK: 'Enter', MENUBACK: 'Esc', DASH: 'V', RAGDOLL: 'X' },
  kb2: { A: 'Num0', B: 'Num7', X: 'Num2', Y: 'Num9', LT: 'Num1', RT: 'Num3', LB: 'Num.', RB: 'Num-', START: 'NumEnter', BACK: 'Num7', EMOTE: 'Num-', MAP: 'Num/', PHONE: 'Num*', GAS: '↑', BRAKE: '↓', HORN: 'Num+', DPAD: 'Num/ * -', LS: 'Arrows', RS: 'Num8456', OK: 'Num0', MENUBACK: 'Num7', DASH: 'Del', RAGDOLL: 'Num7' },
};

export function deviceKind(id) {
  return id === 'kb1' ? 'kb1' : id === 'kb2' ? 'kb2' : 'pad';
}

// One prompt glyph. `b` is A B X Y LT RT LB RB START BACK GAS BRAKE HORN DPAD LS RS OK MENUBACK
// EMOTE (wheel) MAP PHONE WAVE CHEER DANCE DASH RAGDOLL.
export function glyph(b, kind = 'pad') {
  if (kind !== 'pad') {
    const k = KEYS[kind][b] || b;
    return `<span class="key">${k}</span>`;
  }
  const map = { GAS: 'RT', BRAKE: 'LT', HORN: 'X', OK: 'A', MENUBACK: 'B', EMOTE: 'RB', MAP: 'BACK', PHONE: 'DPAD', WAVE: 'DPAD', CHEER: 'DPAD', DANCE: 'DPAD', DASH: 'B', RAGDOLL: 'DPAD' };
  b = map[b] || b;
  if ('ABXY'.includes(b) && b.length === 1) return `<span class="btn b${b}">${b}</span>`;
  if (b === 'START') return '<span class="btn bS" title="Menu"><i></i><i></i><i></i></span>';
  if (b === 'BACK') return '<span class="btn bS bV" title="View"><i></i><i></i></span>';
  if (b === 'DPAD') return '<span class="btn bD"><i></i><i></i></span>';
  if (b === 'LS' || b === 'RS') return `<span class="btn bStick">${b[0]}</span>`;
  return `<span class="trig">${b}</span>`;
}

// Replace button words in a hint ("Y exit", "A push off · Y exit",
// "Arms up! (LT/RT)") with glyphs for this device.
export function formatHint(text, kind) {
  const esc = text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  return esc.replace(/\b(LT|RT|LB|RB|A|B|X|Y)\b(?=[\s/)·]|$)/g, (m) => glyph(m, kind));
}

// A row of "glyph label" prompts: [['A', 'Select'], ['B', 'Back']].
export function promptRow(list, kind) {
  return list.map(([b, label]) => `<span class="prompt">${glyph(b, kind)}<span>${label}</span></span>`).join('');
}
