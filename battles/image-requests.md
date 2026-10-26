# Wobbly Battles — image requests

**Status: round 6 open — 2 images (the two new faction emblems).** Rounds 1–5 (52
images) are delivered; see `image-requests-history.md`.

## How to deliver

Drop each finished file at the path given (relative to `battles/`). UI art goes in as a
full-size original at `assets/originals/ui/<name>.png`. Then run
`python3 tools/build_battles_assets.py`, which builds the in-game sizes and lists them in
`assets/manifest.json`. Reference sheets go straight into `reference/`. The game keeps
its drawn fallback until an image arrives, so nothing breaks while one is missing.
Record prompts and dimensions in `assets/generation.json` as before.

## Shared style

Bright, toy-like, comedic medieval fantasy in the spirit of *Totally Accurate Battle
Simulator*. Soldiers are chubby bean-shaped bodies with stubby arms and legs, big round
heads, simple cartoon faces (white eyes with black pupils, thick eyebrows), and no
noses, fingers or realistic anatomy. Use clean flat colours with soft shading and
saturated grass greens and sky blues. The two armies are **Blue (#3d72e3)** and **Red
(#e2403b)**, and gold accents are **#f2c230**. Do not use real brands, real people or
the TABS logo.

## Round 6 — new faction emblems (open)

Two new factions are being added, inspired by a sorcery anime and a space-opera saga.
The emblems must be **original**: no logos, symbols, lettering, characters or designs
from those franchises (no hand-sign or eye emblems copied from the show, no starbird,
Imperial cog or rebel crest). Same flat sticker style as the other 16 emblems, bold dark
outline, no text, readable at 28 px.

| # | File | Size | Status | Brief |
|---|---|---|---|---|
| 53 | `assets/ui/faction-jujutsu.png` | 128×128, transparent PNG | open | Faction emblem for **Jujutsu** (cursed-energy sorcerers): a cracked paper talisman (ofuda) with a swirl of blue-violet cursed flame curling up out of it, and a tiny round straw doll with a nail behind it. Deep indigo (#3b2a7a) and electric violet (#9b5cff), a touch of black. |
| 54 | `assets/ui/faction-galactic.png` | 128×128, transparent PNG | open | Faction emblem for **Galactic** (space knights, troopers and droids): a chunky toy-like glowing energy sword hilt (one cyan beam, short) crossed with a stubby ray-gun blaster in front of a small ringed planet and two stars. Night blue (#1d2a5a), cyan glow (#4fe3ff) and white. |
