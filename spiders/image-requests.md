# Spider Swingers — image requests

**Status: all requested images delivered. No open requests.**
Rounds 1–3 are delivered; round 3 assets are registered and ready for loader-hook integration.
See `image-requests-history.md`.

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
