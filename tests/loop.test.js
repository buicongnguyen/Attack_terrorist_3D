import test from "node:test";
import assert from "node:assert/strict";
import { createLoop, FEEL, shakeOffset, Present } from "../src/loop.js";
import { FixedClock } from "../src/physics.js";
import { STEP } from "../src/data.js";
import { GRACE } from "../src/quality.js";

// A game, HUD, view and governor that only record what the loop asks of them.
function rig({ change = () => null, hidden = () => false, radio = null, feel = true, onStep = null, start = 1000 } = {}) {
  const log = { steps: [], renders: 0, huds: 0, inputs: 0, samples: [], applied: 0, graphics: 0, stepsPerFrame: [] };
  const game = {
    paused: false,
    status: "playing",
    time: 0,
    shake: 0.2,
    impact: { stop: 0, slow: 0, kick: false, kickX: 0, kickZ: 0, fresh: false },
    reducedMotion: false,
    ambientBudget: 1,
    update(dt) {
      log.steps.push(dt);
      this.time += dt;
      onStep?.(this, log.steps.length);
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
      log.lastRender = { time, shake: shake && { ...shake } };
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
  let now = start;
  const loop = createLoop({ clock, governor, game, ui, view, radio, now, hidden, feel });
  // Frames `ms` apart (one number per frame); the steps each frame ran are logged.
  const frames = (...gaps) => {
    for (const ms of gaps) {
      now += ms;
      const before = log.steps.length;
      loop.frame(now);
      log.stepsPerFrame.push(log.steps.length - before);
    }
  };
  return { log, game, view, clock, frames, present: game.present, at: () => now };
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

test("renders pass the game time, and a shake offset unless motion is reduced", () => {
  const { log, game, frames } = rig();
  frames(16.7, 16.7);
  assert.equal(log.lastRender.time, game.time);
  assert.ok(Math.hypot(log.lastRender.shake.x, log.lastRender.shake.y) > 0, "trauma shakes the camera");
  game.reducedMotion = true;
  frames(16.7);
  assert.equal(log.lastRender.shake, null);
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

// ---------------------------------------------------------------- the present (5.1 J1)

// A rig whose game asks for `stop` s of hit-stop (and `slow` s of slow motion) on step `at`.
const asking = (at, stop, slow = 0, options = {}) =>
  rig({
    ...options,
    onStep: (game, n) => {
      if (n !== at) return;
      game.impact.stop = Math.max(game.impact.stop, stop);
      game.impact.slow = slow;
    },
  });

test("a 90 ms stop runs no steps, and the frame after it at most one (no catch-up burst)", () => {
  const { log, frames, present, at } = asking(20, FEEL.stop.heavy);
  frames(...repeat(16.7, 10));
  assert.ok(present.stopUntil > at() / 1000, "the stop starts on the frame of the hit");
  const asked = log.stepsPerFrame.length;
  while (at() + 16.7 < present.stopUntil * 1000) frames(16.7);
  assert.ok(log.stepsPerFrame.length - asked >= 5, "five frames fall inside 90 ms");
  assert.ok(log.stepsPerFrame.slice(asked).every((n) => n === 0), "no steps during the stop");
  frames(16.7);
  assert.ok(log.stepsPerFrame.at(-1) <= 1, `first frame after: ${log.stepsPerFrame.at(-1)} steps`);
  frames(...repeat(16.7, 30));
  assert.ok(log.stepsPerFrame.slice(-29).every((n) => n === 2 || n === 1), "then the usual pace");
  assert.ok(log.steps.every((dt) => dt === 1 / 120), "every step is exactly 1/120 s");
});

test("slow motion runs floor(0.4 x real time x 120) steps, each 1/120 s", () => {
  for (const [gap, frameCount] of [
    [20, 24],
    [16, 30],
    [8, 60],
  ]) {
    const { log, frames, present } = asking(1, 0, 1);
    frames(20);
    assert.ok(present.slowUntil > 0);
    const before = log.steps.length;
    frames(...repeat(gap, frameCount));
    const real = (gap * frameCount) / 1000;
    assert.equal(log.steps.length - before, Math.floor(FEEL.rate * real * 120 + 1e-6), `${gap} ms frames`);
    assert.ok(log.steps.every((dt) => dt === 1 / 120));
  }
});

test("ten key kills in one frame, every frame, still stop at most 160 ms in any second", () => {
  const { frames, present, at } = rig({
    onStep: (game) => {
      for (let i = 0; i < 10; i++) game.impact.stop = Math.max(game.impact.stop, i === 9 ? FEEL.stop.decisive : FEEL.stop.heavy);
    },
  });
  const windows = [];
  let last = present.stopUntil;
  for (let i = 0; i < 600; i++) {
    frames(4);
    if (present.stopUntil !== last) {
      windows.push([at() / 1000, present.stopUntil]);
      last = present.stopUntil;
    }
  }
  assert.ok(windows.length > 3, `${windows.length} stops in 2.4 s`);
  assert.ok(windows.every(([a, b]) => b - a <= FEEL.stop.decisive + 1e-9));
  // The worst second ends at the end of some stop.
  for (const [, end] of windows) {
    const inside = windows.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, end) - Math.max(a, end - 1)), 0);
    assert.ok(inside <= FEEL.cap + 1e-9, `${(inside * 1000).toFixed(1)} ms of stop in the second before ${end.toFixed(3)}`);
  }
});

test("reduced motion, and ?qa without &feel=1, never stop", () => {
  for (const [options, reduced] of [
    [{}, true],
    [{ feel: false }, false],
  ]) {
    const { log, game, frames, present } = asking(10, FEEL.stop.decisive, FEEL.slow, options);
    game.reducedMotion = reduced;
    frames(...repeat(16.7, 60));
    assert.equal(present.stopUntil, -Infinity);
    assert.equal(present.slowUntil, -Infinity);
    assert.equal(log.steps.length, owed(repeat(16.7, 60)), "every step owed still runs");
    assert.equal(game.impact.stop, 0, "the request is dropped, not kept");
  }
});

test("shake offsets at the same real times are equal at 60 and 120 fps", () => {
  const run = (fps) => {
    const r = rig({ start: 5000 });
    r.game.shake = 1;
    const gap = 1000 / fps,
      out = [];
    for (let i = 0; i < fps; i++) {
      // The kick is asked for just before the frame at 1/60 s, at either rate.
      if (i === fps / 60 - 1) Object.assign(r.game.impact, { kick: true, kickX: 0.6, kickZ: -0.8 });
      r.frames(gap);
      if (fps === 60 || i % 2) out.push(r.log.lastRender.shake);
    }
    return out;
  };
  const a = run(60),
    b = run(120);
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) for (const k of ["x", "y", "kx", "kz"]) assert.ok(Math.abs(a[i][k] - b[i][k]) <= 1e-6, `frame ${i} ${k}: ${a[i][k]} vs ${b[i][k]}`);
  assert.ok(Math.abs(a[0].kx) > 0.05, "the kick shows at once");
  assert.ok(a.slice(8).every((o) => o.kx === 0 && o.kz === 0), "and is gone after 0.12 s");
  assert.ok(Math.abs(a[5].x) + Math.abs(a[5].y) > 0, "trauma shakes");
  assert.ok(a.at(-1).x === 0 && a.at(-1).y === 0, "trauma 1 has decayed to nothing after 1 s");
});

test("the shake noise is smooth, bounded and below Nyquist at 60 fps", () => {
  const present = new Present(),
    o = { x: 0, y: 0, kx: 0, kz: 0 };
  let prev = shakeOffset(o, 1, 100, present).x,
    max = 0,
    jump = 0;
  for (let t = 100; t < 110; t += 1 / 600) {
    const x = shakeOffset(o, 1, t, present).x;
    max = Math.max(max, Math.abs(x));
    jump = Math.max(jump, Math.abs(x - prev));
    prev = x;
  }
  assert.ok(max <= FEEL.reach + 1e-9 && max > FEEL.reach * 0.3, `peak ${max}`);
  // 16 Hz at most: a 600 Hz sample never moves more than a sliver of the reach.
  assert.ok(jump < FEEL.reach * 0.12, `largest step ${jump}`);
  assert.equal(shakeOffset(o, 0, 104.2, present).x, 0, "no trauma, no shake");
});

test("a mission started during a deciding hit's stop and slow motion starts at full pace", () => {
  const { log, game, frames, present } = asking(4, FEEL.stop.decisive, FEEL.slow);
  frames(16.7, 16.7);
  assert.ok(present.held && present.slowUntil > 0, "the deciding hit is holding the frame");
  // Game.start marks the impact fresh.
  Object.assign(game.impact, { stop: 0, slow: 0, kick: false, fresh: true });
  const before = log.steps.length;
  frames(...repeat(16.7, 30));
  assert.equal(present.stopUntil, -Infinity);
  assert.equal(present.slowUntil, -Infinity);
  assert.equal(present.held, false);
  assert.equal(game.impact.fresh, false);
  assert.equal(log.steps.length - before, owed(repeat(16.7, 30)), "no stop or slow steps carried over");
});
