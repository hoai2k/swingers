# Wobblers image requests

**Status: round 18 remains open (12 animal sheets).** Rounds 1–17 are delivered; see `image-requests-history.md`.

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


## OPEN round 18 — more animal turnarounds (desert, snow, islands, city, suburbs)

New wildlife for the other islands (`src/world/regions/*/animals.js`, `src/world/townlife.js`). The
code runs on simple stand-in shapes until these arrive; then each model is built from its sheet the
same way as round 16 (`tools/animals/quad.py` / `designed.py`). **Same art direction and layout as
round 16** (see `image-requests-history.md`): a midpoint between baby-toy animals and realistic
wildlife, rounded expressive stylized game animals with recognisable adult anatomy, broad painted
markings, smooth sculpted forms, no fur / scale / wrinkle detail, no chibi proportions or human
grins; plain light grey background, soft studio light, no text, no ground clutter.

**Layout for every image (1920 × 1080):** the same animal three times, side by side, all at the same
scale: left = exact side view (facing right), middle = exact top view (head toward the right),
right = three-quarter front view. Whole animal in frame in every view, standing in a neutral
walking pose with all legs visible. **Birds that fly** (vulture, crow, owl): side view standing
with wings folded; top view with the wings spread wide as in flight (head right); three-quarter
view flying with wings spread.

Files (all `assets/reference/animals/<file>`, 1920 × 1080):

| file | animal |
|---|---|
| `camel.png` | a one-humped dromedary camel, sandy tan, long legs and neck, droopy friendly eyelids |
| `fennec_fox.png` | a fennec fox: small cream-sand fox with huge ears, black-tipped bushy tail |
| `roadrunner.png` | a roadrunner: speckled brown-and-cream ground bird, long straight tail, crest, long legs, running pose |
| `rattlesnake.png` | a desert rattlesnake: tan with bold brown diamond pattern down the back, rattle on the tail tip; body laid out in a gentle S like `snake.png`, head raised slightly |
| `scorpion.png` | a desert scorpion: amber-orange, two big pincers held forward, eight legs, tail curled up over the back with the stinger |
| `vulture.png` | a vulture: dark brown body and wings, bald pinkish head and neck, pale ruff (see the birds note) |
| `tortoise.png` | a desert tortoise: high domed brown shell with big plate pattern, stumpy elephant-like legs, small head |
| `mountain_goat.png` | a mountain goat: shaggy white coat (shaped as smooth rounded volumes, no fur strands), short black horns, small beard |
| `rat.png` | a city rat: grey-brown, pink ears, hands, feet and long thin pink tail, a bit cheeky rather than gross |
| `squirrel.png` | a grey squirrel with a big fluffy S-curved tail and a pale belly |
| `crow.png` | a glossy black crow with a slight blue-purple sheen and a strong black beak (see the birds note) |
| `cat.png` | an orange tabby house cat with broad darker stripes, white chest and paws, tail up |

## For agents adding requests

Add requests **as early as possible**: as soon as you know the exact sign words,
face names or poster names your feature uses (even before the feature is
finished), write them here under a new `## OPEN round N` heading and commit and
push that change right away on its own, so the art can be generated while you
keep building. Use the formats above, give every file an exact path, size and
prompt, and keep the procedural stand-in in the game until the art arrives.
