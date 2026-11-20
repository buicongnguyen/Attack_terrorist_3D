import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { RadioDirector, HOLD, DEDUPE, STORY, TACTICAL, CHATTER, minimumFor, priorityOf, wordCount } from "../src/radio-queue.js";
import { MISSION_STORY, RIVER_RADIO } from "../src/story.js";

const STEP = 1 / 120;
const line = (text, who = "iona") => ({ who, text });
const run = (director, seconds) => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) director.tick(STEP);
};
// A line taken off the air before its minimum (rounding to the log's hundredths allowed).
const early = (director) => director.log.filter((e) => e.outcome === "displaced" && e.left - e.shownAt < e.min - 1e-9);

test("a line's minimum is 1 s plus words / 3.5 s, capped at 7.8 s; priorities come from the key", () => {
  assert.equal(minimumFor("one two three four five six seven"), 3);
  assert.equal(minimumFor(Array.from({ length: 40 }, () => "word").join(" ")), HOLD);
  assert.equal(wordCount("  Six of mine  in a glass room. "), 7);
  assert.equal(priorityOf("success"), STORY);
  assert.equal(priorityOf("intercept"), STORY);
  assert.equal(priorityOf("multi"), CHATTER);
  assert.equal(priorityOf("flak"), TACTICAL);
  assert.equal(priorityOf("anything new"), TACTICAL);
});

test("a line stays up until HOLD, and the same text within 20 s is dropped", () => {
  const d = new RadioDirector(3);
  const first = d.say(line("Pincer forming. Watch where the lines cross."), "pincer");
  assert.deepEqual(d.shown, [first]);
  run(d, 5);
  const again = d.say(line("Pincer forming. Watch where the lines cross."), "pincer");
  assert.equal(again.outcome, "dupe");
  run(d, HOLD - 5 + STEP);
  assert.equal(d.shown.length, 0);
  assert.equal(first.outcome, "shown");
  run(d, DEDUPE);
  const later = d.say(line("Pincer forming. Watch where the lines cross."), "pincer");
  assert.notEqual(later.outcome, "dupe");
  assert.deepEqual(d.shown, [later]);
});

test("desktop shows 3 lines at once, 2 and 1 where the slots are fewer", () => {
  for (const slots of [3, 2, 1]) {
    const d = new RadioDirector(slots);
    for (let i = 0; i < 5; i++) d.say(line(`Line number ${i} on the air.`), "flak");
    assert.equal(d.shown.length, slots, `${slots} slots`);
    assert.equal(d.waiting.length, 5 - slots);
    // The next line takes a slot only once a shown line has had its minimum.
    run(d, minimumFor("Line number 0 on the air.") - 0.05);
    assert.equal(d.waiting.length, 5 - slots);
    run(d, 0.1);
    assert.ok(d.waiting.length < 5 - slots);
    assert.equal(early(d).length, 0);
  }
});

test("a story line is never dropped or displaced before its minimum, even with 10 lines queued", () => {
  const d = new RadioDirector(2);
  const story = d.say(line("Cinder is down. My father was a pilot on the Lower Quays, Kestrel. Twelve years I have waited.", "ines"), "success");
  const said = [story];
  for (let i = 0; i < 10; i++) said.push(d.say(line(`Story beat ${i} for the record.`, "okafor"), i % 2 ? "intercept" : "pickup"));
  for (let i = 0; i < 6; i++) said.push(d.say(line(`Tactical call ${i}.`), "flak"));
  run(d, 120);
  for (const entry of said.filter((e) => e.priority === STORY)) {
    assert.notEqual(entry.outcome, "dropped");
    assert.ok(entry.shownAt >= 0, entry.line.text);
    assert.ok(entry.left - entry.shownAt >= entry.min - 1e-9, entry.line.text);
  }
  assert.equal(early(d).length, 0);
});

test("with too many lines waiting, chatter goes first, then stale tactical lines", () => {
  const d = new RadioDirector(1);
  d.say(line("A long story line that holds the only slot for quite a while, Kestrel.", "echo"), "success");
  const tactical = d.say(line("Flak lock! Break, break!"), "flak");
  const chatter = [0, 1, 2, 3].map((i) => d.say(line(`Nice shot number ${i}.`, "piper"), "multi"));
  // Five waiting: the oldest chatter line goes, the tactical line stays.
  assert.deepEqual(
    chatter.map((c) => c.outcome),
    ["dropped", null, null, null],
  );
  assert.equal(tactical.outcome, null);
  // No chatter left to drop: a tactical line goes only once it has waited more than 6 s.
  const d2 = new RadioDirector(1);
  d2.say(line("A story line that holds the slot.", "echo"), "success");
  const old = d2.say(line("An old call."), "flak");
  run(d2, 2);
  for (let i = 0; i < 7; i++) d2.say(line(`Story beat ${i}.`, "okafor"), "pickup");
  run(d2, 3.9);
  assert.equal(old.outcome, null, "not stale at 5.9 s");
  run(d2, 0.2);
  assert.equal(old.outcome, "dropped", "stale at 6.1 s");
  assert.ok(d2.log.filter((e) => e.priority === STORY).every((e) => e.outcome !== "dropped"));
});

// The 2.3 Floodplain timeline as the Normal skipper hears it (tests/golden/scripted-runs.json,
// 11/skipper/normal): [said at, key]. Replayed through a desktop director at 1/120 s per step.
const FLOODPLAIN = JSON.parse(readFileSync(new URL("./golden/scripted-runs.json", import.meta.url), "utf8")).rows.find(
  (r) => r.key === "11/skipper/normal",
).radio;

test("the 2.3 Floodplain timeline displaces no story line and says 'Kestrel Two rolling in' once per strike run", () => {
  const story = MISSION_STORY[11];
  const textOf = (key) => (story.radio[key] || RIVER_RADIO[key] || { text: `(${key})` }).text;
  assert.ok(FLOODPLAIN.length >= 12, `${FLOODPLAIN.length} lines recorded`);
  const d = new RadioDirector(3);
  let t = 0;
  for (const [said, , who, key] of FLOODPLAIN) {
    run(d, said - t);
    t = said;
    d.say(line(key === "bargeLost" ? "A barge is lost." : textOf(key), who), key);
  }
  run(d, 10);
  const stories = d.log.filter((e) => e.priority === STORY);
  assert.ok(stories.every((e) => e.outcome !== "dropped" && e.shownAt >= 0));
  assert.equal(early(d).filter((e) => e.priority === STORY).length, 0);
  // Kestrel Two is called in three times; the second call, 11 s after the first, is not shown
  // again. Two showings in all, never two within the 20 s dedupe window.
  const rolling = d.log.filter((e) => e.line.text.startsWith("Kestrel Two rolling in"));
  const shown = rolling.filter((e) => e.shownAt >= 0);
  assert.ok(rolling.length >= 3, `${rolling.length} calls`);
  assert.equal(rolling.filter((e) => e.outcome === "dupe").length, rolling.length - shown.length);
  assert.equal(shown.filter((e) => e.said < DEDUPE).length, 1);
  for (let i = 1; i < shown.length; i++) assert.ok(shown[i].said - shown[i - 1].said >= DEDUPE);
});

test("tick allocates no lists: removals happen in place", () => {
  const d = new RadioDirector(3);
  for (let i = 0; i < 6; i++) d.say(line(`Line ${i} here.`), "flak");
  const shown = d.shown,
    waiting = d.waiting;
  run(d, 30);
  assert.equal(d.shown, shown);
  assert.equal(d.waiting, waiting);
});

// Every radio call in the game passes its key (5.1): a call without one throws at run time, and
// this scan fails on one in the source.
test("every game.radio call site passes a key", () => {
  const calls = [];
  for (const file of readdirSync(new URL("../src/", import.meta.url)).filter((f) => f.endsWith(".js"))) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
    for (const match of source.matchAll(/\b(?:g|game|this\.game)\.radio\(/g)) {
      // The argument list up to the matching parenthesis, and its top-level commas.
      let depth = 1,
        commas = 0,
        i = match.index + match[0].length;
      for (; depth > 0 && i < source.length; i++) {
        const c = source[i];
        if ("([{".includes(c)) depth++;
        else if (")]}".includes(c)) depth--;
        else if (c === "," && depth === 1) commas++;
        else if (c === "`" || c === '"') i = source.indexOf(c, i + 1);
      }
      calls.push({ file, at: source.slice(match.index, i), commas });
    }
  }
  assert.ok(calls.length >= 6, `${calls.length} call sites`);
  for (const call of calls) assert.ok(call.commas >= 1, `${call.file}: ${call.at}`);
});
