import test from "node:test";
import assert from "node:assert/strict";
import {
  RIVER,
  RIVER_MISSIONS,
  SKIFF,
  WEAPONS,
  AIR_STRIKE,
  skiffPath,
  riverStars,
  strikeLine,
  laserHeat,
  DECK_GUN_RANGE,
} from "../src/river-data.js";
import { PICKUPS } from "../src/pickups.js";

test("six river legs with ordered scripts that end at the destination", () => {
  assert.equal(RIVER_MISSIONS.length, 6);
  for (const mission of RIVER_MISSIONS) {
    const distances = mission.script.map((e) => e.d);
    assert.deepEqual(distances, [...distances].sort((a, b) => a - b));
    assert.ok(distances.at(-1) < mission.length);
    assert.ok(mission.script.some((e) => e.type === "guns" && e.drums), "every leg teaches the fuel drums");
  }
  const gate = RIVER_MISSIONS.at(-1);
  assert.ok(gate.gate < gate.length && gate.boss);
  // Every crate a script floats down the canal is a real pickup, and nothing spawns in the banks.
  for (const mission of RIVER_MISSIONS)
    for (const e of mission.script) {
      if (e.type === "pickup") assert.ok(PICKUPS[e.kind], e.kind);
      if (e.type === "pickup" || e.type === "mines") for (const x of e.xs || [e.x]) assert.ok(Math.abs(x) < RIVER.laneX, `${e.type} at x=${x}`);
      if (e.type === "skiffs" && e.x !== undefined) assert.ok(Math.abs(e.x) < RIVER.laneX);
    }
});

test("the new legs teach the new help: gunship on the floodplain, escort at the sawmill, both in the Cut", () => {
  const kinds = (i) => new Set(RIVER_MISSIONS[i].script.filter((e) => e.type === "pickup").map((e) => e.kind));
  assert.ok(kinds(2).has("heli") && kinds(2).has("strike") && kinds(2).has("ammo"));
  assert.ok(kinds(3).has("ally") && kinds(3).has("heli"));
  assert.ok(["heli", "ally", "strike", "ammo"].every((k) => kinds(4).has(k)));
  assert.ok(RIVER_MISSIONS[2].script.some((e) => e.type === "radio" && e.key === "rockets"));
  assert.ok(RIVER_MISSIONS[3].script.some((e) => e.type === "radio" && e.key === "laser"));
});

test("the canal is half as wide again, and the barges stay clear of both banks", () => {
  assert.ok(RIVER.bank >= 12.2 * 1.4);
  assert.ok(RIVER.laneX + 1.3 < RIVER.bank);
  assert.ok(RIVER.skiffX < RIVER.bank && RIVER.skiffX > RIVER.laneX);
  assert.ok(RIVER.bargeHp >= 24);
});

test("an air strike lays its bombs right across the canal, always ahead of the barges", () => {
  for (const z of [10, -3, -20, -80]) {
    const line = strikeLine(z);
    assert.equal(line.length, AIR_STRIKE.bombs);
    const at = line[0].z;
    assert.ok(line.every((p) => p.z === at));
    assert.ok(at <= AIR_STRIKE.near && at >= AIR_STRIKE.far);
    // Blasts overlap from bank to bank, so nothing crossing the line gets through.
    assert.ok(line[0].x - AIR_STRIKE.radius < -RIVER.laneX && line.at(-1).x + AIR_STRIKE.radius > RIVER.laneX);
    for (let i = 1; i < line.length; i++) assert.ok(line[i].x - line[i - 1].x < AIR_STRIKE.radius * 2);
    // The nearest barge rides at z=9.5; the line never falls within a blast of it.
    assert.ok(RIVER.bargeZ[0] - at > AIR_STRIKE.radius + 3);
  }
});

test("the laser overheats after a few seconds of fire and restarts once it has cooled", () => {
  const spec = WEAPONS.laser;
  let state = { heat: 0, locked: false };
  let fired = 0;
  while (!state.locked && fired < 20) {
    state = laserHeat(state, true, 0.05);
    if (state.beam) fired += 0.05;
  }
  assert.ok(Math.abs(fired - spec.heatTime) < 0.1, `fired ${fired}s`);
  assert.ok(state.locked && !state.beam);
  let cooling = 0;
  while (state.locked) {
    state = laserHeat(state, true, 0.05);
    cooling += 0.05;
  }
  assert.ok(Math.abs(cooling - (1 - spec.restart) / spec.cool) < 0.1, `cooled in ${cooling}s`);
  // Tapping the trigger never locks it.
  state = { heat: 0, locked: false };
  for (let i = 0; i < 400; i++) state = laserHeat(state, i % 4 === 0, 0.05);
  assert.ok(!state.locked);
});

test("pincer skiffs arrive abreast at the meeting point, then leave", () => {
  for (const count of [6, 8]) {
    const order = { pattern: "pincer", count, meet: { x: -2, z: 0 }, delay: 6.5 };
    const at = Array.from({ length: count }, (_, index) => skiffPath({ ...order, index }, order.delay));
    for (const p of at) assert.ok(Math.hypot(p.x - order.meet.x, p.z - order.meet.z) < SKIFF.chain, JSON.stringify(p));
    const start = Array.from({ length: count }, (_, index) => skiffPath({ ...order, index }, 0));
    assert.ok(start.every((p) => Math.abs(p.x) > 8), "they launch from the banks");
    assert.ok(skiffPath({ ...order, index: 0 }, order.delay * 2).done);
  }
});

test("wedges come downriver and columns overtake from behind", () => {
  const wedge = { pattern: "wedge", count: 5, x: 0 };
  assert.ok(skiffPath({ ...wedge, index: 0 }, 0).z < RIVER.far);
  assert.ok(skiffPath({ ...wedge, index: 0 }, 20).done);
  const column = { pattern: "column", count: 3, x: 7 };
  assert.ok(skiffPath({ ...column, index: 0 }, 0).z > RIVER.near);
  assert.ok(skiffPath({ ...column, index: 0 }, 20).done);
});

test("threats at the top of the screen are out of the deck gun's reach", () => {
  assert.ok(DECK_GUN_RANGE < Math.abs(RIVER.spawnZ));
  assert.ok(DECK_GUN_RANGE > 30);
});

test("river stars reward protecting the barges", () => {
  assert.equal(riverStars({ success: false, bargesLost: 0, bargeHealth: 1, damage: 0 }), 0);
  assert.equal(riverStars({ success: true, bargesLost: 0, bargeHealth: 0.9, damage: 2 }), 3);
  assert.equal(riverStars({ success: true, bargesLost: 1, bargeHealth: 0.4, damage: 2 }), 1);
});

test("the Lock Gate medal floats out after the gate opens, with room to reach Marlin", () => {
  const leg = RIVER_MISSIONS.at(-1);
  assert.ok(!leg.script.some((e) => e.type === "pickup" && e.kind === "medal"), "the medal is not scripted");
  // The gate holds the convoy 48 m after it spawns; the medal then needs to drift past Marlin's reach.
  const holdAt = leg.gate + (-24 - RIVER.spawnZ);
  const drift = leg.length - holdAt;
  assert.ok(-24 + 3 + drift > RIVER.far + 2.4, `medal ends at z=${-24 + 3 + drift}`);
});
