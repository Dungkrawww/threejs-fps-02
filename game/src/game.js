// The match: rounds, money, the bomb, and the win. One attacker against five defenders.
// A round is won by clearing the defenders, by detonating a planted bomb, or lost by
// dying before the plant, by the clock, or by a defuse. First to five rounds takes the
// match. The buy phase between rounds is the only shop: money comes from kills, plants
// and round results. This module owns the numbers; main.js owns the world, the HUD
// owns the display.
import { WEAPONS } from './arsenal.js';

const ROUNDS_TO_WIN = 5;
const MAX_ROUNDS = 9;
const ROUND_SECONDS = 100;
const BUY_SECONDS = 12;
const END_SECONDS = 4;
const FUSE_SECONDS = 40;
const PLANT_SECONDS = 3;
const DEFUSE_SECONDS = 5;
const DEFUSE_RANGE = 2.4;
const START_MONEY = 800;
const WIN_MONEY = 3250;
const LOSS_MONEY = 1400;
const KILL_MONEY = 300;
const PLANT_MONEY = 300;
const KEVLAR_PRICE = 650;

export const SHOP = [
  { id: 'smg', label: 'Kestrel SMG', price: WEAPONS.smg.price, key: '2' },
  { id: 'sniper', label: 'Longbow sniper', price: WEAPONS.sniper.price, key: '3' },
  { id: 'kevlar', label: 'Kevlar vest (+50 armour)', price: KEVLAR_PRICE, key: '4' },
  { id: 'grenade', label: 'HE grenade', price: 300, key: '5' },
];

export function createGame(hooks) {
  const state = {
    phase: 'buy',
    round: 1,
    wins: { player: 0, bots: 0 },
    money: START_MONEY,
    health: 100,
    armor: 0,
    timer: BUY_SECONDS,
    bomb: { planted: false, site: null, fuse: FUSE_SECONDS, plantProgress: 0, defuseProgress: 0 },
    lastResult: null,
    matchWinner: null,
  };

  function startRound() {
    state.phase = 'live';
    state.timer = ROUND_SECONDS;
    state.bomb.planted = false;
    state.bomb.site = null;
    state.bomb.fuse = FUSE_SECONDS;
    state.bomb.plantProgress = 0;
    state.bomb.defuseProgress = 0;
    state.health = 100;
    hooks.onRoundStart(state.round);
  }

  function endRound(winner, reason) {
    state.wins[winner] += 1;
    state.money += winner === 'player' ? WIN_MONEY : LOSS_MONEY;
    state.lastResult = { winner, reason };
    state.phase = 'end';
    state.timer = END_SECONDS;
    hooks.onRoundEnd(winner, reason, state.round);
    if (state.wins.player >= ROUNDS_TO_WIN || state.wins.bots >= ROUNDS_TO_WIN || state.round >= MAX_ROUNDS) {
      state.matchWinner = state.wins.player > state.wins.bots ? 'player' : state.wins.bots > state.wins.player ? 'bots' : 'draw';
    }
  }

  function step(dt, ctx) {
    if (state.phase === 'buy') {
      state.timer -= dt;
      if (state.timer <= 0) startRound();
      return;
    }
    if (state.phase === 'end') {
      state.timer -= dt;
      if (state.timer <= 0) {
        if (state.matchWinner) {
          state.phase = 'match';
          hooks.onMatchEnd(state.matchWinner);
        } else {
          state.round += 1;
          state.phase = 'buy';
          state.timer = BUY_SECONDS;
          hooks.onBuyPhase(state.round);
        }
      }
      return;
    }
    if (state.phase !== 'live') return;

    state.timer -= dt;

    // Planting: hold E inside a site for three seconds.
    if (!state.bomb.planted && ctx.playerAlive && ctx.plantHeld && ctx.siteAt) {
      state.bomb.plantProgress += dt / PLANT_SECONDS;
      if (state.bomb.plantProgress >= 1) {
        state.bomb.planted = true;
        state.bomb.site = ctx.siteAt;
        state.bomb.fuse = FUSE_SECONDS;
        state.bomb.plantProgress = 0;
        state.money += PLANT_MONEY;
        hooks.onBombPlanted(ctx.siteAt);
      }
    } else if (!state.bomb.planted) {
      state.bomb.plantProgress = Math.max(0, state.bomb.plantProgress - dt / PLANT_SECONDS);
    }

    if (state.bomb.planted) {
      state.bomb.fuse -= dt;
      // The nearest living defender inside defuse range channels the defuse.
      const site = ctx.world.sites[state.bomb.site];
      const defuser = ctx.bots.nearestAliveTo(site.center);
      if (defuser) {
        const distance = Math.hypot(defuser.group.position.x - site.center.x, defuser.group.position.z - site.center.z);
        if (distance <= DEFUSE_RANGE) {
          state.bomb.defuseProgress += dt / DEFUSE_SECONDS;
          ctx.defuser = defuser;
          if (state.bomb.defuseProgress >= 1) {
            hooks.onBombDefused();
            endRound('bots', 'Bomb defused');
            return;
          }
        } else {
          ctx.defuser = null;
        }
      } else {
        ctx.defuser = null;
      }
      if (state.bomb.fuse <= 0) {
        hooks.onBombExploded();
        endRound('player', 'Bomb detonated');
        return;
      }
    }

    if (ctx.botsAlive === 0) {
      endRound('player', 'Site cleared');
      return;
    }
    if (!ctx.playerAlive && !state.bomb.planted) {
      endRound('bots', 'You are down');
      return;
    }
    if (state.timer <= 0 && !state.bomb.planted) {
      endRound('bots', 'Time expired');
    }
  }

  return {
    state,
    step,
    startRound,
    startRoundEarly() {
      if (state.phase === 'buy') startRound();
    },
    damagePlayer(amount) {
      let remaining = amount;
      if (state.armor > 0) {
        const absorbed = Math.min(state.armor, remaining * 0.5);
        state.armor -= absorbed;
        remaining -= absorbed;
      }
      state.health -= remaining;
      if (state.health <= 0) {
        state.health = 0;
        hooks.onPlayerDeath();
        return true;
      }
      return false;
    },
    addKillReward() {
      state.money += KILL_MONEY;
    },
    buy(itemId) {
      if (state.phase !== 'buy') return { ok: false, reason: 'Shop is closed' };
      const item = SHOP.find((entry) => entry.id === itemId);
      if (!item) return { ok: false, reason: 'No such item' };
      if (state.money < item.price) return { ok: false, reason: 'Not enough money' };
      if (itemId === 'kevlar' && state.armor >= 100) return { ok: false, reason: 'Armour already full' };
      if (itemId === 'grenade' && !hooks.canBuyGrenade()) return { ok: false, reason: 'Grenades full' };
      state.money -= item.price;
      if (itemId === 'kevlar') state.armor = Math.min(100, state.armor + 50);
      hooks.onBought(itemId);
      return { ok: true };
    },
    resetMatch() {
      state.phase = 'buy';
      state.round = 1;
      state.wins.player = 0;
      state.wins.bots = 0;
      state.money = START_MONEY;
      state.health = 100;
      state.armor = 0;
      state.timer = BUY_SECONDS;
      state.bomb.planted = false;
      state.bomb.site = null;
      state.bomb.fuse = FUSE_SECONDS;
      state.bomb.plantProgress = 0;
      state.bomb.defuseProgress = 0;
      state.lastResult = null;
      state.matchWinner = null;
    },
  };
}
