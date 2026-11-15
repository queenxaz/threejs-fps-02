// The bomb: carried by the player, planted at a site, ticking on a fuse, and
// defusable by a bot that reaches it and holds still. One state machine, one
// mesh, one beep clock. main.js reads the state and ends rounds on it.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const PLANT_TIME = 3;
export const FUSE_TIME = 35;
export const DEFUSE_TIME = 5;

export function createBomb(scene) {
  const mesh = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.2, 0.24),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.danger), roughness: 0.5, metalness: 0.3 }),
  );
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.danger) }),
  );
  light.position.set(0.1, 0.13, 0);
  mesh.add(body, light);
  mesh.visible = false;
  scene.add(mesh);

  const bomb = {
    state: 'carried', // carried | planting | planted | detonated | defused
    site: null, // 'A' | 'B'
    pos: new THREE.Vector3(),
    plantProgress: 0,
    fuseLeft: FUSE_TIME,
    beepAt: 0,
    beepInterval: 1,
  };

  function startPlant(site) {
    if (bomb.state !== 'carried') return false;
    bomb.state = 'planting';
    bomb.site = site;
    bomb.plantProgress = 0;
    return true;
  }

  function cancelPlant() {
    if (bomb.state !== 'planting') return;
    bomb.state = 'carried';
    bomb.site = null;
    bomb.plantProgress = 0;
  }

  function step(dt, time, plantHeld) {
    if (bomb.state === 'planting') {
      if (!plantHeld) { cancelPlant(); return null; }
      bomb.plantProgress += dt / PLANT_TIME;
      if (bomb.plantProgress >= 1) {
        bomb.state = 'planted';
        bomb.fuseLeft = FUSE_TIME;
        bomb.beepInterval = 1;
        bomb.beepAt = time + 1;
        mesh.visible = true;
        return 'planted';
      }
      return null;
    }
    if (bomb.state === 'planted') {
      bomb.fuseLeft -= dt;
      const blink = Math.sin(time * 10) > 0;
      light.visible = blink;
      if (time >= bomb.beepAt) {
        bomb.beepInterval = Math.max(0.22, bomb.fuseLeft / FUSE_TIME);
        bomb.beepAt = time + bomb.beepInterval;
        return 'beep';
      }
      if (bomb.fuseLeft <= 0) {
        bomb.state = 'detonated';
        mesh.visible = false;
        return 'detonated';
      }
    }
    return null;
  }

  function placeAt(pos) {
    bomb.pos.copy(pos);
    mesh.position.set(pos.x, 0.12, pos.z);
  }

  function reset() {
    bomb.state = 'carried';
    bomb.site = null;
    bomb.plantProgress = 0;
    bomb.fuseLeft = FUSE_TIME;
    mesh.visible = false;
  }

  return {
    state: bomb,
    mesh,
    startPlant,
    cancelPlant,
    step,
    placeAt,
    reset,
  };
}
