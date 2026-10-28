// Skills: the techniques a possessed unit fires on its own buttons (game.js take control).
// RT is the unit's basic attack as before; a kind with special techniques lists them on
// `skills` and the player fires each with its button, each on its own cooldown:
//
// kind.basic = 'Red'                        // name of the RT attack on the skill bar (optional)
// kind.skills = [{
//   key: 'x' | 'lb' | 'rb',                 // its button (keyboard: F / Q / E)
//   name: 'Hollow Purple', icon: '🟣',
//   cd(u) -> seconds left (<= 0: ready),    // read from the kind's own timer
//   max(u) -> its full cooldown,            // for the bar's sweep
//   ready(u) -> true | 'why not',           // optional: 'burnt out', 'no curses left'...
//   free: true,                             // optional: fires mid-animation / while stunned
//   use(u, c) -> true when it went off      //   (false: not now, the press stays queued)
// }]
//
// While a unit is possessed its kind should not fire these techniques by itself
// (check `u.control` where its step() would): the player decides when. A press is kept
// for QUEUE seconds, so a press during an attack's swing fires when the swing ends.
const QUEUE = 0.35;
export const SKILL_KEYS = ['x', 'lb', 'rb'];

// state of one skill: { left, max, ready (bool), why }
export function skillState(u, s) {
  const left = Math.max(0, s.cd ? s.cd(u) : 0);
  const max = Math.max(0.01, s.max ? s.max(u) : left || 1);
  let why = '';
  if (u.jkSealedT > u.battle.time) why = 'sealed';
  else if (s.ready) { const r = s.ready(u); if (r !== true && r) why = typeof r === 'string' ? r : 'not now'; }
  return { left, max, ready: left <= 0 && !why, why };
}

// called from Unit.possessed every step: queue presses (c.press = {key: true}) and fire them
export function runSkills(u, c, dt) {
  const sk = u.kind?.skills;
  c.queue ??= {};
  if (c.press) {
    for (const k in c.press) if (c.press[k]) c.queue[k] = QUEUE;
    c.press = null;
  }
  if (!sk) { c.queue = {}; return; }
  const b = u.battle;
  for (const s of sk) {
    const q = c.queue[s.key];
    if (!(q > 0)) continue;
    c.queue[s.key] = q - dt;
    const st = skillState(u, s);
    if (!st.ready) {
      if (st.left <= 0 && st.why) c.queue[s.key] = 0; // (a reason, not a wait: drop it)
      if (q === QUEUE) c.denied = { key: s.key, t: b.time, why: st.why || `${st.left.toFixed(1)} s` };
      continue;
    }
    if (!s.free && (u.st.attack || u.stun > 0.25 || u.isDown())) continue;
    if (s.use(u, c)) { c.queue[s.key] = 0; c.used = { key: s.key, t: b.time }; }
  }
}

// the skill bar for the HUD: the basic attack, then each skill
export function skillBar(u) {
  const k = u.kind, w = u.def.weapon;
  if (!k?.skills?.length) return null;
  const out = [{ key: 'rt', name: k.basic || 'Attack', icon: '', left: Math.max(0, u.cooldown || 0), max: Math.max(0.1, w.cooldown || 1), ready: !(u.cooldown > 0) }];
  for (const s of k.skills) {
    const st = skillState(u, s);
    out.push({ key: s.key, name: s.name, icon: s.icon || '', left: st.left, max: st.max, ready: st.ready, why: st.why });
  }
  const c = u.control, t = u.battle.time;
  if (c?.denied && t - c.denied.t < 0.8) { const d = out.find((x) => x.key === c.denied.key); if (d) d.denied = c.denied.why; }
  if (c?.used && t - c.used.t < 0.4) { const d = out.find((x) => x.key === c.used.key); if (d) d.flash = true; }
  return out;
}
