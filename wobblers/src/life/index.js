// Wobbly Life's life-sim layer: money, shops, homes and pets. Called once from
// world/index.js after the static world is built (coins ray down onto it).
//
//   game.wallet   shared coins (life/wallet.js)       game.lifeHud  coin counters, "+5" floaters
//   game.coins    pickups (life/coins.js)             game.pets     pets (life/pets.js)
//   game.homes    homes (world/estate.js)             game.life.reward(player, n, reason, pos)  mini-game prizes
//   game.unlockedVehicles / game.vehicleLock(id)      car dealer purchases, checked by the phone
//   game.gadgets  jetpack, boots, laser gun... (src/gadgets.js) and the GADGETS shop (world/gadgetshop.js)
import { Wallet } from './wallet.js';
import { LifeHud } from './hud.js';
import { buildCoins } from './coins.js';
import { buildEarning, reward } from './earn.js';
import { buildPets } from './pets.js';
import { buildVehicleLocks } from './shops.js';
import { buildHomes } from '../world/estate.js';
import { resetLife } from './state.js';
import { buildGadgets } from '../gadgets.js';
import { buildGadgetShop } from '../world/gadgetshop.js';

export function buildLife(game) {
  game.wallet = new Wallet(game);
  game.lifeHud = new LifeHud(game);
  buildVehicleLocks(game);
  buildCoins(game);
  buildEarning(game);
  buildHomes(game);
  buildPets(game);
  game.life = {
    reward: (player, amount, reason, pos) => reward(game, player, amount, reason, pos),
    // pause menu: start the life sim over (coins, purchases, homes, pets, discoveries)
    reset: () => {
      resetLife();
      game.unlockedVehicles.clear();
      game.homes.refresh();
      game.pets.sync();
      game.lifeHud.bump();
    },
  };
  buildGadgetShop(game, game.kit); // static scenery: before kit.finish (world/index.js)
  buildGadgets(game);
}
