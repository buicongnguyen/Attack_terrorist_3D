import test from "node:test";
import assert from "node:assert/strict";
import {
  FixedClock,
  movement,
  segmentSphere,
  createPhysics,
  addBox,
  addBomb,
  forecast,
  guideForce,
} from "../src/physics.js";
import {
  DEFAULT_LOADOUT,
  STEP,
  saveResult,
  damageShields,
  MISSIONS,
} from "../src/data.js";

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
  const hit = segmentSphere(
    { x: -10, y: 2, z: 0 },
    { x: 10, y: 2, z: 0 },
    { x: 0, y: 2, z: 0 },
    0.5,
  );
  assert.ok(Math.abs(hit - 0.475) < 1e-8);
  assert.equal(
    segmentSphere(
      { x: -10, y: 3, z: 0 },
      { x: 10, y: 3, z: 0 },
      { x: 0, y: 2, z: 0 },
      0.5,
    ),
    null,
  );
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
  for (let i = 0; i < 240; i++)
    movement(full, { x: 0, z: 0 }, STEP, 33, 3.7, 7.6);
  assert.ok(full.x < 0.01);
});

test("cannon-es bounce loses energy rather than gaining height", () => {
  const physics = createPhysics();
  addBox(physics, { x: 0, y: -0.5, z: 0 }, { x: 100, y: 1, z: 100 });
  const body = addBomb(
    physics,
    { x: 0, y: 5, z: 0 },
    { ...DEFAULT_LOADOUT, type: "bounce", speed: 0 },
  );
  let touched = false,
    rebound = 0;
  body.addEventListener("collide", () => {
    touched = true;
  });
  for (let i = 0; i < 500; i++) {
    physics.world.step(STEP);
    if (touched) rebound = Math.max(rebound, body.position.y);
  }
  assert.ok(rebound > 0.35 && rebound < 3, `rebound ${rebound}`);
});

test("airborne forecast agrees with the rigid-body trajectory before contact", () => {
  for (const path of ["ballistic", "hook", "zigzag"]) {
    const config = { ...DEFAULT_LOADOUT, path };
    const physics = createPhysics();
    const body = addBomb(physics, { x: 0, y: 30, z: 0 }, config);
    let count = 0;
    const points = forecast({ x: 0, y: 30, z: 0 }, config, () => ++count >= 96);
    for (let i = 0; i < 96; i++) {
      body.force.x += guideForce(i * STEP, config);
      physics.world.step(STEP);
    }
    const last = points.at(-1);
    assert.ok(
      Math.hypot(body.position.x - last.x, body.position.y - last.y) < 0.16,
      path,
    );
  }
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
    [6, 3, 3],
  );
});
