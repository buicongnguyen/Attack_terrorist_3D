// Headroom checks (5.1 P1). Counts only, never timings, so they hold on any machine:
// - no visible material is transparent, two-sided and drawn in two passes;
// - shader program look-ups per frame (three.js re-derives a program when a material's version
//   moves or a shared material switches between plain and instanced meshes);
// - rings keep the radius they were asked for, and share their geometry;
// - the HUD never writes a class or hidden attribute to the value it already has;
// - the canvas size is read once per resize, not per frame;
// - draw-call ceilings at 390x844 (DRAW_CEILINGS; each later item declares its allowance);
// - deterministic QA renders (?qa&det=1) and the 5.0 fragment trajectories;
// - allocation per fixed step on 1.8 (gated on the GPU, logged under SwiftShader).
//
// Run alone: GAME_URL=... GPU=1 npm run perf. With --baseline it also measures, without gating,
// the HUD's coverage of a 390x844 screen on every mission and the frame times there with the CPU
// slowed 4x (GPU=1 only), and rewrites the block between the perf-baseline markers in
// docs/VERIFICATION.md.

import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MISSIONS, chapterStart } from "../src/data.js";

// Draw calls at 390x844 (Sharp), measured on P1: 516 on 1.6, 344 on 1.8 and 335 on 3.2.
export const DRAW_CEILINGS = { 5: 565, 7: 374, 16: 343 };
export const PHONE = { width: 390, height: 844 };
const ALLOC_BUDGET_KB = 60;
// "1.6" for mission index 5.
const code = (index) => `${MISSIONS[index].chapter + 1}.${index - chapterStart(MISSIONS[index].chapter) + 1}`;

const ready = (page) => page.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 120000 });
async function open(browser, url, query = "?qa=1", viewport = PHONE) {
  const page = await browser.newPage({ viewport });
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  await page.goto(`${url}${query}`);
  await ready(page);
  return page;
}

// In the page: start a mission with no dialog in the way, unpaused, then `steps` fixed steps.
function enter(index, steps = 0) {
  const { game: g, ui } = window.__TIDELOCK__;
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  ui.start(index);
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  g.paused = false;
  for (let i = 0; i < steps; i++) g.update(1 / 120);
}

// In the page: renders `frames` frames (two steps each) and returns the program look-ups per
// frame, counted by wrapping every customProgramCacheKey three.js calls when it derives one.
function lookups(frames) {
  const { game: g, view } = window.__TIDELOCK__;
  const counter = (window.__programLookups ||= { n: 0, wrapped: new WeakSet() });
  view.scene.traverse((o) => {
    for (const m of [o.material, o.customDepthMaterial].flat())
      for (let p = m; p; p = Object.getPrototypeOf(p)) {
        if (!Object.prototype.hasOwnProperty.call(p, "customProgramCacheKey") || counter.wrapped.has(p)) continue;
        const key = p.customProgramCacheKey;
        p.customProgramCacheKey = function () {
          counter.n++;
          return key.call(this);
        };
        counter.wrapped.add(p);
      }
  });
  const frame = () => {
    g.update(1 / 120);
    g.update(1 / 120);
    view.render(g.time);
  };
  // The first frames compile; count after them.
  for (let i = 0; i < 10; i++) frame();
  counter.n = 0;
  for (let i = 0; i < frames; i++) frame();
  return counter.n / frames;
}

export async function checkPerf(browser, url, check, { gpu = false } = {}) {
  const log = (line) => console.log(`  perf: ${line}`);

  // ------------------------------------------------ materials, look-ups, rings, draws
  let page = await open(browser, url);
  const scenes = await page.evaluate(
    ([enterSrc, lookupsSrc, ceilings]) => {
      const enter = eval(enterSrc),
        lookups = eval(lookupsSrc);
      const { view } = __TIDELOCK__;
      const out = { twoPass: {}, lookups: {}, draws: {} };
      for (const index of [0, 5, 7, 11, 15, 18]) {
        enter(index, 240);
        const bad = new Set();
        view.scene.traverseVisible((o) => {
          for (const m of [o.material].flat())
            if (m && m.transparent && m.side === 2 && !m.forceSinglePass) bad.add(`${o.name || o.type}:${m.type}`);
        });
        out.twoPass[index] = [...bad];
        out.lookups[index] = lookups(30);
      }
      for (const index of Object.keys(ceilings)) {
        enter(Number(index), 240);
        view.render(__TIDELOCK__.game.time);
        out.draws[index] = view.renderer.info.render.calls;
      }
      return out;
    },
    [`(${enter})`, `(${lookups})`, DRAW_CEILINGS],
  );
  for (const [index, bad] of Object.entries(scenes.twoPass))
    check(`perf: ${code(index)} has no transparent two-sided material drawn in two passes${bad.length ? ` (${bad.join(", ")})` : ""}`, bad.length === 0);
  for (const index of [0, 5, 7, 11, 18])
    check(`perf: ${code(index)} derives at most 2 shader programs a frame (${scenes.lookups[index]})`, scenes.lookups[index] <= 2);
  log(`program look-ups a frame: ${JSON.stringify(scenes.lookups)}`);
  for (const [index, ceiling] of Object.entries(DRAW_CEILINGS))
    check(`perf: ${code(index)} draws at most ${ceiling} calls at 390x844 (${scenes.draws[index]})`, scenes.draws[index] <= ceiling);

  const rings = await page.evaluate(
    ([enterSrc]) => {
      const enter = eval(enterSrc);
      const { game: g, view } = __TIDELOCK__;
      // Every ring asked for, with the radius and thickness asked for.
      const asked = new Map();
      const ring = view.ring;
      view.ring = function (position, radius, color, thickness = 0.06, parent) {
        const mesh = ring.call(this, position, radius, color, thickness, parent);
        asked.set(mesh, { radius, thickness });
        return mesh;
      };
      const out = {};
      const Vector3 = view.camera.position.constructor;
      const p = new Vector3(),
        q = new Vector3(),
        axis = new Vector3();
      try {
        for (const index of [5, 10, 13]) {
          asked.clear();
          enter(index, 0);
          let worst = 0,
            scaled = 0,
            checked = 0;
          for (let step = 0; step < 1200; step++) {
            g.update(1 / 120);
            if (step % 60) continue;
            view.scene.updateMatrixWorld(true);
            for (const [mesh, want] of asked) {
              if (!mesh.parent) continue;
              const geo = mesh.geometry.parameters;
              // The world-space outer radius from the mesh itself, against the radius asked for
              // times the scale its caller set (its own and its parents').
              p.set(geo.outerRadius, 0, 0).applyMatrix4(mesh.matrixWorld);
              q.set(0, 0, 0).applyMatrix4(mesh.matrixWorld);
              const world = p.distanceTo(q);
              const scale = axis.setFromMatrixColumn(mesh.matrixWorld, 0).length();
              worst = Math.max(worst, Math.abs(world - want.radius * scale), Math.abs(geo.outerRadius - want.radius), Math.abs(geo.innerRadius - (want.radius - want.thickness)));
              if (Math.abs(mesh.scale.x - 1) > 1e-3) scaled++;
              checked++;
            }
          }
          const geometries = new Set();
          view.scene.traverse((o) => o.geometry?.type === "RingGeometry" && geometries.add(o.geometry));
          out[index] = { worst, scaled, checked, geometries: geometries.size, meshes: asked.size };
        }
      } finally {
        delete view.ring;
      }
      return out;
    },
    [`(${enter})`],
  );
  for (const [index, r] of Object.entries(rings))
    check(`perf: ${code(index)} rings keep their asked radius times their caller's scale (${r.checked} looks, worst ${r.worst.toExponential(1)})`, r.checked > 0 && r.worst < 1e-6);
  check(`perf: mine halos and pincer rings still scale on 2.2 and 2.5 (${rings[10].scaled}, ${rings[13].scaled} scaled looks)`, rings[10].scaled + rings[13].scaled > 0);
  check(`perf: 1.6 shares ring geometry (${rings[5].geometries} RingGeometry for ${rings[5].meshes} rings; 5.0 had one per ring)`, rings[5].geometries <= 26);
  assert.deepEqual(page.errors, []);
  await page.close();

  // ------------------------------------------------ same-value HUD writes (the real frame loop)
  page = await open(browser, url);
  for (const index of [2, 10, 18]) {
    await page.evaluate(
      ([enterSrc, index]) => {
        eval(enterSrc)(index, 0);
        const records = [];
        const observer = new MutationObserver((list) => records.push(...list));
        observer.observe(document.body, { attributes: true, attributeOldValue: true, subtree: true, attributeFilter: ["class", "hidden"] });
        window.__hudWrites = { observer, records };
      },
      [`(${enter})`, index],
    );
    await page.waitForTimeout(3000);
    const writes = await page.evaluate(() => {
      const { observer, records } = window.__hudWrites;
      records.push(...observer.takeRecords());
      observer.disconnect();
      // A record's new value is the next record's old value for that element and attribute (or
      // the value now, for the last one).
      const next = new Map();
      const same = [];
      for (let i = records.length - 1; i >= 0; i--) {
        const r = records[i];
        const key = r.target;
        if (!next.has(key)) next.set(key, new Map());
        const after = next.get(key);
        const value = after.has(r.attributeName) ? after.get(r.attributeName) : r.target.getAttribute(r.attributeName);
        if (value === r.oldValue) same.push(`${r.target.id || r.target.className}:${r.attributeName}`);
        after.set(r.attributeName, r.oldValue);
      }
      return { total: records.length, same, frames: __TIDELOCK__.game.time };
    });
    check(`perf: ${code(index)} HUD makes no same-value class or hidden write in 3 s (${writes.total} writes${writes.same.length ? `; ${[...new Set(writes.same)].join(", ")}` : ""})`, writes.same.length === 0 && writes.frames > 0);
  }

  // ------------------------------------------------ the canvas size is cached
  await page.evaluate(([enterSrc]) => eval(enterSrc)(15, 0), [`(${enter})`]);
  await page.setViewportSize({ width: 420, height: 800 });
  const reads = await page.evaluate(async () => {
    const { view } = __TIDELOCK__;
    const frame = () => new Promise((done) => requestAnimationFrame(done));
    await frame();
    await frame();
    const canvas = view.canvas,
      height = Object.getOwnPropertyDescriptor(Element.prototype, "clientHeight").get;
    let count = 0;
    Object.defineProperty(canvas, "clientHeight", {
      configurable: true,
      get() {
        count++;
        return height.call(this);
      },
    });
    const renders = view.renderer.info.render.frame;
    for (let i = 0; i < 60; i++) await frame();
    const out = { count, renders: view.renderer.info.render.frame - renders, cached: view.viewHeight === height.call(canvas) };
    // A visual-viewport-style resize: the canvas alone changes size (no window resize event).
    await new Promise((done) =>
      requestAnimationFrame(() => {
        canvas.style.height = "600px";
        done();
      }),
    );
    await frame();
    out.followed = view.viewHeight === 600;
    canvas.style.height = "";
    await frame();
    await frame();
    out.restored = view.viewHeight === height.call(canvas);
    delete canvas.clientHeight;
    return out;
  });
  check(`perf: the canvas height is read at most once in 60 rendered frames after a resize (${reads.count} reads, ${reads.renders} frames)`, reads.count <= 1 && reads.renders >= 60 && reads.cached);
  check("perf: a canvas-only resize updates the size cache before the next frame", reads.followed && reads.restored);
  assert.deepEqual(page.errors, []);
  await page.close();

  // ------------------------------------------------ deterministic renders and fragments
  const render = async () => {
    const det = await open(browser, url, "?qa=1&det=1", { width: 640, height: 360 });
    const hash = await det.evaluate(
      ([enterSrc]) => {
        eval(enterSrc)(5, 600);
        const { game: g, view } = __TIDELOCK__;
        g.paused = true;
        view.render(g.time);
        const gl = view.renderer.getContext(),
          data = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
        gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, data);
        let h = 2166136261;
        for (let i = 0; i < data.length; i++) h = Math.imul(h ^ data[i], 16777619);
        return `${data.length}:${h >>> 0}`;
      },
      [`(${enter})`],
    );
    await det.close();
    return hash;
  };
  const [first, second] = [await render(), await render()];
  check(`perf: two ?det=1 renders of 1.6 after the same 600 steps are pixel-identical (${first})`, first === second);

  const fixture = JSON.parse(await readFile(new URL("./golden/fragments-5.0.json", import.meta.url), "utf8"));
  page = await open(browser, url, "?qa=1&det=1", { width: 1280, height: 720 });
  const motion = await page.evaluate(
    ([enterSrc, f]) => {
      eval(enterSrc)(f.mission, f.warmup);
      const { game: g, view } = __TIDELOCK__;
      // The fragments' own draws start from a known seed, whatever ran before.
      const seeded = (seed) => {
        let a = seed >>> 0;
        return () => {
          a = (a + 0x6d2b79f5) >>> 0;
          let t = a;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      };
      Math.random = seeded(f.seed);
      const before = g.fragments.length,
        at = view.strikeFollow;
      g.shatter(view.camera.position.clone().set(at.x, 4, at.z), [0x6b5a4a, 0x2f2c35, 0xb08a64], f.fragments, 1.5);
      const mine = g.fragments.slice(before, before + f.fragments);
      const rows = [];
      for (let s = 0; s < f.steps; s++) {
        g.update(1 / 120);
        for (const piece of mine) rows.push(piece.mesh.position.x, piece.mesh.position.y, piece.mesh.position.z);
      }
      // A smoke column keeps puffing while it lasts, then stops; debris follows its bodies.
      const smoke = view.fx.smoke;
      const anchor = view.camera.position.clone().set(at.x, 1.2, at.z);
      g.smokeColumn(anchor, 1, 1);
      const s0 = smoke.spawned;
      for (let s = 0; s < 60; s++) g.update(1 / 120);
      const during = smoke.spawned - s0;
      for (let s = 0; s < 120; s++) g.update(1 / 120);
      const columnGone = !g.emitters.some((e) => e.anchor === anchor);
      g.debrisChunk(anchor.clone().setY(3), anchor.clone().set(0.4, 0.3, 0.4), 0x6b5a4a, anchor);
      let follows = true,
        moved = 0;
      const chunk = g.debris.at(-1);
      const start = chunk.mesh.position.clone();
      // Each step copies the body's pose to the mesh before the physics steps on.
      const body = start.clone();
      for (let s = 0; s < 60; s++) {
        body.copy(chunk.body.position);
        g.update(1 / 120);
        follows &&= chunk.mesh.position.equals(body);
        moved = Math.max(moved, chunk.mesh.position.distanceTo(start));
      }
      return { n: mine.length, rows, during, columnGone, follows, moved };
    },
    [`(${enter})`, fixture],
  );
  const sha = createHash("sha256").update(Buffer.from(new Float64Array(motion.rows).buffer)).digest("hex");
  check(`perf: the first ${fixture.fragments} fragments of a 1.6 blast fly the 5.0 trajectory for ${fixture.steps} steps`, motion.n === fixture.fragments && sha === fixture.sha256);
  check(`perf: smoke columns keep puffing (${motion.during} puffs in 0.5 s) and stop when spent`, motion.during >= 6 && motion.columnGone);
  check("perf: debris keeps following its physics bodies", motion.follows && motion.moved > 0.05);
  assert.deepEqual(page.errors, []);
  await page.close();

  // ------------------------------------------------ allocation per fixed step on 1.8
  page = await open(browser, url, "?qa=1", { width: 1280, height: 720 });
  await page.evaluate(([enterSrc]) => eval(enterSrc)(7, 240), [`(${enter})`]);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  await cdp.send("HeapProfiler.collectGarbage");
  // Sampled allocations, those collected since included.
  await cdp.send("HeapProfiler.startSampling", { samplingInterval: 256, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  await page.evaluate(() => {
    const { game: g } = __TIDELOCK__;
    for (let i = 0; i < 480; i++) g.update(1 / 120);
  });
  const { profile } = await cdp.send("HeapProfiler.stopSampling");
  let bytes = 0;
  const walk = (node) => {
    bytes += node.selfSize;
    node.children.forEach(walk);
  };
  walk(profile.head);
  const perStep = bytes / 480 / 1024;
  if (gpu) check(`perf: 1.8 allocates at most ${ALLOC_BUDGET_KB} KB per fixed step over 480 steps (${perStep.toFixed(1)} KB)`, perStep <= ALLOC_BUDGET_KB);
  else log(`1.8 allocates ${perStep.toFixed(1)} KB per fixed step over 480 steps (logged only under SwiftShader)`);
  await page.close();
}

// ------------------------------------------------ baselines (no gate)

// The share of a 390x844 phone screen (touch layout) under HUD panels, per mission: a 10 px grid,
// and a point counts when it lies inside any painted HUD element (a background, a border, text,
// an icon or a canvas), click-through or not. World tags and edge markers are not panels.
// hud-browser.mjs gates five missions with it (5.1 H1).
export async function coverage(browser, url, indexes = MISSIONS.map((_, i) => i)) {
  const page = await browser.newPage({ viewport: PHONE, isMobile: true, hasTouch: true });
  await page.goto(`${url}?qa=1`);
  await ready(page);
  const out = [];
  for (const index of indexes) {
    const mission = MISSIONS[index];
    await page.evaluate(([enterSrc, index]) => eval(enterSrc)(index, 120), [`(${enter})`, index]);
    // Two real frames: the HUD lays out as in play.
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const share = await page.evaluate(() => {
      const labels = document.getElementById("world-labels"),
        markers = document.getElementById("edge-markers");
      const shown = (el) => {
        for (let e = el; e && e !== document.body; e = e.parentElement) {
          const css = getComputedStyle(e);
          if (css.display === "none" || css.visibility === "hidden" || Number(css.opacity) === 0) return false;
        }
        return true;
      };
      const painted = (el, css) =>
        (css.backgroundColor !== "rgba(0, 0, 0, 0)" && css.backgroundColor !== "transparent") ||
        css.backgroundImage !== "none" ||
        parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth) + parseFloat(css.borderLeftWidth) + parseFloat(css.borderRightWidth) > 0 ||
        ["CANVAS", "IMG", "svg"].includes(el.tagName) ||
        [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      const rects = [];
      for (const el of document.querySelectorAll("#app *")) {
        if (labels.contains(el) || markers.contains(el)) continue;
        const css = getComputedStyle(el);
        if (!painted(el, css) || !shown(el)) continue;
        for (const r of el.getClientRects()) if (r.width > 0 && r.height > 0) rects.push(r);
      }
      let covered = 0,
        total = 0;
      for (let y = 5; y < innerHeight; y += 10)
        for (let x = 5; x < innerWidth; x += 10) {
          total++;
          if (rects.some((r) => x >= r.left && x < r.right && y >= r.top && y < r.bottom)) covered++;
        }
      return covered / total;
    });
    out.push({ index, code: code(index), name: mission.name, share });
  }
  await page.close();
  return out;
}

// Frame times of the real loop at 390x844 with the CPU slowed 4x (Chrome's CPU throttling).
async function frameTimes(browser, url, indexes) {
  const out = [];
  for (const index of indexes) {
    const page = await open(browser, url);
    const cdp = await page.context().newCDPSession(page);
    await page.evaluate(([enterSrc, index]) => eval(enterSrc)(index, 0), [`(${enter})`, index]);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const times = await page.evaluate(
      () =>
        new Promise((done) => {
          const gaps = [];
          let last = 0,
            start = 0;
          const tick = (now) => {
            if (!start) start = now;
            // Two seconds to settle, then five measured.
            if (last && now - start > 2000) gaps.push(now - last);
            last = now;
            if (now - start < 7000) requestAnimationFrame(tick);
            else done(gaps);
          };
          requestAnimationFrame(tick);
        }),
    );
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    times.sort((a, b) => a - b);
    const at = (q) => times[Math.min(times.length - 1, Math.floor(q * times.length))];
    out.push({ code: code(index), frames: times.length, p50: at(0.5), p95: at(0.95) });
    await page.close();
  }
  return out;
}

async function baseline(browser, url, gpu) {
  const share = await coverage(browser, url);
  const lines = [
    "<!-- perf-baseline:start (written by npm run perf -- --baseline) -->",
    `HUD coverage at 390x844, touch layout (share of a 10 px grid under a painted HUD element, after 1 s of play; ${new Date().toLocaleDateString("en-CA")}):`,
    "",
    "| Mission | Coverage |",
    "|---|---|",
    ...share.map((m) => `| ${m.code} ${m.name} | ${(m.share * 100).toFixed(1)}% |`),
    "",
  ];
  if (gpu) {
    const times = await frameTimes(browser, url, [5, 7, 18]);
    lines.push(
      "Frame times at 390x844 with the CPU slowed 4x (GPU, the real frame loop, no input, 5 s after 2 s to settle):",
      "",
      "| Mission | Frames | p50 | p95 |",
      "|---|---|---|---|",
      ...times.map((t) => `| ${t.code} | ${t.frames} | ${t.p50.toFixed(1)} ms | ${t.p95.toFixed(1)} ms |`),
      "",
    );
  } else lines.push("Frame times: not measured (they need GPU=1).", "");
  lines.push("<!-- perf-baseline:end -->");
  const block = lines.join("\n");
  console.log(block);
  const file = new URL("../docs/VERIFICATION.md", import.meta.url);
  const doc = await readFile(file, "utf8");
  const pattern = /<!-- perf-baseline:start[\s\S]*?<!-- perf-baseline:end -->/;
  if (!pattern.test(doc)) throw new Error("docs/VERIFICATION.md has no perf-baseline block");
  await writeFile(file, doc.replace(pattern, block));
}

async function main() {
  const url = process.env.GAME_URL || "http://127.0.0.1:5183/";
  const gpu = process.env.GPU === "1";
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : undefined),
    headless: true,
    args: gpu ? ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] : ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  let passed = 0;
  const check = (name, value) => {
    assert.ok(value, name);
    passed++;
    console.log(`PASS ${name}`);
  };
  try {
    await checkPerf(browser, url, check, { gpu });
    if (process.argv.includes("--baseline")) await baseline(browser, url, gpu);
    console.log(`${passed} perf checks passed.`);
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) await main();
