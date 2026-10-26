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

## Jujutsu faction (new units)

Priced with the same harness: 6 battles per pairing against the reference panel (54 per
unit), sides swapped. Support units are also scored in a Squire line with 25% of the
gold. First drafts (2 runs per pairing) were far off: the Four-Armed King at 2400 scored
+0.42 (the domain flattened every melee blob), the Shadow Summoner at 280 +0.49 (the
wolves are rarely targeted), Cursed Spirits at 40 with fists −0.70 and Brawlers −0.24
(fists are out-reached by every sword). Fists became short pack items (`jj_fist`,
`jj_claw`, like the Monk's palm), and prices and numbers moved to the final values:

| unit | cost | hp | role | alone | in line (25%) | notes |
|---|---:|---:|---|---:|---:|---|
| Cursed Spirit (`jj_spirit`) | **35** | 80 | cheap swarm | −0.10 | | beats archers and gunslingers by mobbing them, loses to anything sturdier |
| Cursed Brawler (`jj_brawler`) | **125** | 160 | melee | −0.05 | | 20% black flash: 2.5× damage, big knockback |
| Nail Witch (`jj_nail`) | **160** | 95 | ranged | −0.03 | | cooldown 2.9 s (in line with the reload pass); resonance 30 dmg at most every 5 s; loses to rushes, beats giants and kings |
| Shadow Summoner (`jj_shadow`) | **420** | 120 | summoner | +0.08 | −0.04 | two wolves (90 hp, 20 per bite) for 11 s, 4 s between summons; polarised: +0.85…+1.0 vs giants and kings, −0.86 vs gunslingers |
| Cursed Speaker (`jj_speaker`) | **200** | 105 | support | −0.57 | +0.02 | knock-down cone every 7 s; alone it stalls (13 of 54 battles hit the time cap) |
| Blindfolded Sorcerer (`jj_sorcerer`) | **1450** | 460 | hero | −0.01 | | infinity 6 s on / 3 s off; orb 110 dmg every 5.5 s; beats ranged (+0.45…+0.79), loses to giants and kings |
| Four-Armed King (`jj_king`) | **2800** | 2000 | boss | +0.07 | | 4 cuts of 50 per 1.4 s within 6.5 m; domain (r 8 m, 4 s, 12 per 0.4 s tick, allies take half) every 14 s once 4+ enemies are close; beats blobs, loses to knights and the mixed army |

Every one is within ±0.10 of even (standard error about ±0.05; the elites are lumpier).
Re-run with:

    node battles/dev/balance/run.mjs --units jj_spirit,jj_brawler,jj_nail,jj_shadow,jj_speaker,jj_sorcerer,jj_king,squire+jj_speaker@0.25,squire+jj_shadow@0.25 --runs 6 --procs 4 --out /tmp/jj.jsonl
    node battles/dev/balance/report.mjs /tmp/jj.jsonl

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
