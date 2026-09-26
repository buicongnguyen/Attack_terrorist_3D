import test from "node:test";
import assert from "node:assert/strict";
import { PICKUPS, activeBonuses, badgeWorldSize } from "../src/pickups.js";

test("both weapon bonuses remain independently visible", () => {
  assert.deepEqual(
    activeBonuses({ twin: 6, auto: 4 }).map((b) => b.kind),
    ["star", "gun"],
  );
  assert.deepEqual(
    activeBonuses({ twin: 1, auto: 0 }).map((b) => b.kind),
    ["star"],
  );
  assert.deepEqual(
    activeBonuses({ twin: 0, auto: 1 }).map((b) => b.kind),
    ["gun"],
  );
  assert.equal(activeBonuses({ twin: 0, auto: 0 }).length, 0);
  // Canal help shows its time left beside the weapon bonuses.
  assert.deepEqual(
    activeBonuses({ twin: 0, auto: 2, heli: 12, ally: 3 }).map((b) => b.kind),
    ["gun", "heli", "ally"],
  );
});

test("pickup rules preserve distinct effects and rewards", () => {
  assert.equal(PICKUPS.star.duration, 10);
  assert.equal(PICKUPS.gun.duration, 8);
  assert.equal(PICKUPS.heli.duration, 20);
  assert.equal(PICKUPS.ally.duration, 25);
  assert.equal(PICKUPS.medal.reward, 250);
  // Four crate models; the badge above each names what it gives.
  assert.equal(new Set(Object.values(PICKUPS).map((p) => p.model)).size, 4);
  assert.equal(new Set(Object.values(PICKUPS).map((p) => p.label)).size, Object.keys(PICKUPS).length);
});

test("pickup badges maintain their screen size across camera zoom and viewports", () => {
  for (const height of [390, 844, 900]) {
    for (const zoom of [1, 1.5, 2]) {
      const camera = { top: 40, bottom: -40, zoom };
      const size = badgeWorldSize(camera, height, 46);
      const projected =
        (size.width / ((camera.top - camera.bottom) / zoom)) * height;
      assert.ok(Math.abs(projected - 46) < 1e-9);
      assert.ok(size.height > size.width);
    }
  }
});
