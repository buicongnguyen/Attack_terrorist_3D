import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const url = process.env.GAME_URL || "http://127.0.0.1:5183/";
const executablePath =
  process.env.CHROME_PATH ||
  (process.platform === "win32"
    ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
    : undefined);
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: [
    "--enable-webgl",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
await mkdir("test-results", { recursive: true });
const errors = [],
  results = [];
const check = (name, value) => {
  assert.ok(value, name);
  results.push(name);
  console.log(`PASS ${name}`);
};
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

try {
  await page.goto(`${url}?qa=1`);
  await page.waitForFunction(
    () => document.documentElement.dataset.ready === "true",
  );
  check(
    "all 17 Blender models loaded",
    await page.evaluate(() => __TIDELOCK__.view.assets.size === 17),
  );
  const pixels = await page.evaluate(() => {
    const view = __TIDELOCK__.view;
    view.render(__TIDELOCK__.game.time);
    const gl = view.renderer.getContext(),
      data = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(
      0,
      0,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data,
    );
    const colors = new Set();
    for (let i = 0; i < data.length; i += 256)
      colors.add(`${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`);
    return {
      colors: colors.size,
      triangles: view.renderer.info.render.triangles,
    };
  });
  check(
    "canvas contains varied rendered geometry",
    pixels.colors > 40 && pixels.triangles > 10000,
  );
  await page.screenshot({ path: "test-results/chapter1-desktop.png" });
  await page.evaluate(() => __TIDELOCK__.ui.start(0));
  await page.waitForFunction(
    () =>
      __TIDELOCK__.game.player.position.x > -5.2 &&
      __TIDELOCK__.game.player.position.x < -4.5,
  );
  await page.keyboard.press("Space");
  await page.waitForFunction(
    () => __TIDELOCK__.game.status === "success",
    null,
    { timeout: 10000 },
  );
  check(
    "first mission completed with timed keyboard release",
    await page.evaluate(
      () => __TIDELOCK__.game.kills === 1 && __TIDELOCK__.game.ammo === 1,
    ),
  );

  const simulations = await page.evaluate(() => {
    const { game: g, ui, view } = __TIDELOCK__;
    const result = {};
    ui.start(6);
    const initial = g.player.position.clone();
    g.input.x = 0.5;
    g.input.z = -1;
    for (let i = 0; i < 120; i++) g.update(1 / 120);
    result.movement =
      g.player.position.x > initial.x + 0.5 &&
      g.player.position.z < initial.z - 1;
    result.manual = g.projectiles.every((p) => p.hostile);
    const cannon = g.entities.find((e) => e.type === "cannon");
    const z = cannon.position.z;
    g.update(1 / 120);
    result.scrolling = cannon.position.z > z;
    g.projectiles.forEach((p) => {
      p.dead = true;
    });
    const target = g.targetPosition(cannon);
    const first = g.fire(target),
      second = g.fire(target);
    result.cooldown = first && !second;
    const before = cannon.hp;
    for (let i = 0; i < 90; i++) g.update(1 / 120);
    result.travelHit = cannon.hp < before;

    ui.start(6);
    g.shields = [1, 3, 3];
    g.hurtPlayer(g.player.position.clone().add({ x: 4, y: 0, z: 0 }), 2);
    result.armor =
      g.status === "playing" && g.shields.reduce((a, b) => a + b) === 5;
    for (const kind of ["health", "star", "gun", "medal"]) {
      const pickup = g.spawnPickup(
        g.player.position.z,
        kind,
        g.player.position.x,
      );
      g.collect(pickup);
    }
    result.pickups =
      g.shields.every((hp) => hp === 3) && g.twin === 7 && g.auto === 5;
    ui.updateHUD(true);
    result.bothBonusTimers = ["star", "gun"].every(
      (kind) =>
        !document.getElementById(`bonus-${kind}`).hidden &&
        document
          .querySelector(`#bonus-${kind} strong`)
          .textContent.endsWith("s"),
    );
    result.visibleLoadout =
      !g.boatParts.SingleGun.visible &&
      g.boatParts.TwinGunL.visible &&
      g.boatParts.TwinGunR.visible &&
      g.boatParts.SupportRack.visible;
    const collected = g.entities.find((e) => e.type === "pickup" && e.dead);
    const score = g.score;
    g.collect(collected);
    result.collectionOnce = g.score === score;
    g.update(1 / 120);
    result.support = g.projectiles.some(
      (p) => !p.hostile && p.missile && p.target,
    );
    g.auto = 0.001;
    g.update(1 / 120);
    ui.updateHUD(true);
    result.independentExpiry =
      document.getElementById("bonus-gun").hidden &&
      !document.getElementById("bonus-star").hidden &&
      !g.boatParts.SupportRack.visible;
    g.twin = 0.001;
    g.update(1 / 120);
    result.loadoutReset =
      g.boatParts.SingleGun.visible &&
      !g.boatParts.TwinGunL.visible &&
      !g.boatParts.TwinGunR.visible;

    ui.start(6);
    const symbolPickup = g.spawnPickup(-4, "health", 6);
    const rotation = symbolPickup.mesh.quaternion.clone();
    const bodyAngle = symbolPickup.body.rotation.y;
    g.update(1 / 120);
    result.uprightBadge =
      symbolPickup.badge.isSprite &&
      symbolPickup.mesh.quaternion.equals(rotation) &&
      symbolPickup.body.rotation.y !== bodyAngle;
    view.badgeKeepouts = [
      { left: 0, top: 0, right: innerWidth, bottom: innerHeight },
    ];
    view.render(g.time);
    result.badgeAvoidsHUD =
      !symbolPickup.badge.visible && symbolPickup.body.visible;
    view.badgeKeepouts = [];
    view.render(g.time);
    result.badgeReturns = symbolPickup.badge.visible;
    ui.updateBadgeBounds();
    const gunTarget = g.entities.find((e) => e.type === "cannon");
    g.fire(g.targetPosition(gunTarget));
    const shot = g.projectiles.find((p) => !p.hostile);
    result.authoredMuzzle =
      shot.position.distanceTo(
        g.boatParts.Muzzle.getWorldPosition(shot.position.clone()),
      ) < 1e-6;
    const turretFacing = shot.position
      .clone()
      .set(0, 0, -1)
      .transformDirection(g.playerTurret.matrixWorld);
    const shotFacing = shot.velocity.clone().setY(0).normalize();
    result.turretAligned =
      turretFacing.setY(0).normalize().dot(shotFacing) > 0.99;
    result.articulatedEnemy = g.entities
      .filter((e) => e.type === "enemy")
      .every((e) => e.limbs.length === 4 && e.limbs.every(Boolean));
    g.twin = 7;
    g.cooldown = 0;
    g.input.aim = g.player.position.clone().add({ x: 20, y: 0, z: 0 });
    g.projectiles.forEach((p) => (p.dead = true));
    g.update(1 / 120);
    const autoShots = g.projectiles.filter((p) => !p.hostile && !p.dead);
    const autoFacing = g.player.position
      .clone()
      .set(0, 0, -1)
      .transformDirection(g.playerTurret.matrixWorld)
      .setY(0)
      .normalize();
    result.autoTurretAligned =
      autoShots.length === 2 &&
      autoShots.every(
        (p) => autoFacing.dot(p.velocity.clone().setY(0).normalize()) > 0.99,
      );

    ui.start(9);
    result.badgeCleanup =
      view.pickupBadges.size === 0 && view.badgeMaterials.size === 4;
    const initialVisible = g.entities.filter(
      (e) => e.type === "cave" && e.phase !== "hidden",
    ).length;
    for (let i = 0; i < 1200; i++) g.update(1 / 120);
    result.caves =
      g.entities.filter((e) => e.type === "cave" && e.phase !== "hidden")
        .length > initialVisible;
    result.land = g.entities
      .filter((e) => e.type === "cave")
      .every((e) => Math.abs(e.position.x) >= 8);
    g.entities.forEach((e) => {
      if (e.type === "cave") {
        e.phase = "hidden";
        e.appearAt = 999;
      }
    });
    g.projectiles.forEach((p) => {
      p.dead = true;
    });
    const hostile = g.spawnShot(
      g.player.position.clone().add({ x: 0, y: 0, z: -12 }),
      g.player.position.clone(),
      true,
      true,
    );
    g.fire(hostile.position.clone());
    for (let i = 0; i < 45; i++) g.update(1 / 120);
    result.intercept = hostile.dead && g.score > 0;
    ui.start(9);
    const impact = g.player.position.clone().add({ x: 4, y: 0, z: 0 });
    g.hurtPlayer(impact, 1);
    result.firstShield = g.status === "playing" && g.shields[0] === 0;
    g.hurtPlayer(impact, 1);
    result.breach = g.status === "failed";

    ui.start(6);
    g.score = 999;
    ui.start(6);
    result.retry = g.score === 0 && g.shields.every((n) => n === 3);
    g.time = g.mission.duration - 1 / 240;
    g.shields = [0, 0, 0];
    g.spawnShot(
      g.player.position.clone(),
      g.player.position.clone().add({ x: 1, y: 0, z: 0 }),
      false,
      true,
    );
    g.update(1 / 120);
    result.failureWins = g.status === "failed";
    ui.start(0);
    ui.menu();
    const t = g.time;
    g.update(0.1);
    result.pause = g.time === t;
    ui.resume();
    return result;
  });
  for (const [name, value] of Object.entries(simulations)) check(name, value);

  for (const index of [6, 9]) {
    await page.evaluate((index) => __TIDELOCK__.ui.start(index), index);
    await page.waitForTimeout(index === 9 ? 2500 : 500);
    await page.screenshot({
      path: `test-results/chapter${index === 6 ? 2 : 3}-desktop.png`,
    });
  }
  for (const size of [
    { width: 320, height: 740 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    const mobile = await browser.newPage({
      viewport: size,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    mobile.on("pageerror", (error) => errors.push(error.message));
    await mobile.goto(`${url}?qa=1`);
    await mobile.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    for (const index of [0, 6, 9]) {
      await mobile.evaluate((index) => __TIDELOCK__.ui.start(index), index);
      await mobile.waitForTimeout(index === 9 ? 1800 : 200);
      check(
        `mobile ${size.width} chapter ${index} layout`,
        await mobile.evaluate(() => {
          const canvas = document
            .getElementById("world")
            .getBoundingClientRect();
          return (
            document.documentElement.scrollWidth <= innerWidth &&
            Math.abs(canvas.width - innerWidth) < 1 &&
            !document.getElementById("menu-dialog").open
          );
        }),
      );
      await mobile.screenshot({
        path: `test-results/mobile-${size.width}-${index}.png`,
      });
    }
    const mobileBonuses = await mobile.evaluate(() => {
      const { ui, game: g, view } = __TIDELOCK__;
      ui.start(6);
      g.auto = 5;
      g.twin = 7;
      g.updateBoatLoadout();
      ui.updateHUD(true);
      g.paused = true;
      view.render(g.time);
      const ids = ["powerup", "shield-hud", "move-stick", "fire-stick"];
      const boxes = ids.map((id) =>
        document.getElementById(id).getBoundingClientRect(),
      );
      const overlap = (a, b) =>
        a.left < b.right &&
        a.right > b.left &&
        a.top < b.bottom &&
        a.bottom > b.top;
      const gl = view.renderer.getContext();
      const data = new Uint8Array(
        gl.drawingBufferWidth * gl.drawingBufferHeight * 4,
      );
      gl.readPixels(
        0,
        0,
        gl.drawingBufferWidth,
        gl.drawingBufferHeight,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        data,
      );
      const colors = new Set();
      for (let i = 0; i < data.length; i += 256)
        colors.add(`${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`);
      const badge = g.entities.find((e) => e.type === "pickup").badge;
      const badgePixels =
        (badge.scale.x /
          ((view.camera.top - view.camera.bottom) / view.camera.zoom)) *
        innerHeight;
      return {
        spacing:
          boxes.every((a, i) =>
            boxes.every((b, j) => i === j || !overlap(a, b)),
          ) &&
          boxes.every(
            (b) =>
              b.left >= 0 &&
              b.right <= innerWidth &&
              b.top >= 0 &&
              b.bottom <= innerHeight,
          ),
        rendered:
          colors.size > 40 && view.renderer.info.render.triangles > 10000,
        legible: badgePixels >= 45.99 && badgePixels <= 50.01,
      };
    });
    for (const [name, value] of Object.entries(mobileBonuses))
      check(`mobile ${size.width} bonuses ${name}`, value);
    await mobile.screenshot({ path: `test-results/bonuses-${size.width}.png` });
    await mobile
      .getByRole("button", { name: "Mission settings", exact: true })
      .click();
    await mobile
      .getByRole("button", { name: "Mission 2.1: Green Channel", exact: true })
      .click();
    const stick = await mobile.locator("#move-stick").boundingBox();
    const from = await mobile.evaluate(
      () => __TIDELOCK__.game.player.position.x,
    );
    await mobile.mouse.move(
      stick.x + stick.width / 2,
      stick.y + stick.height / 2,
    );
    await mobile.mouse.down();
    await mobile.mouse.move(stick.x + stick.width - 8, stick.y + 15);
    await mobile.waitForFunction(
      (from) => __TIDELOCK__.game.player.position.x > from + 0.5,
      from,
      { timeout: 15000 },
    );
    await mobile.mouse.up();
    check(
      `mobile ${size.width} joystick movement`,
      await mobile.evaluate(
        (from) => __TIDELOCK__.game.player.position.x > from + 0.5,
        from,
      ),
    );
    await mobile.close();
  }
  check("no browser runtime or resource errors", errors.length === 0);
  console.log(
    JSON.stringify({ passed: results.length, pixels, errors }, null, 2),
  );
} finally {
  await browser.close();
}
