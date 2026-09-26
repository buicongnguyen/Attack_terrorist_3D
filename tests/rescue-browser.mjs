// Chapter 3 browser checks (2.7): Lantern picks people up by flying over them, lands at another
// base, fires along a direction, and meets launch crews, missile trucks, drone stations and
// barracks on three different maps.

// A scripted pilot: fly to the next signal (or the landing base), shoot along the line of the
// most urgent threat, flare missiles that get close.
export function rescuePilot(index) {
  const { game: g, ui } = window.__TIDELOCK__;
  ui.start(index);
  g.paused = false;
  const r = g.rescue;
  const kinds = ["enemy", "cannon", "aa-truck", "drone", "cave", "missile-site", "missile-truck", "drone-pad", "barracks"];
  for (let steps = 0; steps < 120 * 240 && g.status === "playing"; steps++) {
    const p = g.player.position;
    const goal = r.objective();
    const dx = goal.x - p.x,
      dz = goal.z - p.z,
      d = Math.hypot(dx, dz);
    const hostiles = g.entities.filter(
      (e) =>
        !e.dead &&
        !e.friendly &&
        kinds.includes(e.type) &&
        (e.type !== "cave" || ["enemy", "launcher"].includes(e.phase)) &&
        Math.hypot(e.position.x - p.x, e.position.z - p.z) < 32,
    );
    const urgency = (e) =>
      (e.site && e.alert ? 0 : e.type === "missile-truck" && e.state === "erect" ? 1 : e.type === "drone-pad" && e.state === "spin" ? 1 : e.type === "drone" ? 2 : 3) * 100 +
      Math.hypot(e.position.x - p.x, e.position.z - p.z);
    hostiles.sort((a, b) => urgency(a) - urgency(b));
    const missile = g.projectiles
      .filter((s) => s.hostile && s.missile && !s.dead)
      .sort((a, b) => a.position.distanceToSquared(p) - b.position.distanceToSquared(p))[0];
    if (missile && missile.position.distanceTo(p) < 18) r.flare();
    const target = missile && missile.position.distanceTo(p) < 20 ? missile : hostiles[0];
    g.input.x = d > 1 ? (dx / d) * Math.min(1, d / 6) : 0;
    g.input.z = d > 1 ? (dz / d) * Math.min(1, d / 6) : 0;
    g.weapon = "gun";
    g.input.fire = Boolean(target);
    g.input.pointerAim = Boolean(target);
    if (target) g.input.aim.set(target.position.x, 1.2, target.position.z);
    g.update(1 / 120);
  }
  g.input.fire = false;
  g.paused = true;
  return { status: g.status, rescued: r.rescued, total: r.soldiers.length, time: g.time, hits: g.hitsTaken };
}

export async function checkRescue(page, browser, url, check, errors) {
  const result = await page.evaluate(() => {
    const { game: g, ui } = __TIDELOCK__,
      out = {};
    const V = (x, y, z) => g.player.position.clone().set(x, y, z);
    const run = (seconds, each) => {
      for (let i = 0; i < 120 * seconds; i++) {
        each?.();
        g.update(1 / 120);
      }
    };
    const clearAll = () => {
      for (const e of g.entities) if (!e.friendly && e.type !== "pickup") e.dead = true;
      g.entities = g.entities.filter((e) => !e.dead);
    };
    ui.start(15);
    g.paused = false;
    g.time = 180;
    g.update(1 / 120);
    out.noTimerVictory = g.status === "playing" && g.rescue.rescued === 0;
    const r = g.rescue;
    const soldier = r.soldiers[0],
      hp = soldier.hp;
    g.damage(soldier, 100, true);
    out.friendlyProtection = !soldier.dead && soldier.hp === hp;
    // Pinned: with the squad beside it alive, flying over the signal picks no one up.
    out.signalStartsPinned = r.guards(soldier) >= 2;
    g.player.position.set(soldier.position.x, 7.5, soldier.position.z);
    g.velocity.set(0, 0, 0);
    run(0.5);
    out.pinnedSignalWaits = soldier.lift === undefined && r.rescued === 0 && r.labels.some((l) => /PINNED/.test(l.text));
    // Clear the squad and fly over: the soldier rides the line up, no hovering, no key.
    for (const e of g.entities) if (e.type === "enemy" && e.position.distanceTo(soldier.position) < 16) g.kill(e);
    const score = g.score;
    g.velocity.set(9, 0, 0);
    run(0.2);
    out.flyOverStartsLift = soldier.lift !== undefined && r.cable.visible;
    run(1);
    out.flyOverRescues = r.rescued === 1 && soldier.rescued && g.score >= score + 350;
    // The landing base does nothing until everyone is aboard.
    const { landing, start } = r.layout;
    g.player.position.set(landing.x, 7.5, landing.z);
    run(0.5);
    out.noLandingWithSignalsLeft = g.status === "playing" && !r.landing;
    // The start base repairs and rearms Lantern when she flies over it.
    g.shields = [0, 1, 2];
    r.gear.rockets = 0;
    g.player.position.set(start.x, 7.5, start.z);
    run(0.2);
    out.baseRepairsAndRearms = g.shields.every((s) => s === 3) && r.gear.rockets > 0;
    // With everyone aboard, the landing base takes her in and the sortie ends there.
    for (const s of r.soldiers) if (!s.rescued) {
      s.rescued = true;
      s.dead = true;
      r.rescued++;
    }
    out.objectiveIsLandingBase = r.objective().name === landing.name;
    g.player.position.set(landing.x + 2, 7.5, landing.z);
    run(0.3);
    out.landingStarts = r.state === "LANDING" && g.status === "playing";
    run(1.6);
    out.landsAtAnotherBase = g.status === "success" && landing.name !== start.name && Math.hypot(g.player.position.x - landing.x, g.player.position.z - landing.z) < 1;

    // Fire along a direction: flat rounds hit what lies on the line, whatever the pointer's
    // exact spot. Holding the mouse aims towards the pointer; Space fires the way she flies.
    ui.start(15);
    g.paused = false;
    clearAll();
    const target = g.opponent(V(g.player.position.x + 14, 1.15, g.player.position.z - 14), { hp: 50 });
    g.input.pointerAim = true;
    // A point well past the target on the same line: only the direction matters.
    g.input.aim.set(g.player.position.x + 30, 1.2, g.player.position.z - 30);
    g.input.fire = true;
    run(1.2);
    out.directionFireHits = target.hp < 50;
    // Rounds drop from the chin gun to just above the ground within a few metres.
    out.shotsFlyLow = g.projectiles.filter((s) => !s.hostile && s.age > 0.4).every((s) => s.position.y < 2.2);
    g.input.fire = false;
    g.input.pointerAim = false;
    target.dead = true;
    g.velocity.set(8, 0, 0);
    run(0.3, () => (g.input.x = 1));
    g.input.x = 0;
    g.input.fire = true;
    run(0.3);
    g.input.fire = false;
    out.keysFireTheWayShesFlying = g.fireDir.x > 0.9 && g.projectiles.some((s) => !s.hostile && s.velocity.x > 40);
    const turn = Math.atan2(-g.fireDir.x, -g.fireDir.z) - g.player.rotation.y;
    out.heliFacesItsFire = Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) < 0.4;
    // The assist puts the burst on an incoming missile before a soldier close to the same line.
    ui.start(15);
    g.paused = false;
    clearAll();
    g.hitChance = 0;
    const p0 = g.player.position.clone();
    const decoy = g.opponent(V(p0.x + 30 * Math.sin(0.15), 1.15, p0.z - 30 * Math.cos(0.15)), { hp: 50 });
    const inbound = g.spawnShot(V(p0.x, p0.y, p0.z - 16), p0.clone(), true, true);
    inbound.speed = 0.5;
    inbound.velocity.setLength(0.5);
    g.input.pointerAim = true;
    g.input.aim.set(p0.x, 1.2, p0.z - 30);
    g.input.fire = true;
    run(0.6);
    g.input.fire = false;
    g.input.pointerAim = false;
    out.assistTakesTheMissileFirst = inbound.dead && decoy.hp === 50;

    // Rounds: the gun fires the strongest in stock and drops back when a magazine is spent.
    ui.start(15);
    g.paused = false;
    clearAll();
    g.gainRounds("ap");
    ui.updateHUD(true);
    out.crateLoadsStrongerRounds = g.roundKind === "ap" && document.getElementById("round-stock").hidden === false;
    g.rounds.ap = 1;
    g.cooldown = 0;
    g.input.pointerAim = true;
    g.input.aim.set(g.player.position.x, 1.2, g.player.position.z - 20);
    g.fire(g.input.aim.clone());
    out.spentRoundsDropBack = g.roundKind === "standard" && g.rounds.ap === 0;
    const toasts = [];
    const notify = g.notify;
    g.notify = (kind, text) => {
      toasts.push(text);
      notify(kind, text);
    };
    g.gainRounds("plasma");
    g.gainRounds("ap");
    g.notify = notify;
    out.weakerCrateStillSaysWhatItGave = g.roundKind === "plasma" && toasts.some((t) => /PLASMA LOADED/.test(t)) && toasts.some((t) => /AP ROUNDS \+/.test(t));
    g.rounds = { ap: 0, he: 0, plasma: 0 };
    g.noteRound();
    for (const shot of g.projectiles) shot.dead = true;
    const r2 = g.rescue;
    // Plasma carries on through a line of targets.
    const line = [8, 13].map((d) => g.opponent(V(g.player.position.x, 1.15, g.player.position.z - d), { hp: 20 }));
    g.gainRounds("plasma");
    g.cooldown = 0;
    g.fireDir.set(0, 0, -1);
    g.fire(g.input.aim.clone());
    for (let i = 0; i < 90; i++) g.updateProjectiles(1 / 120);
    out.plasmaPierces = line.every((e) => e.hp === 20 - 3);
    // Rockets: one salvo per cooldown, never below zero; guided ones need a target in the cone.
    g.weapon = "rocket";
    g.rocketCooldown = 0;
    const ammo = r2.gear.rockets;
    out.rocketCadence = g.fire(g.input.aim.clone(), true) && !g.fire(g.input.aim.clone(), true) && r2.gear.rockets === ammo - 1;
    g.rocketCooldown = 0;
    r2.gear.rockets = 0;
    out.noNegativeAmmo = !g.fire(g.input.aim.clone(), true) && r2.gear.rockets === 0;
    g.weapon = "guided";
    for (const e of line) e.dead = true;
    g.entities = g.entities.filter((e) => !e.dead);
    g.fireDir.set(0, 0, -1);
    g.rocketCooldown = 0;
    out.guidedNeedsLock = !g.fire(g.input.aim.clone(), true);
    const lock = g.opponent(V(g.player.position.x + 4, 1.15, g.player.position.z - 20), { hp: 5 });
    out.guidedLocksAlongTheLine = g.fire(g.input.aim.clone(), true) && g.projectiles.some((p) => p.target === lock);
    g.weapon = "gun";
    const incoming = g.spawnShot(g.player.position.clone().add({ x: 0, y: 0, z: -20 }), g.player.position.clone(), true, true);
    out.flares = r2.flare() && incoming.distracted && !r2.flare();
    g.shields = [0, 1, 2];
    const repair = g.spawnPickup(g.player.position.z, "health", g.player.position.x);
    g.collect(repair);
    const rockets = g.spawnPickup(g.player.position.z, "ammo", g.player.position.x);
    g.collect(rockets);
    out.resupply = g.shields.every((v) => v === 3) && r2.gear.rockets === 10;
    g.input.pointerAim = false;
    g.paused = true;
    return out;
  });
  for (const [name, value] of Object.entries(result)) check(`rescue ${name}`, value);

  // The enemy on the ground: every launcher needs time, and killing early stops it.
  const threats = await page.evaluate(() => {
    const { game: g, ui } = __TIDELOCK__,
      out = {};
    const run = (seconds, each) => {
      for (let i = 0; i < 120 * seconds; i++) {
        each?.();
        g.update(1 / 120);
      }
    };
    const only = (e, extra = []) => {
      const keep = new Set([e, ...extra]);
      for (const other of g.entities) if (!keep.has(other) && !other.friendly && other.type !== "pickup") other.dead = true;
      g.entities = g.entities.filter((x) => !x.dead);
    };
    const hostileMissiles = () => g.projectiles.filter((p) => p.hostile && p.missile && !p.dead).length;
    // Keep Lantern out of harm's way while the clock runs.
    const park = (e, d) => {
      g.player.position.set(e.position.x, 7.5, e.position.z + d);
      g.velocity.set(0, 0, 0);
      g.hitChance = 0;
    };
    // A launch site: its crew idles until it sees Lantern, then runs to the posts; the rack
    // rises and a missile goes. Kill the crew first and it never fires.
    ui.start(15);
    g.paused = false;
    let site = g.entities.find((e) => e.type === "missile-site");
    only(site, site.crew);
    park(site, 40);
    run(1);
    out.crewIdlesUnseen = site.crew.every((c) => !c.alert && c.state === "idle") && site.state === "idle";
    park(site, 20);
    run(0.6);
    out.crewRunsToTheLauncher = site.alert && site.crew.some((c) => c.running);
    let launches = 0,
      seen = 0;
    run(12, () => {
      const n = g.projectiles.filter((p) => p.hostile && p.missile).length;
      if (n > seen) launches += n - seen;
      seen = n;
    });
    out.mannedSiteLaunches = site.fired && launches >= 1;
    // (Easy slows the reload: first at about 4.7 s, the next a reload later, 6.75 s on Easy.)
    out.siteRefiresEveryReload = launches === 2;
    ui.start(15);
    g.paused = false;
    site = g.entities.find((e) => e.type === "missile-site");
    only(site, site.crew);
    park(site, 20);
    run(0.3);
    for (const c of site.crew) g.kill(c);
    const score = g.score;
    run(8);
    out.siteWithoutCrewNeverFires = !site.fired && hostileMissiles() === 0 && site.state === "silent" && g.score >= score + 100;
    g.damage(site, 99, true);
    out.destroyedSiteLeavesACrater = site.dead && g.fragments.length > 5 && g.emitters.length > 0 && g.view.level.children.some((c) => c.isGroup && c.children.length > 8 && c.children[0].geometry?.type === "CircleGeometry");
    // A missile truck: it stops, raises its rack for five seconds, then fires; killed first,
    // it never fires and pays a bonus.
    ui.start(15);
    g.paused = false;
    let truck = g.entities.find((e) => e.type === "missile-truck");
    only(truck);
    park(truck, 18);
    run(0.2);
    out.truckStopsAndRaises = truck.state === "erect";
    // A truck parked on a signal doesn't pin it: only people and emplacements do.
    out.trucksDoNotPinSignals = g.rescue.guards({ position: truck.position }) === 0;
    run(4.6);
    out.noMissileBeforeFiveSeconds = !truck.fired && hostileMissiles() === 0 && truck.rack?.rotation.x > 0.5;
    run(0.6);
    out.truckFiresAfterFive = truck.fired && hostileMissiles() > 0;
    ui.start(15);
    g.paused = false;
    truck = g.entities.find((e) => e.type === "missile-truck");
    only(truck);
    park(truck, 18);
    run(2);
    const before = g.score;
    g.damage(truck, 99, true);
    run(4);
    out.earlyKillStopsTheLaunch = truck.dead && hostileMissiles() === 0 && g.score >= before + 150;
    // A drone station: five seconds to lift; hit it first and no drone ever flies.
    ui.start(15);
    g.paused = false;
    let pad = g.entities.find((e) => e.type === "drone-pad");
    only(pad);
    park(pad, 18);
    run(4.7);
    out.dronesWaitFiveSeconds = pad.state === "spin" && !g.entities.some((e) => e.type === "drone");
    run(0.5);
    out.dronesLift = pad.state === "empty" && g.entities.filter((e) => e.type === "drone").length === 2;
    ui.start(15);
    g.paused = false;
    pad = g.entities.find((e) => e.type === "drone-pad");
    only(pad);
    park(pad, 18);
    run(2);
    g.damage(pad, 99, true);
    run(5);
    out.hitStationGroundsItsDrones = pad.dead && !g.entities.some((e) => e.type === "drone");
    // Barracks: once the alarm is up, soldiers come out one by one.
    ui.start(15);
    g.paused = false;
    const barracks = g.entities.find((e) => e.type === "barracks");
    only(barracks);
    park(barracks, 20);
    run(0.6);
    const first = g.entities.filter((e) => e.type === "enemy" && !e.dead).length;
    run(4);
    const later = g.entities.filter((e) => e.type === "enemy" && !e.dead).length;
    out.barracksSendsSoldiersOut = first >= 1 && later > first && later <= 4;
    // A cave launcher: a hit collapses it for good; missiles already flying keep going.
    ui.start(15);
    g.paused = false;
    const cave = g.entities.find((e) => e.type === "cave");
    only(cave);
    cave.phase = "launcher";
    cave.timer = 4;
    cave.launcher.visible = true;
    cave.mesh.scale.setScalar(1);
    park(cave, 15);
    const incoming = g.spawnShot(g.player.position.clone().add({ x: 25, y: 0, z: 0 }), g.player.position.clone(), true, true);
    g.damage(cave, 1, false);
    out.caveHitDisables = cave.phase === "disabled" && !cave.launcher.visible && !cave.crew.visible;
    out.inFlightMissileRemains = !incoming.dead && g.projectiles.includes(incoming);
    for (let i = 0; i < 2400; i++) g.rescue.updateCaves(1 / 120);
    out.caveNeverRearms = cave.phase === "disabled";
    // Every map fields its own mix.
    ui.start(17);
    out.ridgeFieldsEverything = ["enemy", "cannon", "missile-site", "missile-truck", "aa-truck", "drone-pad", "barracks"].every((type) => g.entities.some((e) => e.type === type));
    ui.start(15);
    out.retryRestoresLaunchers = g.entities.some((e) => e.type === "cave" && e.phase === "hidden") && g.entities.some((e) => e.type === "missile-site" && e.state === "idle");
    g.paused = true;
    return out;
  });
  for (const [name, value] of Object.entries(threats)) check(`threat ${name}`, value);

  for (const index of [15, 16, 17]) {
    const sortie = await page.evaluate(`(${rescuePilot.toString()})(${index})`);
    console.log(`  rescue 3.${index - 14}: ${sortie.status} ${sortie.rescued}/${sortie.total} in ${sortie.time.toFixed(0)}s, ${sortie.hits} hits`);
    check(`full rescue sortie ${index - 14}: ${sortie.rescued}/${sortie.total}`, sortie.status === "success" && sortie.rescued === sortie.total);
  }

  await page.evaluate(() => {
    __TIDELOCK__.ui.start(15);
  });
  const followsAim = await page.evaluate(() => {
    const { game: g, ui, view } = __TIDELOCK__;
    ui.aim(innerWidth / 2, innerHeight / 2);
    ui.pointerFire = true;
    const before = g.input.aim.clone();
    g.player.position.z -= 70;
    view.followPlayer(g.player.position, 0, true);
    ui.updateInput();
    const follows = g.input.aim.z < before.z - 50 && g.input.pointerAim;
    ui.pointerFire = false;
    ui.start(15);
    return follows;
  });
  check("held mouse aim follows the moving camera", followsAim);
  await page.locator("#next-signal").click();
  check("rescue waypoint selection", await page.evaluate(() => __TIDELOCK__.game.rescue.selected === 1));

  // Three sorties, three different countries: each map renders, and none looks like another.
  const visuals = await page.evaluate(() => {
    const { game: g, ui, view } = __TIDELOCK__;
    const sample = (index, z) => {
      ui.start(index);
      g.paused = true;
      g.player.position.set(0, 7.5, z);
      view.followPlayer(g.player.position, 0, true);
      view.render(11);
      const gl = view.renderer.getContext(),
        data = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, data);
      const colors = new Set();
      let r = 0,
        gg = 0,
        b = 0,
        n = 0;
      for (let i = 0; i < data.length; i += 256) {
        colors.add(`${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`);
        r += data[i];
        gg += data[i + 1];
        b += data[i + 2];
        n++;
      }
      return { colors: colors.size, triangles: view.renderer.info.render.triangles, mean: [r / n, gg / n, b / n] };
    };
    return [sample(15, -100), sample(16, -100), sample(17, -100), sample(15, 10), sample(17, -200)];
  });
  check("each sortie's map renders", visuals.every((v) => v.colors > 40 && v.triangles > 10000));
  const apart = (a, b) => Math.hypot(a.mean[0] - b.mean[0], a.mean[1] - b.mean[1], a.mean[2] - b.mean[2]);
  check("the three maps look different", apart(visuals[0], visuals[1]) > 12 && apart(visuals[1], visuals[2]) > 12 && apart(visuals[0], visuals[2]) > 12);

  const touch = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  touch.on("pageerror", (e) => errors.push(e.message));
  await touch.goto(`${url}?qa=1`);
  await touch.waitForFunction(() => document.documentElement.dataset.ready === "true");
  const fixture = await touch.evaluate(() => {
    const { game: g, ui, view } = __TIDELOCK__;
    ui.start(15);
    const target = g.entities.find((e) => e.type === "cave");
    g.player.position.set(target.position.x - 12, 7.5, target.position.z + 12);
    view.followPlayer(g.player.position, 0, true);
    for (const e of g.entities) {
      e.cooldown = 999;
      if (e !== target && !e.friendly && e.type !== "pickup") e.dead = true;
    }
    g.entities = g.entities.filter((e) => !e.dead);
    target.phase = "enemy";
    target.timer = 0;
    target.appearAt = 999;
    target.mesh.scale.setScalar(1);
    g.hitChance = 0;
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
    return { move: rect("move-stick"), fire: rect("fire-stick"), x: dx / l, z: dy / l, hp: target.hp };
  });
  const cdp = await touch.context().newCDPSession(touch);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: fixture.move.x + 9, y: fixture.move.y, id: 1 },
      { x: fixture.fire.x + fixture.x * fixture.fire.r, y: fixture.fire.y + fixture.z * fixture.fire.r, id: 2 },
    ],
  });
  await touch.waitForFunction((hp) => touchTarget.hp < hp || touchTarget.phase === "disabled", fixture.hp, { timeout: 15000 });
  check(
    "two-finger movement and a fire-stick direction hit",
    await touch.evaluate((hp) => (touchTarget.hp < hp || touchTarget.phase === "disabled") && __TIDELOCK__.game.input.x > 0, fixture.hp),
  );
  await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  check(
    "touch cancellation clears both pads",
    await touch.evaluate(() => __TIDELOCK__.ui.moveStick.x === 0 && __TIDELOCK__.ui.fireStick === null),
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
      ui.start(15);
      g.paused = true;
      ui.updateHUD(true);
      view.render(0);
    });
    const layout = await touch.evaluate(() => {
      const selectors = ["#move-stick", "#fire-stick", "#shield-hud", ".weapon-bar", "#rescue-actions", "#rescue-hud", ".mission-hud"];
      const rects = selectors.map((s) => document.querySelector(s).getBoundingClientRect());
      return (
        rects.every((a) => a.width > 0 && a.left >= 0 && a.right <= innerWidth && a.top >= 0 && a.bottom <= innerHeight) &&
        rects.every((a, i) => rects.every((b, j) => i === j || !(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)))
      );
    });
    check(`rescue touch layout ${size.width}x${size.height}`, layout);
    const rendered = await touch.evaluate(() => {
      const { view, game: g } = __TIDELOCK__;
      view.render(g.time);
      const gl = view.renderer.getContext(),
        data = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, data);
      const colors = new Set();
      for (let i = 0; i < data.length; i += 256) colors.add(`${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`);
      const p = view.project(g.player.position);
      return colors.size > 40 && p.x > 0 && p.x < innerWidth && p.y > 0 && p.y < innerHeight;
    });
    check(`rescue touch scene ${size.width}x${size.height}`, rendered);
    await touch.screenshot({ path: `test-results/rescue-${size.width}.png` });
  }
  await touch.close();
}
