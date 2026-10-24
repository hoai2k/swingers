# Agent guidance for WOBBLERS (`/wobblers`)

A Wobbly Life-style open-world sandbox; see `README.md` for controls and the code map.
The repo-level `CLAUDE.md` rules (deploy switch, branches, commits) still apply.

- No build step. three.js and Rapier are vendored in `lib/` and mapped through the
  import map in `index.html` (`three`, `three/addons/`, `rapier`). Serve the folder over
  http (`python3 -m http.server`).
- `window.__wob` is the live Game. For headless probes in Playwright: set
  `__wob.manual = true` (stops the loop's physics), add a player with
  `__wob.addPlayer('mock0')`, drive it through `__wob.input.mock = { mock0: {...state} }`
  and call `input.poll()`, copy `pressed` into the device's `latch`, then
  `handlePlayerInput(player, device)` and `step()` per 1/60 s. Use `player.teleport`,
  `player.sitIn(seat)`, `game.nearestSeat(player)` to set up a test. Check that a change
  still lets the ragdoll stand, walk, jump, go limp and get up, swim, grab and drive.
- Ragdoll tuning (`src/player.js`): the joint drives are an *implicit* PD on each limb's
  own inertia — explicit PD with chain inertia or large `kd` goes unstable in Rapier.
  Raised limbs float (gravity scale 0, weight moved to the torso); hanging arms keep
  gravity. Keep `kp * DT² ≲ 0.3`.
- Collision groups (`src/config.js`): static, props, vehicles/rides, one bit per player.
  Seated players stop colliding with vehicles and rides.
- Static scenery goes through `world/kit.js` so it is merged into per-chunk meshes;
  every new static thing should be added with the kit (visual + collider in one call).
- Rides are kinematic bodies animated in `physics.animators`; anything a player can sit
  on is a seat in `game.seats` (`{ body, pos, yaw, kind, label, hint, control() }`).
- Rendering (`src/sky.js`, `src/look.js`, `world/water.js`, `world/detail.js`, `game.render`):
  read `game.timeOfDay` (hours), `game.dayLight` (0..1), `game.nightLight` (0..1) and
  `game.isNight` for anything that should react to the day/night cycle (headlights, lit
  signs); `game.setTimeOfDay(h)` and `game.daySpeed` (0 freezes time) drive it. Builder
  colours listed in `GLOW` (`mesh.js`) light up at night; `kit.lamp` lamps get halos.
  Small top-level scene objects are hidden per view by on-screen size (`game.cullSmall`);
  set `userData.noCull` to opt out. Check draw calls with `game.renderStats` for 1 and 8
  players after adding many meshes.
- World helpers live in `world/common.js`: `Local` (building-local kit placement, `wall`
  with door holes, `stairs`, `rail`), `addDoor` (hinged physics door), `useSpot` (a seat with
  `use(player)` that Y triggers instead of sitting), `throwable` (punch to throw, optional
  `aim`), `ladder`, and `groundAt(x, z)` — the exact terrain mesh height. Place things on
  hills with `groundAt`, not `heightAt` (the analytic surface can be ~0.5 m off the mesh).
- Painted art is optional: `src/assets.js` loads only files listed in `assets/manifest.json`
  (regenerate with `python3 tools/build_manifest.py` after adding/removing images). Hooks:
  faces (`faces/face_<name>.png`), signs (`signs/<text>.png`, any `signMesh` text), posters
  (`world/posters.js`, `posters/<name>.png`) and the title logo (`ui/logo.png`). Open
  requests are in `image-requests.md`.
- Interior lights: rooms call `game.interiorLights.add(x, y, z, opts)` (`world/lights.js`); a
  pool of 6 point lights follows each view's camera, so adding spots costs nothing per frame.
