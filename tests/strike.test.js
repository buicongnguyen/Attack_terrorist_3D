import test from "node:test";
import assert from "node:assert/strict";
import {
  STRIKE_MISSIONS,
  BOMBS,
  BOMB_ORDER,
  CITY,
  STEP,
  resolveBuildings,
  buildBlocks,
  planEnemies,
  sampleRoute,
  rallyStatus,
  pathBetween,
  timeline,
  resolvePlace,
  forecastImpact,
  stepBomb,
  blockHits,
  lineBlocked,
  lerp3,
  storyY,
  scatterPattern,
  shelterStruck,
  payloadTotal,
  comboBonus,
  strikeStars,
  formationSlots,
  FLIGHT,
} from "../src/strike-data.js";

const distance3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const setup = (i) => {
  const layout = STRIKE_MISSIONS[i];
  const buildings = resolveBuildings(layout);
  return { layout, buildings, blocks: buildBlocks(buildings) };
};

test("six strike missions, each winnable within its ordnance and teaching one new idea", () => {
  assert.equal(STRIKE_MISSIONS.length, 6);
  for (const layout of STRIKE_MISSIONS) {
    const total = payloadTotal(layout.aircraft);
    assert.ok(layout.par <= total, "par must not exceed the payload");
    assert.ok(layout.aircraft.length >= 1 && layout.aircraft.length <= 3);
    for (const a of layout.aircraft) for (const kind of Object.keys(a.payload)) assert.ok(BOMB_ORDER.includes(kind));
  }
  // New tools arrive in order: Shockwave, Drill, Scatter + rally, flak + salvo, alert + shelter, Lance + convoy.
  assert.ok(STRIKE_MISSIONS[0].aircraft[0].payload.shockwave);
  assert.ok(STRIKE_MISSIONS[1].aircraft[0].payload.drill);
  assert.ok(STRIKE_MISSIONS[2].groups.some((g) => g.kind === "rally"));
  assert.ok(STRIKE_MISSIONS[3].aa.length === 2 && STRIKE_MISSIONS[3].aircraft.length === 3);
  assert.ok(STRIKE_MISSIONS[4].alert > 0 && STRIKE_MISSIONS[4].buildings.some((b) => b.kind === "shelter"));
  assert.ok(STRIKE_MISSIONS[5].convoy && STRIKE_MISSIONS[5].aircraft[0].payload.lance);
});

test("scheduled patrols converge on every rally point, cycle after cycle", () => {
  for (let i = 0; i < STRIKE_MISSIONS.length; i++) {
    const { layout, buildings } = setup(i);
    const { plans, events } = planEnemies(layout, buildings);
    for (const event of events) {
      const members = plans.filter((p) => p.group === event.group);
      assert.equal(members.length, event.members);
      for (const cycle of [0, 1, 2]) {
        const mid = event.at + cycle * event.every + event.stay / 2;
        for (const m of members) assert.ok(distance3(sampleRoute(m.route, mid), event.centre) < 1.5, `mission ${i} ${event.label}`);
        assert.ok(rallyStatus(event, mid).active);
      }
      // Between gatherings the group is spread out, so timing the strike matters.
      const home = event.at + event.stay + (event.every - event.stay) / 2;
      const spread = Math.max(...members.map((m) => distance3(sampleRoute(m.route, home), event.centre)));
      assert.ok(spread > 3, `mission ${i} ${event.label} spread ${spread}`);
      assert.ok(!rallyStatus(event, home).active);
    }
  }
});

test("rally countdowns report time to the next gathering and time left in it", () => {
  const event = { at: 20, every: 48, stay: 8 };
  assert.deepEqual(rallyStatus(event, 5), { active: false, remaining: 0, next: 15 });
  assert.ok(rallyStatus(event, 22).active && rallyStatus(event, 22).remaining === 6);
  assert.equal(rallyStatus(event, 30).next, 38);
});

test("walkers use doors, stairs and streets rather than walking through walls", () => {
  for (let i = 0; i < STRIKE_MISSIONS.length; i++) {
    const { layout, buildings } = setup(i);
    const places = [];
    for (const g of layout.groups) {
      if (g.homes) places.push(...g.homes, g.rally);
      if (g.points) places.push(...g.points);
      if (g.at) places.push(g.at);
    }
    const resolved = places.map((p) => resolvePlace(buildings, p));
    for (const a of resolved)
      for (const b of resolved.slice(0, 6)) {
        const path = pathBetween(layout, buildings, a, b);
        for (let k = 1; k < path.length; k++) {
          const p = path[k - 1],
            q = path[k];
          // A leg that changes floors must stay on one building's stair core.
          if ((p.f ?? 0) !== (q.f ?? 0)) assert.ok(p.b && p.b === q.b && p.x === q.x && p.z === q.z);
          // Street legs never cut across a building footprint.
          if (!p.b && !q.b)
            for (const building of buildings)
              for (let s = 0.05; s < 1; s += 0.05) {
                const x = p.x + (q.x - p.x) * s,
                  z = p.z + (q.z - p.z) * s;
                assert.ok(
                  !(x > building.min[0] + 0.2 && x < building.max[0] - 0.2 && z > building.min[2] + 0.2 && z < building.max[2] - 0.2),
                  `mission ${i} street leg crosses ${building.id}`,
                );
              }
        }
      }
  }
});

// Mirror of the live bomb loop for contact-fused ordnance.
function flyContact(blocks, buildings, release) {
  const s = { ...release };
  for (let i = 0; i < 2400; i++) {
    const a = { x: s.x, y: s.y, z: s.z };
    stepBomb(s, STEP);
    const b = { x: s.x, y: s.y, z: s.z };
    const hit = blockHits(blocks, buildings, a, b)[0];
    if (hit) return lerp3(a, b, hit.t);
    if (b.y <= CITY.ground) return lerp3(a, b, (a.y - CITY.ground) / (a.y - b.y));
  }
  return null;
}

test("the pipper forecast matches the live ballistic path exactly", () => {
  const { buildings, blocks } = setup(5);
  for (const [x, z, vx, vz] of [
    [-40, -13, 10, 0],
    [-30, 0, 12, 2],
    [-36, 7, 7, -3],
    [-20, 14, 10, 0],
  ]) {
    const release = { x, y: FLIGHT.altitude, z, vx, vy: -1.2, vz };
    const forecast = forecastImpact(blocks, buildings, release, "shockwave");
    const live = flyContact(blocks, buildings, release);
    assert.ok(distance3(forecast.impact, live) < 1e-6, `forecast ${JSON.stringify(forecast.impact)} vs ${JSON.stringify(live)}`);
  }
});

test("the Drill forecast names the floor it will detonate on", () => {
  const { buildings, blocks } = setup(1);
  const tower = buildings.find((b) => b.id === "T1");
  // Find a release whose free-fall lands in the middle of the tower.
  for (let x = -60; x < 0; x += 0.25) {
    const release = { x, y: FLIGHT.altitude, z: tower.z, vx: 10, vy: -1.2, vz: 0 };
    const f = forecastImpact(blocks, buildings, release, "drill", 3);
    if (f.building?.id !== "T1" || Math.abs(f.detonation.x - tower.x) > 2) continue;
    assert.equal(f.floor, 2);
    assert.ok(f.detonation.y <= storyY(2) + 1.1 && f.detonation.y > storyY(2));
    return;
  }
  assert.fail("no release over the tower");
});

test("a Drill set above the top floor bursts on the roof", () => {
  const { buildings, blocks } = setup(1);
  const tower = buildings.find((b) => b.id === "T1");
  for (let x = -60; x < 0; x += 0.25) {
    const f = forecastImpact(blocks, buildings, { x, y: FLIGHT.altitude, z: tower.z, vx: 6.5, vy: -1.2, vz: 0 }, "drill", tower.floors + 1);
    if (f.building?.id !== "T1" || f.detonation.y < tower.top - 0.3) continue;
    assert.equal(f.floor, tower.floors);
    return;
  }
  assert.fail("no release lands on the roof");
});

test("a Drill that clips a corner low down reports the floor it really reaches", () => {
  const { buildings, blocks } = setup(1);
  const tower = buildings.find((b) => b.id === "T1");
  for (let x = -60; x < 0; x += 0.25) {
    const f = forecastImpact(blocks, buildings, { x, y: FLIGHT.altitude, z: tower.z, vx: 10, vy: -1.2, vz: 0 }, "drill", 3);
    if (f.building?.id !== "T1") continue;
    assert.equal(f.floor, Math.max(0, Math.floor((f.detonation.y - storyY(0) + CITY.slab) / CITY.floorH)));
    return;
  }
});

test("a Drill that passes through the shelter on its way down is flagged by the pipper", () => {
  const { buildings, blocks } = setup(4);
  const f = forecastImpact(blocks, buildings, { x: -13.75, y: 24, z: 3.25, vx: 10, vy: -1.2, vz: 0 }, "drill", 1);
  assert.equal(f.building, null, "it lands in the street beyond the shelter");
  assert.ok(f.crossesShelter);
  assert.ok(!shelterStruck(blocks, buildings, f.impact, "drill", 0.6), "the detonation point alone looks safe");
});

test("climbing part of a stair takes time instead of snapping", () => {
  const keys = timeline([
    { x: 0, y: 2.6, z: 0, b: "T1", f: 1 },
    { x: 0, y: 4, z: 0, b: "T1", f: 1 },
  ]);
  assert.ok(keys[1].t - keys[0].t > 0.4);
});

test("slabs and walls shelter people until they are broken", () => {
  const { buildings, blocks } = setup(1);
  const tower = buildings.find((b) => b.id === "T1");
  const above = { x: tower.x + 0.5, y: storyY(3) + 1, z: tower.z + 0.5 };
  const below = { x: tower.x + 0.5, y: storyY(2) + 0.8, z: tower.z + 0.5 };
  assert.ok(lineBlocked(blocks, buildings, above, below));
  for (const block of blocks)
    if (block.b === tower.index && block.kind === "slab" && block.f === 3 && below.x >= block.min[0] && below.x <= block.max[0] && below.z >= block.min[2] && below.z <= block.max[2])
      block.alive = false;
  assert.ok(!lineBlocked(blocks, buildings, above, below));
});

test("Scatter covers a solid disc: no gap in the middle of the pattern", () => {
  const centre = { x: 3, z: -2 };
  const points = scatterPattern(centre);
  assert.equal(points.length, BOMBS.scatter.bomblets);
  assert.ok(points.some((p) => p.x === centre.x && p.z === centre.z));
  for (let r = 0; r <= 4.5; r += 0.5)
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      const q = { x: centre.x + Math.cos(a) * r, z: centre.z + Math.sin(a) * r };
      assert.ok(points.some((p) => Math.hypot(p.x - q.x, p.z - q.z) < BOMBS.scatter.radius), `gap at r=${r}`);
    }
});

test("the shelter rule is shared by the pipper warning and the abort", () => {
  const { buildings, blocks } = setup(4);
  const shelter = buildings.find((b) => b.kind === "shelter");
  const roof = { x: shelter.x, y: shelter.top, z: shelter.z };
  for (const kind of BOMB_ORDER) assert.ok(shelterStruck(blocks, buildings, roof, kind));
  // The muster point sits beside the shelter but a centred Shockwave is safe.
  const muster = resolvePlace(buildings, STRIKE_MISSIONS[4].groups[0].rally);
  assert.ok(!shelterStruck(blocks, buildings, muster, "shockwave", 0.6));
  assert.ok(!shelterStruck(blocks, buildings, { x: -30, y: 1, z: -30 }, "shockwave", 0.6));
});

test("combos, stars and formation slots", () => {
  assert.equal(comboBonus(1), 0);
  assert.equal(comboBonus(3), 360);
  assert.equal(strikeStars({ success: false, used: 1, par: 1, damaged: false }), 0);
  assert.equal(strikeStars({ success: true, used: 1, par: 1, damaged: false }), 3);
  assert.equal(strikeStars({ success: true, used: 3, par: 2, damaged: true }), 1);
  const slots = formationSlots(3, FLIGHT.wide);
  assert.deepEqual(slots.map((s) => s.z), [0, -FLIGHT.wide, FLIGHT.wide]);
});
