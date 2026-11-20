import test from "node:test";
import assert from "node:assert/strict";
import { balanceTable, cellText, missionLabel, outcome, summarize, sweepCells } from "./balance-sweep.js";

const PILOTS = ["autopilot", "harbour", "skipper", "rescue", "siege"];
const ALL = Array.from({ length: 19 }, (_, i) => i);
const PLAYS = {
  autopilot: [0, 1, 2, 3, 4, 5],
  harbour: [6, 7, 8],
  skipper: [9, 10, 11, 12, 13, 14],
  rescue: [15, 16, 17],
  siege: [18],
  naive: [0, 1, 2, 3, 4, 5],
  idle: ALL,
};
const cells = (filters) => sweepCells({ missions: ALL, ...filters }, PLAYS, PILOTS).map((c) => c.key);

test("the full sweep: every mission's pilot, the naive clicker on the city and the do-nothing player, on Easy, Normal and Hard", () => {
  const all = cells({});
  assert.equal(all.length, 3 * (19 + 6 + 19));
  assert.equal(new Set(all).size, all.length);
  for (const mode of ["easy", "normal", "hard"]) {
    assert.ok(all.includes(`9/idle/${mode}`) && all.includes(`7/harbour/${mode}`) && all.includes(`5/naive/${mode}`));
    assert.ok(!all.includes(`6/naive/${mode}`), "the naive clicker plays the city only");
  }
  assert.ok(!all.some((key) => key.endsWith("/crazy")));
});

test("filters pick missions, modes and players; a named pilot plays only its own missions", () => {
  assert.deepEqual(cells({ missions: [9], modes: ["normal"] }), ["9/skipper/normal", "9/idle/normal"]);
  assert.deepEqual(cells({ missions: [5, 6], modes: ["hard"], players: ["naive", "harbour"] }), ["5/naive/hard", "6/harbour/hard"]);
  assert.deepEqual(cells({ missions: [9, 0], modes: ["easy"], players: ["pilot"] }), ["0/autopilot/easy", "9/skipper/easy"]);
  assert.throws(() => cells({ players: ["bot"] }), /Unknown player bot/);
  assert.throws(() => cells({ modes: ["nightmare"] }), /Unknown mode nightmare/);
});

test("a filter that leaves no cell throws instead of sweeping nothing", () => {
  assert.throws(() => cells({ missions: [9], players: ["naive"] }), /No cell to sweep/);
  assert.throws(() => cells({ missions: [] }), /No cell to sweep/);
  assert.throws(() => cells({ modes: [] }), /No cell to sweep/);
});

const run = (n, status, reason, stars, endTime) => ({ n, key: "9/idle/normal", status, reason, stars, endTime });

test("a cell's win rate, mean stars and mean end time count every seed, a loss as 0 stars", () => {
  const runs = [run(1, "success", null, 1, 61.77), run(2, "failed", "hull", 0, 30.1), run(3, "success", null, 2, 64), run(4, "playing", null, 0, 240)];
  const s = summarize({ key: "9/idle/normal", index: 9, player: "idle", mode: "normal" }, runs);
  assert.equal(s.mission, "2.1");
  assert.equal(s.seeds, 4);
  assert.equal(s.wins, 2);
  assert.equal(s.winRate, 0.5);
  assert.equal(s.meanStars, 0.75);
  assert.equal(s.meanEndTime, 98.97);
  assert.deepEqual(s.outcomes, { success: 2, hull: 1, playing: 1 });
  assert.equal(s.runs, runs);
  assert.equal(cellText(s), "2/4 (50%) · ★0.75 · 99.0 s · hull 1 · playing 1");
  assert.equal(outcome({ status: "failed", reason: null }), "failed");
});

test("the table has a line per mission and player, the pilot first, and a column per mode swept", () => {
  const cell = (key, wins) => {
    const [index, player, mode] = key.split("/");
    return summarize({ key, index: Number(index), player, mode }, [run(1, wins ? "success" : "failed", wins ? null : "surge", wins ? 3 : 0, 12)]);
  };
  const table = balanceTable([cell("9/idle/normal", 0), cell("9/skipper/hard", 1), cell("9/skipper/normal", 1), cell("1/idle/normal", 0)]);
  assert.deepEqual(table.split("\n"), [
    "| Mission | Player | Normal | Hard |",
    "|---|---|---|---|",
    "| 1.2 | idle | 0/1 (0%) · ★0.00 · 12.0 s · surge 1 | not measured |",
    "| 2.1 | skipper | 1/1 (100%) · ★3.00 · 12.0 s | 1/1 (100%) · ★3.00 · 12.0 s |",
    "| 2.1 | idle | 0/1 (0%) · ★0.00 · 12.0 s · surge 1 | not measured |",
  ]);
  assert.equal(missionLabel(18), "3.4");
});
