import test from "node:test";
import assert from "node:assert/strict";
import {
  RIVER,
  RIVER_MISSIONS,
  SKIFF,
  WEAPONS,
  AIR_STRIKE,
  skiffPath,
  riverStars,
  riverCriteria,
  strikeLine,
  laserHeat,
  DECK_GUN_RANGE,
  SCENERY,
  RIVER_THEMES,
  BARRACKS,
  BOOM,
  ENGAGE_Z,
  LAUNCH_Z,
  CANAL_CAMERA,
  boomFlow,
  canalFrame,
  canalHeight,
} from "../src/river-data.js";
import { readFileSync } from "node:fs";
import { MISSION_STORY } from "../src/story.js";
import { PICKUPS } from "../src/pickups.js";
import { DIFFICULTIES, difficulty } from "../src/difficulty.js";

test("six river legs with ordered scripts that end at the destination", () => {
  assert.equal(RIVER_MISSIONS.length, 6);
  for (const mission of RIVER_MISSIONS) {
    const distances = mission.script.map((e) => e.d);
    assert.deepEqual(distances, [...distances].sort((a, b) => a - b));
    assert.ok(distances.at(-1) < mission.length);
    assert.ok(mission.script.some((e) => e.type === "guns" && e.drums), "every leg teaches the fuel drums");
  }
  const gate = RIVER_MISSIONS.at(-1);
  assert.ok(gate.gate < gate.length && gate.boss);
  // Every crate a script floats down the canal is a real pickup, and nothing spawns in the banks.
  for (const mission of RIVER_MISSIONS)
    for (const e of mission.script) {
      if (e.type === "pickup") assert.ok(PICKUPS[e.kind], e.kind);
      if (e.type === "pickup" || e.type === "mines") for (const x of e.xs || [e.x]) assert.ok(Math.abs(x) < RIVER.laneX, `${e.type} at x=${x}`);
      if (e.type === "skiffs" && e.x !== undefined) assert.ok(Math.abs(e.x) < RIVER.laneX);
    }
});

test("the new legs teach the new help: gunship on the floodplain, escort at the sawmill, both in the Cut", () => {
  const kinds = (i) => new Set(RIVER_MISSIONS[i].script.filter((e) => e.type === "pickup").map((e) => e.kind));
  assert.ok(kinds(2).has("heli") && kinds(2).has("strike") && kinds(2).has("ammo"));
  assert.ok(kinds(3).has("ally") && kinds(3).has("heli"));
  assert.ok(["heli", "ally", "strike", "ammo"].every((k) => kinds(4).has(k)));
  assert.ok(RIVER_MISSIONS[2].script.some((e) => e.type === "radio" && e.key === "rockets"));
  assert.ok(RIVER_MISSIONS[3].script.some((e) => e.type === "radio" && e.key === "laser"));
});

test("the canal is half as wide again, and the barges stay clear of both banks", () => {
  assert.ok(RIVER.bank >= 12.2 * 1.4);
  assert.ok(RIVER.laneX + 1.3 < RIVER.bank);
  assert.ok(RIVER.skiffX < RIVER.bank && RIVER.skiffX > RIVER.laneX);
  assert.ok(RIVER.bargeHp >= 24);
});

test("an air strike lays its bombs right across the canal, always ahead of the barges", () => {
  for (const z of [10, -3, -20, -80]) {
    const line = strikeLine(z);
    assert.equal(line.length, AIR_STRIKE.bombs);
    const at = line[0].z;
    assert.ok(line.every((p) => p.z === at));
    assert.ok(at <= AIR_STRIKE.near && at >= AIR_STRIKE.far);
    // Blasts overlap from bank to bank, so nothing crossing the line gets through.
    assert.ok(line[0].x - AIR_STRIKE.radius < -RIVER.laneX && line.at(-1).x + AIR_STRIKE.radius > RIVER.laneX);
    for (let i = 1; i < line.length; i++) assert.ok(line[i].x - line[i - 1].x < AIR_STRIKE.radius * 2);
    // The nearest barge rides at z=9.5; the line never falls within a blast of it.
    assert.ok(RIVER.bargeZ[0] - at > AIR_STRIKE.radius + 3);
  }
});

test("the laser overheats after a few seconds of fire and restarts once it has cooled", () => {
  const spec = WEAPONS.laser;
  let state = { heat: 0, locked: false };
  let fired = 0;
  while (!state.locked && fired < 20) {
    state = laserHeat(state, true, 0.05);
    if (state.beam) fired += 0.05;
  }
  assert.ok(Math.abs(fired - spec.heatTime) < 0.1, `fired ${fired}s`);
  assert.ok(state.locked && !state.beam);
  let cooling = 0;
  while (state.locked) {
    state = laserHeat(state, true, 0.05);
    cooling += 0.05;
  }
  assert.ok(Math.abs(cooling - (1 - spec.restart) / spec.cool) < 0.1, `cooled in ${cooling}s`);
  // Tapping the trigger never locks it.
  state = { heat: 0, locked: false };
  for (let i = 0; i < 400; i++) state = laserHeat(state, i % 4 === 0, 0.05);
  assert.ok(!state.locked);
});

test("pincer skiffs arrive abreast at the meeting point, then leave", () => {
  for (const count of [6, 8]) {
    const order = { pattern: "pincer", count, meet: { x: -2, z: 0 }, delay: 6.5 };
    const at = Array.from({ length: count }, (_, index) => skiffPath({ ...order, index }, order.delay));
    for (const p of at) assert.ok(Math.hypot(p.x - order.meet.x, p.z - order.meet.z) < SKIFF.chain, JSON.stringify(p));
    const start = Array.from({ length: count }, (_, index) => skiffPath({ ...order, index }, 0));
    assert.ok(start.every((p) => Math.abs(p.x) > 8), "they launch from the banks");
    assert.ok(skiffPath({ ...order, index: 0 }, order.delay * 2).done);
  }
});

test("wedges come downriver and columns overtake from behind", () => {
  const wedge = { pattern: "wedge", count: 5, x: 0 };
  assert.ok(skiffPath({ ...wedge, index: 0 }, 0).z < RIVER.far);
  assert.ok(skiffPath({ ...wedge, index: 0 }, 20).done);
  const column = { pattern: "column", count: 3, x: 7 };
  assert.ok(skiffPath({ ...column, index: 0 }, 0).z > RIVER.near);
  assert.ok(skiffPath({ ...column, index: 0 }, 20).done);
});

test("threats at the top of the screen are out of the deck gun's reach, on a 16:9 screen and in portrait", () => {
  assert.ok(DECK_GUN_RANGE < Math.abs(RIVER.spawnZ));
  assert.ok(DECK_GUN_RANGE > 30);
  for (const aspect of [16 / 9, 844 / 390, 390 / 844]) {
    const frame = canalFrame(aspect);
    // Everything spawns above the frame, out of the gun's reach from Marlin's station.
    assert.ok(RIVER.spawnZ < frame.far, `${aspect}: spawn at ${RIVER.spawnZ}, frame top at ${frame.far}`);
    assert.ok(4 - DECK_GUN_RANGE > RIVER.spawnZ, `${aspect}`);
  }
});

// ---------------------------------------------------------------- 5.1 K1: the engage line

test("5.1 K1: the engage line lies inside the frame on 16:9, landscape-phone and portrait screens, and the camera never moves", () => {
  assert.ok(ENGAGE_Z > -44 && LAUNCH_Z > -46, "the line moved down from 5.0's -44 and -46");
  for (const aspect of [16 / 9, 844 / 390, 390 / 844]) {
    const frame = canalFrame(aspect);
    // On the water, with room for a muzzle above it; the barges and Marlin's near bound below.
    assert.ok(ENGAGE_Z > frame.far + 2 && LAUNCH_Z > frame.far + 2, `${aspect}: top of the frame at ${frame.far.toFixed(1)}`);
    assert.ok(Math.max(RIVER.near, ...RIVER.bargeZ) < frame.near - 3, `${aspect}: bottom of the frame at ${frame.near.toFixed(1)}`);
  }
  // 16:9 used to show the water from -34.6 to +24.6; landscape zooms out by at most 10%.
  assert.ok(Math.abs(canalFrame(16 / 9).far - -34.6) < 3.5);
  for (const aspect of [16 / 9, 844 / 390]) assert.ok(canalHeight(aspect) <= CANAL_CAMERA.height * 1.1 + 1e-9);
  // Portrait keeps both banks in view, as before.
  assert.equal(canalHeight(390 / 844), CANAL_CAMERA.across / (390 / 844));
  assert.deepEqual({ ...CANAL_CAMERA.target }, { x: 0, y: 0, z: -5 });
});

test("5.1 K1: gun aim, launcher fire and the gate towers read ENGAGE_Z and LAUNCH_Z", () => {
  const source = readFileSync(new URL("../src/river.js", import.meta.url), "utf8");
  const body = (name) => {
    const start = source.indexOf(`  ${name}(`);
    return source.slice(start, source.indexOf("\n  }\n", start));
  };
  assert.match(body("updateGun"), /e\.position\.z > ENGAGE_Z/);
  assert.match(body("updateLauncher"), /e\.position\.z > LAUNCH_Z/);
  assert.match(body("updateBoss"), /tower\.position\.z > LAUNCH_Z/);
  // No shooter keeps 5.0's lines (-46 stays only as the range in which entities are updated).
  assert.doesNotMatch(source, /cooldown <= 0 && \w+\.position\.z > -4[46]/);
});

// ---------------------------------------------------------------- 5.1 K1: 2.1's boom

test("5.1 K1: 2.1 has one boom at d 186 under two crewed gun nests, its radio line and checkpoint once", () => {
  const leg = RIVER_MISSIONS[0];
  const of = (type) => leg.script.filter((e) => e.type === type);
  assert.deepEqual(of("boom").map((e) => e.d), [186]);
  for (const [i, m] of RIVER_MISSIONS.entries()) if (i) assert.ok(!m.script.some((e) => e.type === "boom"), `2.${i + 1}`);
  const nests = of("guns").filter((e) => e.d === 180);
  assert.deepEqual(nests.map((e) => [e.side, e.count, e.crew]).sort(), [[-1, 1, 2], [1, 1, 2]]);
  assert.deepEqual(of("radio").filter((e) => e.key === "boom").map((e) => e.d), [176]);
  assert.deepEqual(of("checkpoint").filter((e) => e.name === "THE BOOM").map((e) => [e.d, e.ahead]), [[176, true]]);
  assert.equal(MISSION_STORY[9].radio.boom.who, "okafor");
  assert.equal(MISSION_STORY[9].radio.boom.text, "Chain boom across the mouth, Marlin. Break it or the barges sit under those guns.");
  // The convoy reaches the hold before the end, and the mission goes on past it once it breaks.
  const holdAt = 186 + (BOOM.holdZ - RIVER.spawnZ);
  assert.ok(holdAt < leg.length - 10, `hold at ${holdAt}, length ${leg.length}`);
  assert.ok(of("checkpoint").at(-1).d > holdAt, "the stretch is cleared past the boom");
  // The boom holds 8 m ahead of Marlin's hold station (the skipper's z 2), in the frame on every screen.
  assert.equal(2 - BOOM.holdZ, 8);
  for (const aspect of [16 / 9, 844 / 390, 390 / 844]) assert.ok(BOOM.holdZ > canalFrame(aspect).far);
});

test("5.1 K1: convoy travel stops at the boom while it stands and resumes at mission speed once it breaks", () => {
  const speed = RIVER_MISSIONS[0].speed,
    dt = 1 / 120;
  let z = RIVER.spawnZ,
    distance = 0,
    t = 0,
    last = speed;
  // Full speed until the brake, a brake that never speeds up, and an exact stop on the line.
  while (t < 60) {
    const flow = boomFlow(speed, z, dt);
    assert.ok(flow <= last + 1e-12, `speeds up at z=${z}`);
    if (BOOM.holdZ - z >= BOOM.ease) assert.equal(flow, speed);
    last = flow;
    z += flow * dt;
    distance += flow * dt;
    t += dt;
    if (flow === 0) break;
  }
  assert.ok(Math.abs(z - BOOM.holdZ) < 1e-9, `stopped at ${z}`);
  // The brake takes 2 x ease / speed seconds (constant deceleration), within a few steps.
  const cruise = (BOOM.holdZ - RIVER.spawnZ - BOOM.ease) / speed;
  assert.ok(Math.abs(t - (cruise + (2 * BOOM.ease) / speed)) < 0.05, `stopped after ${t.toFixed(2)} s`);
  // Held: nothing moves for a minute.
  const held = distance;
  for (let i = 0; i < 120 * 60; i++) distance += boomFlow(speed, z, dt) * dt;
  assert.equal(distance, held);
});

test("5.1 K1: 7 deck-gun rounds break the boom and 6 do not; a rocket salvo or 1.6 s of laser also breaks it", () => {
  const after = (rounds) => BOOM.hp - rounds * WEAPONS.gun.damage;
  assert.ok(after(6) > 0);
  assert.ok(after(7) <= 0);
  // A rocket strikes for 5 (game.js resolveFriendlyShot); a salvo is three.
  assert.ok(WEAPONS.rocket.salvo * 5 >= BOOM.hp);
  assert.ok(WEAPONS.laser.dps * 1.6 >= BOOM.hp && WEAPONS.laser.dps * 1.5 < BOOM.hp);
});

test("river stars reward protecting the barges", () => {
  assert.equal(riverStars({ success: false, bargesLost: 0, bargeHealth: 1, damage: 0 }), 0);
  assert.equal(riverStars({ success: true, bargesLost: 0, bargeHealth: 0.9, damage: 2 }), 3);
  assert.equal(riverStars({ success: true, bargesLost: 1, bargeHealth: 0.4, damage: 2 }), 1);
  // 3.2: the third star wants the convoy nearly unscathed and Marlin barely touched.
  assert.equal(riverStars({ success: true, bargesLost: 0, bargeHealth: 0.7, damage: 0 }), 2);
  assert.equal(riverStars({ success: true, bargesLost: 0, bargeHealth: 0.95, damage: 3 }), 2);
});

test("the Lock Gate medal floats out after the gate opens, with room to reach Marlin", () => {
  const leg = RIVER_MISSIONS.at(-1);
  assert.ok(!leg.script.some((e) => e.type === "pickup" && e.kind === "medal"), "the medal is not scripted");
  // The gate holds the convoy 48 m after it spawns; the medal then needs to drift past Marlin's reach.
  const holdAt = leg.gate + (-24 - RIVER.spawnZ);
  const drift = leg.length - holdAt;
  assert.ok(-24 + 3 + drift > RIVER.far + 2.4, `medal ends at z=${-24 + 3 + drift}`);
});

test("every canal mission has its own banks, and what stands on them can be shot down", () => {
  assert.equal(RIVER_THEMES.length, RIVER_MISSIONS.length);
  const sets = RIVER_THEMES.map((theme) => [...new Set(Array.from({ length: 22 }, (_, i) => theme.props(i)))].sort().join());
  assert.equal(new Set(sets).size, RIVER_THEMES.length, "no two missions dress their banks alike");
  assert.equal(new Set(RIVER_THEMES.map((t) => t.bank)).size >= 4, true);
  for (const theme of RIVER_THEMES)
    for (let i = 0; i < 22; i++) {
      const kind = theme.props(i);
      // Rocks stay; everything else has hit points, a size and a wreck.
      if (kind !== "rock") assert.ok(SCENERY[kind], kind);
    }
  // A tree falls to a couple of deck-gun rounds (two points each); a house or a shed takes a burst.
  const rounds = (kind) => Math.ceil(SCENERY[kind].hp / WEAPONS.gun.damage);
  assert.ok(rounds("palm") <= 2 && rounds("jungle-tree") <= 2 && rounds("pine") <= 2);
  assert.ok(rounds("stilt-house") >= 4 && rounds("shed") >= 4);
  for (const spec of Object.values(SCENERY)) assert.ok(spec.colors.length >= 2 && spec.radius > 0 && spec.reward > 0);
});

test("barracks stand on the banks in every canal mission and take a burst to knock down", () => {
  for (const [i, m] of RIVER_MISSIONS.entries()) {
    const huts = m.script.filter((e) => e.type === "barracks");
    assert.ok(huts.length >= 1, `2.${i + 1} has a barracks`);
    for (const hut of huts) {
      assert.ok(hut.side === 1 || hut.side === -1);
      assert.ok(hut.crew >= 3 && hut.crew <= BARRACKS.crew);
      // Before the Lock Gate holds the convoy, well inside the mission.
      assert.ok(hut.d < (m.gate ?? m.length) - 20, `2.${i + 1}: barracks at ${hut.d}`);
    }
  }
  // Eight standard rounds, or a rocket salvo and a few rounds; its riflemen come out one by one.
  assert.equal(Math.ceil(BARRACKS.hp / WEAPONS.gun.damage), 8);
  assert.ok(BARRACKS.every * BARRACKS.crew > 6);
  // It stands on the bank, clear of the guns at the water's edge.
  assert.ok(BARRACKS.offset > 3.4 + 1.9);
});

test("every canal criterion's text matches its check on every mode (5.1)", () => {
  // Marlin's damage is what her shields lost: a hit costs the mode's enemy damage.
  for (const mode of DIFFICULTIES) {
    const perHit = difficulty(mode).enemyDamage;
    for (const success of [false, true])
      for (const bargesLost of [0, 1])
        for (const bargeHealth of [0.5, 0.79, 0.8, 1])
          for (let hits = 0; hits <= 4; hits++) {
            const input = { success, bargesLost, bargeHealth, damage: hits * perHit };
            const [deliver, both, clean] = riverCriteria(input);
            assert.equal(deliver[0], success);
            assert.equal(both[0], success && bargesLost === 0);
            assert.equal(clean[0], success && bargeHealth >= 0.8 && input.damage <= 2);
            assert.equal(clean[1], "Barges above 80% and Marlin takes at most 2 damage");
            // The stars are the criteria met.
            assert.equal(riverStars(input), success ? [deliver, both, clean].filter(([ok]) => ok).length : 0, mode);
          }
  }
});
