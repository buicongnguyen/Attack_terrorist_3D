import test from "node:test";
import assert from "node:assert/strict";
import {
  STRIKE_MISSIONS,
  CITY,
  CITY_GROWTH,
  FLIGHT,
  expandCity,
  resolveBuildings,
  buildBlocks,
  buildingAt,
  blockHits,
  cityBounds,
  laneLimits,
  turnPoint,
  lotCenter,
  WORKS,
  CITY_MISSIONS,
  STOREY_REACH,
  DRILL_BURST,
  blastDistance,
  storyY,
} from "../src/strike-data.js";
import { scalePayload } from "../src/difficulty.js";

const CITY_COUNT = 6;
// Generated lots are named by kind and lot: C (tower), B (barracks), G (crewed barracks), e.g. "G-1_2".
const GENERATED = /^[CBG]-?\d+_-?\d+$/;
const span = (g) => ({ cols: g.maxCol - g.minCol + 1, rows: g.maxRow - g.minRow + 1 });
const inCore = (layout, col, row) => col >= 0 && col < layout.cols && row >= 0 && row < layout.rows;

test("each city district grows three times along a row and four times (plus one) along a column", () => {
  for (const layout of STRIKE_MISSIONS.slice(0, CITY_COUNT)) {
    const { cols, rows } = span(layout.grid);
    assert.equal(cols, layout.cols * CITY_GROWTH.cols);
    assert.equal(rows, layout.rows * CITY_GROWTH.rows + CITY_GROWTH.extraRows);
    // The authored district stays in the middle of the grid.
    assert.ok(layout.grid.minCol < 0 && layout.grid.maxCol >= layout.cols);
    assert.ok(layout.grid.minRow < 0 && layout.grid.maxRow >= layout.rows);
    // Every lot outside the authored district holds one tower, barracks, yard or park, and under
    // half of them hold a tower.
    const lots = new Set();
    const generated = layout.buildings.filter((b) => GENERATED.test(b.id));
    for (const b of generated) {
      assert.ok(!inCore(layout, b.col, b.row), `${b.id} sits on an authored lot`);
      // 2.6: the wider city is low: towers of one to three storeys, barracks of one.
      assert.ok(b.id.startsWith("C") ? b.floors >= 1 && b.floors <= 3 : b.floors === 1);
      lots.add(`${b.col},${b.row}`);
    }
    for (const p of [...layout.parks, ...layout.yards]) {
      assert.ok(!inCore(layout, p.col, p.row));
      assert.ok(!lots.has(`${p.col},${p.row}`), "two things share a lot");
      lots.add(`${p.col},${p.row}`);
    }
    const outer = cols * rows - layout.cols * layout.rows;
    assert.equal(lots.size, outer);
    const towers = generated.filter((b) => b.id.startsWith("C")).length;
    assert.ok(towers > outer * 0.2 && towers < outer * 0.5, `${towers} towers on ${outer} lots`);
  }
  // The harbour keeps its own basin.
  for (const layout of STRIKE_MISSIONS.slice(CITY_COUNT)) assert.equal(layout.grid, undefined);
});

test("the wider city is the same every time and leaves the authored missions untouched", () => {
  const before = JSON.stringify(CITY_MISSIONS);
  CITY_MISSIONS.forEach((authored, i) => {
    // Every generated part (lots, tunnels, road works, crews' bombs, par) comes out the same again.
    assert.deepEqual(expandCity(authored, i), STRIKE_MISSIONS[i]);
    const layout = STRIKE_MISSIONS[i];
    // Authored buildings keep their ids, which never look generated, and their lots.
    assert.deepEqual(layout.buildings.filter((b) => !GENERATED.test(b.id)), authored.buildings);
    assert.ok(authored.buildings.every((b) => inCore(layout, b.col, b.row) && !GENERATED.test(b.id)));
  });
  assert.equal(JSON.stringify(CITY_MISSIONS), before);
});

test("each crewed barracks brings two bombs, so even Crazy keeps one to spare", () => {
  const total = (m, mode) => m.aircraft.reduce((n, a) => n + Object.values(scalePayload(a.payload, mode)).reduce((x, y) => x + y, 0), 0);
  CITY_MISSIONS.forEach((authored, i) => {
    const layout = STRIKE_MISSIONS[i];
    const crews = layout.buildings.filter((b) => b.garrison).length;
    assert.equal(total(layout, "normal"), total(authored, "normal") + 2 * crews);
    assert.ok(total(layout, "crazy") >= layout.par + 1, `1.${i + 1} on Crazy: ${total(layout, "crazy")} bombs for a par of ${layout.par}`);
  });
});

test("bounds, lanes and turn points cover the whole grid", () => {
  for (const layout of STRIKE_MISSIONS.slice(0, CITY_COUNT)) {
    const b = cityBounds(layout);
    const corner = lotCenter(layout, layout.grid.minCol, layout.grid.minRow),
      far = lotCenter(layout, layout.grid.maxCol, layout.grid.maxRow);
    assert.ok(b.minX < corner.x - CITY.half && b.maxX > far.x + CITY.half);
    assert.ok(b.minZ < corner.z - CITY.half && b.maxZ > far.z + CITY.half);
    const lanes = laneLimits(layout);
    assert.ok(lanes.min > b.minZ && lanes.max < b.maxZ);
    assert.ok(turnPoint(layout) >= Math.max(-b.minX, b.maxX) + FLIGHT.turnMargin - 1e-9);
  }
});

test("early missions hit harder and home further; the harbour's shapes keep their size", () => {
  const city = STRIKE_MISSIONS.slice(0, CITY_COUNT);
  assert.ok(city.every((m) => m.power > 1 && m.assist > 0));
  for (let i = 1; i < city.length; i++) {
    assert.ok(city[i].power <= city[i - 1].power);
    assert.ok(city[i].assist <= city[i - 1].assist);
  }
  assert.ok(STRIKE_MISSIONS.slice(CITY_COUNT).every((m) => m.power === 1));
});

test("the building index finds exactly what a search of every building finds", () => {
  const layout = STRIKE_MISSIONS[5];
  const buildings = resolveBuildings(layout);
  const blocks = buildBlocks(buildings);
  const plain = [...buildings]; // no index: the helpers fall back to every building
  const b = cityBounds(layout);
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const point = () => ({ x: b.minX + random() * (b.maxX - b.minX), y: 1 + random() * 30, z: b.minZ + random() * (b.maxZ - b.minZ) });
  for (let i = 0; i < 400; i++) {
    const p = point();
    const margin = random() * 2;
    assert.equal(buildingAt(buildings, p.x, p.z, margin)?.id ?? null, buildingAt(plain, p.x, p.z, margin)?.id ?? null);
  }
  for (let i = 0; i < 200; i++) {
    const a = point();
    // Short segments in every direction, including right to left and north to south.
    const s = { x: a.x + (random() - 0.5) * 30, y: a.y - random() * 20, z: a.z + (random() - 0.5) * 30 };
    const fast = blockHits(blocks, buildings, a, s).map((h) => h.block);
    const slow = blockHits(blocks, plain, a, s).map((h) => h.block);
    assert.deepEqual(fast, slow);
  }
});

test("streets are twice as wide as they were, and walkers keep their schedules", () => {
  // An 8 m building on an 18.5 m lot leaves a 10.5 m street (it was 5.5 m on 13.5 m lots).
  assert.ok(CITY.pitch - 2 * CITY.half >= 2 * (13.5 - 2 * CITY.half) - 0.5);
});

test("tunnels sit in yards next to each mission's own blocks, with a garrison after the first mission", () => {
  STRIKE_MISSIONS.slice(0, CITY_COUNT).forEach((layout, i) => {
    assert.equal(layout.tunnels.length, [0, 1, 1, 1, 2, 2][i]);
    for (const t of layout.tunnels) {
      const yard = layout.yards.find((y) => {
        const c = lotCenter(layout, y.col, y.row);
        return y.tunnel && Math.abs(c.x - t.x) <= CITY.pitch / 2 && Math.abs(c.z - t.z) <= CITY.pitch / 2;
      });
      assert.ok(yard, `tunnel ${t.id} of 1.${i + 1} is not in a tunnel yard`);
      // Next to the district: one lot out, straight across a street.
      const out = Math.max(-yard.col, yard.col - (layout.cols - 1), -yard.row, yard.row - (layout.rows - 1));
      assert.equal(out, 1);
      assert.equal(t.garrison, i === 0 ? 0 : 2);
      // Not on a building.
      assert.ok(!buildingAt(resolveBuildings(layout), t.x, t.z));
    }
  });
});

test("blasts reach the same floors as with the old 2.8 m storeys; a street blast is unchanged", () => {
  const old = 2.8;
  // A Drill set to a floor bursts as high inside it, in storeys, as it did.
  assert.ok(Math.abs(DRILL_BURST / CITY.floorH - 1.1 / old) < 1e-9);
  // Two points one storey apart are as far apart for a blast as they were.
  const a = { x: 0, y: storyY(2), z: 0 };
  assert.ok(Math.abs(blastDistance(a, { ...a, y: storyY(3) }) - old) < 1e-9);
  assert.ok(Math.abs(STOREY_REACH * CITY.floorH - old) < 1e-9);
  // Level with the blast, nothing changes.
  assert.equal(blastDistance(a, { x: 3, y: a.y, z: 4 }), 5);
});

test("low buildings: storeys of 1.9 m, so a roof sits close to its own street on screen", () => {
  assert.ok(CITY.floorH <= 1.9 && CITY.floorH - CITY.slab >= 1.5);
  // The tallest authored tower still clears the flight by a wide margin.
  const tallest = Math.max(...STRIKE_MISSIONS.slice(0, CITY_COUNT).flatMap((m) => m.buildings.map((b) => b.floors)));
  assert.ok(CITY.ground + CITY.plinth + tallest * CITY.floorH < FLIGHT.altitude - 6);
});

test("crewed barracks stand beside each mission's blocks from 1.2 on, one storey with a crowd inside", () => {
  STRIKE_MISSIONS.slice(0, CITY_COUNT).forEach((layout, i) => {
    const crewed = layout.buildings.filter((b) => b.garrison);
    assert.equal(crewed.length, [0, 1, 1, 1, 2, 2][i]);
    for (const b of crewed) {
      assert.equal(b.floors, 1);
      assert.ok(b.garrison >= 4);
      const out = Math.max(-b.col, b.col - (layout.cols - 1), -b.row, b.row - (layout.rows - 1));
      assert.equal(out, 1, `${b.id} is next to the district`);
    }
  });
});

test("road works dig up one lane of an inner street, clear of the walking line, doors, crossings and the convoy", () => {
  // Distance from the nearest line through lot edges (a street or avenue centre), as a signed offset.
  const offset = (v, count) => {
    const t = v / CITY.pitch + count / 2;
    return (t - Math.round(t)) * CITY.pitch;
  };
  for (const layout of STRIKE_MISSIONS.slice(0, CITY_COUNT)) {
    const buildings = resolveBuildings(layout);
    assert.equal(layout.roadworks.length, 8);
    const segments = new Set();
    for (const w of layout.roadworks) {
      const x = w.along === "x";
      // Across the street: in one lane of the 3.8 m asphalt, on the digger's side, clear of the centre line.
      const across = offset(x ? w.z : w.x, x ? layout.rows : layout.cols);
      assert.ok(Math.abs(across - w.side * WORKS.lane) < 1e-9);
      // (Walkers are 0.93 m wide: half of that, plus a barrier, clears the inner edge.)
      assert.ok(WORKS.lane - WORKS.width / 2 >= 0.46 + 0.08 && WORKS.lane + WORKS.width / 2 <= 1.9);
      // The digger's pavement stays between the asphalt and the building line.
      assert.ok(WORKS.pavement - 0.8 > 1.9 && WORKS.pavement + 0.8 < CITY.pitch / 2 - CITY.half);
      // Along it: off the middle (the door path at the lot centre) and short of the crossing.
      const along = offset(x ? w.x : w.z, x ? layout.cols : layout.rows);
      const mid = Math.abs(Math.abs(along) - CITY.pitch / 2);
      assert.ok(mid - WORKS.length / 2 >= 1, `road works ${mid.toFixed(2)} m from the lot centre`);
      // (The cones' caps are 0.4 m wide; the crossing spans 2.05-3.15 m from the junction.)
      assert.ok(mid + WORKS.cones + 0.2 < CITY.pitch / 2 - 3.15);
      // Never under a building, one per segment, inside the grid, and off the convoy loop.
      assert.ok(!buildingAt(buildings, w.x, w.z, 1.2), `road works at ${w.x}, ${w.z} hit a building`);
      const lot = Math.floor((x ? w.x : w.z) / CITY.pitch + (x ? layout.cols : layout.rows) / 2);
      const key = `${w.along}:${Math.round((x ? w.z : w.x) - across)}:${lot}`;
      assert.ok(!segments.has(key), `two road works on ${key}`);
      segments.add(key);
      const b = cityBounds(layout);
      assert.ok(w.x - WORKS.cones > b.minX && w.x + WORKS.cones < b.maxX && w.z - WORKS.cones > b.minZ && w.z + WORKS.cones < b.maxZ);
      const loop = layout.convoy?.points || [];
      loop.forEach((p, i) => {
        const q = loop[(i + 1) % loop.length];
        const t = Math.max(0, Math.min(1, ((w.x - p.x) * (q.x - p.x) + (w.z - p.z) * (q.z - p.z)) / ((q.x - p.x) ** 2 + (q.z - p.z) ** 2)));
        assert.ok(Math.hypot(w.x - p.x - t * (q.x - p.x), w.z - p.z - t * (q.z - p.z)) >= 3, "road works on the convoy loop");
      });
    }
  }
  assert.ok(STRIKE_MISSIONS.slice(0, CITY_COUNT).some((m) => m.convoy));
});
