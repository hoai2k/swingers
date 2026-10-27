# Wobbly Battles — image requests

**Status: 2 open requests (round 10: two map previews redone to match the built maps).
Rounds 1–9 (61 images) are delivered; see `image-requests-history.md`.**

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

## Round 10 — two map previews redone to match the built maps (2 images)

Same brief as rounds 4 and 9 (empty battlefield from a raised three-quarter view, no
soldiers, no text, no UI, point-symmetric, key features readable at 320 px; full-size
16:9 original at `assets/originals/ui/map-<id>.png`, cropped by
`tools/build_battles_assets.py`). The round 9 cards look great; only the layout differs
from what was built, so keep their style and colours and fix the items below. These
**replace** the current files.

| # | File | Size / format | Status | What |
|---|---|---|---|---|
| 62 | `assets/ui/map-blocky.jpg` | 640×360 JPG | requested | "Blocky Plains" (Minecraft), as round 9 but laid out like the map: the **centre is a small square lava pool** (glowing orange, rimmed with grey cobblestone), with **no portal in the middle**. Instead there is **one obsidian nether portal on each half** (purple swirl, on a dark pad), mirrored through the centre, each beside a small cobblestone-and-plank hut. Cobblestone, mossy stone and ore outcrops (coal, iron, gold, diamond flecks) and grass-topped dirt mounds dot both halves; cube oak, birch and spruce trees around the edges; stepped terraced hills and cube mountains beyond, a square sun and square clouds, a few blocky sheep and cows outside the field. |
| 63 | `assets/ui/map-basingse.jpg` | 640×360 JPG | requested | "Ba Sing Se Walls" (Avatar), as round 9 but with the great Earth Kingdom wall only along **one** side: the far edge, towering (much taller than in round 9, filling the top of the frame), ochre stone with green tile caps, a great arched gate with green doors and the Earth Kingdom emblem in the middle, a three-tier gatehouse and pagoda watchtowers. **No wall along the near edge or the sides**: there the field opens onto green hills cut into terraced farm fields with small farmhouses. In the field: a paved road across the middle to a small stone pavilion with red columns and a two-tier curved green roof at the centre, earthbent rock pillars and slabs jutting at angles on both halves, low ochre stone walls with green caps, bamboo clumps and pines. Warm afternoon light. |
