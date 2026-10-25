# Wobblers image requests

**Status: 3 requested images remaining.** Rounds 1–8 are delivered;
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

## OPEN round 10 — jobs / missions (1 sign, 1 poster, 1 UI marker)

The game draws a procedural stand-in for each until the art arrives.

- `signs/jobs.png` (1024 × 256) — **JOBS**: bright job-board header, sunny yellow board with a chunky white rounded border, big dark-blue rounded letters, small clipboard-with-tick icon (on the job board on every island).
- `posters/job_board.png` (716 × 512, landscape, opaque) — a cork notice board crammed with cheerful pinned job notes and doodles (a pizza slice, a fire truck, a sheep, a taxi, a snowflake, a cactus, a palm tree), coloured push-pins, a few coins drawn on the notes; toy-like, no readable small text except the word **JOBS** at the top. Hangs under the JOBS sign.
- `ui/job_marker.png` (256 × 256, transparent) — floating quest marker: a big chunky yellow-orange exclamation mark "!" with a thick dark-blue rounded outline inside a soft white round badge, glossy toy look, centred with a little margin. Floats over job-giver NPCs and job boards.
