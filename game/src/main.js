// Ember Yard: boot and the one loop. A fixed 60 Hz simulation feeds a render at
// the display's rate. Rounds, money, the bomb and the score live here, in one
// state object; the modules own their own pieces and main.js resolves combat.
// ?shot=start|play|buy|site with &seed=N stages a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createMap } from './map.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPONS, GRENADE, ARMOR, AMMO_PACK } from './weapons.js';
import { createBots } from './bots.js';
import { createBomb, PLANT_TIME } from './bomb.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const ROUND_TIME = 100;
const BUY_TIME = 15;
const WIN_ROUNDS = 5;
const MAX_ROUNDS = 9;
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
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createMap(scene);
const player = createPlayer(world.colliders, world.spawns.player);
const weapons = createWeapons(camera, scene);
const bots = createBots(scene, world);
const bomb = createBomb(scene);
const audio = createAudio();
const hud = createHud();
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const shootables = world.shootables.concat(bots.hitMeshes);
const playerBox = new THREE.Box3();
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const target = new THREE.Vector3();
const tmp = new THREE.Vector3();

// Tracers and impacts, pooled: nothing is allocated in the hot loop.
const tracers = [];
for (let i = 0; i < 10; i += 1) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xf5a623, transparent: true, opacity: 0 }));
  line.visible = false;
  line.frustumCulled = false;
  scene.add(line);
  tracers.push({ line, life: 0 });
}
const impacts = [];
for (let i = 0; i < 8; i += 1) {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(0.09, 10),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false }),
  );
  mesh.visible = false;
  scene.add(mesh);
  impacts.push({ mesh, life: 0 });
}
const blast = new THREE.Mesh(
  new THREE.SphereGeometry(1, 20, 14),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false }),
);
blast.visible = false;
scene.add(blast);
const blastLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 24);
scene.add(blastLight);
let blastLife = 0;
let blastMax = 1;

// The whole match, in one place.
const game = {
  phase: 'menu', // menu | buy | live | roundEnd | matchEnd
  round: 1,
  playerRounds: 0,
  botRounds: 0,
  money: 800,
  phaseTime: 0,
  roundTime: ROUND_TIME,
  kills: 0,
  started: false,
  frozen: false,
  noise: null,
  stepCount: 0,
};
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
let stepSoundAt = 0;

function syncCamera() {
  const body = player.state;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

// The camera's forward vector, computed straight from the player's yaw/pitch.
// camera.getWorldDirection reads the matrix, which is only refreshed when the
// scene renders — a shot staged synchronously (aim, then fire, no render in
// between) would use the pre-aim direction and miss. This is always current.
function aimDirection(out) {
  const { yaw, pitch } = player.state;
  return out.set(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch),
  );
}

function addTracer(from, to) {
  const t = tracers.find((x) => x.life <= 0) || tracers[0];
  const pos = t.line.geometry.attributes.position;
  pos.setXYZ(0, from.x, from.y, from.z);
  pos.setXYZ(1, to.x, to.y, to.z);
  pos.needsUpdate = true;
  t.line.visible = true;
  t.line.material.opacity = 0.85;
  t.life = 0.09;
}

function addImpact(point, normal) {
  const hit = impacts.find((x) => x.life <= 0) || impacts[0];
  hit.mesh.position.copy(point).addScaledVector(normal, 0.02);
  hit.mesh.lookAt(point.clone().add(normal));
  hit.mesh.visible = true;
  hit.mesh.material.opacity = 0.9;
  hit.life = 0.25;
}

function explode(pos, radius, maxDmg, source) {
  blast.position.copy(pos);
  blast.visible = true;
  blastLife = 0.5;
  blastMax = radius;
  blastLight.position.copy(pos);
  blastLight.intensity = 60;
  audio.explosion(player.state.position.distanceTo(pos));
  game.noise = { pos: pos.clone(), time: elapsed };
  const dmgAt = (p, hp) => {
    const d = p.distanceTo(pos);
    if (d > radius) return 0;
    return Math.round(maxDmg * (1 - (d / radius) * 0.8));
  };
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const amount = dmgAt(bot.position, bot.health);
    if (amount > 0 && bots.damage(bot, amount, 'torso')) {
      onBotKilled(bot, source);
    }
  }
  const pAmount = dmgAt(player.state.position, player.state.health);
  if (pAmount > 0 && player.state.alive) {
    player.damage(pAmount, pos, elapsed);
    hud.damageFlash();
    audio.hurt();
    if (!player.state.alive) endRound(false, 'You were caught in the blast.');
  }
}

function onBotKilled(bot, source) {
  game.kills += 1;
  game.money += 300;
  hud.setMoney(game.money);
  hud.killFeed(`${source === 'you' ? 'YOU' : 'BLAST'} ▸ ${bot.name}`);
  hud.setAlive(player.state.alive, bots.aliveCount());
}

function shootPlayer(spread) {
  const def = weapons.pullTrigger();
  if (!def) {
    audio.dryFire();
    return;
  }
  aimDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(shootables, false)[0];
  audio.shoot(def.id, 0);
  game.noise = { pos: player.state.position.clone(), time: elapsed };
  player.recoil(def.kick * (0.8 + random() * 0.4), (random() * 2 - 1) * def.kick * 0.35);
  if (!hit) return;
  if (hit.object.userData.bot) {
    const bot = hit.object.userData.bot;
    const part = hit.object.userData.part;
    const amount = part === 'head' ? def.headDmg : def.bodyDmg;
    const killed = bots.damage(bot, amount, part);
    hud.hitMarker(killed, killed ? 160 : 90);
    audio.hitmarker(killed);
    if (killed) onBotKilled(bot, 'you');
  } else {
    addImpact(hit.point, hit.face.normal);
  }
  hud.setAmmo(weapons.ammo().mag, weapons.ammo().reserve, def.name, weapons.grenades);
}

function shootBot(shotEvent) {
  const bot = shotEvent.bot;
  muzzle.set(bot.position.x, 1.35, bot.position.z);
  target.copy(player.state.position);
  target.y = player.state.position.y + 1.1;
  direction.copy(target).sub(muzzle).normalize();
  // Angular error: the bot's inaccuracy, worse at range and on a moving target.
  const err = shotEvent.error;
  direction.x += (random() * 2 - 1) * err;
  direction.y += (random() * 2 - 1) * err;
  direction.z += (random() * 2 - 1) * err;
  direction.normalize();
  raycaster.set(muzzle, direction);
  const dist = muzzle.distanceTo(target);
  const wall = raycaster.intersectObjects(world.shootables, false)[0];
  player.hitBox(playerBox);
  const end = tmp.copy(muzzle).addScaledVector(direction, Math.min(dist, 60));
  if (wall && wall.distance < dist) {
    addTracer(muzzle, wall.point);
    addImpact(wall.point, wall.face.normal);
    audio.shoot('rifle', dist);
    return;
  }
  const hitPoint = raycaster.ray.intersectBox(playerBox, new THREE.Vector3());
  if (hitPoint) {
    addTracer(muzzle, hitPoint);
    const dmg = 8 + Math.floor(random() * 5);
    player.damage(dmg, bot.position, elapsed);
    hud.damageFlash();
    audio.hurt();
    hud.setHealth(player.state.health, player.state.armor);
    if (!player.state.alive) endRound(false, `${bot.name} dropped you.`);
  } else {
    addTracer(muzzle, end);
  }
  audio.shoot('rifle', dist);
}

function nearSite() {
  const p = player.state.position;
  for (const key of ['A', 'B']) {
    const site = world.sites[key];
    const d = Math.hypot(p.x - site.center.x, p.z - site.center.z);
    if (d < site.radius) return key;
  }
  return null;
}

function startMatch() {
  game.playerRounds = 0;
  game.botRounds = 0;
  game.round = 1;
  game.money = 800;
  game.kills = 0;
  weapons.resetMatch();
  startRound();
}

function startRound() {
  game.phase = 'buy';
  game.phaseTime = BUY_TIME;
  game.roundTime = ROUND_TIME;
  player.reset(world.spawns.player);
  bots.reset();
  bomb.reset();
  weapons.resetRound();
  hud.setHealth(100, player.state.armor);
  hud.setAmmo(weapons.ammo().mag, weapons.ammo().reserve, weapons.def().name, weapons.grenades);
  hud.setMoney(game.money);
  hud.setScore(game.playerRounds, game.botRounds, game.round);
  hud.setAlive(true, 5);
  hud.setBomb('carried');
  hud.hidePlant();
  syncCamera();
  openBuy();
}

function openBuy() {
  const items = [
    { id: 'rifle', name: 'VK-7 Rifle', price: WEAPONS.rifle.price, note: '30 rd · auto · 34 dmg', disabled: !!weapons.owned.rifle || game.money < WEAPONS.rifle.price },
    { id: 'smg', name: 'Hornet-9 SMG', price: WEAPONS.smg.price, note: '32 rd · fast · 26 dmg', disabled: !!weapons.owned.smg || game.money < WEAPONS.smg.price },
    { id: 'grenade', name: 'Frag Grenade', price: GRENADE.price, note: `AoE 6 m · carry ${weapons.grenades}/${GRENADE.maxCarry}`, disabled: weapons.grenades >= GRENADE.maxCarry || game.money < GRENADE.price },
    { id: 'armor', name: 'Kevlar Vest', price: ARMOR.price, note: '100 armour, halves damage', disabled: player.state.armor >= 100 || game.money < ARMOR.price },
    { id: 'ammo', name: 'Ammo Refill', price: AMMO_PACK.price, note: 'Full mags + reserve', disabled: game.money < AMMO_PACK.price },
  ];
  hud.showBuy(items, game.money);
}

function buyItem(id) {
  const result = weapons.buy(id, game.money);
  if (!result.ok) {
    audio.denied();
    hud.killFeed(result.reason);
    return;
  }
  if (result.armor) player.state.armor = 100;
  game.money -= result.cost;
  hud.setMoney(game.money);
  hud.setAmmo(weapons.ammo().mag, weapons.ammo().reserve, weapons.def().name, weapons.grenades);
  hud.setHealth(player.state.health, player.state.armor);
  audio.buy();
  openBuy();
}

function startLive() {
  game.phase = 'live';
  game.phaseTime = 0;
  hud.hideBuy();
  hud.banner(`ROUND ${game.round}`, game.round === 1 ? 'Plant the charge at A or B — or clear the yard.' : '');
  input.requestLock();
}

function endRound(playerWon, reason) {
  if (game.phase !== 'live') return;
  game.phase = 'roundEnd';
  game.phaseTime = 3;
  if (playerWon) {
    game.playerRounds += 1;
    game.money += 325;
  } else {
    game.botRounds += 1;
    game.money += 150;
  }
  hud.setMoney(game.money);
  hud.setScore(game.playerRounds, game.botRounds, game.round);
  hud.hidePlant();
  hud.banner(playerWon ? 'ROUND WON' : 'ROUND LOST', reason);
  if (playerWon) audio.roundWin(); else audio.roundLose();
  if (document.pointerLockElement) document.exitPointerLock();
}

function endMatch() {
  game.phase = 'matchEnd';
  const won = game.playerRounds > game.botRounds;
  hud.showOverlay('matchEnd', won
    ? `You took Ember Yard ${game.playerRounds}–${game.botRounds}. ${game.kills} eliminations.`
    : `The defenders held Ember Yard ${game.botRounds}–${game.playerRounds}. ${game.kills} eliminations.`);
  if (document.pointerLockElement) document.exitPointerLock();
}

function step(dt) {
  elapsed += dt;
  game.stepCount += 1;
  const keys = input.state.keys;

  if (game.phase === 'buy') {
    game.phaseTime -= dt;
    player.step(dt, keys);
    if (input.consume('KeyB')) { hud.hideBuy(); startLive(); return; }
    if (input.consume('Digit1')) buyItem('rifle');
    if (input.consume('Digit2')) buyItem('smg');
    if (input.consume('Digit3')) buyItem('grenade');
    if (input.consume('Digit4')) buyItem('armor');
    if (input.consume('Digit5')) buyItem('ammo');
    if (game.phaseTime <= 0) startLive();
    return;
  }

  if (game.phase === 'roundEnd') {
    game.phaseTime -= dt;
    if (game.phaseTime <= 0) {
      if (game.playerRounds >= WIN_ROUNDS || game.botRounds >= WIN_ROUNDS || game.round >= MAX_ROUNDS) endMatch();
      else { game.round += 1; startRound(); }
    }
    return;
  }

  if (game.phase !== 'live') return;

  // Round timer: the bomb's fuse replaces it once planted.
  if (bomb.state.state === 'planted') {
    game.roundTime = bomb.state.fuseLeft;
  } else {
    game.roundTime -= dt;
    if (game.roundTime <= 0) {
      endRound(false, 'Time expired — the charge was never planted.');
      return;
    }
  }

  player.step(dt, keys);
  weapons.step(dt, player.groundSpeed() > 0.5);
  if (player.state.alive && player.onGround && player.groundSpeed() > 1 && elapsed - stepSoundAt > 0.38) {
    stepSoundAt = elapsed;
    audio.step();
  }

  // Player fire, reload, weapon switch, grenade, plant.
  const look = input.takeLook();
  player.look(look.x, look.y);
  if (input.state.firing && weapons.ready()) shootPlayer(weapons.spread(player.groundSpeed()));
  if (input.consume('KeyR')) { if (weapons.reload()) audio.reload(); }
  if (input.consume('Digit1')) weapons.switchTo(weapons.owned.rifle ? 'rifle' : 'pistol');
  if (input.consume('Digit2')) weapons.switchTo(weapons.owned.smg ? 'smg' : 'pistol');
  if (input.consume('Digit3')) weapons.switchTo('pistol');
  if (input.consume('KeyQ')) {
    aimDirection(direction);
    if (weapons.throwGrenade(camera.position, direction)) audio.shoot('pistol', 0);
  }
  if (input.consume('KeyM')) audio.toggleMute();

  // Grenades in flight.
  const booms = weapons.stepGrenades(dt, world.colliders);
  for (const boom of booms) explode(boom.pos, GRENADE.radius, GRENADE.maxDmg, 'you');

  // The bomb: hold E near a site to plant.
  const site = nearSite();
  const planting = keys.has('KeyE') && site && bomb.state.state === 'carried';
  if (planting && bomb.state.state === 'carried') bomb.startPlant(site);
  const bombEvent = bomb.step(dt, elapsed, planting && bomb.state.state === 'planting');
  if (bombEvent === 'planted') {
    const s = world.sites[bomb.state.site];
    bomb.placeAt(s.center);
    hud.setBomb('planted');
    hud.killFeed('Charge planted — hold the site.');
    audio.plant();
  } else if (bombEvent === 'beep') {
    audio.beep();
  } else if (bombEvent === 'detonated') {
    // The detonation is a win even if the blast catches the planter: end the
    // round first, then play the explosion for the visuals.
    hud.setBomb('detonated');
    endRound(true, 'The charge detonated.');
    explode(bomb.state.pos, 12, 200, 'you');
    return;
  }
  if (bomb.state.state === 'planting') hud.setPlant(bomb.state.plantProgress);
  else hud.hidePlant();

  // Bots: move, see, hear, shoot, defuse.
  const botShots = bots.step(dt, elapsed, {
    playerPos: player.state.position,
    playerAlive: player.state.alive,
    playerSpeed: player.groundSpeed(),
    bombPlanted: bomb.state.state === 'planted',
    bombPos: bomb.state.state === 'planted' ? bomb.state.pos : null,
    noise: game.noise,
  });
  for (const s of botShots) shootBot(s);

  // A bot that finished the defuse wins the round for the defenders.
  const defuser = bots.defuser();
  if (defuser && defuser.defuseProgress >= 1) {
    hud.setBomb('defused');
    endRound(false, `${defuser.name} defused the charge.`);
    return;
  }
  if (defuser && Math.random() < dt * 2) audio.defuseTick();

  // Round end by elimination.
  if (bots.aliveCount() === 0) {
    endRound(true, 'Yard cleared — every defender is down.');
    return;
  }
  if (!player.state.alive) {
    endRound(false, 'You were eliminated.');
    return;
  }

  // HUD: timer, health, crosshair spread.
  hud.setTimer(game.roundTime, bomb.state.state === 'planted');
  hud.setHealth(player.state.health, player.state.armor);
  hud.setAlive(player.state.alive, bots.aliveCount());
  const spreadPx = 6 + weapons.spread(player.groundSpeed()) * 900;
  hud.setCrosshairSpread(Math.min(34, spreadPx));
  if (game.noise && elapsed - game.noise.time > 1) game.noise = null;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!game.frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    // Fade the pooled effects.
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.85;
        if (t.life <= 0) t.line.visible = false;
      }
    }
    for (const hit of impacts) {
      if (hit.life > 0) {
        hit.life -= dt;
        hit.mesh.material.opacity = Math.max(0, hit.life / 0.25) * 0.9;
        if (hit.life <= 0) hit.mesh.visible = false;
      }
    }
    if (blastLife > 0) {
      blastLife -= dt;
      const k = 1 - Math.max(0, blastLife) / 0.5;
      blast.scale.setScalar(1 + k * blastMax);
      blast.material.opacity = 0.55 * (1 - k);
      blastLight.intensity = 60 * (1 - k);
      if (blastLife <= 0) { blast.visible = false; blastLight.intensity = 0; }
    }
  }
  renderer.render(scene, camera);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    game.started = true;
    hud.hideOverlay();
    audio.unlock();
  } else if (game.phase === 'live' && player.state.alive) {
    hud.showOverlay('paused');
  } else if (game.phase === 'menu') {
    hud.showOverlay('start');
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (game.phase === 'menu') { startMatch(); hud.hideOverlay(); }
  else if (game.phase === 'matchEnd') { startMatch(); hud.hideOverlay(); }
  else if (game.phase === 'roundEnd') { /* wait for the timer */ }
  else input.requestLock();
});
hud.onBuy((id) => buyItem(id));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Deterministic staged shots for captures: no pointer lock, no input.
function aimAt(point) {
  const body = player.state;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  if (name === 'start') {
    player.state.position.set(0, 0, 15);
    player.state.yaw = 0;
    syncCamera();
    hud.showOverlay('start');
  } else if (name === 'play') {
    startMatch();
    game.phase = 'live';
    hud.hideBuy();
    player.state.position.set(-2, 0, 8);
    player.state.yaw = 0.12;
    player.state.health = 82;
    player.state.armor = 50;
    game.money = 1450;
    game.round = 2;
    game.playerRounds = 1;
    game.botRounds = 0;
    game.roundTime = 74;
    weapons.buy('rifle', 10000);
    game.money = 1450;
    bots.bots[0].position.set(-4, 0, 2);
    bots.bots[0].yaw = Math.PI;
    bots.bots[1].position.set(4, 0, 0);
    bots.bots[1].yaw = Math.PI * 0.8;
    settle(30);
    // Aim at the bot's live position, not its staged one: it strafes while
    // engaging, so a fixed point is already stale after the settle.
    aimAt(new THREE.Vector3(bots.bots[0].position.x, 1.2, bots.bots[0].position.z));
    shootPlayer(0);
    settle(6);
    hud.setHealth(player.state.health, player.state.armor);
    hud.setAmmo(weapons.ammo().mag, weapons.ammo().reserve, weapons.def().name, weapons.grenades);
    hud.setMoney(game.money);
    hud.setScore(game.playerRounds, game.botRounds, game.round);
    hud.setTimer(game.roundTime, false);
    hud.setAlive(true, 5);
    hud.setBomb('carried');
  } else if (name === 'buy') {
    startMatch();
    game.money = 3200;
    openBuy();
    hud.setMoney(game.money);
    player.state.position.set(0, 0, 15);
    syncCamera();
  } else if (name === 'site') {
    startMatch();
    game.phase = 'live';
    hud.hideBuy();
    player.state.position.set(-4, 0, -9);
    player.state.yaw = -0.5;
    game.round = 3;
    game.playerRounds = 1;
    game.botRounds = 1;
    game.roundTime = 22;
    bomb.state.state = 'planted';
    bomb.state.site = 'A';
    bomb.state.fuseLeft = 22;
    bomb.placeAt(world.sites.A.center);
    bomb.mesh.visible = true;
    bots.bots[0].position.set(-15, 0, -11);
    bots.bots[0].yaw = Math.PI;
    bots.bots[0].state = 'defuse';
    bots.bots[0].defuseProgress = 0.4;
    bots.bots[1].position.set(8, 0, -8);
    bots.bots[1].yaw = Math.PI * 0.9;
    settle(20);
    aimAt(new THREE.Vector3(-16, 0.6, -12));
    hud.setHealth(player.state.health, player.state.armor);
    hud.setAmmo(weapons.ammo().mag, weapons.ammo().reserve, weapons.def().name, weapons.grenades);
    hud.setMoney(game.money);
    hud.setScore(game.playerRounds, game.botRounds, game.round);
    hud.setTimer(game.roundTime, true);
    hud.setAlive(true, 4);
    hud.setBomb('planted');
  }
  syncCamera();
  paintTwiceThenReady();
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
      game.frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

syncCamera();
hud.setHealth(100, 0);
hud.setAmmo(weapons.ammo().mag, weapons.ammo().reserve, weapons.def().name, 0);
hud.setMoney(game.money);
hud.setScore(0, 0, 1);
hud.setTimer(ROUND_TIME, false);
hud.setAlive(true, 5);
hud.setBomb('carried');
// A debug handle for testing and review: the live game state, read-only use.
window.__ember = { game, player, weapons, bots, bomb, input };
if (shot) runShot(shot);
else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
