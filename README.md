[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/queenxaz/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/queenxaz/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

# Ember Yard — a three.js tactical FPS

A round-based tactical shooter for make.fun's [threejs-fps-02](https://make.fun/bounty/threejs-fps-02) bounty. One attacker against five defenders in a dusk industrial yard: plant the charge at site A (the loading dock) or site B (the fuel depot), or clear the yard. First to 5 rounds takes the match.

## The game

- **Complete rounds:** first-person view with pointer-lock mouse look and WASD movement, a weapon that fires, reloads and runs dry, five bots that move, see and shoot back, rounds that end in a win or a loss and restart, and a HUD with health, armour, ammunition, the round timer, the score, money and the bomb status.
- **Gunplay:** hitscan against bodies with a headshot bonus, recoil and spread that punish firing on the move, acceleration-based movement, crouching and AABB collision with the map — stopping to aim pays.
- **Tactics:** a bomb to plant (hold E at a site) and defuse, money earned each round and spent in a buy menu (VK-7 rifle, Hornet-9 SMG, frag grenades, Kevlar, ammo), and bots that patrol the waypoint graph, hold the sites, and react to sight and sound.
- **The map:** Ember Yard, an original 48×36 m industrial yard with three lanes, a container stack, a gantry crane, fuel tanks and a loading dock — lit in dusk amber and teal, all procedural geometry, no external assets.
- **Code:** one module per job (`main`, `map`, `player`, `weapons`, `bots`, `bomb`, `audio`, `hud`, `input`, `palette`), a fixed 60 Hz simulation kept apart from rendering, pooled tracers and impacts so the hot loop allocates nothing, and state in one place.

## Play it

```sh
node serve.ts   # serves game/ on http://localhost:8080
```

Open http://localhost:8080 in desktop Chrome. Click to play. `W A S D` move, mouse looks, click fires, `R` reloads, `1/2/3` switch weapons, `Q` throws a grenade, `E` (hold) plants the bomb at a site, `B` opens the buy menu, `Ctrl` crouches, `Space` jumps, `M` mutes.

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to `/output` and writes `/output/dossier.json` with the vendored make.fun library. Screenshots are staged with `?shot=start|play|buy|site&seed=N`.

## License

MIT — see `LICENSE`.
