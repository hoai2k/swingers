# Wobblers image requests

**Status: 23 requested signs remaining.** Rounds 1–6 are delivered and integrated;
see `image-requests-history.md` for those requests and their review notes.

## How delivery works

Every image has a procedural stand-in, so requests are upgrades, not blockers.
Save each file at its path under `wobblers/assets/`, then from `wobblers/` run
`python3 tools/clean_signs.py` (only if signs were added) and
`python3 tools/build_manifest.py`. The game loads only files listed in
`assets/manifest.json`, so missing art never causes errors. Reference sheets go
in `assets/reference/` and are never loaded by the game. Record prompts in
`assets/generation.json`, and when a round is delivered move it from this file
to the top of `image-requests-history.md`.

## Style and formats (apply to every round)

- **Overall style:** the bright, soft, toy-like look of *Wobbly Life*: rounded
  chunky shapes, saturated candy colours, clean flat shading with a gentle
  highlight. Cheerful and silly, never realistic. No company logos or real
  brand names. Characters are the game's wobbly bean people (round head, pear
  body, stubby limbs, mitten hands) — see `assets/reference/ref_character_sheet.png`.
- **Signs** (`assets/signs/<words>.png`, 1024 × 256): the exact words, spelled
  correctly, in big chunky rounded letters plus one small icon. A plain
  background around the board is fine (`clean_signs.py` keys it out). The file
  name is the words in lower case with spaces as underscores
  (`HOT DOGS` → `hot_dogs.png`); the game finds it from the sign's text.
- **Faces** (`assets/faces/face_<name>.png`, 512 × 512, transparent): features
  only (eyes, brows, mouth, maybe blush), no head outline or skin. Flat cartoon
  features with thick, dark, rounded outlines and solid fills, like
  `face_happy.png` and `face_winky.png`; no realistic or anime eyes, no thin
  lashes, no gradients. The game crops to the features and scales them, so
  framing doesn't need to match exactly.
- **Posters / paintings** (`assets/posters/<name>.png`): opaque, filling the
  frame, at the exact size given in the request (the game stretches to the
  frame's proportions).
- **Reference sheets** (`assets/reference/`): any 16:9 around 1920 × 1080.

## For agents adding requests

Add requests **as early as possible**: as soon as you know the exact sign words,
face names or poster names your feature uses (even before the feature is
finished), write them here under a new `## OPEN round N` heading and commit and
push that change right away on its own, so the art can be generated while you
keep building. Use the formats above, give every file an exact path, size and
prompt, and keep the procedural stand-in in the game until the art arrives.

## OPEN round 7 — region signs: Bigtown, Frostpeak, Dusty Dunes (32 signs)

All `assets/signs/<file>`, 1024 × 256, the exact words in big chunky rounded
letters plus one small icon (style rules above). The game draws a procedural
stand-in for each until the art arrives.

### Bigtown (city)

- `jump.png` — **JUMP**: bright red board, white letters, small diving-bean icon (the jump-off plank on top of Bigtown Tower).
- `wobblecorp.png` — **WOBBLECORP**: teal glass-office board, white letters, little wobbly-bean logo icon (invented company).
- `police.png` — **POLICE**: navy board, white letters, gold star badge icon (also shown on the sides of the police car).
- `play_me.png` — **PLAY ME**: pink board, white letters, piano-keys icon (street piano).

### Frostpeak (snow)


### Dusty Dunes (desert)

- `sheriff.png` — **SHERIFF**: weathered brown wood planks, cream western-style letters, small gold star.
- `general_store.png` — **GENERAL STORE**: faded red-painted wood, cream western letters, barrel or sack icon.
- `gas.png` — **GAS**: red roadside board, white rounded letters, fuel-pump icon.
- `gold_mine.png` — **GOLD MINE**: rough nailed timber planks, yellow-gold letters, pickaxe icon.
- `dig_site.png` — **DIG SITE**: sandy-beige wooden board with rope edging, dark brown letters, dinosaur-bone icon.

## OPEN round 8 — region signs: Tiki Jungle, Coconut Cove (14 signs)

All `assets/signs/<file>`, 1024 × 256, the exact words in big chunky rounded
letters plus one small icon (style rules above). The game draws a procedural
stand-in for each until the art arrives.

### Tiki Jungle (jungle)

- `volcano_trail.png` — **VOLCANO TRAIL**: rough bamboo-framed wooden board, cream letters, small smoking volcano icon.
- `raft_ride.png` — **RAFT RIDE**: lashed log-raft board, white letters, small paddle-and-splash icon.
- `temple_ruins.png` — **TEMPLE RUINS**: mossy grey carved-stone tablet, yellow-gold letters, small stepped pyramid icon.
- `hot_lava.png` — **HOT LAVA**: orange-red warning board with black hazard stripes on the edges, white letters, small flame icon.
- `jungle_tours.png` — **JUNGLE TOURS**: olive-green safari board, cream letters, small green jeep icon.
- `waterfall.png` — **WATERFALL**: teal-blue wooden board with vines on the corners, white letters, small waterfall icon.

### Coconut Cove (tropical)

- `coconut_resort.png` — **COCONUT RESORT**: sunny turquoise board with a thatched-straw top edge, white letters, small palm-tree-and-coconut icon.
- `pool_bar.png` — **POOL BAR**: bamboo-framed pink board, white letters, small coconut cocktail with umbrella icon.
- `boat_hire.png` — **BOAT HIRE**: white board with navy rope border, navy letters, small speedboat icon.
- `lighthouse.png` — **LIGHTHOUSE**: red-and-white striped board, white letters on a red band, small lighthouse icon.
- `volleyball.png` — **VOLLEYBALL**: sandy-yellow board, blue letters, small volleyball icon.
- `snorkel_reef.png` — **SNORKEL REEF**: aqua board with little bubbles, white letters, small snorkel mask and fish icon.
- `shipwreck.png` — **SHIPWRECK**: weathered dark driftwood planks, bone-white pirate-style letters, small skull-and-crossbones icon.
- `lifeguard.png` — **LIFEGUARD**: bright red board, white letters, small red-and-white life-ring icon.
