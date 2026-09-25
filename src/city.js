import * as THREE from "three";
import { CITY, storyY, lotCenter } from "./strike-data.js";
import { material } from "./world.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const zero = new THREE.Matrix4().makeScale(0, 0, 0);

export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let windowTexture = null;
function facadeTexture() {
  if (windowTexture) return windowTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 160;
  const c = canvas.getContext("2d");
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, 128, 160);
  // Pilasters and a sill band give each panel depth when tinted by the building colour.
  c.fillStyle = "#e9e4dc";
  c.fillRect(0, 0, 10, 160);
  c.fillRect(118, 0, 10, 160);
  c.fillStyle = "#f7f3ea";
  c.fillRect(0, 126, 128, 12);
  const glass = c.createLinearGradient(0, 22, 0, 118);
  glass.addColorStop(0, "#1c3f6e");
  glass.addColorStop(0.55, "#2c6fb0");
  glass.addColorStop(1, "#173458");
  c.fillStyle = "#fbf6ec";
  c.fillRect(20, 18, 88, 104);
  c.fillStyle = glass;
  c.fillRect(26, 24, 76, 92);
  c.fillStyle = "#ffffff55";
  c.beginPath();
  c.moveTo(32, 110);
  c.lineTo(58, 30);
  c.lineTo(70, 30);
  c.lineTo(44, 110);
  c.fill();
  c.fillStyle = "#fbf6ec";
  c.fillRect(62, 24, 4, 92);
  c.fillRect(26, 66, 76, 4);
  windowTexture = new THREE.CanvasTexture(canvas);
  windowTexture.colorSpace = THREE.SRGBColorSpace;
  windowTexture.anisotropy = 4;
  return windowTexture;
}

// Curtain-wall panel: opaque frame and mullions around translucent glass.
let glassTexture = null;
function curtainTexture() {
  if (glassTexture) return glassTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 160;
  const c = canvas.getContext("2d");
  c.fillStyle = "rgba(255,255,255,0.28)";
  c.fillRect(0, 0, 128, 160);
  c.fillStyle = "rgba(255,255,255,0.55)";
  c.beginPath();
  c.moveTo(18, 150);
  c.lineTo(58, 12);
  c.lineTo(78, 12);
  c.lineTo(38, 150);
  c.fill();
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, 128, 8);
  c.fillRect(0, 152, 128, 8);
  c.fillRect(0, 0, 7, 160);
  c.fillRect(121, 0, 7, 160);
  c.fillRect(61, 0, 6, 160);
  c.fillRect(0, 76, 128, 5);
  glassTexture = new THREE.CanvasTexture(canvas);
  glassTexture.colorSpace = THREE.SRGBColorSpace;
  glassTexture.anisotropy = 4;
  return glassTexture;
}

function roofDecal(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const c = canvas.getContext("2d");
  c.fillStyle = color;
  c.beginPath();
  c.roundRect(10, 10, 236, 236, 26);
  c.fill();
  c.strokeStyle = "#ffffff";
  c.lineWidth = 12;
  c.stroke();
  c.fillStyle = "#ffffff";
  // House pictogram: a shelter symbol with no real-world emblem.
  c.beginPath();
  c.moveTo(128, 46);
  c.lineTo(206, 118);
  c.lineTo(180, 118);
  c.lineTo(180, 176);
  c.lineTo(76, 176);
  c.lineTo(76, 118);
  c.lineTo(50, 118);
  c.closePath();
  c.fill();
  c.fillStyle = color;
  c.fillRect(112, 134, 32, 42);
  c.fillStyle = "#ffffff";
  c.font = "bold 34px Arial";
  c.textAlign = "center";
  c.fillText(text, 128, 222);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const shade = (hex, amount) => {
  const color = new THREE.Color(hex);
  const hsl = {};
  color.getHSL(hsl);
  return color.setHSL(hsl.h, Math.min(1, hsl.s * 1.05), Math.max(0, Math.min(1, hsl.l + amount)));
};

export class CityView {
  constructor(view, layout, buildings, blocks, missionIndex = 0) {
    this.view = view;
    this.layout = layout;
    this.buildings = buildings;
    this.blocks = blocks;
    this.random = seeded(1009 + missionIndex * 7919);
    this.group = new THREE.Group();
    view.level.add(this.group);
    this.decor = new Map();
    this.props = new Map();
    // Harbour missions stand quays, piers and a dry dock in open water instead of a paved district.
    if (layout.harbour) this.buildHarbour(layout.harbour);
    else this.buildGround();
    this.buildBlocks();
    this.buildDecor();
    if (!layout.harbour) this.buildStreetLife();
    this.flushDecor();
    this.flushProps();
    this.band = new THREE.Mesh(
      unitBox,
      new THREE.MeshBasicMaterial({
        color: 0xff8a2b,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    );
    this.band.userData.ownedMaterial = true;
    this.band.visible = false;
    this.band.renderOrder = 5;
    this.group.add(this.band);
  }

  // Static boxes share one instanced draw call per colour.
  box(position, size, color) {
    if (!this.decor.has(color)) this.decor.set(color, []);
    this.decor.get(color).push([position, size]);
  }

  flushDecor() {
    const matrix = new THREE.Matrix4(),
      rotation = new THREE.Quaternion();
    for (const [color, list] of this.decor) {
      const mesh = new THREE.InstancedMesh(unitBox, material(color), list.length);
      list.forEach(([position, size], i) => mesh.setMatrixAt(i, matrix.compose(position, rotation, size)));
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
    this.decor.clear();
  }

  extent() {
    const w = this.layout.cols * CITY.pitch,
      d = this.layout.rows * CITY.pitch;
    return { w, d, minX: -w / 2 - 4, maxX: w / 2 + 4, minZ: -d / 2 - 4, maxZ: d / 2 + 6 };
  }

  buildGround() {
    const view = this.view,
      e = this.extent();
    const cx = (e.minX + e.maxX) / 2,
      cz = (e.minZ + e.maxZ) / 2;
    // District platform: warm paving on a sea wall with a bright quay edge.
    this.box(V(cx, CITY.ground - 1.3, cz), V(e.maxX - e.minX + 2, 2.6, e.maxZ - e.minZ + 2), 0xc98f5e);
    this.box(V(cx, CITY.ground - 0.04, cz), V(e.maxX - e.minX, 0.1, e.maxZ - e.minZ), 0xf0d7aa);
    this.box(V(cx, CITY.ground - 0.2, e.maxZ + 1.1), V(e.maxX - e.minX + 2.4, 0.5, 0.9), 0xffd166);
    for (let x = e.minX + 2; x < e.maxX; x += 5)
      this.box(V(x, CITY.ground + 0.25, e.maxZ + 0.6), V(0.45, 0.5, 0.45), 0x3a4048);
    const asphalt = 0x3a3d46;
    const lines = this.lines();
    for (const z of lines.streets) {
      this.box(V(cx, CITY.ground + 0.02, z), V(e.maxX - e.minX, 0.06, 3.8), asphalt);
      for (let x = e.minX + 1.5; x < e.maxX - 1; x += 3.2)
        this.box(V(x, CITY.ground + 0.06, z), V(1.5, 0.02, 0.16), 0xffcc1f);
    }
    for (const x of lines.avenues) {
      this.box(V(x, CITY.ground + 0.025, cz), V(3.8, 0.06, e.maxZ - e.minZ), asphalt);
      for (let z = e.minZ + 1.5; z < e.maxZ - 1; z += 3.2)
        this.box(V(x, CITY.ground + 0.065, z), V(0.16, 0.02, 1.5), 0xffcc1f);
    }
    // Zebra crossings at each junction keep the grid readable at a glance.
    for (const x of lines.avenues)
      for (const z of lines.streets)
        for (let i = -2; i <= 2; i++) {
          this.box(V(x + i * 0.7, CITY.ground + 0.07, z + 2.6), V(0.4, 0.02, 1.1), 0xf7f1e1);
          this.box(V(x + 2.6, CITY.ground + 0.07, z + i * 0.7), V(1.1, 0.02, 0.4), 0xf7f1e1);
        }
    for (const plaza of this.layout.plazas || []) this.buildPlaza(plaza);
  }

  buildHarbour(harbour) {
    const top = CITY.ground;
    for (const [x0, z0, x1, z1] of harbour.land) {
      const w = x1 - x0,
        d = z1 - z0,
        cx = (x0 + x1) / 2,
        cz = (z0 + z1) / 2;
      // Stone sea wall, warm paving and a bright kerb so every quay edge reads against the water.
      this.box(V(cx, top - 1.4, cz), V(w, 2.8, d), 0xb5794f);
      this.box(V(cx, top - 0.04, cz), V(w - 0.2, 0.1, d - 0.2), 0xf0d7aa);
      for (const [ex, ez, ew, ed] of [
        [cx, z0 + 0.25, w, 0.5],
        [cx, z1 - 0.25, w, 0.5],
        [x0 + 0.25, cz, 0.5, d],
        [x1 - 0.25, cz, 0.5, d],
      ])
        this.box(V(ex, top + 0.06, ez), V(ew, 0.14, ed), 0xffd166);
      // Bollards along the long sides.
      const long = w >= d;
      const span = long ? w : d;
      for (let t = 1.5; t < span - 1; t += 4) {
        const bx = long ? x0 + t : x0 + 0.6,
          bz = long ? z1 - 0.6 : z0 + t;
        this.box(V(bx, top + 0.28, bz), V(0.36, 0.5, 0.36), 0x3a4048);
      }
    }
    const dock = harbour.dock;
    if (dock) {
      // The dry dock's floor shows through shallow water; a gate sill marks its open end.
      const cx = (dock.x0 + dock.x1) / 2,
        cz = (dock.z0 + dock.z1) / 2;
      this.box(V(cx, -1.3, cz), V(dock.x1 - dock.x0, 0.2, dock.z1 - dock.z0), 0x8fd0c8);
      for (let x = dock.x0 + 1; x < dock.x1; x += 2)
        this.box(V(x, -0.2, dock.z1 + 0.3), V(1.2, 0.3, 0.5), x % 4 < 2 ? 0xffcc1f : 0x2f2c35);
    }
    for (const b of harbour.buoys || []) this.prop("buoy", V(b.x, 0, b.z), 1, 0);
    for (const c of harbour.cranes || []) this.prop("harbour-crane", V(c.x, top, c.z), 1, ((c.heading || 0) * Math.PI) / 180);
    for (const c of harbour.containers || []) this.prop("container-stack", V(c.x, top, c.z), 1, (c.x * 0.37) % 0.4);
    const mouth = harbour.mouth;
    if (mouth)
      // Harbour-mouth lights: red to port, green to starboard.
      for (const [dx, color] of [
        [-3.2, 0xff4b2b],
        [3.2, 0x33d69f],
      ]) {
        this.box(V(mouth.x + dx, 1.1, mouth.z), V(0.9, 2.2, 0.9), 0xf7f1e1);
        this.box(V(mouth.x + dx, 2.4, mouth.z), V(0.7, 0.5, 0.7), color);
      }
    for (const [x0, z0, x1, z1] of harbour.land)
      for (let x = x0 + 2.5; x < x1 - 2; x += 9 + this.random() * 5)
        if (z1 - z0 > 5 && this.random() < 0.6) this.prop("streetlight", V(x, top, z1 - 1.2), 0.85, 0);
  }

  lines() {
    const avenues = [],
      streets = [];
    for (let c = 0; c <= this.layout.cols; c++) avenues.push((c - this.layout.cols / 2) * CITY.pitch);
    for (let r = 0; r <= this.layout.rows; r++) streets.push((r - this.layout.rows / 2) * CITY.pitch);
    return { avenues, streets };
  }

  buildPlaza(plaza) {
    const view = this.view,
      c = lotCenter(this.layout, plaza.col, plaza.row);
    this.box(V(c.x, CITY.ground + 0.03, c.z), V(8.6, 0.08, 8.6), 0xe2704f);
    for (let i = -3; i <= 3; i += 2)
      for (let j = -3; j <= 3; j += 2)
        if ((i + j) % 4 === 0)
          this.box(V(c.x + i, CITY.ground + 0.08, c.z + j), V(1.9, 0.02, 1.9), 0xf2b441);
    const basin = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.7, 0.5, 28),
      new THREE.MeshStandardMaterial({ color: 0xf7f1e1, roughness: 0.5 }),
    );
    basin.position.set(c.x, CITY.ground + 0.3, c.z);
    basin.castShadow = basin.receiveShadow = true;
    basin.userData.disposable = true;
    this.group.add(basin);
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.3, 0.1, 28),
      new THREE.MeshStandardMaterial({ color: 0x19b9c9, roughness: 0.15, emissive: 0x0b5f73, emissiveIntensity: 0.4 }),
    );
    water.position.set(c.x, CITY.ground + 0.52, c.z);
    water.userData.disposable = true;
    this.group.add(water);
    for (const [dx, dz] of [
      [-3.2, -3.2],
      [3.2, -3.2],
      [-3.2, 3.2],
      [3.2, 3.2],
    ])
      this.prop("street-tree", V(c.x + dx, CITY.ground, c.z + dz), 0.9 + this.random() * 0.2, this.random() * 6);
  }

  // Street furniture is queued and drawn instanced, one batch per model part.
  prop(name, position, scale = 1, rotation = 0, color = null) {
    if (!this.props.has(name)) this.props.set(name, []);
    this.props.get(name).push({ position, scale, rotation, color });
  }

  flushProps() {
    for (const [name, placements] of this.props)
      if (this.view.assets.has(name))
        this.view.instances(name, placements, this.group, name === "car" ? { paint: "Car paint" } : {});
    this.props.clear();
  }

  buildBlocks() {
    const buildings = this.buildings;
    const groups = { slab: [], wall: [], glass: [] };
    for (const block of this.blocks) {
      const kind = block.kind === "roof" ? "slab" : block.kind;
      groups[kind].push(block);
    }
    const materials = {
      slab: new THREE.MeshStandardMaterial({ roughness: 0.72, color: 0xffffff }),
      wall: new THREE.MeshStandardMaterial({ roughness: 0.5, color: 0xffffff, map: facadeTexture() }),
      glass: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: curtainTexture(),
        roughness: 0.08,
        metalness: 0.1,
        transparent: true,
        depthWrite: false,
      }),
    };
    this.meshes = {};
    this.slot = new Map();
    const matrix = new THREE.Matrix4(),
      color = new THREE.Color();
    for (const [kind, list] of Object.entries(groups)) {
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(unitBox, materials[kind], list.length);
      mesh.castShadow = kind !== "glass";
      mesh.receiveShadow = true;
      mesh.userData.ownedMaterial = true;
      mesh.renderOrder = kind === "glass" ? 2 : 0;
      list.forEach((block, i) => {
        const size = V(block.max[0] - block.min[0], block.max[1] - block.min[1], block.max[2] - block.min[2]);
        const centre = V(
          (block.max[0] + block.min[0]) / 2,
          (block.max[1] + block.min[1]) / 2,
          (block.max[2] + block.min[2]) / 2,
        );
        matrix.compose(centre, new THREE.Quaternion(), size);
        mesh.setMatrixAt(i, matrix);
        const building = buildings[block.b];
        if (kind === "slab")
          color.set(block.kind === "roof" ? (building.kind === "shelter" ? "#2f86e8" : "#eadbc2") : "#fff3dc");
        else if (kind === "glass") color.set(building.kind === "glass" ? "#7fe0ff" : "#b8f0ff");
        else color.copy(shade(building.color, block.f % 2 ? -0.02 : 0.03));
        if (kind === "slab" && block.kind === "roof" && building.kind !== "shelter")
          color.offsetHSL(0, 0, (this.random() - 0.5) * 0.04);
        mesh.setColorAt(i, color);
        this.slot.set(block.id, { mesh, index: i });
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.group.add(mesh);
      this.meshes[kind] = mesh;
    }
  }

  hide(block) {
    const slot = this.slot.get(block.id);
    if (!slot) return;
    slot.mesh.setMatrixAt(slot.index, zero);
    slot.mesh.instanceMatrix.needsUpdate = true;
  }

  buildDecor() {
    const view = this.view;
    for (const b of this.buildings) {
      const dark = shade(b.color, -0.16).getHex();
      this.box(V(b.x, CITY.ground + CITY.plinth / 2, b.z), V(8.5, CITY.plinth + 0.02, 8.5), 0x5a4a44);
      const height = b.top - CITY.ground;
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        this.box(
          V(b.x + sx * (CITY.half + 0.05), CITY.ground + height / 2 + 0.1, b.z + sz * (CITY.half + 0.05)),
          V(0.55, height + 0.2, 0.55),
          dark,
        );
      // Parapet framing the roof: it is decoration and never blocks blasts.
      const y = b.top + 0.3;
      for (const [dx, dz, w, d] of [
        [0, -CITY.half, 8.6, 0.28],
        [0, CITY.half, 8.6, 0.28],
        [-CITY.half, 0, 0.28, 8.6],
        [CITY.half, 0, 0.28, 8.6],
      ])
        this.box(V(b.x + dx, y, b.z + dz), V(w, 0.6, d), b.kind === "shelter" ? 0xf7f1e1 : dark);
      if (b.kind === "shelter") {
        const decal = new THREE.Mesh(
          new THREE.PlaneGeometry(6.4, 6.4),
          new THREE.MeshStandardMaterial({ map: roofDecal("SHELTER", "#2f86e8"), roughness: 0.6, transparent: true }),
        );
        decal.rotation.x = -Math.PI / 2;
        decal.position.set(b.x, b.top + 0.03, b.z);
        decal.userData.disposable = true;
        decal.userData.ownedMap = true;
        this.group.add(decal);
        const light = view.ring(V(b.x, b.top + 0.08, b.z), 4.6, 0x7fd8ff, 0.18, this.group);
        light.material.opacity = 0.7;
        this.shelterRings = [...(this.shelterRings || []), light];
      }
      const roofProps = b.roof || [];
      roofProps.forEach((name, i) => {
        const slot = [
          [2.3, 2.2],
          [-2.4, -2.2],
          [2.4, -2.3],
        ][i % 3];
        this.prop(name === "tank" ? "roof-tank" : "roof-hvac", V(b.x + slot[0], b.top, b.z + slot[1]), 0.9, i * 1.4);
      });
    }
  }

  buildStreetLife() {
    const lines = this.lines();
    const e = this.extent();
    const palette = ["#ff4b2b", "#ffc62b", "#2f86e8", "#33d69f", "#f7f1e1", "#b04cff", "#ff8a6b"];
    for (const z of lines.streets)
      for (let i = 0; i < lines.avenues.length - 1; i++) {
        if (this.random() < 0.35) continue;
        const x = (lines.avenues[i] + lines.avenues[i + 1]) / 2 + (this.random() - 0.5) * 4;
        const lane = this.random() < 0.5 ? -1.2 : 1.2;
        this.prop("car", V(x, CITY.ground, z + lane), 0.72, Math.PI / 2, palette[Math.floor(this.random() * palette.length)]);
      }
    for (const x of lines.avenues)
      for (const z of lines.streets) {
        if (this.random() < 0.5) this.prop("streetlight", V(x + 2.3, CITY.ground, z - 2.3), 0.85, Math.PI / 4);
      }
    for (const b of this.buildings) {
      if (this.random() < 0.55)
        this.prop("street-tree", V(b.x + (this.random() < 0.5 ? -5.2 : 5.2), CITY.ground, b.z + 5.3), 0.72, this.random() * 6);
    }
    for (let x = e.minX + 3; x < e.maxX - 2; x += 7 + this.random() * 4)
      this.prop("street-tree", V(x, CITY.ground, e.maxZ - 1.2), 0.8, this.random() * 6);
  }

  showBand(building, f, color) {
    if (!building) {
      this.band.visible = false;
      return;
    }
    const y0 = storyY(Math.min(f, building.floors - 1)),
      top = f >= building.floors;
    this.band.visible = true;
    this.band.material.color.set(color);
    if (top) {
      this.band.position.set(building.x, building.top + 0.1, building.z);
      this.band.scale.set(8.9, 0.3, 8.9);
    } else {
      this.band.position.set(building.x, y0 + 1.2, building.z);
      this.band.scale.set(8.9, 2.3, 8.9);
    }
  }
}
