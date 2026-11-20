import test from "node:test";
import assert from "node:assert/strict";
import { UPGRADES, earned, sanitize, spent, available, nextCost, canBuy, buy, bonuses, affordable } from "../src/requisition.js";
import { surgeWindow, STRIKE_MISSIONS } from "../src/strike-data.js";
import { DIFFICULTIES, DIFFICULTY } from "../src/difficulty.js";
import { MISSIONS } from "../src/data.js";

const star = (n) => ({ score: 1, stars: n });

test("six upgrades, two per vehicle, and the whole set costs less than the campaign offers", () => {
  assert.equal(UPGRADES.length, 6);
  for (const chapter of [0, 1, 2]) assert.equal(UPGRADES.filter((u) => u.chapter === chapter).length, 2);
  const everything = UPGRADES.reduce((sum, u) => sum + u.costs.reduce((a, b) => a + b, 0), 0);
  assert.equal(everything, 45);
  assert.ok(everything < MISSIONS.length * 3, "a build has to be chosen");
  for (const u of UPGRADES) assert.ok(u.costs.length === 2 && u.costs[1] > u.costs[0], u.id);
});

test("stars are the points; the best result of each mission counts, capped at three", () => {
  assert.equal(earned({}), 0);
  assert.equal(earned({ 0: star(3), 1: star(2), 2: star(0) }), 5);
  assert.equal(earned({ 0: star(9), 1: star(-4) }), 3);
  assert.equal(earned(null), 0);
});

test("buying spends points, in order, and never overspends", () => {
  const records = { 0: star(3), 1: star(2) };
  assert.equal(available(records, {}), 5);
  assert.equal(nextCost("ordnance", {}), 3);
  const one = buy("ordnance", records, {});
  assert.deepEqual(one, { ordnance: 1 });
  assert.equal(available(records, one), 2);
  assert.equal(buy("ordnance", records, one), null, "the second level costs 6");
  assert.equal(canBuy("blast", records, one), true);
  const two = buy("blast", records, one);
  assert.equal(available(records, two), 0);
  assert.equal(buy("flares", records, two), null);
  assert.equal(spent(two), 5);
  // The top level cannot be passed.
  const rich = Object.fromEntries(Array.from({ length: 19 }, (_, i) => [i, star(3)]));
  let levels = {};
  for (let i = 0; i < 20; i++) levels = buy("pods", rich, levels) || levels;
  assert.deepEqual(levels, { pods: 2 });
  assert.equal(nextCost("pods", levels), null);
});

test("a hand-edited save is cleaned: unknown ids, fractions, negatives and huge levels", () => {
  assert.deepEqual(sanitize({ ordnance: 9, nope: 2, blast: -1, plating: 1.7, pods: "2", flares: NaN }), { ordnance: 2, plating: 1, pods: 2 });
  assert.deepEqual(sanitize(null), {});
});

test("levels turn into the numbers the game applies, and a fresh save changes nothing", () => {
  assert.deepEqual(bonuses({}), { bombs: 0, power: 1, bargeHp: 1, rockets: 1, flares: 0, heliRockets: 0, heliGuided: 0 });
  const all = bonuses({ ordnance: 2, blast: 2, plating: 2, pods: 2, flares: 2, racks: 2 });
  assert.equal(all.bombs, 2);
  assert.ok(Math.abs(all.power - 1.16) < 1e-9 && Math.abs(all.bargeHp - 1.3) < 1e-9 && Math.abs(all.rockets - 1.6) < 1e-9);
  assert.deepEqual([all.flares, all.heliRockets, all.heliGuided], [4, 8, 4]);
});

test("every strike mission has a surge window that the modes stretch or shrink", () => {
  const strikes = STRIKE_MISSIONS.filter(Boolean);
  assert.equal(strikes.length, 9);
  for (const layout of strikes) {
    const [easy, normal, hard, crazy] = DIFFICULTIES.map((name) => surgeWindow(layout, DIFFICULTY[name]));
    assert.ok(easy > normal && normal > hard && hard > crazy, `window order on ${layout.par}`);
    assert.ok(normal >= 270, "a person needs time to read the map");
  }
  assert.equal(surgeWindow({ par: 1 }, { surge: 1 }), 270);
  assert.equal(surgeWindow({ par: 8, harbour: {} }, { surge: 1 }), 600);
});

test("points are affordable exactly when they cover the cheapest upgrade not yet maxed (5.1)", () => {
  const cheapest = Math.min(...UPGRADES.map((u) => u.costs[0]));
  const stars = (n) => ({ 0: { stars: Math.min(3, n) }, 1: { stars: Math.max(0, n - 3) } });
  assert.equal(affordable(stars(cheapest - 1), {}), false);
  assert.equal(affordable(stars(cheapest), {}), true);
  // With every cheap upgrade maxed, the next cheapest decides.
  const maxed = Object.fromEntries(UPGRADES.filter((u) => u.costs[0] === cheapest).map((u) => [u.id, u.costs.length]));
  const records = Object.fromEntries(Array.from({ length: 19 }, (_, i) => [i, { stars: 3 }]));
  const left = available(records, maxed);
  const next = Math.min(...UPGRADES.map((u) => nextCost(u.id, maxed)).filter((c) => c !== null));
  assert.equal(affordable(records, maxed), left >= next);
});
