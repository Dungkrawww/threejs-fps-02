// Dustline: a round-based tactical FPS. One attacker against five defending bots on a
// two-site map. Win a round by clearing the defenders or detonating the bomb; lose it by
// dying before the plant, by the clock, or by a defuse. Money from kills, plants and
// round results buys weapons, armour and grenades in the buy phase between rounds.
// First to five rounds takes the match.
//
// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's rate.
// ?shot=start|combat|plant|win with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createArsenal, createGrenades, WEAPONS } from './arsenal.js';
import { createBots } from './bots.js';
import { createGame, SHOP } from './game.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createSounds } from './sounds.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

const world = createWorld(scene);
const hud = createHud();
const sounds = createSounds();
const player = createPlayer(world.colliders);
const arsenal = createArsenal(camera);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 80;
const direction = new THREE.Vector3();
const grenadeDirection = new THREE.Vector3();

let score = 0;
let kills = 0;
let elapsed = 0;
let started = false;
let playerAlive = true;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let buyOpen = true;

const body = player.state;

const game = createGame({
  onRoundStart(round) {
    hud.hideBuy();
    buyOpen = false;
    hud.hideBanner();
    hud.setRounds(game.state.wins.player, game.state.wins.bots);
    hud.banner(`Round ${round}`, 'Plant the bomb or clear the site.', 2200);
    if (!shot && !input.state.locked) input.requestLock();
  },
  onBuyPhase(round) {
    resetForRound();
    hud.setRounds(game.state.wins.player, game.state.wins.bots);
    hud.showBuy(SHOP, buyItem);
    buyOpen = true;
    hud.banner(`Buy phase — round ${round}`, 'Press B to hide the shop, Enter to start early.', 2200);
  },
  onRoundEnd(winner, reason, round) {
    hud.setRounds(game.state.wins.player, game.state.wins.bots);
    if (winner === 'player') {
      hud.banner(`Round ${round} won`, reason, 3400);
      sounds.roundWin();
    } else {
      hud.banner(`Round ${round} lost`, reason, 3400);
      sounds.roundLose();
    }
  },
  onMatchEnd(winner) {
    const detail = winner === 'player'
      ? `You take the match ${game.state.wins.player}–${game.state.wins.bots}.`
      : winner === 'bots'
        ? `The defenders take the match ${game.state.wins.bots}–${game.state.wins.player}.`
        : `A draw, ${game.state.wins.player}–${game.state.wins.bots}.`;
    hud.showOverlay('match', detail);
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onBombPlanted(site) {
    bots.setObjective(site);
    hud.banner('Bomb planted', `Defend site ${site} — 40 seconds on the fuse.`, 3000);
    sounds.plantBeep();
  },
  onBombExploded() {
    sounds.explosion();
  },
  onBombDefused() {
    hud.banner('Bomb defused', 'The defenders take the round.', 3000);
  },
  onPlayerDeath() {
    playerAlive = false;
    hud.banner('You are down', game.state.bomb.planted ? 'Your bomb is still ticking.' : 'Round lost.', 3000);
  },
  onBought(itemId) {
    sounds.buy();
    if (itemId === 'smg' || itemId === 'sniper') arsenal.buy(itemId);
    else if (itemId === 'grenade') grenades.buy();
    syncHud();
  },
  canBuyGrenade() {
    return grenades.count < grenades.max;
  },
});

const bots = createBots(scene, world, {
  onPlayerHit(amount) {
    if (!playerAlive) return;
    const died = game.damagePlayer(amount);
    sounds.hurt();
    if (died) playerAlive = false;
    syncHud();
  },
  onBotShot() {
    sounds.enemyShot();
  },
  onBotKilled() {
    score += 100;
    kills += 1;
    game.addKillReward();
    hud.killFeed('You eliminated a defender  +$300');
    hud.setScore(score);
    hud.setMoney(game.state.money);
    sounds.kill();
  },
});

const grenades = createGrenades(scene, world, {
  bots: () => bots.bots,
  playerPos: () => body.position,
  playerAlive: () => playerAlive,
  onExplosion() {
    sounds.explosion();
  },
  onBotHit(bot, amount) {
    const killed = bots.damage(bot.torso, amount);
    if (killed) {
      score += 100;
      kills += 1;
      game.addKillReward();
      hud.killFeed('Grenade kill  +$300');
      hud.setScore(score);
      hud.setMoney(game.state.money);
      sounds.kill();
    } else {
      hud.hitMarker(false, 120);
    }
  },
  onPlayerHit(amount) {
    if (!playerAlive) return;
    const died = game.damagePlayer(amount);
    sounds.hurt();
    if (died) playerAlive = false;
    syncHud();
  },
});

const shootables = world.shootables.concat(bots.hitMeshes);

function resetForRound() {
  bots.reset();
  arsenal.refill();
  grenades.reset();
  body.position.copy(world.playerSpawn);
  body.velocity.set(0, 0, 0);
  body.yaw = 0;
  body.pitch = 0;
  playerAlive = true;
  syncCamera();
  syncHud();
}

function syncHud() {
  hud.setAmmo(arsenal.state.mag, arsenal.state.reserve);
  hud.setScore(score);
  hud.setHealth(game.state.health, game.state.armor);
  hud.setMoney(game.state.money);
  hud.setRounds(game.state.wins.player, game.state.wins.bots);
  hud.setWeapon(arsenal.definition.name, grenades.count);
  hud.setTimer(game.state.timer, game.state.phase);
}

function buyItem(itemId) {
  const result = game.buy(itemId);
  if (!result.ok) {
    sounds.denied();
    hud.killFeed(result.reason);
  }
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    sounds.unlock();
    hud.hideOverlay();
  } else if (playerAlive && game.state.phase === 'live') {
    hud.showOverlay('paused');
  }
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function shoot(spread) {
  if (!arsenal.takeRound()) return false;
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(shootables, false)[0];
  if (hit && hit.object.userData.bot) {
    const definition = arsenal.definition;
    const killed = bots.damage(hit.object, hit.object.userData.part === 'head' ? definition.head : definition.damage);
    score += killed ? 100 : 10;
    hud.setScore(score);
    hud.hitMarker(killed, shot ? 4000 : 90);
    sounds.hit();
  }
  arsenal.pullTrigger();
  sounds.shot(arsenal.current);
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  hud.setAmmo(arsenal.state.mag, arsenal.state.reserve);
  return true;
}

function throwGrenade() {
  if (grenades.count <= 0) return;
  camera.getWorldDirection(grenadeDirection);
  const from = new THREE.Vector3().copy(camera.position);
  if (grenades.throwFrom(from, grenadeDirection, body.velocity)) {
    sounds.click();
    syncHud();
  }
}

function handlePressed(pressed) {
  if (pressed.has('KeyB') && game.state.phase === 'buy') {
    buyOpen = !buyOpen;
    if (buyOpen) hud.showBuy(SHOP, buyItem);
    else hud.hideBuy();
    sounds.click();
  }
  if (pressed.has('Enter') && game.state.phase === 'buy') game.startRoundEarly();
  if (pressed.has('KeyG') && game.state.phase === 'live' && playerAlive) throwGrenade();
  if (game.state.phase === 'buy') {
    if (pressed.has('Digit2')) buyItem('smg');
    if (pressed.has('Digit3')) buyItem('sniper');
    if (pressed.has('Digit4')) buyItem('kevlar');
    if (pressed.has('Digit5')) buyItem('grenade');
  } else if (game.state.phase === 'live' && playerAlive) {
    if (pressed.has('Digit1')) arsenal.switchTo('rifle');
    if (pressed.has('Digit2')) arsenal.switchTo('pistol');
    if (pressed.has('Digit3')) arsenal.switchTo('smg');
    if (pressed.has('Digit4')) arsenal.switchTo('sniper');
  }
}

const gameContext = {
  playerAlive: true,
  playerPos: body.position,
  siteAt: null,
  plantHeld: false,
  botsAlive: 5,
  bots,
  world,
  defuser: null,
  started: false,
};

const botContext = {
  playerAlive: true,
  playerPos: body.position,
  playerSpeed: 0,
  bombPlanted: false,
  bombSite: null,
  defuser: null,
  random,
};

function step(dt) {
  elapsed += dt;
  const phase = game.state.phase;
  const live = phase === 'live' && playerAlive;
  const keys = input.state.keys;

  if (phase === 'live' && playerAlive) {
    player.step(dt, keys);
    if (keys.has('KeyR')) arsenal.reload();
  }
  arsenal.step(dt);
  grenades.step(dt);

  gameContext.playerAlive = playerAlive;
  gameContext.siteAt = playerAlive ? world.siteAt(body.position) : null;
  gameContext.plantHeld = playerAlive && keys.has('KeyE');
  gameContext.botsAlive = bots.aliveCount();
  gameContext.started = started;
  game.step(dt, gameContext);

  botContext.playerAlive = playerAlive;
  botContext.playerSpeed = player.groundSpeed();
  botContext.bombPlanted = game.state.bomb.planted;
  botContext.bombSite = game.state.bomb.site;
  botContext.defuser = gameContext.defuser;
  bots.step(dt, elapsed, botContext);

  // HUD: bomb status first, then the numbers.
  const bomb = game.state.bomb;
  if (!bomb.planted && gameContext.plantHeld && gameContext.siteAt) hud.showBomb('planting', bomb.plantProgress);
  else if (bomb.planted && gameContext.defuser) hud.showBomb('defusing', bomb.defuseProgress);
  else if (bomb.planted) hud.showBomb('fuse', 0, bomb.fuse);
  else hud.showBomb(null);
  hud.setTimer(game.state.timer, game.state.phase);
  hud.setHealth(game.state.health, game.state.armor);
  hud.setMoney(game.state.money);
  hud.setWeapon(arsenal.definition.name, grenades.count);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const paused = !shot && !input.state.locked && game.state.phase === 'live' && playerAlive;
    if (!paused) {
      const look = input.takeLook();
      player.look(look.x, look.y);
      handlePressed(input.takePressed());
      if (input.state.firing && arsenal.ready() && game.state.phase === 'live' && playerAlive) {
        shoot(shot ? 0 : arsenal.spread(player.groundSpeed()));
      }
      accumulator += dt;
      let steps = 0;
      while (accumulator >= FIXED_STEP && steps < 5) {
        step(FIXED_STEP);
        accumulator -= FIXED_STEP;
        steps += 1;
      }
      if (accumulator > FIXED_STEP * 5) accumulator = 0;
      syncCamera();
    }
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function placeBot(index, x, z, yaw, stateName) {
  const bot = bots.bots[index];
  bot.group.position.set(x, 0, z);
  bot.yaw = yaw;
  bot.group.rotation.y = yaw;
  bot.state = stateName;
  bot.pauseLeft = 0;
  return bot;
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBanner();
  hud.hideBuy();
  buyOpen = false;
  body.pitch = 0;
  body.yaw = 0;
  started = true;
  if (name === 'start') {
    // Buy phase, round one: the shop open, the map ahead, the money in the corner.
    body.position.copy(world.playerSpawn);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -6));
    hud.showBuy(SHOP, buyItem);
    buyOpen = true;
  } else if (name === 'combat') {
    // Mid-round: two defenders in the sights, one already hit, the tracer still in the air.
    game.state.phase = 'live';
    game.state.timer = 78;
    game.state.money = 2150;
    game.state.wins.player = 1;
    body.position.set(0, 0, 6);
    placeBot(4, 2.5, -2, Math.PI, 'engage');
    placeBot(0, -3.5, -6, Math.PI * 0.85, 'engage');
    bots.bots[4].reactionLeft = 0;
    bots.bots[4].burstLeft = 2;
    bots.bots[0].reactionLeft = 0.9;
    settle(12);
    aimAt(new THREE.Vector3(2.5, 1.25, -2));
    shoot(0);
    settle(2);
    aimAt(new THREE.Vector3(2.5, 1.25, -2));
    shoot(0);
    settle(4);
  } else if (name === 'plant') {
    // The bomb is live on A: the fuse counts down, a defender pushes the site.
    game.state.phase = 'live';
    game.state.timer = 54;
    game.state.money = 3200;
    game.state.wins.player = 2;
    game.state.wins.bots = 1;
    game.state.bomb.planted = true;
    game.state.bomb.site = 'A';
    game.state.bomb.fuse = 32;
    bots.setObjective('A');
    body.position.set(-12, 0, -6.5);
    placeBot(0, -10.5, -7.5, Math.PI * 0.9, 'converge');
    settle(20);
    aimAt(new THREE.Vector3(-15, 1.2, -10));
  } else {
    // Round won: the site is clear, every defender is down, the banner is up.
    game.state.phase = 'end';
    game.state.timer = 3;
    game.state.money = 4800;
    game.state.wins.player = 2;
    game.state.wins.bots = 0;
    score = 240;
    kills = 2;
    body.position.set(0, 0, 2);
    for (const bot of bots.bots) {
      bot.alive = false;
      bot.state = 'dead';
      bot.fall = 1;
      bot.group.rotation.x = -1.45;
      bot.group.position.y = -0.08;
    }
    bots.bots[1].group.position.set(-2, -0.08, -3);
    bots.bots[3].group.position.set(3, -0.08, -5);
    settle(10);
    aimAt(new THREE.Vector3(0, 1.2, -8));
    hud.banner('Round 2 won', 'Site cleared', 60000);
  }
  syncHud();
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.domElement.addEventListener('click', () => {
  if (!shot && !input.state.locked && (game.state.phase === 'buy' || game.state.phase === 'live')) {
    input.requestLock();
  }
});

hud.onPlay(() => {
  if (shot) return;
  sounds.unlock();
  if (game.state.phase === 'match') {
    game.resetMatch();
    resetForRound();
    hud.hideOverlay();
    hud.showBuy(SHOP, buyItem);
    buyOpen = true;
    input.requestLock();
    return;
  }
  input.requestLock();
});

syncCamera();
syncHud();
hud.showBuy(SHOP, buyItem);
if (shot) runShot(shot);
else requestAnimationFrame(frame);
