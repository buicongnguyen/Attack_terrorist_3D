import test from "node:test";
import assert from "node:assert/strict";
import { DIFFICULTIES, DIFFICULTY, DEFAULT_DIFFICULTY, BASE_HIT, hitChance, scalePayload, seededRandom, percent } from "../src/difficulty.js";
import { MISSIONS, chapterStart } from "../src/data.js";

test("four modes, Easy first and the default", () => {
  assert.deepEqual(DIFFICULTIES, ["easy", "normal", "hard", "crazy"]);
  assert.equal(DEFAULT_DIFFICULTY, "easy");
  assert.equal(BASE_HIT.length, MISSIONS.length);
});

test("on Easy nothing can hit you in a chapter's first two missions, and later only a little", () => {
  for (const chapter of [0, 1, 2]) {
    const first = chapterStart(chapter);
    const indices = MISSIONS.map((m, i) => (m.chapter === chapter ? i : -1)).filter((i) => i >= 0);
    if (chapter !== 2) {
      assert.equal(hitChance(first, "easy"), 0);
      assert.equal(hitChance(first + 1, "easy"), 0);
    }
    for (const i of indices) assert.ok(hitChance(i, "easy") <= 0.1, `mission ${i}: ${hitChance(i, "easy")}`);
  }
});

test("each harder mode hits more often, never beyond certain", () => {
  for (let i = 0; i < MISSIONS.length; i++) {
    const chances = DIFFICULTIES.map((name) => hitChance(i, name));
    for (let k = 1; k < chances.length; k++) assert.ok(chances[k] >= chances[k - 1], `mission ${i}: ${chances}`);
    assert.ok(chances.every((c) => c >= 0 && c <= 1));
    // Harder modes make even the first missions dangerous.
    assert.ok(chances[3] >= 0.4);
  }
});

test("the levers point the right way from Easy to Crazy", () => {
  const [easy, normal, hard, crazy] = DIFFICULTIES.map((name) => DIFFICULTY[name]);
  for (const key of ["bombs", "power", "assist", "enemyReload", "bargeHp", "rockets", "strikes"]) {
    assert.ok(easy[key] >= normal[key] && normal[key] >= hard[key] && hard[key] >= crazy[key], key);
  }
  for (const key of ["hit", "enemyDamage", "score"]) {
    assert.ok(easy[key] <= normal[key] && normal[key] <= hard[key] && hard[key] <= crazy[key], key);
  }
  assert.equal(normal.bombs, 1, "Normal keeps the designed payloads");
});

test("payloads scale with the mode but never lose a bomb type", () => {
  const payload = { drill: 6, lance: 1, scatter: 4 };
  assert.deepEqual(scalePayload(payload, "easy"), { drill: 9, lance: 2, scatter: 6 });
  assert.deepEqual(scalePayload(payload, "normal"), payload);
  assert.ok(Object.values(scalePayload(payload, "crazy")).every((n) => n >= 1));
  assert.equal(percent(0.05), "5%");
});

test("the per-mission random source repeats exactly", () => {
  const a = seededRandom(42),
    b = seededRandom(42);
  const run = (r) => Array.from({ length: 5 }, () => r());
  assert.deepEqual(run(a), run(b));
  assert.ok(run(seededRandom(7)).every((x) => x >= 0 && x < 1));
});
