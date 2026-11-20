// The in-mission HUD on phones and desktop (5.1 H1): 11 px text and 44 px touch targets in play,
// the tide chip at every width, HUD coverage at 390x844, world tags clear of the panels, the
// callout lanes, edge markers, the boss slot, the collapsed map and intel chip, and target kinds
// told apart by glyph and shape. Runs in the browser suite (tests/browser.mjs).
import { MISSIONS } from "../src/data.js";
import { coverage } from "./perf-browser.mjs";

const AUDITED = [0, 3, 6, 9, 14, 15, 18];
const VIEWPORTS = [
  [390, 844],
  [360, 740],
  [844, 390],
  [320, 568],
  [1440, 900],
];
const COVERAGE_MISSIONS = [0, 6, 9, 15, 18];
const COVERAGE_TARGET = 0.4;
// Missions still above the target after every named cut, at their measured share (rounded up),
// so they cannot grow while the owner decides (docs/VERIFICATION.md, 5.1 H1).
const COVERAGE_SIGNOFF = { 6: 0.44 };
const code = (index) => `${MISSIONS[index].chapter + 1}.${index - MISSIONS.findIndex((m) => m.chapter === MISSIONS[index].chapter) + 1}`;

// In the page: a mission started with no dialog in the way, `steps` fixed steps, a fresh HUD.
function enter(index, steps) {
  const { game: g, ui } = window.__TIDELOCK__;
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  ui.start(index);
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  g.paused = false;
  for (let i = 0; i < steps; i++) g.update(1 / 120);
  ui.updateBadgeBounds();
  ui.updateHUD(true);
}
const frames = (page, n = 2) =>
  page.evaluate((n) => new Promise((done) => {
    const next = (k) => (k ? requestAnimationFrame(() => next(k - 1)) : done());
    next(n);
  }), n);

// In the page: what the HUD shows now, against the house rules.
function audit({ touch, tide }) {
  const { ui } = window.__TIDELOCK__;
  const app = document.getElementById("app");
  const shown = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const css = getComputedStyle(e);
      if (css.display === "none" || css.visibility === "hidden" || Number(css.opacity) === 0) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const out = { text: [], targets: [], tide: null, tags: [], pinned: [] };
  for (const el of app.querySelectorAll("*")) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || !shown(el)) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < 11) out.text.push(`${el.id || el.className || el.tagName} ${size}px "${el.textContent.trim().slice(0, 16)}"`);
  }
  if (touch)
    for (const el of app.querySelectorAll("button, [role=button]")) {
      if (!shown(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 43.5 || r.height < 43.5) out.targets.push(`${el.id || el.className || el.dataset.bomb || el.tagName} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  if (tide) {
    const chip = document.getElementById("tide-chip"),
      css = getComputedStyle(chip),
      r = chip.getBoundingClientRect();
    out.tide = {
      shown: css.display !== "none" && r.width > 0,
      inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      size: parseFloat(getComputedStyle(document.getElementById("tide-text")).fontSize),
      text: document.getElementById("tide-text").textContent,
    };
  }
  // World tags against the panels as they are laid out now; pinned tags against the free rect.
  const panels = ui.badgeOverlays.map((n) => n.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
  const free = ui.freeRect;
  for (const [id, tag] of ui.labels) {
    if (!shown(tag.el)) continue;
    const r = tag.el.getBoundingClientRect();
    if (["boss", "gates", "station"].includes(id) || tag.kind === "key") {
      if (r.left < free.left - 1 || r.top < free.top - 1 || r.right > free.right + 1 || r.bottom > free.bottom + 1) out.pinned.push(id);
    } else if (panels.some((p) => r.left < p.right && r.right > p.left && r.top < p.bottom && r.bottom > p.top)) out.tags.push(id);
  }
  return out;
}

export async function checkHud(browser, url, check) {
  for (const [width, height] of VIEWPORTS) {
    const touch = width < 1000,
      size = `${width}x${height}`;
    const page = await browser.newPage({ viewport: { width, height }, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${url}?qa=1`);
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 120000 });

    // ---- text, targets and tags on the seven audited missions
    for (const index of AUDITED) {
      await page.evaluate(([src, index]) => eval(src)(index, 240), [`(${enter})`, index]);
      await frames(page);
      const a = await page.evaluate(audit, { touch, tide: false });
      check(`hud ${size} ${code(index)} text is 11 px or more${a.text.length ? `: ${a.text.slice(0, 3).join("; ")}` : ""}`, a.text.length === 0);
      if (touch) check(`hud ${size} ${code(index)} touch targets are 44x44 or more${a.targets.length ? `: ${a.targets.slice(0, 4).join("; ")}` : ""}`, a.targets.length === 0);
      check(`hud ${size} ${code(index)} no world tag sits under a panel${a.tags.length ? `: ${a.tags.join(", ")}` : ""}`, a.tags.length === 0);
      check(`hud ${size} ${code(index)} boss and objective tags stay inside the free rect${a.pinned.length ? `: ${a.pinned.join(", ")}` : ""}`, a.pinned.length === 0);
    }
    // The collapsed panels opened: their text and buttons keep the rules too (the city, 1.3).
    if (touch) {
      await page.evaluate(([src]) => {
        eval(src)(2, 1400);
        for (const id of ["objective-line", "map-toggle", "intel-next"]) document.getElementById(id).click();
      }, [`(${enter})`]);
      await frames(page);
      const a = await page.evaluate(audit, { touch, tide: false });
      check(`hud ${size} opened map, intel and mission card keep 11 px text and 44 px targets${[...a.text, ...a.targets].length ? `: ${[...a.text, ...a.targets].slice(0, 4).join("; ")}` : ""}`, a.text.length + a.targets.length === 0);
    }

    // ---- the tide chip, rendered on every chapter-1 mission
    const tide = [];
    for (let index = 0; index <= 8; index++) {
      await page.evaluate(([src, index]) => eval(src)(index, 0), [`(${enter})`, index]);
      const a = await page.evaluate(audit, { touch: false, tide: true });
      if (!a.tide.shown || !a.tide.inside || a.tide.size < 13 || !/^SURGE \d+:\d\d$/.test(a.tide.text)) tide.push(`${code(index)} ${JSON.stringify(a.tide)}`);
    }
    check(`hud ${size} the tide chip is shown, on screen and 13 px or more on 1.1-1.9${tide.length ? `: ${tide[0]}` : ""}`, tide.length === 0);

    // ---- callout lanes (the city, 1.1: its coach line holds the hint lane)
    const lanes = await page.evaluate(async ([src]) => {
      const { game: g, ui } = window.__TIDELOCK__;
      eval(src)(0, 60);
      const $ = (id) => document.getElementById(id);
      const wait = (ms) => new Promise((done) => setTimeout(done, ms));
      g.notify("combo", { count: 3, bonus: 270 });
      g.notify("checkpoint", "THE NARROWS");
      g.notify("toast", "SALVO x2");
      ui.updateHUD(true);
      await wait(450);
      // The banner and toast count as shown by their class: under SwiftShader their fade may not have
      // advanced by now. The coach line has no fade.
      const shown = (id, el) => (id === "coach" ? Number(getComputedStyle(el).opacity) > 0 : el.classList.contains("visible"));
      const rects = ["combo", "toast", "coach"].map((id) => [id, $(id)]).filter(([id, el]) => getComputedStyle(el).display !== "none" && shown(id, el));
      const boxes = rects.map(([id, el]) => [id, el.getBoundingClientRect()]);
      const clashes = [];
      for (const [i, [a, r]] of boxes.entries())
        for (const [b, q] of boxes.slice(i + 1)) if (r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top) clashes.push(`${a}/${b}`);
      const out = { lanes: boxes.map(([id]) => id).join(","), clashes, banner: $("combo-count").textContent };
      g.notify("toast", "INTERCEPT +90");
      out.plainToast = $("toast").className === "visible";
      // The same toast within 3 s merges.
      g.notify("toast", "SHIELD HIT");
      g.notify("toast", "SHIELD HIT");
      g.notify("toast", "SHIELD HIT");
      out.merged = $("toast").textContent;
      // A pause holds a toast past its time.
      g.notify("toast", "HOLD ON");
      g.paused = true;
      await wait(3000);
      g.paused = false;
      ui.updateHUD();
      out.held = $("toast").classList.contains("visible") && $("toast").textContent === "HOLD ON";
      // A new mission starts with every lane empty, the multi-kill banner included.
      g.notify("combo", { count: 2, bonus: 120 });
      ui.start(0);
      out.comboCleared = !$("combo").classList.contains("visible") && Number(getComputedStyle($("combo")).opacity) === 0 && !$("toast").classList.contains("visible");
      return out;
    }, [`(${enter})`]);
    check(`hud ${size} banner, toast and hint lanes fired in one tick never overlap (${lanes.lanes}${lanes.clashes.length ? `; ${lanes.clashes.join(", ")}` : ""})`, lanes.clashes.length === 0 && lanes.lanes.includes("combo") && lanes.lanes.includes("toast") && lanes.banner === "THE NARROWS");
    check(`hud ${size} the toast after a checkpoint carries no checkpoint class`, lanes.plainToast);
    check(`hud ${size} the same toast within 3 s merges ("${lanes.merged}")`, lanes.merged === "SHIELD HIT x3");
    check(`hud ${size} a toast shown before a 3 s pause is still up after it`, lanes.held);
    check(`hud ${size} the multi-kill banner is cleared by a mission start`, lanes.comboCleared);

    // ---- edge markers: a fixed pool, the top border, clear of the panels
    if ([390, 844, 1440].includes(width)) {
      const edge = await page.evaluate(async ([src]) => {
        const { game: g, ui, view } = window.__TIDELOCK__;
        const frame = () => new Promise((done) => requestAnimationFrame(done));
        eval(src)(9, 0);
        const out = {};
        // 150 tracks (far more ids than slots), then 150 untracks.
        const probe = { x: 0, y: 0, z: 0 };
        for (let i = 0; i < 150; i++) ui.edge.track(`probe-${i}`, probe, "gun");
        for (let i = 0; i < 150; i++) ui.edge.untrack(`probe-${i}`);
        out.nodes = document.querySelectorAll("#edge-markers > *").length;
        // A canal gun aiming from far up the canal, above the frame.
        g.op.spawn({ d: 0, type: "guns", side: 1, count: 1 });
        const gun = g.entities.find((e) => e.type === "cannon");
        gun.position.z = -12;
        gun.cooldown = 0;
        for (let i = 0; i < 60 && !(gun.aim > 0); i++) g.update(1 / 120);
        g.paused = true;
        gun.position.z = -90;
        await frame();
        await frame();
        const p = view.project(gun.position),
          free = ui.freeRect;
        const shown = [...document.querySelectorAll(".edge-marker")].filter((m) => getComputedStyle(m).visibility === "visible");
        const marker = shown.find((m) => m.dataset.kind === "gun");
        const r = marker?.getBoundingClientRect();
        out.above = p.y < free.top;
        out.top = r ? Math.abs(r.top - free.top) : null;
        out.text = marker?.textContent;
        const panels = ui.badgeOverlays.map((n) => n.getBoundingClientRect()).filter((q) => q.width > 0 && q.height > 0);
        out.clear = shown.every((m) => {
          const q = m.getBoundingClientRect();
          return !panels.some((b) => q.left < b.right && q.right > b.left && q.top < b.bottom && q.bottom > b.top);
        });
        g.paused = false;
        return out;
      }, [`(${enter})`]);
      check(`hud ${size} edge markers keep exactly 8 nodes after 300 track and untrack calls (${edge.nodes})`, edge.nodes === 8);
      check(`hud ${size} a gun aiming from above the frame gets a chevron on the free rect's top border in one frame (${edge.top} px off, "${edge.text}")`, edge.above && edge.top !== null && edge.top <= 2);
      check(`hud ${size} no edge marker overlaps a HUD panel`, edge.clear);

      // ---- the boss slot (2.6 Lock Gate)
      const slot = await page.evaluate(async ([src]) => {
        const { game: g, ui } = window.__TIDELOCK__;
        eval(src)(14, 0);
        g.op.spawnGate();
        g.op.boss.phase = "towers";
        ui.updateHUD(true);
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        ui.updateBadgeBounds();
        const box = document.getElementById("boss-slot").getBoundingClientRect();
        const others = ui.badgeOverlays.filter((n) => n.id !== "boss-slot").map((n) => [n.id || n.className, n.getBoundingClientRect()]).filter(([, r]) => r.width > 0 && r.height > 0);
        const bars = [...document.querySelectorAll("#boss-slot .bar")].map((b) => b.getBoundingClientRect());
        return {
          height: box.height,
          gutters: Math.round(box.left) === 16 && Math.round(innerWidth - box.right) === 16,
          clashes: others.filter(([, r]) => r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top).map(([id]) => id),
          bars: bars.length,
          inside: bars.every((r) => r.left >= box.left && r.right <= box.right && r.top >= box.top && r.bottom <= box.bottom),
        };
      }, [`(${enter})`]);
      check(`hud ${size} the boss slot is at most 28 px tall within the 16 px gutters and meets no other HUD rect${slot.clashes.length ? `: ${slot.clashes.join(", ")}` : ""}`, slot.height <= 28 && slot.gutters && slot.clashes.length === 0);
      check(`hud ${size} the Lock Gate's three bars render inside the boss slot`, slot.bars === 3 && slot.inside);
    }

    // ---- the collapsed map and the intel chip (phones)
    if (touch) {
      const map = await page.evaluate(async ([src]) => {
        const { game: g, ui } = window.__TIDELOCK__;
        const $ = (id) => document.getElementById(id);
        eval(src)(2, 0);
        const button = $("map-toggle").getBoundingClientRect();
        const out = { button: button.width >= 44 && button.height >= 44, closed: getComputedStyle($("radar")).display === "none" };
        $("map-toggle").click();
        out.opens = getComputedStyle($("radar")).display !== "none" && $("radar").getBoundingClientRect().height > 0;
        $("map-toggle").click();
        // The first gathering going live pings the closed map within one frame.
        ui.updateHUD();
        out.quiet = $("map-ping").hidden;
        for (let i = 0; i < 120 * 40 && !g.op.events.some((e) => e.status?.active); i++) g.update(1 / 120);
        ui.updateHUD();
        out.ping = !$("map-ping").hidden && getComputedStyle($("map-ping")).display !== "none";
        $("map-toggle").click();
        out.pingClears = $("map-ping").hidden;
        $("map-toggle").click();
        // The intel chip names the strip's first event and its time.
        eval(src)(2, 240);
        const chip = $("intel").querySelector(".intel-chip");
        const seconds = (text) => {
          const clock = /(\d+):(\d\d)/.exec(text);
          return clock ? +clock[1] * 60 + +clock[2] : +/(\d+)s/.exec(text)?.[1];
        };
        out.next = $("intel-next-text").textContent;
        out.first = `${chip.querySelector("b").textContent} ${chip.querySelector("strong").textContent}`;
        out.same = out.next.startsWith(chip.querySelector("b").textContent) && seconds(out.next) === seconds(chip.querySelector("strong").textContent);
        return out;
      }, [`(${enter})`]);
      check(`hud ${size} the collapsed map button is 44x44 or more and the map starts closed`, map.button && map.closed);
      check(`hud ${size} a tap on the map button opens the map`, map.opens);
      check(`hud ${size} a new ping lights the map button's dot within one frame, and opening the map clears it`, map.quiet && map.ping && map.pingClears);
      check(`hud ${size} the intel chip shows the strip's next event ("${map.next}" / "${map.first}")`, map.same);
    }
    check(`hud ${size} page errors${errors.length ? `: ${errors[0].slice(0, 80)}` : ""}`, errors.length === 0);
    await page.close();
  }

  // ---- target kinds differ by glyph or shape, not only colour (tags and city map marks)
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${url}?qa=1`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 120000 });
  const kinds = await page.evaluate(([src]) => {
    const { game: g, ui } = window.__TIDELOCK__;
    eval(src)(6, 0);
    const at = { x: g.op.bounds.minX + 10, y: 2, z: 0 };
    ui.updateLabels([
      { id: "t-key", ...at, text: "★ 4", kind: "key" },
      { id: "t-civilian", ...at, text: "CIVILIAN IN THE PATTERN", kind: "civilian" },
      { id: "t-hostile", ...at, text: "● 3" },
    ]);
    const glyph = (id) => [...ui.labels.get(id).el.querySelectorAll("svg")].map((s) => s.getAttribute("class")).join(" ");
    const plain = ui.labels.get("t-hostile").el;
    const tags = {
      key: glyph("t-key"),
      civilian: glyph("t-civilian"),
      hostile: glyph("t-hostile"),
      keyText: ui.labels.get("t-key").el.textContent,
      // A tag without a kind carries no data-kind, so it keeps the plain tag's 12 px.
      plain: !plain.hasAttribute("data-kind") && getComputedStyle(plain).fontSize === "12px",
    };
    // The map marks, recorded from the canvas calls for one target of each kind.
    const canvas = document.getElementById("radar-map").getContext("2d");
    const calls = [];
    const proto = Object.getPrototypeOf(canvas);
    const spy = {};
    for (const name of ["beginPath", "arc", "lineTo", "fill", "stroke", "fillRect"]) {
      spy[name] = proto[name];
      canvas[name] = function (...args) {
        calls.push(name);
        return spy[name].apply(this, args);
      };
    }
    const op = g.op.snapshot();
    const shapes = {};
    for (const kind of ["ship", "key", "civilian"]) {
      calls.length = 0;
      ui.drawRadar({ ...op, aim: null, radar: { ...op.radar, flight: null, pipper: null, rallies: [], tunnels: [], airspace: null, targets: [{ x: 0, z: 0, kind }] } });
      // The target is drawn last: from its beginPath on.
      const last = calls.lastIndexOf("beginPath");
      shapes[kind] = calls.slice(last + 1).join(",");
    }
    for (const name of Object.keys(spy)) delete canvas[name];
    return { tags, shapes };
  }, [`(${enter})`]);
  check(`hud tags: a key target wears a star, a civilian a ban sign, a hostile no glyph (${JSON.stringify(kinds.tags)})`, /lucide-star/.test(kinds.tags.key) && /lucide-ban/.test(kinds.tags.civilian) && kinds.tags.hostile === "" && kinds.tags.keyText === "4");
  check(`hud map marks: hostile a dot, key a diamond, civilian a hollow ring (${JSON.stringify(kinds.shapes)})`, kinds.shapes.ship === "arc,fill" && kinds.shapes.key === "lineTo,lineTo,lineTo,fill" && kinds.shapes.civilian === "arc,stroke");
  check("hud a tag without a kind has no data-kind attribute and stays 12 px", kinds.tags.plain);

  // Reduced motion still shows the banner lane; a decided mission leaves no callout under the
  // result; a drained vehicle wears no shield ring.
  const late = await page.evaluate(async ([src]) => {
    const { game: g, ui } = window.__TIDELOCK__;
    const $ = (id) => document.getElementById(id);
    const out = {};
    eval(src)(9, 0);
    $("reduced-motion").click();
    g.notify("checkpoint", "THE NARROWS");
    await new Promise((done) => setTimeout(done, 100));
    out.bannerStill = Number(getComputedStyle($("combo")).opacity) === 1;
    g.notify("combo", { count: 2, bonus: 120 });
    out.comboStill = Number(getComputedStyle($("combo")).opacity) === 1;
    $("reduced-motion").click();
    g.shields = [0, 0, 0];
    g.update(1 / 120);
    out.ringHidden = g.shieldRing.visible === false;
    g.shields = [1, 0, 0];
    g.update(1 / 120);
    out.ringBack = g.shieldRing.visible === true;
    g.notify("toast", "LAST WORD");
    g.finish(true);
    for (let i = 0; i < 120 * 6 && !$("result-dialog").open; i++) g.update(1 / 120);
    ui.updateHUD();
    out.resultClears = $("result-dialog").open && !$("toast").classList.contains("visible") && !$("combo").classList.contains("visible");
    document.querySelectorAll("dialog[open]").forEach((d) => d.close());
    return out;
  }, [`(${enter})`]);
  check(`hud reduced motion: checkpoint and multi-kill banners stay visible (${JSON.stringify(late)})`, late.bannerStill && late.comboStill);
  check("hud the shield ring hides when every shield is gone, and returns with one", late.ringHidden && late.ringBack);
  check("hud the result dialog leaves no toast or banner behind it", late.resultClears);
  await page.close();

  // ---- HUD coverage at 390x844 (gated: 40% or less, or the recorded sign-off line)
  for (const m of await coverage(browser, url, COVERAGE_MISSIONS)) {
    const limit = COVERAGE_SIGNOFF[m.index] ?? COVERAGE_TARGET;
    check(`hud coverage at 390x844 on ${m.code} is ${(m.share * 100).toFixed(1)}% (at most ${limit * 100}%${limit > COVERAGE_TARGET ? ", above the 40% target: owner sign-off" : ""})`, m.share <= limit);
  }
}
