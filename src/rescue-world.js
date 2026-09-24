import * as THREE from "three";
import { rescueLayout } from "./rescue-data.js";
import { seeded } from "./city.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ROWS = 13;

// Cinder Valley: jungle slopes and cliffs frame a river valley. Dressing keeps clear of
// every rescue site, cave mouth and patrol road so scenery never hides gameplay.
export function createRescueScenery(view, mission) {
  const layout = rescueLayout(mission.team);
  const random = seeded(4242 + mission.team * 97);
  const keepOut = [{ x: 0, z: 18, r: 11 }];
  for (const s of layout.survivors) {
    const side = Math.sign(s.x);
    keepOut.push({ x: s.x, z: s.z, r: 8 });
    keepOut.push({ x: side * 37, z: s.z - 13, r: 5 }, { x: -side * 34, z: s.z - 25, r: 5 });
    keepOut.push({ x: s.x + side * 8, z: s.z - 7, r: 3.5 });
  }
  for (const p of layout.supplies) keepOut.push({ x: p.x, z: p.z, r: 3 });
  const clear = (x, z, pad = 0) =>
    Math.abs(x) > 14 &&
    Math.abs(Math.abs(x) - 30) > 3 &&
    Math.abs(Math.abs(x) - 24) > 3 &&
    keepOut.every((k) => Math.hypot(x - k.x, z - k.z) > k.r + pad);

  view.sceneryChunks = [];
  for (let row = 0; row < ROWS; row++) {
    const z = 20 - row * 20,
      chunk = new THREE.Group();
    chunk.userData.centerZ = z;
    view.level.add(chunk);
    view.sceneryChunks.push(chunk);
    const trees = [],
      palms = [],
      rocks = [],
      cliffs = [],
      houses = [];
    for (const side of [-1, 1]) {
      view.box(V(side * 33, 0.2, z), V(42, 1.9, 20), 0x3f9e4a, chunk);
      view.box(V(side * 33, 1.16, z), V(42, 0.08, 20), row > 8 ? 0x86c94a : 0x4cc766, chunk);
      // Sandy bank, then a dirt patrol road with worn verges.
      view.box(V(side * 12.4, 0.5, z), V(2.4, 1.3, 20), 0xf2d19a, chunk);
      view.box(V(side * 30, 1.22, z), V(3.4, 0.05, 20), 0xe9c98c, chunk);
      view.box(V(side * 30, 1.2, z), V(4.4, 0.04, 20), 0xb9d86a, chunk);
      for (let i = 0; i < 3; i++) {
        const px = side * (16 + random() * 34),
          pz = z - 9 + random() * 18;
        view.box(V(px, 1.21, pz), V(3 + random() * 4, 0.03, 2 + random() * 3), row > 8 ? 0x9ad65a : 0x5fd06f, chunk);
      }
      // Cliff wall along the valley rim.
      for (let i = 0; i < 3; i++)
        cliffs.push({
          position: V(side * (47 + random() * 6), 1, z - 8 + i * 7 + random() * 2),
          rotation: random() * 6,
          scale: 3.4 + random() * 2.6,
        });
      for (let i = 0; i < 14; i++) {
        const x = side * (15 + random() * 29),
          zz = z - 9.5 + random() * 19;
        if (!clear(x, zz, 1.5)) continue;
        if (Math.abs(x) < 19) palms.push({ position: V(x, 1.2, zz), rotation: random() * 6, scale: 0.85 + random() * 0.3 });
        else trees.push({ position: V(x, 1.2, zz), rotation: random() * 6, scale: 0.8 + random() * 0.45 });
      }
      for (let i = 0; i < 2; i++) {
        const x = side * (16 + random() * 28),
          zz = z - 8 + random() * 16;
        if (clear(x, zz, 1)) rocks.push({ position: V(x, 1.1, zz), rotation: random() * 6, scale: 0.8 + random() * 0.7 });
      }
      // Riverside stilt villages every few rows.
      if ((row + (side > 0 ? 1 : 0)) % 3 === 1) {
        const hx = side * 16.5,
          hz = z + 2;
        if (clear(hx, hz, 2))
          houses.push({ position: V(hx, 1.1, hz), rotation: side > 0 ? -Math.PI / 2 : Math.PI / 2, scale: 1 });
      }
    }
    view.instances("jungle-tree", trees, chunk);
    view.instances("palm", palms, chunk);
    view.instances("rock", [...rocks, ...cliffs], chunk);
    view.instances("stilt-house", houses, chunk);
    if ([3, 6, 9].includes(row)) {
      view.box(V(0, 0.2, z), V(26, 0.8, 4.6), 0x9a8f86, chunk);
      for (const offset of [-2.1, 2.1]) view.box(V(0, 0.8, z + offset), V(26, 0.5, 0.3), 0xe2704f, chunk);
      for (const x of [-7, 0, 7]) view.box(V(x, -0.4, z), V(1.2, 1.6, 3.6), 0x6d6a72, chunk);
    }
  }
  createHighwater(view);
  for (const s of layout.survivors) {
    view.ring(V(s.x, 1.23, s.z), 4.2, 0x33d69f, 0.12);
    view.model("supply", V(s.x + 3, 1.2, s.z + 2), 0.75);
    view.box(V(s.x, 1.26, s.z), V(0.35, 0.04, 2.4), 0x33d69f);
    view.box(V(s.x, 1.26, s.z), V(2.4, 0.04, 0.35), 0x33d69f);
  }
}

// Highwater's forward pad: the helicopter's home, beside the station that runs the Tidelock.
function createHighwater(view) {
  const base = V(0, 0, 18);
  view.box(V(base.x, 0.55, base.z), V(17, 1.3, 15), 0xd9cdb8);
  view.box(V(base.x, 1.25, base.z), V(17.4, 0.12, 15.4), 0xffc62b);
  view.box(V(base.x, 1.27, base.z), V(16.2, 0.1, 14.2), 0xc9bfa8);
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(4.6, 4.6, 0.08, 40),
    new THREE.MeshStandardMaterial({ color: 0x3a3d46, roughness: 0.8 }),
  );
  pad.position.set(base.x, 1.34, base.z);
  pad.receiveShadow = true;
  pad.userData.disposable = true;
  view.level.add(pad);
  view.ring(V(base.x, 1.4, base.z), 4.3, 0xffc62b, 0.3);
  for (const x of [-1, 1]) view.box(V(base.x + x * 1.1, 1.4, base.z), V(0.45, 0.04, 3.4), 0xffffff);
  view.box(V(base.x, 1.4, base.z), V(1.8, 0.04, 0.45), 0xffffff);
  // Control station with its antenna, and relief crates stacked by the pad.
  view.box(V(-6.2, 3, 13.4), V(3.6, 3.4, 3.2), 0xf6e7c8);
  view.box(V(-6.2, 4.85, 13.4), V(4, 0.35, 3.6), 0x2f86e8);
  view.box(V(-6.2, 3.2, 15.05), V(2.8, 1.1, 0.08), 0x7fd8ff);
  view.box(V(-5, 6.4, 13), V(0.12, 2.8, 0.12), 0x3a4048);
  view.model("beacon", V(5.6, 1.3, 13.6));
  view.model("supply", V(-6.2, 1.3, 21.6), 1.1);
  view.model("supply", V(-4.9, 1.3, 22.4), 0.9);
  view.model("streetlight", V(6.4, 1.3, 22.6), 0.9);
}
