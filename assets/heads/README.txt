Drop head sprite PNGs here (square, transparent background works best),
then register them in src/main.js:

  import { registerSpriteHead } from "./heads.js";
  registerSpriteHead("assets/heads/mine.png", "mine");
