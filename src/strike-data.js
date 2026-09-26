// Chapter 1 "Breakwater": city layouts, enemy schedules, ordnance and ballistics.
// Everything here is deterministic and free of Three.js so it can be unit tested.
import { HARBOUR_MISSIONS, WATER_LEVEL, onLand, patternPoints } from "./harbour-data.js";

export const CITY = Object.freeze({
  ground: 1,
  plinth: 0.2,
  // 2.6: lower storeys (2.8 m before; figures stand 1.4 m), so a target on a roof sits close to
  // its own street on screen instead of floating over the next one.
  floorH: 1.9,
  slab: 0.32,
  half: 4,
  tiles: 4,
  // Lot pitch: an 8 m building and a 10.5 m street (2.5: twice the old 5 m gap between buildings).
  pitch: 18.5,
  wall: 0.26,
});

// Blasts reach the same floors as they did with 2.8 m storeys (2.6): in a blast check a height
// difference counts STOREY_REACH times over, and heights inside a storey (a chest, the Drill's
// burst) shrink by as much. A blast at street level is unchanged.
export const STOREY_REACH = 2.8 / CITY.floorH;
export const inStorey = (h) => h / STOREY_REACH;
export const blastDistance = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) * STOREY_REACH, a.z - b.z);
// Where a Drill bursts above the floor it was set to.
export const DRILL_BURST = inStorey(1.1);

// The flight sweeps back and forth over the city: it turns round a short way past each edge (or
// whenever the player reverses) and never leaves the map. Over targets it flies slowly (`speed`);
// flying to a far aim point it cruises at up to `maxSpeed`, and steers faster sideways.
// 2.5: free flight. Inside the safe airspace the stick moves the flight directly, along its line
// (up to maxSpeed, either way) and across it; let go and it drifts on at `speed`. Flying the
// other way is a short pivot (turnTime) rather than a long wingover.
export const FLIGHT = Object.freeze({
  altitude: 24,
  speed: 1.4,
  maxSpeed: 7.5,
  accel: 4,
  lateral: 6,
  lateralFast: 11,
  turnMargin: 8,
  turnTime: 1.2,
  // Backwards up to this speed is a creep (fine adjustment); held longer than backHold seconds,
  // "back" turns the flight round.
  creep: 1.2,
  backHold: 0.45,
  turnReach: 1,
  turnClimb: 1.2,
  tight: 3.4,
  wide: 7,
  trail: 3.4,
  // Seconds before an aircraft can release again.
  release: 0.25,
});

// The playable city in world metres: lot edges of the whole grid.
export function cityBounds(layout) {
  // A harbour's basins are laid out in metres, not lots.
  if (layout.harbour?.bounds) return { ...layout.harbour.bounds };
  const g = layout.grid || { minCol: 0, maxCol: layout.cols - 1, minRow: 0, maxRow: layout.rows - 1 };
  return {
    minX: (g.minCol - layout.cols / 2) * CITY.pitch,
    maxX: (g.maxCol + 1 - layout.cols / 2) * CITY.pitch,
    minZ: (g.minRow - layout.rows / 2) * CITY.pitch,
    maxZ: (g.maxRow + 1 - layout.rows / 2) * CITY.pitch,
  };
}

// Where the flight turns round for a layout: past the city edge by the turn margin.
export function turnPoint(layout) {
  const b = cityBounds(layout);
  return Math.max(-b.minX, b.maxX) + FLIGHT.turnMargin;
}

// How far north and south the flight's lane can go.
export function laneLimits(layout) {
  const b = cityBounds(layout);
  return { min: b.minZ + 2, max: b.maxZ - 2 };
}

// Walkers cover the wider streets (2.5) at a brisker pace, so every schedule keeps its timing.
export const WALK = Object.freeze({ speed: 4, run: 5.8, stair: 1 });
export const GRAVITY = -9.81;
export const STEP = 1 / 120;
// Speed kept by a Drill each time it punches through a slab.
export const DRILL_SLOWDOWN = 0.93;

export const BOMBS = Object.freeze({
  drill: {
    name: "Drill",
    model: "bomb-penetrator",
    color: 0xff8a2b,
    css: "#ff8a2b",
    radius: 2.9,
    breakRadius: 1.4,
    shipDamage: 2,
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
    shipDamage: 1,
    summary: "Bursts into eight bomblets above open ground or rooftops.",
  },
  shockwave: {
    name: "Shockwave",
    model: "bomb-blast",
    color: 0xff3b3b,
    css: "#ff5a4a",
    radius: 5.2,
    breakRadius: 3.2,
    shipDamage: 3,
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
    shipDamage: 3,
    summary: "Guided bomb. Locks the target nearest the pipper, even a moving truck.",
  },
  // Pattern bombs burst above the water into bomblets laid out in a shape the player can turn.
  // Each bomblet is small: where the pattern lies matters, and the pipper counts what it will hit.
  stick: {
    name: "Stick",
    model: "bomb-cluster",
    color: 0xffd23f,
    css: "#ffd23f",
    radius: 1.3,
    breakRadius: 0.8,
    burst: 6,
    pattern: "stick",
    shipDamage: 1,
    summary: "Five bombs in a line. Turn the line to lie along a column or a long hull.",
  },
  ell: {
    name: "L-Pattern",
    model: "bomb-cluster",
    color: 0x2fdc7a,
    css: "#2fdc7a",
    radius: 1.3,
    breakRadius: 0.8,
    burst: 6,
    pattern: "ell",
    shipDamage: 1,
    summary: "Seven bomblets in an L. Fits boats moored round the corner of a pier.",
  },
  yoke: {
    name: "U-Pattern",
    model: "bomb-cluster",
    color: 0xff6fb5,
    css: "#ff6fb5",
    radius: 1.3,
    breakRadius: 0.8,
    burst: 6,
    pattern: "yoke",
    shipDamage: 1,
    summary: "Bomblets in a U. Fits boats along three walls of a dock.",
  },
  ring: {
    name: "O-Ring",
    model: "bomb-cluster",
    color: 0x5b8cff,
    css: "#6f9bff",
    radius: 1.3,
    breakRadius: 0.8,
    burst: 6,
    pattern: "ring",
    shipDamage: 1,
    summary: "A ring of bomblets. Hits a circle of escorts and spares whatever sits inside it.",
  },
  box: {
    name: "Box",
    model: "bomb-cluster",
    color: 0xb6f23c,
    css: "#b6f23c",
    radius: 1.3,
    breakRadius: 0.8,
    burst: 6,
    pattern: "box",
    shipDamage: 1,
    summary: "A 3 x 2 block of bomblets. Covers boats rafted side by side.",
  },
});
export const BOMB_ORDER = ["drill", "scatter", "shockwave", "lance", "stick", "ell", "yoke", "ring", "box"];
export const isPattern = (kind) => Boolean(BOMBS[kind]?.pattern);

const P = (b, f, x = 0, z = 0) => ({ b, f, x, z });
const S = (x, z) => ({ x, z });

// Palette for facades: warm, saturated, and never beige.
const HUES = ["#e2704f", "#2fb3a6", "#f2b441", "#ff8a6b", "#6ec3f0", "#8fd64a"];
const GENERIC = ["Harbour Offices", "Ferry Flats", "Chandlery", "Net Lofts", "Pilot House", "Salt Store"];
const wrap = (n, m) => ((n % m) + m) % m;
const tower = (id, col, row, floors, opts = {}) => ({
  id,
  col,
  row,
  floors,
  name: GENERIC[wrap(col + row * 3, GENERIC.length)],
  kind: "tower",
  color: HUES[wrap(col * 2 + row * 3 + floors, HUES.length)],
  roof: [],
  ...opts,
});

export const CITY_MISSIONS = [
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
    aircraft: [{ callsign: "Kestrel One", crew: "iona", payload: { shockwave: 4 } }],
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
    aircraft: [{ callsign: "Kestrel One", crew: "iona", payload: { drill: 6 } }],
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
        rally: S(0, CITY.pitch / 2),
        at: 24,
        every: 64,
        stay: 20,
      },
      { kind: "post", at: P("T2", 6, -2.2, 1.8) },
      { kind: "post", at: P("T2", 6, 2.4, 1.2) },
      { kind: "post", at: P("T4", 2, 0.5, 0.5) },
    ],
    aircraft: [
      { callsign: "Kestrel One", crew: "iona", payload: { drill: 2, shockwave: 2 } },
      { callsign: "Kestrel Two", crew: "piper", payload: { scatter: 4 } },
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
        at: 16,
        every: 38,
        stay: 20,
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
      { callsign: "Kestrel One", crew: "iona", payload: { drill: 6 } },
      { callsign: "Kestrel Two", crew: "piper", payload: { scatter: 4 } },
      { callsign: "Kestrel Three", crew: "bram", payload: { shockwave: 4 } },
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
        rally: S(-CITY.pitch / 2, -2),
        at: 22,
        every: 54,
        stay: 20,
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
      { callsign: "Kestrel One", crew: "iona", payload: { drill: 6 } },
      { callsign: "Kestrel Two", crew: "piper", payload: { scatter: 4 } },
      { callsign: "Kestrel Three", crew: "bram", payload: { shockwave: 4 } },
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
      points: [S(-CITY.pitch / 2, -CITY.pitch / 2), S(CITY.pitch / 2, -CITY.pitch / 2), S(CITY.pitch / 2, CITY.pitch / 2), S(-CITY.pitch / 2, CITY.pitch / 2)],
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
        at: 36,
        every: 78,
        stay: 20,
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
        payload: { drill: 8, lance: 2 },
      },
      { callsign: "Kestrel Two", crew: "piper", payload: { scatter: 5 } },
      { callsign: "Kestrel Three", crew: "bram", payload: { shockwave: 5 } },
    ],
    par: 8,
    alert: 14,
  },
];

// ------------------------------------------------------------------ the wider city

// Each city mission's authored blocks sit in the middle of a district with three times as many
// buildings along a row and four times as many along a column (and one more row). The rest is
// generated, the same every time for a given mission. 2.6: it is low and open. Under half the
// lots hold a tower, of one to three storeys (a quarter of those next to the mission's blocks);
// the rest are low barracks, vehicle yards (some over tunnel entrances) and parks.
export const CITY_GROWTH = Object.freeze({ cols: 3, rows: 4, extraRows: 1 });
// Tunnel entrances in the yards next to each mission's own blocks, and the fighters already
// hiding in each (none in the first mission).
const TUNNELS = [0, 1, 1, 1, 2, 2];
export const GARRISON = 2;
// One-storey barracks with a crowd of fighters inside (2.6), beside each mission's blocks.
const BARRACKS = [0, 1, 1, 1, 2, 2];
export const BARRACKS_CREW = 5;
// Each crewed barracks is one more target for the par, so it brings two bombs (Shockwaves, or
// Drills where the mission carries no Shockwave): even on Crazy a mission keeps a bomb to spare.
const BARRACKS_BOMBS = 2;
// Street segments dug up for repairs: one lane of the asphalt (the street is 3.8 m wide, the
// walking line its centre), off the middle of the segment so a door's path to the street stays clear.
const ROADWORKS = 8;
export const WORKS = Object.freeze({ lane: 1.2, width: 1.3, length: 4.4, shift: 3.4, pavement: 3, cones: 2.4 });
// Early missions hit harder (blast radius) and their bombs home further onto a nearby target.
const POWER = [1.6, 1.5, 1.4, 1.3, 1.25, 1.2];
const ASSIST = [4.5, 4, 3.5, 3, 3, 2.5];

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function expandCity(layout, index) {
  const extraCols = layout.cols * (CITY_GROWTH.cols - 1),
    extraRows = layout.rows * (CITY_GROWTH.rows - 1) + CITY_GROWTH.extraRows;
  const grid = {
    minCol: -Math.floor(extraCols / 2),
    maxCol: layout.cols - 1 + Math.ceil(extraCols / 2),
    minRow: -Math.floor(extraRows / 2),
    maxRow: layout.rows - 1 + Math.ceil(extraRows / 2),
  };
  const random = seeded(4099 + index * 977);
  const buildings = [...layout.buildings],
    parks = [],
    yards = [];
  // Lots in the ring around the mission's own blocks, nearest first: tunnel yards go there.
  const ring = [];
  for (let row = grid.minRow; row <= grid.maxRow; row++)
    for (let col = grid.minCol; col <= grid.maxCol; col++) {
      if (col >= 0 && col < layout.cols && row >= 0 && row < layout.rows) continue;
      const out = Math.max(-col, col - (layout.cols - 1), -row, row - (layout.rows - 1), 0);
      if (out === 1 && (col < 0 || col >= layout.cols) !== (row < 0 || row >= layout.rows)) ring.push({ col, row });
    }
  const shuffled = ring.map((lot) => ({ ...lot, key: random() })).sort((a, b) => a.key - b.key);
  const tunnelCount = TUNNELS[index] ?? 1;
  const tunnels = new Set(shuffled.slice(0, tunnelCount).map((lot) => `${lot.col},${lot.row}`));
  const crewed = new Set(shuffled.slice(tunnelCount, tunnelCount + (BARRACKS[index] ?? 1)).map((lot) => `${lot.col},${lot.row}`));
  for (let row = grid.minRow; row <= grid.maxRow; row++)
    for (let col = grid.minCol; col <= grid.maxCol; col++) {
      if (col >= 0 && col < layout.cols && row >= 0 && row < layout.rows) continue;
      const key = `${col},${row}`;
      if (tunnels.has(key)) {
        yards.push({ col, row, tunnel: true });
        continue;
      }
      if (crewed.has(key)) {
        buildings.push(tower(`G${col}_${row}`, col, row, 1, { name: "Barracks", color: "#8f9a5b", roof: [], garrison: BARRACKS_CREW }));
        continue;
      }
      // Low and open: towers of one to three storeys, and next to the mission's blocks (where
      // the camera spends its time) mostly parks, yards and barracks.
      const near = ring.some((lot) => lot.col === col && lot.row === row);
      const [tall, low, yard] = near ? [0.25, 0.45, 0.75] : [0.45, 0.6, 0.8];
      const r = random();
      if (r < tall) {
        const floors = 1 + Math.floor(random() * 3);
        const roof = random() < 0.25 ? [random() < 0.5 ? "hvac" : "tank"] : [];
        buildings.push(tower(`C${col}_${row}`, col, row, floors, { roof }));
      } else if (r < low) buildings.push(tower(`B${col}_${row}`, col, row, 1, { name: "Barracks", color: "#8f9a5b", roof: [] }));
      else if (r < yard) yards.push({ col, row, tunnel: false });
      else parks.push({ col, row });
    }
  // A tunnel's entrance sits in its yard, on the side facing the mission's blocks.
  const tunnelList = yards
    .filter((y) => y.tunnel)
    .map((y, i) => {
      const c = lotCenter(layout, y.col, y.row);
      const toward = { x: -Math.sign(c.x) * (Math.abs(c.x) > (layout.cols * CITY.pitch) / 2 ? 1.2 : 0), z: -Math.sign(c.z) * (Math.abs(c.z) > (layout.rows * CITY.pitch) / 2 ? 1.2 : 0) };
      return { id: `tunnel${i}`, x: c.x + toward.x, z: c.z + toward.z, garrison: GARRISON };
    });
  // Road works: a dug-up lane on some inner street segments, with the digger on the pavement
  // beside it. Not on the convoy's loop, not beside a crewed barracks (its sandbags) or a tunnel
  // yard (fighters run in from the street), and one per segment.
  const roadworks = [];
  const busy = new Set([...buildings.filter((b) => b.garrison), ...yards.filter((y) => y.tunnel)].map((l) => `${l.col},${l.row}`));
  const loop = layout.convoy?.points || [];
  const onLoop = (x, z) =>
    loop.some((a, i) => {
      const b = loop[(i + 1) % loop.length];
      const t = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) / ((b.x - a.x) ** 2 + (b.z - a.z) ** 2 || 1)));
      return Math.hypot(x - a.x - t * (b.x - a.x), z - a.z - t * (b.z - a.z)) < 3;
    });
  const segments = new Set();
  for (let tries = 0; roadworks.length < ROADWORKS && tries < ROADWORKS * 20; tries++) {
    const across = random() < 0.5;
    // An inner line (a street between two rows of lots, or an avenue between two columns).
    const line = across ? grid.minRow + 1 + Math.floor(random() * (grid.maxRow - grid.minRow)) : grid.minCol + 1 + Math.floor(random() * (grid.maxCol - grid.minCol));
    const cell = across ? grid.minCol + Math.floor(random() * (grid.maxCol - grid.minCol + 1)) : grid.minRow + Math.floor(random() * (grid.maxRow - grid.minRow + 1));
    const side = random() < 0.5 ? -1 : 1;
    const shift = random() < 0.5 ? -1 : 1;
    const segment = `${across ? "s" : "a"}${line},${cell}`;
    if (segments.has(segment)) continue;
    // The lots on either side of the segment.
    const beside = across ? [`${cell},${line}`, `${cell},${line - 1}`] : [`${line},${cell}`, `${line - 1},${cell}`];
    if (beside.some((key) => busy.has(key))) continue;
    const c = across ? lotCenter(layout, cell, line) : lotCenter(layout, line, cell);
    // The street runs half a pitch north of (or west of) the lot centre.
    const work = across
      ? { x: c.x + shift * WORKS.shift, z: c.z - CITY.pitch / 2 + side * WORKS.lane, along: "x", side, shift }
      : { x: c.x - CITY.pitch / 2 + side * WORKS.lane, z: c.z + shift * WORKS.shift, along: "z", side, shift };
    if (onLoop(work.x, work.z)) continue;
    segments.add(segment);
    roadworks.push(work);
  }
  const crews = buildings.filter((b) => b.garrison).length;
  const kind = layout.aircraft.some((a) => a.payload.shockwave) ? "shockwave" : "drill";
  const carrier = layout.aircraft.findIndex((a) => a.payload[kind]);
  const aircraft = layout.aircraft.map((a, i) =>
    i === carrier && crews ? { ...a, payload: { ...a.payload, [kind]: a.payload[kind] + crews * BARRACKS_BOMBS } } : a,
  );
  return {
    ...layout,
    aircraft,
    grid,
    buildings,
    parks,
    yards,
    roadworks,
    tunnels: tunnelList,
    // Every garrisoned tunnel or barracks is one more target for the par.
    par: layout.par + tunnelList.filter((t) => t.garrison).length + crews,
    power: POWER[index] ?? 1.2,
    assist: ASSIST[index] ?? 2.5,
  };
}

export const STRIKE_MISSIONS = [
  ...CITY_MISSIONS.map((layout, i) => expandCity(layout, i)),
  // 1.7–1.9: the harbour strikes on the Front's flotilla.
  ...HARBOUR_MISSIONS.map((layout) => ({ ...layout, power: 1, assist: 2.5 })),
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

// Buildings are indexed by grid cell and carry their own blocks, so lookups in a big city only
// look at the buildings a point or segment can touch.
function indexBuildings(buildings) {
  const cells = new Map();
  for (const b of buildings)
    for (let cx = Math.floor(b.min[0] / CITY.pitch); cx <= Math.floor(b.max[0] / CITY.pitch); cx++)
      for (let cz = Math.floor(b.min[2] / CITY.pitch); cz <= Math.floor(b.max[2] / CITY.pitch); cz++) {
        const key = `${cx},${cz}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(b);
      }
  buildings.cells = cells;
  return buildings;
}

// Buildings whose cells overlap the box [x0, x1] × [z0, z1] (all of them for an unindexed list).
export function buildingsNear(buildings, x0, z0, x1, z1) {
  if (!buildings.cells) return buildings;
  const found = new Set();
  for (let cx = Math.floor(Math.min(x0, x1) / CITY.pitch); cx <= Math.floor(Math.max(x0, x1) / CITY.pitch); cx++)
    for (let cz = Math.floor(Math.min(z0, z1) / CITY.pitch); cz <= Math.floor(Math.max(z0, z1) / CITY.pitch); cz++)
      for (const b of buildings.cells.get(`${cx},${cz}`) || []) found.add(b);
  return [...found];
}

const blocksOf = (blocks, building) => building.blocks || blocks.filter((block) => block.b === building.index);

export function resolveBuildings(layout) {
  return indexBuildings(layout.buildings.map((b, index) => {
    // Harbour warehouses sit on the quays at explicit positions rather than on the lot grid.
    const c = b.x !== undefined ? { x: b.x, z: b.z } : lotCenter(layout, b.col, b.row);
    return {
      ...b,
      index,
      x: c.x,
      z: c.z,
      top: storyY(b.floors),
      min: [c.x - CITY.half, CITY.ground, c.z - CITY.half],
      max: [c.x + CITY.half, storyY(b.floors) + 0.05, c.z + CITY.half],
    };
  }));
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
    buildingsNear(buildings, x - margin, z - margin, x + margin, z + margin).find(
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
  for (const b of buildings) b.blocks = [];
  for (const block of blocks) buildings[block.b].blocks.push(block);
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

// A blast's distance to a box, heights counted in storeys (see STOREY_REACH).
export const boxDistance = (min, max, p) =>
  Math.hypot(
    Math.max(min[0] - p.x, 0, p.x - max[0]),
    Math.max(min[1] - p.y, 0, p.y - max[1]) * STOREY_REACH,
    Math.max(min[2] - p.z, 0, p.z - max[2]),
  );

export function blocksNear(blocks, p, radius) {
  return blocks.filter((b) => b.alive && boxDistance(b.min, b.max, p) < radius);
}

// All live blocks crossed by a segment, nearest first. Buildings prefilter the search.
export function blockHits(blocks, buildings, a, b) {
  const hits = [];
  for (const building of buildingsNear(buildings, Math.min(a.x, b.x) - 0.1, Math.min(a.z, b.z) - 0.1, Math.max(a.x, b.x) + 0.1, Math.max(a.z, b.z) + 0.1)) {
    if (segmentBox(a, b, building.min, building.max, 0.1) === null) continue;
    for (const block of blocksOf(blocks, building)) {
      if (!block.alive) continue;
      const t = segmentBox(a, b, block.min, block.max);
      if (t !== null) hits.push({ t, block });
    }
  }
  return hits.sort((x, y) => x.t - y.t);
}

// Line of sight for blast damage: walls and slabs shelter people unless they are broken.
const holds = (block, p, e = 1e-3) =>
  p.x >= block.min[0] - e && p.x <= block.max[0] + e &&
  p.y >= block.min[1] - e && p.y <= block.max[1] + e &&
  p.z >= block.min[2] - e && p.z <= block.max[2] + e;

export function lineBlocked(blocks, buildings, a, b) {
  for (const building of buildingsNear(buildings, Math.min(a.x, b.x) - 0.1, Math.min(a.z, b.z) - 0.1, Math.max(a.x, b.x) + 0.1, Math.max(a.z, b.z) + 0.1)) {
    if (segmentBox(a, b, building.min, building.max, 0.1) === null) continue;
    for (const block of blocksOf(blocks, building)) {
      if (!block.alive || holds(block, a) || holds(block, b)) continue;
      const t = segmentBox(a, b, block.min, block.max);
      if (t !== null && t < 0.999) return true;
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

// Ground height at a point: the city plate, or sea level off the quays of a harbour layout.
export function groundAt(land, x, z) {
  if (!land) return CITY.ground;
  return onLand(land, x, z) ? CITY.ground : WATER_LEVEL;
}

// Seconds a bomblet thrown from a burst at height h (vertical speed vy) takes to land.
export function bombletFall(vy, h) {
  return Math.max(0.25, (vy + Math.sqrt(vy * vy + 2 * -GRAVITY * Math.max(0.3, h))) / -GRAVITY);
}

// Continuously computed impact point. Drill forecasts report the floor that will detonate;
// every forecast reports `time`, the seconds from release until it lands.
// `opts.land` marks a harbour's quays (everything else is water); `opts.angle` turns a pattern.
export function forecastImpact(blocks, buildings, release, kind, floor = 1, opts = {}) {
  const land = opts.land || null;
  const state = { ...release };
  const points = [{ x: state.x, y: state.y, z: state.z }];
  let crossesShelter = false;
  const crossed = new Set();
  const def = BOMBS[kind];
  // Same step as the live simulation, so the pipper is exact even at building edges.
  const dt = STEP;
  for (let step = 0; step < 1200; step++) {
    const a = { x: state.x, y: state.y, z: state.z };
    stepBomb(state, dt);
    const b = { x: state.x, y: state.y, z: state.z };
    if (step % 8 === 0) points.push(b);
    if (kind === "scatter" || def.pattern) {
      const below = surfaceBelow(buildings, blocks, b.x, b.z, land);
      const hit = blockHits(blocks, buildings, a, b)[0];
      if (hit || b.y <= below + def.burst) {
        const burst = hit ? lerp3(a, b, hit.t) : b;
        // Measure the ground under the burst exactly as the live canister does.
        const ground = burstGround(buildings, blocks, burst, state, land);
        const centre = scatterCentre(burst, state, ground);
        points.push(burst);
        const surface = surfaceBelow(buildings, blocks, centre.x, centre.z, land);
        return {
          points,
          impact: { x: centre.x, y: surface, z: centre.z },
          burst,
          building: buildingAt(buildings, centre.x, centre.z),
          floor: null,
          angle: opts.angle || 0,
          time: (step + 1) * dt + bombletFall(state.vy * 0.8, burst.y - surface),
        };
      }
      continue;
    }
    if (kind === "drill") {
      for (const hit of blockHits(blocks, buildings, a, b)) {
        if (crossed.has(hit.block.id)) continue;
        crossed.add(hit.block.id);
        if (buildings[hit.block.b].kind === "shelter") crossesShelter = true;
        if (hit.block.kind === "slab" || hit.block.kind === "roof") state.vy *= DRILL_SLOWDOWN;
      }
      const building = buildingAt(buildings, b.x, b.z);
      if (building) {
        const target = Math.min(floor - 1, building.floors);
        const detonateY = target >= building.floors ? building.top : storyY(target) + DRILL_BURST;
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
            time: (step + 1) * dt,
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
          time: (step + 1) * dt,
        };
      }
    }
    const ground = groundAt(land, b.x, b.z);
    if (b.y <= ground) {
      const t = (a.y - ground) / Math.max(1e-6, a.y - b.y);
      const p = lerp3(a, b, t);
      points.push(p);
      return { points, impact: p, building: null, floor: 0, crossesShelter, time: (step + t) * dt };
    }
  }
  return { points, impact: points[points.length - 1], building: null, floor: 0, crossesShelter, time: 1200 * dt };
}

export function burstGround(buildings, blocks, point, velocity, land = null) {
  const below = surfaceBelow(buildings, blocks, point.x, point.z, land);
  if (point.y >= below - 0.05) return below;
  const len = Math.hypot(velocity.vx, velocity.vz) || 1;
  return surfaceBelow(buildings, blocks, point.x - (velocity.vx / len) * 0.6, point.z - (velocity.vz / len) * 0.6, land);
}

export function surfaceBelow(buildings, blocks, x, z, land = null) {
  const building = buildingAt(buildings, x, z);
  if (!building) return groundAt(land, x, z);
  let top = storyY(0);
  for (const block of blocksOf(blocks, building)) {
    if (
      block.alive &&
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

// One rule for both the pipper warning and the abort: a detonation breaks a shelter
// block, or lands within 45% of its blast radius of the shelter.
export function shelterStruck(blocks, buildings, point, kind, margin = 0, power = 1) {
  const def = kind === "bomblet" ? BOMBS.scatter : BOMBS[kind] || BOMBS.scatter;
  for (const b of buildings) {
    if (b.kind !== "shelter") continue;
    if (boxDistance(b.min, b.max, point) < def.radius * power * 0.45 + margin) return true;
    for (const block of blocksOf(blocks, b)) {
      if (!block.alive) continue;
      const limit = (block.kind === "glass" ? def.breakRadius * 1.5 : def.breakRadius) + margin;
      if (boxDistance(block.min, block.max, point) < limit) return true;
    }
  }
  return false;
}

// Predicted detonation points for a forecast, used for the shelter warning.
export function forecastPoints(forecast) {
  if (forecast.kind === "scatter")
    return scatterPattern(forecast.impact).map((p) => ({ x: p.x, y: forecast.impact.y + 0.2, z: p.z, kind: "bomblet" }));
  const pattern = BOMBS[forecast.kind]?.pattern;
  if (pattern)
    return patternPoints(pattern, forecast.impact, forecast.angle || 0).map((p) => ({
      x: p.x,
      y: forecast.impact.y + 0.2,
      z: p.z,
      kind: forecast.kind,
    }));
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
