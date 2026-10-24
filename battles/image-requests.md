# Wobbly Battles — image requests

**Open requests: 2 (round 5, items 50–51: Unit Creator emblem and empty-list illustration).**
Everything earlier (items 1–49) is delivered.
See `image-requests-history.md` for the delivered briefs.

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

## Open requests

### Round 5: Unit Creator

The Unit Creator (title menu → *Unit Creator*) builds custom units that appear in a new
**Custom** faction tab in army setup. Both files are optional: the game shows a plain tab
and a text-only empty list until they arrive. Deliver the full-size originals as
`assets/originals/ui/faction-custom.png` and `assets/originals/ui/creator-empty.png`, then
run `tools/build_battles_assets.py`.

| # | File | Size / format | Status | What |
|---|---|---|---|---|
| 50 | `assets/ui/faction-custom.png` | 128×128, transparent PNG | **wired** (setup unit-bar tab for the Custom faction; the creator's header) | Faction emblem for player-made units: a tailor's dummy (mannequin bust) in a bean-soldier shape with a measuring tape round its middle, and a sewing needle and a little wrench crossed behind it. Warm orange (#ffb84a) and gold, flat sticker style like the other 15 emblems, bold outline, no text. Must read at 28 px. |
| 51 | `assets/ui/creator-empty.png` | 640×400, transparent PNG | **wired** (shown on the creator's unit list while no custom unit is saved) | A comedic workshop scene: a chubby bean-soldier tailor in an apron, a tape measure round its neck, stitching together a half-finished bean soldier on a workbench. Spare helmets, a sword, a bow and a feathered hat lie about, and bolts of blue and red cloth sit in a basket. Clean flat colours with soft shading, transparent around the scene (no background box), no text. |
