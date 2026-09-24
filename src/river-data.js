// Chapter 2 "Relief Run": the convoy's route script and skiff formations.
// Distances are world units travelled by the convoy; the world scrolls past at `speed`.

export const RIVER = Object.freeze({
  bank: 12.2,
  laneX: 9,
  near: 17,
  far: -13,
  spawnZ: -72,
  despawnZ: 36,
  bargeZ: [9.5, 16.5],
  bargeHp: 16,
  follow: 1.3,
  shield: 2.3,
});

export const SKIFF = Object.freeze({
  hp: 3,
  speed: 7,
  chain: 2.8,
  fireEvery: 1.8,
  aim: 0.7,
});

// Marlin's deck gun reaches about 36 m, so threats at the top of the screen get a turn to shoot.
export const DECK_GUN_RANGE = 36;

const guns = (d, side, opts = {}) => ({ d, type: "guns", side, count: 1, ...opts });
const mines = (d, xs) => ({ d, type: "mines", xs });
const skiffs = (d, pattern, count, opts = {}) => ({ d, type: "skiffs", pattern, count, ...opts });
const pickup = (d, kind, x = 0) => ({ d, type: "pickup", kind, x });
const radio = (d, key) => ({ d, type: "radio", key });
const mark = (d, name) => ({ d, type: "checkpoint", name });

export const RIVER_MISSIONS = [
  {
    // 2.1 Mangrove Mile: learn the wake, the red aim lines and the fuel drums.
    speed: 3.4,
    length: 210,
    fireRate: 2.8,
    script: [
      mark(0, "MANGROVE MILE"),
      guns(8, 1, { crew: 2 }),
      mines(22, [-3, 4]),
      guns(34, -1, { crew: 2, drums: true }),
      radio(34, "drums"),
      pickup(46, "star", -4),
      guns(58, 1, { count: 2, crew: 2, drums: true }),
      guns(64, -1, { count: 1, crew: 1, launcher: true }),
      skiffs(72, "wedge", 3, { x: -2 }),
      radio(70, "skiffs"),
      mines(90, [-6, 0, 6]),
      pickup(98, "health", 5),
      guns(108, -1, { count: 2, crew: 2, drums: true, launcher: true }),
      skiffs(128, "wedge", 4, { x: 3 }),
      guns(142, 1, { crew: 2 }),
      mines(150, [-2, 5]),
      pickup(156, "gun", -3),
      guns(166, -1, { count: 2, crew: 2, drums: true }),
      skiffs(178, "column", 3, { x: -7 }),
      mark(200, "MANGROVE MILE CLEAR"),
    ],
  },
  {
    // 2.2 The Narrows: pincers meet in front of the barges; a bridge full of gunners.
    speed: 3.6,
    length: 250,
    fireRate: 2.4,
    script: [
      mark(0, "THE NARROWS"),
      guns(10, -1, { count: 2, crew: 2, drums: true }),
      skiffs(26, "pincer", 6, { meet: { x: 0, z: -2 }, delay: 6 }),
      radio(24, "pincer"),
      mines(40, [-5, 3]),
      pickup(48, "health", 4),
      guns(62, 1, { count: 2, crew: 2, launcher: true, drums: true }),
      { d: 84, type: "bridge" },
      radio(80, "bridge"),
      pickup(96, "star", -3),
      skiffs(110, "pincer", 6, { meet: { x: -2, z: 0 }, delay: 6.5 }),
      mines(126, [-7, -1, 5]),
      pickup(132, "health", 5),
      guns(136, -1, { count: 2, crew: 2, launcher: true, drums: true }),
      pickup(150, "gun", 3),
      skiffs(160, "column", 3, { x: 7 }),
      guns(176, 1, { count: 2, crew: 2, drums: true }),
      skiffs(196, "pincer", 8, { meet: { x: 1, z: -3 }, delay: 6 }),
      pickup(206, "health", -4),
      mines(214, [-3, 6]),
      guns(222, -1, { crew: 2, launcher: true }),
      mark(244, "NARROWS CLEAR"),
    ],
  },
  {
    // 2.3 Lock Gate: the convoy holds while Marlin breaks two towers and the generator.
    speed: 3.6,
    length: 190,
    fireRate: 2.2,
    gate: 128,
    script: [
      mark(0, "HIGHWATER APPROACH"),
      guns(8, 1, { count: 2, crew: 2, drums: true }),
      skiffs(24, "wedge", 5, { x: 0 }),
      mines(36, [-4, 2, 7]),
      pickup(44, "health", -3),
      guns(56, -1, { count: 2, crew: 2, launcher: true, drums: true }),
      skiffs(72, "pincer", 6, { meet: { x: 0, z: -4 }, delay: 6 }),
      pickup(84, "star", 4),
      guns(92, 1, { count: 3, crew: 2, launcher: true }),
      skiffs(100, "wedge", 5, { x: 2 }),
      pickup(104, "gun", -4),
      mark(118, "HIGHWATER LOCK"),
      pickup(176, "medal", 0),
      mark(186, "HIGHWATER STATION"),
    ],
    boss: {
      towerHp: 24,
      generatorHp: 28,
      shellEvery: 3,
      waveEvery: 12,
    },
  },
];

// Scripts are played in distance order (a stable sort keeps same-distance cues together).
for (const mission of RIVER_MISSIONS) mission.script.sort((a, b) => a.d - b.d);

// Formation paths are authored in the convoy's frame (x across the river, z down the screen).
// Pincer groups are line-abreast, so every member reaches the meeting point together.
export function skiffPath(order, t) {
  const { pattern, index, count } = order;
  if (pattern === "pincer") {
    const side = index % 2 ? 1 : -1;
    const rank = Math.floor(index / 2);
    const perSide = Math.ceil(count / 2);
    const meet = order.meet;
    const T = order.delay;
    const start = { x: side * 11, z: meet.z - 22 };
    const exit = { x: -side * 11, z: meet.z + 22 };
    const offset = (rank - (perSide - 1) / 2) * 1.35;
    const u = t / T;
    const base =
      u <= 1
        ? { x: start.x + (meet.x - start.x) * u, z: start.z + (meet.z - start.z) * u }
        : {
            x: meet.x + (exit.x - meet.x) * (u - 1),
            z: meet.z + (exit.z - meet.z) * (u - 1),
          };
    const dx = (u <= 1 ? meet.x - start.x : exit.x - meet.x),
      dz = (u <= 1 ? meet.z - start.z : exit.z - meet.z);
    const len = Math.hypot(dx, dz) || 1;
    // Offset each rank perpendicular to travel so the group arrives abreast.
    return {
      x: base.x + (-dz / len) * offset,
      z: base.z + (dx / len) * offset,
      heading: Math.atan2(dx, dz),
      done: u >= 2,
    };
  }
  if (pattern === "column") {
    const z = 38 - t * SKIFF.speed + index * 3.2;
    return { x: order.x, z, heading: Math.PI, done: z < -60 };
  }
  // Wedge: a V heading downriver, splitting around the convoy.
  const rank = Math.ceil(index / 2);
  const side = index === 0 ? 0 : index % 2 ? 1 : -1;
  const z = -44 + t * SKIFF.speed - rank * 2.2;
  const swerve = z > -6 ? Math.min(1, (z + 6) / 10) * (side || 1) * 5 : 0;
  return {
    x: Math.max(-10.5, Math.min(10.5, order.x + side * rank * 1.7 + swerve)),
    z,
    heading: 0,
    done: z > RIVER.despawnZ,
  };
}

export function pincerMeeting(order) {
  return { x: order.meet.x, z: order.meet.z, time: order.delay };
}

export function riverStars({ success, bargesLost, bargeHealth, damage }) {
  if (!success) return 0;
  return 1 + (bargesLost === 0 ? 1 : 0) + (bargeHealth >= 0.6 && damage <= 4 ? 1 : 0);
}

export function scriptWindow(script, from, to) {
  return script.filter((event) => event.d >= from && event.d < to);
}
