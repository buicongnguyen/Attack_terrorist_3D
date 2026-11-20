import test from "node:test";
import assert from "node:assert/strict";
import { createLoop } from "../src/loop.js";
import { FixedClock } from "../src/physics.js";
import { STEP } from "../src/data.js";
import { GRACE } from "../src/quality.js";

// A game, HUD, view and governor that only record what the loop asks of them.
function rig({ change = () => null, hidden = () => false, radio = null } = {}) {
  const log = { steps: [], renders: 0, huds: 0, inputs: 0, samples: [], applied: 0, graphics: 0 };
  const game = {
    paused: false,
    status: "playing",
    time: 0,
    shake: 0.2,
    reducedMotion: false,
    ambientBudget: 1,
    update(dt) {
      log.steps.push(dt);
      this.time += dt;
    },
  };
  const ui = {
    updateInput: () => log.inputs++,
    updateHUD: () => log.huds++,
    updateGraphics: () => log.graphics++,
  };
  const view = {
    needsRender: false,
    render: (time, shake) => {
      log.renders++;
      log.lastRender = { time, shake };
    },
    applyQuality: () => log.applied++,
  };
  const governor = {
    profile: { life: 0.5 },
    sample: (real, active) => {
      log.samples.push({ real, active });
      return change(log.samples.length);
    },
  };
  const clock = new FixedClock();
  let now = 1000;
  const loop = createLoop({ clock, governor, game, ui, view, radio, now, hidden });
  // Frames `ms` apart (one number per frame).
  const frames = (...gaps) => {
    for (const ms of gaps) {
      now += ms;
      loop.frame(now);
    }
  };
  return { log, game, view, clock, frames };
}

const repeat = (ms, n) => Array.from({ length: n }, () => ms);
// The steps a stretch of unpaused time owes: each frame counts at most 0.1 s, steps are 1/120 s.
const owed = (gaps) => Math.floor(gaps.reduce((sum, ms) => sum + Math.min(ms / 1000, 0.1), 0) / STEP + 1e-6);

test("fixed steps follow the clamped real time, each exactly 1/120 s", () => {
  for (const gaps of [repeat(16.7, 120), repeat(33, 60), [16.7, 16.7, 250, 16.7, 16.7], [8.3, 8.4, 8.3, 8.4, 8.3, 8.4, 8.3]]) {
    const { log, frames } = rig();
    frames(...gaps);
    assert.equal(log.steps.length, owed(gaps), `gaps ${gaps.slice(0, 3).join(", ")}...`);
    assert.ok(log.steps.every((dt) => dt === 1 / 120));
    assert.equal(log.renders, gaps.length, "a running game renders every frame");
    assert.equal(log.huds, gaps.length);
    assert.equal(log.inputs, gaps.length);
  }
});

test("a 250 ms hitch counts as 0.1 s: 12 steps, never a burst of 30", () => {
  const { log, frames } = rig();
  frames(16.7);
  const before = log.steps.length;
  frames(250);
  assert.equal(log.steps.length - before, 12);
  // The governor still sees the real frame time.
  assert.equal(Math.round(log.samples.at(-1).real * 1000), 250);
});

test("paused frames run no steps, reset the clock and render once; resume picks up cleanly", () => {
  const { log, game, view, clock, frames } = rig();
  frames(...repeat(16.7, 10));
  const renders = log.renders;
  // Leave part of a step in the accumulator, then pause.
  frames(5);
  assert.ok(clock.accumulator > 0);
  const steps = log.steps.length;
  game.paused = true;
  frames(16.7);
  assert.equal(clock.accumulator, 0, "a paused frame resets the clock");
  assert.equal(log.renders, renders + 2, "the frame that pauses still renders");
  frames(...repeat(16.7, 30));
  assert.equal(log.steps.length, steps, "no steps while paused");
  assert.equal(log.renders, renders + 2, "paused frames after the first draw nothing");
  view.needsRender = true;
  frames(16.7);
  assert.equal(log.renders, renders + 3, "a paused view that asks for a render gets one");
  view.needsRender = false;
  game.paused = false;
  const resumed = log.steps.length;
  frames(...repeat(16.7, 6));
  assert.equal(log.steps.length - resumed, owed(repeat(16.7, 6)), "resuming owes nothing for the pause");
  assert.equal(log.renders, renders + 9);
  assert.equal(log.huds, 10 + 1 + 1 + 30 + 1 + 6, "the HUD refreshes every frame, paused or not");
});

test("renders pass the game time, and shake unless motion is reduced", () => {
  const { log, game, frames } = rig();
  frames(16.7, 16.7);
  assert.deepEqual(log.lastRender, { time: game.time, shake: 0.2 });
  game.reducedMotion = true;
  frames(16.7);
  assert.equal(log.lastRender.shake, 0);
});

test("the governor counts only live play past the grace period, and its changes apply", () => {
  const { log, game, frames } = rig({ change: (n) => (n === 3 ? "ratio" : null) });
  frames(16.7);
  assert.equal(log.samples[0].active, false, "inside the grace period");
  game.time = GRACE + 1;
  frames(16.7);
  assert.equal(log.samples[1].active, true);
  frames(16.7);
  assert.equal(log.applied, 1);
  assert.equal(game.ambientBudget, 0.5);
  assert.equal(log.graphics, 1);
  game.paused = true;
  frames(16.7);
  game.paused = false;
  game.status = "success";
  frames(16.7);
  assert.deepEqual(
    log.samples.slice(3).map((s) => s.active),
    [false, false],
  );
});

test("a hidden page never counts as slow play", () => {
  let hidden = true;
  const { log, game, frames } = rig({ hidden: () => hidden });
  game.time = GRACE + 1;
  frames(16.7);
  hidden = false;
  frames(16.7);
  assert.deepEqual(
    log.samples.map((s) => s.active),
    [false, true],
  );
});

test("the radio director is ticked once per step with the step's dt, never while paused (5.1)", () => {
  const ticks = [];
  const { log, game, frames } = rig({ radio: { tick: (dt) => ticks.push(dt) } });
  frames(...repeat(16, 30));
  assert.deepEqual(ticks, log.steps);
  game.paused = true;
  frames(...repeat(16, 10));
  assert.equal(ticks.length, log.steps.length);
});
