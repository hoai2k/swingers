# Wobblers image requests

**Status: round 16 is open (two reference sheets).** Rounds 1–15 are delivered; see `image-requests-history.md`.

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

- **Overall style:** bright, soft and toy-like: rounded chunky shapes, saturated
  candy colours, clean flat shading with a gentle highlight. Cheerful and silly,
  never realistic. No company logos or real brand names, and never another
  game's characters.
- **Characters** (anywhere: posters, paintings, covers, and the little icons on signs) must look
  like *our* Wobblers in the game's default **toy style** — see
  `assets/reference/ref_character_sheet.png` (rendered from the game): a chunky soft-toy figure
  with a round head about as wide as the shoulders, a smooth rounded body and thick tube arms
  and legs. **Skin** (head, arms, mitten hands, legs) is one soft colour per character: a
  gentle, slightly muted tone of their own colour — soft blue, coral red, mint green, teal,
  warm gold, rose pink, lilac… — never plain peach and never bright yellow on everyone; vary
  it between characters. The slightly flat front of the head carries a simple printed cartoon
  face (glossy cartoon or dot eyes, small smile, pink cheeks). **Clothes are layered on top**:
  a T-shirt in a *different* bright colour from the skin (short sleeves over skin-coloured
  arms), darker navy-ish trousers, chunky dark shoes with pale soles; hats and caps are in the
  shirt colour, never the skin colour. **Never** draw them as yellow, faceless or dot-eyed
  blobs in the style of other games. The older reference sheets (`ref_town.png`,
  `ref_outfits.png`, `ref_npcs_*.png`, `ref_funpark.png`...) predate this: use them for places,
  vehicles and outfits only, never for how a character's body, skin or face looks.
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

## OPEN round 16 — wildlife reference sheets (for modelling, never loaded by the game)

Sea creatures and jungle animals are being added as simple 3D models built from rounded
primitives. These sheets guide their shapes and colours; the game already has stand-in models,
so these only refine them. Same overall toy style as the game: chunky, rounded, soft, candy
colours, cute faces with glossy dot eyes, never realistic or scary.

1. `assets/reference/ref_sea_creatures.png` (1920 × 1080): a turnaround-style sheet (side view
   plus a three-quarter view each, on a plain pale-blue background, labelled) of toy-like
   sea creatures: a shark, a school of tropical fish (clownfish, blue tang, yellow tang,
   angelfish), a sea star, a jellyfish, an octopus, a dolphin, a humpback whale, a manta ray,
   a sea turtle, a seahorse, a crab, a pufferfish and a friendly long-necked plesiosaur.
   Prompt: "Character reference sheet of cute toy-like sea creatures for a bright cartoon
   game, chunky rounded soft-vinyl shapes, candy colours, glossy dot eyes, simple shapes
   readable from a distance, side and three-quarter views, labelled, plain pale blue
   background: shark, clownfish, blue tang, yellow tang, angelfish, sea star, jellyfish,
   octopus, dolphin, humpback whale, manta ray, sea turtle, seahorse, crab, pufferfish,
   friendly plesiosaur."
2. `assets/reference/ref_jungle_animals.png` (1920 × 1080): the same kind of sheet for jungle
   animals: a monkey, a tiger, a leopard, a red river hog, a capybara, a tapir, a snake
   (python), a crocodile, a toucan and a parrot.
   Prompt: "Character reference sheet of cute toy-like jungle animals for a bright cartoon
   game, chunky rounded soft-vinyl shapes, candy colours, glossy dot eyes, simple shapes
   readable from a distance, side and three-quarter views, labelled, plain pale green
   background: monkey, tiger, leopard, red river hog, capybara, tapir, python snake,
   crocodile, toucan, macaw parrot."

