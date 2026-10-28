// Skills: the techniques a possessed unit fires on its own buttons (game.js take control).
// RT is the unit's basic attack as before; a kind with special techniques lists them on
// `skills` and the player fires each with its button, each on its own cooldown:
//
// kind.basic = 'Red'                        // name of the RT attack on the skill bar (optional)
// kind.skills = [{                         // (or a function (u) -> list: skills that change,
//                                           //  e.g. Megumi once Sukuna has taken his body)
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
export const skillsOf = (u) => { const s = u.kind?.skills; return typeof s === 'function' ? s(u) : s; };

// the enemy a possessed unit means: the one nearest the crosshair point (within `slack`
// of it), else the nearest one in front; within `range` of the unit. null if none.
export function aimTarget(u, range = 30, slack = 5) {
  const b = u.battle, p = u.pos, aim = u.control?.aimPt;
  let best = null, bd = Infinity;
  const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
  for (const v of b.foes(u.team)) {
    if (!v.alive || v.dormant || v.jkSealedT > b.time) continue;
    const dx = v.pos.x - p.x, dz = v.pos.z - p.z, d = Math.hypot(dx, dz);
    if (d - v.skel.radius > range) continue;
    let score;
    if (aim) { const da = Math.hypot(v.pos.x - aim.x, v.pos.z - aim.z); score = da < slack + v.skel.radius ? da : 1000 + d; }
    else score = d;
    if ((dx * fx + dz * fz) < -0.3 * d) score += 2000; // behind: only if nothing else
    if (score < bd) { bd = score; best = v; }
  }
  return best;
}

// a leap at v (a melee unit closing in on its own button): k = horizontal push per mass
export function leap(u, v, k = 8) {
  const dx = v.pos.x - u.pos.x, dz = v.pos.z - u.pos.z, d = Math.hypot(dx, dz) || 1;
  const s = u.M * k * Math.min(1.1, Math.max(0.5, d / 7));
  u.rag.impulseAll((dx / d) * s, u.M * 2.6, (dz / d) * s);
  u.heading = u.faceYaw = Math.atan2(dx, dz);
  const b = u.battle;
  b.emit('dust', u.pos.x, u.pos.y - u.skel.standHeight, u.pos.z, 2);
  b.sound('whoosh', u.pos, 0.7, 0.8);
}
// the usual leap skill: at the enemy under the crosshair, 3-14 m away
export const leapSkill = (key = 'lb', cd = 4, name = 'Leap in') => ({
  key, name, icon: '💨', cd: (u) => (u.leapCD || 0) - u.battle.time, max: () => cd,
  ready: (u) => (u.airT > 0 ? 'in the air' : aimTarget(u, 14) ? true : 'no target'),
  use(u) { const v = aimTarget(u, 14); if (!v) return false; leap(u, v); u.leapCD = u.battle.time + cd; return true; },
});

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
  const sk = skillsOf(u);
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
  const k = u.kind, w = u.def.weapon, list = skillsOf(u);
  if (!list?.length) return null;
  const out = [{ key: 'rt', name: k.basic || 'Attack', icon: '', left: Math.max(0, u.cooldown || 0), max: Math.max(0.1, w.cooldown || 1), ready: !(u.cooldown > 0) }];
  for (const s of list) {
    const st = skillState(u, s);
    out.push({ key: s.key, name: s.name, icon: s.icon || '', left: st.left, max: st.max, ready: st.ready, why: st.why });
  }
  const c = u.control, t = u.battle.time;
  if (c?.denied && t - c.denied.t < 0.8) { const d = out.find((x) => x.key === c.denied.key); if (d) d.denied = c.denied.why; }
  if (c?.used && t - c.used.t < 0.4) { const d = out.find((x) => x.key === c.used.key); if (d) d.flash = true; }
  return out;
}
