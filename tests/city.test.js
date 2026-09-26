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
} from "../src/strike-data.js";

const CITY_COUNT = 6;
const span = (g) => ({ cols: g.maxCol - g.minCol + 1, rows: g.maxRow - g.minRow + 1 });
const inCore = (layout, col, row) => col >= 0 && col < layout.cols && row >= 0 && row < layout.rows;

test("each city district grows three times along a row and four times along a column", () => {
  for (const layout of STRIKE_MISSIONS.slice(0, CITY_COUNT)) {
    const { cols, rows } = span(layout.grid);
    assert.equal(cols, layout.cols * CITY_GROWTH.cols);
    assert.equal(rows, layout.rows * CITY_GROWTH.rows);
    // The authored district stays in the middle of the grid.
    assert.ok(layout.grid.minCol < 0 && layout.grid.maxCol >= layout.cols);
    assert.ok(layout.grid.minRow < 0 && layout.grid.maxRow >= layout.rows);
    // Every lot outside the authored district holds one generated tower or one park.
    const lots = new Set();
    for (const b of layout.buildings.filter((b) => b.id.startsWith("C"))) {
      assert.ok(!inCore(layout, b.col, b.row), `${b.id} sits on an authored lot`);
      assert.ok(b.floors >= 2 && b.floors <= 6);
      lots.add(`${b.col},${b.row}`);
    }
    for (const p of layout.parks) {
      assert.ok(!inCore(layout, p.col, p.row));
      assert.ok(!lots.has(`${p.col},${p.row}`), "a park and a tower share a lot");
      lots.add(`${p.col},${p.row}`);
    }
    assert.equal(lots.size, cols * rows - layout.cols * layout.rows);
  }
  // The harbour keeps its own basin.
  for (const layout of STRIKE_MISSIONS.slice(CITY_COUNT)) assert.equal(layout.grid, undefined);
});

test("the wider city is the same every time and leaves the authored buildings untouched", () => {
  const layout = STRIKE_MISSIONS[2];
  const core = { ...layout, buildings: layout.buildings.filter((b) => !b.id.startsWith("C")), grid: undefined, parks: undefined };
  const again = expandCity(core, 2);
  assert.deepEqual(again.buildings, layout.buildings);
  assert.deepEqual(again.parks, layout.parks);
  // Authored ids never start with the generated prefix, so the split above is exact.
  assert.ok(core.buildings.every((b) => inCore(layout, b.col, b.row)));
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
