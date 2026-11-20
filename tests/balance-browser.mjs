// Balance sweep (5.1 G1): win rates over seeds, the evidence behind every balance claim. It does
// not gate and does not run in CI. A cell is one mission, player and mode. Its attempts n = 1..N
// (game.setAttempt: seed 1 + index*7919 + n*104729, so n = 1 is the golden row's seed) play one
// after another in one fresh context, each exactly as a golden run plays.
//
//   npm run balance                      every cell: each mission's pilot, the naive clicker on
//                                        1.1-1.6 and the do-nothing player on every mission, on
//                                        Easy, Normal and Hard, 8 seeds each
//   ... -- --missions 9-14 --modes normal,hard --seeds 8 --players pilot,idle
//   ... -- --jobs 6                      contexts at once (or BALANCE_JOBS; default CPUs - 1, at most 12)
//
// --players takes pilot (each mission's own), naive, idle, or a pilot by name (autopilot,
// harbour, skipper, rescue, siege). GAME_URL, CHROME_PATH, GPU=1 and PLAYWRIGHT_CHROMIUM=1 work
// as in the golden runs. test-results/balance.json is rewritten as each cell finishes, so a
// stopped sweep keeps what it measured and lists the cells it did not; the table prints at the end.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { MISSIONS } from "../src/data.js";
import { PILOTS, VIEWPORT, gitSha, inFreshPage, launchBrowser, opened, parseArgs, playIn } from "./golden-browser.mjs";
import { parseMissions } from "./golden-diff.js";
import { SWEEP_MODES, SWEEP_PLAYERS, balanceTable, cellText, summarize, sweepCells } from "./balance-sweep.js";

const OUT = "test-results/balance.json";
const RECORDED = "tests/golden/scripted-runs.json";
const ALL = MISSIONS.map((_, index) => index);
const PLAYS = { ...Object.fromEntries(PILOTS), naive: [0, 1, 2, 3, 4, 5], idle: ALL };

const list = (text) => text?.split(",").map((s) => s.trim()).filter(Boolean);

async function main() {
  const args = parseArgs(process.argv.slice(2), ["missions", "modes", "seeds", "players", "jobs"]);
  const url = process.env.GAME_URL || "http://127.0.0.1:5183/";
  const seeds = Number(args.seeds || 8);
  if (!Number.isInteger(seeds) || seeds < 1) throw new Error(`--seeds takes a count, not ${args.seeds}`);
  const jobs = Number(args.jobs || process.env.BALANCE_JOBS) || Math.max(1, Math.min(12, cpus().length - 1));
  const cells = sweepCells(
    { missions: parseMissions(args.missions) || ALL, modes: list(args.modes) || SWEEP_MODES, players: list(args.players) || SWEEP_PLAYERS },
    PLAYS,
    PILOTS.map(([name]) => name),
  );
  // Longest cells first, by the golden row's end time for that mission and player.
  const recorded = JSON.parse(await readFile(RECORDED, "utf8")).rows;
  const estimate = (cell) => recorded.find((row) => row.key.startsWith(`${cell.index}/${cell.player}/`))?.endTime ?? 300;
  const queue = [...cells].sort((a, b) => estimate(b) - estimate(a));
  await mkdir("test-results", { recursive: true });

  const { browser, name } = await launchBrowser();
  console.log(`Balance sweep on ${name} (${process.env.GPU === "1" ? "GPU" : "SwiftShader"}): ${cells.length} cells x ${seeds} seeds, ${jobs} contexts at once, ${url}`);
  const summaries = new Map(),
    failed = new Map();
  const started = Date.now();
  const sha = gitSha();
  const file = (complete) => ({
    browser: name,
    sha,
    seeds,
    complete,
    cells: cells.filter((c) => summaries.has(c.key)).map((c) => summaries.get(c.key)),
    failed: cells.filter((c) => failed.has(c.key)).map((c) => ({ key: c.key, error: failed.get(c.key) })),
    pending: cells.filter((c) => !summaries.has(c.key) && !failed.has(c.key)).map((c) => c.key),
  });
  let saving = Promise.resolve();
  const save = (complete = false) => (saving = saving.then(() => writeFile(OUT, `${JSON.stringify(file(complete), null, 1)}\n`)));

  const worker = async () => {
    while (queue.length) {
      const cell = queue.shift();
      try {
        const done = await opened(
          () =>
            inFreshPage(browser, url, VIEWPORT, async (page) => {
              const runs = [];
              for (let n = 1; n <= seeds; n++) runs.push({ n, ...(await playIn(page, { ...cell, attempt: n })) });
              return runs;
            }),
          cell.key,
        );
        const summary = summarize(cell, done.result);
        summaries.set(cell.key, summary);
        // The runs are kept, but a page that logged errors fails the sweep.
        if (done.errors.length) failed.set(cell.key, `page errors ${JSON.stringify(done.errors)}`);
        console.log(
          `  ${summary.mission} ${cell.player} ${cell.mode}: ${cellText(summary)}  [${done.load.toFixed(1)} s load, ${done.run.toFixed(1)} s run, done at ${((Date.now() - started) / 1000).toFixed(0)} s]`,
        );
      } catch (error) {
        failed.set(cell.key, error.message);
        console.log(`  FAILED ${cell.key}: ${error.message}`);
      }
      await save();
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(jobs, cells.length) }, worker));
  } finally {
    await browser.close();
  }
  await save(failed.size === 0);

  console.log(`\n${balanceTable([...summaries.values()])}\n`);
  for (const [key, error] of failed) console.log(`FAIL ${key}: ${error}`);
  console.log(`Balance sweep done in ${((Date.now() - started) / 60000).toFixed(1)} min: ${summaries.size} of ${cells.length} cells, written to ${OUT}.`);
  if (failed.size) process.exitCode = 1;
}

await main();
