# Wobblers image requests

**Status: round 5 open (12 images).** Rounds 1–4 are delivered and integrated;
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

## OPEN round 5 — shops, homes and pets (12 images)

The game draws a procedural stand-in for each until the art arrives.

### Signs (`assets/signs/`, 1024 × 256, exact words)

- `clothes.png` — **CLOTHES**: chunky rounded letters on a pink board, small coat-hanger and T-shirt icon.
- `pet_shop.png` — **PET SHOP**: rounded letters on a sky-blue board, small paw-print icon.
- `homes.png` — **HOMES**: rounded letters on a green board, small house-and-key icon (the estate agent).
- `car_dealer.png` — **CAR DEALER**: rounded letters on an orange board, small toy-car icon.

### Faces (`assets/faces/`, 512 × 512, transparent, features only — new clothes-shop faces)

- `face_heart_eyes.png` — two big red heart-shaped eyes and a wide happy smile.
- `face_tongue_out.png` — round eyes, open grin with a pink tongue sticking out.
- `face_dizzy.png` — spiral swirl eyes and a wavy zig-zag mouth.
- `face_nerd.png` — small eyes behind big thick round glasses, buck-tooth grin.

### Posters (`assets/posters/`)

- `pets_adopt.png` (512 × 716) — pet-shop poster saying **ADOPT A PAL!**, a cute toy-like dog, cat, bunny and penguin together.
- `clothes_fashion.png` (512 × 716) — fashion poster saying **NEW LOOKS**, a wobbly bean person posing in a sombrero and heart sunglasses.
- `homes_cottage.png` (768 × 528) — estate-agent landscape picture of a cute pastel bungalow with a red roof and garden, a **FOR SALE** tag in one corner.
- `cars_sale.png` (512 × 716) — car-dealer poster saying **BIG DEALS**, a chunky toy sports car and a helicopter.
