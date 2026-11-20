import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FIELDS,
  RESERVED,
  SCHEMA,
  diffRows,
  formatChange,
  headerWarnings,
  matchKey,
  mergeRows,
  outside,
  parseAllow,
  parseMissions,
  rowKey,
  serialize,
  sortRows,
} from "./golden-diff.js";

// A schema-1 row with every field; `extra` overrides some.
const row = (key, extra = {}) => ({
  ...Object.fromEntries(FIELDS.map((f) => [f, f === "radio" ? [] : null])),
  key,
  status: "success",
  endTime: 120.5,
  used: 17,
  stars: 2,
  score: 2400,
  kills: 40,
  randomCalls: 310,
  ...extra,
});
const fixture = () => [row("7/harbour/normal"), row("9/skipper/normal", { used: null, bargeHp: [24, 21.75] }), row("6/harbour/easy")];

test("equal row sets give no changes", () => {
  assert.deepEqual(diffRows(fixture(), fixture()), []);
  assert.deepEqual(diffRows(fixture(), fixture().reverse()), [], "row order does not matter");
});

test("the comparator names exactly the key and the fields that moved", () => {
  const after = fixture();
  after[0] = { ...after[0], used: 15, stars: 3 };
  const changes = diffRows(fixture(), after);
  assert.deepEqual(
    changes.map((c) => [c.key, c.field]),
    [
      ["7/harbour/normal", "used"],
      ["7/harbour/normal", "stars"],
    ],
  );
  assert.equal(formatChange(changes[0]), "7/harbour/normal used: 17 -> 15");
  assert.equal(formatChange(changes[1]), "7/harbour/normal stars: 2 -> 3");
});

test("array fields, strings and nulls are compared by value", () => {
  const after = fixture();
  after[1] = { ...after[1], bargeHp: [24, 21.5], status: "failed", reason: "hull" };
  assert.deepEqual(
    diffRows(fixture(), after).map(formatChange),
    ['9/skipper/normal status: "success" -> "failed"', '9/skipper/normal reason: null -> "hull"', "9/skipper/normal bargeHp: [24,21.75] -> [24,21.5]"],
  );
});

test("a row that appears or goes is reported as a whole", () => {
  const before = fixture();
  const after = [...fixture().slice(1), row("5/naive/normal")];
  assert.deepEqual(diffRows(before, after).map(formatChange), ["+ 5/naive/normal (new row)", "- 7/harbour/normal (row removed)"]);
});

test("--allow patterns match whole parts, and a key outside them refuses the rewrite", () => {
  assert.deepEqual(parseAllow(" 6/*/*, 5/naive/normal ,"), ["6/*/*", "5/naive/normal"]);
  assert.ok(matchKey("6/harbour/easy", "6/*/*"));
  assert.ok(!matchKey("16/rescue/easy", "6/*/*"), "a pattern part matches the whole part only");
  assert.ok(!matchKey("6/harbour", "6/*/*"));
  const before = fixture();
  const after = fixture();
  after[1] = { ...after[1], stars: 1 };
  after[2] = { ...after[2], used: 18 };
  const changes = diffRows(before, after);
  assert.deepEqual(outside(changes, ["6/*/*"]), ["9/skipper/normal"]);
  assert.deepEqual(outside(changes, ["6/*/*", "9/skipper/*"]), []);
  assert.deepEqual(outside(diffRows(before, before), ["6/*/*"]), []);
});

test("--allow given with no pattern in it throws instead of letting every key move", () => {
  assert.equal(parseAllow(undefined), null, "no --allow: any key may move");
  for (const text of ["", ",", " , "]) assert.throws(() => parseAllow(text), /--allow needs at least one key pattern/, JSON.stringify(text));
});

test("--missions takes indexes and ranges inside the campaign, and nothing else", () => {
  assert.equal(parseMissions(undefined), null, "no --missions: every mission");
  assert.deepEqual([...parseMissions("0-8")], [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...parseMissions("9-18")], [9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
  assert.deepEqual([...parseMissions(" 3, 0 ,18,9-9")], [3, 0, 18, 9]);
  // Labels, open or reversed ranges, an en dash, missions past 3.4 and empty text select nothing
  // the runner could play, so they throw.
  for (const text of ["1.8", "2.1-3.4", "9-", "-3", "8-6", "9–18", "19", "19-30", "x", "", "0,,1"])
    assert.throws(() => parseMissions(text), /--missions takes mission indexes 0-18/, JSON.stringify(text));
});

test("a different browser build is called out", () => {
  const head = { schema: SCHEMA, browser: "Chrome 155.0.8059.85", sha: "abc1234" };
  assert.deepEqual(headerWarnings(head, { ...head, sha: "def5678" }), []);
  const [warning] = headerWarnings(head, { ...head, browser: "Chromium 140.0.7339.16" });
  assert.match(warning, /Chrome 155\.0\.8059\.85.*Chromium 140\.0\.7339\.16/);
});

test("the file is written in a stable order, one row per line, and reads back the same", () => {
  const file = { schema: SCHEMA, browser: "Chrome 155", sha: "abc1234", rows: fixture() };
  const text = serialize(file);
  assert.equal(serialize({ ...file, rows: fixture().reverse() }), text);
  assert.deepEqual(JSON.parse(text), { ...file, rows: sortRows(fixture()) });
  assert.deepEqual(
    JSON.parse(text).rows.map((r) => r.key),
    ["6/harbour/easy", "7/harbour/normal", "9/skipper/normal"],
  );
  assert.equal(text.split("\n").filter((line) => line.trim().startsWith('{"key"')).length, 3);
  assert.deepEqual(
    sortRows([row("10/skipper/normal"), row("9/skipper/normal"), row("9/idle/normal"), row("9/skipper/easy")]).map((r) => r.key),
    ["9/idle/normal", "9/skipper/easy", "9/skipper/normal", "10/skipper/normal"],
  );
});

test("a partial measurement replaces only its own rows", () => {
  const merged = mergeRows(fixture(), [row("7/harbour/normal", { used: 15 }), row("18/siege/normal")], new Set([7, 18]));
  assert.deepEqual(
    merged.map((r) => [r.key, r.used]),
    [
      ["6/harbour/easy", 17],
      ["7/harbour/normal", 15],
      ["9/skipper/normal", null],
      ["18/siege/normal", 17],
    ],
  );
});

test("a rewrite retires a key the run no longer produces, inside its missions only", () => {
  const recorded = [...fixture(), row("7/idle/normal"), row("9/idle/normal")];
  const measured = [row("7/harbour/normal")];
  assert.deepEqual(diffRows(recorded.filter((r) => r.key.startsWith("7/")), measured).map(formatChange), ["- 7/idle/normal (row removed)"]);
  const merged = mergeRows(recorded, measured, new Set([7]));
  assert.deepEqual(
    merged.map((r) => r.key),
    ["6/harbour/easy", "7/harbour/normal", "9/idle/normal", "9/skipper/normal"],
  );
  assert.deepEqual(diffRows(merged.filter((r) => r.key.startsWith("7/")), measured), [], "the next run of mission 7 compares clean");
});

// The recorded rows (tests/golden/scripted-runs.json).
const recorded = JSON.parse(readFileSync(new URL("./golden/scripted-runs.json", import.meta.url), "utf8"));
const byKey = new Map(recorded.rows.map((r) => [r.key, r]));

test("the recorded file holds 50 rows keyed mission/pilot/mode with the full frozen field set", () => {
  assert.equal(recorded.schema, SCHEMA);
  assert.ok(recorded.browser && recorded.sha);
  assert.equal(recorded.rows.length, 50);
  assert.equal(byKey.size, 50, "keys are unique");
  for (const r of recorded.rows) {
    assert.match(r.key, /^\d+\/[a-z]+\/(easy|normal|hard|crazy)$/);
    assert.deepEqual(Object.keys(r), FIELDS, r.key);
    for (const f of RESERVED) assert.equal(r[f], null, `${r.key} ${f}`);
    assert.deepEqual(r.radio, [], `${r.key}: the radio log waits for N1`);
  }
  const expected = [];
  for (const mode of ["normal", "easy"])
    for (let i = 0; i <= 18; i++) expected.push(rowKey(i, i <= 5 ? "autopilot" : i <= 8 ? "harbour" : i <= 14 ? "skipper" : i <= 17 ? "rescue" : "siege", mode));
  for (let i = 0; i <= 5; i++) expected.push(rowKey(i, "naive", "normal"));
  for (const i of [1, 6, 9, 14, 15, 18]) expected.push(rowKey(i, "idle", "normal"));
  assert.deepEqual([...byKey.keys()].sort(), expected.sort());
});

test("the do-nothing rows record what idling does today", () => {
  const idle = (i) => byKey.get(rowKey(i, "idle", "normal"));
  assert.equal(idle(1).status, "failed");
  assert.equal(idle(1).reason, "surge");
  assert.ok(idle(1).endTime >= 360 && idle(1).endTime <= 360.02, `1.2: ${idle(1).endTime}`);
  assert.equal(idle(6).status, "failed");
  assert.equal(idle(6).reason, "surge");
  assert.ok(idle(6).endTime >= 600 && idle(6).endTime <= 600.02, `1.7: ${idle(6).endTime}`);
  assert.equal(idle(18).status, "failed", "the finale is lost by waiting");
  assert.equal(idle(15).status, "playing", "a valley sortie cannot be lost by waiting");
  assert.equal(idle(15).endTime, 1000);
});

test("the scripted pilots still win what the 5.0 suite asserted they win", () => {
  // Every pilot on Easy (where the chapter suites ran them), and the finale pilot on Normal with
  // the gates fully shut, which needs Marrow down.
  for (const r of recorded.rows) if (r.key.endsWith("/easy")) assert.equal(r.status, "success", r.key);
  const finale = byKey.get("18/siege/normal");
  assert.equal(finale.status, "success");
  assert.equal(finale.gate, 100);
});
