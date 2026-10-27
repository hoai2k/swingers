// Simulation: ready-made battles to watch. Real battles from history, Jujutsu Kaisen
// fights (Sorcerers vs Curses, Shibuya, the Culling Game...), Avatar, sci-fi, games and
// crossovers. Picking one loads its map and both armies into a 1-player sandbox (the
// player's own sandbox armies are parked meanwhile, like the campaign's), and either
// starts the battle at once or opens setup to change the armies first.
//
// scenario = { id, cat, name, when (a short subtitle), map (world.js map id), desc,
//              sides: [blue, red] } with side = { name, army(k) -> [{type, d, z}] }
// d is the distance from the middle line (3..42, grows away from the enemy) and z runs
// across the field (-32..32); Blue stands at x = -d, Red at x = +d. k is the army size
// (Small 0.5, Normal 1, Epic 2): crowds (line/block) scale with it, heroes (one) don't.
// Unit ids that don't exist are skipped, so a scenario survives a removed unit.
import { UNIT_BY_ID, UNITS, FACTIONS, unitsOfFaction } from './units.js';
import { EXT } from './ext.js';

export const SIM_CATS = [
  { id: 'history', name: 'Real battles', color: '#c98a4b' },
  { id: 'jjk', name: 'Jujutsu Kaisen', color: '#5b5fc7' },
  { id: 'avatar', name: 'Avatar', color: '#e0703a' },
  { id: 'other', name: 'Sci-fi & games', color: '#3fae8f' },
  { id: 'cross', name: 'Crossovers', color: '#c66bd1' },
];
export const SIM_SIZES = [{ name: 'Small', k: 0.5 }, { name: 'Normal', k: 1 }, { name: 'Epic', k: 2 }];

// ---- formation helpers (k scales the crowd; heroes stay one)
const SP = 1.9;
const scaled = (n, k) => Math.max(1, Math.round(n * k));
// n across the field centred on z, at depth d
const line = (type, n, d, z = 0, sp = SP) => (k) => {
  const m = scaled(n, k);
  return Array.from({ length: m }, (_, i) => ({ type, d, z: z + (i - (m - 1) / 2) * sp }));
};
// cols across × rows deep (the rows scale), front row at d
const block = (type, cols, rows, d, z = 0, sp = SP) => (k) => {
  const out = [];
  for (let r = 0; r < scaled(rows, k); r++) out.push(...line(type, cols, d + r * sp, z, sp)(1));
  return out;
};
const one = (type, d, z = 0) => () => [{ type, d, z }];
// heroes in a row (one each), centred on z
const heroes = (types, d, z = 0, sp = 3) => () => types.map((type, i) => ({ type, d, z: z + (i - (types.length - 1) / 2) * sp }));
const army = (...parts) => (k) => parts.flatMap((p) => p(k));

// ---- Jujutsu Kaisen: every sorcerer against every curse (one of each, from `side` on
// the unit), front line first: the toughest in front, casters at the back
export const jjkSide = (side) => UNITS.filter((d) => d.faction === 'jjk' && d.side === side);
function everyone(side, extra = null) {
  return (k) => {
    const defs = jjkSide(side).filter((d) => d.cost > 50);
    const melee = (d) => d.weapon.kind === 'melee' || !!EXT.kinds[d.weapon.kind]?.melee || !(d.weapon.range > 8);
    const front = defs.filter(melee).sort((a, b) => b.hp - a.hp);
    const back = defs.filter((d) => !front.includes(d)).sort((a, b) => b.hp - a.hp);
    const out = [];
    const rows = (list, d0) => {
      const per = 7;
      list.forEach((d, i) => {
        const row = Math.floor(i / per), inRow = Math.min(per, list.length - row * per), j = i % per;
        out.push({ type: d.id, d: d0 + row * 4, z: (j - (inRow - 1) / 2) * 4.2 });
      });
      return d0 + Math.ceil(list.length / per) * 4;
    };
    const d1 = rows(front, 8);
    rows(back, d1 + 1);
    if (extra) out.push(...extra(k));
    return out;
  };
}
// a random war: two factions, the same gold each (generated every time it's picked)
function randomSide(t) {
  return (k, seed) => {
    const facs = FACTIONS.filter((f) => f.id !== 'custom' && unitsOfFaction(f.id).length >= 3);
    const pick = facs[Math.floor(seed[t] * facs.length) % facs.length];
    const pool = unitsOfFaction(pick.id).filter((d) => d.cost > 0 && d.cost <= 2200);
    let left = 4500 * k;
    const n = new Map();
    let rnd = seed[t] * 9301 + 49297;
    const next = () => ((rnd = (rnd * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 300 && left > 0; i++) {
      const ok = pool.filter((d) => d.cost <= left);
      if (!ok.length) break;
      // cheap units come in numbers
      const d = ok[Math.floor(next() * ok.length)];
      if (d.cost > 800 && next() < 0.6) continue;
      n.set(d, (n.get(d) || 0) + 1);
      left -= d.cost;
    }
    const out = [];
    let d = 8;
    const order = [...n.keys()].sort((a, b) => (a.weapon.kind === 'melee' ? 0 : 1) - (b.weapon.kind === 'melee' ? 0 : 1) || b.hp - a.hp);
    for (const def of order) {
      const cnt = n.get(def), sp = def.cost >= 1000 ? 4.5 : 2.2, per = Math.max(1, Math.min(cnt, Math.floor(56 / sp)));
      for (let i = 0; i < cnt; i++) {
        const r = Math.floor(i / per), inRow = Math.min(per, cnt - r * per);
        out.push({ type: def.id, d: d + r * sp, z: ((i % per) - (inRow - 1) / 2) * sp });
      }
      d += Math.ceil(cnt / per) * sp + 1;
      if (d > 40) d = 40;
    }
    out.facName = pick.name;
    return out;
  };
}

export const SCENARIOS = [
  // ---------------------------------------------------------------- real battles
  {
    id: 'thermopylae', cat: 'history', name: 'Thermopylae', when: '480 BC · Greco-Persian Wars', map: 'canyon',
    desc: 'King Leonidas and his Greeks hold the narrow pass against the vast army of Xerxes. Can the phalanx hold against wave after wave of Persians and their Immortals?',
    sides: [
      { name: 'Spartans & Greeks', army: army(block('an_hoplite', 10, 4, 5, 0, 1.7), line('an_sarissa', 8, 12, 0, 2), line('an_snake_archer', 6, 16, 0, 2.5)) },
      { name: 'Persian Empire', army: army(block('squire', 12, 3, 7), line('knight', 2, 14, 0, 4), line('sm_cavalry', 1, 18, -16), line('sm_cavalry', 1, 18, 16), line('archer', 10, 20, 0, 2.2)) },
    ],
  },
  {
    id: 'cannae', cat: 'history', name: 'Cannae', when: '216 BC · Second Punic War', map: 'desert',
    desc: "Hannibal's thin centre bends back while his cavalry swings round both flanks: the most famous double envelopment in history. Rome brought twice the men.",
    sides: [
      { name: 'Carthage (Hannibal)', army: army(line('an_gladiator', 10, 6, 0, 2), block('an_hoplite', 4, 3, 7, -16), block('an_hoplite', 4, 3, 7, 16), line('sm_cavalry', 4, 10, -26, 2.5), line('sm_cavalry', 4, 10, 26, 2.5), line('spear_thrower', 10, 13, 0, 2.2), one('chieftain', 16)) },
      { name: 'Roman Republic', army: army(block('squire', 12, 3, 6, 0, 1.8), line('spear_thrower', 12, 4.5, 0, 1.8), line('an_hoplite', 10, 13, 0, 1.8), line('sm_cavalry', 3, 10, -22, 2.5), line('sm_cavalry', 3, 10, 22, 2.5)) },
    ],
  },
  {
    id: 'hastings', cat: 'history', name: 'Hastings', when: '1066 · Norman Conquest', map: 'autumn',
    desc: "King Harold's shield wall on the ridge against William of Normandy's archers and mounted knights. One arrow decided the day. Will it again?",
    sides: [
      { name: 'Anglo-Saxons (Harold)', army: army(block('squire', 12, 3, 5, 0, 1.7), line('vk_raider', 12, 11, 0, 2), line('archer', 6, 14, 0, 3), one('vk_jarl', 16)) },
      { name: 'Normans (William)', army: army(line('squire', 10, 7), block('archer', 8, 2, 11, 0, 2.2), line('sm_cavalry', 1, 16, -14), line('sm_cavalry', 1, 16, 14), line('knight', 2, 16, 0, 3), one('king', 21)) },
    ],
  },
  {
    id: 'stamford', cat: 'history', name: 'Stamford Bridge', when: '1066 · the end of the Viking Age', map: 'river',
    desc: 'Harald Hardrada\'s Norwegians are caught by surprise at the river. A lone giant Viking held the bridge for a while... the English still have to cross.',
    sides: [
      { name: 'English (Harold)', army: army(block('squire', 12, 3, 8), line('archer', 10, 15, 0, 2.5), line('knight', 4, 18, 0, 3), one('king', 21)) },
      { name: 'Norwegian Vikings', army: army(block('vk_raider', 8, 2, 6), line('vk_brawler', 8, 10, 0, 2.2), line('vk_headbutter', 6, 12, 0, 2.5), line('vk_ice_archer', 8, 16, 0, 2.5), one('vk_jarl', 19)) },
    ],
  },
  {
    id: 'agincourt', cat: 'history', name: 'Agincourt', when: '1415 · Hundred Years\' War', map: 'autumn',
    desc: "Henry V's tired English, mostly longbowmen, against the flower of French chivalry charging through the mud. Arrows against armour.",
    sides: [
      { name: 'English (Henry V)', army: army(line('squire', 10, 6), block('archer', 12, 3, 9, 0, 2.1), line('knight', 3, 16, 0, 3), one('king', 18)) },
      { name: 'French Knights', army: army(line('knight', 6, 6, 0, 2.4), line('sm_cavalry', 2, 9, -18, 3), line('sm_cavalry', 2, 9, 18, 3), block('squire', 10, 2, 11), line('archer', 4, 17, 0, 3)) },
    ],
  },
  {
    id: 'sekigahara', cat: 'history', name: 'Sekigahara', when: '1600 · the unification of Japan', map: 'grass',
    desc: 'Tokugawa Ieyasu against Ishida Mitsunari in the fog: the battle that decided who would rule Japan for 250 years.',
    sides: [
      { name: 'Eastern Army (Tokugawa)', army: army(block('dy_samurai', 8, 2, 6), line('dy_ninja', 8, 11, 0, 2.5), line('dy_firework', 4, 16, 0, 4), line('dy_hwacha', 2, 20, 0, 8)) },
      { name: 'Western Army (Ishida)', army: army(line('dy_monk', 10, 5), block('dy_samurai', 8, 2, 10), line('dy_firework', 4, 16, 0, 4), line('dy_hwacha', 2, 20, 0, 8)) },
    ],
  },
  {
    id: 'nassau', cat: 'history', name: 'The Republic of Pirates', when: '1718 · Nassau', map: 'cove',
    desc: 'The Royal Navy comes to clear the pirates out of Nassau. Blackbeard\'s crews have cannons, bombs, harpoons and a monkey.',
    sides: [
      { name: 'Royal Navy', army: army(block('rn_musketeer', 10, 2, 7), line('rn_halberd', 8, 5, 0, 2.2), line('rn_fencer', 4, 12, 0, 3), line('pi_cannon', 2, 18, 0, 8)) },
      { name: 'Pirates', army: army(line('pi_harpooner', 8, 6, 0, 2.2), line('pi_flintlock', 10, 9, 0, 2.2), line('pi_bomb', 6, 12, 0, 2.5), line('pi_monkey', 3, 5, 0, 4), one('pi_captain', 14), one('pi_queen', 17), line('pi_cannon', 2, 20, 0, 8)) },
    ],
  },
  {
    id: 'waterloo', cat: 'history', name: 'Waterloo', when: '1815 · the Hundred Days', map: 'grass',
    desc: "Napoleon's last battle: French cavalry charges against Wellington's musket squares, with the guns thundering behind.",
    sides: [
      { name: 'Coalition (Wellington)', army: army(block('rn_musketeer', 10, 3, 7), line('rn_halberd', 8, 5, 0, 2.2), line('sm_cavalry', 4, 13, 0, 3), line('pi_cannon', 3, 18, 0, 7)) },
      { name: 'French Empire (Napoleon)', army: army(line('sm_cavalry', 4, 8, -12, 2.6), line('sm_cavalry', 4, 8, 12, 2.6), block('rn_musketeer', 10, 2, 10), line('pi_cannon', 3, 20, 0, 7)) },
    ],
  },
  {
    id: 'bighorn', cat: 'history', name: 'Little Bighorn', when: '1876 · Custer\'s Last Stand', map: 'canyon',
    desc: "Custer's 7th Cavalry rides into the largest gathering of Lakota and Cheyenne warriors ever seen. Revolvers and rifles against numbers and courage.",
    sides: [
      { name: '7th Cavalry (Custer)', army: army(block('ww_gunslinger', 11, 2, 7, 0, 2.2), line('ww_quickdraw', 6, 10, 0, 2.5), line('ww_blunderbuss', 4, 12, 0, 3), one('ww_dynamite', 14)) },
      { name: 'Lakota & Cheyenne', army: army(block('clubber', 12, 2, 6), line('protector', 10, 4.5, 0, 2), line('spear_thrower', 10, 12, 0, 2.2), line('tb_stoner', 6, 17, 0, 3), heroes(['chieftain', 'chieftain'], 9, 0, 16)) },
    ],
  },
  // ---------------------------------------------------------------- Jujutsu Kaisen
  {
    id: 'jjk_war', cat: 'jjk', name: 'Sorcerers vs Curses', when: 'every sorcerer against every curse', map: 'shibuya',
    desc: 'One of every jujutsu sorcerer against one of every curse and curse user, each side worth about the same. Who wins the war between the sorcerers and the curses?',
    sides: [
      { name: 'Jujutsu Sorcerers', army: everyone('sorcerer') },
      { name: 'Curses', army: everyone('curse', line('jk_flyhead', 12, 30, 0, 2.2)) },
    ],
  },
  {
    id: 'shibuya', cat: 'jjk', name: 'The Shibuya Incident', when: 'October 31st, 2018', map: 'shibuya',
    desc: 'The curses take Shibuya on Halloween night. Gojo walks in alone... and Geto (Kenjaku) has brought the Prison Realm.',
    sides: [
      { name: 'Tokyo Jujutsu High', army: army(heroes(['jk_yuji', 'jk_megumi', 'jk_nobara', 'jk_nanami', 'jk_maki', 'jk_todo'], 8, 0, 3.5), heroes(['jk_meimei', 'jk_kusakabe', 'jk_naoya'], 13, 0, 4.5), one('jk_gojo', 18)) },
      { name: 'The Curses', army: army(heroes(['jk_jogo', 'jk_hanami', 'jk_dagon', 'jk_mahito', 'jk_choso'], 9, 0, 4), heroes(['jk_eso', 'jk_kechizu', 'jk_grasshopper'], 6, 0, 5), one('jk_geto', 15), block('jk_flyhead', 10, 2, 4, 0, 2), one('jk_smallpox', 20)) },
    ],
  },
  {
    id: 'shinjuku', cat: 'jjk', name: 'The Shinjuku Showdown', when: 'Gojo vs Sukuna', map: 'shibuya',
    desc: 'The strongest sorcerer of today against the strongest sorcerer in history. Sukuna has Mahoraga turning its wheel. Throughout heaven and earth...',
    sides: [
      { name: 'Satoru Gojo', army: one('jk_gojo', 8) },
      { name: 'Ryomen Sukuna', army: army(one('jk_sukuna', 8), one('jk_mahoraga', 12, 6)) },
    ],
  },
  {
    id: 'sendai', cat: 'jjk', name: 'Culling Game: Sendai', when: 'Yuta vs the Sendai Colony', map: 'grass',
    desc: 'The Sendai Colony was a four-way deadlock between Ryu Ishigori, Takako Uro, Kurourushi and Dhruv. Then Yuta Okkotsu walked in. Can he take Ryu, Uro and Kurourushi at once?',
    sides: [
      { name: 'Yuta Okkotsu', army: one('jk_yuta', 8) },
      { name: 'Sendai Colony', army: heroes(['jk_ryu', 'jk_uro', 'jk_kurourushi'], 10, 0, 5) },
    ],
  },
  {
    id: 'sendai_ffa', cat: 'jjk', name: 'Sendai Deadlock', when: 'Ryu & Uro vs Kurourushi\'s swarm', map: 'grass',
    desc: 'Before Yuta came: the reincarnated sorcerers Ryu and Uro against the cockroach curse Kurourushi and its endless swarm.',
    sides: [
      { name: 'Ryu & Uro', army: heroes(['jk_ryu', 'jk_uro'], 8, 0, 5) },
      { name: 'Kurourushi', army: army(one('jk_kurourushi', 9), line('jk_grasshopper', 4, 6, 0, 3)) },
    ],
  },
  {
    id: 'hakari_kashimo', cat: 'jjk', name: 'Tokyo No. 2: Hakari vs Kashimo', when: 'Culling Game', map: 'shibuya',
    desc: 'The man who lives for the gamble against the man who has waited 400 years for a real fight. Jackpot or lightning?',
    sides: [
      { name: 'Kinji Hakari', army: one('jk_hakari', 8) },
      { name: 'Hajime Kashimo', army: one('jk_kashimo', 8) },
    ],
  },
  {
    id: 'trial', cat: 'jjk', name: 'The Trial', when: 'Yuji vs Higuruma', map: 'grass',
    desc: 'Yuji Itadori stands trial in Deadly Sentencing. Judgeman will read out the charges. Guilty?',
    sides: [
      { name: 'Yuji Itadori', army: one('jk_yuji', 7) },
      { name: 'Hiromi Higuruma', army: one('jk_higuruma', 7) },
    ],
  },
  {
    id: 'goodwill', cat: 'jjk', name: 'Kyoto Goodwill Event', when: 'Tokyo vs Kyoto (and an uninvited guest)', map: 'autumn',
    desc: "The sister-school exchange event in the forest: Tokyo's first and second years against Kyoto's. Then Hanami crashes the party.",
    sides: [
      { name: 'Tokyo Jujutsu High', army: heroes(['jk_yuji', 'jk_megumi', 'jk_nobara', 'jk_maki', 'jk_panda', 'jk_inumaki'], 8, 0, 3.5) },
      { name: 'Kyoto Jujutsu High', army: army(heroes(['jk_todo', 'jk_kamo', 'jk_mechamaru'], 8, 0, 4), one('jk_hanami', 16)) },
    ],
  },
  {
    id: 'deathpainting', cat: 'jjk', name: 'The Death Painting Arc', when: 'Yuji & Nobara vs Eso & Kechizu', map: 'grass',
    desc: 'Two of the Death Painting brothers come for Yuji and Nobara. Their blood rots. Black Flash and Resonance answer.',
    sides: [
      { name: 'Yuji & Nobara', army: heroes(['jk_yuji', 'jk_nobara'], 6, 0, 3) },
      { name: 'Eso & Kechizu', army: heroes(['jk_eso', 'jk_kechizu'], 6, 0, 3) },
    ],
  },
  {
    id: 'detention', cat: 'jjk', name: 'The Detention Centre', when: 'the first special grade', map: 'grass',
    desc: 'Three first-years sent in against a curse that ate one of Sukuna\'s fingers. Nobody told them it was special grade.',
    sides: [
      { name: 'Yuji, Megumi & Nobara', army: heroes(['jk_yuji', 'jk_megumi', 'jk_nobara'], 7, 0, 3) },
      { name: 'Finger Bearer', army: one('jk_fingerbearer', 8) },
    ],
  },
  {
    id: 'hidden', cat: 'jjk', name: 'Hidden Inventory', when: 'Toji vs Gojo & Geto', map: 'grass',
    desc: 'Toji Fushiguro, the Sorcerer Killer, takes the contract on the Star Plasma Vessel. Between him and her: the two strongest students of their year.',
    sides: [
      { name: 'Gojo & Geto', army: heroes(['jk_gojo', 'jk_geto'], 7, 0, 4) },
      { name: 'Toji Fushiguro', army: army(one('jk_toji', 8), line('jk_flyhead', 6, 14, 0, 2)) },
    ],
  },
  {
    id: 'kenjaku', cat: 'jjk', name: 'Yuki & Choso vs Kenjaku', when: 'the battle at Jujutsu High', map: 'grass',
    desc: 'The special grade Yuki Tsukumo and Choso against the thousand-year-old Kenjaku, Uraume, and the curses Kenjaku keeps: the Smallpox Deity and the Rainbow Dragon.',
    sides: [
      { name: 'Yuki & Choso', army: heroes(['jk_yuki', 'jk_choso'], 7, 0, 4) },
      { name: 'Kenjaku', army: army(heroes(['jk_geto', 'jk_uraume'], 10, 0, 4), heroes(['jk_smallpox', 'jk_rainbowdragon'], 15, 0, 7)) },
    ],
  },
  {
    id: 'nahidwin', cat: 'jjk', name: "Nah, I'd Win", when: 'Gojo vs every curse', map: 'shibuya',
    desc: 'The strongest alone against every curse and curse user there is. He said he would win.',
    sides: [
      { name: 'Satoru Gojo', army: one('jk_gojo', 6) },
      { name: 'Every curse', army: everyone('curse') },
    ],
  },
  // ---------------------------------------------------------------- Avatar
  {
    id: 'bss_siege', cat: 'avatar', name: 'The Siege of Ba Sing Se', when: '600 days at the outer wall', map: 'basingse',
    desc: "General Iroh, the Dragon of the West, leads the Fire Nation against the Earth Kingdom's great wall. The earthbenders have held it for six hundred days.",
    sides: [
      { name: 'Earth Kingdom', army: army(block('av_earthbender', 10, 2, 7, 0, 2.2), line('av_kyoshi', 8, 4.5, 0, 2.2), one('av_toph', 14)) },
      { name: 'Fire Nation', army: army(block('av_fn_soldier', 12, 3, 6), one('av_iroh', 14), one('av_sparky', 18)) },
    ],
  },
  {
    id: 'black_sun', cat: 'avatar', name: 'The Day of Black Sun', when: 'the invasion of the Fire Nation', map: 'canyon',
    desc: 'During the eclipse the firebenders lose their fire. Team Avatar, the earthbenders and the Kyoshi Warriors storm the capital. Azula was waiting for them.',
    sides: [
      { name: 'Team Avatar & allies', army: army(heroes(['av_aang', 'av_katara', 'av_sokka', 'av_toph'], 10, 0, 3.5), line('av_earthbender', 8, 6, 0, 2.5), line('av_kyoshi', 8, 13, 0, 2.5)) },
      { name: 'Fire Nation', army: army(block('av_fn_soldier', 12, 3, 6), one('av_azula', 14), one('av_zuko', 16, 5)) },
    ],
  },
  {
    id: 'crossroads', cat: 'avatar', name: 'The Crossroads of Destiny', when: 'the fall of Ba Sing Se', map: 'basingse',
    desc: 'In the crystal catacombs Zuko chooses his sister. Aang and Katara, with Uncle Iroh, against Azula, Zuko and the Dai Li... played here by Fire Nation soldiers.',
    sides: [
      { name: 'Aang, Katara & Iroh', army: army(heroes(['av_aang', 'av_katara', 'av_iroh'], 8, 0, 3.5), line('av_earthbender', 4, 12, 0, 3)) },
      { name: 'Azula & Zuko', army: army(heroes(['av_azula', 'av_zuko'], 8, 0, 3.5), line('av_fn_soldier', 8, 12, 0, 2.2)) },
    ],
  },
  {
    id: 'agnikai', cat: 'avatar', name: 'Agni Kai', when: 'Zuko vs Azula', map: 'desert',
    desc: 'The final Agni Kai under Sozin\'s Comet: brother against sister for the throne of the Fire Nation.',
    sides: [
      { name: 'Prince Zuko', army: one('av_zuko', 6) },
      { name: 'Princess Azula', army: one('av_azula', 6) },
    ],
  },
  {
    id: 'sozin', cat: 'avatar', name: "Sozin's Comet", when: 'the final battle', map: 'basingse',
    desc: 'The comet makes every firebender a hundred times stronger. Team Avatar - with Zuko now on their side - makes its last stand.',
    sides: [
      { name: 'Team Avatar', army: army(heroes(['av_aang', 'av_zuko', 'av_katara', 'av_sokka', 'av_toph'], 9, 0, 3.5), line('av_earthbender', 6, 6, 0, 2.5), line('av_kyoshi', 6, 13, 0, 2.5)) },
      { name: 'Fire Nation', army: army(block('av_fn_soldier', 14, 3, 6), heroes(['av_azula', 'av_sparky'], 14, 0, 6)) },
    ],
  },
  // ---------------------------------------------------------------- sci-fi & games
  {
    id: 'hangar', cat: 'other', name: 'Hangar Assault', when: 'a galaxy far, far away', map: 'starbase',
    desc: 'A droid army with a walker storms the hangar. Laser knights and blaster troopers hold the deck.',
    sides: [
      { name: 'Republic', army: army(line('ga_knight', 4, 7, 0, 3), block('ga_trooper', 8, 2, 10, 0, 2.2), line('ga_furball', 2, 9, 0, 10), one('ga_hunter', 16)) },
      { name: 'Droid Army', army: army(block('ga_droid', 12, 4, 6, 0, 1.8), one('ga_walker', 18), one('ga_lord', 14)) },
    ],
  },
  {
    id: 'village_raid', cat: 'other', name: 'Village Raid', when: 'night falls on the plains', map: 'blocky',
    desc: 'The sun goes down and the mobs come for the village. Steve and the iron golems stand in the way.',
    sides: [
      { name: 'Village', army: army(line('mc_steve', 4, 7, 0, 3), line('mc_golem', 2, 9, 0, 8), line('mc_villager', 10, 14, 0, 2.2)) },
      { name: 'Mobs', army: army(block('mc_zombie', 10, 2, 6), line('mc_creeper', 6, 4.5, 0, 3), line('mc_skeleton', 8, 12, 0, 2.5), line('mc_witch', 3, 15, 0, 5), line('mc_enderman', 2, 10, 0, 12)) },
    ],
  },
  {
    id: 'jurassic', cat: 'other', name: 'Jurassic Frontier', when: 'cowboys meet dinosaurs', map: 'canyon',
    desc: 'Somewhere in the canyons a gold rush digs up something that should have stayed extinct.',
    sides: [
      { name: 'Wild West', army: army(line('ww_gunslinger', 10, 7, 0, 2.2), line('ww_lasso', 6, 5, 0, 2.5), line('ww_blunderbuss', 6, 10, 0, 2.5), line('ww_dynamite', 4, 13, 0, 3), line('ww_quickdraw', 4, 15, 0, 3)) },
      { name: 'Dinosaurs', army: army(block('pr_raptor', 8, 2, 6, 0, 2.2), one('pr_trex', 14), one('pr_triceratops', 12, 10), line('pr_ptero', 3, 16, 0, 5)) },
    ],
  },
  {
    id: 'undead', cat: 'other', name: 'Night of the Dead', when: 'the graveyard wakes', map: 'graveyard',
    desc: 'The Reaper raises the skeletons. The good folk and their angels answer the bells.',
    sides: [
      { name: 'Good', army: army(line('gd_shield_bearer', 10, 6, 0, 2), line('gd_divine_archer', 8, 11, 0, 2.5), line('gd_cleric', 4, 13, 0, 3), line('gd_angel', 2, 16, 0, 8)) },
      { name: 'Undead', army: army(block('sp_skeleton', 12, 3, 5, 0, 1.8), line('sp_skel_archer', 8, 12, 0, 2.5), line('sp_ghost', 4, 9, 0, 4), line('sp_vampire', 3, 14, 0, 4), one('sp_reaper', 20)) },
    ],
  },
  // ---------------------------------------------------------------- crossovers
  {
    id: 'jjk_avatar', cat: 'cross', name: 'Sorcerers vs Benders', when: 'Jujutsu Kaisen × Avatar', map: 'basingse',
    desc: 'Cursed techniques against the four elements. Tokyo Jujutsu High against Team Avatar and the Fire Nation\'s finest.',
    sides: [
      { name: 'Jujutsu High', army: heroes(['jk_yuji', 'jk_megumi', 'jk_nobara', 'jk_maki', 'jk_panda', 'jk_inumaki', 'jk_nanami', 'jk_todo'], 8, 0, 3.5) },
      { name: 'Avatar', army: army(heroes(['av_aang', 'av_katara', 'av_sokka', 'av_toph', 'av_zuko', 'av_azula', 'av_iroh'], 8, 0, 3.5), line('av_kyoshi', 6, 13, 0, 3)) },
    ],
  },
  {
    id: 'king_vs_world', cat: 'cross', name: 'The King of Curses vs History', when: 'Sukuna vs a medieval army', map: 'castle',
    desc: 'Ryomen Sukuna alone against a whole medieval army with its king. Dismantle. Cleave.',
    sides: [
      { name: 'Medieval Kingdom', army: army(block('squire', 10, 3, 7), block('archer', 10, 2, 15, 0, 2.2), line('knight', 6, 12, 0, 3), one('king', 22)) },
      { name: 'Ryomen Sukuna', army: one('jk_sukuna', 8) },
    ],
  },
  {
    id: 'gods', cat: 'cross', name: 'Gods & Monsters', when: 'legends of every age', map: 'volcano',
    desc: 'Zeus, the Super Peasant, angels and a phoenix against the Reaper, the Void Monarch, a tree giant and a dragon.',
    sides: [
      { name: 'Gods & heroes', army: army(heroes(['an_zeus', 'gd_super_peasant'], 12, 0, 8), line('gd_angel', 3, 8, 0, 6), one('gd_phoenix', 16), line('an_minotaur', 2, 6, 0, 12)) },
      { name: 'Monsters', army: army(heroes(['sp_reaper', 'ev_void_monarch'], 12, 0, 8), one('ev_tree_giant', 7), one('bb_dragon', 18), line('ev_shadow', 6, 5, 0, 3)) },
    ],
  },
  {
    id: 'random', cat: 'cross', name: 'Random War', when: 'two random factions, the same gold', map: 'grass',
    desc: 'Two factions picked at random, each with the same gold to spend. A new war every time you pick it.',
    random: true,
    sides: [
      { name: 'Random', army: randomSide(0) },
      { name: 'Random', army: randomSide(1) },
    ],
  },
];

// the two armies of a scenario as setup entries ({type, x, z}; Blue at -x) and the
// side names (a random war names its factions)
export function simArmies(sc, k = 1, seed = [Math.random(), Math.random()]) {
  const names = sc.sides.map((s) => s.name);
  const armies = sc.sides.map((s, t) => {
    const list = s.army(k, seed);
    if (list.facName) names[t] = list.facName;
    return spread(list.filter((a) => UNIT_BY_ID[a.type])).map((a) => ({ type: a.type, x: (t === 0 ? -1 : 1) * a.d, z: a.z }));
  });
  return { armies, names };
}
// a unit's footprint radius for spacing (big beasts, mounts and machines need room)
const BIG = /^(bb_|sm_|pr_trex|pr_triceratops|ga_walker|mc_golem|ev_tree_giant|giant|jk_mahoraga|jk_rainbowdragon|jk_smallpox)/;
const footprint = (d) => (BIG.test(d.id) ? 2.2 : 0.8 * Math.max(1, d.build?.scale || 1));
// formations can overlap (an Epic army's longer blocks run into the next rank): walk
// each unit back from the enemy until it has room, then sideways if the field ends
function spread(list) {
  const placed = [];
  const free = (d, z, r) => placed.every((p) => Math.hypot(p.d - d, p.z - z) >= p.r + r);
  for (const a of [...list].sort((p, q) => p.d - q.d)) {
    const r = footprint(UNIT_BY_ID[a.type]);
    let d = Math.max(3.5 + r, a.d), z = Math.max(-30, Math.min(30, a.z));
    for (let i = 0; i < 80 && !free(d, z, r); i++) {
      d += 0.6;
      if (d > 41) { d = Math.max(3.5 + r, a.d); z += (i % 2 ? -1 : 1) * 1.2 * (1 + (i >> 1)); z = Math.max(-30, Math.min(30, z)); }
    }
    placed.push({ type: a.type, d, z, r });
  }
  return placed;
}
// step a unit off a wall or out of the water (maps with features): the nearest free spot
// in its own half (t: 0 Blue, 1 Red), searched in a widening spiral; false if none
export function fitToMap(terrain, t, a, gap = 3, field = { x: 42, z: 32 }) {
  if (!terrain.blocked(a.x, a.z, 0)) return true;
  for (let i = 1; i < 400; i++) {
    const ang = i * 2.4, r = 0.7 * Math.sqrt(i);
    const x = a.x + Math.cos(ang) * r, z = a.z + Math.sin(ang) * r;
    if ((t === 0 ? x > -gap || x < -field.x : x < gap || x > field.x) || Math.abs(z) > field.z) continue;
    if (!terrain.blocked(x, z, 0)) { a.x = x; a.z = z; return true; }
  }
  return false;
}
export const simValue = (army) => army.reduce((s, a) => s + (UNIT_BY_ID[a.type]?.cost || 0), 0);
