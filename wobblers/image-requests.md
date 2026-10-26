# Wobblers image requests

**Status: round 12 is OPEN (on hold until the owner picks the final character look, see
round 12).** Rounds 1–11 are delivered; see `image-requests-history.md` for those requests
and their review notes.

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
- **Characters** must look like *our* Wobblers, as rendered in the game — see
  `assets/reference/ref_character_sheet.png` (made from in-game renders):
  a chunky soft-toy figure with a big round **peach-skinned head** (#ffd9b8)
  whose slightly flat front carries a simple printed cartoon face (dot or
  glossy cartoon eyes, small smile, pink cheeks); one smooth bean body in a
  single bright **shirt colour** (red, blue, green, yellow, teal, pink,
  purple, orange) with **darker matching trousers** below; thick tube arms
  with **white mitten hands**; chunky **dark charcoal shoes** with pale soles;
  hats sit on top of the head. **Never** draw them as yellow-skinned,
  faceless or dot-eyed blobs in the style of other games. The older
  reference sheets (`ref_town.png`, `ref_outfits.png`, `ref_npcs_*.png`,
  `ref_funpark.png`...) predate this: use them for places, vehicles and
  outfits only, never for how a character's body, skin or face looks.
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

## OPEN round 12 — paintings with characters in our real character style (6 posters + 1 cover)

**On hold until the owner confirms the character look** (the default "chunky toy"
look, a smaller head, or the one-colour "wobbly" look — compare with `?style=` /
`?head=` in the game). Before generating, re-render
`assets/reference/ref_character_sheet.png` from the chosen look and use it as the
character reference for every image here.

These replace delivered images whose characters were drawn yellow and featureless
(not our game). Keep each picture's subject, layout and size; only the characters
change. `painting_island.png` is also the Wobblers cover picture in the mini game
library, so it matters most. Same paths and sizes, opaque, filling the frame.

| File (`assets/…`) | Size | Prompt |
|---|---|---|
| `posters/painting_island.png` | 768 × 528 | A cosy, bright toy-like storybook painting of a sunny island seen from a grassy hilltop with a wooden fence: green hills, a little colourful town with a fountain plaza, a ferris wheel, a red-and-white lighthouse on cliffs, a suspension bridge, piers and boats on a turquoise sea, snowy mountains far off. In the foreground two Wobblers seen from behind and the side, waving at the view: one in a red shirt and red cap with a blue backpack, one in a blue shirt with a straw sun hat, with a small puppy; both with peach-skinned round heads, darker trousers, white mitten hands and dark shoes (see the character sheet). |
| `posters/portrait_family.png` | 512 × 666 | A framed, warm family portrait painting of three Wobblers hugging and waving against a sunny orange backdrop: a tall one in a yellow shirt with a black top hat and red bow tie, one in a pink shirt with a purple bow on the head, a small one in a blue shirt; peach-skinned round heads with happy printed cartoon faces, darker trousers, white mitten hands. |
| `posters/wanted_kid.png` | 512 × 716 | Old west WANTED poster on aged paper with torn edges: the words **WANTED** at the top and **CACTUS KID** / **REWARD 50 COINS** below; in the picture a cheeky Wobbler in a green shirt with a brown cowboy hat and red neckerchief, winking and hugging a cactus in a desert town. Peach-skinned round head with a printed cartoon face, white mitten hands, dark shoes. |
| `posters/wanted_pete.png` | 512 × 716 | Matching WANTED poster: **WANTED** at the top, **WOBBLY PETE** / **REWARD 100 COINS** below; a Wobbler outlaw in an orange shirt and black cowboy hat with a red bandana over the lower face, holding a toy water pistol, in a desert town. Peach-skinned round head with printed cartoon eyes, white mitten hands, dark shoes. |
| `posters/clothes_fashion.png` | 512 × 716 | Bright fashion-shop poster with the words **NEW LOOKS** in big bubbly letters at the top; a Wobbler in a teal shirt striking a happy pose in a colourful sombrero and striped poncho with heart sunglasses, on a sunny plaza. Peach-skinned round head, darker trousers, white mitten hands. |
| `posters/homes_cottage.png` | 768 × 528 | Estate-agent sign poster: a red **FOR SALE** board in front of a cosy cream cottage with a red roof, garden flowers and a white picket fence by the sea; a Wobbler in a purple shirt with a straw hat waving in front. Peach-skinned round head with a printed smiling face, darker trousers, white mitten hands. |
| `ui/cover.png` | 1600 × 900 | NEW. Key art / cover for Wobblers (game libraries and share images): a sunny toy-like island town street with a ferris wheel and the sea behind; in front, five Wobblers in different shirt colours (red, blue, green, yellow, pink) having fun — one mid-jump, one riding a bouncy ball, two carrying a box together, one waving from a little red car. Peach-skinned round heads with printed cartoon faces, darker trousers, white mitten hands, dark shoes, a couple of hats. Leave the top fifth calm sky for a logo; no text. |

## For agents adding requests

Add requests **as early as possible**: as soon as you know the exact sign words,
face names or poster names your feature uses (even before the feature is
finished), write them here under a new `## OPEN round N` heading and commit and
push that change right away on its own, so the art can be generated while you
keep building. Use the formats above, give every file an exact path, size and
prompt, and keep the procedural stand-in in the game until the art arrives.
