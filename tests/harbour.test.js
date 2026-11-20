import test from "node:test";
import assert from "node:assert/strict";
import {
  SHIPS,
  SHAPES,
  HARBOUR_MISSIONS,
  PATTERN_SPACING,
  RING_RADIUS,
  ROTATION_STEP,
  PERMANENT,
  patternPoints,
  patternDiagram,
  hullDistance,
  hullHits,
  predictHits,
  fleetPlan,
  shipPose,
  shipCourse,
  stationStatus,
  onLand,
  endgameObjective,
} from "../src/harbour-data.js";
import * as THREE from "three";
import { Fleet } from "../src/harbour.js";
import { StrikeOperation } from "../src/strike.js";
import { DIFFICULTY } from "../src/difficulty.js";
import { BOMBS, BOMB_ORDER, STRIKE_MISSIONS, forecastImpact, forecastPoints, groundAt, payloadTotal, FLIGHT } from "../src/strike-data.js";

const R = BOMBS.stick.radius;
const group = (mission, id) => HARBOUR_MISSIONS[mission].fleet.find((g) => g.id === id);
// Ships of a group where they hold at `station`, ready for predictHits.
const moored = (g, station = 0, time = 0) =>
  g.ships.map((cls, i) => {
    const plan = fleetPlan(g);
    const hold = plan.segments.find((s) => s.type === "hold" && s.station === station);
    const pose = shipPose(g, i, (g.start ?? 0) + hold.t0 + 0.5 + time, plan);
    return { cls, hp: SHIPS[cls].hp, pose, moored: pose.moored };
  });

test("pattern shapes: five-bomb stick, seven-bomb L and U, twelve-bomb ring and a 3 x 2 box, turned about their centre", () => {
  assert.equal(SHAPES.stick.cells.length, 5);
  assert.equal(SHAPES.ell.cells.length, 7);
  assert.equal(SHAPES.yoke.cells.length, 7);
  assert.equal(SHAPES.ring.cells.length, 12);
  assert.equal(SHAPES.box.cells.length, 6);
  const flat = patternPoints("stick", { x: 0, z: 0 }, 0);
  assert.ok(flat.every((p) => Math.abs(p.z) < 1e-9));
  const upright = patternPoints("stick", { x: 0, z: 0 }, 2 * ROTATION_STEP);
  assert.ok(upright.every((p) => Math.abs(p.x) < 1e-9));
  assert.ok(Math.abs(Math.max(...upright.map((p) => p.z)) - 2 * PATTERN_SPACING) < 1e-9);
  for (const p of patternPoints("ring", { x: 3, z: -2 }, 0)) assert.ok(Math.abs(Math.hypot(p.x - 3, p.z + 2) - RING_RADIUS) < 1e-9);
  // Every pattern bomb has a shape, a colour and ship damage; the HUD diagram is in cells.
  for (const kind of BOMB_ORDER.filter((k) => BOMBS[k].pattern)) {
    assert.ok(SHAPES[BOMBS[kind].pattern], kind);
    assert.equal(BOMBS[kind].shipDamage, 1);
  }
  assert.deepEqual(patternDiagram("stick", 0)[0], { x: -2, z: 0 });
});

test("hulls are segments: a blast by the bow counts, one a beam's width off the side does not", () => {
  const pose = { x: 0, z: 0, heading: 0 };
  assert.equal(hullDistance(pose, 4.4, { x: 2.2, z: 0 }), 0);
  assert.ok(Math.abs(hullDistance(pose, 4.4, { x: 0, z: 3 }) - 3) < 1e-9);
  // A bomblet reaches its own radius plus half the beam.
  assert.equal(hullHits("patrol", pose, [{ x: 0, z: R + 0.6 }], R), 1);
  assert.equal(hullHits("patrol", pose, [{ x: 0, z: R + 0.8 }], R), 0);
});

// Best one-release result for a pattern turned to `step`, searching aim points around `centre`,
// never counting a release that would touch a civilian.
function bestAim(ships, kind, step, centre, span = 6) {
  let best = 0;
  for (let dx = -span; dx <= span; dx += 0.5)
    for (let dz = -span; dz <= span; dz += 0.5) {
      const points = patternPoints(BOMBS[kind].pattern, { x: centre.x + dx, z: centre.z + dz }, step * ROTATION_STEP);
      const result = predictHits(ships, points, BOMBS[kind].radius);
      if (!result.civilian) best = Math.max(best, result.sinks);
    }
  return best;
}

test("each harbour group has a pattern and angle that sinks it in one release", () => {
  // [mission, group, kind, angle step, centre, lesson, station, ships it sinks (default: all)]
  // "angle": turned a quarter the wrong way, no aim point sinks the whole group.
  // "shape": no aim or angle of the other shapes sinks the whole group either.
  const cases = [
    [0, "column", "stick", 1, { x: 1, z: 3 }, "angle", 0],
    [0, "column", "stick", 2, { x: 15, z: 7 }, "angle", 1],
    [0, "moored", "stick", 0, { x: -9.95, z: -14.6 }, null, 0],
    [1, "lpier", "ell", 0, { x: -7.7, z: -3.4 }, "angle", 0],
    [1, "dock", "yoke", 4, { x: 12, z: -11.9 }, null, 0],
    [1, "frigate", "stick", 0, { x: -8, z: 14 }, "angle", 0],
    [2, "raft", "box", 0, { x: 10.2, z: -8 }, null, 0],
    [2, "cinder", "stick", 0, { x: -10, z: -9.5 }, "angle", 0],
    // The west and east basins (2.4): a horizontal Stick per boatyard row, vertical Sticks for
    // lines abreast, diagonal ones for wheeling columns, L and U slips, rafts and a raider ring.
    [0, "boatyard", "stick", 0, { x: -56, z: -9 }, null, 0, 4],
    [0, "boatyard", "stick", 0, { x: -56, z: -2 }, null, 0, 4],
    [0, "boatyard", "stick", 0, { x: -56, z: 5 }, null, 0, 4],
    [0, "westColumn", "stick", 2, { x: -39, z: 2 }, "angle", 0],
    [0, "westColumn", "stick", 1, { x: -39, z: 4 }, "angle", 1],
    [0, "lineA", "stick", 2, { x: 40, z: -2 }, "angle", 0],
    [0, "lineB", "stick", 2, { x: 52, z: 6 }, "angle", 0],
    [0, "echelon", "stick", 1, { x: 62, z: 12 }, null, 0],
    [1, "westSlip", "ell", 0, { x: -52.8, z: -2.2 }, null, 0],
    [1, "eastSlip", "ell", 4, { x: 52.8, z: 2.2 }, null, 0],
    [1, "eastDock", "yoke", 4, { x: 38, z: -9 }, null, 0],
    [1, "westColumn", "stick", 2, { x: -38, z: 0 }, "angle", 0],
    [1, "eastLine", "stick", 2, { x: 38, z: 10 }, "angle", 0],
    [2, "westRaftA", "box", 0, { x: -56, z: -6 }, null, 0],
    [2, "westRaftB", "box", 0, { x: -56, z: 6 }, null, 0],
    [2, "eastRaft", "box", 0, { x: 54, z: -8 }, null, 0],
    [2, "westRing", "ring", 0, { x: -40, z: 5 }, null, 0],
    [2, "eastColumn", "stick", 0, { x: 42, z: 6 }, "angle", 0],
    [2, "patrolLine", "stick", 0, { x: 58, z: 12 }, "angle", 0],
    // The far basins and the outer roads (2.5), shared by every harbour.
    [0, "depotRows", "stick", 0, { x: -116.4, z: -9 }, null, 0, 5],
    [0, "depotRows", "stick", 0, { x: -116.4, z: 7 }, null, 0, 5],
    [0, "yardRaftA", "box", 0, { x: 84, z: -8 }, null, 0],
    [0, "yardLine", "stick", 2, { x: 100, z: 14 }, "angle", 0],
    [0, "roadsLine", "stick", 2, { x: -60, z: 64 }, "angle", 0],
    [0, "roadsRing", "ring", 0, { x: 70, z: 50 }, null, 0],
    [0, "roadsRaft", "box", 0, { x: 104, z: 38 }, null, 0],
    [0, "roadsPatrol", "stick", 0, { x: 104, z: 62 }, "angle", 0],
  ];
  for (const [m, id, kind, step, centre, lesson, station, expect] of cases) {
    const g = group(m, id);
    const ships = moored(g, station);
    const want = expect ?? g.ships.length;
    const points = patternPoints(BOMBS[kind].pattern, centre, step * ROTATION_STEP);
    // Ships that can sidestep do so before the bombs land; the fit must still sink them all.
    const result = predictHits(ships, points, BOMBS[kind].radius, 1, 2.1);
    assert.equal(result.sinks, want, `1.${m + 7} ${id}: ${result.sinks}/${want} sink`);
    // Civilians near the group count too: the right fit must spare them.
    const civilians = HARBOUR_MISSIONS[m].fleet.filter((c) => c.ships.every((cls) => SHIPS[cls].civilian) && c.stations[0].hold >= PERMANENT);
    const all = [...ships, ...civilians.flatMap((c) => moored(c))];
    assert.ok(!predictHits(all, points, BOMBS[kind].radius).civilian, `1.${m + 7} ${id}: the fit touches a civilian`);
    if (lesson === "angle") {
      const wrong = bestAim(all, kind, step + 2, centre);
      assert.ok(wrong < want, `1.${m + 7} ${id} also sinks ${want} turned 90°`);
    }
  }
});

// How many aim points (0.25 m apart, any of the eight angles) sink the whole group without touching a civilian.
function sweetSpot(ships, n, kind, centre) {
  let count = 0;
  for (let step = 0; step < 8; step++)
    for (let dx = -8; dx <= 8; dx += 0.25)
      for (let dz = -8; dz <= 8; dz += 0.25) {
        const r = predictHits(ships, patternPoints(BOMBS[kind].pattern, { x: centre.x + dx, z: centre.z + dz }, step * ROTATION_STEP), BOMBS[kind].radius);
        if (!r.civilian && r.sinks === n) count++;
      }
  return count;
}

test("the L is the natural fit for the L pier: far more aim points sink all four than with any other shape", () => {
  const g = group(1, "lpier");
  const ships = moored(g);
  const centre = { x: -7.7, z: -3.4 };
  const ell = sweetSpot(ships, 4, "ell", centre);
  assert.ok(ell > 0);
  for (const rival of ["stick", "yoke", "box"]) {
    const other = sweetSpot(ships, 4, rival, centre);
    assert.ok(ell >= other * 4, `L ${ell} vs ${rival} ${other}`);
  }
});

test("the O-Ring centred on the Island Belle breaks the escort ring and spares the ferry", () => {
  const mission = HARBOUR_MISSIONS[2];
  const ring = group(2, "ring"),
    ferry = group(2, "ferry");
  for (const t of [0, 7, 19, 33]) {
    const ships = [...moored(ring, 0, t), ...moored(ferry, 0, t)];
    const centre = { x: ferry.stations[0].x, z: ferry.stations[0].z };
    const result = predictHits(ships, patternPoints("ring", centre, 0), BOMBS.ring.radius);
    assert.ok(!result.civilian, `the ferry is safe at t=${t}`);
    assert.ok(result.sinks >= 4, `the ring sinks ${result.sinks} of 5 at t=${t}`);
    // Well off-centre the ring clips the ferry, which is what the blue pipper warns about.
    const off = predictHits(ships, patternPoints("ring", { x: centre.x + 2, z: centre.z }, 0), BOMBS.ring.radius);
    assert.ok(off.civilian, `2 m off-centre the ring hits the ferry at t=${t}`);
  }
  assert.ok(mission.fleet.find((g) => g.id === "ferry").freed.after === "ring");
});

// Oriented hull rectangles, grown by `pad`, overlap unless an axis separates them.
function rectangle(p, def, pad) {
  const fx = Math.cos(p.heading),
    fz = Math.sin(p.heading);
  const hl = def.length / 2 + pad,
    hb = def.beam / 2 + pad;
  return [
    [p.x + fx * hl - fz * hb, p.z + fz * hl + fx * hb],
    [p.x + fx * hl + fz * hb, p.z + fz * hl - fx * hb],
    [p.x - fx * hl + fz * hb, p.z - fz * hl - fx * hb],
    [p.x - fx * hl - fz * hb, p.z - fz * hl + fx * hb],
  ];
}
function overlap(a, b) {
  for (const poly of [a, b])
    for (let i = 0; i < 4; i++) {
      const [x1, z1] = poly[i],
        [x2, z2] = poly[(i + 1) % 4];
      const nx = z2 - z1,
        nz = x1 - x2;
      const project = (q) => q.map(([x, z]) => x * nx + z * nz);
      const pa = project(a),
        pb = project(b);
      if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
    }
  return true;
}

test("ships sail smoothly, never onto a quay, and never through each other", () => {
  for (const [m, mission] of HARBOUR_MISSIONS.entries()) {
    const plans = mission.fleet.map((g) => fleetPlan(g));
    let previous = null;
    for (let t = 0; t <= 240; t += 0.5) {
      const hulls = [];
      mission.fleet.forEach((g, gi) =>
        g.ships.forEach((cls, i) => {
          const p = shipCourse(g, i, t, plans[gi]);
          const def = SHIPS[cls];
          for (const end of [-0.5, 0, 0.5]) {
            const x = p.x + Math.cos(p.heading) * def.length * end,
              z = p.z + Math.sin(p.heading) * def.length * end;
            assert.ok(!onLand(mission.harbour.land, x, z), `1.${m + 7} ${g.id}#${i} runs aground at t=${t}`);
          }
          hulls.push({ key: `${g.id}#${i}`, p, def });
        }),
      );
      for (let a = 0; a < hulls.length; a++)
        for (let b = a + 1; b < hulls.length; b++) {
          const A = hulls[a],
            B = hulls[b];
          if (Math.hypot(A.p.x - B.p.x, A.p.z - B.p.z) > (A.def.length + B.def.length) / 2 + 1) continue;
          assert.ok(!overlap(rectangle(A.p, A.def, 0.1), rectangle(B.p, B.def, 0.1)), `1.${m + 7} ${A.key} and ${B.key} collide at t=${t}`);
        }
      if (previous)
        hulls.forEach((h, i) => {
          const step = Math.hypot(h.p.x - previous[i].p.x, h.p.z - previous[i].p.z);
          assert.ok(step < 1.2, `1.${m + 7} ${h.key} jumps ${step.toFixed(2)} m at t=${t}`);
        });
      previous = hulls;
    }
  }
});

test("a freed ferry's run to safety stays off the quays and clear of every other hull", () => {
  for (const mission of HARBOUR_MISSIONS)
    for (const g of mission.fleet.filter((x) => x.freed)) {
      const from = g.stations[0];
      for (const freedAt of [0, 20, 45, 70, 95, 120]) {
        // The runtime's freed timetable: from where it is to the freed station, then stay.
        const route = {
          ...g,
          start: freedAt,
          speed: g.freed.speed,
          stations: [{ ...from, hold: 0.01, slots: [{ x: from.x, z: from.z, heading: from.heading }] }, ...g.freed.stations.map((s) => ({ ...s, hold: PERMANENT }))],
        };
        const plan = fleetPlan(route);
        const others = mission.fleet.filter((x) => x !== g && !x.ships.every((cls) => SHIPS[cls].civilian) && x.id !== g.freed.after);
        for (let t = freedAt; t <= freedAt + 60; t += 0.5) {
          const p = shipCourse(route, 0, t, plan);
          assert.ok(!onLand(mission.harbour.land, p.x, p.z), `the freed ferry runs aground at t=${t}`);
          for (const o of others)
            o.ships.forEach((cls, i) => {
              const q = shipCourse(o, i, t);
              assert.ok(!overlap(rectangle(p, SHIPS.ferry, 0.1), rectangle(q, SHIPS[cls], 0.1)), `the freed ferry hits ${o.id} at t=${t}`);
            });
        }
      }
    }
});

test("every harbour is crowded: thirty-odd boats, a quota to sink and the key ships named", () => {
  for (const m of HARBOUR_MISSIONS) {
    const hostile = m.fleet.flatMap((g) => g.ships).filter((cls) => !SHIPS[cls].civilian).length;
    // 2.5: twice as long and wide, ~100 boats; more to choose from, not a longer grind.
    assert.ok(hostile >= 90, `${m.lesson}: ${hostile} boats`);
    assert.ok(m.quota >= hostile * 0.33 && m.quota <= hostile * 0.5, `${m.lesson}: quota ${m.quota} of ${hostile}`);
    for (const id of m.required) assert.ok(m.fleet.some((g) => g.id === id), `${m.lesson}: key group ${id}`);
    // The basins either side of the old harbour, and the outer roads, are reached by the sliding camera.
    const b = m.harbour.bounds;
    assert.ok(m.harbour.wide && b.maxX - b.minX >= 270 && b.maxZ - b.minZ >= 2 * 40.5);
    // Enough bombs to reach the quota at five sinks a release, with room to miss.
    assert.ok(payloadTotal(m.aircraft) * 5 >= m.quota * 1.5, `${m.lesson}: payload`);
  }
});

test("labelled stations count down, and permanent ones are always on", () => {
  const column = group(0, "column");
  const plan = fleetPlan(column);
  const first = stationStatus(column, 0, 1, plan);
  assert.ok(first.active && first.remaining > 20);
  const later = stationStatus(column, 1, 1, plan);
  assert.equal(column.stations[1].heading - column.stations[0].heading, 45, "the column wheels to a new angle");
  assert.ok(!later.active && later.next > 0);
  assert.deepEqual(stationStatus(group(1, "dock"), 0, 99), { active: true, remaining: Infinity, next: 0 });
  assert.ok(group(1, "dock").stations[0].hold >= PERMANENT);
});

test("harbour missions sit in Chapter 1 with enough payload, their own lessons and sea-level bombs", () => {
  assert.equal(STRIKE_MISSIONS.length, 9);
  assert.deepEqual(STRIKE_MISSIONS.slice(6).map((m) => m.lesson), HARBOUR_MISSIONS.map((m) => m.lesson));
  // Pattern bomblets keep their size: a harbour mission's power is 1.
  assert.ok(STRIKE_MISSIONS.slice(6).every((m) => m.power === 1));
  assert.deepEqual(HARBOUR_MISSIONS.map((m) => m.lesson), ["stick", "shapes", "ring"]);
  for (const m of HARBOUR_MISSIONS) {
    assert.ok(m.par <= payloadTotal(m.aircraft));
    assert.ok(m.aircraft.some((a) => a.payload[m.select] > 0), "opens on a loaded pattern");
    assert.equal(groundAt(m.harbour.land, 0, 0), 0.05);
    assert.equal(groundAt(m.harbour.land, 0, -20), 1);
  }
  // A pattern bomb over water bursts, lands at sea level, and its forecast carries the angle and time.
  const release = { x: -20, y: FLIGHT.altitude, z: 3, vx: FLIGHT.speed, vy: -1.2, vz: 0 };
  const f = forecastImpact([], [], release, "stick", 1, { land: HARBOUR_MISSIONS[0].harbour.land, angle: ROTATION_STEP });
  assert.ok(Math.abs(f.impact.y - 0.05) < 1e-9);
  assert.ok(f.time > 1.5 && f.time < 3.5, `falls in ${f.time}s`);
  const points = forecastPoints({ ...f, kind: "stick" });
  assert.equal(points.length, 5);
  assert.ok(Math.abs(points[4].x - points[0].x - (points[4].z - points[0].z)) < 1e-9, "turned 45°");
});

// 5.0's onLand, kept here as the reference for the flat-array version (5.1 P1).
const onLandBefore = (land, x, z) => Boolean(land?.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1));

test("onLand answers as 5.0 did on a 5 cm grid within a metre of every quay and pier edge", () => {
  let points = 0,
    land = 0;
  for (const mission of HARBOUR_MISSIONS) {
    const rects = mission.harbour.land;
    const check = (x, z) => {
      const before = onLandBefore(rects, x, z);
      assert.equal(onLand(rects, x, z), before, `(${x}, ${z})`);
      points++;
      if (before) land++;
    };
    for (const [x0, z0, x1, z1] of rects) {
      // Across each edge (-1 m to +1 m, the edge itself exactly) and along it.
      for (let i = -20; i <= 20; i++) {
        const across = i * 0.05;
        for (let x = x0 - 1; x <= x1 + 1; x += 0.05) {
          check(x, z0 + across);
          check(x, z1 + across);
        }
        for (let z = z0 - 1; z <= z1 + 1; z += 0.05) {
          check(x0 + across, z);
          check(x1 + across, z);
        }
      }
    }
  }
  assert.ok(points > 100000 && land > 0 && land < points, `${points} points, ${land} on land`);
  assert.equal(onLand(null, 0, 0), false);
  assert.equal(onLand([], 0, 0), false);
});

// ---------------------------------------------------------------- 5.1 C1: the harbour endgame

// A real Fleet for a harbour mission on a stub operation: no renderer, the same schedules.
const GREY = new THREE.SpriteMaterial();
function stubFleet(index) {
  const toasts = [],
    said = [];
  const ring = () => ({ material: { opacity: 1 }, scale: { setScalar() {} } });
  const game = {
    time: 0,
    status: "playing",
    score: 0,
    view: { assets: { has: () => false }, ring, disposeObject() {} },
    entity: (type, model, position, o) => ({ type, position, mesh: new THREE.Object3D(), hp: o.hp, radius: o.radius }),
    puff() {},
    shockRing() {},
    blast() {},
    notify: (type, text) => toasts.push(text),
  };
  const op = {
    game,
    layout: STRIKE_MISSIONS[index],
    aircraft: [],
    marker: () => new THREE.SpriteMaterial(),
    shipMarker: () => new THREE.SpriteMaterial(),
    standDownMarker: () => GREY,
    createShipFlak: (ship) => ({ state: "lock", solution: {}, warning: { visible: true }, mounted: ship, position: new THREE.Vector3() }),
    destroyMounted() {},
    endgame: () => said.push("quota"),
  };
  const fleet = new Fleet(op);
  return { fleet, game, op, toasts, said };
}
// Sink the quota from the boats that don't count (the first ones in fleet order).
const meetQuota = (fleet) => {
  for (const ship of fleet.hostile().filter((s) => !s.group.key).slice(0, fleet.needed())) fleet.sinkShip(ship);
};

test("5.1 C1: once the quota is met with key hulls afloat, every other hostile boat stands down", () => {
  for (const index of [6, 7, 8]) {
    const { fleet, game, said } = stubFleet(index);
    assert.equal(fleet.quotaMet(), false);
    fleet.update(1 / 120);
    assert.equal(fleet.endgame, false);
    meetQuota(fleet);
    assert.ok(fleet.quotaMet());
    game.time = 3;
    fleet.update(1 / 120);
    assert.ok(fleet.endgame, `mission ${index}`);
    const afloat = fleet.ships.filter((s) => !s.dead && !s.civilian);
    const down = afloat.filter((s) => s.standDown);
    assert.deepEqual(fleet.standDown, { at: 3, ships: down.length });
    assert.equal(down.length, afloat.filter((s) => !s.group.key).length);
    assert.ok(down.every((s) => s.marker.material === GREY && (!s.nest || (s.nest.state === "idle" && !s.nest.warning.visible))));
    assert.ok(afloat.filter((s) => s.group.key).every((s) => !s.standDown && s.keyRing));
    assert.ok(fleet.ships.filter((s) => s.civilian).every((s) => !s.standDown));
    assert.deepEqual(said, ["quota"]);
    // Only the key ships count now, and they are all the outcome waits for.
    assert.equal(fleet.left(), fleet.keysAfloat());
    assert.ok(fleet.predicted(game.time).every((p) => !p.ship.standDown));
    const targets = StrikeOperation.prototype.targets.call({ trucks: [], fleet, masts: [], aa: [], enemies: [] });
    assert.ok(targets.length === fleet.keysAfloat() && targets.every((s) => s.group.key));
    const keyIds = fleet.groups.filter((g) => g.key).map((g) => g.data.id);
    assert.ok(fleet.events().length > 0 && fleet.events().every((e) => keyIds.some((id) => e.id.startsWith(`${id}-`))));
  }
  // With the key hulls already sunk, meeting the quota is simply the win: no endgame.
  const { fleet } = stubFleet(7);
  for (const ship of fleet.hostile().filter((s) => s.group.key)) fleet.sinkShip(ship);
  meetQuota(fleet);
  fleet.update(1 / 120);
  assert.equal(fleet.endgame, false);
  assert.equal(fleet.standDown, null);
});

test("5.1 C1: a boat standing down keeps its timetable for 240 s", () => {
  const a = stubFleet(6),
    b = stubFleet(6);
  meetQuota(a.fleet);
  meetQuota(b.fleet);
  b.fleet.startEndgame = () => {};
  let compared = 0;
  for (let step = 1; step <= 240 * 30; step++) {
    a.game.time = b.game.time = step / 30;
    a.fleet.update(1 / 30);
    b.fleet.update(1 / 30);
    if (step % 300) continue;
    a.fleet.ships.forEach((ship, i) => {
      if (!ship.standDown) return;
      const other = b.fleet.ships[i];
      assert.equal(ship.position.x, other.position.x);
      assert.equal(ship.position.z, other.position.z);
      assert.equal(ship.heading, other.heading);
      compared++;
    });
  }
  assert.ok(a.fleet.endgame && !b.fleet.endgame);
  assert.ok(compared > 1000, `${compared} poses compared`);
});

test("5.1 C1: a boat standing down never fires; a key hull's flak still does", () => {
  const nest = (mounted) => ({
    mounted,
    dead: false,
    state: "idle",
    cooldown: 0,
    lock: 0,
    position: new THREE.Vector3(0, 2, 0),
    turret: null,
    warning: { material: { opacity: 0 } },
    beam: { visible: false, geometry: { attributes: { position: { setXYZ() {}, needsUpdate: false } } } },
  });
  const run = (mounted) => {
    const aircraft = { alive: true, callsign: "Kestrel One", mesh: { position: new THREE.Vector3(2, 24, 0) }, velocity: new THREE.Vector3(1, 0, 0) };
    const op = Object.create(StrikeOperation.prototype);
    Object.assign(op, {
      game: {
        time: 0,
        hitChance: 1,
        hitRoll: () => true,
        view: { sphere: (p) => ({ position: p.clone() }), disposeObject() {} },
        sound() {},
        blast() {},
        audio: { play() {} },
      },
      flight: { phase: "pass" },
      aa: [nest(mounted)],
      aircraft: [aircraft],
      shells: [],
      say() {},
      hitAircraft() {},
    });
    let fired = 0;
    for (let i = 0; i < 120 * 10; i++) {
      op.game.time = i / 120;
      op.updateFlak(1 / 120);
      fired = Math.max(fired, op.shells.length);
    }
    return { fired, nest: op.aa[0] };
  };
  const down = run({ standDown: true });
  assert.equal(down.fired, 0);
  assert.equal(down.nest.state, "idle");
  assert.ok(run({ standDown: false }).fired > 0, "the control nest fires");
});

test("5.1 C1: sinking a boat that stands down scores nothing, adds nothing to the combo and says so", () => {
  const { fleet, game, toasts } = stubFleet(6);
  meetQuota(fleet);
  fleet.update(1 / 120);
  const ship = fleet.ships.find((s) => s.standDown && s.hp === 1);
  const score = game.score;
  const sunk = fleet.hit({ x: ship.position.x, y: 0.05, z: ship.position.z }, { radius: 1.3 }, 1);
  assert.ok(ship.dead, "it still sinks");
  assert.equal(game.score, score);
  // detonate adds what hit() returns to the kills and the combo.
  assert.ok(!sunk.includes(ship));
  assert.ok(toasts.includes("NOT A TARGET / SAVE YOUR BOMBS"));
  // A key hull still scores.
  const key = fleet.ships.find((s) => s.group.key && !s.dead);
  key.hp = 1;
  const before = game.score;
  const keySunk = fleet.hit({ x: key.position.x, y: 0.05, z: key.position.z }, { radius: 1.3 }, 1);
  assert.ok(keySunk.includes(key) && game.score === before + key.def.score);
});

test("5.1 C1: the endgame objective names what is left, counted only for groups of more than one", () => {
  assert.equal(endgameObjective([{ title: "THE CHANNEL COLUMN", left: 2, size: 4 }]), "QUOTA MET · SINK THE CHANNEL COLUMN (2 LEFT)");
  assert.equal(endgameObjective([{ title: "THE CHANNEL COLUMN", left: 1, size: 4 }]), "QUOTA MET · SINK THE CHANNEL COLUMN (1 LEFT)");
  assert.equal(endgameObjective([{ title: "THE AA FRIGATE", left: 1, size: 1 }]), "QUOTA MET · SINK THE AA FRIGATE");
  assert.equal(
    endgameObjective([
      { title: "THE ESCORT RING", left: 3, size: 5 },
      { title: "CINDER", left: 1, size: 1 },
    ]),
    "QUOTA MET · SINK THE ESCORT RING (3 LEFT) AND CINDER",
  );
  assert.equal(
    endgameObjective([
      { title: "THE ESCORT RING", left: 0, size: 5 },
      { title: "CINDER", left: 1, size: 1 },
    ]),
    "QUOTA MET · SINK CINDER",
  );
  // Every key group has its title, and the fleet rewrites the line as key hulls sink.
  for (const index of [6, 7, 8]) for (const id of STRIKE_MISSIONS[index].required) assert.ok(STRIKE_MISSIONS[index].fleet.find((g) => g.id === id).title, id);
  const { fleet } = stubFleet(8);
  meetQuota(fleet);
  fleet.update(1 / 120);
  assert.equal(fleet.objectiveText, "QUOTA MET · SINK THE ESCORT RING (5 LEFT) AND CINDER");
  fleet.groups
    .find((g) => g.data.id === "ring")
    .ships.slice(0, 2)
    .forEach((s) => fleet.sinkShip(s));
  assert.equal(fleet.objectiveText, "QUOTA MET · SINK THE ESCORT RING (3 LEFT) AND CINDER");
});

test("5.1 C1: LAST RUN gives the lead live aircraft a Stick per key hull afloat (two at most), once, on Easy and Normal", () => {
  const lastRun = (mode, keys, endgame = true) => {
    const said = [],
      banners = [];
    const op = Object.create(StrikeOperation.prototype);
    Object.assign(op, {
      game: { time: 231.234, mode: DIFFICULTY[mode], notify: (type, text) => banners.push(text) },
      fleet: { endgame, keysAfloat: () => keys },
      aircraft: [
        { alive: false, payload: { stick: 0 } },
        { alive: true, payload: { stick: 0, ell: 0 } },
      ],
      resupply: null,
      select(kind) {
        this.selected = kind;
      },
      say: (key) => said.push(key),
    });
    const first = op.lastRun();
    return { first, again: op.lastRun(), op, said, banners };
  };
  const normal = lastRun("normal", 4);
  assert.ok(normal.first && !normal.again);
  assert.deepEqual(normal.op.resupply, { at: 231.23, sticks: 2 });
  assert.equal(normal.op.aircraft[1].payload.stick, 2);
  assert.equal(normal.op.selected, "stick");
  assert.deepEqual(normal.said, ["lastRun"]);
  assert.deepEqual(normal.banners, ["LAST RUN"]);
  assert.equal(lastRun("easy", 1).op.aircraft[1].payload.stick, 1);
  for (const mode of ["hard", "crazy"]) {
    const r = lastRun(mode, 4);
    assert.ok(!r.first && r.op.resupply === null, mode);
  }
  assert.ok(!lastRun("normal", 0).first, "no key hull afloat");
  assert.ok(!lastRun("normal", 2, false).first, "not in the endgame");
});

test("5.1 C1: a mark on a boat that stands down is dropped; a mark on a key hull stays", () => {
  for (const key of [false, true]) {
    const { fleet, op } = stubFleet(6);
    const toasts = [];
    const strike = Object.create(StrikeOperation.prototype);
    // (The last one: meetQuota sinks the first ones.)
    const target = fleet.ships.findLast((s) => !s.civilian && s.group.key === key);
    Object.assign(strike, { game: { notify: (type, text) => toasts.push(text) }, aim: { target }, say() {} });
    op.endgame = () => strike.endgame();
    meetQuota(fleet);
    fleet.update(1 / 120);
    if (key) assert.ok(strike.aim?.target === target && toasts.length === 0);
    else assert.ok(strike.aim === null && toasts.includes("MARK DROPPED / NOT A TARGET"));
  }
});
