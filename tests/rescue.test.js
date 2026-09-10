import test from "node:test";
import assert from "node:assert/strict";
import {
  rescueLayout,
  hoverReady,
  rescueProgress,
  isHostileEntity,
} from "../src/rescue-data.js";

test("rescue routes grow in length and soldiers remain within the valley", () => {
  for (const n of [2, 3, 4]) {
    const map = rescueLayout(n);
    assert.equal(map.survivors.length, n);
    assert.equal(map.supplies.length, n * 2);
    assert.ok(Math.abs(map.survivors.at(-1).z) > n * 40);
    for (const s of map.survivors) {
      assert.ok(s.x >= map.bounds.left && s.x <= map.bounds.right);
      assert.ok(s.z >= map.bounds.far && s.z < map.base.z);
    }
  }
});

test("the winch requires proximity, a slow hover, and a clear zone", () => {
  const site = { x: 20, z: -30 };
  assert.ok(hoverReady(site, { x: 0, z: 0 }, site));
  assert.ok(!hoverReady({ x: 26, z: -30 }, { x: 0, z: 0 }, site));
  assert.ok(!hoverReady(site, { x: 2, z: 0 }, site));
  assert.ok(!hoverReady(site, { x: 0, z: 0 }, site, true));
});

test("collecting every soldier is not victory before returning to base", () => {
  assert.equal(rescueProgress(0, 2, 0), 0);
  assert.equal(rescueProgress(1, 2, 50), 0.4);
  assert.ok(rescueProgress(2, 2, 0) < 1);
});

test("friendly soldiers, supplies, and hidden caves are not weapon targets", () => {
  assert.ok(!isHostileEntity({ type: "survivor", friendly: true }));
  assert.ok(!isHostileEntity({ type: "pickup" }));
  assert.ok(!isHostileEntity({ type: "cave", phase: "hidden" }));
  assert.ok(isHostileEntity({ type: "aa-truck" }));
  assert.ok(isHostileEntity({ type: "drone" }));
});
