// Chapter 2 browser checks: convoy mechanics and a scripted skipper for every river mission.

export function skipper() {
  const { game: g, ui } = window.__TIDELOCK__;
  const out = [];
  for (let index = 9; index <= 14; index++) {
    ui.start(index);
    g.paused = false;
    const op = g.op;
    for (let step = 0; step < 120 * 240 && g.status === "playing"; step++) {
      if (step % 4 === 0) decide();
      g.update(1 / 120);
    }
    g.input.fire = false;
    g.input.x = g.input.z = 0;
    g.input.stickAim = null;
    out.push({
      index,
      status: g.status,
      reason: g.reason,
      distance: Math.round(op.distance),
      length: op.data.length,
      barges: op.barges.map((b) => Math.round(b.hp)),
      shields: g.shields.reduce((a, b) => a + b, 0),
      stars: op.stars(g.status === "success"),
      blocked: op.blocked,
      boss: op.boss?.phase || null,
      time: Math.round(g.time),
    });
  }
  return out;

  function decide() {
    const op = g.op;
    const p = g.player.position;
    const hostile = window.__TIDELOCK_RESCUE__.isHostileEntity;
    const missiles = g.projectiles.filter((s) => s.hostile && s.missile && !s.dead);
    const targets = g.entities.filter((e) => hostile(e) && e.position.z > -40 && e.position.z < 22);
    const score = (e) => {
      const d = e.position.distanceTo(p);
      const bonus = { drums: -30, crate: -30, generator: -25, tower: -20, launcher: -12, skiff: -8, mine: e.position.z > -10 ? -10 : 5 }[e.type] ?? 0;
      return d + bonus;
    };
    const target = missiles.sort((a, b) => a.position.distanceTo(p) - b.position.distanceTo(p))[0] ||
      targets.sort((a, b) => score(a) - score(b))[0];
    g.input.fire = Boolean(target);
    if (target) g.input.aim.copy(target.hostile ? target.position : g.targetPosition(target));
    // Pick the weapon a player would: rockets for bunkers, towers and bunched skiffs, the laser
    // for gun lines while it is cool, the deck gun for the rest.
    const w = op.snapshot().weapons;
    const bunched = target?.type === "skiff" && targets.filter((e) => e.type === "skiff" && e.position.distanceTo(target.position) < 4).length >= 3;
    const heavy = target && ["launcher", "tower", "generator"].includes(target.type);
    const laser = target && ["cannon", "enemy"].includes(target.type) && w.heat < 0.8 && !w.overheated;
    ui.weapon(target && !target.hostile && w.rockets > 0 && (heavy || bunched) ? "rocket" : laser ? "laser" : "gun");
    // A crowd ahead of the barges gets the air strike.
    const band = targets.filter((e) => e.position.z > -40 && e.position.z < -8 && e.type !== "mine");
    if (band.length >= 5 && w.strikes > 0 && !w.striking) op.callAirStrike(band.reduce((sum, e) => sum + e.position.z, 0) / band.length);
    // Stay ahead of the barges, shadow the threat's lane, and slide away from close mines.
    let goalX = target ? Math.max(-10, Math.min(10, target.position.x * 0.6)) : 0;
    const goalZ = op.holding ? 2 : 5;
    for (const mine of g.entities)
      if (mine.type === "mine" && !mine.dead && mine.position.z > p.z - 12 && mine.position.z < p.z + 3 && Math.abs(mine.position.x - p.x) < 3.2)
        goalX = p.x + (p.x > mine.position.x ? 5 : -5);
    const heal = g.entities.find((e) => e.type === "pickup" && !e.dead && e.kind === "health" && e.position.z > p.z - 16 && e.position.z < p.z + 4);
    // Help crates are worth a detour; repairs when the shields are low.
    const help = g.entities.find((e) => e.type === "pickup" && !e.dead && e.kind !== "health" && e.position.z > p.z - 12 && e.position.z < p.z + 3);
    if (help) goalX = help.position.x;
    if (heal && g.shields.reduce((a, b) => a + b, 0) < 7) goalX = heal.position.x;
    g.input.x = Math.max(-1, Math.min(1, (goalX - p.x) * 0.5));
    g.input.z = Math.max(-1, Math.min(1, (goalZ - p.z) * 0.4));
  }
}

export async function checkRiver(page, check) {
  const mechanics = await page.evaluate(() => {
    const { game: g, ui } = window.__TIDELOCK__;
    const out = {};
    ui.start(9);
    g.paused = false;
    const op = g.op;
    out.twoBarges = op.barges.length === 2 && op.barges.every((b) => b.alive && b.hp === b.max);
    const x0 = op.barges[0].position.x;
    g.input.x = 1;
    for (let i = 0; i < 240; i++) g.update(1 / 120);
    g.input.x = 0;
    out.bargesFollowWake = op.barges[0].position.x > x0 + 1.5 && op.barges[1].position.x > x0 + 0.5;
    const d0 = op.distance;
    for (let i = 0; i < 120; i++) g.update(1 / 120);
    out.convoyAdvances = op.distance > d0 + 3;
    // A hostile round aimed at a barge is absorbed by Marlin when she sits in the way (at a
    // certain hit; the difficulty's chance is checked separately).
    g.projectiles.forEach((s) => (s.dead = true));
    g.hitChance = 1;
    const barge = op.barges[0];
    g.player.position.set(barge.position.x, g.player.position.y, barge.position.z - 5);
    const from = barge.position.clone().add({ x: 0, y: 1, z: -14 });
    const shot = g.spawnShot(from, barge.position.clone().add({ x: 0, y: 1, z: 0 }), false, true, null, { kind: "barge", barge, position: barge.position });
    const hp = barge.hp,
      shields = g.shields.reduce((a, b) => a + b, 0);
    for (let i = 0; i < 240 && !shot.dead; i++) g.update(1 / 120);
    out.bodyBlock = barge.hp === hp && g.shields.reduce((a, b) => a + b, 0) === shields - 1 && op.blocked === 1;
    // Fuel drums take the neighbouring crew with them.
    ui.start(9);
    g.paused = false;
    const drumsEvent = { d: 0, type: "guns", side: 1, count: 2, crew: 2, drums: true };
    g.op.spawn(drumsEvent);
    const drums = g.entities.find((e) => e.type === "drums");
    const crew = g.entities.filter((e) => (e.type === "enemy" || e.type === "cannon") && !e.dead && e.position.distanceTo(drums.position) < 5.6);
    g.damage(drums, 1);
    out.drumChain = crew.length >= 3 && crew.every((e) => e.dead);
    // Pincer skiffs arrive at the meeting point together.
    ui.start(10);
    g.paused = false;
    g.op.spawn({ d: 0, type: "skiffs", pattern: "pincer", count: 6, meet: { x: 0, z: -2 }, delay: 6 });
    for (let i = 0; i < 6 * 120; i++) g.update(1 / 120);
    const skiffs = g.entities.filter((e) => e.type === "skiff" && !e.dead);
    out.pincerMeets = skiffs.length === 6 && skiffs.every((s) => Math.hypot(s.position.x, s.position.z + 2) < 2.2);
    g.damage(skiffs[0], 5);
    out.skiffChain = g.entities.filter((e) => e.type === "skiff" && !e.dead).length <= 1;
    // A column overtaking from behind keeps every boat on its first tick.
    g.entities.filter((e) => e.type === "skiff").forEach((e) => (e.dead = true));
    g.op.spawn({ d: 0, type: "skiffs", pattern: "column", count: 4, x: 7 });
    g.update(1 / 120);
    out.columnKeepsTrailingBoats = g.entities.filter((e) => e.type === "skiff" && !e.dead).length === 4;
    // Kills inside one second chain into a combo worth n² x 30.
    ui.start(10);
    g.paused = false;
    g.op.spawn({ d: 0, type: "skiffs", pattern: "pincer", count: 4, meet: { x: 0, z: -2 }, delay: 6 });
    let combo = null;
    const notify = g.notify;
    g.notify = (type, data) => {
      if (type === "combo") combo = data;
      return notify(type, data);
    };
    for (const s of g.entities.filter((e) => e.type === "skiff" && !e.dead).slice(0, 2)) g.damage(s, 5);
    for (let i = 0; i < 150; i++) g.update(1 / 120);
    g.notify = notify;
    out.killsChainIntoACombo = Boolean(combo) && combo.count >= 2 && combo.bonus === combo.count ** 2 * 30;
    // A skiff that rams a barge dies in the ram, even while it is aiming, and pays nothing.
    ui.start(10);
    g.paused = false;
    const rammed = g.op.barges[1];
    g.op.spawn({ d: 0, type: "skiffs", pattern: "column", count: 1, x: rammed.position.x });
    const ram = g.entities.find((e) => e.type === "skiff");
    ram.target = { kind: "player", position: g.player.position };
    ram.aim = 99;
    const before = { hp: rammed.hp, score: g.score, kills: g.kills };
    for (let i = 0; i < 120 * 5 && !ram.dead; i++) g.update(1 / 120);
    out.ramKillsTheSkiffWithoutReward =
      ram.dead && Math.abs(rammed.hp - (before.hp - 3 * g.mode.enemyDamage)) < 1e-9 && g.score === before.score && g.kills === before.kills;
    // The gate towers take hits from base to top, and the medal floats out once the gate opens.
    ui.start(14);
    g.paused = false;
    g.op.spawnGate();
    for (const e of g.entities) if (e.scrolling && e.type !== "pickup") e.position.z = -24;
    const tower = g.op.boss.towers[0];
    g.player.position.set(-6, 0.08, -10);
    const towerHp = tower.hp;
    g.cooldown = 0;
    g.fire(tower.position.clone().setY(tower.position.y + 0.8));
    for (let i = 0; i < 90; i++) g.updateProjectiles(1 / 120);
    out.gateTowerBaseTakesHits = tower.hp < towerHp;
    g.op.boss.phase = "opening";
    g.op.boss.open = 0.999;
    g.update(1 / 120);
    out.medalFloatsOutWhenTheGateOpens =
      g.op.boss.phase === "open" && g.entities.some((e) => e.type === "pickup" && e.kind === "medal" && !e.dead);

    // 2.4 weapons. Keys 2 and 3 pick rockets and the laser on the boat.
    const V3 = g.player.position.constructor;
    const key = (code, down = true) =>
      window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, key: code.slice(-1).toLowerCase() }));
    ui.start(11);
    g.paused = false;
    g.update(1 / 120);
    key("Digit2");
    key("Digit2", false);
    const rocketKey = g.weapon === "rocket";
    key("Digit3");
    key("Digit3", false);
    out.keysPickRocketsAndLaser = rocketKey && g.weapon === "laser";
    // Rockets: a salvo of three that homes and bursts.
    const skiffAt = (x, z, scrolling = false) =>
      g.entity("skiff", "skiff", new V3(x, 0.1, z), { hp: 3, radius: 1.3, order: { pattern: "column", x, spawned: 1e9 }, slot: 0, cooldown: 99, aim: 0, scrolling });
    const stock = g.op.rockets;
    const pack = [-1.2, 0, 1.2].map((x) => skiffAt(x, -16));
    g.op.fireRockets(pack[1].position.clone());
    const salvo = g.projectiles.filter((shot) => shot.missile && !shot.hostile).length;
    for (let i = 0; i < 120 * 2; i++) g.updateProjectiles(1 / 120);
    out.rocketSalvoOfThree = stock - g.op.rockets === 3 && salvo === 3;
    out.rocketsBurstThroughAPack = pack.every((e) => e.dead);
    // The laser burns a gun down in well under a second, then overheats if held.
    ui.start(11);
    g.paused = false;
    g.hurtPlayer = () => {};
    g.op.spawn({ d: 0, type: "guns", side: 1, count: 1 });
    const gun = g.entities.find((e) => e.type === "cannon");
    gun.position.set(8, 1.05, -12);
    gun.scrolling = false;
    ui.weapon("laser");
    g.input.fire = true;
    let burned = 0;
    for (let i = 0; i < 120 * 1.2 && !gun.dead; i++) {
      g.input.aim.copy(gun.position);
      g.update(1 / 120);
      burned += 1 / 120;
    }
    out.laserBurnsAGun = gun.dead && burned < 1;
    for (let i = 0; i < 120 * 4; i++) {
      g.input.aim.set(0, 0.2, -20);
      g.update(1 / 120);
    }
    out.laserOverheats = g.op.laser.locked && !g.op.beam.group.visible;
    g.input.fire = false;
    delete g.hurtPlayer;
    // Q: the air strike falls across the canal where Marlin aims, and clears it bank to bank.
    ui.start(11);
    g.paused = false;
    g.update(1 / 120);
    // A row of mines right across the canal.
    g.op.spawn({ d: 0, type: "mines", xs: [-12, -6, 0, 6, 12] });
    const line = g.entities.filter((e) => e.type === "mine");
    line.forEach((e) => (e.position.z = -20));
    g.aimPoint = line[2].position.clone();
    const charges = g.op.strikes;
    key("KeyQ");
    key("KeyQ", false);
    const called = g.op.strikes === charges - 1 && Boolean(g.op.airStrike);
    // Every bomb bursts well ahead of the nearest barge.
    const bursts = [];
    const detonate = g.op.detonateStrike.bind(g.op);
    g.op.detonateStrike = (p, struck) => {
      bursts.push(Math.min(...g.op.barges.map((b) => b.position.z)) - p.z);
      return detonate(p, struck);
    };
    for (let i = 0; i < 120 * 4; i++) g.update(1 / 120);
    out.airStrikeClearsTheLine = called && line.every((e) => e.dead) && !g.op.airStrike;
    out.airStrikeFallsAheadOfTheBarges = bursts.length === 9 && bursts.every((ahead) => ahead > 10);
    // The lock gate is hardened: two strikes dent the towers and the generator but break nothing.
    ui.start(14);
    g.paused = false;
    g.op.spawnGate();
    for (const e of g.entities) if (e.scrolling && e.type !== "pickup") e.position.z = -24;
    const boss = g.op.boss;
    boss.generator.shielded = false;
    g.op.strikes = 2;
    for (const round of [0, 1]) {
      g.op.callAirStrike(boss.gate.position.z);
      for (let i = 0; i < 120 * 4; i++) {
        g.shields = [3, 3, 3];
        for (const b of g.op.barges) b.hp = b.max;
        g.update(1 / 120);
      }
    }
    out.strikesOnlyDentTheLockGate =
      boss.towers.every((t) => !t.dead && t.hp >= t.maxHp - 2 * 6) && !boss.generator.dead && boss.generator.hp >= boss.generator.maxHp - 2 * 6;
    // Crates: rockets, an air strike, the gunship and the escort boat.
    ui.start(12);
    g.paused = false;
    g.update(1 / 120);
    const give = (kind) => g.collect(g.spawnPickup(g.player.position.z, kind, g.player.position.x));
    const stocked = { rockets: g.op.rockets, strikes: g.op.strikes };
    give("ammo");
    give("strike");
    give("heli");
    give("ally");
    out.cratesRefillRocketsAndStrikes = g.op.rockets === stocked.rockets + 9 && g.op.strikes === stocked.strikes + 1;
    out.cratesCallTheGunshipAndEscort = Boolean(g.op.support.heli && g.op.support.ally) && g.op.snapshot().help.heli > 19;
    // The gunship shoots where Marlin shoots, and help does not count towards Marlin's accuracy.
    g.hurtPlayer = () => {};
    const shots = g.shots;
    g.input.fire = true;
    ui.weapon("laser");
    let toward = 0,
      helped = 0;
    for (let i = 0; i < 120 * 3; i++) {
      g.input.aim.set(-9, 0.2, -18);
      g.update(1 / 120);
      for (const shot of g.projectiles)
        if (shot.ally && !shot.missile && !shot.counted) {
          shot.counted = true;
          helped++;
          if (shot.velocity.x < 0 && shot.velocity.z < 0) toward++;
        }
    }
    g.input.fire = false;
    delete g.hurtPlayer;
    out.gunshipFiresWhereMarlinFires = helped > 5 && toward / helped > 0.5;
    out.helpIsNotMarlinsAccuracy = g.shots === shots;
    // The top banner names the hit chance while a gun has the convoy in its sights.
    ui.start(11);
    g.paused = false;
    g.op.spawn({ d: 0, type: "guns", side: 1, count: 1 });
    const aimer = g.entities.find((e) => e.type === "cannon");
    aimer.position.z = -12;
    aimer.cooldown = 0;
    for (let i = 0; i < 30 && !(aimer.aim > 0); i++) g.update(1 / 120);
    ui.updateHUD(true);
    const banner = document.getElementById("flak-warning");
    out.bannerNamesTheHitChance = !banner.hidden && /HIT CHANCE|CAN'T HIT YOU YET/.test(banner.textContent);
    out.gunsWearHealthPips = Boolean(aimer.hpBar);
    return out;
  });
  for (const [name, value] of Object.entries(mechanics)) check(`river ${name}`, value);
  const runs = await page.evaluate(`(${skipper.toString()})()`);
  for (const run of runs) {
    console.log(`  river 2.${run.index - 8}: ${run.status} ${run.reason || ""} ${run.distance}/${run.length} barges ${run.barges} shields ${run.shields} stars ${run.stars} blocked ${run.blocked} boss ${run.boss} in ${run.time}s`);
    check(`river mission 2.${run.index - 8} completed by scripted skipper`, run.status === "success");
  }
  return runs;
}
