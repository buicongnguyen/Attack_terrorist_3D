import * as THREE from "three";
import { rescueLayout, riverAt, riverEdge, nearestOnRoad } from "./rescue-data.js";
import { seeded } from "./city.js";
import { chapterStart } from "./data.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// The playable ground (people and vehicles stand at 1.15) and the river bed under the water.
export const LAND = 1.2;
const BED = -0.9;
// Scenery rows, for culling what is far from Lantern.
const ROW = 20;

// Each map's country (2.7): colours, how high the valley sides climb, and what grows there.
const BIOMES = {
  // Jungle lowlands: green fields, sandy banks, stilt villages by the water.
  jungle: {
    ground: [0x4cc766, 0x5fd06f, 0x46b85c],
    sand: 0xf2d19a,
    bed: 0x5d6a4a,
    rock: [0x6fae4c, 0x5a9a44, 0x9c7552],
    top: 0x3f9e4a,
    road: 0xe9c98c,
    verge: 0xb9d86a,
    wall: 4,
    dress: { "jungle-tree": 9, palm: 5, rock: 1, reeds: 2 },
    houses: true,
  },
  // A canyon of red rock: ochre floor, a braided river with sandbars, terraced mesas.
  canyon: {
    ground: [0xe4a868, 0xdc9a5a, 0xeab478],
    sand: 0xf6dcae,
    bed: 0x8a6a45,
    rock: [0xc2553a, 0xe07a4a, 0xa8432f, 0xf0a56a],
    top: 0xf2b27a,
    road: 0xf3dcb0,
    verge: 0xc9956a,
    wall: 12,
    terraces: 2.2,
    sandbars: true,
    dress: { shrub: 6, rock: 3, butte: 1.2, reeds: 1.5, palm: 0.5 },
    // Rocks take the canyon's red (multipliers on their own colours).
    rockTint: [0xffa27a, 0xff8c6a, 0xffb48a],
  },
  // A pine ridge: dark grass, grey scree, a narrow stream.
  ridge: {
    ground: [0x5a9a4a, 0x4e8c44, 0x69a852],
    sand: 0xb9ad8f,
    bed: 0x4d4a48,
    rock: [0x8d8791, 0xa39ba5, 0x716c78],
    top: 0xdad4d8,
    road: 0xcbb38c,
    verge: 0x7a9a5a,
    wall: 9,
    dress: { pine: 12, rock: 3, shrub: 1.5 },
  },
};

// Value noise in [0, 1], smooth and repeatable.
function noise2(seed) {
  const hash = (i, j) => {
    const s = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  return (x, z) => {
    const i = Math.floor(x),
      j = Math.floor(z),
      fx = x - i,
      fz = z - j;
    const u = fx * fx * (3 - 2 * fx),
      v = fz * fz * (3 - 2 * fz);
    const a = hash(i, j),
      b = hash(i + 1, j),
      c = hash(i, j + 1),
      d = hash(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

const smooth = (t) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

// The ground height of a map at (x, z): flat where people fight, a river cut through it, and
// the valley sides climbing beyond the playable edge.
export function terrainHeight(map, x, z, noise = noise2(7)) {
  const biome = BIOMES[map.biome] || BIOMES.jungle;
  const e = riverEdge(map, x, z);
  let h = LAND;
  if (e < 2.5) h = BED + (LAND - BED) * smooth((e + 1.5) / 4);
  if (biome.sandbars && e < -2 && noise(x * 0.11, z * 0.07) > 0.64) h = 0.3;
  const a = Math.abs(x) - 43;
  if (a > 0) {
    let wall = biome.wall * smooth(a / 9) * (0.7 + 0.6 * noise(x * 0.07 + 11, z * 0.05));
    if (biome.terraces) wall = Math.round(wall / biome.terraces) * biome.terraces;
    h = Math.max(h, LAND + wall);
  }
  return h;
}

export function createRescueScenery(view, mission, index = chapterStart(2)) {
  const layout = rescueLayout(index - chapterStart(2), mission.crew);
  const map = layout.map;
  const biome = BIOMES[map.biome] || BIOMES.jungle;
  const random = seeded(4242 + (index - chapterStart(2)) * 97);
  const noise = noise2(3 + index);
  view.sceneryChunks = [];
  buildTerrain(view, map, biome, noise);
  buildRoad(view, map, biome);
  for (const bridge of map.bridges) buildBridge(view, map, bridge);

  // Dressing keeps clear of every signal, base, threat, supply and the road, so scenery never
  // hides the game.
  const keepOut = [
    { x: layout.start.x, z: layout.start.z, r: 12 },
    { x: layout.landing.x, z: layout.landing.z, r: 12 },
    ...layout.survivors.map((s) => ({ x: s.x, z: s.z, r: 8 })),
    ...layout.supplies.map((s) => ({ x: s.x, z: s.z, r: 3 })),
    ...layout.threats.flatMap((t) =>
      t.route
        ? route(t.route).map(([x, z]) => ({ x, z, r: 4.5 }))
        : [{ x: t.x, z: t.z, r: t.type === "soldiers" ? 6 : 6.5 }],
    ),
  ];
  const clear = (x, z, pad = 0) => keepOut.every((k) => Math.hypot(x - k.x, z - k.z) > k.r + pad) && nearestOnRoad(map, x, z).d > 3.4 + pad;
  for (let z0 = 30; z0 > -250; z0 -= ROW) {
    const chunk = new THREE.Group();
    chunk.userData.centerZ = z0 - ROW / 2;
    view.level.add(chunk);
    view.sceneryChunks.push(chunk);
    const placed = {};
    const put = (kind, x, z, scale) => {
      const color = kind === "rock" && biome.rockTint ? biome.rockTint[Math.floor(random() * biome.rockTint.length)] : undefined;
      (placed[kind] ||= []).push({ position: V(x, terrainHeight(map, x, z, noise), z), rotation: random() * 6, scale, color });
    };
    for (const [kind, perSide] of Object.entries(biome.dress)) {
      const count = Math.round(perSide * 2 * (0.7 + random() * 0.6));
      for (let i = 0; i < count; i++) {
        const x = -50 + random() * 100,
          z = z0 - random() * ROW;
        const edge = riverEdge(map, x, z);
        if (kind === "reeds") {
          // Reeds grow at the water's edge.
          if (edge < -1.2 || edge > 1.6 || !clear(x, z)) continue;
          put(kind, x, z, 0.9 + random() * 0.4);
          continue;
        }
        if (edge < 1.8 || !clear(x, z, 1)) continue;
        // Buttes: great red rocks along the canyon sides, clear of the fighting.
        if (kind === "butte") {
          if (Math.abs(x) < 30 || !clear(x, z, 4)) continue;
          put("rock", x, z, 3.2 + random() * 2.2);
          continue;
        }
        const scale = kind === "rock" ? 0.8 + random() * (Math.abs(x) > 40 ? 2.4 : 0.7) : 0.8 + random() * 0.45;
        put(kind, x, z, scale);
      }
    }
    // Stilt villages by the water in the jungle.
    if (biome.houses)
      for (const side of [-1, 1]) {
        if (random() > 0.45) continue;
        const z = z0 - ROW / 2 + (random() - 0.5) * 8;
        const r = riverAt(map, z);
        const x = r.x + side * (r.width / 2 + 3.5);
        if (Math.abs(x) < 40 && clear(x, z, 2))
          (placed["stilt-house"] ||= []).push({ position: V(x, LAND - 0.1, z), rotation: side > 0 ? -Math.PI / 2 : Math.PI / 2, scale: 1 });
      }
    for (const [kind, placements] of Object.entries(placed))
      if (view.assets.has(kind)) view.instances(kind, placements, chunk, kind === "rock" && biome.rockTint ? { tint: true } : {});
  }

  createBase(view, layout.start, false);
  createBase(view, layout.landing, true);
  for (const s of layout.survivors) {
    view.ring(V(s.x, LAND + 0.04, s.z), 4.2, 0x33d69f, 0.12);
    view.model("supply", V(s.x + 3, LAND, s.z + 2), 0.75);
    view.box(V(s.x, LAND + 0.06, s.z), V(0.35, 0.04, 2.4), 0x33d69f);
    view.box(V(s.x, LAND + 0.06, s.z), V(2.4, 0.04, 0.35), 0x33d69f);
  }
}

// Points along a patrol route, a couple of metres apart, for keep-out tests.
function route(points) {
  const out = [];
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1],
      [bx, bz] = points[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 3));
    for (let k = 0; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  return out;
}

function buildTerrain(view, map, biome, noise) {
  // Beyond the flight's bounds on every side, so the camera never sees past the land.
  const width = 112,
    depth = 330,
    centerZ = -110;
  const geometry = new THREE.PlaneGeometry(width, depth, 56, 165);
  geometry.rotateX(-Math.PI / 2);
  const p = geometry.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      z = p.getZ(i) + centerZ;
    const h = terrainHeight(map, x, z, noise);
    p.setY(i, h);
    p.setZ(i, z);
    const n = noise(x * 0.18, z * 0.18);
    const edge = riverEdge(map, x, z);
    if (h < 0.1) color.set(biome.bed);
    else if (h < 0.6 || edge < 2.2) color.set(biome.sand);
    else if (h > LAND + 0.4) {
      // Valley sides: rock in bands (strata in the canyon), a lighter top on the ridge.
      const band = Math.floor((h + n * 0.8) / 1.5) % biome.rock.length;
      color.set(h > LAND + biome.wall * 0.75 && biome.top ? biome.top : biome.rock[band]);
    } else color.set(biome.ground[Math.floor(n * biome.ground.length) % biome.ground.length]);
    // A little variation so flat ground doesn't read as one colour.
    color.offsetHSL(0, 0, (noise(x * 0.9, z * 0.9) - 0.5) * 0.05);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  mesh.receiveShadow = true;
  mesh.userData.disposable = true;
  view.level.add(mesh);
}

// The dirt road, with its verges; dry wherever it isn't crossing the water.
function buildRoad(view, map, biome) {
  for (let i = 1; i < map.road.length; i++) {
    const [ax, az] = map.road[i - 1],
      [bx, bz] = map.road[i];
    const length = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(length / 2);
    const yaw = Math.atan2(bx - ax, bz - az);
    for (let k = 0; k < steps; k++) {
      const t = (k + 0.5) / steps,
        x = ax + (bx - ax) * t,
        z = az + (bz - az) * t;
      if (riverEdge(map, x, z) < 0.6) continue;
      const piece = length / steps + 0.1;
      view.box(V(x, LAND + 0.02, z), V(4.2, 0.04, piece), biome.verge).rotation.y = yaw;
      view.box(V(x, LAND + 0.04, z), V(3.2, 0.04, piece), biome.road).rotation.y = yaw;
    }
  }
}

// A bridge across the river at `z`; a broken one has a gap in the middle and sagging ends.
function buildBridge(view, map, bridge) {
  const r = riverAt(map, bridge.z);
  const span = r.width + 5;
  const deck = new THREE.Group();
  deck.position.set(r.x, 0, bridge.z);
  view.level.add(deck);
  const gap = bridge.broken ? 5 : 0;
  const half = (span - gap) / 2;
  for (const side of [-1, 1]) {
    const cx = side * (gap / 2 + half / 2);
    const part = view.box(V(cx, 1.55, 0), V(half, 0.45, 4), 0x9a8f86, deck);
    for (const offset of [-1.8, 1.8]) view.box(V(cx, 2.0, offset), V(half, 0.45, 0.25), 0xe2704f, deck);
    if (bridge.broken) part.rotation.z = side * 0.06;
  }
  for (const x of [-span / 3, 0, span / 3]) if (!bridge.broken || Math.abs(x) > gap) view.box(V(x, 0.2, 0), V(1.2, 2.6, 3.4), 0x6d6a72, deck);
  if (bridge.broken)
    for (let i = 0; i < 4; i++) view.box(V((i - 1.5) * 1.2, 0.05, (i % 2 ? 1 : -1) * 1.2), V(1, 0.5, 1.4), 0x7c716a, deck).rotation.y = i;
}

// A friendly base: Highwater's pad, an aid station, a crossing camp or Highwater Station. The
// landing base wears a gold ring and a beacon so it reads as the way home.
function createBase(view, base, landing) {
  const x = base.x,
    z = base.z;
  view.box(V(x, 0.7, z), V(15, 1.1, 13), 0xd9cdb8);
  view.box(V(x, 1.28, z), V(15.4, 0.1, 13.4), landing ? 0xffc62b : 0x33d69f);
  view.box(V(x, 1.31, z), V(14.2, 0.08, 12.2), 0xc9bfa8);
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(4.6, 4.6, 0.08, 40),
    new THREE.MeshStandardMaterial({ color: 0x3a3d46, roughness: 0.8 }),
  );
  pad.position.set(x, 1.38, z);
  pad.receiveShadow = true;
  pad.userData.disposable = true;
  view.level.add(pad);
  view.ring(V(x, 1.44, z), 4.3, landing ? 0xffc62b : 0x7fe8ff, landing ? 0.35 : 0.2);
  for (const dx of [-1, 1]) view.box(V(x + dx * 1.1, 1.44, z), V(0.45, 0.04, 3.4), 0xffffff);
  view.box(V(x, 1.44, z), V(1.8, 0.04, 0.45), 0xffffff);
  const name = base.name || "";
  if (/AID/.test(name)) {
    // Relief tents with the mint cross, and crates.
    for (const dx of [-5.2, 5.2]) {
      view.box(V(x + dx, 2.2, z - 3.6), V(3, 1.8, 3.4), 0xf7f1e1);
      view.box(V(x + dx, 3.25, z - 3.6), V(3.3, 0.3, 3.7), 0x33d69f);
      view.box(V(x + dx, 2.4, z - 1.88), V(0.3, 1.1, 0.06), 0xff4b2b);
      view.box(V(x + dx, 2.4, z - 1.88), V(1.1, 0.3, 0.06), 0xff4b2b);
    }
    view.model("supply", V(x - 5.6, 1.3, z + 4), 1);
    view.model("supply", V(x - 4.2, 1.3, z + 4.8), 0.8);
  } else if (/CAMP/.test(name)) {
    // A field camp: olive tents, a sandbagged mast and fuel drums.
    for (const dx of [-5.4, 5.4]) {
      view.box(V(x + dx, 2.1, z + 3.4), V(3.2, 1.6, 3), 0x8f9a5b);
      view.box(V(x + dx, 3.05, z + 3.4), V(3.4, 0.3, 3.2), 0x6d7a44);
    }
    view.box(V(x + 5.5, 4, z - 4), V(0.16, 5.4, 0.16), 0x3a4048);
    view.box(V(x + 6, 6.4, z - 4), V(1.1, 0.7, 0.06), 0x33d69f);
    if (view.assets.has("fuel-drums")) view.model("fuel-drums", V(x - 5.4, 1.3, z - 4), 1);
  } else {
    // Highwater: the control station with its antenna, and relief crates by the pad.
    view.box(V(x - 6, 3, z - 4.4), V(3.6, 3.4, 3.2), 0xf6e7c8);
    view.box(V(x - 6, 4.85, z - 4.4), V(4, 0.35, 3.6), 0x2f86e8);
    view.box(V(x - 6, 3.2, z - 2.75), V(2.8, 1.1, 0.08), 0x7fd8ff);
    view.box(V(x - 4.8, 6.4, z - 4.8), V(0.12, 2.8, 0.12), 0x3a4048);
    view.model("supply", V(x - 6.2, 1.3, z + 3.6), 1.1);
    view.model("supply", V(x - 4.9, 1.3, z + 4.4), 0.9);
  }
  view.model("beacon", V(x + 5.6, 1.3, z - 4.4));
  view.model("streetlight", V(x + 6.4, 1.3, z + 4.6), 0.9);
}
