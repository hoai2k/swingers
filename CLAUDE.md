# Agent guidance for SWINGERS

## Workflow

- **Always commit to `main` when you finish a task**, and push it. This
  includes docs the owner works from (e.g. `image-requests.md`): they need
  to be on `main` to start using them. If you were working on a feature
  branch, merge it into `main` (fast-forward when possible) and push both.

## Project notes

- No build step: static HTML5/canvas + vendored Matter.js. Serve with
  `python3 -m http.server 8123` (ES modules need http, not `file://`).
- Boards are plain data in `src/levels.js`; the format (solids, ropes,
  balloons, movers, spinners, winds, checkpoints...) is documented at the
  top of `src/level.js`, and measured reach limits at the top of
  `src/levels.js`. Keep each board's challenge distinct from the others.
- `window.__hh` is the live Game; with `__hh.input.mock`, `player.teleport`
  and `__hh.step(1/60)` you can run headless physics probes in Playwright
  to check that a jump, bounce or swing actually lands.
- Swingers is a Rounders spinoff: the cast and music come from the
  `hoai2k/rounders` repo via `node tools/import_rounders.mjs <rounders
  checkout>`. Never hand-edit `src/characters-data.js` — it records the
  body sizing Rounders resolves (fitted ball + the owner's /workbench
  `bodyScale`/`bodyOffset`/`bodyRotation` overrides); re-run the import
  instead. Rounders characters face left/right with the stick and stay
  upright; original Swingers heads roll with the ball. Facing flips only in
  gameplay — non-gameplay animation (title swingers etc.) keeps a fixed facing.
- Guns (`src/guns.js`): grabbed with a trigger, fired with that hand's
  bumper, and locked to the forearm at the angle they were grabbed (wobbly
  aiming is intended). Recoil must never break the shooter's grip; a hit
  breaks the victim's grips and knocks them back but doesn't kill.
- Power-ups (`src/powerups.js`) spawn at random; the rate is a setting
  (off / normal / frequent).
- Settings (`src/settings.js`, localStorage) — Original Swingers defaults
  OFF. Sound must stay muted while the tab is hidden/unfocused.
- Image asset requests for the owner live in `image-requests.md`. Generated
  originals are in `assets/{bg,heads,tiles,ui}`; after any change there run
  `python3 tools/build_assets.py` to rebuild the web copies in
  `assets/web/` that `src/art.js` actually loads. Every image the game loads
  must go through `track()` (`src/preload.js`) so the boot loading bar waits
  for it — the title never shows stand-in drawings.

## Models

- Only a session already running on Fable may start Fable subagents, workers or helper agents. Opus,
  Sonnet and every other model never pass model "fable"; they leave the model unset so it inherits, or
  pick Opus or Sonnet.
- Don't switch a session to Fable on your own. If a task seems to need Fable, ask me first and say why.
- This is enforced in `.claude/settings.json`: sessions in this repository default to Opus, and a
  PreToolUse hook (`.claude/hooks/block-fable.sh`) reads the calling model from the transcript and
  refuses a subagent or workflow call that asks for Fable unless the caller is itself Fable. When I ask
  for Fable, switch the main session with `/model`; don't edit the hook to get round it.
