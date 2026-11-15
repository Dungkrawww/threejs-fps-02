# Dustline — a three.js tactical FPS

One attacker against five defending bots on a two-site map. Win a round by clearing
the defenders or detonating the bomb; lose it by dying before the plant, by the clock,
or by a defuse. Money from kills, plants and round results buys weapons, armour and
grenades in the buy phase between rounds. First to five rounds takes the match.

## How to play

Open `game/index.html` through a static server (for example `node serve.ts`, then
open http://localhost:8080) and click to play. Pointer lock turns the mouse into
look; `Esc` pauses.

- **W A S D** move · **Mouse** look · **Click** fire · **R** reload
- **1–4** switch weapon · **G** throw a grenade · **E** hold to plant the bomb on a site
- **B** buy menu (buy phase) · **Enter** start the round early
- **Ctrl** crouch · **Space** jump

## The game

- **Map** — Dustline: site A west, site B east, a mid lane split by a pillar, side
  lanes on both flanks, crates to crouch behind. Two bomb sites are marked by orange
  floor plates and a flag pole.
- **Bots** — five defenders patrol their site, hold position, and shoot back. They
  check line of sight, wait a reaction beat, then fire in bursts with a spread that
  grows with your speed and range. When the bomb is planted they converge on the site
  and the nearest one channels the defuse.
- **Economy** — start with $800 and a rifle and a pistol. A kill pays $300, a plant
  $300, a round win $3,250, a loss $1,400. The shop sells the Kestrel SMG ($1,500),
  the Longbow sniper ($2,750), a Kevlar vest ($650) and HE grenades ($300).
- **Gunplay** — four hitscan weapons with their own magazine, reload, spread and
  damage; headshots pay double. Spread punishes firing on the move. The grenade flies
  a real arc, bounces, and bursts in an area.
- **Rounds** — 100 seconds a round, 40 seconds on the bomb fuse, 5 seconds to defuse.
  First to five rounds wins the match.

## Files

- `main.ts` — the entry program: copies `game/` and `screenshots/` to the output
  and writes `dossier.json` with the vendored make.fun library.
- `game/` — the game itself, plain static ES modules, three.js 0.187.0 vendored
  under `game/vendor/three/`. No build step, no network request.
  - `src/main.js` — boot, the fixed 60 Hz loop, shooting, and the `?shot=` capture
    harness used for the screenshots.
  - `src/world.js` — the two-site map, colliders, sites, spawns and patrol routes.
  - `src/bots.js` — the five defenders: patrol, engage, converge, defuse.
  - `src/arsenal.js` — the four weapons and the grenade system.
  - `src/game.js` — rounds, money, the bomb, the win.
  - `src/player.js` — movement: acceleration, friction, gravity, crouch, jump.
  - `src/hud.js` — the DOM HUD, kill feed, banners and the buy menu.
  - `src/input.js` — keyboard, mouse and pointer lock.
  - `src/sounds.js` — synthesised WebAudio effects; no audio files.
  - `src/palette.js` — the six-colour look plan.
- `screenshots/` — four renders of the game's own code: buy phase, combat, the bomb
  live on A, and a round won.
- `serve.ts` — a tiny static server for local play (`node serve.ts`).

## License

MIT — see `LICENSE`.
