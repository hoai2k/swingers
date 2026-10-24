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
