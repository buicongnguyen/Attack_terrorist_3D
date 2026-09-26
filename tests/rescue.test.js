import test from "node:test";
import assert from "node:assert/strict";
import {
  RESCUE_MAPS,
  THREATS,
  PIN_RADIUS,
  PICKUP_RADIUS,
  rescueLayout,
  riverAt,
  riverEdge,
  nearestOnRoad,
  rescueProgress,
  isHostileEntity,
  rearm,
  RESCUE_GEAR,
} from "../src/rescue-data.js";
import { MISSIONS } from "../src/data.js";

const RESCUES = MISSIONS.filter((m) => m.chapter === 2);
// Every point a map places, with a name for messages.
const points = (map) => [
  ...map.sites.map((s) => [`site ${s.name}`, s.x, s.z]),
  ["start", map.start.x, map.start.z],
  ["landing", map.landing.x, map.landing.z],
  ...map.threats.flatMap((t) => (t.route ? t.route.map(([x, z], i) => [`${t.type} route ${i}`, x, z]) : [[t.type, t.x, t.z]])),
];

test("each sortie has its own map, with a signal for every member of its team", () => {
  assert.equal(RESCUE_MAPS.length, RESCUES.length);
  assert.equal(new Set(RESCUE_MAPS.map((m) => m.biome)).size, RESCUE_MAPS.length, "three different kinds of country");
  RESCUES.forEach((mission, i) => {
    const layout = rescueLayout(i, mission.crew);
    assert.equal(layout.survivors.length, mission.team);
    assert.deepEqual(layout.survivors.map((s) => s.person), mission.crew);
    // Routes run north: every signal between the start and the landing base.
    for (const s of layout.survivors) assert.ok(s.z < layout.start.z && s.z > layout.landing.z - 20);
  });
});

test("each sortie lands at a different base from the one it started at, and the next starts there", () => {
  for (const [i, map] of RESCUE_MAPS.entries()) {
    assert.notEqual(map.landing.name, map.start.name);
    assert.ok(Math.hypot(map.landing.x - map.start.x, map.landing.z - map.start.z) > 200);
    if (i > 0) assert.equal(map.start.name, RESCUE_MAPS[i - 1].landing.name);
  }
});

test("nothing stands in the water or past the edge of the valley", () => {
  for (const map of RESCUE_MAPS)
    for (const [name, x, z] of points(map)) {
      assert.ok(riverEdge(map, x, z) >= 3, `${map.name}: ${name} at ${x}, ${z} is in the river`);
      assert.ok(Math.abs(x) <= 40 && z <= 26 && z >= -224, `${map.name}: ${name} at ${x}, ${z} is off the map`);
    }
});

test("every signal is pinned by a squad close by, and no vehicle drives over it", () => {
  for (const map of RESCUE_MAPS)
    for (const s of map.sites) {
      const near = map.threats.filter((t) => !t.route && Math.hypot(t.x - s.x, t.z - s.z) < PIN_RADIUS);
      assert.ok(near.length >= 1 && near.every((t) => t.type === "soldiers"), `${map.name}: ${s.name}`);
      // Soldiers stand 2.2 m about their spot, so all of them pin the signal.
      assert.ok(near.every((t) => Math.hypot(t.x - s.x, t.z - s.z) + 2.2 < PIN_RADIUS));
      // Vehicles never pin a signal, and none drives within reach of the pickup: every metre of
      // every route stays clear of it.
      for (const t of map.threats.filter((t) => t.route))
        for (let i = 1; i < t.route.length; i++) {
          const [ax, az] = t.route[i - 1],
            [bx, bz] = t.route[i];
          for (let u = 0; u <= 1; u += 1 / Math.ceil(Math.hypot(bx - ax, bz - az))) {
            const d = Math.hypot(ax + (bx - ax) * u - s.x, az + (bz - az) * u - s.z);
            assert.ok(d > PICKUP_RADIUS + 3, `${map.name}: ${t.type} drives ${d.toFixed(1)} m from ${s.name}`);
          }
        }
    }
});

test("bases are clear of the enemy", () => {
  for (const map of RESCUE_MAPS)
    for (const base of [map.start, map.landing])
      for (const [name, x, z] of points(map).filter(([n]) => n !== "start" && n !== "landing" && !n.startsWith("site")))
        assert.ok(Math.hypot(x - base.x, z - base.z) > 12, `${map.name}: ${name} beside ${base.name}`);
});

test("bridges stand where the road crosses the water, and patrols keep to the road", () => {
  for (const map of RESCUE_MAPS) {
    const crossings = [];
    for (let i = 1; i < map.road.length; i++) {
      const [ax, az] = map.road[i - 1],
        [bx, bz] = map.road[i];
      let side = null;
      for (let t = 0; t <= 1.0001; t += 0.005) {
        const x = ax + (bx - ax) * t,
          z = az + (bz - az) * t;
        const now = Math.sign(x - riverAt(map, z).x);
        if (side !== null && now !== side) crossings.push(z);
        side = now;
      }
    }
    for (const z of crossings) assert.ok(map.bridges.some((b) => Math.abs(b.z - z) < 3), `${map.name}: no bridge at ${z.toFixed(1)}`);
    for (const t of map.threats.filter((t) => t.route))
      for (const [x, z] of t.route) assert.ok(nearestOnRoad(map, x, z).d < 12, `${map.name}: ${t.type} off the road at ${x}, ${z}`);
  }
});

test("the river is continuous and every map brings something new", () => {
  for (const map of RESCUE_MAPS)
    for (let z = 26; z > -230; z -= 2) {
      const a = riverAt(map, z),
        b = riverAt(map, z - 2);
      // (It may sweep in from off the map, but never jumps.)
      assert.ok(Math.abs(a.x - b.x) < 5 && a.width > 6);
    }
  const types = RESCUE_MAPS.map((m) => new Set(m.threats.map((t) => t.type)));
  // Launch crews and a drone station in the first; missile and flak trucks at the crossings;
  // three drone stations on the ridge.
  assert.ok(types[0].has("missile-site") && types[0].has("drone-pad") && types[0].has("cave"));
  assert.ok(types[1].has("flak-truck") && RESCUE_MAPS[1].threats.filter((t) => t.type === "missile-truck").length >= 2);
  assert.ok(RESCUE_MAPS[2].threats.filter((t) => t.type === "drone-pad").length >= 3);
});

test("launch sites, missile trucks and drone stations all give time to stop them", () => {
  // Five seconds from a truck seeing Lantern to its missile, and from a station to its drones.
  assert.equal(THREATS.truck.erect, 5);
  assert.equal(THREATS.pad.launch, 5);
  // A site's crew runs from where they stand to their posts, then the rack takes a few seconds more.
  const run = (THREATS.site.crewRadius - THREATS.site.post) / THREATS.site.crewSpeed;
  assert.ok(run + THREATS.site.prep >= 4);
  // Lantern's chain gun (one point a round, four rounds a second) can stop each in time.
  for (const [hp, window] of [
    [THREATS.truck.hp, THREATS.truck.erect],
    [THREATS.pad.hp, THREATS.pad.launch],
    [THREATS.soldier.hp * 3, run + THREATS.site.prep],
  ])
    assert.ok(hp / 4 < window);
});

test("progress reaches the end only on landing", () => {
  assert.equal(rescueProgress(0, 2, 0), 0);
  assert.equal(rescueProgress(1, 2, 50), 0.4);
  assert.ok(rescueProgress(2, 2, 0) < 1);
});

test("friendly soldiers, supplies and hidden caves are not targets; every new threat is", () => {
  assert.ok(!isHostileEntity({ type: "survivor", friendly: true }));
  assert.ok(!isHostileEntity({ type: "pickup" }));
  assert.ok(!isHostileEntity({ type: "cave", phase: "hidden" }));
  assert.ok(!isHostileEntity({ type: "cave", phase: "disabled" }));
  for (const type of ["aa-truck", "drone", "missile-site", "missile-truck", "drone-pad", "barracks", "enemy", "cannon"])
    assert.ok(isHostileEntity({ type }), type);
});

test("a base rearms to the standard load without taking extra stock away", () => {
  assert.deepEqual(rearm({ rockets: 0, guided: 2, flares: 1 }), { ...RESCUE_GEAR });
  const stocked = rearm({ rockets: 20, guided: 1, flares: 9 });
  assert.equal(stocked.rockets, 20);
  assert.equal(stocked.guided, RESCUE_GEAR.guided);
  assert.equal(stocked.flares, 9);
});
