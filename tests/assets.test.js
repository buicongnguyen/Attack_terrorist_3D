import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { MODELS } from "../src/data.js";

// Runtime contracts: node names the game animates and material names it recolours.
const NODES = {
  boat: ["Turret", "SingleGun", "TwinGunL", "TwinGunR", "Muzzle", "MuzzleL", "MuzzleR", "SupportRack", "Radar"],
  helicopter: ["Rotor", "TailRotor", "ChinTurret", "HeliMuzzle"],
  bomber: ["PropellerL", "PropellerR", "PylonL", "PylonR", "PylonC"],
  enemy: ["ArmL", "ArmR", "LegL", "LegR"],
  "rescue-soldier": ["WaveArm"],
  cannon: ["Turret"],
  "aa-truck": ["TruckTurret"],
  "missile-truck": ["Rack"],
  "missile-site": ["Rack"],
  drone: ["DroneRotor"],
  "aa-nest": ["Turret", "MuzzleL", "MuzzleR"],
  "relay-mast": ["Dish", "Beacon"],
  technical: ["Turret"],
  skiff: ["Turret"],
  "gate-tower": ["Turret", "Muzzle"],
  "lock-gate": ["GateL", "GateR", "Generator"],
  "patrol-boat": ["Turret"],
  frigate: ["Turret", "MuzzleL", "MuzzleR"],
  destroyer: ["TurretF", "TurretA"],
};
const MATERIALS = {
  enemy: ["Hostile accent"],
  bomber: ["Livery"],
  car: ["Car paint"],
  "relay-mast": ["Beacon light"],
};

function readGlb(name) {
  const buffer = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
  assert.equal(buffer.toString("ascii", 0, 4), "glTF", `${name} is a GLB`);
  const length = buffer.readUInt32LE(12);
  assert.equal(buffer.toString("ascii", 16, 20), "JSON");
  return JSON.parse(buffer.toString("utf8", 20, 20 + length));
}

test("every model the game loads exists with its animated nodes and named materials", () => {
  for (const name of MODELS) {
    const gltf = readGlb(name);
    const nodes = new Set(gltf.nodes.map((n) => n.name));
    for (const node of NODES[name] || []) assert.ok(nodes.has(node), `${name} is missing node ${node}`);
    const materials = new Set((gltf.materials || []).map((m) => m.name));
    for (const material of MATERIALS[name] || []) assert.ok(materials.has(material), `${name} is missing material ${material}`);
    // Animated pivots must start unrotated so runtime rotations are absolute.
    for (const node of gltf.nodes)
      if ((NODES[name] || []).includes(node.name) && node.rotation)
        assert.ok(Math.abs(node.rotation[3] - 1) < 1e-4, `${name}/${node.name} has a rest rotation`);
  }
});

test("the model set stays light enough for phones", () => {
  const bytes = MODELS.reduce((sum, name) => sum + statSync(new URL(`../public/models/${name}.glb`, import.meta.url)).size, 0);
  assert.ok(bytes < 4.5 * 1024 * 1024, `models total ${bytes} bytes`);
  const manifest = JSON.parse(readFileSync(new URL("../public/models/manifest.json", import.meta.url), "utf8"));
  assert.deepEqual(new Set(manifest.assets.map((a) => a.name)), new Set(MODELS));
});
