// Chapter 3 "Last Light": Lantern's rescue sorties. 2.7: each sortie has its own map (a jungle
// lowland, a canyon of broken crossings in the storm, a ridge at dusk), starts at one base and
// lands at another, and picks people up by flying over them.
// (2.7: ±41 across, inside the valley walls that climb from ±43.)
export const RESCUE_BOUNDS = { left: -41, right: 41, near: 26, far: -224 };
export const RESCUE_HEIGHT = 7.5;
// Fly within this of a signal and the soldier is pulled aboard; the ride up takes LIFT_SECONDS.
export const PICKUP_RADIUS = 5.5;
// A signal is pinned while enemy on the ground stands this close to it: clear them, then fly over.
export const PIN_RADIUS = 14;
export const LIFT_SECONDS = 0.7;
// The landing pad at the destination base, and the touchdown that ends the sortie.
export const LAND_RADIUS = 5;
export const LAND_SECONDS = 1.4;
// Flying over a friendly base repairs and rearms Lantern, at most this often.
export const REPAIR_COOLDOWN = 15;
export const RESCUE_GEAR = Object.freeze({ rockets: 14, guided: 6, flares: 4 });

// The base tops every rack up to the standard load and never takes away extra stock.
export const rearm = (gear) =>
  Object.fromEntries(Object.keys(RESCUE_GEAR).map((key) => [key, Math.max(gear?.[key] ?? 0, RESCUE_GEAR[key])]));

// The enemy on the ground (2.7). Launch sites, missile trucks and drone stations all need time
// to fire: kill a site's crew before they reach it, a truck before its rack is up, a station
// before its drones lift, and nothing launches.
export const THREATS = Object.freeze({
  // A fixed launcher; its crew stands about until they see Lantern, then runs to it.
  site: { hp: 6, detect: 26, range: 46, prep: 4, reload: 5, crewSpeed: 3.4, crewRadius: 4.2, post: 1.8 },
  // A missile truck patrols its road; when it sees Lantern it stops and raises the rack.
  truck: { hp: 6, detect: 30, range: 44, erect: 5, lower: 1.5, drive: 4, speed: 3 },
  // A flak truck fires bursts, not missiles.
  flak: { hp: 5, range: 34, every: 3, speed: 2.4 },
  // A drone station: when it sees Lantern the drones spin up and lift after `launch` seconds.
  pad: { hp: 4, detect: 30, launch: 5, climb: 1.6, drones: 2 },
  drone: { hp: 3, range: 33, every: 2.6 },
  // Barracks send their soldiers out one by one once the alarm is up.
  barracks: { hp: 10, detect: 28, every: 1.2, crew: 4 },
  soldier: { hp: 2, detect: 24, range: 24, every: 3.4, speed: 3.2 },
  cannon: { hp: 3, range: 30, every: 3 },
  // The alarm spreads to every unit this close to one that has been shot at.
  alarm: 16,
});

// Maps are laid out north up the screen: the start base in the south (+z), the landing base in
// the north. `river` is the water's centre line and width as [z, x, width] (it may run off the
// map), `road` the patrol road, `bridges` where crossings stand (broken ones have a gap).
export const RESCUE_MAPS = [
  {
    // 3.1 Lowland Outpost: jungle lowlands along the Verde, an afternoon sortie.
    name: "LOWLAND OUTPOST",
    biome: "jungle",
    start: { x: 0, z: 14, name: "HIGHWATER PAD" },
    landing: { x: -20, z: -206, name: "VERDE AID STATION" },
    river: [
      [14, 70, 18],
      [-20, 24, 18],
      [-60, 4, 20],
      [-100, -2, 20],
      [-140, 8, 20],
      [-180, 14, 18],
      [-240, 6, 18],
    ],
    road: [
      [-12, 8],
      [-26, -40],
      [-30, -100],
      [-24, -160],
      [-30, -196],
    ],
    bridges: [{ z: -122, broken: false }],
    sites: [
      { x: -24, z: -52, name: "ECHO 01", sector: "LOWLAND OUTPOST" },
      { x: 28, z: -158, name: "ECHO 02", sector: "RIVER BEND" },
    ],
    threats: [
      { type: "soldiers", x: -30, z: -44, count: 3 },
      { type: "soldiers", x: 34, z: -150, count: 2 },
      { type: "soldiers", x: -18, z: -28, count: 3 },
      { type: "missile-site", x: -34, z: -72, crew: 3 },
      { type: "cave", x: 38, z: -64 },
      { type: "cannon", x: 30, z: -104 },
      { type: "missile-truck", route: [[-30, -108], [-25, -166]] },
      { type: "barracks", x: 36, z: -134, crew: 4 },
      { type: "drone-pad", x: -36, z: -180 },
      { type: "soldiers", x: 32, z: -174, count: 2 },
    ],
    supplies: [
      { x: -8, z: -22, kind: "ap" },
      { x: 26, z: -84, kind: "health" },
      { x: -16, z: -118, kind: "he" },
      { x: -12, z: -150, kind: "support" },
      { x: 34, z: -186, kind: "ammo" },
      { x: -4, z: -176, kind: "plasma" },
    ],
  },
  {
    // 3.2 Broken Crossing: a canyon of red rock and a braided river under the storm, its road
    // crossing the water three times on broken bridges.
    name: "BROKEN CROSSING",
    biome: "canyon",
    start: { x: -20, z: 14, name: "VERDE AID STATION" },
    landing: { x: 34, z: -208, name: "EAST CROSSING CAMP" },
    river: [
      [14, 64, 22],
      [-20, 22, 24],
      [-50, 6, 26],
      [-90, 2, 26],
      [-120, -12, 26],
      [-160, 0, 24],
      [-200, 14, 24],
      [-240, 20, 24],
    ],
    road: [
      [-24, 6],
      [-24, -34],
      [-22, -58],
      [26, -66],
      [26, -112],
      [22, -128],
      [-26, -136],
      [-24, -182],
      [-18, -194],
      [34, -198],
    ],
    bridges: [
      { z: -62, broken: true },
      { z: -132, broken: true },
      { z: -196, broken: true },
    ],
    sites: [
      { x: -28, z: -44, name: "ECHO 03", sector: "WEST FORD" },
      { x: 32, z: -96, name: "ECHO 04", sector: "BROKEN BRIDGE" },
      { x: -30, z: -160, name: "ECHO 05", sector: "SANDBAR" },
    ],
    threats: [
      { type: "soldiers", x: -34, z: -36, count: 3 },
      { type: "soldiers", x: 38, z: -88, count: 3 },
      { type: "soldiers", x: -36, z: -168, count: 3 },
      { type: "flak-truck", route: [[-20, -18], [-19, -54]] },
      { type: "missile-site", x: 34, z: -56, crew: 3 },
      { type: "soldiers", x: -18, z: -72, count: 3 },
      { type: "missile-truck", route: [[22, -78], [22, -120]] },
      { type: "cannon", x: 38, z: -128 },
      { type: "barracks", x: -36, z: -108, crew: 4 },
      { type: "flak-truck", route: [[-23, -142], [-19, -176]] },
      { type: "missile-site", x: -38, z: -146, crew: 3 },
      { type: "drone-pad", x: 32, z: -166 },
      { type: "soldiers", x: 22, z: -148, count: 2 },
      { type: "missile-truck", route: [[-18, -194], [-6, -196]] },
    ],
    supplies: [
      { x: 6, z: -20, kind: "ap" },
      { x: -10, z: -82, kind: "health" },
      { x: 12, z: -116, kind: "he" },
      { x: -4, z: -104, kind: "plasma" },
      { x: -10, z: -148, kind: "ammo" },
      { x: 12, z: -176, kind: "support" },
      { x: 4, z: -196, kind: "health" },
    ],
  },
  {
    // 3.3 North Ridge: pine slopes and a mountain stream at last light, drones everywhere.
    name: "NORTH RIDGE",
    biome: "ridge",
    start: { x: 24, z: 14, name: "EAST CROSSING CAMP" },
    landing: { x: 26, z: -210, name: "HIGHWATER STATION" },
    river: [
      [14, 8, 10],
      [-40, -6, 10],
      [-80, 6, 11],
      [-120, -4, 11],
      [-160, 8, 10],
      [-200, -2, 10],
      [-240, 4, 10],
    ],
    road: [
      [-12, 8],
      [18, -20],
      [-18, -60],
      [20, -100],
      [-20, -130],
      [18, -160],
      [-8, -196],
    ],
    // Small wooden bridges where the switchbacks cross the stream.
    bridges: [-7, -46, -85, -118, -151, -182].map((z) => ({ z, broken: false })),
    sites: [
      { x: -28, z: -40, name: "ECHO 06", sector: "PINE SADDLE" },
      { x: 28, z: -88, name: "ECHO 07", sector: "SCREE FIELD" },
      { x: -26, z: -140, name: "ECHO 08", sector: "WATCH ROCK" },
      { x: 26, z: -182, name: "ECHO LEAD", sector: "SUMMIT HUT" },
    ],
    threats: [
      { type: "soldiers", x: -34, z: -32, count: 3 },
      { type: "soldiers", x: 34, z: -80, count: 3 },
      { type: "soldiers", x: -32, z: -148, count: 3 },
      { type: "soldiers", x: 32, z: -174, count: 3 },
      { type: "soldiers", x: -16, z: -26, count: 3 },
      { type: "drone-pad", x: 34, z: -48 },
      { type: "missile-site", x: -36, z: -66, crew: 3 },
      { type: "missile-truck", route: [[20, -100], [10, -106]] },
      { type: "barracks", x: 38, z: -112, crew: 5 },
      { type: "drone-pad", x: -36, z: -108 },
      { type: "cannon", x: 18, z: -148 },
      { type: "missile-site", x: 36, z: -150, crew: 3 },
      { type: "flak-truck", route: [[-18, -131.6], [-8, -139.5]] },
      { type: "drone-pad", x: -34, z: -180 },
      { type: "missile-truck", route: [[14, -24], [4, -35]] },
      { type: "soldiers", x: 8, z: -196, count: 3 },
    ],
    supplies: [
      { x: 2, z: -18, kind: "ap" },
      { x: -10, z: -48, kind: "plasma" },
      { x: -8, z: -78, kind: "health" },
      { x: 10, z: -118, kind: "he" },
      { x: -6, z: -126, kind: "ammo" },
      { x: 4, z: -162, kind: "support" },
      { x: -12, z: -172, kind: "plasma" },
      { x: 10, z: -192, kind: "health" },
    ],
  },
];

// The map for a rescue mission, by its index in the chapter (0-2).
export const rescueMap = (index = 0) => RESCUE_MAPS[Math.max(0, Math.min(RESCUE_MAPS.length - 1, index))];

// The river's centre and width at `z`, from the map's control points (flat beyond the ends).
export function riverAt(map, z) {
  const points = map.river;
  if (z >= points[0][0]) return { x: points[0][1], width: points[0][2] };
  for (let i = 1; i < points.length; i++) {
    const [z1, x1, w1] = points[i];
    if (z >= z1) {
      const [z0, x0, w0] = points[i - 1];
      const t = (z - z0) / (z1 - z0);
      // Smooth the bends.
      const s = t * t * (3 - 2 * t);
      return { x: x0 + (x1 - x0) * s, width: w0 + (w1 - w0) * t };
    }
  }
  const last = points[points.length - 1];
  return { x: last[1], width: last[2] };
}

// How far a point is from the water's edge: negative in the river.
export function riverEdge(map, x, z) {
  const r = riverAt(map, z);
  return Math.abs(x - r.x) - r.width / 2;
}

// The nearest point on the road, and how far it is.
export function nearestOnRoad(map, x, z) {
  let best = null;
  for (let i = 1; i < map.road.length; i++) {
    const [ax, az] = map.road[i - 1],
      [bx, bz] = map.road[i];
    const dx = bx - ax,
      dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    const px = ax + dx * t,
      pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (!best || d < best.d) best = { x: px, z: pz, d };
  }
  return best;
}

// A sortie's layout: its map, the survivors (named from the crew), supplies and threats.
export function rescueLayout(index = 0, crew = []) {
  const map = rescueMap(index);
  const survivors = map.sites.map((s, i) => ({ ...s, person: crew[i] || s.name }));
  return {
    map,
    bounds: { ...RESCUE_BOUNDS },
    start: { ...map.start },
    landing: { ...map.landing },
    survivors,
    supplies: map.supplies.map((s) => ({ ...s })),
    threats: map.threats.map((t) => ({ ...t })),
  };
}

export function rescueProgress(rescued, total, distanceToBase) {
  if (!total) return 0;
  return Math.min(
    0.99,
    (rescued / total) * 0.8 + (rescued === total ? 0.19 * Math.max(0, 1 - distanceToBase / 220) : 0),
  );
}

const HOSTILE_TYPES = new Set([
  "mine",
  "cannon",
  "launcher",
  "enemy",
  "cave",
  "aa-truck",
  "drone",
  "skiff",
  "drums",
  "crate",
  "tower",
  "generator",
  "missile-site",
  "missile-truck",
  "drone-pad",
  "barracks",
]);

export const isHostileEntity = (e) =>
  !e.dead &&
  !e.friendly &&
  !e.shielded &&
  HOSTILE_TYPES.has(e.type) &&
  (e.type !== "cave" || !["hidden", "opening", "disabled"].includes(e.phase));
