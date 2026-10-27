# Wobblers image requests

**Status: round 16 remains open (5 animal sheets).** Rounds 1–15 are delivered; see `image-requests-history.md`.

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

## OPEN round 16 — animal model turnarounds (for modelling, never loaded by the game)

The game now has sea creatures and jungle animals (`src/world/sealife.js`,
`src/world/regions/jungle/animals.js`) modelled in code. These renders are what the models are
rebuilt to match, so they need to show clear, simple 3D shapes from known angles.

**Owner's art direction (2026-10-27):** use a midpoint between baby-toy animals and
realistic wildlife renders. These are rounded, expressive **stylized game animals** with
recognisable adult anatomy, longer bodies and modestly enlarged heads/eyes. Keep broad
painted markings, clean smooth sculpted forms and simplified materials; no realistic fur,
tiny scales, wrinkles or skin grain. Avoid chibi proportions, blush and human baby-toy grins.
Sharks, crocodiles and big cats should retain some danger through posture, focused eyes,
teeth, claws and their species silhouettes. Keep the tone light-hearted rather than gory.
Plain light grey background, soft studio lighting, no text or ground clutter.

**Layout for every image (1920 × 1080):** the same animal three times, side by side, all at the
same scale: left = exact side view (facing right), middle = exact top view (head toward the
right), right = three-quarter front view. Whole animal in frame in every view.

Files (all in `assets/reference/animals/`), with the animal to draw:

| file | animal |
|---|---|
| `capybara.png` | a capybara |
| `tapir.png` | a Malayan tapir (black with a white saddle) |
| `snake.png` | a python, gently wavy, yellow and green |
| `crocodile.png` | a crocodile, mouth slightly open |
| `parrot_toucan.png` | a scarlet macaw and a toucan, wings spread (one row each) |

Prompt template: "Stylized 3D adventure-game {animal}, a midpoint between a nursery toy
and realistic wildlife: recognisable adult species anatomy, rounded simplified shapes,
medium-small expressive eyes, broad painted colours and markings, smooth soft sculpted
material. No realistic microtexture, oversized baby head, blush or human grin. Predators
keep focused eyes, teeth and a sense of danger. Plain grey studio background. Three equal
columns, same animal at the same scale in one horizontal row: exact side facing right,
true overhead top with the entire spine/head/tail on one horizontal left-to-right axis,
front three-quarter. Whole animal and appendages in frame, no twisted anatomy. No text."
