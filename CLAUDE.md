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
- Image asset requests for the owner live in `image-requests.md`.
