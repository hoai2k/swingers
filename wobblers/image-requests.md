# Wobblers image requests

**Status: rounds 15 remain open; delivered rows are in `image-requests-history.md`.**

## OPEN round 15 — repaint every character in the toy style (12 pictures, 3 signs)

The game's characters now default to the **toy style** (see *Characters* above and the
re-rendered `assets/reference/ref_character_sheet.png`). These delivered images still show
older looks: yellow faceless blobs (Wobbly Life style) or the peach-skinned look. Repaint
**only the characters** in toy style; keep each image's scene, composition, colours, layout
and **exact words** as they are now (edit the existing file; same path and size; posters stay
opaque, signs keep their board and a background `clean_signs.py` can key out). Suggested
skin / shirt pairs are given so the cast varies; any similar soft-skin + contrasting-shirt
pairing is fine.

| File (`assets/…`) | Size | Characters to repaint |
|---|---|---|
| `posters/clothes_fashion.png` | 512 × 716 | the model in the sombrero, poncho and heart shades (NEW LOOKS): lilac skin, the striped poncho as the top layer |
| `posters/homes_cottage.png` | 768 × 528 | the waving person by the FOR SALE sign: soft blue skin, purple shirt, straw hat |
| `posters/painting_island.png` | 768 × 528 | everyone on the island painting (the people on the hilltop and in town): varied soft skins, contrasting shirts |
| `posters/portrait_family.png` | 512 × 666 | the family of three (top hat, bow, child): warm gold, rose pink and soft blue skin; yellow, pink and blue shirts kept |
| `posters/wanted_kid.png` | 512 × 716 | CACTUS KID hugging the cactus: mint green skin, green shirt, brown cowboy hat |
| `posters/wanted_pete.png` | 512 × 716 | WOBBLY PETE the outlaw: coral skin, orange shirt, red bandana, black hat |
| `ui/cover.png` | 1600 × 900 | all five Wobblers on the cover (jumping, bouncy ball, carrying a box, waving from the car): varied soft skins (blue, coral, mint, gold, pink) with contrasting shirts; still no text, calm sky at the top |
| `signs/jump.png` | 1024 × 256 | the little diving figure on the right of JUMP: soft blue skin, red-and-white swimsuit |
| `signs/ski_jump.png` | 1024 × 256 | the skier on the right of SKI JUMP: coral skin, red ski jacket and helmet, goggles |
| `signs/wobblecorp.png` | 1024 × 256 | the round mascot face on the left of WOBBLECORP: a toy-style Wobbler head (teal skin, printed smile, pink cheeks) instead of the yellow blob |


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
