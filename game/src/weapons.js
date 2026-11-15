// The armoury: three guns and a grenade. Each gun is a definition (numbers) and a
// view model (boxes on the camera). main.js owns the ray and the damage; this
// module owns cadence, reload, spread, ammo and the grenade's flight.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  rifle: {
    id: 'rifle', name: 'VK-7', slot: 'primary', price: 2700, auto: true,
    mag: 30, reserve: 90, fireGap: 0.096, reloadTime: 1.9,
    bodyDmg: 34, headDmg: 100, spreadStill: 0.0022, spreadMove: 0.028,
    kick: 0.011, range: 80,
  },
  smg: {
    id: 'smg', name: 'Hornet-9', slot: 'primary', price: 1500, auto: true,
    mag: 32, reserve: 96, fireGap: 0.07, reloadTime: 1.6,
    bodyDmg: 26, headDmg: 78, spreadStill: 0.004, spreadMove: 0.034,
    kick: 0.008, range: 55,
  },
  pistol: {
    id: 'pistol', name: 'P-12', slot: 'sidearm', price: 0, auto: false,
    mag: 12, reserve: 36, fireGap: 0.16, reloadTime: 1.3,
    bodyDmg: 28, headDmg: 84, spreadStill: 0.003, spreadMove: 0.02,
    kick: 0.007, range: 45,
  },
};
export const GRENADE = { id: 'grenade', name: 'Frag', price: 300, maxCarry: 2, radius: 6, maxDmg: 95, fuse: 1.4 };
export const ARMOR = { id: 'armor', name: 'Kevlar', price: 650 };
export const AMMO_PACK = { id: 'ammo', name: 'Ammo refill', price: 200 };

const GRAVITY = 12;

export function createWeapons(camera, scene) {
  const gripMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a332a'), roughness: 0.55, metalness: 0.4 });
  const amberMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });

  function gunMesh(def) {
    const model = new THREE.Group();
    const len = def.id === 'pistol' ? 0.2 : def.id === 'smg' ? 0.3 : 0.38;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, len), bodyMat);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, len * 0.65), gripMat);
    barrel.position.set(0, 0.02, -len * 0.62);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.16), gripMat);
    stock.position.set(0, -0.015, len * 0.42);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.07), gripMat);
    mag.position.set(0, -0.09, 0.02);
    mag.rotation.x = 0.15;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.06), gripMat);
    grip.position.set(0, -0.08, len * 0.28);
    grip.rotation.x = 0.35;
    model.add(receiver, barrel, stock, mag, grip);
    if (def.id !== 'pistol') {
      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.045, 0.05), amberMat);
      sight.position.set(0, 0.06, -0.04);
      model.add(sight);
    }
    model.scale.setScalar(0.7);
    model.position.set(0.2, -0.24, -0.55);
    model.rotation.y = -0.06;
    model.visible = false;
    camera.add(model);
    return model;
  }

  const models = { rifle: gunMesh(WEAPONS.rifle), smg: gunMesh(WEAPONS.smg), pistol: gunMesh(WEAPONS.pistol) };
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const grenadeMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 12, 10),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.5, metalness: 0.4 }),
  );
  grenadeMesh.visible = false;
  scene.add(grenadeMesh);

  // One state object per owned gun; the pistol is always owned.
  const owned = {
    rifle: null,
    smg: null,
    pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve },
  };
  let current = 'pistol';
  let grenades = 0;
  const state = { cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, bobPhase: 0 };
  const projectiles = [];

  function def() {
    return WEAPONS[current];
  }
  function ammo() {
    return owned[current];
  }

  function showModel() {
    for (const id of Object.keys(models)) models[id].visible = id === current;
  }
  showModel();

  function step(dt, moving) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[current];
    state.bobPhase += dt * (moving ? 9 : 2);
    const bob = moving ? Math.sin(state.bobPhase) * 0.006 : 0;
    model.position.z = -0.55 + state.kick;
    model.position.y = -0.24 + bob;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      const d = def();
      model.rotation.x = -0.55 * Math.min(1, (d.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const a = ammo();
        const need = d.mag - a.mag;
        const take = Math.min(need, a.reserve);
        a.mag += take;
        a.reserve -= take;
      }
    }
    grenadeMesh.visible = false;
  }

  // Grenade flight: a ballistic arc with one soft bounce. Returns explosion events.
  function stepGrenades(dt, colliders) {
    const events = [];
    for (let i = projectiles.length - 1; i >= 0; i -= 1) {
      const g = projectiles[i];
      g.fuse -= dt;
      g.vel.y -= GRAVITY * dt;
      g.pos.addScaledVector(g.vel, dt);
      if (g.pos.y < 0.12) {
        g.pos.y = 0.12;
        g.vel.y = Math.abs(g.vel.y) * 0.35;
        g.vel.x *= 0.6;
        g.vel.z *= 0.6;
      }
      // A wall stops it cold: clamp inside the yard.
      g.pos.x = Math.max(-23.5, Math.min(23.5, g.pos.x));
      g.pos.z = Math.max(-17.5, Math.min(17.5, g.pos.z));
      if (g.fuse <= 0) {
        events.push({ pos: g.pos.clone() });
        projectiles.splice(i, 1);
      }
    }
    return events;
  }

  return {
    state,
    owned,
    get current() { return current; },
    get grenades() { return grenades; },
    def,
    ammo,
    step,
    stepGrenades,
    ready() {
      return ammo().mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    // Spend one round and start the cadence. Returns the def for the ray.
    pullTrigger() {
      const a = ammo();
      if (a.mag <= 0) return null;
      a.mag -= 1;
      const d = def();
      state.cooldown = d.fireGap;
      state.flash = 0.06;
      state.kick = 0.055;
      return d;
    },
    reload() {
      const d = def();
      const a = ammo();
      if (state.reloadLeft > 0 || a.mag === d.mag || a.reserve === 0) return false;
      state.reloadLeft = d.reloadTime;
      return true;
    },
    spread(speed) {
      const d = def();
      return d.spreadStill + Math.min(1, speed / 5.4) * d.spreadMove;
    },
    switchTo(id) {
      if (id === 'pistol' || owned[id]) {
        current = id;
        state.reloadLeft = 0;
        showModel();
        return true;
      }
      return false;
    },
    // Buy between rounds. Returns { ok, cost } or { ok: false, reason }.
    buy(id, money) {
      if (id === 'grenade') {
        if (grenades >= GRENADE.maxCarry) return { ok: false, reason: 'Carrying the max grenades' };
        if (money < GRENADE.price) return { ok: false, reason: 'Not enough money' };
        grenades += 1;
        return { ok: true, cost: GRENADE.price };
      }
      if (id === 'armor') {
        if (money < ARMOR.price) return { ok: false, reason: 'Not enough money' };
        return { ok: true, cost: ARMOR.price, armor: true };
      }
      if (id === 'ammo') {
        if (money < AMMO_PACK.price) return { ok: false, reason: 'Not enough money' };
        for (const key of Object.keys(owned)) {
          if (owned[key]) {
            owned[key].reserve = WEAPONS[key].reserve;
            owned[key].mag = WEAPONS[key].mag;
          }
        }
        return { ok: true, cost: AMMO_PACK.price };
      }
      const d = WEAPONS[id];
      if (!d || d.slot !== 'primary') return { ok: false, reason: 'Unknown item' };
      if (owned[id]) return { ok: false, reason: 'Already owned' };
      if (money < d.price) return { ok: false, reason: 'Not enough money' };
      owned[id] = { mag: d.mag, reserve: d.reserve };
      current = id;
      state.reloadLeft = 0;
      showModel();
      return { ok: true, cost: d.price };
    },
    throwGrenade(origin, direction) {
      if (grenades <= 0) return false;
      grenades -= 1;
      projectiles.push({
        pos: origin.clone(),
        vel: direction.clone().multiplyScalar(13).add(new THREE.Vector3(0, 4.5, 0)),
        fuse: GRENADE.fuse,
      });
      return true;
    },
    resetRound() {
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      projectiles.length = 0;
    },
    resetMatch() {
      owned.rifle = null;
      owned.smg = null;
      owned.pistol = { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve };
      current = 'pistol';
      grenades = 0;
      projectiles.length = 0;
      showModel();
    },
  };
}
