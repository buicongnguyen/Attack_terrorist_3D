import * as THREE from "three";
import { rescueLayout } from "./rescue-data.js";
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function createRescueScenery(view, mission) {
  const layout = rescueLayout(mission.team);
  view.sceneryChunks = [];
  for (let row = 0; row < 13; row++) {
    const z = 20 - row * 20,
      chunk = new THREE.Group();
    chunk.userData.centerZ = z;
    view.level.add(chunk);
    view.sceneryChunks.push(chunk);
    for (const side of [-1, 1]) {
      view.box(V(side * 33, 0.2, z), V(42, 1.9, 20), 0x8ca68b, chunk);
      view.box(
        V(side * 33, 1.16, z),
        V(42, 0.08, 20),
        row > 7 ? 0x839a79 : 0x76a177,
        chunk,
      );
      view.box(V(side * 11.6, 0.4, z), V(0.8, 1.2, 20), 0xc2cdb4, chunk);
      view.box(V(side * 30, 1.24, z), V(3.2, 0.04, 20), 0xa8b9a0, chunk);
      for (let i = 0; i < 2; i++) {
        view.model(
          "rock",
          V(side * (42 + i * 6), 1.2, z - 4 + i * 8),
          2.7 + (row % 3) * 0.4,
          chunk,
        );
        if (row < 9)
          view.model(
            "palm",
            V(side * (17 + i * 20), 1.2, z + 6 - i * 9),
            0.9,
            chunk,
          );
      }
      if (row % 3 === 1) {
        view.box(V(side * 38, 2.4, z + 4), V(4.5, 2.4, 5), 0xd3d6c0, chunk);
        view.box(V(side * 38, 3.65, z + 4), V(4.9, 0.25, 5.4), 0x5e7775, chunk);
        view.box(
          V(side * 38, 2.4, z + 6.54),
          V(1.2, 1.1, 0.08),
          0x47777b,
          chunk,
        );
      }
    }
    if ([3, 6, 9].includes(row)) {
      view.box(V(0, 0.15, z), V(24, 0.7, 4.5), 0x85989a, chunk);
      for (const offset of [-2, 2])
        view.box(V(0, 0.7, z + offset), V(24, 0.4, 0.25), 0xdce0c9, chunk);
    }
  }
  view.island(0, 18, 16, 17, 1.2);
  view.ring(V(0, 1.26, 18), 4.5, 0xe6ead6, 0.17);
  for (const x of [-1, 1]) view.box(V(x, 1.28, 18), V(0.3, 0.04, 3), 0xf4e6ad);
  view.box(V(0, 1.28, 18), V(2, 0.04, 0.3), 0xf4e6ad);
  view.model("beacon", V(5, 1.2, 17));
  view.model("supply", V(-5, 1.2, 19), 1.2);
  for (const s of layout.survivors) {
    view.ring(V(s.x, 1.23, s.z), 4.2, 0xb4e4ae, 0.06);
    view.model("supply", V(s.x + 3, 1.2, s.z + 2), 0.75);
    view.box(V(s.x, 1.26, s.z), V(0.25, 0.04, 2), 0xd9ecc9);
    view.box(V(s.x, 1.26, s.z), V(2, 0.04, 0.25), 0xd9ecc9);
  }
}
