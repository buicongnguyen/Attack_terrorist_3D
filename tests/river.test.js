import test from "node:test";
import assert from "node:assert/strict";
import { RIVER, RIVER_MISSIONS, SKIFF, skiffPath, riverStars, DECK_GUN_RANGE } from "../src/river-data.js";

test("three river legs with ordered scripts that end at the destination", () => {
  assert.equal(RIVER_MISSIONS.length, 3);
  for (const mission of RIVER_MISSIONS) {
    const distances = mission.script.map((e) => e.d);
    assert.deepEqual(distances, [...distances].sort((a, b) => a - b));
    assert.ok(distances.at(-1) < mission.length);
    assert.ok(mission.script.some((e) => e.type === "guns" && e.drums), "every leg teaches the fuel drums");
  }
  assert.ok(RIVER_MISSIONS[2].gate < RIVER_MISSIONS[2].length && RIVER_MISSIONS[2].boss);
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
