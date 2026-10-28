# Spider Swingers — image requests

**Status: Round 3 open — 6 images (section A below).** Small gaps found
while integrating round 2; each spot is still drawn by the game until its
image arrives. Rounds 1 and 2 are delivered and integrated; see
`image-requests-history.md`.

## How to deliver

- Put each file in `spiders/assets/web/` with exactly the filename given.
- Add the filename to the `images` list in
  `spiders/assets/web/manifest.json`. Unlisted files are never requested.
- Record the prompt and size in `spiders/assets/generation.json` as before.
- Tell me which files landed; I add the loader hook and check each in game.

## Shared style

The glossy, bold-outlined painterly cartoon look of the Swingers / Rounders
art and the delivered Spider Swingers backdrops: clean shapes, a thick dark
outline (deep purple-black, not pure black), soft shading with one bright
highlight, saturated but not neon colours. No text, no characters unless
stated.

- **Sprites and icons**: transparent PNG, the subject centred with a few
  pixels of empty margin, lit from the upper left, no drop shadow (the game
  adds its own).
- **Side views** face right; the game mirrors them.
- **Animation strips**: one horizontal PNG, frames of equal width side by
  side, in the order listed, the subject in the same spot in every frame.
- **Glowing parts** (plasma blades, lasers, energy) are drawn in a neutral
  white-cyan core with a soft glow; the game tints them.

## A. Round 3 — gaps left after round 2 (6 images)

| File | Size | Where | Prompt |
| --- | --- | --- | --- |
| `hud_unlock.png` | 256 × 256, white glyph | Unlocked trials (pairs with `hud_lock`) | An open padlock with its shackle swung up and to the side, white glyph with a dark outline and soft inner shade, same style as `hud_lock.png`. |
| `btn_fullscreen_exit.png` | 256 × 256, white glyph | Corner button while in fullscreen | Four corner arrows pointing inward, white glyph with a dark outline and soft inner shade, same style as `btn_fullscreen.png`. |
| `mod_squeeze.png` | 256 × 256, full colour | Squeeze (closing death zone) modifier card | Two glowing magenta energy walls closing in from left and right on a small cartoon spider in the middle, glossy bold-outlined cartoon style, transparent background. |
| `mod_pool.png` | 256 × 256, full colour | Weapon-pool card | A cartoon wooden weapon rack holding a plasma saber, a laser pistol and a rocket tube, glossy bold-outlined cartoon style, transparent background. |
| `proj_hexorb.png` | 128 × 128 | Hexfly's magic orb shot | A glowing violet magic orb with a tiny rune inside and a few sparkles orbiting it, soft glow, transparent background. |
| `lobby_anchor.png` | 256 × 256 | The lobby's floating swing-anchor rock (right of the BOARD island) | A small round floating rock with grass on top, roots and a silk thread hanging below, matching `lobby_island.png`, transparent background. |
