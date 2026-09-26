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
} from "../src/harbour-data.js";
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
