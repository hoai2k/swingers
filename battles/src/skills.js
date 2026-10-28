// Skills: the buttons of a possessed unit (game.js take control).
//
//   X   the main attack: the unit's melee swing (a ranged-only unit shoves whoever is
//       right in front of it; a kind can give its own: kind.main(u))
//   RT  the ranged attack, if the unit has one (its weapon's shot, a kind's control()
//       hook, or a skill on 'rt'); a unit with none attacks as with X
//   LT  block (melee) / aim (ranged), as before
//   LB  a special technique
//   RB  the domain or an area technique (a unit with neither puts its second special here)
//
// kind.basic = 'Divergent Fist'             // name of the X attack on the skill bar
// kind.ranged = 'Red'                       // name of the RT attack when it isn't a skill
// kind.main(u)                              // optional: the X attack, when it isn't a swing
// kind.control(u, dt, c) -> true | 'shoot' | false   (true: it handled every attack button;
//                                           //  'shoot': it handled RT, X stays the core's)
// kind.skills = [{                          // (or a function (u) -> list: skills that change,
//                                           //  e.g. Megumi once Sukuna has taken his body)
//   key: 'rt' | 'lb' | 'rb',                // its button (keyboard: C / Q / E)
//   hold: 0.6,                              // 'rt' only: fires after RT is held this long
//                                           //  (tap RT = the normal shot, hold = this)
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
// for QUEUE seconds, so a press during an attack's swing fires when the swing ends; RT
// held keeps firing an 'rt' skill whenever it's ready.
import { ATTACKS } from './pose.js';
import { PART } from './body.js';

const QUEUE = 0.35;
export const SKILL_KEYS = ['lb', 'rb']; // (pressed; RT is held, see runSkills)
export const skillsOf = (u) => { const s = u.kind?.skills; return typeof s === 'function' ? s(u) : s; };
const rtSkill = (list) => list?.find((s) => s.key === 'rt' && !s.hold);
const holdSkill = (list) => list?.find((s) => s.key === 'rt' && s.hold);

// does the unit's own weapon shoot (RT fires it)?
export function rangedBasic(u) {
  const w = u.def.weapon;
  if (u.kind?.ranged) return true;
  return w.kind === 'ranged' || (!!u.kind && !u.kind.melee && (w.range || 0) > 0 && !u.bc);
}

// ---- X: the main attack
ATTACKS.shove = ATTACKS.punch;
export function mainAttack(u) {
  if (u.kind?.main) { u.kind.main(u); return; }
  if (u.weapons.length || !rangedBasic(u)) { u.startAttack(); u.aimAt = null; return; }
  // a ranged-only unit: a quick shove at whoever is right in front
  u.st.attack = 'shove'; u.st.attackT = 0; u.hitSet.clear();
  u.shoveDur = u.attackDur; u.attackDur = 0.45; // (its own timing comes back at the end)
  u.cooldown = 0.65;
  u.battle.sound('whoosh', u.pos, 0.5, 1.2);
}
export function shoveEvent(u, t0, t1) {
  if (t1 >= 1 && u.shoveDur) { u.attackDur = u.shoveDur; u.shoveDur = 0; }
  if (!(t0 < 0.45 && t1 >= 0.45)) return;
  const b = u.battle, p = u.pos, fx = Math.sin(u.heading), fz = Math.cos(u.heading);
  const R = u.reachDist + 0.5;
  let best = null, bd = Infinity;
  b.grid.query(p.x, p.z, R + 2, (v) => {
    if (!v.alive || v.team === u.team || v.dormant) return;
    const dx = v.pos.x - p.x, dz = v.pos.z - p.z, d = Math.hypot(dx, dz) - v.skel.radius;
    if (d > R || (dx * fx + dz * fz) < 0.2 * Math.hypot(dx, dz)) return;
    if (d < bd) { bd = d; best = v; }
  });
  if (!best) return;
  const dmg = Math.min(40, 10 + u.def.hp * 0.02), f = Math.min(best.M * 6, 320 * u.s);
  best.hit(dmg, PART.chest, fx * f, f * 0.3, fz * f, u, 'melee');
  best.stun = Math.max(best.stun, 0.35 * (best.def.stagger ?? 1));
  b.sound('punch', best.chestPos, 0.8, 1.1);
}

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

// Before the kind's control() hook: how long RT has been held, and whether a held-RT
// skill takes over from the normal shot (then c.shoot is off for this step).
export function preSkills(u, c, dt) {
  c.rtT = c.shoot ? (c.rtT || 0) + dt : 0;
  const h = holdSkill(skillsOf(u));
  c.holding = !!h && c.shoot;
  if (h && c.rtT >= h.hold && skillState(u, h).ready) c.shoot = false;
}

// called from Unit.possessed every step: presses (c.press = {key: true}) and RT held
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
    let q = c.queue[s.key];
    if (s.key === 'rt') { // RT is a trigger: held, it keeps trying
      const on = s.hold ? c.holding && c.rtT >= s.hold : (c.shoot || c.holding) && !(rtHeldFor(sk, c));
      q = on ? QUEUE : 0;
      if (!on) continue;
    } else if (!(q > 0)) continue;
    else c.queue[s.key] = q - dt;
    const st = skillState(u, s);
    if (!st.ready) {
      if (s.key !== 'rt' && st.left <= 0 && st.why) c.queue[s.key] = 0; // (a reason, not a wait: drop it)
      const fresh = s.key === 'rt' ? c.rtT <= dt * 1.5 || (s.hold && c.rtT - s.hold < dt * 1.5) : q === QUEUE;
      if (fresh) c.denied = { key: s.hold ? 'rth' : s.key, t: b.time, why: st.why || `${st.left.toFixed(1)} s` };
      continue;
    }
    if (!s.free && (u.st.attack || u.stun > 0.25 || u.isDown())) continue;
    if (s.use(u, c)) { if (s.key !== 'rt') c.queue[s.key] = 0; c.used = { key: s.hold ? 'rth' : s.key, t: b.time }; }
  }
}
// (a held RT on its way to a hold skill doesn't also fire the tap skill once past the hold)
const rtHeldFor = (sk, c) => { const h = holdSkill(sk); return !!h && c.rtT >= h.hold; };

// the skill bar for the HUD: X, RT (and RT held), LB, RB
export function skillBar(u) {
  const k = u.kind, w = u.def.weapon, list = skillsOf(u) || [];
  if (!list.length && !k?.basic) return null;
  const cool = Math.max(0, u.cooldown || 0), cmax = Math.max(0.1, w.cooldown || 1);
  const out = [{ key: 'x', name: k.basic || 'Attack', icon: '', left: cool, max: cmax, ready: !(cool > 0) }];
  const tile = (key, s) => { const st = skillState(u, s); return { key, name: s.name, icon: s.icon || '', left: st.left, max: st.max, ready: st.ready, why: st.why }; };
  const rs = rtSkill(list), hs = holdSkill(list);
  if (rs) out.push(tile('rt', rs));
  else if (rangedBasic(u)) out.push({ key: 'rt', name: k.ranged || 'Shoot', icon: '', left: cool, max: cmax, ready: !(cool > 0) });
  if (hs) out.push(tile('rth', hs));
  for (const key of ['lb', 'rb']) { const s = list.find((x) => x.key === key); if (s) out.push(tile(key, s)); }
  const c = u.control, t = u.battle.time;
  if (c?.denied && t - c.denied.t < 0.8) { const d = out.find((x) => x.key === c.denied.key); if (d) d.denied = c.denied.why; }
  if (c?.used && t - c.used.t < 0.4) { const d = out.find((x) => x.key === c.used.key); if (d) d.flash = true; }
  return out;
}
