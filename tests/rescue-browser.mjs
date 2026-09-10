export async function checkRescue(page, browser, url, check, errors) {
  const result = await page.evaluate(() => {
    const { game: g, ui, view } = __TIDELOCK__,
      out = {};
    ui.start(9);
    g.time = 180;
    g.update(1 / 120);
    out.noTimerVictory = g.status === "playing" && g.rescue.rescued === 0;
    const soldier = g.rescue.soldiers[0],
      hp = soldier.hp;
    g.damage(soldier, 100, true);
    out.friendlyProtection = !soldier.dead && soldier.hp === hp;
    g.player.position.set(soldier.position.x, 7.5, soldier.position.z);
    g.velocity.set(0, 0, 0);
    g.input.winch = true;
    const threat = g.entities.find((e) => e.type === "enemy");
    threat.position.copy(soldier.position);
    g.rescue.updateWinch(1);
    out.contested = g.rescue.hoist === 0 && g.rescue.state === "ZONE CONTESTED";
    for (const e of g.entities)
      if (!e.friendly && e.type !== "pickup") e.dead = true;
    g.rescue.updateWinch(1);
    out.partial =
      g.rescue.hoist === 1 &&
      soldier.position.y > 1.15 &&
      g.rescue.cable.visible;
    out.noFireDuringWinch = !g.fire(soldier.position.clone());
    g.input.winch = false;
    g.rescue.updateWinch(0.6);
    out.interrupt = g.rescue.hoist === 0 && soldier.position.y === 1.15;
    g.input.winch = true;
    g.rescue.updateWinch(3);
    const score = g.score;
    g.rescue.updateWinch(3);
    out.rescueOnce = g.rescue.rescued === 1 && g.score === score;
    out.requiresReturn = g.status === "playing";
    ui.start(9);
    g.weapon = "rocket";
    const point = g.player.position.clone().add({ x: 12, y: -5, z: -12 });
    const ammo = g.rescue.gear.rockets;
    out.rocketCadence =
      g.fire(point, true) &&
      !g.fire(point, true) &&
      g.rescue.gear.rockets === ammo - 1;
    g.rocketCooldown = 0;
    g.rescue.gear.rockets = 0;
    out.noNegativeAmmo = !g.fire(point, true) && g.rescue.gear.rockets === 0;
    g.weapon = "guided";
    g.rescue.gear.guided = 2;
    out.guidedNeedsLock =
      !g.fire(g.player.position.clone(), true) && g.rescue.gear.guided === 2;
    const cave = g.entities.find((e) => e.type === "cave");
    g.player.position.set(cave.position.x - 9, 7.5, cave.position.z + 8);
    cave.phase = "enemy";
    out.guidedLock =
      g.fire(g.targetPosition(cave), true) &&
      g.projectiles.some((p) => p.target === cave);
    const incoming = g.spawnShot(
      g.player.position.clone().add({ x: 0, y: 0, z: -20 }),
      g.player.position.clone(),
      true,
      true,
    );
    out.flares =
      g.rescue.flare() &&
      incoming.distracted &&
      !g.rescue.flare() &&
      g.rescue.gear.flares === 3;
    g.shields = [0, 1, 2];
    const repair = g.entities.find(
      (e) => e.type === "pickup" && e.kind === "health",
    );
    g.collect(repair);
    const rockets = g.spawnPickup(
      g.player.position.z,
      "ammo",
      g.player.position.x,
    );
    g.collect(rockets);
    out.resupply =
      g.shields.every((v) => v === 3) && g.rescue.gear.rockets === 10;
    ui.start(11);
    out.variedEnemies = ["enemy", "cannon", "cave", "aa-truck", "drone"].every(
      (type) => g.entities.some((e) => e.type === type),
    );
    out.longRoute = g.rescue.soldiers.at(-1).position.z < -200;
    g.player.position.set(20, 7.5, -180);
    view.followPlayer(g.player.position, 0, true);
    const farTarget = g.entities.find((e) => e.type === "cannon");
    farTarget.position.set(20, 1.15, -196);
    const hpBefore = farTarget.hp;
    g.weapon = "gun";
    g.fire(g.targetPosition(farTarget));
    for (let i = 0; i < 90; i++) g.updateProjectiles(1 / 120);
    out.farMapShots = farTarget.hp < hpBefore;
    out.cameraFollows =
      view.followPosition.z < -180 && view.baseCamera.z < -110;
    g.paused = true;
    return out;
  });
  for (const [name, value] of Object.entries(result))
    check(`rescue ${name}`, value);

  const launchers = await page.evaluate(() => {
    const { game: g, ui } = __TIDELOCK__,
      out = {};
    ui.start(9);
    const cave = g.entities.find((e) => e.type === "cave");
    g.entities = [cave];
    cave.phase = "launcher";
    cave.timer = 4;
    cave.launcher.visible = true;
    cave.mesh.scale.setScalar(1);
    g.player.position.set(cave.position.x, 7.5, cave.position.z + 15);
    const incoming = g.spawnShot(
      g.player.position.clone().add({ x: 25, y: 0, z: 0 }),
      g.player.position.clone(),
      true,
      true,
    );
    out.requiresImpact =
      g.fire(g.targetPosition(cave)) && cave.phase === "launcher";
    for (let i = 0; i < 120; i++) g.updateProjectiles(1 / 120);
    out.caveHitDisables =
      cave.phase === "disabled" &&
      !cave.launcher.visible &&
      !cave.crew.visible &&
      !cave.warningRing.visible;
    out.inFlightMissileRemains =
      !incoming.dead && g.projectiles.includes(incoming);
    const shots = g.projectiles.length,
      score = g.score,
      kills = g.kills;
    for (let i = 0; i < 2400; i++) g.updateCaves(1 / 120);
    out.caveNeverRearms =
      cave.phase === "disabled" && g.projectiles.length === shots;
    g.damage(cave, 5, true);
    out.caveRewardOnce = g.score === score && g.kills === kills;

    ui.start(9);
    const truck = g.entities.find((e) => e.type === "aa-truck");
    g.entities = [truck];
    g.player.position.set(truck.position.x, 7.5, truck.position.z + 15);
    const hp = truck.hp;
    g.fire(g.targetPosition(truck));
    for (let i = 0; i < 120; i++) g.updateProjectiles(1 / 120);
    out.truckHitDisables =
      truck.launcherDisabled &&
      truck.hp === hp - 1 &&
      !truck.dead &&
      !truck.warning.visible &&
      !truck.mesh.getObjectByName("TruckTurret").visible;
    for (let i = 0; i < 2400; i++) {
      g.time += 1 / 120;
      g.rescue.update(1 / 120);
    }
    out.truckNeverFiresAgain = !g.projectiles.some((p) => p.hostile);
    ui.start(9);
    out.retryRestoresLaunchers =
      g.entities.some((e) => e.type === "cave" && e.phase === "hidden") &&
      g.entities.some(
        (e) =>
          e.type === "aa-truck" &&
          !e.launcherDisabled &&
          e.mesh.getObjectByName("TruckTurret").visible,
      );
    g.paused = true;
    return out;
  });
  for (const [name, value] of Object.entries(launchers))
    check(`launcher ${name}`, value);

  for (const index of [9, 10, 11]) {
    const sortie = await page.evaluate((index) => {
      const { game: g, ui } = __TIDELOCK__;
      ui.start(index);
      const r = g.rescue;
      let steps = 0;
      for (; steps < 120 * 180 && g.status === "playing"; steps++) {
        const goal = r.objective(),
          dx = goal.x - g.player.position.x,
          dz = goal.z - g.player.position.z,
          d = Math.hypot(dx, dz);
        g.input.x = d > 1 ? (dx / d) * Math.min(1, d / 6) : 0;
        g.input.z = d > 1 ? (dz / d) * Math.min(1, d / 6) : 0;
        const contested = g.entities.some(
          (e) =>
            !e.dead &&
            !e.friendly &&
            ["enemy", "cannon", "aa-truck", "drone"].includes(e.type) &&
            Math.hypot(e.position.x - goal.x, e.position.z - goal.z) < 9,
        );
        g.input.winch = d < 3 && !contested;
        g.input.fire = false;
        const targets = g.entities.filter(
          (e) =>
            !e.dead &&
            !e.friendly &&
            ["enemy", "cannon", "aa-truck", "drone", "cave"].includes(e.type) &&
            (e.type !== "cave" || ["enemy", "launcher"].includes(e.phase)) &&
            e.position.distanceTo(g.player.position) < 36,
        );
        targets.sort(
          (a, b) =>
            a.position.distanceToSquared(g.player.position) -
            b.position.distanceToSquared(g.player.position),
        );
        const missile = g.projectiles
          .filter((p) => p.hostile && p.missile && !p.dead)
          .sort(
            (a, b) =>
              a.position.distanceToSquared(g.player.position) -
              b.position.distanceToSquared(g.player.position),
          )[0];
        if (missile && missile.position.distanceTo(g.player.position) < 20)
          r.flare();
        const target =
          missile && missile.position.distanceTo(g.player.position) < 22
            ? missile
            : targets[0];
        if (target && !g.input.winch) {
          g.weapon = "gun";
          g.fire(g.targetPosition(target));
        }
        g.update(1 / 120);
      }
      g.paused = true;
      return {
        status: g.status,
        rescued: r.rescued,
        total: r.soldiers.length,
        time: g.time,
      };
    }, index);
    check(
      `full rescue sortie ${index - 8}: ${sortie.rescued}/${sortie.total}`,
      sortie.status === "success" && sortie.rescued === sortie.total,
    );
  }

  await page.evaluate(() => {
    __TIDELOCK__.ui.start(9);
  });
  const followsAim = await page.evaluate(() => {
    const { game: g, ui, view } = __TIDELOCK__;
    ui.aim(innerWidth / 2, innerHeight / 2);
    ui.pointerFire = true;
    const before = g.input.aim.clone();
    g.player.position.z -= 70;
    view.followPlayer(g.player.position, 0, true);
    ui.updateInput();
    const follows = g.input.aim.z < before.z - 50;
    ui.start(9);
    return follows;
  });
  check("held mouse aim follows the moving camera", followsAim);
  await page.locator("#next-signal").click();
  check(
    "rescue waypoint selection",
    await page.evaluate(() => __TIDELOCK__.game.rescue.selected === 1),
  );
  await page.evaluate(() => {
    const { game: g } = __TIDELOCK__,
      s = g.rescue.soldiers[0];
    for (const e of g.entities)
      if (!e.friendly && e.type !== "pickup") e.dead = true;
    g.player.position.set(s.position.x, 7.5, s.position.z);
    g.velocity.set(0, 0, 0);
  });
  await page.keyboard.down("e");
  await page.waitForFunction(() => __TIDELOCK__.game.rescue.hoist > 0.2);
  check(
    "keyboard held winch raises soldier",
    await page.evaluate(
      () => __TIDELOCK__.game.rescue.soldiers[0].position.y > 1.15,
    ),
  );
  await page.keyboard.up("e");
  await page.waitForFunction(() => __TIDELOCK__.game.rescue.hoist === 0);
  check(
    "keyboard winch release resets pickup",
    await page.evaluate(() => !__TIDELOCK__.game.input.winch),
  );

  const visuals = await page.evaluate(() => {
    const { game: g, ui, view } = __TIDELOCK__;
    ui.start(11);
    g.paused = true;
    const sample = (x, z, t) => {
      g.player.position.set(x, 7.5, z);
      view.followPlayer(g.player.position, 0, true);
      view.render(t);
      const gl = view.renderer.getContext(),
        data = new Uint8Array(
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
      let hash = 0;
      for (let i = 0; i < data.length; i += 256) {
        colors.add(`${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`);
        hash = (hash * 31 + data[i] * 3 + data[i + 1] * 5 + data[i + 2]) | 0;
      }
      return {
        colors: colors.size,
        hash,
        triangles: view.renderer.info.render.triangles,
      };
    };
    return [
      sample(0, 18, 10),
      sample(0, 18, 11),
      sample(-23, -30, 11),
      sample(23, -204, 11),
    ];
  });
  check(
    "rescue base, outpost and northern valley are nonblank",
    visuals.every((v) => v.colors > 40 && v.triangles > 10000),
  );
  check(
    "rescue water animates and camera reveals new scenery",
    new Set(visuals.map((v) => v.hash)).size === 4,
  );

  const touch = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  touch.on("pageerror", (e) => errors.push(e.message));
  await touch.goto(`${url}?qa=1`);
  await touch.waitForFunction(
    () => document.documentElement.dataset.ready === "true",
  );
  const fixture = await touch.evaluate(() => {
    const { game: g, ui, view } = __TIDELOCK__;
    ui.start(9);
    g.player.position.set(0, 7.5, -26);
    view.followPlayer(g.player.position, 0, true);
    for (const e of g.entities) {
      e.cooldown = 999;
      if (e.type === "cave") {
        e.phase = "enemy";
        e.timer = 0;
        e.appearAt = 999;
        e.mesh.scale.setScalar(1);
      }
    }
    const target = g.entities.find(
      (e) => e.type === "cave" && e.position.x > 0,
    );
    window.touchTarget = target;
    const a = view.project(g.player.position),
      b = view.project(g.targetPosition(target));
    const dx = b.x - a.x,
      dy = b.y - a.y,
      l = Math.hypot(dx, dy);
    const rect = (id) => {
      const r = document.getElementById(id).getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, r: r.width * 0.32 };
    };
    return {
      move: rect("move-stick"),
      fire: rect("fire-stick"),
      x: dx / l,
      z: dy / l,
      hp: target.hp,
    };
  });
  const cdp = await touch.context().newCDPSession(touch);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: fixture.move.x + 9, y: fixture.move.y, id: 1 },
      {
        x: fixture.fire.x + fixture.x * fixture.fire.r,
        y: fixture.fire.y + fixture.z * fixture.fire.r,
        id: 2,
      },
    ],
  });
  await touch.waitForFunction((hp) => touchTarget.hp < hp, fixture.hp, {
    timeout: 15000,
  });
  check(
    "two-finger movement and ground-target pad hit",
    await touch.evaluate(
      (hp) => touchTarget.hp < hp && __TIDELOCK__.game.input.x > 0,
      fixture.hp,
    ),
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  check(
    "touch cancellation clears both pads",
    await touch.evaluate(
      () =>
        __TIDELOCK__.ui.moveStick.x === 0 && __TIDELOCK__.ui.fireStick === null,
    ),
  );
  await touch.evaluate(() => {
    const { game: g, ui } = __TIDELOCK__;
    ui.start(9);
    const s = g.rescue.soldiers[0];
    for (const e of g.entities)
      if (!e.friendly && e.type !== "pickup") e.dead = true;
    g.player.position.set(s.position.x, 7.5, s.position.z);
    g.velocity.set(0, 0, 0);
  });
  const winch = await touch.locator("#winch-action").boundingBox();
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: winch.x + winch.width / 2, y: winch.y + winch.height / 2, id: 3 },
    ],
  });
  await touch.waitForFunction(() => __TIDELOCK__.game.rescue.hoist > 0.2);
  check(
    "touch held winch operates cable",
    await touch.evaluate(() => __TIDELOCK__.game.rescue.cable.visible),
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await touch.waitForFunction(() => __TIDELOCK__.game.rescue.hoist === 0);
  check(
    "touch winch cancel clears hold",
    await touch.evaluate(() => !__TIDELOCK__.game.input.winch),
  );
  for (const size of [
    { width: 320, height: 740 },
    { width: 568, height: 320 },
    { width: 667, height: 375 },
    { width: 844, height: 390 },
    { width: 768, height: 1024 },
  ]) {
    await touch.setViewportSize(size);
    await touch.evaluate(() => {
      const { ui, game: g, view } = __TIDELOCK__;
      ui.start(9);
      g.paused = true;
      ui.updateHUD(true);
      view.render(0);
    });
    const layout = await touch.evaluate(() => {
      const selectors = [
        "#move-stick",
        "#fire-stick",
        "#shield-hud",
        ".weapon-bar",
        "#rescue-actions",
        "#rescue-hud",
        ".mission-hud",
      ];
      const rects = selectors.map((s) =>
        document.querySelector(s).getBoundingClientRect(),
      );
      return (
        rects.every(
          (a) =>
            a.width > 0 &&
            a.left >= 0 &&
            a.right <= innerWidth &&
            a.top >= 0 &&
            a.bottom <= innerHeight,
        ) &&
        rects.every((a, i) =>
          rects.every(
            (b, j) =>
              i === j ||
              !(
                a.left < b.right &&
                a.right > b.left &&
                a.top < b.bottom &&
                a.bottom > b.top
              ),
          ),
        )
      );
    });
    check(`rescue touch layout ${size.width}x${size.height}`, layout);
    const rendered = await touch.evaluate(() => {
      const { view, game: g } = __TIDELOCK__;
      view.render(g.time);
      const gl = view.renderer.getContext(),
        data = new Uint8Array(
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
      const p = view.project(g.player.position);
      return (
        colors.size > 40 &&
        p.x > 0 &&
        p.x < innerWidth &&
        p.y > 0 &&
        p.y < innerHeight
      );
    });
    check(`rescue touch scene ${size.width}x${size.height}`, rendered);
    await touch.screenshot({ path: `test-results/rescue-${size.width}.png` });
  }
  await touch.close();
}
