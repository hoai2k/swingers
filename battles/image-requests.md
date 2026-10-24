# Wobbly Battles — image requests

**Open requests: 7 (round 4, items 43–49: six new map previews and one map mood board).**
Everything earlier (items 1–42) is delivered and in use.
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

### Round 4: new battle maps

Six new maps with terrain that changes the fight: walls, rivers, bridges, plateaus and
breakable crates and fences. Each preview card shows that map's **empty battlefield**
from a raised three-quarter view, with no soldiers, no text and no UI. The game shows
the card beside the Map option and on campaign level cards, so the map's key feature
must read at 320 px wide. Each field is laid out point-symmetrically, so the two
halves mirror each other through the centre. The art can be loose, but it should feel
balanced and not favour a left or right side. Deliver each card as a full-size 16:9
original at `assets/originals/ui/map-<id>.png`. `tools/build_battles_assets.py` crops it
to the 640×360 JPG. The new ids are already in that script's map list.

| # | File | Size / format | Status | What |
|---|---|---|---|---|
| 43 | `assets/ui/map-castle.jpg` | 640×360 JPG | **wired** (map preview card; campaign card) | "Castle Courtyard": a grassy castle courtyard with grey-beige cobbles in the middle. Two long, crenellated stone walls run across the field, one on each side, each with two open gateways flanked by round towers. A stone well sits in the centre. There are wooden crates and barrels by the walls, and a low raised stone platform behind each wall. Big outer curtain walls and towers ring the scene, with green hills and blue sky beyond. Neutral grey stone and brown wood; no team colours. |
| 44 | `assets/ui/map-river.jpg` | 640×360 JPG | **wired** | "River Crossing": a gently winding, shallow blue river runs through the middle of a summer meadow, separating the two halves. Two wooden plank bridges with rails cross it, one near each end, and there is a pebbly shallow ford in the middle. There is a soft rounded hill on each bank, low wooden fences near the banks, reeds, round oak trees and willows. |
| 45 | `assets/ui/map-cove.jpg` | 640×360 JPG | **wired** | "Pirate Cove": a sunny sandy beach around a round turquoise lagoon in the centre. A tiny sand island with one palm tree and a treasure chest sits in the middle of the lagoon, and two wooden boardwalks cross the lagoon either side of it. There is a half-buried wrecked wooden hull on each side, stacks of crates and barrels, and palm trees. The open sea is in the background with a cartoon pirate ship (plain sails, no flags or skull). |
| 46 | `assets/ui/map-volcano.jpg` | 640×360 JPG | **wired** | "Volcano Jungle": a lush jungle clearing with rich greens and brown earth. There is a flat-topped rocky mesa with sloped sides on each half, a bubbling dark tar pit on each side, and scattered boulders, palms and big broadleaf jungle trees. A huge cartoon volcano smokes in the distance with a glowing orange crater. Prehistoric mood, slightly warm and hazy sky. |
| 47 | `assets/ui/map-canyon.jpg` | 640×360 JPG | **wired** | "Canyon Ruins": a sandy desert canyon floor between two tall red-orange rock rims (one on each long edge) with sloped ramps up to them. In the middle is a low flat mesa, a king-of-the-hill spot. There are ancient sandstone ruins: broken walls, a ring of standing and toppled columns, and clay pots. Tall rock pillars and a warm sky beyond. |
| 48 | `assets/ui/map-graveyard.jpg` | 640×360 JPG | **wired** | "Spooky Graveyard": a moonlit graveyard at night in deep blue and purple with a soft violet fog. There are rows of grey tombstones and crosses on both halves, a stone mausoleum with columns in the dead centre, short black iron fences, gnarled dead trees, a few jack-o'-lanterns and a crooked church silhouette with a big pale moon. Comedic and cosy-spooky, not scary; keep the ground readable (blue-grey grass), not pitch black. |

### Round 4 reference

| # | File | What |
|---|---|---|
| 49 | `reference/maps-2.png` | One sheet with a colour-palette and mood board for each of the six new maps (castle, river, cove, volcano, canyon, graveyard): ground, path/paving, water (where the map has it), rock/stone, wood, trees, sky gradient and fog colour, plus a small sketch of each map's signature obstacle (wall with gate and towers, plank bridge, boardwalk and wreck, mesa and tar pit, ruined columns, tombstones and mausoleum). Same layout as `reference/maps.png`. |
