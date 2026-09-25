import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { checkRescue } from "./rescue-browser.mjs";
import { checkStrike } from "./strike-browser.mjs";
import { checkRiver } from "./river-browser.mjs";
import { checkHarbour } from "./harbour-browser.mjs";

const url = process.env.GAME_URL || "http://127.0.0.1:5183/";
const executablePath =
  process.env.CHROME_PATH || (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : undefined);
const gpu = process.env.GPU === "1";
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: gpu
    ? ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"]
    : ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
await mkdir("test-results", { recursive: true });
const errors = [],
  results = [];
const check = (name, value) => {
  assert.ok(value, name);
  results.push(name);
  console.log(`PASS ${name}`);
};
const watch = (page) => {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
};
const ready = (page) => page.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 90000 });
const pixels = () => {
  const view = __TIDELOCK__.view;
  view.render(__TIDELOCK__.game.time);
  const gl = view.renderer.getContext(),
    data = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
  gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, data);
  const colors = new Set();
  for (let i = 0; i < data.length; i += 256) colors.add(`${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`);
  return { colors: colors.size, triangles: view.renderer.info.render.triangles, calls: view.renderer.info.render.calls };
};

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
watch(page);
let firstFrame = null;
try {
  // ---------------------------------------------------------------- story flow
  await page.goto(`${url}?qa=1&prologue=1&brief=1`);
  await ready(page);
  check("all 49 Blender models loaded", await page.evaluate(() => __TIDELOCK__.view.assets.size === 49 && __TIDELOCK__.view.missing.size === 0));
  check("prologue opens the campaign", await page.evaluate(() => document.getElementById("prologue-dialog").open && __TIDELOCK__.game.paused));
  await page.getByRole("button", { name: /Begin Operation Breakwater/ }).click();
  check(
    "briefing follows with goals and cast lines",
    await page.evaluate(
      () =>
        document.getElementById("brief-dialog").open &&
        document.querySelectorAll("#brief-goals li").length >= 1 &&
        document.querySelectorAll("#brief-lines .radio-line").length >= 2,
    ),
  );
  await page.keyboard.press("Enter");
  check("Enter launches the mission", await page.evaluate(() => !document.getElementById("brief-dialog").open && !__TIDELOCK__.game.paused));
  await page.waitForFunction(() => document.querySelectorAll("#comms .radio-line").length > 0);
  check("radio feed carries the opening line", true);
  firstFrame = await page.evaluate(pixels);
  check("canvas contains varied rendered geometry", firstFrame.colors > 40 && firstFrame.triangles > 20000);
  await page.screenshot({ path: "test-results/chapter1-desktop.png" });

  // ---------------------------------------------------------------- real keyboard controls
  await page.goto(`${url}?qa=1`);
  await ready(page);
  await page.evaluate(() => __TIDELOCK__.ui.start(0));
  const lane = await page.evaluate(() => __TIDELOCK__.game.op.flight.lane);
  await page.keyboard.down("s");
  await page.waitForFunction((l) => __TIDELOCK__.game.op.flight.lane > l + 2, lane, { timeout: 15000 });
  await page.keyboard.up("s");
  check("keyboard steers the formation's lane", true);
  await page.waitForFunction(() => __TIDELOCK__.game.op.flight.phase === "pass" && __TIDELOCK__.game.op.aircraft[0].forecast);
  await page.keyboard.press("Space");
  check("Space releases the selected payload", await page.evaluate(() => __TIDELOCK__.game.op.used === 1));
  // E / C drive the dial: the Drill floor on a Drill mission, nothing where there is no Drill.
  await page.keyboard.press("e");
  check("E does nothing without a Drill or pattern", await page.evaluate(() => __TIDELOCK__.game.op.floor === 1));
  await page.evaluate(() => {
    __TIDELOCK__.ui.start(1);
    __TIDELOCK__.game.paused = false;
  });
  await page.keyboard.press("e");
  await page.keyboard.press("e");
  check("E raises the drill floor", await page.evaluate(() => __TIDELOCK__.game.op.floor === 3));
  // Gameplay keys follow the physical layout: AZERTY's Z sits where QWERTY's W is.
  const azerty = await page.evaluate(() => {
    const { ui, game: g } = __TIDELOCK__;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", code: "KeyW" }));
    ui.updateInput();
    const held = g.input.z;
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "z", code: "KeyW" }));
    ui.updateInput();
    return held === -1 && g.input.z === 0;
  });
  check("keys follow the physical layout (AZERTY Z steers like W)", azerty);
  // F turns the flight round; a mouse click on the map releases like Space.
  await page.evaluate(() => {
    __TIDELOCK__.ui.start(0);
    __TIDELOCK__.game.paused = false;
  });
  await page.keyboard.press("f");
  check("F reverses the flight", await page.evaluate(() => __TIDELOCK__.game.op.flight.phase === "turn" && __TIDELOCK__.game.op.flight.dir === -1));
  await page.waitForFunction(() => __TIDELOCK__.game.op.flight.phase === "pass", null, { timeout: 10000 });
  await page.mouse.click(720, 450);
  check("a mouse click on the map releases a bomb", await page.evaluate(() => __TIDELOCK__.game.op.used === 1));

  // ---------------------------------------------------------------- results and debrief
  const debrief = await page.evaluate(() => {
    const { game: g, ui } = __TIDELOCK__;
    ui.start(4);
    g.paused = false;
    const shelter = g.op.buildings.find((b) => b.kind === "shelter");
    g.op.detonate({ kind: "shockwave", mesh: g.view.model("bomb-blast"), dead: false }, { x: shelter.x, y: shelter.top, z: shelter.z });
    for (let i = 0; i < 240; i++) g.update(1 / 120);
    return {
      failed: g.status === "failed" && g.reason === "shelter",
      dialog: document.getElementById("result-dialog").open,
      story: document.getElementById("result-story").textContent.includes("shelter"),
    };
  });
  for (const [name, value] of Object.entries(debrief)) check(`shelter strike aborts the mission: ${name}`, value);
  const victory = await page.evaluate(() => {
    const { game: g, ui } = __TIDELOCK__;
    ui.start(0);
    g.paused = false;
    for (const t of g.op.targets()) {
      t.dead = true;
      if (t.marker) t.marker.visible = false;
    }
    for (let i = 0; i < 240; i++) g.update(1 / 120);
    return {
      status: g.status,
      criteria: document.querySelectorAll("#result-criteria li").length,
      met: document.querySelectorAll("#result-criteria li.met").length,
      next: document.getElementById("result-next").textContent.includes("Next mission"),
      focus: document.activeElement?.id === "result-next",
      heldSpace: (() => {
        const held = new KeyboardEvent("keydown", { key: " ", code: "Space", repeat: true, cancelable: true });
        window.dispatchEvent(held);
        return held.defaultPrevented && document.getElementById("result-dialog").open;
      })(),
    };
  });
  check("the result dialog focuses its main action", victory.focus);
  check("a held Space from the last release cannot click through the result", victory.heldSpace);
  check("clearing every target wins with three star criteria", victory.status === "success" && victory.criteria === 3 && victory.met >= 2 && victory.next);
  await page.evaluate(() => {
    __TIDELOCK__.ui.start(0);
    __TIDELOCK__.ui.menu();
  });
  check(
    "mission control lists all fifteen missions by chapter",
    await page.evaluate(() => document.querySelectorAll("#mission-list .mission-group button").length === 15),
  );
  const pause = await page.evaluate(() => {
    const g = __TIDELOCK__.game;
    const t = g.time;
    g.update(0.1);
    return g.time === t;
  });
  check("mission control pauses the simulation", pause);
  check(
    "the Reduced motion setting stills the HUD",
    await page.evaluate(() => {
      const box = document.getElementById("reduced-motion");
      box.click();
      const on = document.documentElement.dataset.reducedMotion === "true";
      box.click();
      return on && document.documentElement.dataset.reducedMotion === "false";
    }),
  );
  await page.evaluate(() => __TIDELOCK__.ui.resume());

  // A long press on a ladder floor still selects it (the HUD refreshes every 80 ms).
  await page.evaluate(() => {
    const { ui, game: g } = __TIDELOCK__;
    ui.start(1);
    g.op.flight.lane = g.op.buildings.find((b) => b.id === "T1").z;
    g.op.select("drill");
  });
  await page.waitForFunction(() => document.querySelectorAll("#ladder-floors [data-floor]").length > 3, null, { timeout: 20000 });
  // Freeze the pipper over the tower so the ladder under the pointer stays put.
  await page.evaluate(() => (__TIDELOCK__.game.paused = true));
  const row = page.locator('#ladder-floors [data-floor="2"]');
  const box = await row.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(200);
  await page.mouse.up();
  check("a 200 ms press on a ladder floor sets the Drill floor", await page.evaluate(() => __TIDELOCK__.game.op.floor === 3));
  // A flak warning never survives a switch to another chapter.
  const flak = await page.evaluate(() => {
    const { ui } = __TIDELOCK__;
    ui.start(5);
    document.getElementById("flak-warning").hidden = false;
    ui.start(9);
    return document.getElementById("flak-warning").hidden;
  });
  check("flak warning is cleared when a new mission starts", flak);
  check("intel chips render their icons", await page.evaluate(() => {
    const { ui, game: g } = __TIDELOCK__;
    ui.start(2);
    g.paused = false;
    for (let i = 0; i < 120; i++) g.update(1 / 120);
    ui.updateHUD(true);
    ui.updateHUD(true);
    return document.querySelectorAll("#intel svg").length > 0;
  }));

  // ---------------------------------------------------------------- chapters
  await checkStrike(page, check);
  await checkHarbour(page, check);
  await checkRiver(page, check);
  for (const index of [0, 5, 7, 8, 9, 11, 12]) {
    await page.evaluate((i) => {
      const { ui, game: g } = __TIDELOCK__;
      ui.start(i);
      g.paused = false;
      for (let k = 0; k < 360; k++) g.update(1 / 120);
    }, index);
    await page.waitForTimeout(300);
    const frame = await page.evaluate(pixels);
    check(`mission ${index} renders a detailed scene (${frame.calls} draw calls)`, frame.colors > 40 && frame.triangles > 20000 && frame.calls < 900);
    await page.screenshot({ path: `test-results/mission-${index}-desktop.png` });
  }

  // ---------------------------------------------------------------- phones and tablets
  for (const size of [
    { width: 320, height: 740 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 768, height: 1024 },
  ]) {
    const mobile = await browser.newPage({ viewport: size, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    watch(mobile);
    await mobile.goto(`${url}?qa=1`);
    await ready(mobile);
    for (const index of [0, 5, 8, 9, 12]) {
      await mobile.evaluate((i) => {
        const { ui, game: g, view } = __TIDELOCK__;
        ui.start(i);
        g.paused = true;
        ui.updateHUD(true);
        view.render(0);
      }, index);
      const layout = await mobile.evaluate((chapter) => {
        const ids = [
          ["#flight-panel", "#move-stick", ".mission-hud", "#ladder", "#comms", "#intel"],
          ["#move-stick", "#fire-stick", "#shield-hud", ".mission-hud", "#convoy-hud", "#comms"],
          ["#move-stick", "#fire-stick", "#shield-hud", ".mission-hud", "#rescue-hud", "#rescue-actions", ".weapon-bar", "#comms"],
        ][chapter];
        const rects = ids.map((s) => document.querySelector(s).getBoundingClientRect()).filter((r) => r.width > 0);
        const inside = rects.every((r) => r.width > 0 && r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight + 0.5);
        const apart = rects.every((a, i) => rects.every((b, j) => i === j || !(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)));
        return { inside, apart, scroll: document.documentElement.scrollWidth <= innerWidth };
      }, index < 9 ? 0 : index < 12 ? 1 : 2);
      for (const [name, value] of Object.entries(layout)) check(`mobile ${size.width}x${size.height} mission ${index} ${name}`, value);
      await mobile.screenshot({ path: `test-results/mobile-${size.width}x${size.height}-${index}.png` });
    }
    // The touch stick steers the formation in Chapter 1.
    await mobile.evaluate(() => {
      __TIDELOCK__.ui.start(0);
      __TIDELOCK__.game.paused = false;
    });
    // Landscape: pull down to move south. Portrait (camera looks along the flight): push right to move north.
    const stick = await mobile.locator("#move-stick").boundingBox();
    const { lane, portrait } = await mobile.evaluate(() => ({
      lane: __TIDELOCK__.game.op.flight.lane,
      portrait: __TIDELOCK__.view.strikePortrait,
    }));
    await mobile.mouse.move(stick.x + stick.width / 2, stick.y + stick.height / 2);
    await mobile.mouse.down();
    if (portrait) await mobile.mouse.move(stick.x + stick.width - 6, stick.y + stick.height / 2);
    else await mobile.mouse.move(stick.x + stick.width / 2, stick.y + stick.height - 6);
    await mobile.waitForFunction(
      ([l, p]) => (p ? __TIDELOCK__.game.op.flight.lane < l - 1 : __TIDELOCK__.game.op.flight.lane > l + 1),
      [lane, portrait],
      { timeout: 15000 },
    );
    await mobile.mouse.up();
    check(`mobile ${size.width}x${size.height} stick steers the formation (${portrait ? "portrait" : "landscape"})`, true);
    await mobile.close();
  }

  await checkRescue(page, browser, url, check, errors);
  check("no browser runtime or resource errors", errors.length === 0);
  console.log(JSON.stringify({ passed: results.length, firstFrame, errors }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ passed: results.length, errors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
