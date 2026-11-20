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
import { CAST, INTERCEPTS, MISSION_STORY, STRIKE_RADIO, interceptFor } from "../src/story.js";
import { PLAYERS } from "./golden-browser.mjs";
import { STORY, minimumFor, priorityOf } from "../src/radio-queue.js";

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
    // C1 fills standDown and resupply on the harbour rows (missions 6-8), K1 launches on the canal
    // rows (9-14); the rest stay null.
    const mission = Number(r.key.split("/")[0]);
    const owned = (f) => ([6, 7, 8].includes(mission) && ["standDown", "resupply"].includes(f)) || (mission >= 9 && mission <= 14 && f === "launches");
    for (const f of RESERVED) if (!owned(f)) assert.equal(r[f], null, `${r.key} ${f}`);
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

// ---------------------------------------------------------------- 5.1 N1: the radio log

// The text a logged line was said with, for the story keys (the log keeps the key, not the text).
function storyText(index, key, who) {
  if (key === "intercept") return interceptFor(index).line.text;
  if (key === "bargeLost") return who === "okafor" ? "Harbor Mercy is going down! Get the crew across!" : "";
  return (MISSION_STORY[index].radio[key] || STRIKE_RADIO[key]).text;
}
const pilotRows = recorded.rows.filter((r) => !/\/(idle|naive)\//.test(r.key));
const missionOfKey = (key) => Number(key.split("/")[0]);

test("every row's radio log is the director's: [said, shown, who, key, held]", () => {
  for (const r of recorded.rows) {
    assert.ok(Array.isArray(r.radio) && r.radio.length > 0, `${r.key}: an empty radio log`);
    let last = 0;
    for (const [said, shown, who, key, held] of r.radio) {
      assert.ok(said >= last && (shown === null || shown >= said), `${r.key}: ${said} ${shown}`);
      assert.ok(CAST[who], `${r.key}: ${who}`);
      assert.equal(typeof key, "string");
      assert.ok(typeof held === "number" || ["open", "waiting", "dropped", "dupe"].includes(held), `${r.key}: ${held}`);
      last = said;
    }
  }
});

test("each intercept fires from its event in its pilot runs, and the 3.1 survivors speak", () => {
  for (const intercept of INTERCEPTS)
    for (const r of pilotRows.filter((r) => missionOfKey(r.key) === intercept.mission)) {
      const said = r.radio.filter((e) => e[3] === "intercept");
      assert.equal(said.length, 1, `${r.key}: ${said.length} intercepts`);
      assert.equal(said[0][2], "marrow");
      assert.ok(said[0][1] !== null, `${r.key}: the intercept was never shown`);
      // A timed intercept comes at its time (the log keeps hundredths); 2.2 may come sooner, from
      // a broken pincer.
      if (intercept.event === "start") assert.ok(Math.abs(said[0][0] - intercept.after) < 0.02, `${r.key}: ${said[0][0]}`);
      else if (intercept.after !== undefined) assert.ok(said[0][0] <= intercept.after + 0.02, `${r.key}: ${said[0][0]}`);
    }
  for (const mode of ["normal", "easy"]) {
    const voices = byKey.get(`15/rescue/${mode}`).radio.filter((e) => e[3] === "aboard").map((e) => e[2]);
    assert.ok(voices.includes("kofi") && voices.includes("lin"), `${mode}: ${voices}`);
  }
});

test("no story line is dropped or cut short, and the harbour never goes a minute without a line", () => {
  let stories = 0;
  for (const r of pilotRows)
    for (const [, , who, key, held] of r.radio) {
      if (priorityOf(key) !== STORY) continue;
      stories++;
      assert.ok(held !== "dropped" && held !== "waiting" && held !== "dupe", `${r.key} ${key}: ${held}`);
      if (typeof held === "number") assert.ok(held >= minimumFor(storyText(missionOfKey(r.key), key, who)) - 0.01, `${r.key} ${key}: ${held} s`);
    }
  assert.ok(stories >= 50, `${stories} story lines`);
  for (const index of [6, 7, 8]) {
    const r = byKey.get(`${index}/harbour/normal`);
    for (const key of ["q25", "q50", "q75"]) assert.ok(r.radio.some((e) => e[3] === key), `${r.key}: no ${key}`);
    const times = [0, ...r.radio.filter((e) => e[1] !== null).map((e) => e[1]), r.endTime].sort((a, b) => a - b);
    const gap = Math.max(...times.slice(1).map((t, i) => t - times[i]));
    assert.ok(gap <= 60, `${r.key}: ${gap.toFixed(1)} s without a line`);
  }
});

// ---------------------------------------------------------------- 5.1 C1

test("the scripted pilots never arm a drop: no pilot calls markAt, and the naive clicker clicks through ui.markDrop", () => {
  for (const [name, play] of Object.entries(PLAYERS)) assert.ok(!play.toString().includes("markAt"), name);
  assert.ok(PLAYERS.naive.toString().includes("ui.markDrop("));
});

test("the harbour endgame in the rows: the pilot wins 1.7-1.9 on Normal, every boat that doesn't count stood down", () => {
  for (const index of [6, 7, 8])
    for (const mode of ["normal", "easy"]) {
      const r = byKey.get(rowKey(index, "harbour", mode));
      assert.equal(r.status, "success", r.key);
      assert.ok(r.standDown && r.standDown.ships > 0 && r.standDown.at < r.endTime, r.key);
      assert.ok(r.radio.some((e) => e[3] === "quota"), `${r.key}: no quota line`);
    }
  // Doing nothing never meets the quota.
  assert.equal(byKey.get(rowKey(6, "idle", "normal")).standDown, null);
});

// ---------------------------------------------------------------- 5.1 K1

test("5.1 K1: every canal row counts its launches, and doing nothing loses 2.1 at the boom", () => {
  for (const r of recorded.rows) {
    if (missionOfKey(r.key) < 9 || missionOfKey(r.key) > 14) continue;
    const { shots, missiles, outside } = r.launches;
    assert.ok([shots, missiles, outside].every(Number.isInteger), r.key);
    assert.ok(outside <= shots + missiles, r.key);
  }
  const idle = byKey.get(rowKey(9, "idle", "normal"));
  assert.equal(idle.status, "failed");
  assert.ok(idle.radio.some((e) => e[3] === "boom"), "Okafor names the boom");
  for (const mode of ["normal", "easy"]) {
    const r = byKey.get(rowKey(9, "skipper", mode));
    assert.equal(r.status, "success", r.key);
    assert.equal(r.radio.filter((e) => e[3] === "boom").length, 1, r.key);
  }
});
