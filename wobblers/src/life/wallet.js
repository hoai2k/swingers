// The household wallet: one shared pot of coins for everybody playing on this
// machine (saved in settings.life.coins). Local co-op players share a sofa and a
// screen, so a shared pot keeps it friendly: nobody races their little brother
// for coins, someone who joins late can shop straight away, and a home or a
// vehicle bought by one player is paid for by the whole team. Things that are
// personal (your pet, your home) still belong to the player who picked them.
//
//   game.wallet.add(player, amount, reason)   earn (player may be null); returns the new total
//   game.wallet.spend(amount, player, reason) false (and a "nope" buzz) if it can't be afforded
//   game.wallet.coins / canAfford(n)
//   game.wallet.onChange(fn)                  fn(total, delta, player, reason)
//
// Feedback: coin sound, a floating "+5" over the earner in their own view and a
// bump of every view's coin counter (src/life/hud.js draws both).
import { life, saveLife } from './state.js';

export class Wallet {
  constructor(game) {
    this.game = game;
    this.listeners = [];
    this.earned = new Map(); // player -> coins earned this session (menu stat)
  }
  get coins() { return life.coins; }
  canAfford(n) { return life.coins >= n; }
  onChange(fn) { this.listeners.push(fn); }
  emit(delta, player, reason) { for (const f of this.listeners) { try { f(life.coins, delta, player, reason); } catch (e) { console.warn(e); } } }

  add(player, amount, reason = '', opts = {}) {
    amount = Math.floor(amount);
    if (!(amount > 0)) return life.coins;
    life.coins = Math.min(9999999, life.coins + amount);
    saveLife();
    if (player) this.earned.set(player, (this.earned.get(player) || 0) + amount);
    if (!opts.quiet) {
      const pos = player?.chest?.translation?.();
      this.game.audio?.play(amount >= 10 ? 'coinBig' : 'coin', pos || null, 1, { pitch: opts.pitch || 0 });
    }
    this.game.lifeHud?.floater(player, amount, reason);
    this.emit(amount, player, reason);
    return life.coins;
  }

  spend(amount, player = null, reason = '') {
    amount = Math.floor(amount);
    if (amount < 0) return false;
    if (life.coins < amount) { this.game.audio?.play('nope'); this.game.lifeHud?.shake(); return false; }
    life.coins -= amount;
    saveLife();
    if (amount) this.game.lifeHud?.floater(player, -amount, reason);
    this.emit(-amount, player, reason);
    return true;
  }
}
