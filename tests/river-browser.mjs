// Chapter 2 browser checks: convoy mechanics. The scripted skipper below sails the canal missions
// for the golden runs (tests/golden-browser.mjs).

import { BOOM, ENGAGE_Z, LAUNCH_Z } from "../src/river-data.js";

export function skipper(index) {
  const { game: g, ui } = window.__TIDELOCK__;
  ui.start(index);
  g.paused = false;
  for (let step = 0; step < 120 * 240 && g.status === "playing"; step++) {
    if (step % 4 === 0) decide();
    g.update(1 / 120);
  }
  g.input.fire = false;
  g.input.x = g.input.z = 0;
  g.input.stickAim = null;

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
    // These checks were tuned on Easy, so they set it; the page gets its own mode back at the end.
    const pageMode = g.difficulty;
    ui.setDifficulty("easy");
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
      ram.dead && Math.abs(rammed.hp - (before.hp - 3 * (g.mode.bargeDamage ?? g.mode.enemyDamage))) < 1e-9 && g.score === before.score && g.kills === before.kills;
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

    // 2.7: the banks' houses and trees can be shot down, with a blast, pieces thrown into the
    // sky and smoke; the wreck scrolls on, and the stretch comes back intact when it scrolls round.
    ui.start(9);
    g.paused = false;
    const house = g.op.scenery.find((r) => r.kind === "stilt-house");
    house.prop.position.z = -14;
    g.player.position.set(house.prop.position.x > 0 ? 8 : -8, 0.08, -2);
    const scoreBefore = g.score;
    const aimAt = house.prop.position.clone().setY(house.prop.position.y + house.spec.lift);
    for (let i = 0; i < 240 && house.alive; i++) {
      g.cooldown = 0;
      g.fire(aimAt.clone());
      g.updateProjectiles(1 / 120);
      g.updateEffects(1 / 120);
    }
    out.bankHousesCanBeShotDown = !house.alive && !house.model.visible && Boolean(house.wreck) && g.score >= scoreBefore + house.spec.reward;
    out.wrecksThrowPiecesAndSmoke = g.fragments.length > 5 && g.emitters.length > 0;
    house.prop.position.z = 35.99;
    g.update(1 / 120);
    out.scrolledRoundBankComesBack = house.alive && house.model.visible && !house.wreck && house.hp === house.spec.hp;
    // Every canal mission dresses its banks differently.
    const dressing = [];
    for (const m of [9, 10, 11, 12, 13, 14]) {
      ui.start(m);
      // What stands on the banks, and how much of each.
      const count = {};
      for (const r of g.op.scenery) count[r.kind] = (count[r.kind] || 0) + 1;
      dressing.push(JSON.stringify(Object.entries(count).sort()));
    }
    out.eachMissionHasItsOwnBanks = new Set(dressing).size === 6;

    // Bank barracks send riflemen down to the water; knocked down, those still inside are lost.
    ui.start(10);
    g.paused = false;
    g.hitChance = 0;
    g.op.spawn({ d: 0, type: "barracks", side: 1, crew: 4 });
    const hut = g.entities.find((e) => e.type === "barracks");
    hut.position.z = -18;
    for (let i = 0; i < 120 * 5.5; i++) g.update(1 / 120);
    const riflemen = g.entities.filter((e) => e.type === "enemy" && !e.dead && e.position.x > 17 && e.position.x < 20.5);
    out.barracksSendsRiflemenToTheWater = riflemen.length >= 2 && riflemen.some((e) => e.gunner);
    const inside = hut.crew;
    const beforeHut = g.score;
    g.damage(hut, 99, true);
    out.barracksGoesDownWithThoseInside = hut.dead && inside > 0 && g.score >= beforeHut + 200 + 50 * inside;

    // With the deck gun held on a heavy target, a rocket salvo follows on its own.
    ui.start(11);
    g.paused = false;
    ui.weapon("gun");
    g.op.spawn({ d: 0, type: "guns", side: 1, count: 1, launcher: true });
    const bunker = g.entities.find((e) => e.type === "launcher");
    bunker.position.z = -16;
    const rocketsBefore = g.op.rockets;
    g.input.aim.copy(bunker.position).setY(1.5);
    g.input.fire = true;
    for (let i = 0; i < 12; i++) g.update(1 / 120);
    g.input.fire = false;
    out.rocketsFollowOnHeavyTargets = g.op.rockets === rocketsBefore - 3;
    // Rounds: a crate of AP doubles the deck gun's punch.
    const bankGun = g.entities.find((e) => e.type === "cannon");
    bankGun.position.z = -12;
    bankGun.hp = 20;
    for (const shot of g.projectiles) shot.dead = true;
    g.gainRounds("ap");
    g.cooldown = 0;
    g.fire(bankGun.position.clone().setY(bankGun.position.y + 1));
    for (let i = 0; i < 90; i++) g.updateProjectiles(1 / 120);
    out.apRoundsHitTwiceAsHard = bankGun.hp === 20 - 2 * 2;
    // Twin guns firing on their own keep the crates for the player's trigger.
    g.gainRounds("plasma");
    const plasma = g.rounds.plasma;
    g.twin = 3;
    for (let i = 0; i < 120 * 2; i++) g.update(1 / 120);
    out.twinGunsKeepTheBestRounds = g.rounds.plasma === plasma && g.shots > 0;
    // Automatic rockets keep the last salvo in the rack for the player.
    const hut2 = g.entities.find((e) => e.type === "launcher" && !e.dead) || bunker;
    g.op.rockets = 3;
    g.rocketCooldown = 0;
    g.input.aim.copy(hut2.position).setY(1.5);
    g.input.fire = true;
    for (let i = 0; i < 12; i++) g.update(1 / 120);
    g.input.fire = false;
    out.lastSalvoStaysForThePlayer = g.op.rockets === 3;
    // Guns and launchers make way on the bank: no house stands where a bunker sets up.
    ui.start(14);
    g.paused = false;
    g.op.spawn({ d: 0, type: "guns", side: 1, count: 2, launcher: true });
    const set = g.entities.filter((e) => e.type === "cannon" || e.type === "launcher");
    out.enemyPositionsClearTheBank = set.every((e) =>
      g.op.scenery.every((r) => !r.alive || r.hidden || Math.sign(r.prop.position.x) !== Math.sign(e.position.x) || Math.abs(r.prop.position.z - e.position.z) >= 3),
    );
    // A house shot down and scrolled round comes back without the smoke of its wreck.
    const shack = g.op.scenery.find((r) => r.alive && !r.hidden && r.spec.wreck === "house");
    g.op.destroyScenery(shack);
    const smoke = shack.smoke;
    shack.prop.position.z = 35.99;
    g.update(1 / 120);
    g.update(1 / 120);
    out.rebuiltHouseDoesNotSmoke = shack.alive && !g.emitters.includes(smoke);
    ui.setDifficulty(pageMode);
    return out;
  });
  for (const [name, value] of Object.entries(mechanics)) check(`river ${name}`, value);
  await checkBoomAndLines(page, check);
}

// 5.1 K1 in the page: 2.1's boom played from the script, and the engage line on guns, launchers
// and the gate's towers. Game steps only, no wall clock.
async function checkBoomAndLines(page, check) {
  const k1 = await page.evaluate(
    ({ engage, launch, boomSpec }) => {
      const { game: g, ui } = window.__TIDELOCK__;
      const out = {};
      const pageMode = g.difficulty;
      ui.setDifficulty("normal");
      ui.start(9);
      g.paused = false;
      // Enemy rounds glance off, so the convoy lives through a long hold.
      g.hitChance = 0;
      const said = [],
        marks = [];
      g.radio = function (line, key) {
        said.push(key);
        return Object.getPrototypeOf(this).radio.call(this, line, key);
      };
      const notify = g.notify;
      g.notify = (type, data) => {
        if (type === "checkpoint") marks.push(data);
        return notify(type, data);
      };
      const op = g.op,
        speed = op.data.speed;
      op.distance = 170;
      // The approach: full speed, then a brake that never speeds up, to a hold on the line.
      let braking = true,
        last = speed,
        full = true;
      for (let i = 0; i < 120 * 60 && !op.holding; i++) {
        g.update(1 / 120);
        if (op.boom && boomSpec.holdZ - op.boom.position.z > boomSpec.ease + 0.1 && op.flow !== speed) full = false;
        if (op.flow > last + 1e-9) braking = false;
        last = op.flow;
      }
      const boom = op.boom;
      out.boomHoldsTheConvoyShortOfIt = Boolean(boom) && op.holding && full && braking && Math.abs(boom.position.z - boomSpec.holdZ) < 1e-6;
      const held = op.distance;
      g.input.z = -1;
      for (let i = 0; i < 120 * 3; i++) g.update(1 / 120);
      g.input.z = 0;
      out.travelStopsWhileTheBoomStands = op.distance === held && op.holding && g.status === "playing";
      out.marlinCannotSailThroughTheBoom = g.player.position.z >= boom.position.z + 2.5 - 1e-6;
      ui.updateHUD(true);
      const coach = document.getElementById("coach");
      out.hintShowsWhileTheBoomStands = op.snapshot().hint === "boom" && !coach.hidden && coach.textContent === "Shoot the boom to let the barges through";
      // Deck-gun rounds from Marlin, off the centre line: the boom is struck where they cross it.
      g.player.position.set(8, g.player.position.y, 2);
      const round = () => {
        for (const shot of g.projectiles) shot.dead = true;
        g.cooldown = 0;
        g.fire(boom.position.clone().set(8, boomSpec.lift, boom.position.z));
        for (let i = 0; i < 90; i++) g.updateProjectiles(1 / 120);
      };
      for (let i = 0; i < 6; i++) round();
      out.sixRoundsDoNotBreakIt = !boom.dead && boom.hp === boomSpec.hp - 12 && op.boom === boom;
      round();
      out.theSeventhBreaksIt = boom.dead && !op.boom && !op.holding;
      const before = op.distance;
      for (let i = 0; i < 120; i++) g.update(1 / 120);
      out.convoyResumesAtMissionSpeed = Math.abs(op.distance - before - speed) < 1e-6;
      ui.updateHUD(true);
      out.hintGoesWithTheBoom = op.snapshot().hint === null && coach.hidden;
      for (let i = 0; i < 120 * 60 && g.status === "playing"; i++) g.update(1 / 120);
      out.radioAndCheckpointOnce =
        g.status === "success" && said.filter((k) => k === "boom").length === 1 && marks.filter((m) => m === "THE BOOM").length === 1;
      out.detail = JSON.stringify({ status: g.status, boom: said.filter((k) => k === "boom").length, marks });
      delete g.radio;
      g.notify = notify;

      // The engage line: a gun aims only past ENGAGE_Z, a launcher fires only past LAUNCH_Z.
      ui.start(10);
      g.paused = false;
      g.op.spawn({ d: 0, type: "guns", side: 1, count: 1, launcher: true });
      const gun = g.entities.find((e) => e.type === "cannon"),
        launcher = g.entities.find((e) => e.type === "launcher");
      gun.scrolling = launcher.scrolling = false;
      const missiles = () => g.projectiles.filter((s) => s.hostile && s.missile && !s.dead).length;
      gun.position.z = engage - 0.5;
      launcher.position.z = launch - 0.5;
      gun.cooldown = launcher.cooldown = 0;
      for (let i = 0; i < 60; i++) g.update(1 / 120);
      const quiet = !(gun.aim > 0) && missiles() === 0;
      gun.position.z = engage + 0.5;
      launcher.position.z = launch + 0.5;
      for (let i = 0; i < 2; i++) g.update(1 / 120);
      out.gunsAimAndLaunchersFireOnlyPastTheLine = quiet && gun.aim > 0 && missiles() === 1;
      // The gate's towers fire only past LAUNCH_Z.
      ui.start(14);
      g.paused = false;
      g.op.spawnGate();
      g.op.holding = true;
      for (const e of g.entities) if (e.scrolling && e.type !== "pickup") e.position.z = launch - 1;
      g.op.boss.phase = "towers";
      const heavy = () => g.projectiles.filter((s) => s.hostile && s.heavy && !s.dead).length;
      for (const t of g.op.boss.towers) t.cooldown = 0;
      for (let i = 0; i < 60; i++) g.update(1 / 120);
      const towersQuiet = heavy() === 0;
      for (const e of g.entities) if (e.scrolling && e.type !== "pickup") e.position.z = launch + 1;
      g.update(1 / 120);
      out.towersFireOnlyPastTheLine = towersQuiet && heavy() === 2;
      ui.setDifficulty(pageMode);
      return out;
    },
    { engage: ENGAGE_Z, launch: LAUNCH_Z, boomSpec: BOOM },
  );
  const detail = k1.detail;
  delete k1.detail;
  for (const [name, value] of Object.entries(k1)) check(`river 5.1 K1 ${name}${name === "radioAndCheckpointOnce" ? ` (${detail})` : ""}`, value);
}

// 5.1 K1 on the screen: where the engage line and each launch fall against the free play rect,
// the boom's hint and the chevrons, and the convoy kept clear of every HUD panel. Where the HUD's
// own panels keep the line out of the free rect (H1's top bar and radio ticker), the measured
// distance is held as a ceiling that may not grow until the owner decides (docs/VERIFICATION.md,
// K1), as hud-browser does for coverage.
const FRAME_SIZES = [
  [1280, 720],
  [1024, 768],
  [844, 390],
  [390, 844],
  [360, 740],
];
// Where the engage line and the launches are measured.
const LINE_SIZES = ["1280x720", "844x390", "390x844"];
// Pixels the line still lies outside the free rect (a gun's or a launcher's muzzle, any side).
const LINE_SIGNOFF = { "1280x720": 26, "844x390": 83 };
// Share of the skipper's hostile launches on 2.1-2.6 Normal from outside the free rect.
const LAUNCH_TARGET = 0.05;
const LAUNCH_SIGNOFF = { "1280x720": 0.07, "844x390": 0.68 };

export async function checkCanalFrame(browser, url, check) {
  for (const [width, height] of FRAME_SIZES) {
    const size = `${width}x${height}`,
      touch = width < 1000;
    const page = await browser.newPage({ viewport: { width, height }, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${url}?qa=1`);
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 120000 });
    // The boom's hint and the chevrons, on every size: the hint clear of the radio ticker
    // (portrait phones) or of the barges and Marlin (desktop and landscape phones); no chevron for
    // an aimer in plain view, so none blinks with the aim cycle (a bank gun beside a narrow free rect).
    const sight = await page.evaluate(
      ({ portrait }) => {
        const { game: g, ui, view } = window.__TIDELOCK__;
        document.querySelectorAll("dialog[open]").forEach((d) => d.close());
        const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        const p = { x: 0, y: 0, visible: false };
        const rectOf = (object) => {
          const r = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
            corner = object.position.clone();
          object.updateMatrixWorld(true);
          object.traverse((child) => {
            if (!child.isMesh || !child.visible) return;
            child.geometry.boundingBox || child.geometry.computeBoundingBox();
            const { min, max } = child.geometry.boundingBox;
            for (let i = 0; i < 8; i++) {
              corner.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z).applyMatrix4(child.matrixWorld);
              view.projectInto(p, corner);
              r.left = Math.min(r.left, p.x);
              r.right = Math.max(r.right, p.x);
              r.top = Math.min(r.top, p.y);
              r.bottom = Math.max(r.bottom, p.y);
            }
          });
          return r;
        };
        const out = { hint: "", hintClear: true, inSight: 0, shownInSight: 0, toggles: 0, steps: 0 };
        // The hint: the boom held in sight from the start, the start line still on the radio.
        ui.start(9);
        g.paused = false;
        g.op.spawn({ d: 0, type: "boom" });
        g.op.boom.scrolling = false;
        g.op.boom.position.z = -20;
        const coach = document.getElementById("coach");
        for (let i = 0; i < 120 * 5 && coach.hidden; i++) {
          g.update(1 / 120);
          ui.updateHUD(true);
        }
        view.camera.updateMatrixWorld();
        const hint = coach.getBoundingClientRect();
        out.hint = `${Math.round(hint.left)},${Math.round(hint.top)},${Math.round(hint.right)},${Math.round(hint.bottom)}`;
        out.hintShown = !coach.hidden && hint.width > 0;
        const comms = document.getElementById("comms").getBoundingClientRect();
        out.ticker = comms.height > 0 && document.querySelector("#comms > .radio-line") !== null;
        out.tickerClear = !overlap(hint, comms);
        if (!portrait) {
          // Marlin where she starts and at her near bound, and both barges where they ride.
          const marlin = g.player.position;
          for (const z of [marlin.z, 17]) {
            marlin.set(0, marlin.y, z);
            for (const object of [g.player, ...g.op.barges.map((b) => b.mesh)])
              if (overlap(hint, rectOf(object))) {
                out.hintClear = false;
                out.hint += ` over ${object === g.player ? `Marlin at z ${z}` : "a barge"}`;
              }
          }
        }
        // The chevrons: 2.1 played for 60 s, the HUD every 6 steps. An aimer is in sight when its
        // point is on the screen, between the free rect's top and bottom, and under no panel.
        ui.start(9);
        g.paused = false;
        const was = new Map();
        for (let step = 1; step <= 120 * 60 && g.status === "playing"; step++) {
          g.update(1 / 120);
          if (step % 6) continue;
          ui.updateHUD();
          view.camera.updateMatrixWorld();
          const free = ui.freeRect,
            panels = ui.hudRects;
          out.steps++;
          for (const e of g.entities) {
            if (e.dead || !(e.type === "launcher" || (e.aim > 0 && e.target))) continue;
            view.projectInto(p, e.position);
            const inSight =
              p.visible && p.y >= free.top && p.y <= free.bottom && p.x >= 0 && p.x <= innerWidth && !panels.some((r) => p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom);
            if (!inSight) continue;
            out.inSight++;
            const shown = ui.edge.slots.some((s) => s.shown && s.id === e);
            if (shown) out.shownInSight++;
            if (was.has(e) && was.get(e) !== shown) out.toggles++;
            was.set(e, shown);
          }
        }
        g.paused = true;
        return out;
      },
      { portrait: height > width },
    );
    check(`river ${size} the boom's hint shows (${sight.hint})`, sight.hintShown);
    if (height > width) check(`river ${size} the boom's hint stays clear of the radio ticker`, sight.ticker && sight.tickerClear);
    else check(`river ${size} the boom's hint stays clear of the barges and of Marlin at her start and her near bound (${sight.hint})`, sight.hintClear);
    check(
      `river ${size} no chevron for an aimer in plain view and none blinking with the aim cycle (${sight.inSight} in-sight samples over ${sight.steps} HUD frames: ${sight.shownInSight} shown, ${sight.toggles} changes)`,
      sight.steps > 500 && sight.inSight > 0 && sight.shownInSight === 0 && sight.toggles === 0,
    );
    if (LINE_SIZES.includes(size)) {
      const line = await page.evaluate(
        ({ engage, launch, bank }) => {
          const { game: g, ui, view } = window.__TIDELOCK__;
          document.querySelectorAll("dialog[open]").forEach((d) => d.close());
          ui.start(9);
          g.paused = false;
          for (let i = 0; i < 240; i++) g.update(1 / 120);
          g.paused = true;
          ui.updateHUD(true);
          view.camera.updateMatrixWorld();
          const free = ui.freeRect;
          // The muzzles: a bank gun's (1.1 m over its mount) and a launcher's (2.7 m), both banks.
          const points = [];
          for (const s of [-1, 1]) points.push([s * (bank + 0.2), 2.15, engage], [s * (bank + 3.4), 3.8, launch]);
          let canvas = true,
            beyond = 0;
          for (const [x, y, z] of points) {
            const p = view.projectInto({ x: 0, y: 0, visible: false }, { x, y, z });
            canvas &&= p.visible && p.x >= 0 && p.x <= innerWidth && p.y >= 0 && p.y <= innerHeight;
            beyond = Math.max(beyond, free.top - p.y, free.left - p.x, p.x - free.right, p.y - free.bottom);
          }
          return { canvas, beyond: Math.ceil(beyond) };
        },
        { engage: ENGAGE_Z, launch: LAUNCH_Z, bank: 17.5 },
      );
      check(`river ${size} the engage line (ENGAGE_Z ${ENGAGE_Z}, LAUNCH_Z ${LAUNCH_Z}) projects inside the canvas`, line.canvas);
      const limit = LINE_SIGNOFF[size] ?? 0;
      check(
        `river ${size} the engage line projects ${line.beyond > 0 ? `${line.beyond} px outside the free rect (target 0, at most ${limit} px under H1's panels until the owner decides)` : "inside the free rect"}`,
        line.beyond <= limit,
      );
      if (LAUNCH_SIGNOFF[size] !== undefined) {
        const launches = await page.evaluate(
          ([src]) => {
            const { game: g, ui, view } = window.__TIDELOCK__;
            const play = eval(src);
            ui.setDifficulty("normal");
            const out = { all: 0, outside: 0, convoy: true, where: "" };
            const at = { x: 0, y: 0, visible: false };
            g.spawnShot = function (origin, aim, missile, hostile, ...rest) {
              if (hostile && this.chapter === 1) {
                out.all++;
                ui.updateHUD(true);
                view.camera.updateMatrixWorld();
                const f = ui.freeRect;
                view.projectInto(at, origin);
                if (at.x < f.left || at.x > f.right || at.y < f.top || at.y > f.bottom) out.outside++;
              }
              return Object.getPrototypeOf(this).spawnShot.call(this, origin, aim, missile, hostile, ...rest);
            };
            // The barges' and Marlin's screen rects, from their meshes' boxes, against the canvas and
            // every HUD panel: every half second of the approach on 2.1 and of the hold on 2.6.
            const V3 = g.player.position.constructor;
            const corner = new V3(),
              p = { x: 0, y: 0, visible: false };
            const rectOf = (object) => {
              const r = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
              object.updateMatrixWorld(true);
              object.traverse((child) => {
                if (!child.isMesh || !child.visible) return;
                child.geometry.boundingBox || child.geometry.computeBoundingBox();
                const { min, max } = child.geometry.boundingBox;
                for (let i = 0; i < 8; i++) {
                  corner.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z).applyMatrix4(child.matrixWorld);
                  view.projectInto(p, corner);
                  r.left = Math.min(r.left, p.x);
                  r.right = Math.max(r.right, p.x);
                  r.top = Math.min(r.top, p.y);
                  r.bottom = Math.max(r.bottom, p.y);
                }
              });
              return r;
            };
            const clear = (when) => {
              ui.updateHUD(true);
              view.camera.updateMatrixWorld();
              const panels = ui.badgeOverlays.map((n) => n.getBoundingClientRect()).filter((q) => q.width > 0 && q.height > 0);
              const boats = [["Marlin", g.player], ...g.op.barges.filter((b) => b.alive).map((b) => [`barge ${b.index + 1}`, b.mesh])];
              for (const [name, object] of boats) {
                const r = rectOf(object);
                const inside = r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
                const under = panels.some((q) => r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top);
                if (!inside || under) {
                  out.convoy = false;
                  out.where ||= `${when}: ${name} ${inside ? "under a panel" : "off the canvas"} (${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)})`;
                }
              }
            };
            let steps = 0;
            g.update = function (dt) {
              Object.getPrototypeOf(this).update.call(this, dt);
              if (++steps % 60) return;
              if (this.index === 9 && this.time < 30) clear(`2.1 at ${this.time.toFixed(1)} s`);
              if (this.index === 14 && this.op.holding) clear(`2.6 hold at ${this.time.toFixed(1)} s`);
            };
            try {
              for (const index of [9, 10, 11, 12, 13, 14]) {
                g.attemptsBy.clear();
                steps = 0;
                play(index);
              }
            } finally {
              delete g.spawnShot;
              delete g.update;
              g.paused = true;
            }
            return out;
          },
          [`(${skipper})`],
        );
        const share = launches.outside / launches.all;
        const ceiling = LAUNCH_SIGNOFF[size];
        check(
          `river ${size} the skipper on 2.1-2.6 Normal launches ${launches.outside} of ${launches.all} hostile shots and missiles from outside the free rect (${(share * 100).toFixed(1)}%; target ${LAUNCH_TARGET * 100}%${ceiling > LAUNCH_TARGET ? `, at most ${Math.round(ceiling * 100)}% until the owner decides` : ""})`,
          share <= Math.max(LAUNCH_TARGET, ceiling),
        );
        check(`river ${size} the barges and Marlin stay inside the canvas and clear of every HUD panel on the 2.1 approach and the 2.6 hold${launches.where ? `: ${launches.where}` : ""}`, launches.convoy);
      }
    }
    check(`river ${size} page errors${errors.length ? `: ${errors[0].slice(0, 80)}` : ""}`, errors.length === 0);
    await page.close();
  }
}
