// Living details (2.9): tiny, light and tied to what happens in the mission. Pigeons on the city
// roofs, gulls and fish in the harbour, fish, egrets, reeds and swallows on the canal, and fish,
// waders and soaring birds along the valley rivers. A blast startles birds and scatters fish; the
// gunboat parts the fish at its bow and flushes the egrets; the helicopter's downwash flushes
// the waders. Each kind is one instanced draw that casts no shadow, and everything runs on its
// own random numbers, so missions and scripted runs play out exactly as before.
import * as THREE from "three";
import { Swarm, rectWater, mulberry32 } from "./swarm.js";
import { Perchers, createCirclers } from "./birds.js";
import { chapterStart } from "./data.js";
import { CITY } from "./strike-data.js";
import { onLand } from "./harbour-data.js";
import { RIVER, RIVER_THEMES } from "./river-data.js";
import { riverAt, riverEdge } from "./rescue-data.js";
import { terrainHeight } from "./rescue-world.js";

// Fish that read on teal water: warm and saturated, or dark (white koi vanish on teal).
const FISH = [
  [0xff7a2a, 0xffd27a],
  [0xffc83a, 0xff6a2a],
  [0xff4a3a, 0xffd0a0],
  [0x203a5a, 0x7fe0ff],
];
// Birds contrast with what they stand on: slate pigeons on pale roofs, grey-backed gulls on the
// quays (white ones show over the water), white egrets on grass, grey herons on sand.
const PIGEONS = [0x56627a, 0x6b7891, 0x47536a, 0x8a94a8];
const GULLS = [0xa7b2bf, 0x8f9bab, 0xffffff];
const EGRETS = [0xffffff, 0xfbf8f0, 0xffffff, 0x8f9aa8];
const HERONS = [0x6f8098, 0x7d8fa8, 0x5c6b82, 0xffffff];
// The canal's flowing stretch: the props wrap at the same near end (river.js).
const CANAL = { minZ: -64, maxZ: 34 };
// Missions at dusk swap swallows and gulls for bats.
const DUSK = new Set([14, 17]);
// Reeds repeat every PERIOD metres, so the whole row can slide with the canal and wrap unseen.
const PERIOD = 44;

export class Ambient {
  // `budget` scales the counts (the graphics level), `quiet` is reduced motion.
  constructor(game, { budget = 1, quiet = false } = {}) {
    this.game = game;
    this.view = game.view;
    this.budget = budget;
    this.quiet = quiet;
    this.rng = mulberry32(9001 + game.index * 131);
    this.time = 0;
    this.pending = 0;
    this.lastFlutter = -Infinity;
    this.fish = null;
    this.birds = null;
    this.circlers = null;
    this.reeds = null;
    this.reedShift = 0;
    const water = this.view.water.material.uniforms;
    const deep = water.deep.value,
      shallow = water.shallow.value;
    // A light tint at this size: much more and a 12 px fish turns to a brown smudge.
    this.tint = { color: new THREE.Color().setRGB((deep.x + shallow.x) / 2, (deep.y + shallow.y) / 2, (deep.z + shallow.z) / 2), mix: 0.2, opacity: 0.82 };
    if (game.chapter === 0) this.buildStrike();
    else if (game.chapter === 1) this.buildCanal();
    else this.buildValley();
    for (const part of [this.fish, this.birds, this.circlers, this.reeds]) if (part?.mesh) this.view.level.add(part.mesh);
  }

  n(count) {
    return Math.max(0, Math.round(count * this.budget));
  }

  buildStrike() {
    const op = this.game.op,
      harbour = op.layout.harbour;
    if (harbour) {
      const b = harbour.bounds,
        wet = (x, z) => !onLand(harbour.land, x, z) && !onLand(harbour.land, x + 1.2, z) && !onLand(harbour.land, x - 1.2, z) && !onLand(harbour.land, x, z + 1.2) && !onLand(harbour.land, x, z - 1.2);
      this.fish = this.swarm(rectWater({ minX: b.minX + 2, maxX: b.maxX - 2, minZ: b.minZ + 2, maxZ: b.maxZ - 2 }, wet), 44, 10, 1.45);
      // Gulls stand along the kerbs where the quays meet the water.
      const groups = [];
      for (const [x0, z0, x1, z1] of harbour.land) {
        for (const [ax, az, bx, bz, nx, nz] of [
          [x0, z0 + 0.25, x1, z0 + 0.25, 0, -1],
          [x0, z1 - 0.25, x1, z1 - 0.25, 0, 1],
          [x0 + 0.25, z0, x0 + 0.25, z1, -1, 0],
          [x1 - 0.25, z0, x1 - 0.25, z1, 1, 0],
        ]) {
          const length = Math.hypot(bx - ax, bz - az);
          for (let t = 4; t < length - 4; t += 13 + this.rng() * 10) {
            const x = ax + ((bx - ax) * t) / length,
              z = az + ((bz - az) * t) / length;
            if (x < b.minX || x > b.maxX || z < b.minZ - 8 || z > b.maxZ + 8 || !wet(x + nx * 2, z + nz * 2)) continue;
            groups.push([0, 1, 2].map((k) => ({ x: x + (bx - ax) / length * k * 0.9, y: CITY.ground + 0.14, z: z + (bz - az) / length * k * 0.9 })));
          }
        }
      }
      this.birds = this.perchers(this.pick(groups, 16), { span: 1.3, colors: GULLS, ceiling: 13, fill: 0.6, name: "gulls" });
      if (!this.quiet) {
        this.circlers = createCirclers("gull", { count: this.n(7), center: { x: 0, z: 20 }, radius: [9, 22], height: [9, 15], size: 1.3, seed: 31 });
        // The camera slides along a 270 m quay: the gulls keep over the part in view.
        this.followTarget = () => this.view.strikeFollow;
      }
      return;
    }
    // Pigeons along roof edges, a group per roof on a share of the buildings.
    const groups = [];
    for (const b of op.buildings) {
      if (this.rng() > 0.55) continue;
      const side = Math.floor(this.rng() * 4),
        along = (this.rng() - 0.5) * CITY.half,
        edge = CITY.half * 0.82;
      const spots = [];
      for (let k = 0; k < 4; k++) {
        const t = along + (k - 1.5) * 0.85;
        const [dx, dz] = side === 0 ? [t, -edge] : side === 1 ? [t, edge] : side === 2 ? [-edge, t] : [edge, t];
        spots.push({ x: b.x + dx, y: b.top + 0.02, z: b.z + dz });
      }
      groups.push(spots);
    }
    this.birds = this.perchers(this.pick(groups, 14), { span: 1.3, colors: PIGEONS, ceiling: 16, fill: 0.65, name: "pigeons" });
  }

  buildCanal() {
    const index = this.game.index,
      theme = RIVER_THEMES[index - chapterStart(1)] || RIVER_THEMES[0],
      bank = RIVER.bank;
    this.fish = this.swarm(rectWater({ minX: -bank + 1.6, maxX: bank - 1.6, minZ: CANAL.minZ, maxZ: CANAL.maxZ }), 40, 9, 1.35);
    // A wall right at the water (the Cut) leaves no beach for birds or reeds. Behind open banks
    // the egrets stand on the grass; where rock walls rise behind the beach, herons stand on the sand.
    const walls = theme.walls || [],
      beach = !walls.some((w) => w.offset < 1.5),
      grass = !walls.length;
    if (beach) {
      const groups = [];
      for (let z = CANAL.maxZ - 4; z > CANAL.minZ; z -= 9 + this.rng() * 8) {
        const side = this.rng() < 0.5 ? -1 : 1,
          x = side * (bank + (grass ? 3.6 : 0.6) + this.rng() * 0.8);
        groups.push([0, 1, 2].map((k) => ({ x: x + side * (k % 2) * 0.5, y: grass ? 1.12 : 1.0, z: z - k * 1.1 })));
      }
      this.birds = this.perchers(groups, { span: 1.4, colors: grass ? EGRETS : HERONS, ceiling: 9, fill: 0.6, name: grass ? "egrets" : "herons" });
      this.reeds = this.reedRow(bank);
    }
    if (!this.quiet)
      this.circlers = DUSK.has(index)
        ? createCirclers("bat", { count: this.n(7), center: { x: 0, z: -14 }, radius: [5, 13], height: [3, 7], size: 0.8, seed: 41 })
        : createCirclers("swallow", { count: this.n(8), center: { x: 0, z: -14 }, radius: [6, 14], height: [1.6, 3.4], size: 0.75, speed: [0.35, 0.7], seed: 41 });
  }

  buildValley() {
    const map = this.game.op.map,
      index = this.game.index;
    const minZ = -246,
      maxZ = 28;
    // The river winds: goals are drawn across its width, a little up or down stream of the fish.
    const water = {
      minX: -48,
      maxX: 48,
      minZ,
      maxZ,
      contains: (x, z) => z >= minZ && z <= maxZ && riverEdge(map, x, z) < -0.9,
      random: (rng, x, z) => {
        const at = z === undefined ? minZ + rng() * (maxZ - minZ) : Math.max(minZ, Math.min(maxZ, z + (rng() - 0.5) * 30)),
          r = riverAt(map, at);
        return { x: r.x + (rng() - 0.5) * Math.max(0, r.width - 2.6), z: at };
      },
    };
    this.fish = this.swarm(water, 44, 12, 1.35);
    // Waders along the water's edge, in twos and threes.
    const groups = [];
    for (let z = maxZ - 6; z > minZ; z -= 11 + this.rng() * 9) {
      const r = riverAt(map, z),
        side = this.rng() < 0.5 ? -1 : 1;
      const spots = [];
      for (let k = 0; k < 3; k++) {
        const zz = z - k * 1.2,
          rr = riverAt(map, zz),
          x = rr.x + side * (rr.width / 2 + 0.25 + this.rng() * 0.6);
        spots.push({ x, y: Math.max(0.04, terrainHeight(map, x, zz)), z: zz });
      }
      if (Math.abs(r.x) < 44) groups.push(spots);
    }
    this.birds = this.perchers(groups, { span: 1.35, colors: EGRETS, ceiling: 15, fill: 0.6, name: "waders" });
    if (!this.quiet) {
      const at = { x: 0, z: 0 };
      this.circlers = DUSK.has(index)
        ? createCirclers("bat", { count: this.n(8), center: at, radius: [5, 14], height: [4, 9], size: 0.85, seed: 51 })
        : map.biome === "jungle"
          ? createCirclers("swallow", { count: this.n(8), center: at, radius: [6, 15], height: [2.5, 5], size: 0.8, speed: [0.35, 0.7], seed: 51 })
          : createCirclers("hawk", { count: this.n(4), center: at, radius: [12, 24], height: [15, 21], size: 1.9, speed: [0.12, 0.22], seed: 51 });
      this.followTarget = () => this.game.player?.position;
    }
  }

  swarm(water, count, schools, length) {
    const n = this.n(count);
    if (!n) return null;
    return new Swarm({ water, count: n, schools: Math.max(1, Math.round(schools * this.budget)), length, colors: FISH, seed: 7 + this.game.index * 17, tint: this.tint, quiet: this.quiet });
  }

  // At most `max` groups, spread through the list (a long quay offers far more edge than needs birds).
  pick(groups, max) {
    if (groups.length <= max) return groups;
    const step = groups.length / max;
    return Array.from({ length: max }, (_, i) => groups[Math.floor(i * step + this.rng() * step)]);
  }

  perchers(groups, options) {
    // The budget thins whole groups, so the ones left still read as flocks.
    const kept = groups.filter(() => this.rng() < this.budget);
    if (!kept.length) return null;
    const birds = new Perchers({ groups: kept, seed: 13 + this.game.index * 29, quiet: this.quiet, ...options });
    return birds.count ? birds : null;
  }

  // Reed clumps standing in the shallows along both beaches, swaying on the GPU.
  reedRow(bank) {
    const geometry = reedGeometry(),
      per = this.n(9);
    if (!per) return null;
    const spots = [];
    for (const side of [-1, 1])
      for (let k = 0; k < per; k++) spots.push([side * (bank - 0.5 - this.rng() * 0.9), this.rng() * PERIOD, 1 + this.rng() * 0.5, this.rng() * Math.PI * 2]);
    const copies = 4,
      count = spots.length * copies;
    const uniforms = { uTime: { value: 0 } };
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;").replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
float rise = clamp(position.y / 1.1, 0.0, 1.0);
float gust = sin(uTime * 1.7 + instanceMatrix[3].z * 0.35 + instanceMatrix[3].x * 0.2) + 0.35 * sin(uTime * 3.9 + instanceMatrix[3].z * 0.9);
transformed.x += gust * 0.12 * rise * rise;
transformed.z += cos(uTime * 1.2 + instanceMatrix[3].x) * 0.05 * rise * rise;`,
      );
    };
    material.customProgramCacheKey = () => "tidelock-reeds";
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    const matrix = new THREE.Matrix4(),
      rotation = new THREE.Quaternion(),
      up = new THREE.Vector3(0, 1, 0);
    let i = 0;
    for (let c = 0; c < copies; c++)
      for (const [x, z, s, turn] of spots) {
        matrix.compose(new THREE.Vector3(x, 0, CANAL.maxZ - 12 - c * PERIOD - z), rotation.setFromAxisAngle(up, turn), new THREE.Vector3(s, s, s));
        mesh.setMatrixAt(i++, matrix);
      }
    mesh.frustumCulled = false;
    mesh.castShadow = mesh.receiveShadow = false;
    mesh.name = "reeds";
    mesh.userData.disposable = true;
    return { mesh, uniforms, count };
  }

  // A blast (any chapter): fish scatter, birds take off, and perches it may have holed (a roof,
  // a quay edge) are never settled on again.
  disturb(x, y, z, radius) {
    this.fish?.scare(x, z, Math.max(4, radius * 2.5));
    this.flush(x, z, Math.max(6, radius * 3.5));
    this.birds?.spoil(x, y, z, Math.max(3, radius * 1.5));
  }

  flush(x, z, radius) {
    const groups = this.birds?.startle(x, z, radius) || 0;
    // One flutter per take-off, not per bird, and not too often.
    if (groups && this.time - this.lastFlutter > 1.2) {
      this.lastFlutter = this.time;
      this.game.audio.play("flutter");
    }
  }

  // Called from Game.update at the fixed step; the work runs at most about 60 times a second.
  update(dt) {
    this.pending += dt;
    if (this.pending < 1 / 61) return;
    const step = Math.min(this.pending, 0.05);
    this.pending = 0;
    this.time += step;
    const g = this.game,
      player = g.player?.position;
    if (g.chapter === 1) {
      // The banks stop scrolling when the mission ends; so does everything on the water.
      const flow = g.status === "playing" ? (g.op.flow || 0) * step : 0;
      this.fish?.drift(flow);
      this.birds?.drift(flow, CANAL.minZ, CANAL.maxZ);
      this.reedShift = (this.reedShift + flow) % PERIOD;
      if (this.reeds) this.reeds.mesh.position.z = this.reedShift;
      // The bow wave parts the fish; passing close flushes the egrets.
      if (player && g.status === "playing") {
        this.fish?.scare(player.x, player.z - 1.6, 3.4);
        this.flush(player.x, player.z, 9);
      }
    } else if (g.chapter === 2 && player && g.status === "playing") {
      // Lantern's downwash: waders take off, fish under her dart away.
      this.flush(player.x, player.z, 9);
      this.fish?.scare(player.x, player.z, 3.5);
    }
    this.fish?.update(step);
    this.birds?.update(step);
    if (this.reeds) this.reeds.uniforms.uTime.value = this.time;
    if (this.circlers) {
      this.circlers.update(this.time);
      const at = this.followTarget?.();
      if (at) this.circlers.follow(at.x, at.z - (g.chapter === 2 ? 10 : 0), step);
    }
  }

  stats() {
    const birds = this.birds?.counts() || { birds: 0, perched: 0, flying: 0 };
    return {
      fish: this.fish?.count || 0,
      fishInWater: this.fish?.inside() || 0,
      ...birds,
      kind: this.birds?.mesh.name || null,
      circling: this.circlers?.count || 0,
      reeds: this.reeds?.count || 0,
      meshes: [this.fish, this.birds, this.circlers, this.reeds].filter(Boolean).length,
    };
  }
}

// A 24-triangle reed clump: four tapered blades and a seed head, 1.1 m tall, standing on y = 0.
function reedGeometry() {
  const tris = [],
    base = [0.22, 0.38, 0.16],
    top = [0.55, 0.72, 0.32],
    head = [0.45, 0.3, 0.16],
    height = 1.1;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.3,
      lean = 0.12 + 0.05 * k,
      w = 0.035,
      ax = Math.cos(a),
      az = Math.sin(a),
      h = height * (0.75 + 0.08 * k);
    const b1 = [ax * 0.05 - az * w, 0, az * 0.05 + ax * w],
      b2 = [ax * 0.05 + az * w, 0, az * 0.05 - ax * w];
    const m1 = [ax * lean - az * w * 0.6, h * 0.55, az * lean + ax * w * 0.6],
      m2 = [ax * lean + az * w * 0.6, h * 0.55, az * lean - ax * w * 0.6],
      tip = [ax * lean * 1.9, h, az * lean * 1.9];
    tris.push([b1, b2, m2, base], [b1, m2, m1, base], [m1, m2, tip, top]);
  }
  const hy = height * 0.78;
  tris.push([[-0.025, hy, 0], [0.025, hy, 0], [0, height * 1.02, 0], head], [[0, hy, -0.025], [0, hy, 0.025], [0, height * 1.02, 0], head]);
  const pos = [],
    col = [];
  for (const [a, b, c, k] of tris) {
    // Both faces: blades are seen from either side.
    pos.push(...a, ...b, ...c, ...a, ...c, ...b);
    for (let v = 0; v < 6; v++) col.push(...k);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geometry.computeVertexNormals();
  return geometry;
}
