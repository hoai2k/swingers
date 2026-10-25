# Wobblers image requests

**Status: 10 signs remaining.** Rounds 1–10 are delivered;
see `image-requests-history.md` for those requests and their review notes.

## OPEN round 11 — Stratford Fall Fair, arcade cabinets, gadgets, phone booths (22 signs)

The game draws a procedural stand-in for each until the art arrives. The fair is
an autumn county fair (falling leaves, pumpkins, hay bales), so its signs lean on
warm fall colours; arcade marquees are glowing neon on black. No real brand or
game names, logos or characters.

- `signs/ferris_wheel.png` (1024 × 256) — **FERRIS WHEEL**: big wheel: warm gold board, maroon letters, small wheel icon (autumn-fair version).
- `signs/carousel.png` (1024 × 256) — **CAROUSEL**: classic carousel: cream board with gold scroll trim, red letters, small carousel-horse icon.
- `signs/mini_train.png` (1024 × 256) — **MINI TRAIN**: kiddie train ride: green board, yellow letters, small steam-engine icon.
- `signs/magic_tent.png` (1024 × 256) — **MAGIC TENT**: fortune-teller style tent where players change shape: deep purple board with gold stars, glowing gold letters, small crystal-ball icon.
- `signs/gadgets.png` (1024 × 256) — **GADGETS**: gadget shop (jetpacks, boots, laser gun): teal board, white letters, small jetpack icon.
- `signs/phone.png` (1024 × 256) — **PHONE**: phone booth where players fetch their vehicles: red board, white letters, small old-style telephone icon.
- `signs/chomp_maze.png` (1024 × 256) — **CHOMP MAZE**: arcade cabinet marquee for a maze-chomping game: black board, glowing yellow letters, small round-chomper icon (original character, not any real game's).
- `signs/space_raiders.png` (1024 × 256) — **SPACE RAIDERS**: arcade cabinet marquee for a shoot-the-aliens game: black board, glowing green letters, small pixel-alien icon (original design).
- `signs/bug_blaster.png` (1024 × 256) — **BUG BLASTER**: arcade cabinet marquee for a shoot-the-bugs game: black board, glowing magenta letters, small cartoon-bug icon (original design).
- `signs/paddle_ball.png` (1024 × 256) — **PADDLE BALL**: arcade cabinet marquee for a two-player paddle game: black board, glowing white letters, small paddle-and-ball icon.

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
