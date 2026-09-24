// Chapter 1 "Breakwater": city layouts, enemy schedules, ordnance and ballistics.
// Everything here is deterministic and free of Three.js so it can be unit tested.

export const CITY = Object.freeze({
  ground: 1,
  plinth: 0.2,
  floorH: 2.8,
  slab: 0.32,
  half: 4,
  tiles: 4,
  pitch: 13.5,
  wall: 0.26,
});

export const FLIGHT = Object.freeze({
  altitude: 24,
  speed: 10,
  minSpeed: 6.5,
  maxSpeed: 14,
  accel: 5,
  lateral: 8,
  entryX: -54,
  exitX: 54,
  turnTime: 2.6,
  laneMin: -24,
  laneMax: 24,
  tight: 3.4,
  wide: 7,
  trail: 3.4,
  release: 0.45,
});

export const WALK = Object.freeze({ speed: 3, run: 4.4, stair: 1 });
export const GRAVITY = -9.81;
export const STEP = 1 / 120;

export const BOMBS = Object.freeze({
  drill: {
    name: "Drill",
    model: "bomb-penetrator",
    color: 0xff8a2b,
    css: "#ff8a2b",
    radius: 2.9,
    breakRadius: 1.4,
    summary: "Punches through slabs and detonates on the floor you set.",
  },
  scatter: {
    name: "Scatter",
    model: "bomb-cluster",
    color: 0xb04cff,
    css: "#c77dff",
    radius: 2.1,
    breakRadius: 0.9,
    bomblets: 8,
    burst: 7,
    spread: 3.8,
    summary: "Bursts into eight bomblets above open ground or rooftops.",
  },
  shockwave: {
    name: "Shockwave",
    model: "bomb-blast",
    color: 0xff3b3b,
    css: "#ff5a4a",
    radius: 5.2,
    breakRadius: 3.2,
    summary: "A huge blast on first contact. Tears open roofs and flak nests.",
  },
  lance: {
    name: "Lance",
    model: "bomb-guided",
    color: 0x18d5ff,
    css: "#18d5ff",
    radius: 2.7,
    breakRadius: 1.2,
    steer: 16,
    summary: "Guided bomb. Locks the target nearest the pipper, even a moving truck.",
  },
});
export const BOMB_ORDER = ["drill", "scatter", "shockwave", "lance"];

const P = (b, f, x = 0, z = 0) => ({ b, f, x, z });
const S = (x, z) => ({ x, z });

// Palette for facades: warm, saturated, and never beige.
const HUES = ["#e2704f", "#2fb3a6", "#f2b441", "#ff8a6b", "#6ec3f0", "#8fd64a"];
const tower = (id, col, row, floors, opts = {}) => ({
  id,
  col,
  row,
  floors,
  kind: "tower",
  color: HUES[(col * 2 + row * 3 + floors) % HUES.length],
  roof: [],
  ...opts,
});

export const STRIKE_MISSIONS = [
  {
    // 1.1 Wake-Up Call: a single jammer with three guards. Teaches the pipper.
    cols: 3,
    rows: 2,
    buildings: [
      tower("A1", 0, 0, 3),
      tower("T1", 1, 0, 4, { name: "Harbour Tower", roof: ["hvac"] }),
      tower("A2", 2, 0, 3, { roof: ["tank"] }),
      tower("A3", 0, 1, 2),
      tower("A4", 2, 1, 2, { roof: ["hvac"] }),
    ],
    plazas: [{ col: 1, row: 1, name: "Harbour Steps" }],
    masts: [P("T1", 4, 0.4, -0.6)],
    aa: [],
    groups: [
      { kind: "post", at: P("T1", 4, -2.2, 1.6) },
      { kind: "post", at: P("T1", 4, 2.2, 1.2) },
      { kind: "post", at: P("T1", 4, 1.6, -2.4) },
    ],
    aircraft: [{ callsign: "Kestrel One", crew: "iona", payload: { shockwave: 2 } }],
    par: 1,
    alert: 0,
  },
  {
    // 1.2 Floors Below: spotters indoors. Teaches the Drill floor setting.
    cols: 3,
    rows: 2,
    buildings: [
      tower("T1", 0, 0, 5, { name: "Canal Tower", roof: ["tank"] }),
      tower("T2", 1, 0, 3, { name: "Ferry House", roof: ["hvac"] }),
      tower("A1", 2, 0, 4),
      tower("A2", 0, 1, 2),
      tower("A3", 2, 1, 2, { roof: ["hvac"] }),
    ],
    plazas: [{ col: 1, row: 1, name: "Canal Steps" }],
    masts: [],
    aa: [],
    groups: [
      {
        kind: "patrol",
        points: [P("T1", 2, -1.8, 0.6), P("T1", 2, 1.6, -0.4)],
        wait: 1.5,
        count: 2,
      },
      { kind: "post", at: P("T2", 1, 0.6, 0.8) },
    ],
    aircraft: [{ callsign: "Kestrel One", crew: "iona", payload: { drill: 3 } }],
    par: 2,
    alert: 0,
  },
  {
    // 1.3 Shift Change: two squads converge on Market Square on a schedule.
    cols: 3,
    rows: 2,
    buildings: [
      tower("A1", 0, 0, 4, { roof: ["tank"] }),
      tower("T2", 1, 0, 6, { name: "Signal Tower" }),
      tower("T4", 2, 0, 4, { name: "Clock House" }),
      tower("T1", 0, 1, 3, { name: "West Arcade" }),
      tower("T3", 2, 1, 3, { name: "East Arcade", roof: ["hvac"] }),
    ],
    plazas: [{ col: 1, row: 1, name: "Market Square" }],
    masts: [P("T2", 6, 0, -0.4)],
    aa: [],
    groups: [
      {
        kind: "rally",
        label: "SHIFT CHANGE",
        place: "MARKET SQUARE",
        homes: [
          P("T1", 2, -1.5, 0.5),
          P("T1", 2, 1.4, -1),
          P("T1", 1, 0.3, 1.2),
          P("T3", 1, -1.2, 0.8),
          P("T3", 1, 1.6, -0.6),
          P("T3", 3, 0.5, 1.5),
        ],
        rally: S(0, 6.75),
        at: 20,
        every: 48,
        stay: 8,
      },
      { kind: "post", at: P("T2", 6, -2.2, 1.8) },
      { kind: "post", at: P("T2", 6, 2.4, 1.2) },
      { kind: "post", at: P("T4", 2, 0.5, 0.5) },
    ],
    aircraft: [
      { callsign: "Kestrel One", crew: "iona", payload: { drill: 1, shockwave: 1 } },
      { callsign: "Kestrel Two", crew: "piper", payload: { scatter: 2 } },
    ],
    par: 3,
    alert: 0,
  },
  {
    // 1.4 Flak Alley: two flak nests; the full flight and salvo.
    cols: 3,
    rows: 2,
    buildings: [
      tower("T1", 0, 0, 5, { name: "Canal Row North" }),
      tower("T2", 1, 0, 4, { name: "Dye Works", roof: ["hvac"] }),
      tower("T3", 2, 0, 5, { name: "Lock Keeper's" }),
      tower("A1", 0, 1, 2, { roof: ["tank"] }),
      tower("T5", 2, 1, 3, { name: "Boat Store" }),
    ],
    plazas: [{ col: 1, row: 1, name: "Dye Yard" }],
    masts: [],
    aa: [P("T1", 5, 1, -1), P("T3", 5, -1, -0.8)],
    groups: [
      {
        kind: "rally",
        label: "ROOF BRIEFING",
        place: "DYE WORKS ROOF",
        homes: [P("T2", 1, -1.4, 0.4), P("T2", 2, 1.2, 1), P("T2", 2, -0.8, -1.4)],
        rally: P("T2", 4, 0.2, 0.9),
        at: 12,
        every: 26,
        stay: 7,
      },
      {
        kind: "patrol",
        points: [P("T1", 3, -2, 1), P("T1", 3, 2, -1)],
        wait: 2,
        count: 2,
      },
      {
        kind: "patrol",
        points: [S(-10, 13.5), S(10, 13.5)],
        wait: 1,
        count: 2,
      },
      { kind: "post", at: P("T3", 4, 0.4, 1.4) },
      { kind: "post", at: P("T5", 1, 0.2, 0.2) },
    ],
    aircraft: [
      { callsign: "Kestrel One", crew: "iona", payload: { drill: 3 } },
      { callsign: "Kestrel Two", crew: "piper", payload: { scatter: 2 } },
      { callsign: "Kestrel Three", crew: "bram", payload: { shockwave: 2 } },
    ],
    par: 5,
    alert: 0,
  },
  {
    // 1.5 Scatter: the cell hides after the first blast; a civilian shelter sits beside the muster.
    cols: 3,
    rows: 2,
    buildings: [
      tower("T1", 0, 0, 4, { name: "Orchard House" }),
      tower("T2", 1, 0, 5, { name: "Seed Exchange", roof: ["tank"] }),
      tower("T3", 2, 0, 4, { name: "Press Hall" }),
      tower("T4", 0, 1, 3, { name: "Cooper's" }),
      tower("SH", 1, 1, 3, { name: "Civic Shelter", kind: "shelter", color: "#2f86e8" }),
      tower("T5", 2, 1, 3, { name: "Mill Yard", roof: ["hvac"] }),
    ],
    plazas: [],
    masts: [],
    aa: [],
    groups: [
      {
        kind: "rally",
        label: "MUSTER",
        place: "ORCHARD CROSSING",
        homes: [
          P("T1", 1, -1.5, 0.8),
          P("T1", 2, 1.3, -0.5),
          P("T4", 1, 1.2, -1.2),
          P("T4", 2, -0.6, 1),
          P("T2", 1, -2, 1.5),
          P("T2", 2, -1.2, -1.2),
        ],
        rally: S(-6.75, -2),
        at: 18,
        every: 38,
        stay: 7,
      },
      {
        kind: "patrol",
        points: [P("T3", 3, -2, -1), P("T3", 3, 2, 1)],
        wait: 2,
        count: 2,
      },
      { kind: "post", at: P("T5", 3, -1.5, 1) },
      { kind: "post", at: P("T5", 3, 1.6, -1.2) },
      { kind: "post", at: P("T2", 4, 0.5, 0.4) },
      { kind: "post", at: P("T2", 4, -1.8, -1.4) },
    ],
    aircraft: [
      { callsign: "Kestrel One", crew: "iona", payload: { drill: 4 } },
      { callsign: "Kestrel Two", crew: "piper", payload: { scatter: 2 } },
      { callsign: "Kestrel Three", crew: "bram", payload: { shockwave: 2 } },
    ],
    par: 6,
    alert: 16,
  },
  {
    // 1.6 The Glass Tower: lieutenants meet on the sixth floor; flak, convoy and a shelter.
    cols: 3,
    rows: 3,
    buildings: [
      tower("T1", 0, 0, 5, { name: "North Exchange" }),
      tower("T2", 1, 0, 5, { name: "Harbour Bank" }),
      tower("T3", 2, 0, 5, { name: "Dockside Hotel" }),
      tower("T4", 0, 1, 4, { name: "Weigh House" }),
      tower("GT", 1, 1, 7, { name: "The Glass Tower", kind: "glass", color: "#18d5ff" }),
      tower("T5", 2, 1, 4, { name: "Customs" }),
      tower("T6", 0, 2, 3, { name: "Rope Walk" }),
      tower("T7", 1, 2, 3, { name: "Fish Market", roof: ["hvac"] }),
      tower("SH", 2, 2, 3, { name: "Civic Shelter", kind: "shelter", color: "#2f86e8" }),
    ],
    plazas: [],
    masts: [P("T2", 5, 1.4, -1.2)],
    aa: [P("T1", 5, 0.8, -0.6), P("T3", 5, -0.8, -0.6), P("T6", 3, 1, 1)],
    convoy: {
      points: [S(-6.75, -6.75), S(6.75, -6.75), S(6.75, 6.75), S(-6.75, 6.75)],
      count: 2,
      speed: 4.5,
      gap: 1.1,
    },
    groups: [
      {
        kind: "rally",
        label: "LIEUTENANTS' MEETING",
        place: "GLASS TOWER / F6",
        homes: [
          P("T4", 1, -1, 0.5),
          P("T4", 2, 1.4, -1),
          P("T5", 2, 0.5, 1),
          P("T2", 3, -1.2, 0.6),
          P("T7", 1, 1.3, -0.4),
          P("T7", 1, -1.4, 0.8),
        ],
        officers: 4,
        rally: P("GT", 5, 0.4, 0.8),
        at: 30,
        every: 64,
        stay: 9,
      },
      { kind: "post", at: P("T2", 5, -1.6, 1.4) },
      { kind: "post", at: P("T2", 5, 1.8, 1.2) },
      {
        kind: "patrol",
        points: [P("T6", 2, -1.8, 1), P("T6", 2, 1.8, -1)],
        wait: 2,
        count: 2,
      },
      { kind: "post", at: P("T5", 4, 0.6, 1.2) },
    ],
    aircraft: [
      {
        callsign: "Kestrel One",
        crew: "iona",
        payload: { drill: 4, lance: 1 },
      },
      { callsign: "Kestrel Two", crew: "piper", payload: { scatter: 3 } },
      { callsign: "Kestrel Three", crew: "bram", payload: { shockwave: 3 } },
    ],
    par: 8,
    alert: 14,
  },
];

// ------------------------------------------------------------------ geometry

export function lotCenter(layout, col, row) {
  return {
    x: (col - (layout.cols - 1) / 2) * CITY.pitch,
    z: (row - (layout.rows - 1) / 2) * CITY.pitch,
  };
}

export function storyY(f) {
  return CITY.ground + CITY.plinth + f * CITY.floorH;
}

export function resolveBuildings(layout) {
  return layout.buildings.map((b, index) => {
    const c = lotCenter(layout, b.col, b.row);
    return {
      ...b,
      index,
      x: c.x,
      z: c.z,
      top: storyY(b.floors),
      min: [c.x - CITY.half, CITY.ground, c.z - CITY.half],
      max: [c.x + CITY.half, storyY(b.floors) + 0.05, c.z + CITY.half],
    };
  });
}

export function buildingById(buildings, id) {
  const b = buildings.find((item) => item.id === id);
  if (!b) throw new Error(`Unknown building ${id}`);
  return b;
}

export function resolvePlace(buildings, place) {
  if (place.b) {
    const b = buildingById(buildings, place.b);
    return { x: b.x + place.x, y: storyY(place.f), z: b.z + place.z, b: b.id, f: place.f };
  }
  return { x: place.x, y: CITY.ground, z: place.z, b: null, f: 0 };
}

export function buildingAt(buildings, x, z, margin = 0) {
  return (
    buildings.find(
      (b) =>
        x >= b.min[0] - margin &&
        x <= b.max[0] + margin &&
        z >= b.min[2] - margin &&
        z <= b.max[2] + margin,
    ) || null
  );
}

// Destructible blocks: floor/roof slab tiles and wall panels (glass on the south face).
export function buildBlocks(buildings) {
  const blocks = [];
  const tile = (CITY.half * 2) / CITY.tiles;
  for (const b of buildings) {
    for (let f = 1; f <= b.floors; f++) {
      const top = storyY(f);
      for (let i = 0; i < CITY.tiles; i++)
        for (let j = 0; j < CITY.tiles; j++) {
          const x0 = b.x - CITY.half + i * tile,
            z0 = b.z - CITY.half + j * tile;
          blocks.push({
            b: b.index,
            kind: f === b.floors ? "roof" : "slab",
            f,
            min: [x0, top - CITY.slab, z0],
            max: [x0 + tile, top, z0 + tile],
          });
        }
    }
    for (let f = 0; f < b.floors; f++) {
      const y0 = storyY(f),
        y1 = storyY(f + 1) - CITY.slab;
      for (let i = 0; i < CITY.tiles; i++) {
        const a = -CITY.half + i * tile;
        const southDoor = f === 0 && (i === 1 || i === 2);
        const t = CITY.wall;
        const sides = [
          ["north", [b.x + a, y0, b.z - CITY.half], [b.x + a + tile, y1, b.z - CITY.half + t]],
          ["south", [b.x + a, y0, b.z + CITY.half - t], [b.x + a + tile, y1, b.z + CITY.half]],
          ["west", [b.x - CITY.half, y0, b.z + a], [b.x - CITY.half + t, y1, b.z + a + tile]],
          ["east", [b.x + CITY.half - t, y0, b.z + a], [b.x + CITY.half, y1, b.z + a + tile]],
        ];
        for (const [side, min, max] of sides) {
          if (side === "south" && southDoor) continue;
          blocks.push({
            b: b.index,
            kind: side === "south" || b.kind === "glass" ? "glass" : "wall",
            side,
            f,
            min,
            max,
          });
        }
      }
    }
  }
  blocks.forEach((block, id) => {
    block.id = id;
    block.alive = true;
  });
  return blocks;
}

// Segment/AABB slab test. Returns the entry fraction in [0, 1] or null.
export function segmentBox(a, b, min, max, pad = 0) {
  let t0 = 0,
    t1 = 1;
  for (let axis = 0; axis < 3; axis++) {
    const key = "xyz"[axis];
    const origin = a[key],
      delta = b[key] - a[key];
    const lo = min[axis] - pad,
      hi = max[axis] + pad;
    if (Math.abs(delta) < 1e-9) {
      if (origin < lo || origin > hi) return null;
      continue;
    }
    let near = (lo - origin) / delta,
      far = (hi - origin) / delta;
    if (near > far) [near, far] = [far, near];
    t0 = Math.max(t0, near);
    t1 = Math.min(t1, far);
    if (t0 > t1) return null;
  }
  return t0;
}

const boxDistance = (min, max, p) =>
  Math.hypot(
    Math.max(min[0] - p.x, 0, p.x - max[0]),
    Math.max(min[1] - p.y, 0, p.y - max[1]),
    Math.max(min[2] - p.z, 0, p.z - max[2]),
  );

export function blocksNear(blocks, p, radius) {
  return blocks.filter((b) => b.alive && boxDistance(b.min, b.max, p) < radius);
}

// All live blocks crossed by a segment, nearest first. Buildings prefilter the search.
export function blockHits(blocks, buildings, a, b) {
  const hits = [];
  for (const building of buildings) {
    if (segmentBox(a, b, building.min, building.max, 0.1) === null) continue;
    for (const block of blocks) {
      if (block.b !== building.index || !block.alive) continue;
      const t = segmentBox(a, b, block.min, block.max);
      if (t !== null) hits.push({ t, block });
    }
  }
  return hits.sort((x, y) => x.t - y.t);
}

// Line of sight for blast damage: walls and slabs shelter people unless they are broken.
export function lineBlocked(blocks, buildings, a, b) {
  for (const building of buildings) {
    if (segmentBox(a, b, building.min, building.max, 0.1) === null) continue;
    for (const block of blocks) {
      if (block.b !== building.index || !block.alive) continue;
      const t = segmentBox(a, b, block.min, block.max, -0.04);
      if (t !== null && t > 0.001 && t < 0.97) return true;
    }
  }
  return false;
}

// ------------------------------------------------------------------ routes

function lotLines(layout) {
  const avenues = [],
    streets = [];
  for (let c = 0; c <= layout.cols; c++)
    avenues.push((c - layout.cols / 2) * CITY.pitch);
  for (let r = 0; r <= layout.rows; r++)
    streets.push((r - layout.rows / 2) * CITY.pitch);
  return { avenues, streets };
}

const same = (a, b) =>
  Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.z - b.z) < 1e-6;

function stair(building, f) {
  return { x: building.x - 2.9, y: storyY(f), z: building.z - 2.9, b: building.id, f };
}

function door(building) {
  return { x: building.x, y: storyY(0), z: building.z + 3.3, b: building.id, f: 0 };
}

function street(x, z) {
  return { x, y: CITY.ground, z, b: null, f: 0 };
}

function nearest(values, target) {
  return values.reduce((best, v) => (Math.abs(v - target) < Math.abs(best - target) ? v : best));
}

// A place in an open lot touches two streets; prefer the one the walker already uses.
function streetLine(streets, z, prefer) {
  const close = streets.filter((s) => Math.abs(s - z) <= CITY.pitch / 2 + 1e-6);
  const match = close.find((s) => prefer !== null && Math.abs(s - prefer) < 1e-6);
  return match ?? nearest(close.length ? close : streets, z);
}

// Walkable route between two resolved places: stairs, doors, then the street grid.
export function pathBetween(layout, buildings, from, to) {
  const out = [from];
  const push = (p) => {
    if (!same(out[out.length - 1], p)) out.push(p);
  };
  const { avenues, streets } = lotLines(layout);
  if (from.b && from.b === to.b) {
    const b = buildingById(buildings, from.b);
    if (from.f !== to.f) {
      push(stair(b, from.f));
      push(stair(b, to.f));
    }
    push(to);
    return out;
  }
  const fromBuilding = from.b ? buildingById(buildings, from.b) : null;
  const toBuilding = to.b ? buildingById(buildings, to.b) : null;
  let exitZ = fromBuilding ? fromBuilding.z + CITY.pitch / 2 : null;
  let entryZ = toBuilding ? toBuilding.z + CITY.pitch / 2 : null;
  if (exitZ === null) exitZ = streetLine(streets, from.z, entryZ);
  if (entryZ === null) entryZ = streetLine(streets, to.z, exitZ);
  if (fromBuilding) {
    if (from.f !== 0) {
      push(stair(fromBuilding, from.f));
      push(stair(fromBuilding, 0));
    }
    push(door(fromBuilding));
  }
  const exit = street(fromBuilding ? fromBuilding.x : from.x, exitZ);
  push(exit);
  const entry = street(toBuilding ? toBuilding.x : to.x, entryZ);
  const tail = [];
  if (toBuilding) {
    tail.push(door(toBuilding));
    if (to.f !== 0) {
      tail.push(stair(toBuilding, 0));
      tail.push(stair(toBuilding, to.f));
    }
  }
  if (Math.abs(exit.z - entry.z) > 1e-6) {
    const avenue = avenues.reduce((best, a) =>
      Math.abs(exit.x - a) + Math.abs(entry.x - a) <
      Math.abs(exit.x - best) + Math.abs(entry.x - best)
        ? a
        : best,
    );
    push(street(avenue, exit.z));
    push(street(avenue, entry.z));
  }
  push(entry);
  for (const p of tail) push(p);
  push(to);
  return out;
}

// Timed keyframes along a path. Stairs cost a fixed time per floor.
export function timeline(points, speed = WALK.speed, start = 0) {
  const keys = [{ t: start, ...points[0] }];
  let t = start;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    const flat = Math.hypot(b.x - a.x, b.z - a.z);
    // Stairs cost time per storey climbed, including a partial climb from mid-flight.
    const climb = Math.abs(b.y - a.y) / CITY.floorH;
    t += climb * WALK.stair + flat / speed;
    keys.push({ t, ...b });
  }
  return keys;
}

const duration = (keys) => keys[keys.length - 1].t - keys[0].t;

function shift(keys, dt) {
  return keys.map((k) => ({ ...k, t: k.t + dt }));
}

// Each member leaves home in time to arrive exactly when the rally starts.
export function rallyRoute(layout, buildings, home, spot, rally) {
  const go = timeline(pathBetween(layout, buildings, home, spot));
  const back = timeline(pathBetween(layout, buildings, spot, home));
  const walk = duration(go),
    ret = duration(back);
  const wait = rally.every - walk - rally.stay - ret;
  if (wait < 0.5)
    throw new Error(`Rally ${rally.label} is too short for its walkers`);
  const keys = [
    ...go,
    { ...spot, t: walk + rally.stay },
    ...shift(back, walk + rally.stay).slice(1),
    { ...home, t: rally.every },
  ];
  return { keys, period: rally.every, offset: walk - rally.at, walk };
}

// Evaluate a one-off timeline (hide or rejoin run) at absolute time.
export function samplePath(keys, time) {
  if (time <= keys[0].t) return { ...keys[0], done: false };
  const last = keys[keys.length - 1];
  if (time >= last.t) return { ...last, done: true };
  let i = 1;
  while (keys[i].t < time) i++;
  const a = keys[i - 1],
    b = keys[i];
  const u = (time - a.t) / Math.max(1e-9, b.t - a.t);
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    z: a.z + (b.z - a.z) * u,
    b: u < 0.5 ? a.b : b.b,
    f: Math.round((a.f ?? 0) + ((b.f ?? 0) - (a.f ?? 0)) * u),
    heading: Math.atan2(b.x - a.x, b.z - a.z),
    moving: true,
    done: false,
  };
}

export function patrolRoute(layout, buildings, points, wait, phase = 0) {
  const loop = [...points, points[0]];
  let keys = [];
  let t = 0;
  for (let i = 0; i < loop.length - 1; i++) {
    const segment = timeline(pathBetween(layout, buildings, loop[i], loop[i + 1]), WALK.speed * 0.6, t + wait);
    keys.push({ ...loop[i], t });
    keys.push(...segment);
    t = segment[segment.length - 1].t;
  }
  return { keys, period: t, offset: phase * t };
}

export function convoyRoute(points, speed, phase = 0) {
  const loop = [...points, points[0]].map((p) => ({ x: p.x, y: CITY.ground, z: p.z, b: null, f: 0 }));
  const keys = timeline(loop, speed);
  const period = keys[keys.length - 1].t;
  return { keys, period, offset: phase };
}

export function postRoute(place) {
  return { keys: [{ t: 0, ...place }, { t: 1, ...place }], period: 1, offset: 0 };
}

export function sampleRoute(route, time) {
  const { keys, period } = route;
  let t = (((time + route.offset) % period) + period) % period;
  let i = 1;
  while (i < keys.length - 1 && keys[i].t < t) i++;
  const a = keys[i - 1],
    b = keys[i];
  const span = b.t - a.t;
  const u = span > 1e-9 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 1;
  const moving = span > 1e-9 && !same(a, b) && u > 0 && u < 1;
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    z: a.z + (b.z - a.z) * u,
    b: u < 0.5 ? a.b : b.b,
    f: Math.round((a.f ?? 0) + ((b.f ?? 0) - (a.f ?? 0)) * u),
    moving,
    heading: Math.atan2(b.x - a.x, b.z - a.z),
  };
}

// Offsets so a gathering reads as a knot of people, not a single stacked figure.
export function rallySpot(centre, index, count) {
  if (count <= 1) return { ...centre };
  const angle = (index / count) * Math.PI * 2 + 0.4;
  const r = count > 4 ? 1.35 : 1;
  return { ...centre, x: centre.x + Math.cos(angle) * r, z: centre.z + Math.sin(angle) * r };
}

// Build every enemy's route. Returns data only; the game spawns meshes from it.
export function planEnemies(layout, buildings) {
  const plans = [];
  const events = [];
  layout.groups.forEach((group, gi) => {
    if (group.kind === "post") {
      plans.push({ group: gi, route: postRoute(resolvePlace(buildings, group.at)) });
    } else if (group.kind === "patrol") {
      const points = group.points.map((p) => resolvePlace(buildings, p));
      for (let i = 0; i < (group.count || 1); i++)
        plans.push({
          group: gi,
          route: patrolRoute(layout, buildings, points, group.wait ?? 1, i / (group.count || 1)),
        });
    } else if (group.kind === "rally") {
      const centre = resolvePlace(buildings, group.rally);
      const members = group.homes.length;
      group.homes.forEach((home, i) => {
        const spot = rallySpot(centre, i, members);
        plans.push({
          group: gi,
          officer: i < (group.officers || 0),
          route: rallyRoute(layout, buildings, resolvePlace(buildings, home), spot, group),
        });
      });
      events.push({
        group: gi,
        label: group.label,
        place: group.place,
        centre,
        at: group.at,
        every: group.every,
        stay: group.stay,
        members,
      });
    }
  });
  return { plans, events };
}

// Countdown for the intel strip: seconds until the next gathering, or time left in it.
export function rallyStatus(event, time) {
  const phase = (((time - event.at) % event.every) + event.every) % event.every;
  if (time >= event.at && phase < event.stay)
    return { active: true, remaining: event.stay - phase, next: 0 };
  const next = time < event.at ? event.at - time : event.every - phase;
  return { active: false, remaining: 0, next };
}

// ------------------------------------------------------------------ flight + ballistics

export function formationSlots(count, spacing) {
  const slots = [{ x: 0, z: 0 }];
  if (count > 1) slots.push({ x: -FLIGHT.trail, z: -spacing });
  if (count > 2) slots.push({ x: -FLIGHT.trail, z: spacing });
  return slots;
}

export function stepBomb(state, dt) {
  state.vy += GRAVITY * dt;
  const damping = Math.exp(-0.03 * dt);
  state.vx *= damping;
  state.vz *= damping;
  state.x += state.vx * dt;
  state.y += state.vy * dt;
  state.z += state.vz * dt;
}

// Continuously computed impact point. Drill forecasts report the floor that will detonate.
export function forecastImpact(blocks, buildings, release, kind, floor = 1) {
  const state = { ...release };
  const points = [{ x: state.x, y: state.y, z: state.z }];
  let crossesShelter = false;
  // Same step as the live simulation, so the pipper is exact even at building edges.
  const dt = STEP;
  for (let step = 0; step < 1200; step++) {
    const a = { x: state.x, y: state.y, z: state.z };
    stepBomb(state, dt);
    const b = { x: state.x, y: state.y, z: state.z };
    if (step % 8 === 0) points.push(b);
    if (kind === "scatter") {
      const below = surfaceBelow(buildings, blocks, b.x, b.z);
      const hit = blockHits(blocks, buildings, a, b)[0];
      if (hit || b.y <= below + BOMBS.scatter.burst) {
        const burst = hit ? lerp3(a, b, hit.t) : b;
        // Measure the ground under the burst itself, exactly as the live canister does.
        const centre = scatterCentre(burst, state, surfaceBelow(buildings, blocks, burst.x, burst.z));
        points.push(burst);
        return {
          points,
          impact: { x: centre.x, y: surfaceBelow(buildings, blocks, centre.x, centre.z), z: centre.z },
          burst,
          building: buildingAt(buildings, centre.x, centre.z),
          floor: null,
        };
      }
      continue;
    }
    if (kind === "drill") {
      for (const hit of blockHits(blocks, buildings, a, b))
        if (buildings[hit.block.b].kind === "shelter") crossesShelter = true;
      const building = buildingAt(buildings, b.x, b.z);
      if (building) {
        const target = Math.min(floor - 1, building.floors);
        const detonateY =
          target >= building.floors ? building.top : storyY(target) + 1.1;
        if (b.y <= detonateY) {
          points.push(b);
          // Report the floor the bomb actually reaches: a release that clips a corner
          // low down detonates on that floor, not the one that was set.
          const reached = Math.floor((b.y - storyY(0) + CITY.slab) / CITY.floorH);
          return {
            points,
            impact: { x: b.x, y: Math.min(building.top, b.y), z: b.z },
            detonation: b,
            building,
            floor: Math.max(0, Math.min(target, building.floors, reached)),
            crossesShelter,
          };
        }
        continue;
      }
    } else {
      const hit = blockHits(blocks, buildings, a, b)[0];
      if (hit) {
        const p = lerp3(a, b, hit.t);
        points.push(p);
        return {
          points,
          impact: p,
          building: buildings[hit.block.b],
          floor: hit.block.kind === "roof" ? buildings[hit.block.b].floors : hit.block.f,
        };
      }
    }
    if (b.y <= CITY.ground) {
      const t = (a.y - CITY.ground) / Math.max(1e-6, a.y - b.y);
      const p = lerp3(a, b, t);
      points.push(p);
      return { points, impact: p, building: null, floor: 0, crossesShelter };
    }
  }
  return { points, impact: points[points.length - 1], building: null, floor: 0, crossesShelter };
}

export function surfaceBelow(buildings, blocks, x, z) {
  const building = buildingAt(buildings, x, z);
  if (!building) return CITY.ground;
  let top = storyY(0);
  for (const block of blocks) {
    if (
      block.alive &&
      block.b === building.index &&
      (block.kind === "roof" || block.kind === "slab") &&
      x >= block.min[0] &&
      x <= block.max[0] &&
      z >= block.min[2] &&
      z <= block.max[2]
    )
      top = Math.max(top, block.max[1]);
  }
  return top;
}

export function lerp3(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

// Where the bomblet ring is centred when a Scatter canister bursts at `point`.
export function scatterCentre(point, velocity, below) {
  const h = Math.max(0.5, point.y - below);
  const fall = (velocity.vy + Math.sqrt(velocity.vy * velocity.vy + 2 * -GRAVITY * h)) / -GRAVITY;
  const t = Math.max(0.3, Math.abs(fall));
  return { x: point.x + velocity.vx * t * 0.85, z: point.z + velocity.vz * t * 0.85 };
}

const aabbDistance = (min, max, p) =>
  Math.hypot(
    Math.max(min[0] - p.x, 0, p.x - max[0]),
    Math.max(min[1] - p.y, 0, p.y - max[1]),
    Math.max(min[2] - p.z, 0, p.z - max[2]),
  );

// One rule for both the pipper warning and the abort: a detonation breaks a shelter
// block, or lands within 45% of its blast radius of the shelter.
export function shelterStruck(blocks, buildings, point, kind, margin = 0) {
  const def = kind === "bomblet" ? BOMBS.scatter : BOMBS[kind];
  for (const b of buildings) {
    if (b.kind !== "shelter") continue;
    if (aabbDistance(b.min, b.max, point) < def.radius * 0.45 + margin) return true;
    for (const block of blocks) {
      if (block.b !== b.index || !block.alive) continue;
      const limit = (block.kind === "glass" ? def.breakRadius * 1.5 : def.breakRadius) + margin;
      if (aabbDistance(block.min, block.max, point) < limit) return true;
    }
  }
  return false;
}

// Predicted detonation points for a forecast, used for the shelter warning.
export function forecastPoints(forecast) {
  if (forecast.kind === "scatter")
    return scatterPattern(forecast.impact).map((p) => ({ x: p.x, y: forecast.impact.y + 0.2, z: p.z, kind: "bomblet" }));
  const p = forecast.detonation || forecast.impact;
  return [{ x: p.x, y: p.y, z: p.z, kind: forecast.kind }];
}

// One bomblet at the centre and the rest on a ring: the blasts overlap into a solid
// disc about nine metres across, with no gap in the middle.
export function scatterPattern(centre, count = BOMBS.scatter.bomblets, radius = BOMBS.scatter.spread) {
  const points = [{ x: centre.x, z: centre.z }];
  const ring = radius * 0.8;
  for (let i = 0; i < count - 1; i++) {
    const angle = (i / (count - 1)) * Math.PI * 2;
    points.push({ x: centre.x + Math.cos(angle) * ring, z: centre.z + Math.sin(angle) * ring });
  }
  return points;
}

export function payloadTotal(aircraft) {
  return aircraft.reduce(
    (sum, a) => sum + Object.values(a.payload).reduce((x, y) => x + y, 0),
    0,
  );
}

export function comboBonus(kills) {
  return kills >= 2 ? kills * kills * 40 : 0;
}

export function strikeStars({ success, used, par, damaged }) {
  if (!success) return 0;
  return 1 + (used <= par ? 1 : 0) + (damaged ? 0 : 1);
}
