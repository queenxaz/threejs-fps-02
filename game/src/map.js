// Ember Yard: a 48 x 36 m dusk industrial yard. Three lanes (west, mid, east) run
// from the south spawn to two bomb sites in the north — A, the loading dock, and B,
// the fuel depot. All geometry is boxes and cylinders, every solid one a collider
// and a bullet stop. Procedural art only: no textures, no models, no network.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Waypoint graph the bots walk. Nodes are (x, z); edges join neighbours a bot can
// walk between without crossing a wall. BFS over it is the bots' pathfinding.
const WAYPOINTS = [
  [0, 15], [-8, 13], [8, 13], [-20, 12], [20, 12], [-20, 4], [20, 4], [0, 8],
  [-8, 6], [8, 6], [0, 0], [-8, -2], [8, -2], [-20, -4], [20, -4], [-20, -10],
  [20, -10], [-16, -12], [16, -12], [-12, -12], [12, -12], [-8, -14], [8, -14],
  [0, -15], [-16, -8], [16, -8], [-8, -8], [8, -8],
];
const EDGES = [
  [0, 1], [0, 2], [0, 7], [1, 3], [1, 8], [2, 4], [2, 9], [3, 5], [4, 6],
  [5, 13], [6, 14], [7, 8], [7, 9], [7, 10], [8, 10], [8, 11], [9, 10], [9, 12],
  [10, 11], [10, 12], [10, 26], [10, 27], [11, 13], [11, 26], [12, 14], [12, 27],
  [13, 15], [14, 16], [15, 17], [15, 24], [16, 18], [16, 25], [17, 19], [17, 24],
  [18, 20], [18, 25], [19, 21], [19, 26], [20, 22], [20, 27], [21, 23], [21, 26],
  [22, 23], [22, 27], [23, 26], [23, 27], [24, 26], [25, 27],
];

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const mats = {};
  function mat(name, rough = 0.9, metal = 0.05) {
    if (!mats[name]) {
      mats[name] = new THREE.MeshStandardMaterial({
        color: new THREE.Color(PALETTE[name]), roughness: rough, metalness: metal,
      });
    }
    return mats[name];
  }
  const glowA = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) });
  const glowB = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.teal) });

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, solid = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (solid) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  function cylinder(r, h, x, z, material, segments = 18) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segments), material);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    // A box collider approximates the tank; bots and bullets treat it as a square post.
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - r * 0.8, 0, z - r * 0.8),
      new THREE.Vector3(x + r * 0.8, h, z + r * 0.8),
    ));
    shootables.push(mesh);
    return mesh;
  }

  // Ground and the closed perimeter, 5 m walls open to the dusk sky.
  box(48.6, 0.4, 36.6, 0, -0.2, 0, mat('surface'));
  box(0.6, 5, 36.6, -24.3, 2.5, 0, mat('hairline'));
  box(0.6, 5, 36.6, 24.3, 2.5, 0, mat('hairline'));
  box(48.6, 5, 0.6, 0, 2.5, -18.3, mat('hairline'));
  box(48.6, 5, 0.6, 0, 2.5, 18.3, mat('hairline'));

  // Site A — the loading dock, north-west. A raised dock, a warehouse wall with a
  // doorway, and two stacked containers.
  box(9, 0.5, 6, -16, 0.25, -12, mat('surface'));
  box(9, 3.4, 0.5, -16, 1.7, -15.2, mat('hairline'));
  box(6, 2.6, 2.4, -19.5, 1.3, -12, mat('rust', 0.75, 0.15));
  box(6, 2.6, 2.4, -19.5, 3.9, -12, mat('teal', 0.75, 0.15));
  box(2.4, 1.1, 1.2, -11.5, 0.55, -9.5, mat('hairline'));
  box(1.2, 1.1, 1.2, -13.5, 0.55, -14.5, mat('hairline'));

  // Site B — the fuel depot, north-east. Three tanks, a pipe rack and a low wall.
  cylinder(1.7, 3.6, 18.5, -14.5, mat('rust', 0.6, 0.3));
  cylinder(1.7, 3.6, 14.5, -15.5, mat('teal', 0.6, 0.3));
  cylinder(1.4, 2.8, 18.5, -10.5, mat('hairline', 0.6, 0.3));
  box(7, 0.35, 0.35, 16.5, 3.2, -13.5, mat('hairline', 0.6, 0.4));
  box(0.35, 3.2, 0.35, 13.2, 1.6, -13.5, mat('hairline', 0.6, 0.4));
  box(0.35, 3.2, 0.35, 19.8, 1.6, -13.5, mat('hairline', 0.6, 0.4));
  box(4, 1.1, 0.6, 12.5, 0.55, -9.5, mat('hairline'));

  // Mid yard: a container stack that splits the lanes, and a gantry crane.
  box(10, 2.6, 2.4, 0, 1.3, -4, mat('accent', 0.7, 0.2));
  box(6, 2.6, 2.4, 0, 3.9, -4, mat('rust', 0.75, 0.15));
  box(0.8, 7, 0.8, -5, 3.5, -4, mat('hairline', 0.6, 0.5));
  box(0.8, 7, 0.8, 5, 3.5, -4, mat('hairline', 0.6, 0.5));
  box(11.5, 0.7, 0.9, 0, 6.8, -4, mat('hairline', 0.6, 0.5));
  box(1.6, 0.9, 1.6, -3.2, 0.45, -4, mat('danger', 0.7, 0.1));

  // Lane cover: crates and low walls to crouch behind, one per lane per half.
  box(1.2, 1.2, 1.2, -20, 0.6, 4, mat('rust', 0.8, 0.1));
  box(2.4, 1.1, 0.6, -21, 0.55, -6, mat('hairline'));
  box(1.2, 1.2, 1.2, 20, 0.6, 4, mat('teal', 0.8, 0.1));
  box(2.4, 1.1, 0.6, 21, 0.55, -6, mat('hairline'));
  box(2.4, 1.1, 1.2, -6, 0.55, 2, mat('hairline'));
  box(2.4, 1.1, 1.2, 6, 0.55, 2, mat('hairline'));
  box(1.2, 1.2, 1.2, -6, 0.6, 10, mat('accent', 0.8, 0.1));
  box(1.2, 1.2, 1.2, 6, 0.6, 10, mat('rust', 0.8, 0.1));
  box(1.2, 2.4, 1.2, -12, 1.2, -8, mat('hairline'));
  box(1.2, 2.4, 1.2, 12, 1.2, -8, mat('hairline'));

  // Barrels: small, round, and loud when shot — they are cover, not explosives.
  const barrelMat = mat('rust', 0.55, 0.35);
  for (const [x, z] of [[-2.5, -9], [-1.5, -9.2], [14, 8], [15, 8.4], [-22, -14], [22, 14]]) {
    cylinder(0.45, 1.1, x, z, barrelMat, 12);
  }

  // Site markers: a glowing ring on the ground and a letter drawn on a canvas.
  function siteMarker(x, z, letter, glow) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.1, 40), glow);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.02, z);
    group.add(ring);
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.clearRect(0, 0, 128, 128);
    ctx.font = 'bold 96px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = letter === 'A' ? PALETTE.accent : PALETTE.teal;
    ctx.fillText(letter, 64, 68);
    const tex = new THREE.CanvasTexture(canvas);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(x, 0.03, z);
    group.add(plane);
  }
  siteMarker(-16, -12, 'A', glowA);
  siteMarker(16, -12, 'B', glowB);

  // A yard sign on the north wall, drawn the same way.
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 512;
  signCanvas.height = 96;
  const sctx = signCanvas.getContext('2d');
  sctx.fillStyle = PALETTE.hairline;
  sctx.fillRect(0, 0, 512, 96);
  sctx.font = 'bold 56px system-ui, sans-serif';
  sctx.textAlign = 'center';
  sctx.textBaseline = 'middle';
  sctx.fillStyle = PALETTE.accent;
  sctx.fillText('EMBER YARD', 256, 52);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 1.3),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(signCanvas) }),
  );
  sign.position.set(0, 3.6, -17.9);
  group.add(sign);

  // Light: a low amber sun from the west, a cool teal fill from the east, and lamps.
  const sky = new THREE.HemisphereLight(new THREE.Color('#a08a64'), new THREE.Color(PALETTE.canvas), 1.5);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color(PALETTE.accent), 2.8);
  sun.position.set(-22, 11, 12);
  sun.target.position.set(4, 0, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.teal), 0.5);
  fill.position.set(20, 10, 8);
  scene.add(fill);
  const lampA = new THREE.PointLight(new THREE.Color(PALETTE.accent), 14, 16, 1.6);
  lampA.position.set(-16, 4.2, -12);
  scene.add(lampA);
  const lampB = new THREE.PointLight(new THREE.Color(PALETTE.teal), 14, 16, 1.6);
  lampB.position.set(16, 4.2, -12);
  scene.add(lampB);

  scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 68);

  // Waypoint graph: adjacency lists, built once.
  const adj = WAYPOINTS.map(() => []);
  for (const [a, b] of EDGES) {
    adj[a].push(b);
    adj[b].push(a);
  }

  function nearestNode(x, z) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < WAYPOINTS.length; i += 1) {
      const dx = WAYPOINTS[i][0] - x;
      const dz = WAYPOINTS[i][1] - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // Breadth-first path between two nodes; returns node ids, start included.
  function findPath(from, to) {
    if (from === to) return [from];
    const prev = new Int16Array(WAYPOINTS.length).fill(-1);
    const queue = [from];
    prev[from] = from;
    for (let head = 0; head < queue.length; head += 1) {
      const cur = queue[head];
      for (const next of adj[cur]) {
        if (prev[next] !== -1) continue;
        prev[next] = cur;
        if (next === to) {
          const path = [to];
          let node = to;
          while (node !== from) { node = prev[node]; path.push(node); }
          path.reverse();
          return path;
        }
        queue.push(next);
      }
    }
    return [from];
  }

  return {
    colliders,
    shootables,
    sites: {
      A: { center: new THREE.Vector3(-16, 0, -12), radius: 2.4, color: 'accent' },
      B: { center: new THREE.Vector3(16, 0, -12), radius: 2.4, color: 'teal' },
    },
    spawns: {
      player: { x: 0, z: 15, yaw: 0 },
      bots: [
        { x: 0, z: -15 }, { x: -8, z: -14 }, { x: 8, z: -14 },
        { x: -16, z: -12 }, { x: 16, z: -12 },
      ],
    },
    waypoints: { nodes: WAYPOINTS, adj, nearestNode, findPath },
    update() {},
  };
}
