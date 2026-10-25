# Wobbly Battles: what's left to do

The current state is on `main`. This list covers work that is known but not done, roughly
in priority order. See `README.md` for what the game has, `BALANCE.md` for unit balance
and `image-requests.md` for art (no open requests right now).

## 1. Needs a human (can't be checked headlessly)

- **Play with two real Xbox controllers.** All controller testing so far used simulated
  input (`input.inject` and fake `navigator.getGamepads`). Check pad slots, swapping
  sides, rumble, unplugging and replugging, and holding vs tapping (View: tap to switch
  side, hold to clear).
- **Listen to the audio.** Voices, impacts, music and the slow-motion pitch drop were
  only checked offline for level, clipping and node counts.
- **Frame rate on a real GPU**, especially in big battles, the new maps (Graveyard has
  the most props) and split screen. Only the simulation cost was measured: about 14 ms per
  physics step for a packed 150-unit melee on this container's CPU. Try the Low/Medium
  quality settings on a weak machine.

## 2. Campaign: 11 levels under construction

The balance pass changed many prices, so the campaign solver re-checked every level. It
finished **39 of 50** levels, and their star targets and budgets now come from the new
prices.

These 11 are marked **🚧 Under construction** in the level select (`wip: true` in
`src/campaign.js`). They can still be played, but their stars and budget are from before
the balance pass and may be too easy, too hard or unwinnable:

- **Good & Evil:** g5 End of Time
- **Total Battle:** f1–f5
- **Secret Stash:** s1–s5

To finish them, from the repo root:
```
node battles/dev/campaign/solve.mjs g5 f1 f2 f3 f4 f5 s1 s2 s3 s4 s5
node battles/dev/campaign/apply.mjs --write
node battles/dev/campaign/report.mjs
```
Then remove `wip: true` from each level that reports winnable with every star tier
reachable, and test the level select.

Notes:
- `solve.mjs` merges into `battles/dev/campaign/results.json`.
- Fights are cached in `cache.jsonl` (keyed by roster), so an interrupted run resumes.
- g5 and the Total Battle levels have big armies and take hours on a busy 4-core
  machine. A run in a cloud session can be killed by container restarts or the 2-hour
  background limit; just restart it.
- The solver uses 2 search seeds plus 6 confirmation seeds, so thresholds are good
  estimates, not proven optimums.

## 3. Balance (see `BALANCE.md`)

Prices now give even trades within about ±0.1 for units that can fight on their own. The
remaining outliers need **behaviour** changes, not numbers:

- **Hwacha and Catapult** aim at where the target was when they fired, so they miss
  anything moving and lose to rushes. They need target leading (as archers do) or
  splash that lands where enemies are heading.
- **Mammoth:** all or nothing. It crushes melee blobs but loses to gunslingers, and it
  often can't finish off the heavies it keeps knocking over, so battles hit the time cap.
- **Cavalry:** the score is fair, but it wheels away between charges and never finishes
  the last enemies (time-cap battles). It needs a finishing behaviour.
- **Bard:** the buff strength is a constant in `unit.js`, so the Bard can only be
  balanced by price.
- **War Elephant:** if its rider dies, enemies must kill the 2400 hp elephant before they
  can reach the second archer. This is deliberate (it ends the battle properly), but it
  makes those fights long.
- **Unit Creator prices:** a size-1.45 royal-sword "champion" is a little cheap. Custom
  guns cost about 30% more than the Gunslinger. Both come from the cost formula in
  `src/packs/custom.js`.
- After any stat change, re-run the balance harness (`battles/dev/balance/`) and then
  the campaign solver (section 2).

## 4. Smaller known issues

- **Setup:** the faction tab row scrolls to the selected faction, but with up to 16 tabs (15
  factions, plus Custom once you've saved a custom unit) the far tabs are hidden until you scroll there. It could use paging
  arrows or a two-row layout.
- **Performance:** frame rate drops after switching maps many times in one session
  (`loadMap`). This predates the new maps; probably GPU resources that aren't disposed.
- **Replay:** the recording is capped at 6 minutes (30 Hz). Longer battles stop recording
  at that point.
- **Unit Creator:** custom units aren't allowed in the campaign (worlds restrict factions).
  There's no import/export or sharing of custom units.

## 5. Possible next features

- Online or remote play. Everything is local split screen today.
- More maps (each new map needs a preview image request) and dynamic weather.
- Campaign levels using the new maps' terrain (walls, rivers, high ground).
- An "army code" to save and share armies between players or browsers.
- Steam-style achievements and unit unlocks like TABS's secret units.
