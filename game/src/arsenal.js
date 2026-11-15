// The arsenal: four hitscan weapons and a throwing grenade. One weapon is live at a time;
// each owns its magazine, reserve, reload and spread, and its own view model. The
// grenade system flies a fused charge on a real arc, bounces off the map, and bursts in
// an area. main.js owns the ray and the damage; this module owns the numbers and the
// models. No per-frame allocation in the step loops.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  rifle: { name: 'VK-47', price: 0, mag: 30, reserve: 90, gap: 0.096, reload: 1.9, damage: 34, head: 100, still: 0.0022, move: 0.028, auto: true, slot: 1 },
  pistol: { name: 'P9', price: 300, mag: 12, reserve: 48, gap: 0.22, reload: 1.4, damage: 25, head: 75, still: 0.004, move: 0.02, auto: false, slot: 2 },
  smg: { name: 'Kestrel', price: 1500, mag: 28, reserve: 112, gap: 0.075, reload: 1.7, damage: 22, head: 66, still: 0.006, move: 0.035, auto: true, slot: 3 },
  sniper: { name: 'Longbow', price: 2750, mag: 5, reserve: 15, gap: 1.1, reload: 2.6, damage: 95, head: 190, still: 0.0008, move: 0.05, auto: false, slot: 4 },
};

const GRENADE_PRICE = 300;
const GRENADE_MAX = 2;
const FUSE_SECONDS = 2.5;
const BLAST_RADIUS = 5;
const BLAST_CENTER = 85;
const BLAST_EDGE = 20;

const _probe = new THREE.Box3();

function buildModel(definition, camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.5, metalness: 0.35 });
  const model = new THREE.Group();
  function part(material, w, h, d, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    model.add(mesh);
    return mesh;
  }
  if (definition === WEAPONS.rifle) {
    part(body, 0.09, 0.1, 0.42, 0, 0, 0);
    part(body, 0.045, 0.045, 0.4, 0, 0.025, -0.38);
    part(grip, 0.075, 0.08, 0.22, 0, -0.02, 0.3);
  } else if (definition === WEAPONS.pistol) {
    part(body, 0.07, 0.06, 0.26, 0, 0.01, -0.05);
    part(body, 0.06, 0.14, 0.08, 0, -0.08, 0.08);
  } else if (definition === WEAPONS.smg) {
    part(body, 0.08, 0.09, 0.34, 0, 0, 0);
    part(body, 0.04, 0.04, 0.3, 0, 0.02, -0.3);
    part(body, 0.05, 0.16, 0.06, 0, -0.1, -0.05);
    part(grip, 0.05, 0.05, 0.12, 0, 0.05, -0.2);
  } else {
    part(body, 0.06, 0.07, 0.7, 0, 0, -0.1);
    part(body, 0.05, 0.06, 0.2, 0, -0.02, 0.28);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 10), grip);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.07, -0.05);
    model.add(scope);
  }
  model.position.set(0.27, -0.24, -0.5);
  model.scale.setScalar(0.72);
  model.visible = false;
  camera.add(model);
  return model;
}

export function createArsenal(camera) {
  const models = {};
  for (const [id, definition] of Object.entries(WEAPONS)) models[id] = buildModel(definition, camera);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, 0.16),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.27, -0.22, -1.05);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.27, -0.2, -0.7);
  camera.add(flashLight);

  const owned = new Set(['rifle', 'pistol']);
  const states = {};
  for (const [id, definition] of Object.entries(WEAPONS)) {
    states[id] = { mag: definition.mag, reserve: definition.reserve, cooldown: 0, reloadLeft: 0 };
  }
  let current = 'rifle';
  let switchLeft = 0;
  let flashLeft = 0;
  let kick = 0;
  models.rifle.visible = true;

  function state() {
    return states[current];
  }

  function step(dt) {
    const currentState = states[current];
    currentState.cooldown = Math.max(0, currentState.cooldown - dt);
    flashLeft = Math.max(0, flashLeft - dt);
    kick += (0 - kick) * Math.min(1, dt * 14);
    const model = models[current];
    model.position.z = -0.5 + kick - (switchLeft > 0 ? 0.12 : 0);
    model.rotation.x = kick * 2.2 + (switchLeft > 0 ? 0.5 : 0);
    flash.visible = flashLeft > 0;
    flash.rotation.z = flashLeft * 30;
    flashLight.intensity = flashLeft > 0 ? 10 : 0;
    if (switchLeft > 0) switchLeft = Math.max(0, switchLeft - dt);
    if (currentState.reloadLeft > 0) {
      currentState.reloadLeft = Math.max(0, currentState.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (WEAPONS[current].reload - currentState.reloadLeft) * 2);
      if (currentState.reloadLeft === 0) {
        const definition = WEAPONS[current];
        const need = definition.mag - currentState.mag;
        const take = Math.min(need, currentState.reserve);
        currentState.mag += take;
        currentState.reserve -= take;
      }
    }
  }

  return {
    owned,
    get current() {
      return current;
    },
    get definition() {
      return WEAPONS[current];
    },
    get state() {
      return state();
    },
    step,
    ready() {
      const currentState = states[current];
      return currentState.mag > 0 && currentState.cooldown === 0 && currentState.reloadLeft === 0 && switchLeft === 0;
    },
    pullTrigger() {
      states[current].cooldown = WEAPONS[current].gap;
      flashLeft = 0.06;
      kick = 0.055;
    },
    takeRound() {
      const currentState = states[current];
      if (currentState.mag <= 0) return false;
      currentState.mag -= 1;
      return true;
    },
    reload() {
      const currentState = states[current];
      const definition = WEAPONS[current];
      if (currentState.reloadLeft > 0 || currentState.mag === definition.mag || currentState.reserve === 0) return;
      currentState.reloadLeft = definition.reload;
    },
    spread(speed) {
      const definition = WEAPONS[current];
      return definition.still + Math.min(1, speed / 5.2) * definition.move;
    },
    switchTo(id) {
      if (!owned.has(id) || id === current || switchLeft > 0) return false;
      models[current].visible = false;
      current = id;
      models[current].visible = true;
      states[current].cooldown = 0;
      switchLeft = 0.45;
      return true;
    },
    buy(id) {
      if (owned.has(id)) return false;
      owned.add(id);
      states[id].mag = WEAPONS[id].mag;
      states[id].reserve = WEAPONS[id].reserve;
      states[id].cooldown = 0;
      states[id].reloadLeft = 0;
      return true;
    },
    refill() {
      for (const [id, definition] of Object.entries(WEAPONS)) {
        states[id].mag = definition.mag;
        states[id].reserve = definition.reserve;
        states[id].cooldown = 0;
        states[id].reloadLeft = 0;
      }
      flashLeft = 0;
      switchLeft = 0;
    },
  };
}

export function createGrenades(scene, world, hooks) {
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.4, metalness: 0.5 });
  const blastMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false,
  });
  const sphereGeometry = new THREE.SphereGeometry(0.09, 12, 10);
  const blastGeometry = new THREE.SphereGeometry(1, 20, 14);
  const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 14);
  scene.add(light);

  const live = [];
  let count = 0;

  function overlaps(x, y, z) {
    _probe.min.set(x - 0.09, y - 0.09, z - 0.09);
    _probe.max.set(x + 0.09, y + 0.09, z + 0.09);
    for (const collider of world.colliders) if (_probe.intersectsBox(collider)) return collider;
    return null;
  }

  function explode(grenade) {
    const at = grenade.mesh.position;
    light.position.copy(at);
    light.intensity = 60;
    const blast = new THREE.Mesh(blastGeometry, blastMaterial.clone());
    blast.position.copy(at);
    blast.scale.setScalar(0.2);
    scene.add(blast);
    live.push({ mesh: null, blast, blastLife: 0.5, velocity: null, fuse: 0, dead: true });
    hooks.onExplosion(at);
    for (const bot of hooks.bots()) {
      if (!bot.alive) continue;
      const distance = Math.hypot(bot.group.position.x - at.x, bot.group.position.z - at.z, 1.0 - at.y);
      if (distance > BLAST_RADIUS) continue;
      const amount = Math.round(BLAST_EDGE + (BLAST_CENTER - BLAST_EDGE) * (1 - distance / BLAST_RADIUS));
      hooks.onBotHit(bot, amount);
    }
    const playerDistance = Math.hypot(hooks.playerPos().x - at.x, hooks.playerPos().z - at.z, (hooks.playerPos().y + 1.2) - at.y);
    if (playerDistance < BLAST_RADIUS && hooks.playerAlive()) {
      const amount = Math.round((BLAST_EDGE + (BLAST_CENTER - BLAST_EDGE) * (1 - playerDistance / BLAST_RADIUS)) * 0.5);
      hooks.onPlayerHit(amount);
    }
  }

  function step(dt) {
    light.intensity = Math.max(0, light.intensity - dt * 180);
    for (let i = live.length - 1; i >= 0; i -= 1) {
      const grenade = live[i];
      if (grenade.blast) {
        grenade.blastLife -= dt;
        grenade.blast.scale.setScalar(0.2 + (0.5 - grenade.blastLife) * BLAST_RADIUS * 2);
        grenade.blast.material.opacity = Math.max(0, grenade.blastLife / 0.5) * 0.55;
        if (grenade.blastLife <= 0) {
          scene.remove(grenade.blast);
          grenade.blast.material.dispose();
          live.splice(i, 1);
        }
        continue;
      }
      grenade.fuse -= dt;
      grenade.velocity.y -= 18 * dt;
      const mesh = grenade.mesh;
      const nextX = mesh.position.x + grenade.velocity.x * dt;
      if (!overlaps(nextX, mesh.position.y, mesh.position.z)) mesh.position.x = nextX;
      else grenade.velocity.x *= -0.45;
      const nextZ = mesh.position.z + grenade.velocity.z * dt;
      if (!overlaps(mesh.position.x, mesh.position.y, nextZ)) mesh.position.z = nextZ;
      else grenade.velocity.z *= -0.45;
      const nextY = mesh.position.y + grenade.velocity.y * dt;
      if (!overlaps(mesh.position.x, nextY, mesh.position.z)) mesh.position.y = nextY;
      else {
        grenade.velocity.y *= -0.45;
        grenade.velocity.x *= 0.8;
        grenade.velocity.z *= 0.8;
      }
      if (mesh.position.y < 0.09) {
        mesh.position.y = 0.09;
        grenade.velocity.y = Math.abs(grenade.velocity.y) * 0.45;
      }
      mesh.rotation.x += dt * 9;
      mesh.rotation.z += dt * 7;
      if (grenade.fuse <= 0) {
        explode(grenade);
        scene.remove(mesh);
        live.splice(i, 1);
      }
    }
  }

  return {
    get count() {
      return count;
    },
    get max() {
      return GRENADE_MAX;
    },
    get price() {
      return GRENADE_PRICE;
    },
    buy() {
      if (count >= GRENADE_MAX) return false;
      count += 1;
      return true;
    },
    throwFrom(position, direction, playerVelocity) {
      if (count <= 0) return false;
      count -= 1;
      const mesh = new THREE.Mesh(sphereGeometry, bodyMaterial);
      mesh.position.copy(position);
      mesh.castShadow = true;
      scene.add(mesh);
      const velocity = new THREE.Vector3()
        .copy(direction)
        .multiplyScalar(14)
        .add(new THREE.Vector3(0, 4.5, 0))
        .add(playerVelocity);
      live.push({ mesh, blast: null, blastLife: 0, velocity, fuse: FUSE_SECONDS, dead: false });
      return true;
    },
    reset() {
      for (const grenade of live) {
        if (grenade.mesh) scene.remove(grenade.mesh);
        if (grenade.blast) {
          scene.remove(grenade.blast);
          grenade.blast.material.dispose();
        }
      }
      live.length = 0;
      light.intensity = 0;
      count = 0;
    },
    step,
  };
}
