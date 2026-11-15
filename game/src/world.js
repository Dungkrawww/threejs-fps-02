// The map: Dustline, a two-site raid ground. Attackers spawn south, defenders hold the
// north. Site A west, site B east, a mid lane split by a pillar, side lanes on both
// flanks, crates to crouch behind. Every box is a collider for the player and the bots
// and a surface a bullet stops on. Plain geometry only, no models and no textures.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// North is -z. The player (attacker) spawns south at z = +12.5 and walks north to the sites.
const SITES = {
  A: { center: new THREE.Vector3(-15, 0, -10), radius: 3.4 },
  B: { center: new THREE.Vector3(15, 0, -10), radius: 3.4 },
};

const PLAYER_SPAWN = new THREE.Vector3(0, 0, 12.5);

// Defender spawns: two hold A, two hold B, one roams mid.
const BOT_SPAWNS = [
  new THREE.Vector3(-16, 0, -11),
  new THREE.Vector3(-13, 0, -8),
  new THREE.Vector3(16, 0, -11),
  new THREE.Vector3(13, 0, -8),
  new THREE.Vector3(0, 0, -10),
];

// Patrol loops, one per bot, in the same order as BOT_SPAWNS.
const WAYPOINTS = [
  [[-16, -12], [-12, -8], [-17, -7], [-15, -12]],
  [[-13, -11], [-16, -6], [-11, -9], [-13, -11]],
  [[16, -12], [12, -8], [17, -7], [15, -12]],
  [[13, -11], [16, -6], [11, -9], [13, -11]],
  [[0, -4], [-3, 2], [3, 2], [0, -6]],
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  // Site plates glow a little so a site reads at a glance, even in fog.
  const siteMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.accent),
    roughness: 0.6,
    metalness: 0.05,
    emissive: new THREE.Color(PALETTE.accent),
    emissiveIntensity: 0.25,
  });

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Floor and the outer walls: 40 x 30 m, 5 m high, open to the dusk sky.
  box(40.4, 0.4, 30.4, 0, -0.2, 0, 'surface');
  box(0.4, 5, 30.4, -20.2, 2.5, 0, 'surface');
  box(0.4, 5, 30.4, 20.2, 2.5, 0, 'surface');
  box(40.4, 5, 0.4, 0, 2.5, -15.2, 'surface');
  box(40.4, 5, 0.4, 0, 2.5, 15.2, 'surface');

  // Mid divider: two wall runs with a 14 m gap in the middle, split by one pillar,
  // so mid is two doors, not a shooting gallery.
  box(13, 5, 0.6, -13.5, 2.5, 0, 'surface');
  box(13, 5, 0.6, 13.5, 2.5, 0, 'surface');
  box(2, 3.4, 2, 0, 1.7, 0, 'hairline');

  // Flank pillars on the divider line.
  box(1.2, 3.2, 1.2, -12, 1.6, 0, 'hairline');
  box(1.2, 3.2, 1.2, 12, 1.6, 0, 'hairline');

  // Cover crates: crouch height on the lanes, taller ones guarding the sites.
  box(1.6, 1.1, 1.6, -4, 0.55, 3, 'hairline');
  box(1.6, 1.1, 1.6, 4, 0.55, 3, 'hairline');
  box(1.6, 1.1, 1.6, -4, 0.55, -3, 'hairline');
  box(1.6, 1.1, 1.6, 4, 0.55, -3, 'hairline');
  box(2.2, 1.1, 1.2, -6, 0.55, 8, 'hairline');
  box(2.2, 1.1, 1.2, 6, 0.55, 8, 'hairline');
  box(1.6, 1.1, 1.6, -16, 0.55, -8, 'hairline');
  box(1.2, 2.2, 1.2, -13, 1.1, -12, 'hairline');
  box(1.2, 1.1, 3.4, -18, 0.55, -11, 'hairline');
  box(1.6, 1.1, 1.6, 16, 0.55, -8, 'hairline');
  box(1.2, 2.2, 1.2, 13, 1.1, -12, 'hairline');
  box(1.2, 1.1, 3.4, 18, 0.55, -11, 'hairline');
  box(2.4, 0.9, 1.2, -9, 0.45, -12.5, 'hairline');
  box(2.4, 0.9, 1.2, 9, 0.45, -12.5, 'hairline');

  // Site plates: flat, flush with the floor, visual only (not colliders, not shootables),
  // so they never block a step or a bullet. A pole with a flag marks each site from afar.
  for (const site of Object.values(SITES)) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(site.radius * 2, 0.08, site.radius * 2), siteMaterial);
    plate.position.set(site.center.x, 0.04, site.center.z);
    plate.receiveShadow = true;
    group.add(plate);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.4, 0.12), materials.hairline);
    pole.position.set(site.center.x, 1.7, site.center.z);
    pole.castShadow = true;
    group.add(pole);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.06), siteMaterial);
    flag.position.set(site.center.x + 0.5, 3.1, site.center.z);
    flag.castShadow = true;
    group.add(flag);
  }

  // Light: a low amber sun from the west (dusk), a cool fill from the east, and a sky
  // gradient overhead, so the sand reads warm and the shadows read cold.
  const sky = new THREE.HemisphereLight(new THREE.Color('#8a7a68'), new THREE.Color(PALETTE.canvas), 1.45);
  scene.add(sky);

  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb45e'), 2.6);
  sun.position.set(-18, 10, 6);
  sun.target.position.set(4, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -24;
  sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(new THREE.Color('#5e7a9e'), 0.7);
  fill.position.set(14, 12, 12);
  scene.add(fill);

  return {
    colliders,
    shootables,
    group,
    sites: SITES,
    playerSpawn: PLAYER_SPAWN,
    botSpawns: BOT_SPAWNS,
    waypoints: WAYPOINTS,
    siteAt(point) {
      for (const [name, site] of Object.entries(SITES)) {
        const dx = point.x - site.center.x;
        const dz = point.z - site.center.z;
        if (dx * dx + dz * dz <= site.radius * site.radius) return name;
      }
      return null;
    },
  };
}
