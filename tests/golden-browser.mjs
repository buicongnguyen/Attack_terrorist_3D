// Golden scripted runs (5.1 G1), the drift gate. Each row is one scripted run in a fresh browser
// context (?qa=1, empty storage, no upgrades, the mode set explicitly), played inside a single
// synchronous page.evaluate, so the frame loop never advances the game between calls.
//
//   npm run golden                     measure and compare with tests/golden/scripted-runs.json
//   UPDATE_GOLDEN=1 npm run golden     rewrite the file, printing the same diff
//   ... -- --allow '6/*/*,5/naive/normal'   refuse the rewrite if a key outside these moved
//   ... -- --missions 0-8,18           only these missions' rows and checks (a rewrite keeps the
//                                      rest); indexes 0-18, not labels such as 1.7
//   ... -- --jobs 6                    contexts at once (or GOLDEN_JOBS; default CPUs - 1, at most 12)
//   ... -- --actual file.json          compare or adopt rows measured elsewhere (a CI run's
//                                      test-results/golden-actual.json) without a browser; the
//                                      missions it holds unless --missions says otherwise
//
// GAME_URL, CHROME_PATH and GPU=1 work as in tests/browser.mjs. PLAYWRIGHT_CHROMIUM=1 runs
// Playwright's own chromium (CI's browser) instead of the system Chrome on Windows. The rows
// measured are always written to test-results/golden-actual.json.

import { chromium } from "@playwright/test";
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { autopilot, naivePilot } from "./strike-browser.mjs";
import { harbourPilot } from "./harbour-browser.mjs";
import { skipper } from "./river-browser.mjs";
import { rescuePilot, siegePilot } from "./rescue-browser.mjs";
import { FIELDS, SCHEMA, diffRows, formatChange, headerWarnings, mergeRows, missionOf, outside, parseAllow, parseMissions, rowKey, serialize, sortRows } from "./golden-diff.js";

const RECORDED = "tests/golden/scripted-runs.json";
const ACTUAL = "test-results/golden-actual.json";
// The pilots' rows do not depend on the viewport or the graphics level. The naive clicker's depend
// on the orientation: a portrait screen (aspect under 0.85) turns the city camera, so its clicks can
// mark other buildings. Every row is played at this landscape size. The interleave checks render
// at a small viewport on Battery saver (no shadow pass, half the wildlife): the 1.8 check takes
// half as long there as on Sharp.
export const VIEWPORT = { width: 1280, height: 720 };
const SMALL = { width: 480, height: 320 };

// The do-nothing player: no input at all, stepped until the mission ends, or until its tide
// window plus 5 s where it has one, else 1000 s.
export function idle(index) {
  const { game: g, ui } = window.__TIDELOCK__;
  ui.start(index);
  g.paused = false;
  const cap = g.chapter === 0 ? g.op.surge + 5 : 1000;
  for (let step = 0; step < cap * 120 && g.status === "playing"; step++) g.update(1 / 120);
}

export const PLAYERS = { autopilot, harbour: harbourPilot, skipper, rescue: rescuePilot, siege: siegePilot, naive: naivePilot, idle };
export const PILOTS = [
  ["autopilot", [0, 1, 2, 3, 4, 5]],
  ["harbour", [6, 7, 8]],
  ["skipper", [9, 10, 11, 12, 13, 14]],
  ["rescue", [15, 16, 17]],
  ["siege", [18]],
];
const spec = (index, player, mode) => ({ key: rowKey(index, player, mode), index, player, mode });

// The 50 rows: the five pilots on Normal and Easy, the naive clicker on the city, the idle player.
export function goldenRuns() {
  const runs = [];
  for (const mode of ["normal", "easy"]) for (const [player, missions] of PILOTS) for (const index of missions) runs.push(spec(index, player, mode));
  for (const index of [0, 1, 2, 3, 4, 5]) runs.push(spec(index, "naive", "normal"));
  for (const index of [1, 6, 9, 14, 15, 18]) runs.push(spec(index, "idle", "normal"));
  return runs;
}

// Runs in the page: one scripted run from a clean start, then its row (schema 1, FIELDS order).
// spec.attempt picks the attempt number (the seed); without it the run is attempt 1.
export function playRow(play, spec) {
  const { game: g, ui, view, loop } = window.__TIDELOCK__;
  for (const index of spec.prelude || []) {
    ui.start(index);
    g.paused = false;
    for (let i = 0; i < 240; i++) g.update(1 / 120);
  }
  // Neither the start at load nor a prelude may move this mission's seed.
  if (spec.attempt) g.setAttempt(spec.index, spec.attempt);
  else g.attemptsBy.clear();
  ui.setDifficulty(spec.mode);
  // The rows hold the desktop feed (3 lines at once), whatever the viewport of a check.
  ui.director.setSlots(3);
  const gl = spec.interleave ? view.renderer.getContext() : null;
  const draws = ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"];
  // The radio director is ticked after every step, as the frame loop ticks it (5.1 N1), so the
  // row's radio log is time-true.
  let steps = 0;
  if (gl) for (const name of draws) gl[name] = () => {};
  g.update = function (dt) {
    Object.getPrototypeOf(this).update.call(this, dt);
    ui.director.tick(dt);
    // Interleave: the frame loop's HUD and render between every second step (past the HUD's
    // 80 ms throttle, so it redraws each time), at a real time of the steps run so far, after the
    // loop has taken the steps' hit requests (5.1 J1: with &feel=1 they become hit-stops): code on
    // the render side must never feed back into the simulation. Nothing reads the frames back, so the WebGL draw calls do nothing here. All
    // the game's render code and three.js up to each draw (culling, sorting, uniforms, uploads)
    // still run; only the draws are skipped, which took 85% of the 1.8 check's time under
    // SwiftShader.
    if (!gl || ++steps % 2) return;
    ui.lastHUD = -Infinity;
    const now = (steps * 1000) / 120;
    loop.settle(now);
    loop.draw(now);
  };
  if (spec.fixture === "cosmetic-draw") {
    // Test only: the first wake ring, a cosmetic effect, also draws once from the mission's source.
    let drawn = false;
    g.shockRing = function (...args) {
      if (!drawn) {
        drawn = true;
        this.random();
      }
      return Object.getPrototypeOf(this).shockRing.apply(this, args);
    };
  }
  try {
    play(spec.index);
  } finally {
    g.paused = true;
    delete g.update;
    delete g.shockRing;
    if (gl) for (const name of draws) delete gl[name];
  }
  if (g.index !== spec.index || g.difficulty !== spec.mode) throw new Error(`${spec.key} ended on mission ${g.index}, ${g.difficulty}`);
  const op = g.op,
    chapter = g.chapter,
    siege = chapter === 2 ? op.siege : null;
  const hundredths = (x) => Math.round(x * 100) / 100;
  return {
    key: spec.key,
    status: g.status,
    reason: g.reason,
    endTime: hundredths(g.time),
    window: chapter === 0 ? op.surge : null,
    used: chapter === 0 ? op.used : null,
    stars: op.stars(g.status === "success"),
    score: g.score,
    kills: g.kills,
    lost: chapter === 0 ? op.aircraft.filter((a) => !a.alive).length : null,
    hitsTaken: g.hitsTaken,
    bargeHp: chapter === 1 ? op.barges.map((b) => hundredths(b.hp)) : null,
    shields: chapter === 0 ? null : g.shields.reduce((a, b) => a + b, 0),
    integrity: siege ? hundredths(siege.integrity) : null,
    gate: siege ? hundredths(siege.gate * 100) : null,
    flaresUsed: chapter === 2 ? op.flaresUsed : null,
    randomCalls: g.randomCalls,
    standDown: null,
    resupply: null,
    launches: null,
    runsBroken: null,
    phase: null,
    // The radio director's log (5.1 N1, ticked at 1/120 per step): [said, shown, who, key, held].
    radio: ui.director.record(),
  };
}

// Runs in the page: the draws made while a mission is built are counted, and so is one more.
function startDraws(index) {
  const { game: g, ui } = window.__TIDELOCK__;
  g.attemptsBy.clear();
  ui.start(index);
  const plain = g.randomCalls;
  g.attemptsBy.clear();
  // Test only: one extra draw inside Game.start, where the wildlife is restocked.
  g.restock = function () {
    this.random();
    return Object.getPrototypeOf(this).restock.call(this);
  };
  try {
    ui.start(index);
  } finally {
    delete g.restock;
    g.paused = true;
  }
  return { plain, extra: g.randomCalls };
}

export async function launchBrowser() {
  const bundled = process.env.PLAYWRIGHT_CHROMIUM === "1";
  const executablePath = bundled
    ? undefined
    : process.env.CHROME_PATH || (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : undefined);
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args:
      process.env.GPU === "1"
        ? ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"]
        : ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  return { browser, name: `${executablePath ? "Chrome" : "Chromium"} ${browser.version()}` };
}

// A fresh context with the game loaded and held still; `work(page)` runs, then it closes.
// `graphics` picks a graphics level ("low" is Battery saver) as Mission Control would; `query`
// adds to ?qa=1 (5.1 J1: "&feel=1" turns the hit-stops on).
export async function inFreshPage(browser, url, viewport, work, graphics = null, query = "") {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const errors = [];
  try {
    const page = await context.newPage();
    if (graphics) await page.addInitScript((setting) => localStorage.setItem("tidelock-graphics", JSON.stringify({ setting })), graphics);
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
    const loading = Date.now();
    try {
      await page.goto(`${url}?qa=1${query}`, { timeout: 300000 });
      await page.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 300000 });
    } catch (error) {
      error.loading = true;
      throw error;
    }
    // The mission started at load stops; each run starts its own. The page never opens an
    // AudioContext (every sound is then skipped): a run holds the main thread for up to minutes
    // in one evaluate, and Playwright's Chromium then logs an AudioContext error now and then,
    // muted or not. Sound never touches a row.
    await page.evaluate(() => {
      __TIDELOCK__.game.paused = true;
      __TIDELOCK__.game.audio.unlock = () => {};
    });
    const load = (Date.now() - loading) / 1000;
    const running = Date.now();
    const result = await work(page);
    return { result, errors, load, run: (Date.now() - running) / 1000 };
  } finally {
    await context.close();
  }
}

// A page that does not get ready in time (a busy machine under SwiftShader) is opened again in a
// fresh context, at most twice; a run that fails is never retried.
export async function opened(open, name) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await open();
    } catch (error) {
      if (!error.loading || attempt === 3) throw error;
      console.log(`  page for ${name} not ready (${error.message.split("\n")[0]}); opening it again`);
    }
  }
}

export const playIn = (page, run) => page.evaluate(`(${playRow})(${PLAYERS[run.player]}, ${JSON.stringify(run)})`);

// `--name value` pairs for the names given; an option left without its value throws.
export function parseArgs(argv, names) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i].replace(/^--/, "");
    if (!names.includes(name)) throw new Error(`Unknown option ${argv[i]}`);
    if (i + 1 === argv.length || argv[i + 1].startsWith("--")) throw new Error(`${argv[i]} needs a value`);
    out[name] = argv[++i];
  }
  return out;
}

export function gitSha() {
  try {
    const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    const dirty = execSync("git status --porcelain --untracked-files=no", { encoding: "utf8" }).trim() !== "";
    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return "unknown";
  }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

const summary = (row) =>
  `${row.key}: ${row.status}${row.reason ? ` (${row.reason})` : ""} at ${row.endTime}s, stars ${row.stars}, score ${row.score}, ` +
  `${row.used !== null ? `used ${row.used}, ` : ""}randomCalls ${row.randomCalls}`;

// Measure every run (rows) and the checks, `jobs` contexts at a time, longest first.
async function measure(browser, url, runs, missions, jobs, recorded) {
  const estimate = new Map((recorded?.rows || []).map((row) => [row.key, row.endTime]));
  const plain = runs.map((run) => ({ name: run.key, run, viewport: VIEWPORT }));
  const variant = (key, name, extra, viewport = VIEWPORT, graphics = null, query = "") => {
    const run = runs.find((r) => r.key === key);
    return run ? [{ name, run: { ...run, ...extra }, viewport, graphics, query }] : [];
  };
  const checks = [
    ...variant("11/skipper/normal", "isolation: 11/skipper/normal after missions 3, 0 and 9 were started", { prelude: [3, 0, 9] }),
    ...["11/skipper/normal", "7/harbour/normal", "14/skipper/normal", "18/siege/normal"].flatMap((key) =>
      variant(key, `interleave: ${key}, HUD and render between every second step (480x320, Battery saver)`, { interleave: true }, SMALL, "low"),
    ),
    // The same with the hit-stops and shake of 5.1 J1 on.
    ...["11/skipper/normal", "7/harbour/normal", "14/skipper/normal", "18/siege/normal"].flatMap((key) =>
      variant(key, `interleave &feel=1: ${key}, hit-stops on, HUD and render between every second step`, { interleave: true }, SMALL, "low", "&feel=1"),
    ),
    ...variant("15/rescue/normal", "a cosmetic draw from game.random shows in randomCalls", { fixture: "cosmetic-draw" }),
    ...(missions.has(15) ? [{ name: "draws made inside Game.start are counted", start: 15, viewport: VIEWPORT }] : []),
  ].map((check) => ({ ...check, check: true }));
  const all = [...plain, ...checks];
  const cost = (job) => (job.run ? (estimate.get(job.run.key) ?? 300) * (job.run.interleave ? 5 : 1) : 1);
  const queue = [...all].sort((a, b) => cost(b) - cost(a));
  const results = new Map();
  const started = Date.now();
  const times = (done) => `[${done.load.toFixed(1)} s load, ${done.run.toFixed(1)} s run, done at ${((Date.now() - started) / 1000).toFixed(0)} s]`;
  const worker = async () => {
    while (queue.length) {
      const job = queue.shift();
      // An interleave check sends thousands of frames of WebGL commands. It gets a browser of its
      // own: the contexts of one browser share its GPU process, which runs their commands one
      // after another.
      let own = null;
      try {
        if (job.run?.interleave) own = await launchBrowser();
        const done = await opened(
          () =>
            inFreshPage(
              own?.browser ?? browser,
              url,
              job.viewport,
              (page) => (job.run ? playIn(page, job.run) : page.evaluate(`(${startDraws})(${job.start})`)),
              job.graphics,
              job.query,
            ),
          job.name,
        );
        results.set(job, done);
        console.log(`  ${job.check ? `ran check: ${job.name}` : summary(done.result)}  ${times(done)}`);
      } catch (error) {
        results.set(job, { error });
        console.log(`  FAILED ${job.name}: ${error.message}`);
      } finally {
        await own?.browser.close();
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, all.length) }, worker));
  return { plain, checks, results };
}

function judge({ plain, checks, results }) {
  const problems = [];
  const rows = [];
  for (const job of plain) {
    const done = results.get(job);
    if (done.error) problems.push(`${job.name}: ${done.error.message}`);
    else {
      if (done.errors.length) problems.push(`${job.name}: page errors ${JSON.stringify(done.errors)}`);
      if (JSON.stringify(Object.keys(done.result)) !== JSON.stringify(FIELDS)) problems.push(`${job.name}: fields ${Object.keys(done.result)}`);
      rows.push(done.result);
    }
  }
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const outcomes = [];
  for (const job of checks) {
    const done = results.get(job);
    let pass = false,
      detail = "";
    if (done.error) detail = done.error.message;
    else if (done.errors.length) detail = `page errors ${JSON.stringify(done.errors)}`;
    else if (job.start !== undefined) {
      pass = done.result.extra === done.result.plain + 1;
      detail = `${done.result.plain} draws while mission ${job.start} is built, ${done.result.extra} with one more`;
    } else {
      const base = byKey.get(job.run.key);
      const changes = base ? diffRows([base], [done.result]) : [];
      if (!base) detail = `no plain row for ${job.run.key}`;
      else if (job.run.fixture) {
        pass = changes.some((c) => c.key === job.run.key && c.field === "randomCalls");
        detail = changes.map(formatChange).join("; ") || "no change reported";
      } else {
        pass = changes.length === 0;
        detail = changes.length ? changes.map(formatChange).join("; ") : "identical";
      }
    }
    outcomes.push({ name: job.name, pass, detail, seconds: done.run });
  }
  return { rows: sortRows(rows), problems, outcomes };
}

async function main() {
  const args = parseArgs(process.argv.slice(2), ["allow", "missions", "jobs", "actual"]);
  const url = process.env.GAME_URL || "http://127.0.0.1:5183/";
  const update = process.env.UPDATE_GOLDEN === "1";
  const allow = parseAllow(args.allow);
  const jobs = Number(args.jobs || process.env.GOLDEN_JOBS) || Math.max(1, Math.min(12, cpus().length - 1));
  let missions = parseMissions(args.missions);
  const recorded = await readJson(RECORDED);
  const started = Date.now();
  await mkdir("test-results", { recursive: true });

  let measured = { schema: SCHEMA, browser: null, sha: gitSha(), rows: [] };
  let problems = [],
    outcomes = [];
  if (args.actual) {
    const file = await readJson(args.actual);
    if (!file) throw new Error(`No file at ${args.actual}`);
    // A file from a run with --missions holds only those missions; without --missions here they
    // are the ones compared, and the only ones a rewrite replaces.
    missions ??= new Set(file.rows.map((row) => missionOf(row.key)));
    measured = { ...file, rows: file.rows.filter((row) => missions.has(missionOf(row.key))) };
  } else {
    missions ??= new Set(goldenRuns().map((run) => run.index));
    const { browser, name } = await launchBrowser();
    measured.browser = name;
    console.log(`Golden runs on ${name} (${process.env.GPU === "1" ? "GPU" : "SwiftShader"}), ${jobs} contexts at once, ${url}`);
    try {
      const runs = goldenRuns().filter((run) => missions.has(run.index));
      const judged = judge(await measure(browser, url, runs, missions, jobs, recorded));
      ({ problems, outcomes } = judged);
      measured.rows = judged.rows;
    } finally {
      await writeFile(ACTUAL, serialize(measured));
      await browser.close();
    }
  }

  // A gate that compared nothing has not passed.
  if (!measured.rows.length) problems.push(`no golden row for missions ${[...missions].join(",") || "(none)"}${args.actual ? ` in ${args.actual}` : ""}`);
  for (const o of outcomes) console.log(`${o.pass ? "PASS" : "FAIL"} ${o.name}: ${o.detail}${o.seconds ? ` [${o.seconds.toFixed(1)} s]` : ""}`);
  for (const p of problems) console.log(`FAIL ${p}`);
  const base = (recorded?.rows || []).filter((row) => missions.has(missionOf(row.key)));
  if (recorded) for (const w of headerWarnings(recorded, measured)) console.log(`warning: ${w}`);
  const changes = diffRows(base, measured.rows);
  for (const change of changes) console.log(formatChange(change));
  const broken = problems.length > 0 || outcomes.some((o) => !o.pass);
  let failed = broken;
  if (update) {
    const refused = allow ? outside(changes, allow) : [];
    if (broken) console.log("Not rewritten: a run or a check failed.");
    else if (refused.length) {
      console.log(`Refused: keys outside --allow ${allow.join(",")} moved: ${refused.join(", ")}`);
      failed = true;
    } else if (changes.length || !recorded) {
      await writeFile(RECORDED, serialize({ ...measured, rows: mergeRows(recorded?.rows || [], measured.rows, missions) }));
      console.log(`Rewrote ${RECORDED}: ${changes.length} changes.`);
    } else console.log(`No row moved; ${RECORDED} left as it is.`);
  } else if (changes.length) {
    console.log(`${changes.length} golden changes. If they are intended, rewrite with UPDATE_GOLDEN=1 (and --allow for the keys that may move).`);
    failed = true;
  } else console.log(`All ${measured.rows.length} golden rows match ${RECORDED}.`);
  console.log(`Golden done in ${((Date.now() - started) / 60000).toFixed(1)} min.`);
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) await main();
