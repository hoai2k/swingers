# Wobbly Battles — image requests

**Status: 4 open requests (round 9). Rounds 1–8 (57 images) are delivered; see `image-requests-history.md`.**

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

## Round 9 — previews for four faction battlegrounds (4 images)

Same brief as the round 4 map cards (see the history doc): each card shows that map's
**empty battlefield** from a raised three-quarter view, no soldiers, no text, no UI; the
key feature must read at 320 px wide; each field is point-symmetric (the two halves mirror
through the centre), so the art should feel balanced. Deliver a full-size 16:9 original at
`assets/originals/ui/map-<id>.png`; `tools/build_battles_assets.py` crops it to the
640×360 JPG (the ids are already in its map list). The game is private behind the invite
gate, so the franchises' real looks are fine.

| # | File | Size / format | Status | What |
|---|---|---|---|---|
| 58 | `assets/ui/map-starbase.jpg` | 640×360 JPG | requested | "Starbase Hangar" (Galactic, a space-opera faction): a huge sci-fi hangar deck of grey metal floor plates with yellow-and-black hazard stripes and glowing blue landing circles. Low blast barriers and stacks of cargo crates give cover on both halves, a parked fighter ship sits at each end (mirrored), and a raised control platform stands in the centre. Beyond the open hangar mouth: a star field, a big ringed planet and a moon. Cool greys, blue lights, small orange warning lamps. |
| 59 | `assets/ui/map-shibuya.jpg` | 640×360 JPG | requested | "Shibuya Crossing" (Jujutsu Kaisen's Halloween night): a wide city scramble crossing at night, dark asphalt with bold white zebra stripes in a big X, abandoned cars and taxis left at angles, traffic lights, lamp posts and a subway entrance kiosk in the middle. Glowing neon signs and giant screens on the tall buildings all round, a deep blue-purple night sky with a faint dome-shaped dark barrier shimmering overhead. Neon pinks, cyans and warm street-light yellows. |
| 60 | `assets/ui/map-blocky.jpg` | 640×360 JPG | requested | "Blocky Plains" (Minecraft): a voxel landscape where everything is made of cubes: grass blocks with dirt sides, blocky oak and birch trees, a small cobblestone-and-plank village hut on each side (mirrored), a little lava pool and a stone outcrop, and a square obsidian portal frame with swirling purple in the centre. Square clouds and a square sun in a bright blue sky, blocky hills beyond. |
| 61 | `assets/ui/map-basingse.jpg` | 640×360 JPG | requested | "Ba Sing Se Walls" (Avatar: The Last Airbender): the green-and-tan Earth Kingdom outer wall towering beyond the field with a great gate, earthbent rock pillars and slabs jutting from the ground on both halves, a small stone pavilion with a curved green roof in the centre, bamboo and pine trees, a paved road across the middle. Earthy greens, ochre stone, warm afternoon light. |
