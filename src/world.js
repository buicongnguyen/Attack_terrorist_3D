import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MODELS, ASSET_REVISION } from "./data.js";
import { createPickupBadgeMaterial, badgeWorldSize } from "./pickups.js";

const materialCache = new Map();
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const sphereGeometry = new THREE.IcosahedronGeometry(1, 1);
export const material = (color) => {
  if (!materialCache.has(color))
    materialCache.set(
      color,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.88,
        flatShading: true,
      }),
    );
  return materialCache.get(color);
};

export class WorldView {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9ed9d6);
    this.scene.fog = new THREE.Fog(0x9ed9d6, 165, 280);
    this.camera = new THREE.OrthographicCamera(-30, 30, 20, -20, 0.1, 350);
    this.scene.add(new THREE.HemisphereLight(0xe5f9ff, 0x5b8473, 1.8));
    this.sun = new THREE.DirectionalLight(0xfff0cc, 2.5);
    this.sun.position.set(-18, 36, 16);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -38;
    this.sun.shadow.camera.right = 38;
    this.sun.shadow.camera.top = 38;
    this.sun.shadow.camera.bottom = -38;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.bias = -0.0002;
    this.scene.add(this.sun);
    this.level = new THREE.Group();
    this.scene.add(this.level);
    this.assets = new Map();
    this.badgeMaterials = new Map();
    this.pickupBadges = new Set();
    this.badgeKeepouts = [];
    this.badgePoint = new THREE.Vector3();
    this.animated = [];
    this.scrollProps = [];
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.target = new THREE.Vector3();
    this.water = this.createWater();
    this.scene.add(this.water);
    this.resize();
  }

  async loadAssets(progress) {
    const loader = new GLTFLoader();
    let count = 0;
    await Promise.all(
      MODELS.map(async (name) => {
        const gltf = await loader.loadAsync(
          `${import.meta.env.BASE_URL}models/${name}.glb?v=${ASSET_REVISION}`,
        );
        gltf.scene.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });
        this.assets.set(name, gltf.scene);
        progress(++count / MODELS.length);
      }),
    );
  }

  model(name, position = new THREE.Vector3(), scale = 1, parent = this.level) {
    const group = this.assets.get(name).clone(true);
    group.position.copy(position);
    group.scale.setScalar(scale);
    if (name === "boat") {
      for (const part of ["TwinGunL", "TwinGunR", "SupportRack"])
        group.getObjectByName(part).visible = false;
    }
    parent.add(group);
    return group;
  }

  box(position, size, color, parent = this.level) {
    const mesh = new THREE.Mesh(boxGeometry, material(color));
    mesh.position.copy(position);
    mesh.scale.copy(size);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  pickupBadge(kind, parent) {
    if (!this.badgeMaterials.has(kind))
      this.badgeMaterials.set(kind, createPickupBadgeMaterial(kind));
    const badge = new THREE.Sprite(this.badgeMaterials.get(kind));
    badge.position.set(0, 1.7, 0);
    badge.center.set(0.5, 0);
    badge.renderOrder = 20;
    badge.userData.pickupBadge = true;
    badge.userData.kind = kind;
    badge.raycast = () => {};
    parent.add(badge);
    this.pickupBadges.add(badge);
    this.resizeBadge(badge);
    return badge;
  }

  resizeBadge(badge) {
    const size = badgeWorldSize(
      this.camera,
      this.canvas.clientHeight,
      this.canvas.clientWidth < 700 ? 46 : 50,
    );
    badge.scale.set(size.width, size.height, 1);
  }

  sphere(position, scale, color, parent = this.level) {
    const mesh = new THREE.Mesh(sphereGeometry, material(color));
    mesh.position.copy(position);
    mesh.scale.copy(scale);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  ring(position, radius, color, thickness = 0.06, parent = this.level) {
    const geometry = new THREE.RingGeometry(radius - thickness, radius, 56);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(geometry, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(position);
    ring.userData.disposable = true;
    parent.add(ring);
    return ring;
  }

  disposeObject(object) {
    object.traverse((child) => {
      if (child.userData.pickupBadge) this.pickupBadges.delete(child);
      if (child.userData.disposable) {
        child.geometry?.dispose();
        child.material?.dispose();
      }
    });
    object.removeFromParent();
  }

  clear() {
    this.disposeObject(this.level);
    this.level = new THREE.Group();
    this.scene.add(this.level);
    this.scrollProps = [];
    this.animated = [];
  }

  createWater() {
    const geometry = new THREE.PlaneGeometry(350, 350, 96, 96);
    geometry.rotateX(-Math.PI / 2);
    const shader = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `uniform float time; varying vec3 worldP;
        void main() { vec3 p = position;
          p.y += sin(p.x*.48+time*.8)*.07 + sin(p.z*.62-time)*.055;
          worldP = (modelMatrix*vec4(p,1.)).xyz;
          gl_Position=projectionMatrix*viewMatrix*vec4(worldP,1.); }`,
      fragmentShader: `uniform float time; varying vec3 worldP;
        void main() { vec2 p=worldP.xz;
          float ripple=sin(p.y*3.+sin(p.x*.45+time*.17)*1.1-time*1.2);
          float bands=sin(p.y*.18-time*.2+sin(p.x*.23))*.5+.5;
          vec3 deep=vec3(.018,.19,.205); vec3 shallow=vec3(.025,.29,.29);
          vec3 c=mix(deep,shallow,.2+bands*.65);
          float foam=pow(max(0.,ripple),28.)*smoothstep(.1,.8,sin(p.x*.36+p.y*.3))*.045;
          c+=vec3(.32,.65,.59)*foam;
          float distanceFog=smoothstep(45.,130.,length(p));
          c=mix(c,vec3(.53,.77,.74),distanceFog*.65);
          gl_FragColor=vec4(c,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return new THREE.Mesh(geometry, shader);
  }

  island(x, z, width, depth, height = 1, parent = this.level) {
    const points = [
      [-0.47, -0.29],
      [-0.31, -0.5],
      [0.16, -0.48],
      [0.45, -0.3],
      [0.5, 0.1],
      [0.28, 0.48],
      [-0.18, 0.5],
      [-0.48, 0.21],
    ];
    const make = (scale, top, color, layerHeight) => {
      const shape = new THREE.Shape();
      points.forEach(([px, pz], i) => {
        if (!i) shape.moveTo(px * width * scale, pz * depth * scale);
        else shape.lineTo(px * width * scale, pz * depth * scale);
      });
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: layerHeight,
        bevelEnabled: false,
      });
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, material(color));
      mesh.position.set(x, top - layerHeight, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.disposable = true;
      // Shared materials live across missions.
      mesh.material = material(color).clone();
      parent.add(mesh);
    };
    make(1.12, 0.18, 0xb1ccb0, 0.38);
    make(1.02, height - 0.05, 0xa4b89a, height);
    make(1, height, 0x74a17a, 0.16);
  }

  createScenery(chapter) {
    this.chapter = chapter;
    if (chapter === 0) {
      this.island(0, 0, 36, 18, 1);
      this.box(
        new THREE.Vector3(0, 1.03, 4.1),
        new THREE.Vector3(25, 0.06, 1.25),
        0xcbd0b5,
      );
      const palms = [
        [-13, -2],
        [-10, -5],
        [12, -3],
        [14, 2.2],
        [-13, 3.5],
        [10, 5.5],
      ];
      palms.forEach(([x, z], i) => {
        const p = this.model(
          "palm",
          new THREE.Vector3(x, 1, z),
          0.9 + (i % 2) * 0.2,
        );
        p.rotation.y = i;
      });
      [
        [-10, 2],
        [11, 2.8],
        [-12, -4],
      ].forEach(([x, z], i) =>
        this.model("supply", new THREE.Vector3(x, 1, z), 1 + i * 0.15),
      );
      for (let i = 0; i < 8; i++)
        this.model(
          "rock",
          new THREE.Vector3(-16 + i * 4.7, 0.15, 7 + Math.sin(i)),
          0.7 + (i % 3) * 0.3,
        );
      this.box(
        new THREE.Vector3(-12, 0.45, 9),
        new THREE.Vector3(2.4, 0.35, 5),
        0xb7c9ba,
      );
      this.model("boat", new THREE.Vector3(-10.5, 0.1, 11), 0.55);
      this.model("beacon", new THREE.Vector3(12, 1, -1), 1);
    } else if (chapter === 1) {
      for (let side of [-1, 1]) {
        this.box(
          new THREE.Vector3(side * 21, 0.3, -26),
          new THREE.Vector3(20, 1.4, 180),
          0xa6be9e,
        );
        this.box(
          new THREE.Vector3(side * 22, 1, -26),
          new THREE.Vector3(20, 0.15, 180),
          0x75a47f,
        );
        this.box(
          new THREE.Vector3(side * 13.2, 1.13, -26),
          new THREE.Vector3(1.6, 0.06, 180),
          0xc7ceb0,
        );
        for (let i = 0; i < 20; i++) {
          const prop = new THREE.Group();
          this.level.add(prop);
          const x = side * (16.5 + (i % 3) * 2),
            z = 24 - i * 6;
          prop.position.set(x, 1.1, z);
          this.model(
            i % 4 === 0 ? "rock" : "palm",
            new THREE.Vector3(),
            i % 4 === 0 ? 1.8 : 1.1,
            prop,
          );
          if (i % 4 === 0)
            this.model("supply", new THREE.Vector3(side * -2, 0, 1), 1, prop);
          this.scrollProps.push(prop);
        }
      }
    } else {
      for (let side of [-1, 1]) {
        this.island(side * 13, -8, 18, 38, 1.15);
        for (let i = 0; i < 7; i++) {
          this.model(
            "rock",
            new THREE.Vector3(side * (17 + (i % 3) * 2.1), 1, -24 + i * 5.2),
            2.8 + (i % 3) * 0.65,
          );
        }
        for (let i = 0; i < 4; i++)
          this.model(
            "palm",
            new THREE.Vector3(side * (16 + (i % 2) * 2), 1, 6 - i * 7),
            0.8,
          );
      }
      this.island(0, 16, 9, 9, 0.65);
      this.ring(new THREE.Vector3(0, 0.82, 16), 2.3, 0xf8dda0, 0.12);
      this.box(
        new THREE.Vector3(0, 0.8, 16),
        new THREE.Vector3(0.28, 0.03, 2),
        0xe7e4c7,
      );
      this.box(
        new THREE.Vector3(-0.7, 0.8, 16),
        new THREE.Vector3(0.28, 0.03, 2),
        0xe7e4c7,
      );
      this.box(
        new THREE.Vector3(-0.35, 0.8, 16),
        new THREE.Vector3(0.9, 0.03, 0.24),
        0xe7e4c7,
      );
      this.model("beacon", new THREE.Vector3(2.5, 0.7, 16));
    }
    this.distant = new THREE.Group();
    this.level.add(this.distant);
    for (let i = 0; i < 6; i++) {
      const x = -65 + i * 26,
        z = -65 - (i % 2) * 12;
      this.island(x, z, 17 + (i % 3) * 8, 17, 1.5, this.distant);
      this.model(
        "rock",
        new THREE.Vector3(x, 1, z),
        6 + (i % 2) * 2,
        this.distant,
      );
    }
    this.resize();
  }

  resize() {
    const width = this.canvas.clientWidth || innerWidth,
      height = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(width, height, false);
    const aspect = width / height,
      mobile = width < 700;
    const heightWorld = Math.max(
      this.chapter === 0 ? 33 : 43,
      (this.chapter === 0 ? 34 : 38) / aspect,
    );
    this.camera.left = (-heightWorld * aspect) / 2;
    this.camera.right = (heightWorld * aspect) / 2;
    this.camera.top = heightWorld / 2;
    this.camera.bottom = -heightWorld / 2;
    if (this.chapter === 0) {
      this.camera.position.set(mobile ? 10 : 17, 23, 35);
      this.target.set(0, 5, 0);
    } else if (this.chapter === 1) {
      this.camera.position.set(0, 38, 31);
      this.target.set(0, 0, -5);
    } else {
      this.camera.position.set(mobile ? 0 : 5, 32, 34);
      this.target.set(0, 1, -1);
    }
    this.camera.position.sub(this.target).multiplyScalar(2.1).add(this.target);
    if (this.distant) this.distant.visible = !mobile;
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
    this.baseCamera = this.camera.position.clone();
    this.level.traverse((object) => {
      if (object.userData.pickupBadge) this.resizeBadge(object);
    });
    this.needsRender = true;
  }

  aim(clientX, clientY, entities = []) {
    const rect = this.canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      (-(clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.ray.setFromCamera(pointer, this.camera);
    const targets = entities
      .filter((e) => !e.dead && e.mesh.visible)
      .map((e) => e.mesh);
    const hit = this.ray.intersectObjects(targets, true)[0];
    if (hit) return hit.point;
    return (
      this.ray.ray.intersectPlane(this.plane, new THREE.Vector3()) ||
      new THREE.Vector3(0, 0, -10)
    );
  }

  project(point) {
    const p = point.clone().project(this.camera),
      r = this.canvas.getBoundingClientRect();
    return {
      x: r.left + ((p.x + 1) / 2) * r.width,
      y: r.top + ((1 - p.y) / 2) * r.height,
    };
  }

  render(time, shake = 0) {
    this.needsRender = false;
    this.water.material.uniforms.time.value = time;
    this.camera.position.copy(this.baseCamera);
    if (shake > 0) {
      this.camera.position.x += Math.sin(time * 80) * shake;
      this.camera.position.y += Math.cos(time * 95) * shake * 0.5;
    }
    this.camera.updateMatrixWorld();
    // Keep floating symbols out of HUD text and controls; the supply case stays visible.
    const pixelScale =
      this.canvas.clientHeight /
      ((this.camera.top - this.camera.bottom) / this.camera.zoom);
    for (const badge of this.pickupBadges) {
      const point = this.project(badge.getWorldPosition(this.badgePoint));
      const halfWidth = (badge.scale.x * pixelScale) / 2;
      const top = point.y - badge.scale.y * pixelScale;
      badge.visible = !this.badgeKeepouts.some(
        (rect) =>
          point.x - halfWidth < rect.right &&
          point.x + halfWidth > rect.left &&
          top < rect.bottom &&
          point.y > rect.top,
      );
    }
    this.renderer.render(this.scene, this.camera);
  }
}
