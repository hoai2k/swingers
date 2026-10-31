// Non-gameplay portraits use the gameplay leg geometry, IK and cast palette.
// The empty world leaves the feet in the same relaxed airborne pose as in play.
import { Spider } from './spider.js';
import { castAt, drawBody } from './cast.js';

const portraits = new Map();
const portraitWorld = { world: { raycast: () => null } };

export function drawSpiderPortrait(ctx, x, y, r, castIndex, time = 0, { facing = 1, wiggle = 1, legScale = 1, legAlpha = 1 } = {}) {
  const cast = castAt(castIndex);
  if (!portraits.has(cast.id)) {
    portraits.set(cast.id, new Spider(portraitWorld, {
      castIndex, color: { main: cast.color, dark: cast.dark },
    }));
  }
  const sp = portraits.get(cast.id);
  sp.time = time * wiggle;
  sp.updateLegs(1);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(r / sp.r, r / sp.r);
  ctx.save();
  ctx.scale(legScale, legScale);
  ctx.globalAlpha *= legAlpha;
  sp.drawLegs(ctx, true);
  sp.drawLegs(ctx, false);
  ctx.restore();
  drawBody(ctx, 0, 0, sp.r, castIndex, { facing });
  ctx.restore();
}
