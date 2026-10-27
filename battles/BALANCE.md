# Wobbly Battles: unit balance

Unit stats were tuned with a headless battle harness (`battles/dev/balance/`) that
runs the real game modules (physics, AI, packs) in Node and fights **equal-gold**
battles. Only numeric stats changed (cost, hp, speed, armor and weapon numbers);
no behaviour code was touched.

## Method

- **Equal gold.** Each side gets `round(budget / cost)` of its unit type. The budget is
  the smallest one of at least max(1200, both costs) where the two armies are within
  4% gold of each other (searched up to 3x; a few elite-vs-elite pairings stay
  6–11% apart). The score below is normalised per side, so a small gold gap matters
  little.
- **Fair placement.** Armies are laid out the way the game's *Random army* does
  (`game.js randomArmy`): front rank from x = -8, rows of up to 12, melee in front,
  ranged and support behind. Team 1 gets the point mirror (-x, -z) of team 0, which
  matches the point-symmetric terrain, and **sides swap every run**. Battles use a
  seeded RNG (so a result file is reproducible) and stop at **120 s** of sim time.
- **Score** per battle = (own hp-weighted gold still standing / own starting gold)
  − (the same for the enemy). +1 is a flawless win, 0 an even trade, −1 a flawless
  loss. A unit's score is the mean over the panel (6 battles per pairing).
- **Reference panel**: cheap Clubber, Squire, Archer; mid Knight, Chieftain,
  Gunslinger; elite Giant, King; and a **mixed army** (≈35% Knights, 25% Archers, 30%
  Squires, rest Clubbers). The panel units were balanced against each other first.
- **Two columns.** *alone* = an army of only that unit. Support, artillery and
  kamikaze units can't be judged alone (a lone Healer army can't win, a Bomb on a
  Stick army can at best trade), so they are also scored *in line*: inside a Squire
  frontline, with 50% of the gold in the unit (artillery, throwers, Sarissa, Bomb on
  a Stick) or 25% (Healer, Bard, Cleric, Cheerleader, Fan Bearer, Painter,
  Necromancer, Chicken Man, Cactus, Lasso). A Squire army alone scores about +0.04,
  so an in-line score near 0 means the unit is worth its gold next to a frontline.
- **Targets.** Within about ±0.10 of even is "fair" (the per-unit standard error is
  about 0.04–0.05). Counters are expected and kept: shields and armour beat archers,
  archers and guns beat big slow units, splash beats swarms, the Reaper beats
  single elites. The mixed army is the hardest opponent for everyone (column mean
  about −0.30 vs about −0.10 for the single-type armies), so an elite scoring
  −0.3…−0.5 against it is in line with the roster.

"Before" scores use the original stats for every unit, panel included, run through
the same harness, layout and seeds. "After" scores use the final stats.

## The suspects

- **Cavalry slow to win**: confirmed. Its score went from −0.29 at 750 to +0.04 at
  640 with lance damage 62→80, but it still stalls often (see below).
- **Valkyrie weak**: −0.20 at 850; −0.01 at 700.
- **Hwacha loses to rushes**: confirmed, and only partly fixed (see below).
- **Jarl strong**: not in symmetric, side-swapped tests (−0.05 at 850). The earlier
  reports came from asymmetric layouts. It is now 800 and scores 0.00.
- **Bomber and Potion Seller lose without a frontline**: true alone (−0.69 and
  −0.67), as you'd expect. In a Squire line they were −0.16 and −0.25; at the new
  prices (210 and 190) they are −0.11 and −0.12.
- **Clubber too strong**: no longer. At 70 it scored −0.26 (Squires beat it), so it
  is now 60 and scores −0.05.

## Results

| unit | faction | cost | alone before | alone after | in line before | in line after | other changes | notes |
|---|---|---:|---:|---:|---:|---:|---|---|
| Clubber (`clubber`) | tribal | 70 → **60** | -0.26 | -0.05 |  |  |  | was weak at 70 vs squires; cheaper so it swarms |
| Protector (`protector`) | tribal | 80 → **110** | +0.34 | +0.09 |  |  |  | shield wall hard-counters archers; priced up |
| Spear Thrower (`spear_thrower`) | tribal | 120 → **145** | +0.20 | +0.07 |  |  |  |  |
| Chieftain (`chieftain`) | tribal | 400 → **320** | -0.27 | +0.06 |  |  |  |  |
| Halfling (`halfling`) | farmer | 50 → **45** | -0.17 | -0.06 |  |  |  |  |
| Farmer (`farmer`) | farmer | 80 → **60** | -0.55 | -0.08 |  |  | hp 110→125, damage 30→40 | was the worst cheap melee; more hp and pitchfork damage |
| Hay Baler (`hay_baler`) | farmer | 140 → **250** | +0.56 | +0.11 |  |  | damage 45→40 | bales flatten everything; priced up, slightly less damage |
| Potion Seller (`potion_seller`) | farmer | 340 → **190** | -0.67 | -0.37 | -0.25 | -0.12 |  | needs a frontline; scored in line |
| Bard (`bard`) | medieval | 60 → **55** | -0.84 | -0.80 | +0.23 | +0.07 |  | support (buff does not stack); scored in line at 25% |
| Squire (`squire`) | medieval | 100 → **110** | +0.17 | +0.04 |  |  |  | slightly too good per gold |
| Archer (`archer`) | medieval | 140 | +0.07 | +0.06 | +0.13 | +0.09 |  |  |
| Healer (`healer`) | medieval | 180 → **170** | -0.99 | -0.99 | +0.09 | +0.10 |  | support; scored in line at 25% |
| Knight (`knight`) | medieval | 650 → **620** | -0.12 | -0.03 |  |  |  | panel heavy |
| King (`king`) | medieval | 1500 → **1650** | +0.16 | -0.01 |  |  |  | loses hard to massed ranged (intended), beats melee |
| Berserker (`berserker`) | legacy | 420 → **370** | -0.24 | -0.09 |  |  |  | was weak |
| Bomber (`bomber`) | legacy | 300 → **210** | -0.69 | -0.34 | -0.16 | -0.11 |  | needs a frontline; scored in line |
| Wizard (`wizard`) | legacy | 900 → **800** | -0.12 | -0.06 |  |  |  | slightly weak |
| Giant (`giant`) | legacy | 1600 | -0.27 | -0.09 |  |  | hp 1400→1600, speed 3.4→4.4, armor 0.1→0.3 | was 1400 hp / 3.4 speed: archers and guns killed it before it arrived; still their counter |
| Cavalry (`sm_cavalry`) | medieval | 750 → **640** | -0.29 | +0.04 |  |  | damage 62→80 | now kills on the charge; still often stalls at the time cap (wheels round between charges) |
| Mammoth (`sm_mammoth`) | tribal | 2200 → **4000** | +0.66 | +0.14 |  |  |  | polarised: tramples any melee blob whatever its size, dies to guns; cost alone barely moves it |
| Catapult (`sm_catapult`) | medieval | 1000 → **450** | -0.52 | -0.15 | -0.53 | -0.33 | damage 160→220, blast 2.8→3.4, cooldown 7.5→6 | needs a long ranged phase; boulders miss anything that moves |
| Ballista (`sm_ballista`) | medieval | 700 → **480** | -0.77 | -0.63 | -0.19 | -0.12 |  | scored in line |
| Valkyrie (`sm_valkyrie`) | viking | 850 → **700** | -0.20 | -0.01 |  |  |  | was weak at 850 |
| Brawler (`vk_brawler`) | viking | 100 | +0.03 | +0.01 |  |  |  |  |
| Headbutter (`vk_headbutter`) | viking | 100 → **90** | -0.11 | -0.06 |  |  |  |  |
| Ice Archer (`vk_ice_archer`) | viking | 150 → **175** | +0.20 | +0.03 |  |  |  | frost slow made it a bit strong |
| Jarl (`vk_jarl`) | viking | 850 → **800** | -0.05 | +0.00 |  |  |  | was not strong in symmetric tests; slightly cheaper |
| Hoplite (`an_hoplite`) | ancient | 140 → **120** | -0.14 | +0.05 |  |  |  |  |
| Sarissa (`an_sarissa`) | ancient | 150 → **100** | -0.74 | -0.46 | -0.28 | -0.10 | damage 26→34 | pike line; scored in line, damage up |
| Snake Archer (`an_snake_archer`) | ancient | 150 → **130** | -0.06 | +0.05 |  |  |  |  |
| Minotaur (`an_minotaur`) | ancient | 760 → **650** | -0.13 | +0.01 |  |  |  | was weak |
| Zeus (`an_zeus`) | ancient | 1800 → **2450** | +0.24 | -0.01 |  |  |  | was strong vs everything but giants |
| Monk (`dy_monk`) | dynasty | 85 → **75** | -0.00 | +0.02 |  |  |  |  |
| Samurai (`dy_samurai`) | dynasty | 230 → **240** | +0.09 | +0.07 |  |  |  |  |
| Firework Archer (`dy_firework`) | dynasty | 270 → **300** | +0.19 | +0.04 |  |  |  | slightly strong |
| Hwacha (`dy_hwacha`) | dynasty | 650 → **450** | -0.87 | -0.53 | -0.38 | -0.24 | hp 300→450, damage 45→60 | rocket volleys mostly miss moving targets and it cannot fire inside 10 m: still weak |
| Cactus (`ww_cactus`) | wildwest | 60 → **40** | -0.46 | -0.37 | -0.03 | -0.09 |  | does not move (trap); scored in line at 25% |
| Gunslinger (`ww_gunslinger`) | wildwest | 200 → **220** | +0.52 | -0.00 |  |  | damage 34→25 | panel; six-shooter was the strongest panel unit |
| Blunderbuss (`ww_blunderbuss`) | wildwest | 190 → **225** | +0.30 | +0.04 |  |  |  |  |
| Lasso (`ww_lasso`) | wildwest | 90 | -0.12 | -0.13 | +0.19 | +0.05 |  | support; scored in line at 25% |
| Dynamite (`ww_dynamite`) | wildwest | 170 → **120** | -0.53 | -0.38 | -0.15 | -0.08 |  | scored in line |
| Skeleton (`sp_skeleton`) | spooky | 40 → **35** | -0.18 | -0.08 |  |  | hp 45→62 | cheap swarm; more hp |
| Skeleton Archer (`sp_skel_archer`) | spooky | 70 → **80** | +0.20 | +0.06 |  |  |  |  |
| Candlehead (`sp_candlehead`) | spooky | 200 → **180** | -0.07 | +0.01 |  |  |  |  |
| Vampire (`sp_vampire`) | spooky | 340 → **260** | -0.34 | -0.04 |  |  |  | was weak |
| Reaper (`sp_reaper`) | spooky | 2000 | -0.01 | -0.08 |  |  |  | anti-elite: one-shots big units, loses to swarms and ranged |
| Flintlock Pirate (`pi_flintlock`) | pirate | 120 → **165** | +0.33 | -0.00 |  |  |  | one heavy shot was very efficient |
| Harpooner (`pi_harpooner`) | pirate | 140 → **125** | -0.02 | +0.02 |  |  |  |  |
| Bomb Thrower (`pi_bomb`) | pirate | 150 → **120** | -0.43 | -0.44 | -0.06 | -0.06 |  | scored in line |
| Pirate Captain (`pi_captain`) | pirate | 450 → **420** | -0.11 | -0.00 |  |  |  |  |
| Pirate Queen (`pi_queen`) | pirate | 1100 | +0.04 | -0.03 |  |  |  |  |
| Cannon (`pi_cannon`) | pirate | 700 → **540** | -0.72 | -0.33 | -0.09 | -0.12 |  | scored in line |
| Halberd (`rn_halberd`) | renaissance | 140 | -0.07 | -0.07 |  |  |  |  |
| Fencer (`rn_fencer`) | renaissance | 140 | -0.02 | -0.01 |  |  |  |  |
| Musketeer (`rn_musketeer`) | renaissance | 150 → **125** | -0.20 | -0.03 |  |  |  | volley fire waits for the line; was weak |
| Balloon Archer (`rn_balloon`) | renaissance | 260 → **230** | -0.07 | -0.08 |  |  |  |  |
| Painter (`rn_painter`) | renaissance | 100 → **200** | +0.12 | -0.42 | +0.37 | +0.09 |  | support (slow); scored in line at 25% |
| Da Vinci Tank (`rn_davinci`) | renaissance | 1350 → **1550** | +0.20 | -0.10 |  |  |  | beats melee, helpless vs giant / king |
| Caveman (`pr_caveman`) | prehistoric | 55 → **50** | -0.10 | -0.09 |  |  |  |  |
| Velociraptor (`pr_raptor`) | prehistoric | 110 → **100** | +0.05 | +0.04 |  |  |  |  |
| Raptor Rider (`pr_raptor_rider`) | prehistoric | 370 | +0.09 | -0.01 |  |  |  |  |
| Pterodactyl (`pr_ptero`) | prehistoric | 350 → **310** | -0.14 | +0.03 |  |  |  |  |
| T-Rex (`pr_trex`) | prehistoric | 2600 → **2250** | -0.14 | -0.07 |  |  |  | beats melee and heavies, loses to ranged; slightly cheaper |
| War Elephant (`bb_war_elephant`) | ancient | 2200 → **3000** | +0.35 | -0.05 |  |  |  | tramples melee blobs (like the Mammoth) |
| Battle Elephant (`bb_battle_elephant`) | dynasty | 1800 → **1700** | +0.10 | +0.03 |  |  |  | fell to -0.18 after the panel changes; slightly cheaper |
| Dragon (`bb_dragon`) | dynasty | 3200 | -0.01 | -0.08 |  |  |  |  |
| Shield Bearer (`gd_shield_bearer`) | good | 180 → **160** | -0.07 | -0.09 |  |  |  |  |
| Cleric (`gd_cleric`) | good | 220 → **135** | -0.74 | -0.55 | +0.13 | -0.06 |  | support; scored in line at 25% |
| Angel (`gd_angel`) | good | 900 → **700** | -0.32 | -0.05 |  |  |  | was weak at 900 |
| Phoenix (`gd_phoenix`) | good | 950 → **620** | -0.25 | -0.07 |  |  |  | was weak at 950 |
| Super Peasant (`gd_super_peasant`) | good | 2700 | -0.00 | -0.03 |  |  |  |  |
| Fan Bearer (`ev_fan_bearer`) | evil | 170 → **135** | -0.36 | -0.29 | +0.13 | +0.06 |  | support (wind); scored in line at 25% |
| Mace Spinner (`ev_mace_spinner`) | evil | 300 → **190** | -0.38 | -0.05 |  |  |  |  |
| Necromancer (`ev_necromancer`) | evil | 450 → **470** | -0.65 | -0.77 | +0.21 | +0.11 |  | support (raises the dead); scored in line at 25% |
| Chronomancer (`ev_chronomancer`) | evil | 1000 → **1100** | +0.13 | -0.04 |  |  |  | slightly strong |
| Tree Giant (`ev_tree_giant`) | evil | 1500 | +0.03 | -0.04 |  |  |  |  |
| Banana Thrower (`sc_banana`) | secret | 100 → **60** | -0.73 | -0.56 | -0.23 | -0.02 | damage 22→28 | scored in line; more damage |
| Cheerleader (`sc_cheerleader`) | secret | 110 → **80** | -0.60 | -0.43 | +0.04 | +0.06 |  | support; scored in line at 25% |
| Bomb on a Stick (`sc_bomb_stick`) | secret | 180 → **100** | -0.47 | -0.36 | -0.07 | -0.07 |  | kamikaze: alone it can at best trade, so scored in line |
| Chicken Man (`sc_chicken_man`) | secret | 200 | -0.34 | -0.31 | +0.15 | +0.07 |  | support; scored in line at 25% |
| Lightning Gun (`sc_lightning_gun`) | secret | 650 → **490** | -0.30 | +0.03 |  |  |  | was weak at 650 |
| Ullr (`sc_ullr`) | secret | 800 | -0.00 | -0.04 |  |  |  |  |

## Remaining outliers (not fixable with numbers alone)

Summary: before, the 61 units scored alone (support, artillery and kamikaze
excluded) ranged from −0.55 (Farmer) to +0.66 (Mammoth). 30 of them were outside
±0.15, and the mean |score| was 0.18. After, all of them sit between −0.10 and +0.14,
with a mean |score| of 0.05. The 21 support and artillery units, scored in line, sit
between −0.12 and +0.11, except Hwacha and Catapult (below). Elites against the mixed army (column mean
−0.30): King +0.22, Battle Elephant +0.36, Super Peasant −0.11, Tree Giant −0.13,
War Elephant −0.20, Giant −0.31, Zeus −0.35, Dragon −0.46, T-Rex −0.47, Mammoth
−0.48, Reaper −0.53. So they are roughly worth their gold against combined arms; the
last four are a little under.

These need behaviour changes. Price and stats alone could not fix them, and I did
not touch behaviour code:

- **Mammoth** (+0.14 alone, the top score). Its results are all-or-nothing: about
  +0.9 against any melee blob of any size, −0.94 against Gunslingers, −0.5 against
  Archers and the mixed army. Raising its cost from 2200 to 4000 only brought it from
  +0.66 to +0.14, because a bigger budget just puts more melee units under its feet.
  Lowering trample damage (`MAMMOTH.trDmg` 34→22) or mount hp (2600→2000) with a lower
  price made it worse. 24 of its 54 battles hit the 120 s cap: the mammoth is unhurt
  but cannot finish Knights, Kings or Giants it keeps knocking over. Suggested fix:
  tusk tosses or tramples that can finish downed units, or a limit on how many units
  one trample step can hit.
- **Cavalry** (+0.04 alone) now has a fair score, but 17 of 54 battles hit the time
  cap. Between charges it wheels away, so the last few enemies are never finished
  off. This is the "slow to win" complaint, and it is behaviour. Suggested fix: once
  the enemy is down to a few units, fight in melee instead of re-charging.
- **Hwacha** (−0.24 in line, −0.53 alone). Its rockets are aimed at where the target
  was at launch, with 2.6 m scatter, so most of a volley misses anything moving. It
  also cannot fire inside 10 m, so a rush shuts it off. I tried cost 380–650,
  damage 45–60, cooldown 3.5–5, scatter 2.0 and hp 300→450, and each moved it by at
  most about 0.1. A cheaper Hwacha is no better, because more Hwachas means less
  frontline. Suggested fix: lead the target, or let it walk back out of minRange.
- **Catapult** (−0.33 in line, −0.15 alone). Same cause: the battle reaches melee
  after one or two boulders, and boulders miss moving targets. Friendly fire turned
  out small in a damage breakdown (`ff.mjs`). Suggested fix: lead the target, or start
  armies further apart.
- **Support units scored alone** (Healer, Bard, Necromancer, Cleric, Cheerleader,
  Cactus, Chicken Man, Fan Bearer, Painter) and kamikaze or artillery scored alone
  lose by design. The in-line column is their real score.
- **Bard**: its buff (+20% speed, 12% faster swings) is a constant in `src/unit.js` and
  doesn't stack, so the Bard can only be balanced by price.
- **Hard counters** that are intended: a Giant, King or Reaper alone loses about
  −0.9 to a mass of Archers or Gunslingers (they kite and focus fire), and a Reaper
  loses to swarms. These units are fine against everything else.
- **Limits of the measurement**: mounts and vehicles count only the rider's hp in the
  hp-weighted score, not the mount's. Single-unit elites (1–3 per side) are noisier
  than swarms. A few elite-vs-elite pairings are 6–11% apart in gold.
- **Campaign**: many costs changed, so campaign budgets, star thresholds (gold spent)
  and fixed enemy armies in `src/campaign.js` may need a look.

## Re-running

Requires Node 18+; nothing to install (it imports `battles/src` and `battles/vendor`).

    # every unit alone vs the panel, 6 battles per pairing, 4 worker processes
    node battles/dev/balance/run.mjs --runs 6 --procs 4 --out /tmp/mono.jsonl
    # support / artillery inside a squire frontline ('@0.25' = a quarter of the gold)
    node battles/dev/balance/run.mjs --units squire+healer@0.25,squire+bomber --out /tmp/line.jsonl
    # summary (sorted; --md for markdown, --json for scripts)
    node battles/dev/balance/report.mjs /tmp/mono.jsonl /tmp/line.jsonl --sort
    # try stats without editing files (unit fields, or a pack module's exported tuning)
    OVERRIDE='{"clubber":{"cost":70},"packs/sm-mounts.js":{"MAMMOTH.hp":2000}}' \
      node battles/dev/balance/run.mjs --units clubber,sm_mammoth --out /tmp/try.jsonl
    battles/dev/balance/try.sh clubber '{"clubber":{"cost":70}}'   # same, prints the row
    # battle length / time-cap hits, damage breakdown incl. friendly fire
    node battles/dev/balance/times.mjs /tmp/mono.jsonl --units sm_cavalry
    node battles/dev/balance/ff.mjs squire+dy_hwacha clubber 2
    # this table (needs the old src for the before costs, e.g. from git archive)
    node battles/dev/balance/table.mjs --old <old battles/src> --before <files> --after <files> --notes battles/dev/balance/notes.json

`--pairs a:b,c:d` runs explicit pairings, `--vs` changes the panel, `--maxT` the time
cap. Results files resume: finished battles (same units, stats, budget, seed and
side) are skipped, so a re-run after a stat change only fights the pairings it
touches. A full panel run (82 units x 9 armies x 6 = ~4400 battles) takes about
70–90 minutes on 4 busy cores (1–15 ms per physics step).

## Ranged reload pass (owner feedback: ranged felt too strong)

Ordinary ranged units fire about 20–25% less often; prices unchanged, so they are now
slightly under par per gold and lose clearly to cheap melee rushes. Special and siege
units (Zeus, Da Vinci, catapult, ballista, cannon, hwacha, war elephant, mammoth,
tree giant) are unchanged.

| unit | change |
|---|---|
| Archer | cooldown 2.0 → 2.5 |
| Skeleton Archer, Snake Archer | cooldown 2.2 → 2.7 |
| Ice Archer | cooldown 2.1 → 2.6 |
| Spear Thrower | cooldown 3.2 → 3.8 |
| Musketeer | reload 4.0 → 5.0 |
| Flintlock | reload 5.0 → 6.0 |
| Gunslinger | reload 3.2 → 4.0 |
| Pirate Queen | reload 2.2 → 2.8 |
| Blunderbuss | reload 3.0 → 3.6 |
| Firework Archer | cooldown 2.4 → 3.0 |
| Bomber, Potion Seller | cooldown 2.6 → 3.1 |
| Dynamite, Pirate Bomber | cooldown 2.8 → 3.3, 3.0 → 3.5 |
| Wizard | cooldown 2.6 → 3.0 |
| Hay Baler | cooldown 3.0 → 3.5 |
| Banana thrower | cooldown 1.8 → 2.2 |
| Balloon archer, Candlehead | cooldown 2.2 → 2.7 |

Equal-gold scores after the change (`run.mjs`, 4 runs per pairing, avg over the
reference panel; +1 flawless win, −1 flawless loss): archer −0.02 (was +0.06),
skeleton archer −0.01, gunslinger −0.03, spear thrower −0.05, musketeer −0.09,
flintlock −0.09. They now lose to clubbers and squires (−0.4 to −0.97) and still beat
giants and kings (+0.4 to +0.96).

## New units (Tribal, Farmer, Legacy, Viking, Ancient, Dynasty, Wild West)

Fourteen units, so each of these factions has at least seven. Each was priced with the
harness against the reference panel at equal gold (`run.mjs --runs 6`, 54 battles per
unit). The Volva is support, so she is scored inside a Squire line with a quarter of
the gold. The new ranged units follow the reload pass above: slow cooldowns, they lose
to cheap melee rushes and beat giants and kings. Code: `src/packs/classic.js` (the
core factions) and each pack faction's own file.

| unit | faction | cost | gimmick | score | notes |
|---|---|---:|---|---:|---|
| Stoner (`tb_stoner`) | tribal | 105 | cheap stones; a head hit dazes | −0.08 | +0.36 at 80; cooldown 2.8 → 3.0 |
| Bone Mage (`tb_bone_mage`) | tribal | 300 | a rune ring marks the spot, then bone spikes erupt and toss enemies up | −0.00 | +0.12 at 270 |
| Scarecrow (`fm_scarecrow`) | farmer | 105 | homing crows peck at the face: the target panics and runs, then is steady for 4 s | +0.01 | +1.00 vs Knight and King before the fear had a cooldown; −0.26 at 130 after; fear 2.6 → 3.0 s |
| Harvester (`fm_harvester`) | farmer | 200 | the scythe sweeps a wide arc in front and trips up to six enemies | −0.06 | |
| Wheelbarrow (`fm_wheelbarrow`) | farmer | 320 | never stops: the barrow shoves the enemy line along, knocks it over and catches shots from the front | +0.04 | +0.39 at 230 (knock 1.0 → 0.6 s, front guard 75% → 60%) |
| Peasant (`lg_peasant`) | legacy | 30 | bold (inspired) with 3+ allies close, runs when left alone next to an enemy | −0.01 | |
| Poacher (`lg_poacher`) | legacy | 120 | bolas tangle the legs (a shuffle for 3 s); a running target trips | −0.09 | |
| Barbarian (`lg_barbarian`) | legacy | 280 | grabs the enemy in front and hurls it at the next one | −0.10 | −0.26 at 330; can't lift giants (−0.87 vs Giant) |
| Raider (`vk_raider`) | viking | 125 | two throwing axes on the way in, then a hand axe | −0.03 | −0.17 at 140 |
| Volva (`vk_volva`) | viking | 115 | a rune ward on every ally within 6 m soaks up 65 damage for 7 s | −0.12 in line | −0.20 at 150 with a 45 ward |
| Gladiator (`an_gladiator`) | ancient | 200 | every kill heals 25% and adds damage, swing speed and pace (up to 5 kills) | −0.00 | +0.22 at 170 |
| Ninja (`dy_ninja`) | dynasty | 110 | flips over its target and lands behind it; backstabs hit 2.5x | −0.06 | −0.32 at 130 with 115 hp; hp → 130 |
| Quick Draw (`ww_quickdraw`) | wildwest | 190 | duels the most expensive enemy shooter in range first; one aimed shot, 2.5x on the head | +0.03 | |
| Miner (`ww_miner`) | wildwest | 125 | the pick ignores armour and hooks shields out of their bearers' hands (60%) | −0.08 | −0.33 at 150 with 150 hp; hp → 160 |

Against single opponents (−1 to +1, same runs): the Wheelbarrow flattens melee blobs
(+0.81 vs Squires) but loses to guns and the King. The Quick Draw, Stoner, Scarecrow and
Poacher beat Giants and Knights and lose to Clubber and Squire rushes (−0.4 to −0.8),
like the other ranged units. The Barbarian, Harvester and Peasant beat cheap melee and
lose to the elites. To re-run:

    node battles/dev/balance/run.mjs --units tb_stoner,tb_bone_mage,fm_scarecrow,fm_harvester,fm_wheelbarrow,lg_peasant,lg_poacher,lg_barbarian,vk_raider,an_gladiator,dy_ninja,ww_quickdraw,ww_miner,squire+vk_volva@0.25 --runs 6 --out /tmp/new.jsonl
    node battles/dev/balance/report.mjs /tmp/new.jsonl --sort

## Galactic faction (new units)

The seven Galactic units (`src/packs/galactic.js`) were priced with the same harness:
alone against the reference panel, 6 battles per pairing (54 per unit), sides swapped
every run. The first prices were guesses; each round changed only the numbers below
(plus the Walker's stomp, see its row).

| unit | cost | first try | final | other changes | notes |
|---|---:|---:|---:|---|---|
| Battle Droid (`ga_droid`) | 45 → **55** | +0.20 | +0.04 |  | cheap swarm; loses to melee rushes (−0.4), shreds giants and kings |
| Blaster Trooper (`ga_trooper`) | 130 → **175** | +0.56 | −0.05 | damage 21→17, reload 3.6→4.4 | bursts of 5 bolts with a big spread; kept just under par after the ranged reload pass |
| Laser Knight (`ga_knight`) | 300 | +0.03 | +0.03 |  | beats archers (+0.65) and gunslingers (+0.55) by deflecting; about even with melee |
| Space Furball (`ga_furball`) | 340 → **520** | +0.55 | +0.08 | hp 520→480 | heavy knockback bolts and swats knock whole ranks over |
| Jetpack Hunter (`ga_hunter`) | 420 → **570** | +0.44 | +0.01 | wrist rocket 60→50 | hovering out of reach made it strong against melee elites |
| Dark Lord (`ga_lord`) | 1400 → **1500** | +0.13 | +0.05 |  | push and choke wreck melee crowds (+0.57 vs clubbers); weak to gunslingers (−0.32) |
| Walker (`ga_walker`) | 2600 | −0.48 | +0.10 | behaviour: stomp | without a stomp, anything under its legs was safe from the cannons; now the nearest leg stomps (60 dmg, 2.2 m) |

Final scores by opponent (`report.mjs`):

| unit | clubber | squire | archer | knight | chieftain | gunslinger | giant | king | mix | avg |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Battle Droid | −0.40 | −0.45 | +0.24 | −0.38 | −0.47 | +0.46 | +0.83 | +0.47 | +0.10 | +0.04 |
| Blaster Trooper | −0.46 | −0.59 | −0.28 | +0.21 | −0.01 | +0.25 | +0.95 | −0.00 | −0.49 | −0.05 |
| Laser Knight | −0.21 | −0.30 | +0.65 | −0.25 | −0.12 | +0.55 | +0.10 | +0.08 | −0.26 | +0.03 |
| Space Furball | −0.60 | −0.40 | −0.21 | +0.36 | +0.52 | −0.05 | +0.75 | +0.03 | +0.27 | +0.08 |
| Jetpack Hunter | −0.23 | −0.30 | −0.23 | −0.21 | +0.07 | −0.04 | +0.70 | +0.64 | −0.33 | +0.01 |
| Dark Lord | +0.57 | +0.20 | +0.11 | +0.04 | +0.09 | −0.32 | −0.04 | −0.24 | +0.02 | +0.05 |
| Walker | +0.28 | +0.31 | +0.04 | +0.01 | −0.54 | +0.50 | −0.47 | +0.45 | +0.27 | +0.10 |

All seven sit between −0.05 and +0.10. The shooters follow the roster's pattern (they
lose to cheap melee rushes and beat big slow units). The Walker loses to Chieftains and
Giants, which reach its belly and outlast the stomps. Its pairings and the Dark Lord's
are noisy (1–3 units a side, a few 9–12% gold gaps against the King). Only the
Walker's hull hp is scored (it is mirrored on its hidden pilot), so it is measured
like the other beasts.

    node battles/dev/balance/run.mjs --units ga_droid,ga_trooper,ga_knight,ga_furball,ga_hunter,ga_lord,ga_walker --runs 6 --procs 4 --out /tmp/galactic.jsonl
    node battles/dev/balance/report.mjs /tmp/galactic.jsonl

## New units: Spooky, Pirate, Renaissance, Prehistoric, Good, Evil, Secret

Eleven units bring these factions to seven each. Each was priced with `run.mjs` (4 runs
per pairing, equal gold, the reference panel above) after the ranged reload pass.
Support, bomber and control units are also scored in line (inside a Squire frontline,
50% of the gold; the Flag Bearer 25%). Final scores (+1 flawless win, −1 flawless loss):

| unit | faction | cost | alone | in line | other changes while pricing | notes |
|---|---|---:|---:|---:|---|---|
| Ghost (`sp_ghost`) | spooky | 150 → **115** | +0.02 |  |  | shots, bites and blasts do 25% (no blood, no push); its touch makes enemies flee. Beats archers, guns, knights and kings; loses to cheap melee and giants |
| Swordcaster (`sp_swordcaster`) | spooky | **300** | +0.01 |  |  | three ghost swords that pierce up to 4 in a line; strong vs giants, weak vs squire walls |
| Powder Monkey (`pi_monkey`) | pirate | 130 → **200** | +0.00 | +0.13 | keg damage 130 → 100 | wrecks melee blobs, helpless vs gunslingers; like the Mammoth, its cost alone barely moved it (+0.29 at 130, +0.15 at 210) |
| Jouster (`rn_jouster`) | renaissance | 700 → **950** | +0.09 |  |  | shielded lancer that rides down the most valuable enemy |
| Triceratops (`pr_triceratops`) | prehistoric | **1300** | +0.01 |  |  | charges and tosses groups; loses to knights, chieftains and giants |
| Tar Slinger (`pr_tar`) | prehistoric | 110 → **85** |  | −0.01 | splash and a 6 dps scald added | area slow; alone it loses (−0.58 at 110), judged in line like the throwers |
| Divine Archer (`gd_divine_archer`) | good | 170 → **150** | −0.00 |  |  | homing arrows (turn 2 rad/s); reload in line with the slowed archers |
| Flag Bearer (`gd_flag_bearer`) | good | **150** |  | +0.05 |  | allies within 8 m take a third less damage (not a killing blow); bearers don't stack |
| Void Monarch (`ev_void_monarch`) | evil | 1400 → **1800** | −0.09 |  | implode 150 → 60, tick damage 16 → 8, cooldown 5 → 6 | at first one rift killed a whole Squire army (+0.65); still crushes blobs (+0.7 to +0.85) and loses to elites, guns and the mixed army |
| Shadow Assassin (`ev_shadow`) | evil | 220 → **170** | −0.03 |  | hp 150 → 170 | blinks behind shooters and healers: +0.9 vs archers, loses to giants |
| Bubble Blower (`sc_bubble`) | secret | 180 → **100** | −0.22 | −0.02 | cooldown 3.2 → 2.8 | control unit (floats one small enemy for 3 s); fair in line, a little weak alone |

Re-run:

    node battles/dev/balance/run.mjs --runs 4 --out /tmp/new.jsonl --units sp_ghost,sp_swordcaster,pi_monkey,rn_jouster,pr_triceratops,gd_divine_archer,ev_void_monarch,ev_shadow,sc_bubble,squire+pr_tar,squire+gd_flag_bearer@0.25,squire+sc_bubble,squire+pi_monkey

## Zeus throws thunderbolts; flyers as targets

Zeus now hurls a thunderbolt that strikes where it hits (on the ground, or a flyer in
the air) instead of striking the ground under the target. It is more accurate, so it
was re-priced: 2450 scored +0.15 (4 runs), 2750 +0.11, **3000 +0.02** (6 runs).
Against four flyers, damage dealt while they were in the air went from 329 → 2162
(valkyries) and 269 → 2160 (angels). The Void Monarch's rift now opens round a flyer,
the Tree Giant throws at flyers, and ground-only attacks (Bone Mage spikes, catapult
lobs) pick targets on the ground. Scores after the change (4 runs): Void Monarch
−0.02, Tree Giant −0.06, Bone Mage +0.05, Catapult −0.12.

## Jujutsu Kaisen: the students (`src/packs/jjk-students.js`)

> Prices and stats here were superseded by *JJK power levels* below.

Priced against the reference panel at equal gold (`run.mjs --runs 4`, 36 battles per
unit, sides swapped). Inumaki is support, so he is also scored inside a Squire line
with a quarter of the gold. Rika (`jk_rika`) is Yuta's reserve (cost 0, not in any
setup tab): she is part of Yuta's price, and the harness doesn't count her hp as gold
left standing, so Yuta's score slightly understates him.

First drafts were weak: bare fists (item `none`) out-reached by every weapon and units
knocked flat for seconds (Yuji −0.52, Todo −0.70, Panda −0.49). Fists became a short
pack item (`jk_fist`, like the Brawler's), the fighters get back up quickly (Yuji,
Todo, Maki, Panda), Todo's punches sweep, and then prices moved:

| unit | cost | hp | role | alone | in line (25%) | notes |
|---|---:|---:|---|---:|---:|---|
| Yuji Itadori (`jk_yuji`) | 520 → **430** | 470 → 520 | brawler | −0.05 | | Divergent Fist (+45% a beat later), Black Flash 12% (+25% for 6 s after one), ×2.5 |
| Aoi Todo (`jk_todo`) | 900 → **680** | 1000 → 1100 | brawler | +0.09 | | Boogie Woogie every 7 s; beats knights (+0.62), loses a little to squire walls |
| Nobara Kugisaki (`jk_nobara`) | 250 → **310** | 150 | ranged | +0.15 | | 3 nails per blow, Hairpin 14 per nail, Resonance 40 every 5.5 s; crushes giants and kings, loses to rushes (like every ranged unit) |
| Kento Nanami (`jk_nanami`) | 640 → **470** | 560 → 600 | melee | −0.02 | | Ratio 30% (55% on Overtime) ×2.4; Overtime from 30 s: +35% damage, faster |
| Maki Zen'in (`jk_maki`) | 560 → **460** | 420 | melee | −0.11 | | Split Soul every 3rd hit ignores armour; awakens once below 30% (back to 55%) |
| Panda (`jk_panda`) | **600** | 640 | brawler | −0.00 | | Gorilla Core once (55% hp): Drumming Beat +60% through guards, +50% to the one behind |
| Toge Inumaki (`jk_inumaki`) | 300 → **560** | 150 | support | −0.81 | +0.06 | "Don't move!" 2.4 → 2.0 s freeze; at 300 he was +0.41 in line |
| Yuta Okkotsu (`jk_yuta`) | **1500** | 560 | special grade | −0.10 | | Rika (950 hp) 12 s when in trouble, full manifestation below 30%; domain r 9 m, 6 s, power 9; −1.00 vs gunslingers |

Re-run with:

    node battles/dev/balance/run.mjs --units jk_yuji,jk_todo,jk_nobara,jk_nanami,jk_maki,jk_panda,jk_inumaki,jk_yuta,squire+jk_inumaki@0.25 --runs 4 --out /tmp/jks.jsonl
    node battles/dev/balance/report.mjs /tmp/jks.jsonl

## Jujutsu Kaisen: the strongest (Gojo, Sukuna, Megumi, Mahoraga)

> Prices and stats here were superseded by *JJK power levels* below.

`src/packs/jjk-strongest.js`, priced alone against the reference panel, 4 battles per
pairing (36 per unit), sides swapped. Summoned reserves (Megumi's shikigami and his
ritual Mahoraga) now count toward their summoner's gold in the harness
(`dev/balance/lib.mjs valueLeft`: a summoner's slot is worth its cost times the best hp
fraction of itself or any summon still standing), so a shikigami adds no value of its
own and Megumi's gold lives on in Mahoraga after the ritual.

| unit | cost | hp | role | score | notes |
|---|---:|---:|---|---:|---|
| Satoru Gojo (`jk_gojo`) | **3500** | 620 | hero | +0.09 | first draft at 2600 scored +0.60; Red 70→48 (blast 3.0→2.4), Purple 240→200, Infinity 7 s on / 2.2 off → 6 / 2.8, Void 5→3.5 s, awakening heal 40→30%. Crushes swarms (+0.67), loses to archers, gunslingers and kings in the Infinity gaps |
| Ryomen Sukuna (`jk_sukuna`) | **3300** | 1700 | boss | +0.03 | 2700 → +0.39; Dismantle 42→38, shrine 13→11 per 0.35 s tick. Flattens melee blobs (+1.0 vs clubbers), dies to massed ranged (−0.8…−0.95) |
| Megumi Fushiguro (`jk_megumi`) | **1200** | 380 | summoner | −0.05 | 900 → +0.67 once the ritual's Mahoraga counted; the ritual Mahoraga now leaves after 20 s |
| Mahoraga (`jk_mahoraga`) | **3400** | 2100 | boss | +0.05 | damage 120→160; adapts (−30% per click, up to −85%, per kind of harm, 140 dmg a click) |

The shikigami (`jk_dog_white`, `jk_dog_black`, `jk_nue`, `jk_toad`, `jk_elephant`) are
not sold (faction `jjk_shiki`) and are not priced on their own.

    node battles/dev/balance/run.mjs --units jk_gojo,jk_sukuna,jk_megumi,jk_mahoraga --runs 4 --procs 3 --out /tmp/jjk-strongest.jsonl
    node battles/dev/balance/report.mjs /tmp/jjk-strongest.jsonl

## Jujutsu Kaisen: the curses (`src/packs/jjk-curses.js`)

> Prices and stats here were superseded by *JJK power levels* below.

Priced with the harness against the reference panel at equal gold, sides swapped, 4
battles per pairing (36 per unit). Summons (Geto's Stored Curses, Mahito's Transfigured
Humans) are reserves with cost 0, so they fight but add nothing to the score. Three
rounds of 2-battle drafts moved the prices; the final 4-battle round:

| unit | cost | hp | role | first draft | final avg | notes |
|---|---:|---:|---|---:|---:|---|
| Toji Fushiguro (`jk_toji`) | **1000** | 640 | assassin | +0.07 | +0.13 | fast leaps + Playful Cloud; beats blobs and knights, loses to gunslingers and the King |
| Dagon (`jk_dagon`) | 950 → **1050** | 1200 | caster | +0.12 | +0.08 | fish swarms; domain (r 9, 7 s, 14 per 0.5 s) once 4+ enemies are close |
| Mahito (`jk_mahito`) | 1050 → **850** | 470 | melee | −0.11 | +0.01 | +42 soul damage per touch; kills (and victims under 30% hp) become his transfigured humans (5 reserves); regen 9/s; domain (r 7, 4.5 s, 34 per 0.6 s) |
| Jogo (`jk_jogo`) | 1100 → **1250** | 430 | caster | +0.21 | −0.01 | Ember Insects (4 × 20 + burn), Meteor every 15 s (170, r 4.6, burn); domain (r 8, 6 s, 12 + burn) |
| Hanami (`jk_hanami`) | 750 → **1150** | 980 → 820 | bruiser | +0.58 | −0.00 | armor 0.3 → 0.22; polarised: flattens cheap melee (+0.97), loses to knights and elites |
| Suguru Geto (`jk_geto`) | 1150 → **700** | 520 | summoner | −0.76 | −0.06 | curses out 2 at a time (6 stored, up to 4 out; 120 → 170 hp, 24 → 30 dmg); Uzumaki 70 + 35 per curse |
| Choso (`jk_choso`) | 430 → **540** | 300 | ranged | +0.32 | +0.02 | Piercing Blood 54 through a whole line every 3.8 s; Supernova 50 when crowded |
| Kinji Hakari (`jk_hakari`) | 900 → **600** | 560 | brawler | −0.39 | +0.07 | domain does no damage (a daze); 16% jackpot chance per spin: 14 s of 120 hp/s regen, +60% damage, +25% speed |
| Fly Head (`jk_flyhead`) | 30 → **26** | 58 | swarm | −0.18 | −0.11 | beats archers and gunslingers by mobbing them, loses to anything sturdier |

All nine are within ±0.2 of even (standard error about ±0.05). Domains clash only with
other domains, and the secrets need Gojo or Yuji, so neither shows against the panel.
Re-run with:

    node battles/dev/balance/run.mjs --units jk_toji,jk_dagon,jk_mahito,jk_jogo,jk_hanami,jk_geto,jk_choso,jk_hakari,jk_flyhead --runs 4 --out /tmp/jkc.jsonl
    node battles/dev/balance/report.mjs /tmp/jkc.jsonl

## Collision fix (limbs touch bodies, neck limit)

Limbs now collide with bodies, so arms no longer pass through torsos, and heads have
a neck limit. Re-scored after it (4 runs per pairing): most units moved by less than
±0.1 (squire +0.11, knight +0.10, hoplite +0.12, chieftain +0.19). The Giant fell to
−0.31: its big arms are now blocked by bodies. A lower price barely helps (the harness
still fields one Giant), so its hp went 1600 → **2400**: −0.20, still the archers'
and gunslingers' prey (−0.99).

## JJK power levels

The Jujutsu Kaisen faction was priced for equal-gold fairness, so cheap characters were
weak one on one (Toji at 1000 and Hakari at 600 lost to most of the cast, and Sukuna beat
Gojo 12-0). It now follows the anime/manga tiers in a **duel**, and price follows strength:

| tier | units |
|---|---|
| S+ | Gojo |
| S | Sukuna |
| A+ | Toji, Hakari, Yuta (with Rika), Mahoraga |
| A | Geto, Jogo, Mahito, Megumi (with shikigami), Choso, Todo, Maki, Hanami, Dagon |
| B | Nanami, Yuji, Panda |
| C | Nobara, Inumaki (support) · fodder: Fly Head |

**Duel harness**: `dev/balance/duel.mjs` (documented at its top). One unit against one on
the first map with a flat field (the hills round it stay), 12 m apart, sides swapped every
run, seeded, 90 s cap (a draw). Re-run a row with
`node battles/dev/balance/duel.mjs --pairs jk_gojo:jk_sukuna,jk_toji:jk_gojo --runs 12`.

### What changed

Domains clash by power (an open domain gets +1): Unlimited Void **12** (was 10) beats the
Shrine's 10 + 1; Yuta 9, Hakari **8** (was 7), Mahito 7, Dagon / Jogo 6, Megumi 4. The
power now lives on each weapon (`domPow`).

| unit | cost | stats | mechanics |
|---|---|---|---|
| Gojo | 3500 → **6000** | hp 620 → 900; Red 48 → 60 every 3.0 → 2.4 s; Purple every 20 → 15 s; Void sure-hit 5 → 20 (shared out among everyone inside: `voidSplit`), Void only for 6+ enemies or a hero/boss (domMin 3 → 6); burnout after the Void 7 → 3 s | teleports 7 m clear when a blow he can't stop is close (Infinity down, or a piercing weapon; every 12 s); floats straight back up when knocked down |
| Sukuna | 3300 | unchanged | Mahoraga can't fully adapt to him (see Mahoraga) |
| Mahoraga | 3400 → **2600** | hp 2100 → 1500; damage 160 → 115, force 1100 → 900; heal per click 5% → 3% | adaptation numbers on its weapon; against Gojo and Sukuna it adapts at most 20% (`adaptTop`; banner "...faster than the wheel can turn") |
| Yuta | 1500 → **1700** | hp 560 → 850; katana 48 → 58; Rika comes at 80% hp (was 65%); Rika's slap 70 → 55 | |
| Toji | 1000 → **1400** | hp 640 → 950; spear 62 → 70; leap every 1.6 s (was 2.6); stagger 0.35 → 0.2 | |
| Hakari | 600 → **1500** | hp 560 → 900; fists 36 → 55; stagger 0.6 → 0.3; domain opens at 1.5 s even for one enemy (domMin 2 → 1), daze 0.35 → 0.5, a spin every 0.7 s (was 0.9); jackpot 16% → 30% a spin, 14 → 20 s, regen 120 → 200 hp/s, +60% → +130% damage | shrugs off knockdowns during a jackpot; a domain broken open (Toji) or overwhelmed in a clash gets one last spin |
| Geto | 700 | hp 520 → 650 | |
| Choso | 540 → **800** | hp 300 → 520; Piercing Blood 54 → 70 every 3.8 → 3.2 s; Supernova 50 → 70 every 9 → 6 s; stagger 1 → 0.6 | |
| Hanami | 1150 | hp 820 → 1000 | |
| Maki | 460 → **580** | hp 420 → 560; naginata 46 → 56; stagger 0.6 → 0.35; awakens below 40% (was 30%) back to 80% (was 55%) | |
| Mahito | 850 | stagger 0.7 → 0.4 | |
| Nanami | 470 → **400** | hp 600 → 520; Ratio 30% → 22%, ×2.4 → ×2.0; force 420 → 320 | |
| Panda | 600 → **420** | hp 640 → 560; fists 40 → 34 | |

The curses' domains (Dagon, Mahito, Jogo, Hakari) also open when every enemy still
standing is in reach (finishing a duel), not only for 2-4 enemies or an elite.

### Duel table (win rate of the first unit; draws count half)

Key pairs, 30 duels each (final stats):

| pair | wins-losses-draws | rate |
|---|---|---:|
| Gojo vs Sukuna | 29-1-0 | 97% |
| Toji vs Gojo | 13-17-0 | 43% |
| Toji vs Sukuna | 2-28-0 | 7% |
| Toji vs Yuta | 18-11-1 | 62% |
| Toji vs Hakari | 18-12-0 | 60% |
| Toji vs Mahoraga | 13-16-1 | 45% |
| Hakari vs Yuta | 14-8-8 | 60% |
| Hakari vs Mahoraga | 0-8-22 | 37% |
| Yuta vs Mahoraga | 6-15-9 | 35% |
| Gojo vs Mahoraga | 22-7-1 | 75% |
| Sukuna vs Mahoraga | 26-4-0 | 87% |
| Gojo vs Hakari | 8-0-22 | 63% |
| Gojo vs Yuta | 28-0-2 | 97% |

All pairs, before → after (12 duels each, sides swapped; W-L-D):

| pair | before | after |
|---|---:|---:|
| gojo vs sukuna | 0% (0-12-0) | 92% (11-1-0) |
| toji vs gojo | 100% (12-0-0) | 42% (5-7-0) |
| toji vs sukuna | 0% (0-12-0) | 17% (2-10-0) |
| toji vs yuta | 0% (0-12-0) | 63% (7-4-1) |
| toji vs hakari | 100% (12-0-0) | 67% (8-4-0) |
| toji vs megumi | 50% (6-6-0) | 83% (10-2-0) |
| toji vs geto | 75% (9-3-0) | 92% (11-1-0) |
| toji vs todo | 42% (5-7-0) | 100% (12-0-0) |
| toji vs yuji | 79% (9-2-1) | 100% (12-0-0) |
| toji vs mahoraga | 4% (0-11-1) | 50% (6-6-0) |
| toji vs jogo | 100% (12-0-0) | 100% (12-0-0) |
| toji vs mahito | 100% (12-0-0) | 100% (12-0-0) |
| toji vs maki | 100% (12-0-0) | 96% (11-0-1) |
| toji vs choso | 100% (12-0-0) | 100% (12-0-0) |
| toji vs hanami | 100% (12-0-0) | 100% (12-0-0) |
| toji vs dagon | 100% (12-0-0) | 100% (12-0-0) |
| toji vs nanami | 100% (12-0-0) | 100% (12-0-0) |
| hakari vs yuta | 4% (0-11-1) | 63% (7-4-1) |
| hakari vs mahoraga | 21% (0-7-5) | 42% (0-2-10) |
| hakari vs geto | 8% (0-10-2) | 96% (11-0-1) |
| hakari vs jogo | 25% (3-9-0) | 100% (12-0-0) |
| hakari vs mahito | 0% (0-12-0) | 100% (12-0-0) |
| hakari vs megumi | 4% (0-11-1) | 92% (11-1-0) |
| hakari vs choso | 8% (1-11-0) | 100% (12-0-0) |
| hakari vs todo | 0% (0-12-0) | 100% (12-0-0) |
| hakari vs maki | 0% (0-12-0) | 100% (12-0-0) |
| hakari vs hanami | 17% (0-8-4) | 92% (11-1-0) |
| hakari vs dagon | 8% (0-10-2) | 75% (6-0-6) |
| hakari vs nanami | 0% (0-12-0) | 100% (12-0-0) |
| hakari vs yuji | 4% (0-11-1) | 100% (12-0-0) |
| yuta vs mahoraga | 13% (0-9-3) | 42% (3-5-4) |
| yuta vs geto | 75% (9-3-0) | 100% (12-0-0) |
| yuta vs jogo | 100% (12-0-0) | 100% (12-0-0) |
| yuta vs mahito | 100% (12-0-0) | 100% (12-0-0) |
| yuta vs megumi | 79% (9-2-1) | 100% (12-0-0) |
| yuta vs choso | 100% (12-0-0) | 100% (12-0-0) |
| yuta vs todo | 92% (10-0-2) | 100% (12-0-0) |
| yuta vs maki | 100% (12-0-0) | 100% (12-0-0) |
| yuta vs hanami | 100% (12-0-0) | 100% (12-0-0) |
| yuta vs dagon | 100% (12-0-0) | 100% (12-0-0) |
| sukuna vs mahoraga | 21% (0-7-5) | 83% (10-2-0) |
| sukuna vs yuta | 92% (11-1-0) | 100% (12-0-0) |
| sukuna vs hakari | 100% (12-0-0) | 100% (12-0-0) |
| gojo vs mahoraga | 21% (0-7-5) | 88% (10-1-1) |
| gojo vs yuta | 75% (6-0-6) | 96% (11-0-1) |
| gojo vs hakari | 54% (1-0-11) | 63% (3-0-9) |
| gojo vs geto | 71% (6-1-5) | 100% (12-0-0) |
| gojo vs jogo | 100% (12-0-0) | 100% (12-0-0) |
| gojo vs todo | 100% (12-0-0) | 100% (12-0-0) |
| sukuna vs geto | 100% (12-0-0) | 100% (12-0-0) |
| sukuna vs todo | 96% (11-0-1) | 100% (12-0-0) |
| sukuna vs megumi | 100% (12-0-0) | 100% (12-0-0) |
| sukuna vs jogo | 100% (12-0-0) | 100% (12-0-0) |
| mahoraga vs geto | 88% (9-0-3) | 92% (10-0-2) |
| mahoraga vs jogo | 92% (10-0-2) | 88% (9-0-3) |
| mahoraga vs todo | 100% (12-0-0) | 96% (11-0-1) |
| geto vs nanami | 50% (6-6-0) | 50% (6-6-0) |
| geto vs yuji | 100% (12-0-0) | 100% (12-0-0) |
| geto vs panda | 100% (12-0-0) | 100% (12-0-0) |
| jogo vs nanami | 17% (2-10-0) | 75% (9-3-0) |
| jogo vs yuji | 92% (10-0-2) | 100% (12-0-0) |
| jogo vs panda | 92% (11-1-0) | 100% (12-0-0) |
| mahito vs nanami | 0% (0-12-0) | 75% (9-3-0) |
| mahito vs yuji | 4% (0-11-1) | 4% (0-11-1) |
| mahito vs panda | 92% (10-0-2) | 92% (10-0-2) |
| megumi vs nanami | 100% (12-0-0) | 100% (12-0-0) |
| megumi vs yuji | 100% (12-0-0) | 100% (12-0-0) |
| megumi vs panda | 100% (12-0-0) | 96% (11-0-1) |
| choso vs nanami | 8% (1-11-0) | 67% (8-4-0) |
| choso vs yuji | 0% (0-12-0) | 0% (0-12-0) |
| choso vs panda | 8% (1-11-0) | 83% (10-2-0) |
| todo vs nanami | 100% (12-0-0) | 96% (11-0-1) |
| todo vs yuji | 100% (12-0-0) | 100% (12-0-0) |
| todo vs panda | 100% (12-0-0) | 100% (12-0-0) |
| maki vs nanami | 0% (0-12-0) | 67% (8-4-0) |
| maki vs yuji | 21% (2-9-1) | 75% (8-2-2) |
| maki vs panda | 17% (1-9-2) | 88% (10-1-1) |
| hanami vs nanami | 33% (4-8-0) | 92% (11-1-0) |
| hanami vs yuji | 83% (10-2-0) | 100% (12-0-0) |
| hanami vs panda | 25% (3-9-0) | 67% (8-4-0) |
| dagon vs nanami | 0% (0-12-0) | 100% (12-0-0) |
| dagon vs yuji | 100% (12-0-0) | 100% (12-0-0) |
| dagon vs panda | 0% (0-12-0) | 100% (12-0-0) |
| geto vs jogo | 67% (8-4-0) | 67% (8-4-0) |
| mahito vs todo | 54% (3-2-7) | 50% (5-5-2) |
| megumi vs maki | 92% (11-1-0) | 75% (9-3-0) |
| choso vs hanami | 0% (0-12-0) | 8% (1-11-0) |
| dagon vs jogo | 100% (12-0-0) | 100% (12-0-0) |
| todo vs maki | 88% (10-1-1) | 63% (6-3-3) |
| geto vs megumi | 0% (0-12-0) | 0% (0-12-0) |
| mahito vs hanami | 83% (8-0-4) | 75% (9-3-0) |
| nanami vs nobara | 83% (10-2-0) | 92% (11-1-0) |
| nanami vs inumaki | 96% (11-0-1) | 100% (12-0-0) |
| yuji vs nobara | 75% (9-3-0) | 92% (11-1-0) |
| yuji vs inumaki | 100% (12-0-0) | 100% (12-0-0) |
| panda vs nobara | 92% (11-1-0) | 88% (10-1-1) |
| panda vs inumaki | 92% (10-0-2) | 96% (11-0-1) |
| nanami vs yuji | 29% (3-8-1) | 50% (6-6-0) |
| yuji vs panda | 0% (0-12-0) | 25% (3-9-0) |
| nanami vs panda | 75% (9-3-0) | 46% (5-6-1) |
| nobara vs inumaki | 100% (12-0-0) | 100% (12-0-0) |
| nobara vs flyhead | 100% (12-0-0) | 100% (12-0-0) |
| inumaki vs flyhead | 100% (12-0-0) | 100% (12-0-0) |

Deliberate upsets (lore secrets): Yuji beats Mahito (his fists hurt Mahito's soul) and
Choso switches sides next to Yuji ("Big brother!"), so those two A-vs-B rows read 0-4%.
Not quite on target: Hakari draws a lot (a jackpot out-heals Gojo's and Mahoraga's damage
until the 90 s cap; he never loses to Gojo); Toji is Hakari's counter (the sure-hit can't
find him and the spear cuts the domain open: about 60% for Toji); within the A tier Geto
loses to Megumi (the ritual Mahoraga) and Choso to Hanami.

### Equal-gold scores (final stats, 4 battles per pairing, 36 per unit)

| unit | cost | score |
|---|---:|---:|
| Gojo | 6000 | +0.21 |
| Sukuna | 3300 | −0.03 |
| Mahoraga | 2600 | +0.03 |
| Yuta | 1700 | +0.03 |
| Hakari | 1500 | +0.06 |
| Toji | 1400 | −0.03 |
| Jogo | 1250 | +0.12 |
| Megumi | 1200 | −0.16 |
| Hanami | 1150 | +0.15 |
| Dagon | 1050 | +0.04 |
| Mahito | 850 | +0.06 |
| Choso | 800 | +0.19 |
| Geto | 700 | −0.10 |
| Todo | 680 | −0.11 |
| Maki | 580 | +0.17 |
| Yuji | 430 | −0.12 |
| Panda | 420 | −0.14 |
| Nanami | 400 | −0.03 |
| Nobara | 310 | +0.07 |
| Inumaki | 560 | −0.78 alone; −0.05 with a quarter of the gold in a Squire line (support) |
| Fly Head | 26 | −0.31 (unchanged; drifted since the collision fix) |

Gojo's score barely moved with price (one Gojo against 3500 or 6000 gold scored about the
same: behind Infinity the size of the crowd matters little), so his army strength was cut
with stats a duel doesn't use: the Void's damage is shared out among everyone inside, and
it opens for 6+ enemies (or a hero or boss) instead of 3. Prices follow the tiers except
Inumaki, whose 560 is his worth as support inside a line.

    node battles/dev/balance/run.mjs --units jk_gojo,jk_sukuna,jk_mahoraga,jk_megumi,jk_yuta,jk_toji,jk_hakari,jk_geto,jk_jogo,jk_mahito,jk_choso,jk_todo,jk_maki,jk_hanami,jk_dagon,jk_nanami,jk_yuji,jk_panda,jk_nobara,jk_inumaki,jk_flyhead,squire+jk_inumaki@0.25 --runs 4 --procs 4 --out /tmp/jjk-power.jsonl
    node battles/dev/balance/report.mjs /tmp/jjk-power.jsonl

## Minecraft faction

`src/packs/minecraft.js`, priced against the reference panel at equal gold (`run.mjs --runs 4`,
36 battles per unit, sides swapped). First drafts were far off (−0.4 to −1.0): bare fists lost to
every club, the cube heads (drawn on a 1.45× head ball) kept units from getting back up, Steve's
attack animation didn't exist, Creepers died before their fuse ran out and the tall Endermen
swung over people's heads. Fixes: normal head balls with the cubes drawn bigger and lifted,
two-fisted punches (like JJK's brawlers), low stagger for the Zombie, Enderman and Golem, a
0.7 s fuse that goes off even if the Creeper is killed mid-hiss, shorter Enderman legs, and
fall damage when the Golem's launch lands.

| unit | cost | hp | role | score | notes |
|---|---:|---:|---|---:|---|
| Villager (`mc_villager`) | **15** | 60 | fodder | −0.08 | panics when hurt; mobs archers and gunslingers |
| Zombie (`mc_zombie`) | **42** | 180 | melee | −0.08 | stagger 0.45 |
| Skeleton (`mc_skeleton`) | **125** | 70 | ranged | −0.01 | falls apart when it dies |
| Creeper (`mc_creeper`) | **65** | 60 | bomber | −0.17 | trades 1:1 with cheap armies (draws), loses to giants and kings |
| Witch (`mc_witch`) | **125** | 110 | ranged | −0.07 | harming 80 (2 in 5), poison 18/s for 5 s (2 in 5), slowness (1 in 5); r 3.3 |
| Steve (`mc_steve`) | **200** | 300 | melee | −0.01 | diamond sword 46 |
| Enderman (`mc_enderman`) | **320** | 450 | assassin | +0.02 | teleports to targets 7 m+ away every ~4.5 s; dodges a shot from 5 m+ away by teleporting to the shooter (every 3.5 s) |
| Iron Golem (`mc_golem`) | **1100** | 1400 | tank | +0.01 | punches launch (9 m/s up, less for heavy units) and the landing hurts |

    node battles/dev/balance/run.mjs --units mc_villager,mc_zombie,mc_skeleton,mc_creeper,mc_witch,mc_steve,mc_enderman,mc_golem --runs 4 --out /tmp/mc.jsonl
    node battles/dev/balance/report.mjs /tmp/mc.jsonl

## Avatar: the Fire Nation

`src/packs/avatar-fire.js`, priced against the reference panel at equal gold (`run.mjs --runs 4`,
36 battles per unit). First draft: Azula −0.30 (mobbed in melee with every move gated on range);
she got a blue spin kick that throws crowds off her and a dash usable from 3 m. Zuko (+0.38),
Iroh (+0.24) and Combustion Man (+0.17) were repriced up, the Soldier down.

| unit | cost | hp | role | score | notes |
|---|---:|---:|---|---:|---|
| Fire Nation Soldier (`av_fn_soldier`) | **68** | 130 | line | −0.04 | spear 26; fire jab 20 (9 m, burn 6/s) |
| Zuko (`av_zuko`) | **600** | 520 | melee hero | +0.07 | dao 34 + burn; daggers 2×26; spin ring 55 r3.2 every 6 s; stagger 0.6 |
| Azula (`av_azula`) | **1000** | 600 | skirmisher | +0.04 | blue jets 2×34; dash burst 60; spin 50; lightning 220 (34 m, 1.6 s stun, every 7.5 s); stagger 0.5 |
| Iroh (`av_iroh`) | **1150** | 950 | tank / counter | +0.08 | fists 38; blast 60; breath 90/s cone 5.5 m; redirects lightning (takes 8%, returns 120–400); stagger 0.4 |
| Combustion Man (`av_sparky`) | **700** | 620 | artillery | −0.07 | beam blast 130 r3.6 (allies 40%), range 34 m, every 4.4 s; fists 45 inside 4 m |

Duels: Iroh beats Azula 4–2 (her lightning comes back at her), Zuko beats a Soldier 6–0,
Iroh–Zuko 3–3, Azula–Zuko 2–4.

    node battles/dev/balance/run.mjs --units av_fn_soldier,av_zuko,av_azula,av_iroh,av_sparky --runs 4 --out /tmp/av.jsonl
    node battles/dev/balance/report.mjs /tmp/av.jsonl

## Avatar: Team Avatar and the Earth Kingdom

`src/packs/avatar-benders.js`, priced the same way. In the first draft Katara at 300 scored +0.84
(kiting, healing and ice slow stacked against slow heavies); a higher price, a weaker kit (whip
34→26, heal 55→40, ice 18→14 every 5.5 s, slow 1.5 s) and less kiting fixed her. Kyoshi Warriors
at 150 scored −0.57; they are now cheaper and tougher.

| unit | cost | hp | role | score | notes |
|---|---:|---:|---|---:|---|
| Aang (`av_aang`) | **1450** | 520 | hero | +0.06 | Avatar State once below 35%; strong vs cheap lines, weak vs Gunslingers/Kings |
| Katara (`av_katara`) | **500** | 260 | ranged support | −0.07 | +0.18 in a Squire line at 25%; kites heavies (+0.9 vs Giant), loses to rushes |
| Sokka (`av_sokka`) | **140** | 150 | melee + boomerang | +0.01 | |
| Toph (`av_toph`) | **580** | 380 | earthbender | +0.01 | stagger 0.4; earth armour once below 50% |
| Earthbender (`av_earthbender`) | **170** | 110 | ranged | −0.03 | crushes Knights/Giants/Kings, loses to cheap rushes |
| Kyoshi Warrior (`av_kyoshi`) | **95** | 190 | melee | −0.01 | turns aside 35% of melee blows |
