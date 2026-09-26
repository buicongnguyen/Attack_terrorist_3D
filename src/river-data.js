// Chapter 2 "Relief Run": the convoy's route script and skiff formations.
// Distances are world units travelled by the convoy; the world scrolls past at `speed`.

// 2.4: the canal is about 1.4 times as wide as before (banks at ±17.5 m instead of ±12.2 m).
export const RIVER = Object.freeze({
  bank: 17.5,
  laneX: 13.5,
  near: 17,
  far: -13,
  spawnZ: -72,
  despawnZ: 36,
  bargeZ: [9.5, 16.5],
  bargeHp: 24,
  bargeSpread: 3,
  follow: 1.3,
  shield: 2.3,
  // Where skiff pincers launch from, just off each bank.
  skiffX: 15.5,
});

// Authored x positions in the scripts below were written for the old 24 m canal; they are
// stretched by this much so formations and mines spread across the wider water.
const WIDEN = 1.4;

export const SKIFF = Object.freeze({
  hp: 3,
  speed: 7,
  chain: 2.8,
  fireEvery: 1.8,
  aim: 0.7,
});

// Marlin's deck gun reaches about 36 m, so threats at the top of the screen get a turn to shoot.
export const DECK_GUN_RANGE = 36;

// Marlin's three weapons (keys 1-3). The deck gun hits twice as hard as it used to; rockets fly
// in salvos of three and burst; the laser burns whatever its beam touches until it overheats.
export const WEAPONS = Object.freeze({
  gun: { damage: 2, interval: 0.2 },
  rocket: { stock: 18, salvo: 3, cooldown: 1.1, spread: 1.4, refill: 9, max: 36 },
  laser: { dps: 9, range: 38, heatTime: 3.2, cool: 0.5, restart: 0.35, width: 0.9 },
});

// Kestrel Flight's air strike: two bombers lay a line of bombs across the canal where you aim.
export const AIR_STRIKE = Object.freeze({
  charges: 2,
  warning: 1.6,
  bombs: 9,
  radius: 4.2,
  damage: 30,
  // The lock gate's towers and generator are hardened: a strike only dents them.
  hardened: 6,
  near: -6,
  far: -42,
});

// Help that joins from bonus crates: a gunship that fires where Marlin fires, and an escort
// boat beside the barges that shoots whatever comes closest to it (within its gun's reach).
export const SUPPORT = Object.freeze({
  heli: { time: 20, every: 0.22, damage: 2, rocketEvery: 2.8 },
  ally: { time: 25, every: 0.45, damage: 2, range: 34 },
});

const guns = (d, side, opts = {}) => ({ d, type: "guns", side, count: 1, ...opts });
const mines = (d, xs) => ({ d, type: "mines", xs: xs.map((x) => x * WIDEN) });
const skiffs = (d, pattern, count, opts = {}) => ({
  d,
  type: "skiffs",
  pattern,
  count,
  ...opts,
  ...(opts.x !== undefined ? { x: opts.x * WIDEN } : {}),
  ...(opts.meet ? { meet: { x: opts.meet.x * WIDEN, z: opts.meet.z } } : {}),
});
const pickup = (d, kind, x = 0) => ({ d, type: "pickup", kind, x: x * WIDEN });
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
      radio(32, "drumsHint"),
      pickup(46, "star", -4),
      guns(58, 1, { count: 2, crew: 2, drums: true }),
      guns(64, -1, { count: 1, crew: 1, launcher: true }),
      skiffs(72, "wedge", 3, { x: -2 }),
      radio(70, "skiffs"),
      mines(90, [-6, 0, 6]),
      pickup(98, "health", 5),
      guns(108, -1, { count: 2, crew: 2, drums: true, launcher: true }),
      radio(118, "weapons"),
      skiffs(128, "wedge", 4, { x: 3 }),
      pickup(136, "ammo", -2),
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
      pickup(168, "strike", -4),
      guns(176, 1, { count: 2, crew: 2, drums: true }),
      skiffs(196, "pincer", 8, { meet: { x: 1, z: -3 }, delay: 6 }),
      pickup(206, "health", -4),
      mines(214, [-3, 6]),
      guns(222, -1, { crew: 2, launcher: true }),
      mark(244, "NARROWS CLEAR"),
    ],
  },
  {
    // 2.3 Floodplain: the river spills over drowned fields. Skiff swarms from every side:
    // the lesson is rockets into a crowd and the air strike across the water. A gunship joins.
    speed: 3.6,
    length: 240,
    fireRate: 2.4,
    script: [
      mark(0, "FLOODPLAIN"),
      radio(2, "rockets"),
      skiffs(10, "wedge", 5, { x: 0 }),
      guns(18, 1, { count: 2, crew: 2, drums: true }),
      mines(28, [-8, -2, 5, 9]),
      pickup(36, "ammo", -6),
      radio(40, "strike"),
      skiffs(44, "column", 5, { x: -8 }),
      skiffs(46, "column", 5, { x: 8 }),
      guns(60, -1, { count: 3, crew: 2, launcher: true }),
      pickup(70, "heli", 4),
      skiffs(82, "pincer", 8, { meet: { x: 0, z: -3 }, delay: 6 }),
      mines(96, [-9, -4, 3, 8]),
      pickup(104, "health", -5),
      guns(112, 1, { count: 3, crew: 2, drums: true, launcher: true }),
      skiffs(126, "wedge", 7, { x: -3 }),
      pickup(136, "strike", 6),
      guns(146, -1, { count: 2, crew: 2, drums: true }),
      skiffs(160, "pincer", 8, { meet: { x: 2, z: -2 }, delay: 6 }),
      pickup(170, "ammo", 3),
      skiffs(184, "column", 6, { x: 0 }),
      guns(196, 1, { count: 3, crew: 2, launcher: true }),
      skiffs(210, "wedge", 7, { x: 4 }),
      mark(234, "FLOODPLAIN CLEAR"),
    ],
  },
  {
    // 2.4 Sawmill Reach: a Front lumber camp on both banks, launchers in the log yards and a
    // log bridge full of gunners. The laser burns down whole gun lines; an escort boat joins.
    speed: 3.5,
    length: 260,
    fireRate: 2.2,
    script: [
      mark(0, "SAWMILL REACH"),
      radio(2, "laser"),
      guns(8, 1, { count: 3, crew: 2, drums: true }),
      guns(20, -1, { count: 3, crew: 2, launcher: true }),
      skiffs(30, "wedge", 5, { x: 2 }),
      pickup(40, "ally", -5),
      mines(52, [-6, 0, 6]),
      guns(62, 1, { count: 2, crew: 2, launcher: true, drums: true }),
      skiffs(74, "pincer", 8, { meet: { x: -1, z: -2 }, delay: 6 }),
      pickup(86, "health", 5),
      { d: 98, type: "bridge" },
      radio(94, "bridge"),
      pickup(112, "ammo", -4),
      guns(122, -1, { count: 3, crew: 2, drums: true }),
      skiffs(134, "column", 5, { x: -7 }),
      skiffs(136, "column", 5, { x: 7 }),
      pickup(148, "strike", 0),
      guns(158, 1, { count: 3, crew: 2, launcher: true }),
      mines(170, [-8, -3, 3, 8]),
      pickup(178, "heli", -3),
      skiffs(188, "pincer", 8, { meet: { x: 2, z: -3 }, delay: 6 }),
      guns(204, -1, { count: 2, crew: 2, drums: true, launcher: true }),
      pickup(214, "health", 3),
      skiffs(224, "wedge", 7, { x: -2 }),
      guns(236, 1, { count: 2, crew: 2 }),
      mark(254, "SAWMILL REACH CLEAR"),
    ],
  },
  {
    // 2.5 The Cut: a straight canal cut through the ridge, gun lines on both banks the whole
    // way. Everything at once, with every kind of help on the water.
    speed: 3.6,
    length: 260,
    fireRate: 2.1,
    script: [
      mark(0, "THE CUT"),
      radio(2, "cut"),
      guns(6, 1, { count: 3, crew: 2, drums: true }),
      guns(10, -1, { count: 3, crew: 2, drums: true }),
      pickup(20, "ally", 4),
      skiffs(30, "pincer", 8, { meet: { x: 0, z: -2 }, delay: 6 }),
      mines(44, [-7, -2, 3, 8]),
      guns(56, 1, { count: 3, crew: 2, launcher: true }),
      guns(60, -1, { count: 3, crew: 2, launcher: true }),
      pickup(68, "ammo", -5),
      skiffs(78, "wedge", 7, { x: 0 }),
      pickup(90, "heli", 5),
      skiffs(100, "column", 6, { x: -8 }),
      skiffs(102, "column", 6, { x: 8 }),
      guns(116, 1, { count: 3, crew: 2, drums: true, launcher: true }),
      guns(120, -1, { count: 3, crew: 2, drums: true }),
      pickup(130, "health", -3),
      pickup(136, "strike", 3),
      skiffs(146, "pincer", 8, { meet: { x: -2, z: -3 }, delay: 6 }),
      mines(160, [-8, -3, 2, 7]),
      guns(170, -1, { count: 3, crew: 2, launcher: true }),
      pickup(180, "star", -4),
      skiffs(190, "wedge", 7, { x: 3 }),
      guns(200, 1, { count: 3, crew: 2, drums: true }),
      pickup(208, "ammo", 4),
      skiffs(218, "pincer", 8, { meet: { x: 1, z: -2 }, delay: 6 }),
      guns(230, -1, { count: 2, crew: 2, drums: true }),
      mark(254, "THE CUT CLEAR"),
    ],
  },
  {
    // 2.6 Lock Gate: the convoy holds while Marlin breaks two towers and the generator.
    // The medal is not scripted: it floats out through the gate once it opens.
    speed: 3.6,
    length: 200,
    fireRate: 2.2,
    gate: 128,
    script: [
      mark(0, "HIGHWATER APPROACH"),
      guns(8, 1, { count: 2, crew: 2, drums: true }),
      skiffs(24, "wedge", 5, { x: 0 }),
      pickup(30, "ammo", 4),
      mines(36, [-4, 2, 7]),
      pickup(44, "health", -3),
      guns(56, -1, { count: 2, crew: 2, launcher: true, drums: true }),
      skiffs(72, "pincer", 6, { meet: { x: 0, z: -4 }, delay: 6 }),
      pickup(84, "star", 4),
      guns(92, 1, { count: 3, crew: 2, launcher: true }),
      pickup(96, "heli", -5),
      skiffs(100, "wedge", 5, { x: 2 }),
      pickup(104, "gun", -4),
      pickup(110, "strike", 2),
      mark(118, "HIGHWATER LOCK"),
      mark(196, "HIGHWATER STATION"),
    ],
    boss: {
      towerHp: 30,
      generatorHp: 34,
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
    const start = { x: side * RIVER.skiffX, z: meet.z - 22 };
    const exit = { x: -side * RIVER.skiffX, z: meet.z + 22 };
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
  const swerve = z > -6 ? Math.min(1, (z + 6) / 10) * (side || 1) * 7 : 0;
  const edge = RIVER.laneX + 1.5;
  return {
    x: Math.max(-edge, Math.min(edge, order.x + side * rank * 1.7 + swerve)),
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

// Where an air strike's line of bombs falls: across the whole canal at `z`, clamped ahead of
// the convoy so the barges are never under it.
export function strikeLine(z, bombs = AIR_STRIKE.bombs) {
  const at = Math.max(AIR_STRIKE.far, Math.min(AIR_STRIKE.near, z));
  const span = RIVER.bank - 1.5;
  return Array.from({ length: bombs }, (_, i) => ({ x: -span + (2 * span * i) / (bombs - 1), z: at }));
}

// Laser heat: firing fills it in `heatTime` seconds; once full the beam stops until it cools to
// `restart`. Returns the new state.
export function laserHeat(state, firing, dt, spec = WEAPONS.laser) {
  let { heat, locked } = state;
  if (firing && !locked) heat = Math.min(1, heat + dt / spec.heatTime);
  else heat = Math.max(0, heat - dt * spec.cool);
  if (heat >= 1) locked = true;
  if (locked && heat <= spec.restart) locked = false;
  return { heat, locked, beam: firing && !locked };
}
