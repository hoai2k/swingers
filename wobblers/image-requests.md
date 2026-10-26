# Wobblers image requests

**Status: rounds 13 remain OPEN; delivered rows are in `image-requests-history.md`.**

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
  a chunky soft-toy figure with a round **peach-skinned head** (#ffd9b8), about as wide as the shoulders,
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


## OPEN round 13 — closed-eye (blink) frames for the painted faces (8 faces)

Characters blink every few seconds. Until these arrive the game makes each blink frame by
wiping the painted eyes and drawing a simple lid curve; a hand-painted frame looks better.
Each file is the **same face with the eyes closed**: identical canvas (512 × 512,
transparent), identical framing and positions for everything else (brows, mouth, blush,
nose, glasses, moustache) so nothing jumps when it swaps in — start from the open file and
only repaint the eyes. Closed eyes: a soft, relaxed downward-curved lid line in the same dark
outline colour and thickness as the face's other lines, about as wide as the open eye, with
any lashes kept on the lid (`lashes`). The game finds them by name
(`faces/face_<name>_closed.png`) and uses them automatically.

| File (`assets/faces/…`) | Open face it matches |
|---|---|
| `face_star_eyes_closed.png` | `face_star_eyes.png` — star eyes, big open smile (closed: happy curved lids, the smile stays) |
| `face_moustache_closed.png` | `face_moustache.png` — glossy eyes over a moustache and nose |
| `face_tongue_out_closed.png` | `face_tongue_out.png` — big round eyes, brows, tongue out |
| `face_nerd_closed.png` | `face_nerd.png` — dot eyes behind round glasses (the glasses stay, eyes closed behind them) |

Not needed: heart eyes (they beat bigger instead of blinking), dizzy (the spirals spin),
cool shades (the glasses lift) and robot (the screens flash) are animated from the open art.

## For agents adding requests

Add requests **as early as possible**: as soon as you know the exact sign words,
face names or poster names your feature uses (even before the feature is
finished), write them here under a new `## OPEN round N` heading and commit and
push that change right away on its own, so the art can be generated while you
keep building. Use the formats above, give every file an exact path, size and
prompt, and keep the procedural stand-in in the game until the art arrives.
