import test from "node:test";
import assert from "node:assert/strict";
import { ROUNDS, ROUND_ORDER, MAX_MAGAZINES, emptyRounds, bestRound, spendRound, addRounds, roundEffect } from "../src/armoury.js";
import { PICKUPS } from "../src/pickups.js";
import { RIVER_MISSIONS } from "../src/river-data.js";
import { RESCUE_MAPS } from "../src/rescue-data.js";

test("the gun fires the strongest rounds in stock and never runs dry", () => {
  let stock = emptyRounds();
  assert.equal(bestRound(stock), "standard");
  stock = addRounds(stock, "ap", 2);
  stock = addRounds(stock, "plasma", 1);
  const fired = [];
  for (let i = 0; i < 5; i++) {
    const shot = spendRound(stock);
    fired.push(shot.kind);
    stock = shot.stock;
  }
  // Plasma first, then AP, then standard rounds for ever.
  assert.deepEqual(fired, ["plasma", "ap", "ap", "standard", "standard"]);
  assert.deepEqual(stock, emptyRounds());
});

test("each grade hits at least as hard as the one below, and the best do more", () => {
  const order = [...ROUND_ORDER].reverse();
  for (let i = 1; i < order.length; i++) {
    const weaker = roundEffect(order[i - 1], 2),
      stronger = roundEffect(order[i], 2);
    const worth = (r) => r.damage * r.pierce + r.splashDamage;
    assert.ok(worth(stronger) > worth(weaker), `${order[i]} beats ${order[i - 1]}`);
  }
  // Marlin's gun does 2 a round, Lantern's 1: rounds multiply either.
  assert.equal(roundEffect("plasma", 2).damage, 6);
  assert.equal(roundEffect("plasma", 1).damage, 3);
  assert.equal(roundEffect("he", 1).splash, ROUNDS.he.splash);
  assert.equal(roundEffect("standard", 2).pierce, 1);
});

test("a stock holds at most two magazines of a kind", () => {
  let stock = emptyRounds();
  for (let i = 0; i < 5; i++) stock = addRounds(stock, "he");
  assert.equal(stock.he, ROUNDS.he.magazine * MAX_MAGAZINES);
  assert.deepEqual(addRounds(stock, "standard"), stock);
});

test("every kind of round has a crate, and crates are on the water and in the valleys", () => {
  for (const kind of ["ap", "he", "plasma"]) {
    assert.equal(PICKUPS[kind].rounds, kind);
    assert.ok(RIVER_MISSIONS.some((m) => m.script.some((e) => e.type === "pickup" && e.kind === kind)), `${kind} on the canal`);
    assert.ok(RESCUE_MAPS.some((m) => m.supplies.some((s) => s.kind === kind)), `${kind} in the valleys`);
  }
  // Every canal mission and every sortie carries at least one crate of rounds.
  for (const m of RIVER_MISSIONS) assert.ok(m.script.some((e) => e.type === "pickup" && PICKUPS[e.kind].rounds));
  for (const m of RESCUE_MAPS) assert.ok(m.supplies.some((s) => PICKUPS[s.kind].rounds));
});
