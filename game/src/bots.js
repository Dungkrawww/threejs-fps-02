// Five defending bots: they patrol their site, hold a position, and shoot back. Each bot
// is a small state machine — patrol, engage, converge on a planted bomb, defuse — with
// line-of-sight by raycast, a reaction delay before the first burst, and a fall when dead.
// They never jump or climb; the map is flat, so they walk waypoints with the same
// axis-separated box collision the player uses. All randomness comes from the seeded
// function main.js passes in, so a shot capture replays the same fight.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const HEALTH = 100;
const WALK_SPEED = 3.4;
const RADIUS = 0.34;
const HEIGHT = 1.72;
const EYE = 1.5;
const REACTION_MIN = 0.35;
const REACTION_MAX = 0.8;
const BURST_MIN = 3;
const BURST_MAX = 5;
const SHOT_GAP = 0.13;
const BURST_PAUSE_MIN = 0.9;
const BURST_PAUSE_MAX = 1.4;
const SIGHT_RANGE = 30;
const DEFUSE_SECONDS = 5;
const DEFUSE_RANGE = 2.4;
const TRACER_LIFE = 0.09;

const _origin = new THREE.Vector3();
const _target = new THREE.Vector3();
const _direction = new THREE.Vector3();
const _playerBox = new THREE.Box3();
const _boxMin = new THREE.Vector3();
const _boxMax = new THREE.Vector3();
const _hitPoint = new THREE.Vector3();

export function createBots(scene, world, hooks) {
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.6, metalness: 0.05 });
  const headMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.45, metalness: 0.1 });
  const gunMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.3 });
  const torsoGeometry = new THREE.BoxGeometry(0.52, 0.78, 0.3);
  const headGeometry = new THREE.SphereGeometry(0.155, 16, 12);
  const gunGeometry = new THREE.BoxGeometry(0.07, 0.09, 0.55);
  const flashGeometry = new THREE.PlaneGeometry(0.22, 0.22);
  const flashMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide,
  });

  const raycaster = new THREE.Raycaster();
  raycaster.far = SIGHT_RANGE;

  // Tracer pool: eight additive lines, reused, so firing never allocates.
  const tracers = [];
  const tracerMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
  });
  for (let i = 0; i < 8; i += 1) {
    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geometry, tracerMaterial.clone());
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  function fireTracer(from, to) {
    const tracer = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % tracers.length;
    const positions = tracer.line.geometry.attributes.position;
    positions.setXYZ(0, from.x, from.y, from.z);
    positions.setXYZ(1, to.x, to.y, to.z);
    positions.needsUpdate = true;
    tracer.line.visible = true;
    tracer.line.material.opacity = 0.85;
    tracer.life = TRACER_LIFE;
  }

  const bots = [];
  const hitMeshes = [];

  for (let index = 0; index < world.botSpawns.length; index += 1) {
    const spawn = world.botSpawns[index];
    const group = new THREE.Group();
    group.position.copy(spawn);

    const torso = new THREE.Mesh(torsoGeometry, bodyMaterial);
    torso.position.y = 1.0;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.53;
    head.userData.part = 'head';
    const gun = new THREE.Mesh(gunGeometry, gunMaterial);
    gun.position.set(0.2, 1.25, -0.3);
    const flash = new THREE.Mesh(flashGeometry, flashMaterial.clone());
    flash.position.set(0.2, 1.25, -0.62);
    flash.visible = false;
    group.add(torso, head, gun, flash);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(group);

    const bot = {
      group, torso, head, gun, flash,
      home: spawn.clone(),
      waypoints: world.waypoints[index],
      waypoint: 0,
      health: HEALTH,
      alive: true,
      fall: 0,
      yaw: Math.PI,
      state: 'patrol',
      pauseLeft: 0,
      reactionLeft: 0,
      burstLeft: 0,
      shotTimer: 0,
      pauseTimer: 0,
      strafeDir: 0,
      strafeTimer: 0,
      seenAt: -100,
      flashLeft: 0,
    };
    torso.userData.bot = bot;
    head.userData.bot = bot;
    hitMeshes.push(torso, head);
    bots.push(bot);
  }

  function overlaps(x, y, z) {
    _boxMin.set(x - RADIUS, y + 0.04, z - RADIUS);
    _boxMax.set(x + RADIUS, y + HEIGHT - 0.04, z + RADIUS);
    _playerBox.min.copy(_boxMin);
    _playerBox.max.copy(_boxMax);
    for (const collider of world.colliders) if (_playerBox.intersectsBox(collider)) return true;
    return false;
  }

  function moveBot(bot, dt, wishX, wishZ) {
    const length = Math.hypot(wishX, wishZ) || 1;
    const stepX = (wishX / length) * WALK_SPEED * dt;
    const stepZ = (wishZ / length) * WALK_SPEED * dt;
    const nextX = bot.group.position.x + stepX;
    if (!overlaps(nextX, 0, bot.group.position.z)) bot.group.position.x = nextX;
    const nextZ = bot.group.position.z + stepZ;
    if (!overlaps(bot.group.position.x, 0, nextZ)) bot.group.position.z = nextZ;
  }

  function faceToward(bot, x, z, dt) {
    const target = Math.atan2(-(x - bot.group.position.x), -(z - bot.group.position.z));
    let diff = target - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
    bot.group.rotation.y = bot.yaw;
  }

  function canSee(bot, playerPos) {
    _origin.set(bot.group.position.x, EYE, bot.group.position.z);
    _target.set(playerPos.x, playerPos.y + 1.25, playerPos.z);
    _direction.copy(_target).sub(_origin);
    const distance = _direction.length();
    if (distance > SIGHT_RANGE) return false;
    _direction.normalize();
    raycaster.set(_origin, _direction);
    raycaster.far = distance;
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    return !hit;
  }

  function muzzleOf(bot) {
    _origin.set(bot.group.position.x, 1.25, bot.group.position.z);
    _origin.x += Math.sin(bot.yaw) * -0.2;
    _origin.z += Math.cos(bot.yaw) * -0.2;
    return _origin;
  }

  function botShoot(bot, ctx) {
    const playerPos = ctx.playerPos;
    const muzzle = muzzleOf(bot).clone();
    _target.set(playerPos.x, playerPos.y + 1.25, playerPos.z);
    _direction.copy(_target).sub(muzzle);
    const distance = _direction.length();
    _direction.normalize();
    // Spread grows with the player's speed and with range: a still target up close is
    // hittable, but never a certainty — a defender should pressure, not delete.
    const spread = 0.045 + 0.03 * Math.min(1, ctx.playerSpeed / 5.2) + 0.02 * (distance / SIGHT_RANGE);
    _direction.x += (ctx.random() * 2 - 1) * spread;
    _direction.y += (ctx.random() * 2 - 1) * spread;
    _direction.z += (ctx.random() * 2 - 1) * spread;
    _direction.normalize();

    // A wall between muzzle and player stops the shot before the player test runs.
    raycaster.set(muzzle, _direction);
    raycaster.far = distance + 2;
    const wall = raycaster.intersectObjects(world.shootables, false)[0];
    _hitPoint.copy(muzzle).addScaledVector(_direction, distance);
    let hitPlayer = false;
    if (!wall || wall.distance > distance) {
      _boxMin.set(playerPos.x - RADIUS, playerPos.y, playerPos.z - RADIUS);
      _boxMax.set(playerPos.x + RADIUS, playerPos.y + HEIGHT, playerPos.z + RADIUS);
      _playerBox.min.copy(_boxMin);
      _playerBox.max.copy(_boxMax);
      const ray = new THREE.Ray(muzzle, _direction);
      const at = ray.intersectBox(_playerBox, _hitPoint);
      hitPlayer = at !== null;
    } else {
      _hitPoint.copy(wall.point);
    }
    fireTracer(muzzle, _hitPoint);
    bot.flash.visible = true;
    bot.flashLeft = 0.05;
    hooks.onBotShot(bot);
    if (hitPlayer) {
      const amount = distance < 15 ? 18 : distance < 25 ? 14 : 10;
      hooks.onPlayerHit(amount, bot);
    }
  }

  function damage(mesh, amount) {
    const bot = mesh.userData.bot;
    if (!bot || !bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.fall = 0;
    bot.state = 'dead';
    bot.flash.visible = false;
    hooks.onBotKilled(bot);
    return true;
  }

  function step(dt, time, ctx) {
    for (const tracer of tracers) {
      if (tracer.life <= 0) continue;
      tracer.life -= dt;
      tracer.line.material.opacity = Math.max(0, tracer.life / TRACER_LIFE) * 0.85;
      if (tracer.life <= 0) tracer.line.visible = false;
    }

    for (const bot of bots) {
      if (bot.flashLeft > 0) {
        bot.flashLeft -= dt;
        if (bot.flashLeft <= 0) bot.flash.visible = false;
      }
      if (!bot.alive) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.group.rotation.x = -bot.fall * 1.45;
        bot.group.position.y = -bot.fall * 0.08;
        continue;
      }
      bot.group.rotation.x = 0;
      bot.group.position.y = 0;

      const sees = ctx.playerAlive && canSee(bot, ctx.playerPos);
      if (sees) {
        bot.seenAt = time;
        if (bot.state !== 'engage') {
          bot.state = 'engage';
          bot.reactionLeft = REACTION_MIN + ctx.random() * (REACTION_MAX - REACTION_MIN);
          bot.burstLeft = 0;
        }
      } else if (bot.state === 'engage' && time - bot.seenAt > 1.2) {
        bot.state = ctx.bombPlanted ? 'converge' : 'patrol';
      }

      if (bot.state === 'patrol') {
        if (bot.pauseLeft > 0) {
          bot.pauseLeft -= dt;
          bot.yaw += dt * 0.5;
          bot.group.rotation.y = bot.yaw;
        } else {
          const [wx, wz] = bot.waypoints[bot.waypoint];
          const dx = wx - bot.group.position.x;
          const dz = wz - bot.group.position.z;
          if (Math.hypot(dx, dz) < 0.6) {
            bot.waypoint = (bot.waypoint + 1) % bot.waypoints.length;
            bot.pauseLeft = 0.6 + ctx.random() * 0.9;
          } else {
            moveBot(bot, dt, dx, dz);
            faceToward(bot, wx, wz, dt);
          }
        }
      } else if (bot.state === 'converge') {
        const site = world.sites[ctx.bombSite];
        if (site) {
          const dx = site.center.x - bot.group.position.x;
          const dz = site.center.z - bot.group.position.z;
          const distance = Math.hypot(dx, dz);
          if (distance > DEFUSE_RANGE) {
            moveBot(bot, dt, dx, dz);
            faceToward(bot, site.center.x, site.center.z, dt);
          } else if (ctx.defuser !== bot) {
            faceToward(bot, site.center.x, site.center.z, dt);
          }
        }
      } else if (bot.state === 'engage') {
        faceToward(bot, ctx.playerPos.x, ctx.playerPos.z, dt);
        // Sidestep while firing, so a bot is never a still target.
        bot.strafeTimer -= dt;
        if (bot.strafeTimer <= 0) {
          bot.strafeDir = ctx.random() < 0.5 ? -1 : 1;
          bot.strafeTimer = 1.4 + ctx.random() * 1.2;
        }
        const sin = Math.sin(bot.yaw);
        const cos = Math.cos(bot.yaw);
        moveBot(bot, dt, cos * bot.strafeDir * 0.4, -sin * bot.strafeDir * 0.4);
        if (bot.reactionLeft > 0) {
          bot.reactionLeft -= dt;
        } else if (bot.burstLeft > 0) {
          bot.shotTimer -= dt;
          if (bot.shotTimer <= 0) {
            botShoot(bot, ctx);
            bot.burstLeft -= 1;
            bot.shotTimer = SHOT_GAP;
            if (bot.burstLeft === 0) bot.pauseTimer = BURST_PAUSE_MIN + ctx.random() * (BURST_PAUSE_MAX - BURST_PAUSE_MIN);
          }
        } else {
          bot.pauseTimer -= dt;
          if (bot.pauseTimer <= 0) {
            bot.burstLeft = BURST_MIN + Math.floor(ctx.random() * (BURST_MAX - BURST_MIN + 1));
            bot.shotTimer = 0;
          }
        }
      }
    }
  }

  return {
    bots,
    hitMeshes,
    damage,
    step,
    aliveCount() {
      return bots.filter((bot) => bot.alive).length;
    },
    setObjective(siteName) {
      for (const bot of bots) {
        if (bot.alive && bot.state !== 'engage') bot.state = siteName ? 'converge' : 'patrol';
      }
    },
    nearestAliveTo(point) {
      let best = null;
      let bestDistance = Infinity;
      for (const bot of bots) {
        if (!bot.alive) continue;
        const distance = Math.hypot(bot.group.position.x - point.x, bot.group.position.z - point.z);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = bot;
        }
      }
      return best;
    },
    reset() {
      for (const bot of bots) {
        bot.alive = true;
        bot.health = HEALTH;
        bot.fall = 0;
        bot.state = 'patrol';
        bot.waypoint = 0;
        bot.pauseLeft = 0;
        bot.reactionLeft = 0;
        bot.burstLeft = 0;
        bot.group.rotation.set(0, Math.PI, 0);
        bot.group.position.copy(bot.home);
        bot.yaw = Math.PI;
        bot.flash.visible = false;
      }
    },
  };
}
