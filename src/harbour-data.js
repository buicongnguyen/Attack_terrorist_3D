// Chapter 1 harbour strikes: ship classes, pattern shapes, fleet formations and hit rules.
// Everything here is deterministic and free of Three.js so it can be unit tested.

// Ship hulls are segments along their heading: a blast reaches a ship when it lands within
// its radius of the hull line plus half the beam.
export const SHIPS = Object.freeze({
  patrol: { name: "Patrol boat", model: "patrol-boat", hp: 1, length: 4.4, beam: 1.4, evade: 0.5, score: 150 },
  missile: { name: "Missile boat", model: "missile-boat", hp: 2, length: 5.8, beam: 1.7, evade: 0.45, score: 250 },
  frigate: {
    name: "AA frigate",
    model: "frigate",
    hp: 3,
    length: 8.4,
    beam: 2.2,
    evade: 0.35,
    score: 450,
    flak: { f: -2.4, y: 2.2 },
  },
  destroyer: {
    name: "Destroyer Cinder",
    model: "destroyer",
    hp: 5,
    length: 12,
    beam: 2.6,
    evade: 0.25,
    score: 1000,
    flak: { f: -3.6, y: 2.8 },
  },
  // Fast raiders: the Front's small attack craft, drawn as a scaled-down river skiff.
  raider: { name: "Raider", model: "skiff", scale: 0.75, hp: 1, length: 3.5, beam: 1.25, evade: 0.55, score: 100 },
  ferry: { name: "Island Belle", model: "ferry", hp: 1, length: 7.2, beam: 2.6, evade: 0, score: 0, civilian: true },
  // The harbour's pilot launch: a small civilian boat, drawn as a scaled-down ferry.
  launch: { name: "Pilot launch", model: "ferry", scale: 0.6, hp: 1, length: 4.3, beam: 1.6, evade: 0, score: 0, civilian: true },
});

// Blasts only count against ships when they land at sea level, not on a quay roof.
export const WATER_LEVEL = 0.05;
export const DECK_REACH = 2.5;

export const PATTERN_SPACING = 2.8;
export const RING_RADIUS = 7.5;
export const ROTATION_STEP = Math.PI / 4;
// Holds this long mean "stays here for the whole mission".
export const PERMANENT = 1e5;

// Bomblet layouts in grid cells (x right, z down the screen at 0°), centred on the pipper, and
// the order the outline is drawn in. The ring is authored in metres.
const ringCells = Array.from({ length: 12 }, (_, i) => [
  (Math.cos((i / 12) * Math.PI * 2) * RING_RADIUS) / PATTERN_SPACING,
  (Math.sin((i / 12) * Math.PI * 2) * RING_RADIUS) / PATTERN_SPACING,
]);
export const SHAPES = Object.freeze({
  stick: { cells: [[-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0]], closed: false },
  // The L's arms are four bomblets long (corner shared), so each arm can hit two moored hulls twice.
  ell: { cells: [[-1.5, -1.5], [-1.5, -0.5], [-1.5, 0.5], [-1.5, 1.5], [-0.5, 1.5], [0.5, 1.5], [1.5, 1.5]], closed: false },
  yoke: { cells: [[-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1]], closed: false },
  ring: { cells: ringCells, closed: true },
  box: { cells: [[-1, -0.5], [0, -0.5], [1, -0.5], [1, 0.5], [0, 0.5], [-1, 0.5]], closed: true },
});

// World points of a pattern centred on `centre` and turned by `angle` (clockwise on screen).
export function patternPoints(shape, centre, angle = 0) {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  return SHAPES[shape].cells.map(([gx, gz]) => {
    const x = gx * PATTERN_SPACING,
      z = gz * PATTERN_SPACING;
    return { x: centre.x + x * c - z * s, z: centre.z + x * s + z * c };
  });
}

// Pattern shapes, in unit cells, for the HUD's little diagram.
export function patternDiagram(shape, angle = 0) {
  return patternPoints(shape, { x: 0, z: 0 }, angle).map((p) => ({ x: p.x / PATTERN_SPACING, z: p.z / PATTERN_SPACING }));
}

// ------------------------------------------------------------------ hulls

export function hullDistance(pose, length, point) {
  const fx = Math.cos(pose.heading),
    fz = Math.sin(pose.heading);
  const dx = point.x - pose.x,
    dz = point.z - pose.z;
  const along = Math.max(-length / 2, Math.min(length / 2, dx * fx + dz * fz));
  return Math.hypot(dx - fx * along, dz - fz * along);
}

export function shipReach(cls, radius) {
  return radius + SHIPS[cls].beam / 2;
}

// How many of `points` (each a blast of `radius`) land on a ship at `pose`.
export function hullHits(cls, pose, points, radius) {
  const reach = shipReach(cls, radius);
  const length = SHIPS[cls].length;
  return points.filter((p) => hullDistance(pose, length, p) < reach).length;
}

// Civilians are flagged a little before a blast would actually reach them, like the city shelter.
export const CIVILIAN_MARGIN = 0.4;

// Once bombs are away, a ship the pattern would catch waits REACTION seconds, then sidesteps
// straight away from the nearest bomblet at its class's evade speed until they land. The
// forecast applies the same sidestep, so the pipper's count is what actually happens.
export const REACTION = 0.8;
export const DODGE_LIMIT = 4;
export function evasion(cls, pose, points, radius, fall) {
  const def = SHIPS[cls];
  if (!def.evade || def.civilian || !points.length) return null;
  let best = null;
  for (const p of points) {
    const d = hullDistance(pose, def.length, p);
    if (!best || d < best.d) best = { d, p };
  }
  if (best.d > shipReach(cls, radius) + 1.2) return null;
  let dx = pose.x - best.p.x,
    dz = pose.z - best.p.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) {
    // Right under a bomblet: step off abeam.
    dx = -Math.sin(pose.heading);
    dz = Math.cos(pose.heading);
  } else {
    dx /= len;
    dz /= len;
  }
  return { dx, dz, distance: Math.min(DODGE_LIMIT, def.evade * Math.max(0, fall - REACTION)) };
}

// Forecast outcome for a pattern: which ships it hits and which it sinks. `ships` is a list
// of { cls, pose, hp, moored }; `damage` is what each bomblet deals. With `fall` (seconds
// until the bombs land), ships that can sidestep are moved first, exactly as they will.
export function predictHits(ships, points, radius, damage = 1, fall = 0) {
  const out = { hits: 0, sinks: 0, civilian: false, ships: [] };
  for (const ship of ships) {
    if (SHIPS[ship.cls].civilian) {
      if (hullHits(ship.cls, ship.pose, points, radius + CIVILIAN_MARGIN)) out.civilian = ship.name || SHIPS[ship.cls].name;
      continue;
    }
    let pose = ship.pose;
    const dodge = fall && !ship.moored ? evasion(ship.cls, pose, points, radius, fall) : null;
    if (dodge) pose = { ...pose, x: pose.x + dodge.dx * dodge.distance, z: pose.z + dodge.dz * dodge.distance };
    const n = hullHits(ship.cls, pose, points, radius);
    if (!n) continue;
    const sinks = n * damage >= ship.hp;
    out.hits++;
    if (sinks) out.sinks++;
    out.ships.push({ ship, hits: n, sinks });
  }
  return out;
}

// ------------------------------------------------------------------ formations

const rad = (deg) => (deg * Math.PI) / 180;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Formation slot for ship `i` of `n`, as forward/lateral metres in the group's own frame.
// Columns leave a clear gap between the longest hull's bow and the next one's stern.
function slot(formation, i, n, length = 4.4) {
  const k = i - (n - 1) / 2;
  switch (formation) {
    case "column":
      return { f: -k * (length + 1.6), l: 0 };
    case "line":
      return { f: 0, l: k * 2.8 };
    case "echelon":
      return { f: -k * 3.4, l: k * 2.6 };
    case "raft":
      return { f: 0, l: k * 1.9 };
    default:
      return { f: 0, l: 0 };
  }
}

// Where ship `i` sits at a station, in world metres, plus the heading it holds there.
function stationPose(station, i, n, time) {
  const theta = rad(station.heading ?? 0);
  if (station.slots) {
    const s = station.slots[i % station.slots.length];
    return { x: s.x, z: s.z, heading: rad(s.heading ?? station.heading ?? 0) };
  }
  if (station.formation === "ring") {
    // Escorts circle their charge; the ring turns at `station.orbit` metres per second.
    const radius = station.radius ?? RING_RADIUS;
    const a = (i / n) * Math.PI * 2 + ((station.orbit ?? 1) / radius) * time;
    return {
      x: station.x + Math.cos(a) * radius,
      z: station.z + Math.sin(a) * radius,
      heading: a + Math.PI / 2,
    };
  }
  const { f, l } = slot(station.formation, i, n, station.length);
  const fx = Math.cos(theta),
    fz = Math.sin(theta);
  return { x: station.x + f * fx - l * fz, z: station.z + f * fz + l * fx, heading: theta };
}

// Column slots are spaced by the group's longest hull.
function sized(group, station) {
  if (station.formation !== "column") return station;
  return { ...station, length: Math.max(...group.ships.map((cls) => SHIPS[cls].length)) };
}

// A group's timetable: it holds at each station, then sails to the next at `speed`. A leg lasts
// long enough for the ship with the furthest to go, so reshaping never turns into a sprint.
export function fleetPlan(group) {
  const stations = group.stations;
  const n = group.ships.length;
  const segments = [];
  let t = 0;
  stations.forEach((s, i) => {
    segments.push({ type: "hold", station: i, t0: t, t1: t + s.hold });
    t += s.hold;
    if (stations.length > 1) {
      const next = stations[(i + 1) % stations.length];
      let furthest = 0;
      for (let k = 0; k < n; k++) {
        const a = stationPose(sized(group, s), k, n, 0),
          b = stationPose(sized(group, next), k, n, 0);
        furthest = Math.max(furthest, Math.hypot(b.x - a.x, b.z - a.z));
      }
      const travel = Math.max(5, (furthest * 1.5) / (group.speed || 1));
      segments.push({ type: "leg", from: i, to: (i + 1) % stations.length, t0: t, t1: t + travel });
      t += travel;
    }
  });
  return { segments, period: Math.max(t, 1e-6) };
}

const ease = (u) => u * u * (3 - 2 * u);

// Pose of ship `i` of a group at absolute `time`. Legs blend each ship from its slot at one
// station to its slot at the next, so formations change shape while they sail.
export function shipPose(group, i, time, plan = fleetPlan(group)) {
  const n = group.ships.length;
  const at = (s) => sized(group, s);
  const local = (((time - (group.start ?? 0)) % plan.period) + plan.period) % plan.period;
  const seg = plan.segments.find((s) => local >= s.t0 && local < s.t1) || plan.segments[plan.segments.length - 1];
  if (seg.type === "hold") {
    const station = group.stations[seg.station];
    return { ...stationPose(at(station), i, n, time), station: seg.station, holding: true, moored: Boolean(station.moored) };
  }
  const raw = Math.min(1, Math.max(0, (local - seg.t0) / (seg.t1 - seg.t0)));
  const u = ease(raw);
  const a = stationPose(at(group.stations[seg.from]), i, n, time),
    b = stationPose(at(group.stations[seg.to]), i, n, time);
  // Turn from the station heading onto the course in the first fifth of the leg, hold it, and
  // turn onto the next station's heading in the last fifth: continuous, so hulls never snap.
  const chord = Math.hypot(b.x - a.x, b.z - a.z);
  const course = chord > 0.3 ? Math.atan2(b.z - a.z, b.x - a.x) : null;
  let heading;
  if (course === null) heading = a.heading + wrap(b.heading - a.heading) * u;
  else if (raw < 0.2) heading = a.heading + wrap(course - a.heading) * ease(raw / 0.2);
  else if (raw > 0.8) heading = course + wrap(b.heading - course) * ease((raw - 0.8) / 0.2);
  else heading = course;
  return {
    x: a.x + (b.x - a.x) * u,
    z: a.z + (b.z - a.z) * u,
    heading,
    station: null,
    holding: false,
    moored: false,
    moving: course !== null,
  };
}

// One pose model for the forecast and the live ships (kept as a separate name for callers).
export const shipCourse = shipPose;

// Countdown for a labelled station: time left while the group holds there, or until it arrives.
export function stationStatus(group, stationIndex, time, plan = fleetPlan(group)) {
  // A station the group never leaves (moored boats, the escort ring) is always on.
  if (group.stations[stationIndex].hold >= PERMANENT) return { active: true, remaining: Infinity, next: 0 };
  const local = (((time - (group.start ?? 0)) % plan.period) + plan.period) % plan.period;
  const hold = plan.segments.find((s) => s.type === "hold" && s.station === stationIndex);
  if (local >= hold.t0 && local < hold.t1) return { active: true, remaining: hold.t1 - local, next: 0 };
  const next = hold.t0 >= local ? hold.t0 - local : plan.period - local + hold.t0;
  return { active: false, remaining: 0, next };
}

// ------------------------------------------------------------------ missions

// Harbour quays and piers are land rectangles [x0, z0, x1, z1]; everything else is water.
export function onLand(land, x, z) {
  return Boolean(land?.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1));
}

const warehouse = (id, x, z, floors, name, color) => ({
  id,
  col: 0,
  row: 0,
  x,
  z,
  floors,
  name,
  kind: "tower",
  color,
  roof: floors > 1 ? ["hvac"] : [],
});

const NORTH_QUAY = [-27, -27, 27, -16];

// 2.4: each harbour gains a west and an east basin, so the flotilla is 30-odd boats strong.
// The quay runs the whole width; piers from it divide the basins, and the south moles close them
// (the mouth stays in the middle basin). The camera slides over the basins like the city's.
const WIDE_COLS = 10;
function widen(harbour, extra = {}) {
  return {
    ...harbour,
    wide: true,
    // The basins in metres (the lot pitch is the city's business). 2.5: five inner basins along a
    // 270 m quay, and the outer roads south of the moles, twice the old length and width.
    bounds: { minX: -135, maxX: 135, minZ: -20.25, maxZ: 74 },
    land: [
      [-135, -27, 135, -16],
      ...harbour.land.filter((l) => l !== NORTH_QUAY),
      [-30, -16, -27, 2],
      [27, -16, 30, 2],
      [-70, -16, -67, 2],
      [67, -16, 70, 2],
      [-142, -27, -135, 81],
      [135, -27, 142, 81],
      [-67, 21, -27, 27],
      [27, 21, 67, 27],
      [-135, 21, -67, 27],
      [67, 21, 135, 27],
      [-135, 75, 135, 81],
      // Fuel-depot pontoons in the far-west basin.
      [-126, -5.6, -107, -4.4],
      [-126, 2.4, -107, 3.6],
      ...(extra.land || []),
    ],
    cranes: [
      ...(harbour.cranes || []),
      { x: -48, z: -18.5, heading: 90 },
      { x: 46, z: -18.5, heading: 90 },
      { x: -100, z: -18.5, heading: 90 },
      { x: 104, z: -18.5, heading: 90 },
    ],
    containers: [
      ...(harbour.containers || []),
      { x: -60, z: -21 },
      { x: -38, z: -22 },
      { x: 36, z: -22 },
      { x: 58, z: -20.5 },
      { x: -118, z: -21.5 },
      { x: -84, z: -22 },
      { x: 88, z: -21 },
      { x: 124, z: -22 },
    ],
    buoys: [...(harbour.buoys || []), { x: -90, z: 40 }, { x: 30, z: 38 }, { x: 110, z: 70 }, ...(extra.buoys || [])],
  };
}
const quayShed = (id, x, name, color, floors = 1) => warehouse(id, x, -21.5, floors, name, color);
// Explicit moored slots: [x, z, heading in degrees].
const berths = (list) => list.map(([x, z, heading]) => ({ x, z, heading }));
const moor = (x, z, label, place, slots) => ({ x, z, moored: true, hold: 1e6, label, place, slots: berths(slots) });
const raiders = (n) => Array(n).fill("raider");

// The rest of the Front's flotilla (2.5), in every harbour mission: the far-west fuel depot and
// far-east repair yard, and the outer roads beyond the moles.
const OUTER_FLEET = [
  {
    // Three rows of five raiders at the depot pontoons: a Stick across a row sinks all five.
    id: "depotRows",
    ships: raiders(15),
    stations: [
      moor(-116, -1, "FUEL DEPOT", "FAR WEST BASIN", [
        [-122, -9, 90], [-119.2, -9, 90], [-116.4, -9, 90], [-113.6, -9, 90], [-110.8, -9, 90],
        [-122, -1, 90], [-119.2, -1, 90], [-116.4, -1, 90], [-113.6, -1, 90], [-110.8, -1, 90],
        [-122, 7, 90], [-119.2, 7, 90], [-116.4, 7, 90], [-113.6, 7, 90], [-110.8, 7, 90],
      ]),
    ],
  },
  {
    id: "depotColumn",
    ships: ["patrol", "patrol", "patrol", "patrol"],
    speed: 1.1,
    start: 5,
    stations: [
      { x: -92, z: 0, heading: 90, formation: "column", hold: 20, label: "DEPOT PATROL", place: "FAR WEST BASIN" },
      { x: -92, z: 6, heading: 45, formation: "column", hold: 16 },
    ],
  },
  {
    id: "yardRaftA",
    ships: raiders(5),
    stations: [{ x: 84, z: -8, heading: 90, formation: "raft", moored: true, hold: 1e6, label: "REPAIR YARD", place: "FAR EAST BASIN" }],
  },
  {
    id: "yardRaftB",
    ships: raiders(5),
    stations: [{ x: 84, z: 6, heading: 90, formation: "raft", moored: true, hold: 1e6 }],
  },
  {
    // Two frigates at anchor: a Stick laid along each hull.
    id: "yardFrigates",
    ships: ["frigate", "frigate"],
    stations: [
      {
        x: 112,
        z: 1,
        hold: 1e6,
        label: "FRIGATES AT ANCHOR",
        place: "FAR EAST BASIN",
        slots: berths([
          [112, -6, 0],
          [112, 8, 0],
        ]),
      },
    ],
  },
  {
    id: "yardLine",
    ships: raiders(5),
    stations: [{ x: 100, z: 14, heading: 0, formation: "line", hold: 1e6 }],
  },
  {
    // A missile-boat convoy steaming up and down the outer roads.
    id: "convoy",
    ships: ["missile", "missile", "missile", "missile", "missile"],
    speed: 1.2,
    start: 0,
    stations: [
      { x: -100, z: 45, heading: 0, formation: "column", hold: 18, label: "CONVOY", place: "OUTER ROADS" },
      { x: -60, z: 45, heading: 0, formation: "column", hold: 18 },
    ],
  },
  {
    id: "roadsLine",
    ships: raiders(5),
    stations: [{ x: -60, z: 64, heading: 0, formation: "line", hold: 1e6 }],
  },
  {
    id: "roadsEchelon",
    ships: ["missile", "missile", "missile", "missile"],
    stations: [{ x: 0, z: 52, heading: 0, formation: "echelon", hold: 1e6, label: "MISSILE BOATS", place: "OUTER ROADS" }],
  },
  {
    id: "roadsRing",
    ships: raiders(8),
    stations: [{ x: 70, z: 50, formation: "ring", orbit: 0.9, hold: 1e6, label: "RAIDER RING", place: "OUTER ROADS" }],
  },
  {
    id: "roadsRaft",
    ships: raiders(5),
    stations: [{ x: 104, z: 38, heading: 90, formation: "raft", moored: true, hold: 1e6 }],
  },
  {
    id: "roadsPatrol",
    ships: ["patrol", "patrol", "patrol", "patrol"],
    stations: [{ x: 104, z: 62, heading: 90, formation: "line", hold: 1e6 }],
  },
];

export const HARBOUR_MISSIONS = [
  {
    // 1.7 Harbour Mouth: a patrol column waits in the diagonal channel, then wheels south for the mouth.
    // Teaches the Stick and its angle.
    lesson: "stick",
    select: "stick",
    cols: WIDE_COLS,
    rows: 3,
    harbour: widen({
      land: [NORTH_QUAY, [-27, 21, 11, 27]],
      // Channel buoys alternate sides of the diagonal the column waits on.
      buoys: [
        { x: -9.2, z: -12.2 },
        { x: -5.7, z: 1.3 },
        { x: 7.7, z: 4.7 },
        { x: 11.2, z: 18.2 },
      ],
      cranes: [{ x: -4, z: -18.5, heading: 90 }, { x: 18, z: -18.5, heading: 90 }],
      containers: [{ x: -21, z: -19 }, { x: 11, z: -22 }],
      mouth: { x: 19, z: 24 },
    }, {
      // Boatyard pontoons between the raider rows in the west basin.
      land: [
        [-62, -6.2, -50, -4.8],
        [-62, 0.8, -50, 2.2],
      ],
      buoys: [
        { x: -44, z: 16 },
        { x: 34, z: 17 },
        { x: 62, z: -12 },
      ],
    }),
    buildings: [
      warehouse("W1", -14, -21.5, 2, "Net Store", "#e2704f"),
      warehouse("W2", 4, -21.5, 1, "Customs Shed", "#2fb3a6"),
      quayShed("W3", -56, "Boat Shed", "#ffc62b", 2),
      quayShed("W4", 50, "Chandlery", "#b04cff"),
    ],
    plazas: [],
    masts: [],
    aa: [],
    groups: [],
    fleet: [
      {
        id: "column",
        ships: ["patrol", "patrol", "patrol", "patrol"],
        speed: 1.3,
        start: 0,
        stations: [
          {
            x: 1,
            z: 3,
            heading: 45,
            formation: "column",
            hold: 22,
            label: "COLUMN AT THE BUOYS",
            place: "MAIN CHANNEL",
          },
          // The column wheels south for the mouth: the same Stick, a different angle.
          { x: 15, z: 7, heading: 90, formation: "column", hold: 16, label: "COLUMN TURNS SOUTH", place: "HARBOUR MOUTH" },
        ],
      },
      {
        id: "moored",
        ships: ["missile", "missile"],
        stations: [
          {
            x: -10,
            z: -14.6,
            heading: 0,
            moored: true,
            hold: 1e6,
            slots: [
              { x: -13.3, z: -14.6, heading: 0 },
              { x: -6.6, z: -14.6, heading: 0 },
            ],
          },
        ],
      },
      {
        // West basin: raiders moored abreast in three rows at the boatyard. A Stick laid across a
        // row sinks all four.
        id: "boatyard",
        ships: raiders(12),
        stations: [
          moor(-56, -2, "RAIDERS AT THE BOATYARD", "WEST BASIN", [
            [-60.2, -9, 90], [-57.4, -9, 90], [-54.6, -9, 90], [-51.8, -9, 90],
            [-60.2, -2, 90], [-57.4, -2, 90], [-54.6, -2, 90], [-51.8, -2, 90],
            [-60.2, 5, 90], [-57.4, 5, 90], [-54.6, 5, 90], [-51.8, 5, 90],
          ]),
        ],
      },
      {
        // A raider column runs up and down the west basin, then wheels onto the diagonal.
        id: "westColumn",
        ships: raiders(4),
        speed: 1.2,
        start: 4,
        stations: [
          { x: -39, z: 2, heading: 90, formation: "column", hold: 20, label: "RAIDER COLUMN", place: "WEST BASIN" },
          { x: -39, z: 4, heading: 45, formation: "column", hold: 16, label: "COLUMN WHEELS", place: "WEST BASIN" },
        ],
      },
      {
        // East anchorage: two lines abreast, up and down the screen, riding at anchor. (Raiders
        // abreast are too close to turn onto a course without touching.)
        id: "lineA",
        ships: raiders(5),
        stations: [{ x: 40, z: -2, heading: 0, formation: "line", hold: 1e6, label: "RAIDERS ABREAST", place: "EAST ANCHORAGE" }],
      },
      {
        id: "lineB",
        ships: raiders(5),
        stations: [{ x: 52, z: 6, heading: 0, formation: "line", hold: 1e6, label: "SECOND LINE", place: "EAST ANCHORAGE" }],
      },
      {
        id: "echelon",
        ships: ["patrol", "patrol", "patrol", "patrol"],
        stations: [{ x: 62, z: 12, heading: 90, formation: "echelon", hold: 1e6, label: "PATROL ECHELON", place: "EAST MOLE" }],
      },
      ...OUTER_FLEET,
    ],
    aircraft: [
      { callsign: "Kestrel One", crew: "iona", payload: { stick: 9 } },
      { callsign: "Kestrel Two", crew: "piper", payload: { stick: 8 } },
    ],
    // Sink 40 of the 103 boats, the channel column among them; the rest run for the open sea.
    quota: 40,
    required: ["column"],
    par: 8,
    alert: 0,
    startLane: -10,
  },
  {
    // 1.8 Dry Dock: boats moored along an L-shaped pier and inside a U-shaped dry dock; a
    // flak frigate at anchor and a civilian ferry crossing. Teaches the L and U shapes.
    lesson: "shapes",
    select: "ell",
    cols: WIDE_COLS,
    rows: 3,
    harbour: widen({
      land: [
        NORTH_QUAY,
        [-16.5, -16, -13, 5.5],
        [-16.5, 2, 1, 5.5],
        [3, -16, 6, -1],
        [18, -16, 21, -1],
        [-27, 22, 9, 27],
      ],
      dock: { x0: 6, z0: -16, x1: 18, z1: -1 },
      buoys: [
        { x: 12, z: 3 },
        { x: 20, z: 21 },
      ],
      cranes: [{ x: 12, z: -19, heading: 90 }, { x: -15, z: -19, heading: 90 }],
      containers: [{ x: -22, z: -21 }, { x: -5, z: -20 }, { x: 0, z: 23.5 }],
      mouth: { x: 18, z: 24 },
    }, {
      land: [
        // West slipway: an L pontoon with raiders moored inside the corner.
        [-62, -12, -59, 4],
        [-62, 4, -46, 7],
        // East slipway, the same L turned half round.
        [59, -4, 62, 12],
        [46, -7, 62, -4],
        // A U-shaped slip cut into the east quay.
        [32, -16, 34, -4],
        [42, -16, 44, -4],
      ],
      buoys: [
        { x: -40, z: 17 },
        { x: 52, z: 16 },
      ],
    }),
    buildings: [
      warehouse("W1", 23, -21.5, 1, "Pump House", "#f2b441"),
      quayShed("W2", -50, "Slipway Shed", "#e2704f", 2),
      quayShed("W3", 54, "Rigging Loft", "#2fb3a6"),
    ],
    plazas: [],
    masts: [],
    aa: [],
    groups: [],
    fleet: [
      {
        // Missile boats moored along the inside of the L, two on each arm: each takes two hits,
        // which only the L's long arms deliver to all four at once.
        id: "lpier",
        ships: ["missile", "missile", "missile", "missile"],
        stations: [
          {
            x: -9,
            z: -2,
            moored: true,
            hold: 1e6,
            label: "BOATS ON THE L PIER",
            place: "FITTING-OUT PIER",
            slots: [
              { x: -11.9, z: -7.5, heading: 90 },
              { x: -11.9, z: -1.3, heading: 90 },
              { x: -7.7, z: 0.8, heading: 0 },
              { x: -1.6, z: 0.8, heading: 0 },
            ],
          },
        ],
      },
      {
        // Inside the dry dock: one against each wall, and the pilot launch tied up in the open end.
        id: "dock",
        ships: ["missile", "patrol", "patrol"],
        stations: [
          {
            x: 12,
            z: -9,
            moored: true,
            hold: 1e6,
            label: "BOATS IN THE DRY DOCK",
            place: "DRY DOCK",
            slots: [
              { x: 12, z: -14.7, heading: 0 },
              { x: 7.4, z: -9.4, heading: 90 },
              { x: 16.6, z: -9.4, heading: 90 },
            ],
          },
        ],
      },
      {
        // Civilian: only a U that opens toward it clears the dock without touching it.
        id: "launch",
        ships: ["launch"],
        stations: [{ x: 12, z: -3.4, moored: true, hold: 1e6, slots: [{ x: 12, z: -3.4, heading: 0 }] }],
      },
      {
        id: "frigate",
        ships: ["frigate"],
        speed: 1,
        start: 8,
        stations: [
          { x: -8, z: 14, heading: 0, hold: 18, label: "FRIGATE AT ANCHOR", place: "SOUTH ROADS" },
          { x: 10, z: 15, heading: 0, hold: 14 },
        ],
      },
      {
        id: "ferry",
        ships: ["ferry"],
        speed: 0.9,
        start: 0,
        stations: [
          { x: 22, z: 10, heading: 180, hold: 10 },
          { x: -20, z: 11, heading: 180, hold: 10 },
        ],
      },
      {
        id: "westSlip",
        ships: raiders(5),
        stations: [
          moor(-55, -3, "RAIDERS ON THE SLIPWAY", "WEST BASIN", [
            [-57, -8, 90], [-57, -4, 90], [-57, 0, 90], [-53, 2, 0], [-49, 2, 0],
          ]),
        ],
      },
      {
        id: "westColumn",
        ships: raiders(4),
        speed: 1.2,
        start: 6,
        stations: [
          { x: -38, z: 0, heading: 90, formation: "column", hold: 18, label: "RAIDER COLUMN", place: "WEST BASIN" },
          { x: -38, z: 8, heading: 45, formation: "column", hold: 16, label: "COLUMN WHEELS", place: "WEST BASIN" },
        ],
      },
      {
        id: "eastSlip",
        ships: raiders(5),
        stations: [
          moor(55, 3, "RAIDERS ON THE EAST SLIP", "EAST BASIN", [
            [57, 8, 90], [57, 4, 90], [57, 0, 90], [53, -2, 0], [49, -2, 0],
          ]),
        ],
      },
      {
        // Three walls of the east slip: a U with its open end to the south.
        id: "eastDock",
        ships: raiders(5),
        stations: [
          moor(38, -9, "RAIDERS IN THE SLIP", "EAST QUAY", [
            [35.2, -11, 90], [35.2, -7, 90], [40.8, -11, 90], [40.8, -7, 90], [38, -13.6, 0],
          ]),
        ],
      },
      {
        id: "eastLine",
        ships: raiders(5),
        stations: [{ x: 38, z: 10, heading: 0, formation: "line", hold: 1e6, label: "RAIDERS ABREAST", place: "EAST ROADS" }],
      },
      ...OUTER_FLEET,
    ],
    aircraft: [
      { callsign: "Kestrel One", crew: "iona", payload: { ell: 5, stick: 4 } },
      { callsign: "Kestrel Two", crew: "piper", payload: { yoke: 4, stick: 3 } },
    ],
    quota: 36,
    required: ["frigate"],
    par: 7,
    alert: 0,
    startLane: 0,
  },
  {
    // 1.9 The Ring: escorts circle the seized ferry, missile boats lie rafted at the fuel pier,
    // and the destroyer Cinder runs for the mouth. O-Ring, Box, and the Stick along a long hull.
    lesson: "ring",
    select: "ring",
    cols: WIDE_COLS,
    rows: 3,
    harbour: widen({
      land: [NORTH_QUAY, [15, -16, 18.5, 2], [-27, 22, 9, 27]],
      buoys: [
        { x: 4, z: 12 },
        { x: 14, z: 19 },
        { x: 21, z: 23 },
      ],
      cranes: [{ x: 16.8, z: -19, heading: 90 }, { x: -18, z: -19, heading: 90 }],
      containers: [{ x: -7, z: -20.5 }, { x: 22.5, z: -22 }, { x: -3, z: 23.5 }],
      mouth: { x: 18, z: 24 },
    }, {
      land: [
        // West pontoon between two rafts of raiders; an east pontoon above a third.
        [-62, -1, -50, 1],
        [48, -12.6, 60, -11.2],
      ],
      buoys: [
        { x: -58, z: 16 },
        { x: 40, z: -12 },
      ],
    }),
    buildings: [
      warehouse("W1", -18, -21.5, 2, "Fuel Office", "#ff8a6b"),
      warehouse("W2", 3, -21.5, 1, "Harbourmaster", "#6ec3f0"),
      quayShed("W3", -45, "Net Loft", "#ffc62b"),
      quayShed("W4", 52, "Ice House", "#6ec3f0", 2),
    ],
    plazas: [],
    masts: [],
    aa: [],
    groups: [],
    fleet: [
      {
        id: "ferry",
        ships: ["ferry"],
        stations: [{ x: -9, z: 8.5, heading: 0, hold: 1e6 }],
        // Once its escorts are gone the ferry is free and steams clear to the west roads,
        // away from Cinder's anchorage and the frigate's beat.
        freed: { after: "ring", stations: [{ x: -19.5, z: 7, heading: 90, hold: 1e6 }], speed: 1.2 },
      },
      {
        id: "ring",
        ships: ["patrol", "missile", "patrol", "missile", "patrol"],
        stations: [
          {
            x: -9,
            z: 8.5,
            formation: "ring",
            orbit: 0.9,
            hold: 1e6,
            label: "ESCORT RING",
            place: "ISLAND BELLE",
          },
        ],
      },
      {
        id: "raft",
        ships: ["missile", "missile", "missile"],
        stations: [
          {
            x: 10.2,
            z: -8,
            heading: 90,
            formation: "raft",
            moored: true,
            hold: 1e6,
            label: "RAFTED AT THE FUEL PIER",
            place: "FUEL PIER",
          },
        ],
      },
      {
        id: "cinder",
        ships: ["destroyer"],
        speed: 0.8,
        start: 0,
        stations: [
          { x: -10, z: -9.5, heading: 0, hold: 24, label: "CINDER AT ANCHOR", place: "WEST BASIN" },
          { x: 12, z: 14, heading: 30, hold: 16, label: "CINDER AT THE MOUTH", place: "HARBOUR MOUTH" },
        ],
      },
      {
        // Holds station off the south mole: there is no room to turn a 8 m hull between the escort
        // ring and the breakwater.
        id: "frigate",
        ships: ["frigate"],
        stations: [{ x: 1, z: 18.4, heading: 0, hold: 1e6, label: "FRIGATE ON STATION", place: "SOUTH MOLE" }],
      },
      {
        // Raiders rafted five abreast either side of the west pontoon: a Box each.
        id: "westRaftA",
        ships: raiders(5),
        stations: [{ x: -56, z: -6, heading: 90, formation: "raft", moored: true, hold: 1e6, label: "RAFTED RAIDERS", place: "WEST PONTOON" }],
      },
      {
        id: "westRaftB",
        ships: raiders(5),
        stations: [{ x: -56, z: 6, heading: 90, formation: "raft", moored: true, hold: 1e6 }],
      },
      {
        // Eight raiders circle the west basin: the O-Ring fits them too.
        id: "westRing",
        ships: raiders(8),
        stations: [{ x: -40, z: 5, formation: "ring", orbit: 0.9, hold: 1e6, label: "RAIDERS CIRCLING", place: "WEST BASIN" }],
      },
      {
        id: "eastRaft",
        ships: raiders(5),
        stations: [{ x: 54, z: -8, heading: 90, formation: "raft", moored: true, hold: 1e6, label: "RAFTED RAIDERS", place: "EAST PONTOON" }],
      },
      {
        id: "eastColumn",
        ships: raiders(4),
        speed: 1.2,
        start: 2,
        stations: [
          { x: 42, z: 6, heading: 0, formation: "column", hold: 18, label: "RAIDER COLUMN", place: "EAST BASIN" },
          { x: 46, z: 12, heading: 45, formation: "column", hold: 16, label: "COLUMN WHEELS", place: "EAST BASIN" },
        ],
      },
      {
        id: "patrolLine",
        ships: ["patrol", "patrol", "patrol", "patrol"],
        stations: [{ x: 58, z: 12, heading: 90, formation: "line", hold: 1e6, label: "PATROL LINE", place: "EAST MOLE" }],
      },
      ...OUTER_FLEET,
    ],
    aircraft: [
      { callsign: "Kestrel One", crew: "iona", payload: { ring: 4, stick: 3 } },
      { callsign: "Kestrel Two", crew: "piper", payload: { box: 5, stick: 3 } },
      { callsign: "Kestrel Three", crew: "bram", payload: { stick: 4, shockwave: 3 } },
    ],
    // The escort ring and Cinder must go; 45 of the 108 boats in all.
    quota: 45,
    required: ["ring", "cinder"],
    par: 9,
    alert: 0,
    startLane: 3,
  },
];
