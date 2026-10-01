import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Swarm, rectWater, angleDelta } from "../src/swarm.js";
import { Perchers } from "../src/birds.js";
import { Governor, QUALITY, rendererOptions } from "../src/quality.js";
import { dampAngle } from "../src/harbour.js";
import { RESCUE_MAPS, riverAt, riverEdge } from "../src/rescue-data.js";

const tint = { color: new THREE.Color(0x2a8a9a), mix: 0.2, opacity: 0.8 };
const colors = [[0xff7a2a, 0xffd27a]];
const run = (thing, seconds, step = 1 / 60) => {
  for (let t = 0; t < seconds; t += step) thing.update(step);
};
const positions = (s) => Array.from({ length: s.count }, (_, i) => [s.x[i], s.z[i]]);

test("fish keep to their water, and a seed replays the same school", () => {
  const water = rectWater({ minX: -10, maxX: 10, minZ: -20, maxZ: 20 });
  const a = new Swarm({ water, count: 30, schools: 6, colors, tint, seed: 4 });
  const b = new Swarm({ water, count: 30, schools: 6, colors, tint, seed: 4 });
  run(a, 60);
  run(b, 60);
  assert.equal(a.inside(), 30);
  assert.deepEqual(positions(a), positions(b));
});

test("a scare sends fish darting away", () => {
  const water = rectWater({ minX: -30, maxX: 30, minZ: -30, maxZ: 30 });
  const s = new Swarm({ water, count: 20, schools: 4, colors, tint, seed: 9 });
  // Around the first fish, wherever its school started.
  const cx = s.x[0] + 0.5,
    cz = s.z[0] + 0.5,
    d = (i) => Math.hypot(s.x[i] - cx, s.z[i] - cz);
  const near = [];
  for (let i = 0; i < s.count; i++) if (d(i) < 12) near.push(i);
  const before = near.map(d);
  s.scare(cx, cz, 12);
  // A dart is a turn and a burst: after a second they are well apart.
  run(s, 1);
  const after = near.map(d);
  assert.ok(near.length > 0);
  assert.ok(after.reduce((a, b) => a + b) > before.reduce((a, b) => a + b) + near.length, "they spread out");
});

test("canal fish drift with the flow and wrap round as whole schools", () => {
  const water = rectWater({ minX: -16, maxX: 16, minZ: -64, maxZ: 34 });
  const s = new Swarm({ water, count: 32, schools: 8, colors, tint, seed: 3 });
  for (let t = 0; t < 40; t += 1 / 60) {
    s.drift(6 / 60);
    s.update(1 / 60);
  }
  for (let i = 0; i < s.count; i++) {
    assert.ok(s.z[i] > -70 && s.z[i] < 40, `fish ${i} at z ${s.z[i]}`);
    // A follower stays with its leader across the wrap.
    const lead = s.leader[i];
    assert.ok(Math.hypot(s.x[i] - s.x[lead], s.z[i] - s.z[lead]) < 12, `fish ${i} lost its school`);
  }
});

test("river fish follow a winding river without getting stuck on its banks", () => {
  const map = RESCUE_MAPS[1];
  const water = {
    minX: -48,
    maxX: 48,
    minZ: -246,
    maxZ: 28,
    contains: (x, z) => z >= -246 && z <= 28 && riverEdge(map, x, z) < -0.9,
    random: (rng, x, z) => {
      const at = z === undefined ? -246 + rng() * 274 : Math.max(-246, Math.min(28, z + (rng() - 0.5) * 30));
      const r = riverAt(map, at);
      return { x: r.x + (rng() - 0.5) * Math.max(0, r.width - 2.6), z: at };
    },
  };
  const s = new Swarm({ water, count: 24, schools: 6, colors, tint, seed: 5 });
  const start = positions(s);
  run(s, 45);
  assert.equal(s.inside(), 24);
  const moved = positions(s).filter(([x, z], i) => Math.hypot(x - start[i][0], z - start[i][1]) > 3).length;
  assert.ok(moved >= 20, `only ${moved} fish moved`);
});

const roof = (x, z) => [0, 1, 2, 3].map((k) => ({ x: x + k * 0.8, y: 5, z }));

test("startled birds take off nearest first, the whole group follows, and they settle elsewhere", () => {
  // Three full roofs, and two empty ones to settle on.
  const birds = new Perchers({ groups: [roof(0, 0), roof(30, 0), roof(-30, 20)], fill: 1, colors: [0x56627a], seed: 2 });
  birds.spots.push(...roof(40, 30).map((s) => ({ ...s, group: 3, owner: -1 })), ...roof(-40, -30).map((s) => ({ ...s, group: 4, owner: -1 })));
  assert.equal(birds.count, 12);
  // A blast by the first bird of the first group: its group goes, nearest first.
  assert.equal(birds.startle(-1, 0, 2), 1);
  const order = [0, 1, 2, 3].map((i) => birds.timer[i]);
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.equal(birds.counts().flying, 4);
  run(birds, 1);
  assert.ok(birds.y[3] > 5.5, "they climb away");
  run(birds, 40);
  assert.deepEqual(birds.counts(), { birds: 12, perched: 12, flying: 0 });
  // With free perches elsewhere, nobody lands back where the trouble was.
  for (let i = 0; i < 4; i++) assert.ok(Math.hypot(birds.x[i] + 1, birds.z[i]) > 12, `bird ${i} came back`);
});

test("a blast strikes off nearby perches, and reduced motion keeps birds on theirs", () => {
  const birds = new Perchers({ groups: [roof(0, 0), roof(12, 0), roof(40, 0)], fill: 0.5, colors: [0x56627a], seed: 6 });
  // A burst high over the roof leaves it; one on the roof strikes it off.
  birds.spoil(13, 30, 0, 4);
  assert.equal(birds.spots.filter((s) => s.spoiled).length, 0);
  birds.spoil(13, 5, 0, 4);
  assert.ok(birds.spots.filter((s) => s.spoiled).length >= 3);
  birds.startle(0, 0, 50);
  run(birds, 40);
  for (let i = 0; i < birds.count; i++) assert.ok(!birds.spots[birds.spot[i]].spoiled, "landed on a struck-off perch");
  const calm = new Perchers({ groups: [roof(0, 0)], fill: 1, colors: [0x56627a], seed: 6, quiet: true });
  assert.equal(calm.startle(0, 0, 10), 0);
  assert.equal(calm.counts().perched, 4);
});

test("headings turn the short way round", () => {
  // From facing -90 degrees to 180: a quarter turn the short way, not three quarters.
  assert.ok(Math.abs(angleDelta(-Math.PI / 2, Math.PI)) < Math.PI / 2 + 1e-9);
  const step = dampAngle(-Math.PI / 2, Math.PI, 10, 0.05);
  assert.ok(step < -Math.PI / 2, `turned the long way to ${step}`);
});

test("the graphics governor trades resolution, then the level, and recovers", () => {
  const phone = new Governor({ mobile: true, dpr: 3 });
  assert.equal(phone.level, "medium");
  assert.equal(phone.ratio, QUALITY.medium.ratio);
  const second = (fps, playing = true) => {
    let change = null;
    for (let i = 0; i < fps; i++) change = phone.sample(1 / fps + 1e-9, playing) || change;
    return change;
  };
  // Two slow seconds are not enough; the third lowers the resolution a step.
  assert.equal(second(30), null);
  assert.equal(second(30), null);
  assert.equal(second(30), "ratio");
  assert.equal(phone.ratio, 1);
  for (let i = 0; i < 2; i++) second(30);
  assert.equal(second(30), "level");
  assert.equal(phone.level, "low");
  // Not counted while not playing (menus, the first seconds), nor hitches over a quarter second.
  assert.equal(second(20, false), null);
  assert.equal(phone.sample(0.4, true), null);
  // A fast second raises the resolution toward the level's target.
  phone.choose("auto");
  phone.ratio = 1;
  assert.equal(second(60), "ratio");
  assert.equal(phone.ratio, 1.25);
  // A fixed choice never adapts; desktops keep Tidelock's 1.75 cap.
  assert.equal(new Governor({ mobile: false, dpr: 2 }).ratio, 1.75);
  assert.equal(rendererOptions({ mobile: true, dpr: 3 }).antialias, false);
  assert.equal(rendererOptions({ mobile: false, dpr: 1 }).antialias, true);
  assert.equal(rendererOptions({ mobile: false, dpr: 1 }).preserveDrawingBuffer, false);
  assert.equal(rendererOptions({ mobile: false, dpr: 1 }, true).preserveDrawingBuffer, true);
});

test("after any sequence of scares every bird settles again (none circles a perch for ever)", () => {
  const groups = [];
  for (let k = 0; k < 8; k++) groups.push(roof((k % 4) * 14 - 20, Math.floor(k / 4) * 16 - 8));
  const birds = new Perchers({ groups, fill: 0.55, colors: [0x56627a], seed: 21 });
  let seed = 3;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let t = 0; t < 12; t += 1 / 60) {
    if (rand() < 0.03) birds.startle(rand() * 60 - 30, rand() * 40 - 20, 8);
    birds.update(1 / 60);
  }
  run(birds, 60);
  assert.equal(birds.counts().flying, 0);
  for (let i = 0; i < birds.count; i++) assert.ok(Number.isFinite(birds.x[i] + birds.y[i] + birds.z[i]));
});
