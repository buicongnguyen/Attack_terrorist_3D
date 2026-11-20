// Edge markers (5.1 H1): the free play rect and where a chevron sits on its border.
import test from "node:test";
import assert from "node:assert/strict";
import { freeRectOf, borderPlacement, outside, MARKER } from "../src/edge-markers.js";

const rect = (left, top, right, bottom) => ({ left, top, right, bottom });
const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

test("the free rect is the whole viewport when no HUD is up", () => {
  assert.deepEqual(freeRectOf([], 390, 844), rect(0, 0, 390, 844));
});

test("the free rect clears a phone HUD and keeps the screen centre", () => {
  // 390x844 Chapter 1: top bar, radio, pattern panel and stick above the flight panel.
  const hud = [rect(0, 0, 390, 52), rect(8, 160, 382, 230), rect(270, 470, 382, 640), rect(8, 540, 104, 636), rect(8, 650, 382, 836)];
  const free = freeRectOf(hud, 390, 844);
  for (const r of hud) assert.ok(!overlaps(free, r), `overlaps ${JSON.stringify(r)}`);
  assert.ok(free.left <= 195 && free.right >= 195 && free.top <= 422 && free.bottom >= 422);
  // The full width between the radio and the pattern panel beats a narrow column down the middle.
  assert.deepEqual(free, rect(0, 230, 390, 470));
});

test("a centre covered by a panel still yields the largest clear rect", () => {
  const free = freeRectOf([rect(100, 300, 300, 500)], 400, 800);
  assert.ok(!overlaps(free, rect(100, 300, 300, 500)));
  assert.equal((free.right - free.left) * (free.bottom - free.top), 400 * 300);
});

test("the free rect fills the object it is given", () => {
  const out = rect(1, 2, 3, 4);
  assert.equal(freeRectOf([rect(0, 0, 100, 50)], 100, 200, out), out);
  assert.deepEqual(out, rect(0, 50, 100, 200));
});

test("a point above the rect puts the marker on its top border, pointing up", () => {
  const free = rect(0, 100, 390, 600),
    out = {};
  borderPlacement(free, 195, -40, MARKER.width, MARKER.height, out);
  assert.equal(out.y - MARKER.height / 2, free.top);
  assert.equal(out.x, 195);
  assert.equal(out.angle, 0);
  assert.equal(out.beyond, 140);
});

test("markers stay inside the rect on every side and point at their target", () => {
  const free = rect(20, 60, 820, 330),
    out = {};
  for (const [x, y] of [[-200, 200], [1200, 100], [400, 900], [-50, -50], [900, 400]]) {
    borderPlacement(free, x, y, MARKER.width, MARKER.height, out);
    const box = rect(out.x - MARKER.width / 2, out.y - MARKER.height / 2, out.x + MARKER.width / 2, out.y + MARKER.height / 2);
    assert.ok(box.left >= free.left - 1e-9 && box.right <= free.right + 1e-9 && box.top >= free.top - 1e-9 && box.bottom <= free.bottom + 1e-9, `box for ${x},${y}`);
    // The direction from the rect's centre to the target, 0 = up, clockwise.
    const cx = (free.left + free.right) / 2,
      cy = (free.top + free.bottom) / 2;
    assert.ok(Math.abs(out.angle - Math.atan2(x - cx, -(y - cy))) < 1e-9);
    assert.ok(out.beyond > 0);
  }
});

test("outside() is strict about the border", () => {
  const free = rect(0, 0, 100, 100);
  assert.equal(outside(free, 50, 50), false);
  assert.equal(outside(free, 100, 100), false);
  assert.equal(outside(free, 50, -1), true);
  assert.equal(outside(free, 101, 50), true);
});
