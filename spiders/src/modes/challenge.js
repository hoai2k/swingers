// TRIALS ("Gauntlet of Webs"): tiered challenges built on SurvivalMode.
//
// 6 tiers x 3 trials. Each trial is 3 waves (one survival stage) on a fixed
// board with a premise: a forced weapon (only it drops, everyone starts each
// wave holding it) or a weapon pool, and/or rules (low gravity, no webs, a
// per-wave time limit, a restricted insect roster, armored or frenzied
// insects, a bigger swarm, a boss finale). Every player has ONE life.
// Clearing a trial unlocks the next one in its tier; clearing a whole tier
// unlocks the next tier. Progress lives in localStorage (guarded).
//
// opts: { index: trial index into TRIALS }
// Results: cleared -> A next trial / B lobby; failed -> A retry / B lobby.

import { SurvivalMode, ROSTER, WAVES_PER_STAGE } from './survival.js';
import { sfx } from '../audio.js';
import { W, H } from '../board.js';
import { pick } from '../util.js';
import { text, drawBanner, drawPanel } from '../hud.js';

export const TIERS = [
  { name: 'Hatchling', color: '#8fe8a0' },
  { name: 'Webling', color: '#5ad1ff' },
  { name: 'Hunter', color: '#ffd23f' },
  { name: 'Stalker', color: '#ff9a3c' },
  { name: 'Widow', color: '#ff5a7a' },
  { name: 'Matriarch', color: '#c46bff' },
];

// rules: weapon (forced) | pool (weapon ids) | lowGrav | noWeb | timeLimit (s per wave)
//        roster (insect ids) | armored (plates on every insect) | frenzy | swarm (budget x) | boss (wave 3)
export const TRIALS = [
  { id: 'first-bite',   tier: 1, name: 'First Bite',    board: 'canopy',     weapon: 'saber',       premise: 'Plasma Sabers only. Learn the swing.' },
  { id: 'pop-shots',    tier: 1, name: 'Pop Shots',     board: 'hollow',     weapon: 'pistol',      premise: 'Laser Pistols only. Aim before you leap.' },
  { id: 'gnat-storm',   tier: 1, name: 'Gnat Storm',    board: 'sweets',     roster: ['gnatling'], swarm: 1.6, premise: 'Nothing but Gnatlings, and lots of them.' },

  { id: 'moonwalk',     tier: 2, name: 'Moonwalk',      board: 'skyway',     lowGrav: true,         premise: 'Low gravity. Float, swing, survive.' },
  { id: 'grounded',     tier: 2, name: 'Grounded',      board: 'caldera',    noWeb: true,           premise: 'No webs. Walk the walls and jump.' },
  { id: 'boom-town',    tier: 2, name: 'Boom Town',     board: 'foundry',    pool: ['grenade', 'rocket', 'mines'], premise: 'Explosives only. Keep your distance.' },

  { id: 'clockwork',    tier: 3, name: 'Clockwork',     board: 'glasshouse', timeLimit: 50,         premise: 'Clear every wave within 50 seconds.' },
  { id: 'twin-fang',    tier: 3, name: 'Twin Fang',     board: 'glacier',    weapon: 'twinsaber', frenzy: true, premise: 'Twin Sabers against a frenzied swarm.' },
  { id: 'rail-line',    tier: 3, name: 'Rail Line',     board: 'dunes',      weapon: 'railgun', roster: ['shellback', 'stinglet', 'buzzgunner'], premise: 'Rail Lances vs Shellbacks. Line them up.' },

  { id: 'iron-swarm',   tier: 4, name: 'Iron Swarm',    board: 'hollow',     armored: 1,            premise: 'Every insect wears an armor plate.' },
  { id: 'bladestorm',   tier: 4, name: 'Bladestorm',    board: 'storm',      pool: ['saber', 'twinsaber', 'glaive'], roster: ['bladewing', 'stinglet', 'gnatling'], premise: 'Blades only, and the Bladewings know it.' },
  { id: 'zero-g',       tier: 4, name: 'Zero-G Gunner', board: 'skyway',     weapon: 'minigun', lowGrav: true, premise: 'Low gravity and a Hornet Gatling. Mind the recoil.' },

  { id: 'earthbound',   tier: 5, name: 'Earthbound',    board: 'canopy',     noWeb: true, frenzy: true, premise: 'No webs, and the swarm is in a frenzy.' },
  { id: 'coil-crew',    tier: 5, name: 'Coil Crew',     board: 'foundry',    weapon: 'tesla', swarm: 1.4, timeLimit: 60, premise: 'Arc Coils vs a big swarm. 60 s per wave.' },
  { id: 'brood-mother', tier: 5, name: 'Brood Mother',  board: 'caldera',    boss: true,            premise: 'Survive two waves, then face the Brood Tyrant.' },

  { id: 'void-walk',    tier: 6, name: 'Void Walk',     board: 'sweets',     weapon: 'singularity', lowGrav: true, premise: 'Void Lobbers only, in low gravity.' },
  { id: 'last-light',   tier: 6, name: 'Last Light',    board: 'storm',      weapon: 'saber', armored: 1, frenzy: true, premise: 'Sabers vs an armored, frenzied swarm.' },
  { id: 'crown-of-webs', tier: 6, name: 'Crown of Webs', board: 'glasshouse', boss: true, armored: 1, timeLimit: 75, premise: 'Armored swarm, a Tyrant finale, 75 s per wave.' },
];

// the rule chips shown on the picker
export function trialTags(T) {
  const out = [];
  const wname = (id) => ({ saber: 'Saber', pistol: 'Pistol', twinsaber: 'Twin Saber', railgun: 'Rail Lance', minigun: 'Gatling', tesla: 'Arc Coil', singularity: 'Void Lobber' }[id] || id);
  if (T.weapon) out.push(wname(T.weapon) + ' only');
  if (T.pool) out.push(T.pool.every((id) => ['saber', 'twinsaber', 'glaive'].includes(id)) ? 'Blades only' : 'Explosives only');
  if (T.lowGrav) out.push('Low gravity');
  if (T.noWeb) out.push('No webs');
  if (T.timeLimit) out.push(`${T.timeLimit}s / wave`);
  if (T.armored) out.push('Armored');
  if (T.frenzy) out.push('Frenzy');
  if (T.swarm) out.push('Big swarm');
  if (T.boss) out.push('Boss');
  out.push('1 life');
  return out;
}

// ---- progress (guarded storage) -----------------------------------------------
const KEY = 'spiders.trials.v1';
export function loadTrials() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
    return { cleared: d.cleared || {}, sel: clampIdx(d.sel | 0) };
  } catch (e) { return { cleared: {}, sel: 0 }; }
}
function saveTrials(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* not persisted */ } }
const clampIdx = (i) => Math.max(0, Math.min(TRIALS.length - 1, i | 0));
export function setTrialSel(i) { const d = loadTrials(); d.sel = clampIdx(i); saveTrials(d); }
export function trialCleared(i, d = loadTrials()) { return !!(TRIALS[i] && d.cleared[TRIALS[i].id]); }
export function tierUnlocked(tier, d = loadTrials()) {
  if (tier <= 1) return true;
  return TRIALS.filter((T) => T.tier === tier - 1).every((T) => d.cleared[T.id]);
}
// a tier is open once the previous tier is complete; inside it, in order
export function trialUnlocked(i, d = loadTrials()) {
  const T = TRIALS[i];
  if (!T || !tierUnlocked(T.tier, d)) return false;
  const prev = TRIALS[i - 1];
  return !prev || prev.tier !== T.tier || !!d.cleared[prev.id];
}
export function trialNumber(i) { const T = TRIALS[i]; return `${T.tier}-${TRIALS.filter((q, j) => q.tier === T.tier && j <= i).length}`; }

// ---------------------------------------------------------------------------------
export class ChallengeMode extends SurvivalMode {
  constructor(game, opts = {}) {
    const index = clampIdx(opts.index);
    const T = TRIALS[index];
    super(game, { board: T.board });
    this.name = 'challenge';
    this.index = index;
    this.trial = T;
    this.pausable = true;
    this.startLives = 1;
    this.lifeCap = 1;
    this.recordBest = false;
    this.dropRate = 'normal';
    this.useMods = false;      // a trial's rules are fixed
    this.unlockedNow = null;   // what clearing it opened
  }

  get friendlyFire() { return false; }
  canPause() { return super.canPause() && this.state !== 'won'; }

  // ---- rules ---------------------------------------------------------------------
  get pool() { return this.trial.weapon ? [this.trial.weapon] : this.trial.pool || null; }
  level(w) { return w + 2 * (this.trial.tier - 1); }
  get stageLevel() { return 1 + Math.floor((this.trial.tier - 1) / 2); }
  bossOn(w) { return !!this.trial.boss && w % WAVES_PER_STAGE === 0; }
  budgetMul() { return (this.trial.swarm || 1) * 0.6; }   // fewer, bigger insects (as survival)

  rosterFor(w) {
    if (!this.trial.roster) return super.rosterFor(w);
    return { unlocked: ROSTER.filter((e) => this.trial.roster.includes(e.C.id)), fresh: [] };
  }

  setupDrops() {
    const pool = this.pool;
    if (pool) this.drops.nextId = () => pick(pool);
  }

  enemyDropId() { const pool = this.pool; return pool ? pick(pool) : null; }

  loadout(sp) {
    const pool = this.pool;
    if (!pool || (sp.weapon && pool.includes(sp.weapon.id))) return;
    if (sp.weapon) sp.dropWeapon(0, -200);
    const w = this.game.createWeapon(pick(pool));
    if (w) sp.giveWeapon(w);
  }

  applyRules(sp) {
    if (this.trial.lowGrav) sp.gravMul = 0.55;
    if (this.trial.noWeb) { sp.noWeb = true; sp.web = null; }
  }

  scaleEnemy(e, boss) {
    super.scaleEnemy(e, boss);
    if (this.trial.armored && !boss) e.armor = Math.max(e.armor || 0, this.trial.armored);
    if (this.trial.frenzy) e.agg = (e.agg || 1) * 1.35;
  }

  // ---- flow ------------------------------------------------------------------------
  afterStage() {
    // the trial's 3 waves are done: record it
    const d = loadTrials();
    const before = TRIALS.map((_, i) => trialUnlocked(i, d));
    d.cleared[this.trial.id] = true;
    const after = TRIALS.map((_, i) => trialUnlocked(i, d));
    const fresh = TRIALS.map((T, i) => (after[i] && !before[i] ? i : -1)).filter((i) => i >= 0);
    this.unlockedNow = fresh.length ? fresh[0] : null;
    if (this.unlockedNow !== null) d.sel = this.unlockedNow;
    saveTrials(d);
    this.state = 'won'; this.t = 0;
    sfx.win();
    this.game.music.setDuck(0.5);
  }

  get nextIndex() {
    const d = loadTrials();
    if (this.unlockedNow !== null) return this.unlockedNow;
    for (let i = this.index + 1; i < TRIALS.length; i++) if (trialUnlocked(i, d)) return i;
    return null;
  }

  update(dt, realDt) {
    const game = this.game;
    if (this.state === 'over' || this.state === 'won') {
      this.t += realDt;
      if (!game.players.length && this.t > 1) { game.go('lobby'); return; }
      if (this.t < 1.2) return;
      for (const p of game.players) {
        const s = game.input.get(p.inputId);
        if (!s) continue;
        if (s.pressed.b || s.pressed.back) { game.go('lobby'); return; }
        if (s.pressed.a || s.pressed.start) {
          if (this.state === 'over') { game.go('challenge', { index: this.index }); return; }
          const n = this.nextIndex;
          if (n !== null) { setTrialSel(n); game.go('challenge', { index: n }); } else game.go('lobby');
          return;
        }
      }
      return;
    }
    super.update(dt, realDt);
    const lim = this.trial.timeLimit;
    if (lim && this.state === 'wave' && this.waveT > lim) {
      this.state = 'lost'; this.t = 0;
      this.lostReason = "TIME'S UP";
      sfx.lose();
      game.music.setDuck(0.4);
    }
  }

  // ---- drawing ---------------------------------------------------------------------
  pillLabel() { return `TRIAL ${trialNumber(this.index)} · WAVE ${this.waveInStage}/${WAVES_PER_STAGE}`; }
  pillSub() {
    let s = super.pillSub();
    const lim = this.trial.timeLimit;
    if (lim && this.state === 'wave') {
      const left = Math.max(0, Math.ceil(lim - (this.waveT || 0)));
      s = `${s} · ⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    }
    return s;
  }

  breakBanner() {
    const T = this.trial, tier = TIERS[T.tier - 1];
    if (this.waveInStage === 1) return { title: T.name.toUpperCase(), sub: `${tier.name} trial ${trialNumber(this.index)} · ${T.premise}`, color: tier.color };
    const b = super.breakBanner();
    b.title = `WAVE ${this.waveInStage}/${WAVES_PER_STAGE}${this.isBossWave ? ' · BOSS' : ''}`;
    return b;
  }

  clearBanner() {
    if (this.stageEnd) return { title: 'TRIAL COMPLETE', sub: this.trial.name, color: '#4fdc6a' };
    return super.clearBanner();
  }

  drawStatus(ctx) {
    super.drawStatus(ctx);
    // premise chips under the pill
    const tags = trialTags(this.trial).join('  ·  ');
    text(ctx, tags, W / 2, 100, { size: 18, color: '#e4e8ff', sw: 4 });
    const lim = this.trial.timeLimit;
    if (lim && this.state === 'wave' && lim - this.waveT < 10) {
      const k = Math.max(0, lim - this.waveT);
      text(ctx, `${Math.ceil(k)}`, W / 2, 190, { size: 90, color: '#ff5a7a', sw: 10 });
    }
  }

  drawResults(ctx) {
    const T = this.trial, tier = TIERS[T.tier - 1];
    ctx.fillStyle = 'rgba(4,3,14,0.6)';
    ctx.fillRect(0, 0, W, H);
    const k = Math.min(1, this.t * 2);
    if (this.state === 'won') {
      drawBanner(ctx, 'TRIAL CLEARED', `${tier.name} ${trialNumber(this.index)} · ${T.name}`, k, '#4fdc6a');
      let msg, col = '#ffd23f';
      if (this.unlockedNow !== null) {
        const U = TRIALS[this.unlockedNow];
        msg = U.tier !== T.tier ? `New tier unlocked: ${TIERS[U.tier - 1].name} — ${U.name}` : `Unlocked: ${U.name}`;
      } else if (TRIALS.every((q, i) => trialCleared(i))) { msg = 'Every trial cleared. The Gauntlet of Webs is yours!'; col = '#c46bff'; }
      else msg = 'Already cleared before: no new unlock';
      drawPanel(ctx, W / 2 - 430, 330, 860, 80, { r: 24, fill: 'rgba(10,8,26,0.88)', accent: col });
      this.drawLock(ctx, W / 2 - 380, 370, 22, col, this.unlockedNow !== null);
      text(ctx, msg, W / 2 + 20, 382, { size: 30, color: col, sw: 5, maxWidth: 740 });
      const end = this.drawPlayerTable(ctx, 440);
      if (this.t > 1.2) {
        const n = this.nextIndex;
        text(ctx, n !== null ? `A: next trial (${TRIALS[n].name})   ·   B: lobby` : 'A / B: back to the lobby', W / 2, end + 56, { size: 30, color: '#e4e8ff' });
      }
    } else {
      drawBanner(ctx, 'TRIAL FAILED', `${T.name}${this.lostReason ? ' · ' + this.lostReason.toLowerCase() : ''} · reached wave ${this.waveInStage}/${WAVES_PER_STAGE}`, k, '#ff5a7a');
      const end = this.drawPlayerTable(ctx, 340);
      if (this.t > 1.2) text(ctx, 'A: retry   ·   B: lobby', W / 2, end + 56, { size: 32, color: '#e4e8ff' });
    }
  }

  // a padlock, open when `open`
  drawLock(ctx, x, y, s, color, open = false) { drawLock(ctx, x, y, s, color, open); }
}

export function drawLock(ctx, x, y, s, color, open = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = s * 0.22; ctx.lineCap = 'round';
  ctx.beginPath();
  if (open) { ctx.arc(-s * 0.55, -s * 0.35, s * 0.42, Math.PI, 0); ctx.lineTo(-s * 0.13, -s * 0.05); }
  else { ctx.arc(0, -s * 0.35, s * 0.42, Math.PI, 0); ctx.lineTo(s * 0.42, 0); ctx.moveTo(-s * 0.42, -s * 0.35); ctx.lineTo(-s * 0.42, 0); }
  ctx.stroke();
  ctx.beginPath(); ctx.roundRect(-s * 0.62, -s * 0.05, s * 1.24, s * 0.95, s * 0.18); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath(); ctx.arc(0, s * 0.35, s * 0.14, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
