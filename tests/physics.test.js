import test from "node:test";
import assert from "node:assert/strict";
import { FixedClock, movement, segmentSphere, createPhysics, addBox } from "../src/physics.js";
import { STEP, saveResult, damageShields, MISSIONS, firstOpenMission, migrateSave } from "../src/data.js";

test("120 Hz simulation is independent of render frequency", () => {
  const run = (rate) => {
    const clock = new FixedClock();
    let steps = 0;
    for (let i = 0; i < rate * 4; i++) clock.advance(1 / rate, () => steps++);
    return steps;
  };
  assert.equal(run(30), 480);
  assert.equal(run(60), 480);
  assert.equal(run(144), 480);
});

test("catch-up is bounded after a suspended tab", () => {
  const clock = new FixedClock();
  let steps = 0;
  clock.advance(60, () => steps++);
  assert.equal(steps, 12);
});

test("swept collision catches a target between distant endpoints", () => {
  const hit = segmentSphere({ x: -10, y: 2, z: 0 }, { x: 10, y: 2, z: 0 }, { x: 0, y: 2, z: 0 }, 0.5);
  assert.ok(Math.abs(hit - 0.475) < 1e-8);
  assert.equal(segmentSphere({ x: -10, y: 3, z: 0 }, { x: 10, y: 3, z: 0 }, { x: 0, y: 2, z: 0 }, 0.5), null);
});

test("analog movement preserves small stick input and diagonal speed limit", () => {
  const slow = { x: 0, z: 0 },
    full = { x: 0, z: 0 },
    diagonal = { x: 0, z: 0 };
  for (let i = 0; i < 240; i++) {
    movement(slow, { x: 0.25, z: 0 }, STEP, 33, 3.7, 7.6);
    movement(full, { x: 1, z: 0 }, STEP, 33, 3.7, 7.6);
    movement(diagonal, { x: 1, z: 1 }, STEP, 33, 3.7, 7.6);
  }
  assert.ok(slow.x < full.x * 0.4);
  assert.ok(Math.hypot(diagonal.x, diagonal.z) <= 7.60001);
  for (let i = 0; i < 240; i++) movement(full, { x: 0, z: 0 }, STEP, 33, 3.7, 7.6);
  assert.ok(full.x < 0.01);
});

test("debris fragments settle on the ground plane instead of falling through", () => {
  const physics = createPhysics();
  addBox(physics, { x: 0, y: 0.5, z: 0 }, { x: 100, y: 1, z: 100 });
  const chunk = addBox(physics, { x: 0, y: 6, z: 0 }, { x: 0.5, y: 0.4, z: 0.5 }, 0.7);
  for (let i = 0; i < 600; i++) physics.world.step(STEP);
  assert.ok(chunk.position.y > 1 && chunk.position.y < 1.6, `rest height ${chunk.position.y}`);
});

test("a shield absorbs first; only a hit through a broken sector breaches", () => {
  const first = damageShields([1, 1, 1], 1);
  assert.deepEqual(first, { shields: [1, 0, 1], breached: false });
  assert.equal(damageShields(first.shields, 1).breached, true);
});

test("mission records store bests instead of accumulating retry scores", () => {
  let records = saveResult({}, 0, 500, 3);
  records = saveResult(records, 0, 400, 2);
  assert.deepEqual(records[0], { score: 500, stars: 3 });
  records = saveResult(records, 0, 600, 2);
  assert.deepEqual(records[0], { score: 600, stars: 3 });
  assert.deepEqual(
    [0, 1, 2].map((c) => MISSIONS.filter((m) => m.chapter === c).length),
    [9, 6, 3],
  );
});

test("saves from before the harbour and canal missions keep their records on the right missions", () => {
  // v2: 0-5 city, 6-8 river (Lock Gate 8), 9-11 rescue.
  const v2 = { records: { 0: { score: 1, stars: 3 }, 5: { score: 2, stars: 2 }, 6: { score: 3, stars: 1 }, 8: { score: 5, stars: 2 }, 11: { score: 4, stars: 3 } }, muted: true };
  const v4 = migrateSave(v2, 2);
  assert.deepEqual(Object.keys(v4.records).map(Number), [0, 5, 9, 14, 17]);
  assert.equal(MISSIONS[9].name, "Mangrove Mile");
  assert.equal(MISSIONS[14].name, "Lock Gate");
  assert.equal(MISSIONS[17].name, "Last Light");
  assert.equal(v4.records[17].score, 4);
  assert.equal(v4.muted, true);
  // v3: 0-8 city and harbour, 9-11 river (Lock Gate 11), 12-14 rescue.
  const v3 = { records: { 8: { score: 1, stars: 1 }, 10: { score: 2, stars: 2 }, 11: { score: 3, stars: 3 }, 12: { score: 4, stars: 1 } } };
  assert.deepEqual(Object.keys(migrateSave(v3, 3).records).map(Number), [8, 10, 14, 15]);
  assert.deepEqual(migrateSave({}).records, {});
});

test("the campaign resumes at the first mission without a record", () => {
  assert.equal(firstOpenMission({}), 0);
  assert.equal(firstOpenMission({ 0: { score: 1, stars: 1 }, 1: { score: 1, stars: 3 } }), 2);
  // A skipped mission is picked up again before later ones.
  assert.equal(firstOpenMission({ 0: { score: 1, stars: 1 }, 2: { score: 1, stars: 1 } }), 1);
  const all = Object.fromEntries(MISSIONS.map((_, i) => [i, { score: 1, stars: 1 }]));
  assert.equal(firstOpenMission(all), 0);
});
