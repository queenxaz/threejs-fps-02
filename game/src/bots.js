// The defenders: five bots that patrol the yard on the waypoint graph, hold the
// sites, react to sight and sound, shoot back in bursts, and defuse a planted
// bomb. One module owns their bodies, their movement and their decisions; main.js
// resolves their shots with the same raycast the player uses.
import * as THREE from 'three';

const NAMES = ['Ash', 'Brick', 'Dune', 'Fable', 'Grit'];
const HEALTH = 100;
const SPEED = 3.6;
const SIGHT_RANGE = 30;
const SIGHT_HALF_FOV = 0.96; // ~55 degrees each side
const HEAR_RANGE = 32;
const REACTION = 0.5;
const DEFUSE_TIME = 5;
const HOLD_NODES = [17, 18, 21, 22, 23]; // sites and the north line

export function createBots(scene, world) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 40;
  const toPlayer = new THREE.Vector3();
  const eyePos = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const probe = new THREE.Box3();
  const RADIUS = 0.34;

  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2e4a48'), roughness: 0.7, metalness: 0.1 });
  const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3fd8c8'), roughness: 0.4, metalness: 0.15 });
  const gunMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#0f0f0f'), roughness: 0.6, metalness: 0.3 });
  const torsoGeo = new THREE.BoxGeometry(0.52, 0.72, 0.3);
  const headGeo = new THREE.SphereGeometry(0.16, 14, 10);
  const legGeo = new THREE.BoxGeometry(0.2, 0.55, 0.22);
  const gunGeo = new THREE.BoxGeometry(0.07, 0.1, 0.55);

  const bots = [];
  const hitMeshes = [];
  const { nodes, nearestNode, findPath } = world.waypoints;

  function overlaps(x, z, height) {
    probe.min.set(x - RADIUS, 0.02, z - RADIUS);
    probe.max.set(x + RADIUS, height, z + RADIUS);
    for (const collider of world.colliders) if (probe.intersectsBox(collider)) return true;
    return false;
  }

  function makeBot(index, spawn) {
    const group = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 1.02;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.56;
    head.userData.part = 'head';
    const legL = new THREE.Mesh(legGeo, bodyMat);
    legL.position.set(-0.13, 0.28, 0);
    const legR = new THREE.Mesh(legGeo, bodyMat);
    legR.position.set(0.13, 0.28, 0);
    const gun = new THREE.Mesh(gunGeo, gunMat);
    gun.position.set(0.22, 1.15, -0.25);
    group.add(torso, head, legL, legR, gun);
    group.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
    group.position.set(spawn.x, 0, spawn.z);
    scene.add(group);
    const bot = {
      id: index, name: NAMES[index], group, torso, head, gun,
      position: group.position, yaw: Math.PI, health: HEALTH, alive: true,
      state: 'patrol', path: [], pathIndex: 0, holdNode: HOLD_NODES[index],
      lastSeen: new THREE.Vector3(), lastSeenAt: -100, spottedAt: -100,
      burstLeft: 0, nextShotAt: 0, pauseUntil: 0, defuseAt: 0, defuseProgress: 0,
      strafeDir: 1, strafeUntil: 0, walkPhase: index * 1.3, fall: 0, fadeAt: 0,
    };
    torso.userData.bot = bot;
    head.userData.bot = bot;
    hitMeshes.push(torso, head);
    bots.push(bot);
    return bot;
  }

  for (let i = 0; i < 5; i += 1) makeBot(i, world.spawns.bots[i]);

  function canSee(bot, playerPos, playerAlive) {
    if (!playerAlive) return false;
    toPlayer.copy(playerPos).sub(bot.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    if (dist > SIGHT_RANGE) return false;
    toPlayer.normalize();
    const facing = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    if (facing.dot(toPlayer) < Math.cos(SIGHT_HALF_FOV)) return false;
    eyePos.set(bot.position.x, 1.5, bot.position.z);
    dir.copy(playerPos).setY(1.2).sub(eyePos).normalize();
    raycaster.set(eyePos, dir);
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    if (hit && hit.distance < dist - 0.5) return false;
    return true;
  }

  function moveAlong(bot, tx, tz, dt, speed) {
    const dx = tx - bot.position.x;
    const dz = tz - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    const stepLen = Math.min(dist, speed * dt);
    const nx = bot.position.x + (dx / dist) * stepLen;
    const nz = bot.position.z + (dz / dist) * stepLen;
    if (!overlaps(nx, bot.position.z, 1.7)) bot.position.x = nx;
    if (!overlaps(bot.position.x, nz, 1.7)) bot.position.z = nz;
    bot.yaw = Math.atan2(-(dx / dist), -(dz / dist));
    bot.walkPhase += dt * 7;
    return dist - stepLen < 0.5;
  }

  function setPath(bot, targetNode) {
    const from = nearestNode(bot.position.x, bot.position.z);
    bot.path = findPath(from, targetNode);
    bot.pathIndex = 0;
  }

  function damage(bot, amount, part) {
    if (!bot.alive) return false;
    bot.health -= amount;
    bot.defuseProgress = 0;
    if (bot.health > 0) return false;
    bot.health = 0;
    bot.alive = false;
    bot.state = 'dead';
    bot.fall = 0;
    bot.fadeAt = 0;
    return true;
  }

  function step(dt, time, ctx) {
    const shots = [];
    const { playerPos, playerAlive, playerSpeed, bombPlanted, bombPos, noise } = ctx;
    for (const bot of bots) {
      if (!bot.alive) {
        if (bot.fall < 1) {
          bot.fall = Math.min(1, bot.fall + dt / 0.4);
          bot.group.rotation.x = -bot.fall * 1.45;
        } else if (bot.fadeAt === 0) {
          bot.fadeAt = time + 3;
        } else if (time > bot.fadeAt) {
          bot.group.visible = false;
        }
        continue;
      }

      const seen = canSee(bot, playerPos, playerAlive);
      if (seen) {
        bot.lastSeen.copy(playerPos);
        bot.lastSeenAt = time;
        if (bot.spottedAt < 0) bot.spottedAt = time;
        bot.state = 'engage';
      } else if (bot.state === 'engage' && time - bot.lastSeenAt > 2.5) {
        bot.state = 'investigate';
        bot.spottedAt = -100;
        setPath(bot, nearestNode(bot.lastSeen.x, bot.lastSeen.z));
      }

      // Hearing: a gunshot nearby pulls a patrolling bot toward the sound.
      if (noise && time - noise.time < 0.4 && bot.state !== 'engage') {
        const d = Math.hypot(noise.pos.x - bot.position.x, noise.pos.z - bot.position.z);
        if (d < HEAR_RANGE) {
          bot.state = 'investigate';
          setPath(bot, nearestNode(noise.pos.x, noise.pos.z));
        }
      }

      // The bomb rules the late round: the two nearest alive bots go defuse it.
      if (bombPlanted && bombPos) {
        const alive = bots.filter((b) => b.alive);
        const sorted = alive.slice().sort((a, b) =>
          (a.position.distanceTo(bombPos)) - (b.position.distanceTo(bombPos)));
        const defuser = sorted[0];
        if (bot === defuser) bot.state = 'defuse';
        else if (bot.state === 'defuse') bot.state = 'patrol';
      }

      if (bot.state === 'engage') {
        // Face the player, strafe, and fire in bursts after a reaction beat.
        toPlayer.copy(playerPos).sub(bot.position);
        toPlayer.y = 0;
        bot.yaw = Math.atan2(-toPlayer.x, -toPlayer.z);
        if (time > bot.strafeUntil) {
          bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
          bot.strafeUntil = time + 0.7 + Math.random() * 0.8;
        }
        const strafeX = Math.cos(bot.yaw) * bot.strafeDir;
        const strafeZ = -Math.sin(bot.yaw) * bot.strafeDir;
        const nx = bot.position.x + strafeX * SPEED * 0.55 * dt;
        const nz = bot.position.z + strafeZ * SPEED * 0.55 * dt;
        if (!overlaps(nx, bot.position.z, 1.7)) bot.position.x = nx;
        if (!overlaps(bot.position.x, nz, 1.7)) bot.position.z = nz;
        if (seen && time - bot.spottedAt > REACTION && time >= bot.pauseUntil) {
          if (bot.burstLeft <= 0) bot.burstLeft = 2 + Math.floor(Math.random() * 3);
          if (time >= bot.nextShotAt) {
            bot.burstLeft -= 1;
            bot.nextShotAt = time + 0.12;
            if (bot.burstLeft <= 0) bot.pauseUntil = time + 0.9 + Math.random() * 0.7;
            const dist = bot.position.distanceTo(playerPos);
            const err = 0.045 + dist * 0.0013 + playerSpeed * 0.004;
            shots.push({ bot, error: err });
          }
        }
      } else if (bot.state === 'defuse') {
        const d = Math.hypot(bombPos.x - bot.position.x, bombPos.z - bot.position.z);
        if (d > 1.6) {
          setPath(bot, nearestNode(bombPos.x, bombPos.z));
          bot.state = 'defuse-move';
        } else {
          bot.defuseProgress += dt / DEFUSE_TIME;
          bot.yaw = Math.atan2(-(bombPos.x - bot.position.x), -(bombPos.z - bot.position.z));
        }
      } else if (bot.state === 'defuse-move') {
        if (!bot.path.length || bot.pathIndex >= bot.path.length) {
          const d = Math.hypot(bombPos.x - bot.position.x, bombPos.z - bot.position.z);
          if (d <= 1.6) bot.state = 'defuse';
          else setPath(bot, nearestNode(bombPos.x, bombPos.z));
        } else {
          const node = nodes[bot.path[bot.pathIndex]];
          if (moveAlong(bot, node[0], node[1], dt, SPEED)) bot.pathIndex += 1;
        }
      } else if (bot.state === 'investigate') {
        if (!bot.path.length || bot.pathIndex >= bot.path.length) {
          bot.state = 'patrol';
          setPath(bot, bot.holdNode);
        } else {
          const node = nodes[bot.path[bot.pathIndex]];
          if (moveAlong(bot, node[0], node[1], dt, SPEED)) bot.pathIndex += 1;
        }
      } else {
        // Patrol: drift between the hold node and a neighbouring lane node.
        if (!bot.path.length || bot.pathIndex >= bot.path.length) {
          const neighbours = world.waypoints.adj[bot.holdNode];
          const next = neighbours[Math.floor(Math.random() * neighbours.length)];
          bot.path = [bot.holdNode, next, bot.holdNode];
          bot.pathIndex = 0;
        }
        const node = nodes[bot.path[bot.pathIndex]];
        if (moveAlong(bot, node[0], node[1], dt, SPEED * 0.6)) bot.pathIndex += 1;
      }
    }
    return shots;
  }

  function reset() {
    for (let i = 0; i < bots.length; i += 1) {
      const bot = bots[i];
      const spawn = world.spawns.bots[i];
      bot.group.position.set(spawn.x, 0, spawn.z);
      bot.group.rotation.set(0, 0, 0);
      bot.group.visible = true;
      bot.yaw = Math.PI;
      bot.health = HEALTH;
      bot.alive = true;
      bot.state = 'patrol';
      bot.path = [];
      bot.pathIndex = 0;
      bot.lastSeenAt = -100;
      bot.spottedAt = -100;
      bot.burstLeft = 0;
      bot.nextShotAt = 0;
      bot.pauseUntil = 0;
      bot.defuseProgress = 0;
      bot.fall = 0;
      bot.fadeAt = 0;
    }
  }

  return {
    bots,
    hitMeshes,
    step,
    damage,
    reset,
    aliveCount() {
      return bots.filter((b) => b.alive).length;
    },
    defuser() {
      return bots.find((b) => b.alive && b.state === 'defuse' && b.defuseProgress > 0) ?? null;
    },
  };
}
