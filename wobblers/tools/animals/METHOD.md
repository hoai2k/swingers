# Building animal models from reference sheets

How the Wobblers animals are made: a generated reference sheet goes in, and a small, rigged,
painted mesh the game animates in its shader comes out. It works for any creature. Rounds 16–18
built about 45 this way, from tigers to jellyfish to scorpions. This guide covers the method, the
tools, and what we learned doing it.

## The pipeline at a glance

```
image request ──► reference sheet ──► design / auto-build (offline, Python) ──► assets/animals/<name>.*
 (image-requests.md)  (assets/reference/animals)   (quad.py, designed.py)          │
                                                                                    ▼
                       review boards ◄── turnaround renders ◄── game loads it (SHEET_MODELS)
                       (review/board.py)   (review/turn.cjs)      (src/world/animalgeo.js)
```

1. **Ask for a sheet** in `wobblers/image-requests.md`, in its own early commit (see below).
2. **Build the model offline**: `python3 quad.py <name>` (automatic four-legged animals) or
   `python3 designed.py <name>` (one design function per body plan). Both write
   `assets/animals/<name>.bin` (the mesh), `.json` (layout, part pivots and paint boxes),
   `_side.jpg` and `_top.jpg` (paint taken from the sheet).
3. **Register it**: add the name to `SHEET_MODELS` in `src/world/animalgeo.js`. A species made
   with `W.mk(kind, '<name>', …)` then loads it. If the files are missing, the game falls back to the
   sculpted stand-in in `animalmodels.js`, and it does so **silently**.
4. **Review it**: render turnarounds, put them on a board next to the sheet and the earlier
   versions, judge, adjust, rebuild. Expect 2–3 rounds.
5. **Check it in the game**: run a headless probe to confirm it moves, poses and behaves; then run
   the smoke probe.

The sheet is only a **measuring tape and a paint source**. The shape is built from smooth
primitives (tapered tubes, ellipsoids, plates) placed on the sheet's measurements. It is then
meshed (smooth union → surface nets → decimated to a `tris` budget), rigged by nearest part and
painted by projecting the sheet's side and top views. The result is never a photogrammetry
reconstruction, so it stays clean, light (6–9k triangles) and easy to animate.

## 1. Asking for the art

Every sheet is **1920 × 1080** and shows the same animal three times, side by side, at the same scale:

| left | middle | right |
|---|---|---|
| exact side view, facing **right** | exact top view, head toward the **right** | three-quarter front view |

- The whole animal is in frame in every view, in a neutral walking pose with all legs visible.
- Plain light grey background, soft studio light, no text, no ground clutter, no shadows that
  touch other views.
- Art direction (house style): a midpoint between baby-toy animals and realistic wildlife.
  Rounded, expressive, stylised game animals with recognisable adult anatomy, broad painted
  markings, smooth sculpted forms, no fur, scale or wrinkle detail, no chibi proportions or human
  grins.
- **Birds that fly**: the side view stands with wings folded, the top view has the wings spread
  as in flight, and the 3/4 view flies with the wings spread. One sheet then gives both a perched
  and a flying model.
- Several small animals can share a sheet in rows (`row=`, `rows=` in the config), as the sea
  star, crab and seahorse do.
- Commit the request **early**, in its own commit that touches only `image-requests.md`, so the
  art is generated while the code is built. Animals run on sculpted stand-ins until the sheet
  arrives. Delivered sheets land in `assets/reference/animals/`.

## 2. Picking a builder

| body plan | builder | used for | notes |
|---|---|---|---|
| four legs, clean silhouette | `quad.py` (automatic) | tiger, leopard, monkey, hog, capybara, tapir, croc, camel, rat, cat | Reads back and belly lines, legs and tail from the side view and width from the top view. Try it first; it is the fastest. |
| four legs that confuse `quad.py` | `designed.py` `quadd` | fennec, arctic fox, iguana, goat, squirrel, tortoise | Hand-placed parts: big ears, horns, sprawled legs, fluffy or curled tails, domed shells. |
| standing bird | `perchd` | roadrunner, flamingo, snowy owl, crow | Body sections, neck, head, beak, crest, folded wing, flat tail, two legs with 4 toes. |
| flying bird | `bird` | parrot, toucan, owlFly, crowFly, vulture | Wings from the spread-wing top view (`wing_top=True`). |
| snake | `snake` | python, rattlesnake | One tapering tube; the game's slither wave adds the winding. |
| many legs + claws | `scorpiond` (hand) / `crab` (auto) | scorpion / crab | `crab` traces legs from the top view; it failed on the scorpion (see learnings). |
| sea animals | `turtle`, `plesiosaur`, `manta`, `jelly`, `octopus`, `seaStar`, `seahorse`, fish | — | One function each. |

When nothing fits, write a new design function on the shared pieces (next section). `scorpiond`
is a good template for a hand-placed body plan seen in both views. It is about 50 lines.

## 3. The building blocks (`designed.py`)

- `Sheet(file, L, row=0, rows=1, land=True)` splits the sheet into views and scales them so the
  animal is `L` metres long. `S` is the side box and `T` the top box; `sh.zs` / `sh.ys` map side
  pixels to z / y, and `sh.xt` maps top rows to x.
- `Grid(lo, hi, res)` is a signed-distance grid. `res` is cells along the longest axis (110–170).
  It provides:
  - `G.ell(centre, radii)`: an ellipsoid (z, y, x radii);
  - `G.cone(points, radii, xs=…)`: a tapered tube through a chain of points, with `xs` scaling
    its width across;
  - `plate`: flat outlines for wings, flippers, fins and tails.
- A **field** is `dict(name, d, part, pivot=None, blend=None)`. `part` is the rig part it moves
  with, `pivot` is where that part bends, and `blend` is how softly it merges into its
  neighbours, in metres.
- `finish(name, C, fields, G, sheet, blend)` takes the smooth union, meshes and decimates to
  `C['tris']`, rigs (nearest part, blended at the joins), sets pivots, projects the paint and
  writes the files.

### Rig parts and what the game does with them

| part | moves as |
|---|---|
| `body` | the whole animal (root) |
| `HEAD` | head turns and bobs (neck, skull, muzzle, ears, horns, beak) |
| `TAIL` | tail sway (`TAILA`) |
| `FL` `FR` `BL` `BR` | legs stepping with distance travelled (`LEG`, stride per kind) |
| `WING_L` `WING_R` | flapping (`FLAP`) |
| 10+ | tentacles / arms (`TENTW`, `TENTA`, `TENTK`, `TENTS`) |

Species constants go in `W.mk(kind, model, max, { k: { … } })`, for example `LEG: 0.6, TAILA: 0.3`.
Snakes use `mode: 'slither'` with `WAVEK` (waves per metre × 2π) and `WAVEA` (sideways amplitude).

## 4. Coordinates for hand-placed designs

All hand-placed designs work in **fractions of the sheet's boxes**, read off a grid image:

```
python3 review/grid.py <sheet.png> <out.png> [row rows]
```

This draws the side and top views cropped to the animal's box, with a 10% u / v grid.

- **u**: along the side box, from the tail end (0) to the nose or claw tips (1).
- **v**: down the side box, from the top (0) to the ground (1).
- **w** (`scorpiond` only): across the top box, with 0.5 as the middle line. Use it for legs and
  claws that spread sideways.
- **Radii** are in **side-box heights** (`vh`). A radius of 0.1 is a tenth of the animal's
  drawn height.
- `xs` is width ÷ height for a tube. Measure it as the top view's width (in px, scaled by the
  top box) against the side view's height. Bulky animals come out around 0.85–1.3, slim ones
  0.65–0.75.

`quadd` / `perchd` entries:

- `torso` / `body`: `(u, top v, bottom v)` sections; the radius is half the gap.
- `neck`, `muzzle`, `tail`, `front`, `hind`, `leg`: `(u, v, r)` chains. A leg point can be
  `(u, v, r, x)` to sit out at x for sprawled legs (tortoise, iguana). Otherwise legs sit at
  `spread`.
- `head`: `(u, v, r, stretch along)`.
- `ears`: `(u, v, r, x)`, broad from the side and thin across (`ear_t`, `ear_h`).
- `horns`: an `(u, v, r)` chain from base to tip, mirrored at `horn_x`.
- `blobs`: `(u, v, rz, ry, rx, part)` extra volumes (a beard, a hump, a plastron).
- `crest`: `(u0, u1, n, h)` back spikes.
- `wing`: `(u, v, rz, ry, rx)`, the folded wing at `wing_x`.
- `tail_xs` / `tail_ys`: flatten a bird's tail into a fan.

## 5. The review loop

The tools in `review/` write to `$REVIEW_DIR` (default `/tmp/animal-review`). Start the local
server first: `python3 -m http.server 8123` from the repo root.

```
python3 review/grid.py squirrel.png $REVIEW_DIR/grid_squirrel.png   # read coordinates
# … write or adjust the config in designed.py / quad.py …
python3 designed.py squirrel                                        # build (≈ 20-60 s)
node review/turn.cjs '[["squirrel"]]'                               # renders tv_squirrel_{0..3}.png
python3 review/board.py row squirrel "3 designed from the sheet v1"  # save this version as a row
python3 review/board.py make squirrel squirrel.png                   # board: sheet + all rows
```

- `turn.cjs` renders the game's own instanced mesh in side, top, 3/4 and front view. Set
  `AMP=1 PH=<phase>` to see the animation pose, for example a snake mid-slither.
- **Show the owner the history**: before registering a new model, render the **old stand-in**
  and save it as row `1 old procedural stand-in`. Move `<name>.json` aside to render a stand-in
  for a model already built. Then add one row per version, so the board tells the story: sheet →
  stand-in → auto-build → designed v1 → v2. The owner wants to see these as they happen. Send
  them and carry on; don't wait for a reply.
- Judge each version in all three views against the sheet. Check, in this order: overall bulk
  and proportions, then the silhouette features that make the animal recognisable (horns, ears,
  crest, tail shape, beak), then limb thickness, then paint.

## 6. Checking it in the game

- Check that every name in `SHEET_MODELS` has its files. A missing file means a silent fallback:
  ```
  node -e "const s=require('fs').readFileSync('src/world/animalgeo.js','utf8');const n=[...s.match(/SHEET_MODELS = new Set\(\[([\s\S]*?)\]\)/)[1].matchAll(/'(\w+)'/g)].map(x=>x[1]);console.log(n.filter(k=>!require('fs').existsSync('assets/animals/'+k+'.json')))"
  ```
- Probe behaviour headlessly (`window.__wob`, `manual = true`, `input.mock`, step the game and
  run `g.updaters`). **The wildlife only poses animals near a player's camera**, so a probe must
  move `p.camera.cam.position` along with the player, or nothing updates.
- Stats live in `game.<region>Animals` (`desertAnimals`, `snowAnimals`, `tropicalAnimals`,
  `townAnimals`, `cityRats`, `jungleAnimals`), and each one's `list` gives every animal's state.
- Run the smoke probe last: build, run, jump, forms, swim, with no page errors.

## 7. Learnings

**Automatic building (`quad.py`)**
- It works when the side silhouette is simple. It misreads the following, so check the
  `QDBG=1 QDBG_OUT=<dir>` overlay (back line, belly line, legs) before tuning numbers blind:
  - big ears get folded into the back line (fennec);
  - fluffy or raised tails are lofted as body (squirrel, fox);
  - diagonal legs fool the belly band (camel: use `belly_y`, a rounded belly this far below the
    back);
  - horns are missed entirely (goat).
- Leg thickness: a minimum clamp once overrode the requested radius. Use `leg_r` with
  `leg_r_fixed=True` when legs come out too thick or too thin. `leg_r_fixed` needs `leg_r`, or
  the build crashes.
- If an auto-build is wrong in structure, not just in proportion, switch to a hand design rather
  than piling on knobs. A `quadd` entry takes about 10 minutes and converges in 2–3 versions.

**Hand designs**
- Read coordinates off the grid, not from memory. Torso entries are `(u, top, bottom)`, not
  `(u, v, r)`, which is an easy slip.
- v1 usually comes out too slim; the drawn outline includes fluff and feathers. The fix for
  that often overshoots (v2 too bulky: the roadrunner's paddle tail, the flamingo swallowing its
  neck), so settle in the middle. Change radii by about 15–25% per step, not 50%.
- Thin features vanish at game scale. Horns, beaks, ears and fingers need to be thicker than
  drawn (goat horns doubled in v2), and ears should be broad seen from the side and thin across.
- Legs are what make a model look spindly or sturdy. The tortoise only read right once its legs
  were short and nearly as thick as they were long.
- Automatic limb tracing from the top view (`crab`) breaks when limbs touch the body or each
  other in the drawing. The scorpion's tail curls over its back, its legs merged, and its claws
  became paddles. Hand placement using **both** views (u, v from the side, w from the top) fixed
  it in one go.

**Birds**
- Make perched and flying birds **separate models** and species (crow / crowFly, owl / owlFly).
  A species' `FLAP` applies whatever the pose, so a perched species (`FLAP: 0`, wings folded
  against the body) and a flying one (`FLAP` > 0, wings from the spread-wing top view) can't be
  one species.
- `bird` has no neck piece, so a long-necked flier (vulture) gets a short neck. That is fine
  for birds seen high up; add a neck chain if one is ever seen up close.

**Snakes**
- Build snakes **longer than drawn** (`length`), so they wind more. The sheet's pose is
  compressed. Make them more bendable in the game too (`WAVEA`).
- The slither phase is distance × `WAVEK`, so the curves stay put on the ground. The wildlife
  `stride` must be 2π / `WAVEK`, or the body skates through its own curves.
- If the drawn snake raises its neck or rattle, take thickness from the top view
  (`prof_top=True`). A rattle is `rattle=(beads, start)`: the tail tapers and beads go on TAIL.

**Triangle budgets**
- Set `tris` by size and by how many show at once, not by detail. The game makes a far version
  of every model by itself (critters.js `lodGeometry`, ~25% of the triangles beyond ~30 radii),
  but up close each instance draws the full mesh. Small animals came out at the 12k default and a
  pack of 0.45 m rats cost 72k triangles. Use about 3k for rats and crows, 4–5k for cat-sized
  animals and anything that shows in flocks, and 8–12k only for big animals. Check the result
  in a turnaround: the lower budgets above looked the same.

**Process**
- Build at most two models in parallel; each build holds a dense grid in memory.
- The game falls back to the stand-in without warning, so always run the files check above
  after registering.
- Keep tools and boards out of the deploy. `tools/` and `assets/reference/` are already excluded
  from the site (`paths-ignore` and the workflow's "Assemble site" step), and boards go in
  `$REVIEW_DIR`, never in the repo.

## 8. Checklist: adding an animal

1. Request the sheet (section 1) in its own commit.
2. Make the species with its behaviour on a sculpted stand-in in `animalmodels.js`, so the game
   works before the art arrives.
3. When the sheet arrives, render the stand-in row, then build with `quad.py` or a design function.
4. Iterate with boards (section 5), sending each version to the owner.
5. Add the name to `SHEET_MODELS`, run the files check, run the behaviour and smoke probes.
6. Note the animal in `wobblers/CLAUDE.md` (which builder, any new design knobs), then commit with
   what you tested.
