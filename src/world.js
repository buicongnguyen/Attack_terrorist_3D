import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MODELS, ASSET_REVISION } from "./data.js";
import { createPickupBadgeMaterial, badgeWorldSize } from "./pickups.js";
import { createRescueScenery } from "./rescue-world.js";
import { STRIKE_MISSIONS, CITY, FLIGHT, cityBounds } from "./strike-data.js";
import { consolidate } from "./consolidate.js";

const materialCache = new Map();
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const sphereGeometry = new THREE.IcosahedronGeometry(1, 2);
export const material = (color) => {
  if (!materialCache.has(color))
    materialCache.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.62 }));
  return materialCache.get(color);
};

// Time of day per chapter: harbour morning, river midday, valley sunset.
const MOODS = [
  {
    top: 0x2f7fe0,
    horizon: 0xffd9a8,
    sun: 0xffe2b8,
    sunIntensity: 3.1,
    sky: 0xbfe6ff,
    ground: 0x8a6a45,
    hemi: 1.35,
    rim: 0x8fc8ff,
    water: [0.02, 0.36, 0.5, 0.05, 0.62, 0.7],
    exposure: 1.0,
    sunOffset: [-26, 44, 30],
  },
  {
    top: 0x1f78d8,
    horizon: 0xc6f1ff,
    sun: 0xfff1d0,
    sunIntensity: 3.2,
    sky: 0xc9ecff,
    ground: 0x6f8a3f,
    hemi: 1.4,
    rim: 0x9fdcff,
    water: [0.02, 0.32, 0.36, 0.06, 0.58, 0.55],
    exposure: 1.0,
    sunOffset: [-20, 48, 22],
  },
  {
    top: 0x3a3d8f,
    horizon: 0xff9a5a,
    sun: 0xffc98f,
    sunIntensity: 2.8,
    sky: 0xb9c9ff,
    ground: 0x6a5a7a,
    hemi: 1.45,
    rim: 0xc7a8ff,
    water: [0.08, 0.24, 0.38, 0.3, 0.46, 0.52],
    exposure: 1.02,
    sunOffset: [-52, 26, 18],
  },
];

let textures = null;
function fxTextures() {
  if (textures) return textures;
  const make = (draw) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    draw(canvas.getContext("2d"));
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };
  textures = {
    glow: make((c) => {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.35, "rgba(255,255,255,0.75)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
    }),
    smoke: make((c) => {
      for (let i = 0; i < 7; i++) {
        const x = 32 + Math.cos(i * 1.7) * 9,
          y = 32 + Math.sin(i * 2.3) * 9;
        const g = c.createRadialGradient(x, y, 0, x, y, 20);
        g.addColorStop(0, "rgba(255,255,255,0.55)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = g;
        c.fillRect(0, 0, 64, 64);
      }
    }),
  };
  return textures;
}

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
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xffd9a8, 170, 330);
    this.camera = new THREE.OrthographicCamera(-30, 30, 20, -20, 0.1, 500);
    this.hemi = new THREE.HemisphereLight(0xbfe6ff, 0x8a6a45, 1.35);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffe2b8, 3.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 160 });
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.bias = -0.0003;
    this.scene.add(this.sun, this.sun.target);
    this.rim = new THREE.DirectionalLight(0x8fc8ff, 0.9);
    this.rim.position.set(20, 18, -40);
    this.scene.add(this.rim);
    this.flashLight = new THREE.PointLight(0xffb45c, 0, 26, 1.6);
    this.scene.add(this.flashLight);
    this.flashLevel = 0;
    this.sky = this.createSky();
    this.scene.add(this.sky);
    this.level = new THREE.Group();
    this.scene.add(this.level);
    this.assets = new Map();
    this.badgeMaterials = new Map();
    this.pickupBadges = new Set();
    this.badgeKeepouts = [];
    this.badgePoint = new THREE.Vector3();
    this.scrollProps = [];
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.target = new THREE.Vector3();
    this.baseCamera = new THREE.Vector3();
    this.water = this.createWater();
    this.scene.add(this.water);
    this.missing = new Set();
    this.lastRender = 0;
    this.resize();
  }

  async loadAssets(progress) {
    const loader = new GLTFLoader();
    let count = 0;
    await Promise.all(
      MODELS.map(async (name) => {
        try {
          const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb?v=${ASSET_REVISION}`);
          consolidate(gltf.scene);
          gltf.scene.traverse((obj) => {
            if (obj.isMesh) {
              obj.castShadow = true;
              obj.receiveShadow = true;
            }
          });
          this.assets.set(name, gltf.scene);
        } catch (error) {
          this.missing.add(name);
          console.warn(`Model ${name} is unavailable`, error);
        }
        progress(++count / MODELS.length);
      }),
    );
    // A mission with invisible enemies is worse than a clear error, so a missing model stops the boot.
    if (this.missing.size) throw new Error(`Missing models: ${[...this.missing].join(", ")}`);
  }

  model(name, position = new THREE.Vector3(), scale = 1, parent = this.level) {
    const source = this.assets.get(name);
    const group = source ? source.clone(true) : new THREE.Group();
    group.position.copy(position);
    group.scale.setScalar(scale);
    if (name === "boat") {
      for (const part of ["TwinGunL", "TwinGunR", "SupportRack"]) {
        const node = group.getObjectByName(part);
        if (node) node.visible = false;
      }
    }
    parent.add(group);
    return group;
  }

  // Many copies of one model: a single instanced draw call per model part.
  instances(name, placements, parent = this.level, options = {}) {
    const source = this.assets.get(name);
    if (!source || !placements.length) return [];
    source.updateMatrixWorld(true);
    const rootInverse = source.matrixWorld.clone().invert();
    const matrix = new THREE.Matrix4(),
      part = new THREE.Matrix4(),
      rotation = new THREE.Quaternion(),
      scale = new THREE.Vector3(),
      up = new THREE.Vector3(0, 1, 0),
      tint = new THREE.Color();
    const created = [];
    source.traverse((mesh) => {
      if (!mesh.isMesh) return;
      part.multiplyMatrices(rootInverse, mesh.matrixWorld);
      const paint = options.paint && mesh.material.name === options.paint;
      const material = paint ? mesh.material.clone() : mesh.material;
      if (paint) material.color.set(0xffffff);
      const batch = new THREE.InstancedMesh(mesh.geometry, material, placements.length);
      placements.forEach((p, i) => {
        rotation.setFromAxisAngle(up, p.rotation || 0);
        scale.setScalar(p.scale || 1);
        batch.setMatrixAt(i, matrix.compose(p.position, rotation, scale).multiply(part));
        if (paint) batch.setColorAt(i, tint.set(p.color || 0xffffff));
      });
      batch.castShadow = options.shadow ?? true;
      batch.receiveShadow = true;
      batch.instanceMatrix.needsUpdate = true;
      batch.computeBoundingSphere();
      if (paint) batch.userData.ownedMaterial = true;
      parent.add(batch);
      created.push(batch);
    });
    return created;
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

  sphere(position, scale, color, parent = this.level) {
    const mesh = new THREE.Mesh(sphereGeometry, material(color));
    mesh.position.copy(position);
    mesh.scale.copy(scale);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  fxSprite(kind, color, opacity = 1, additive = false) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: fxTextures()[kind],
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        toneMapped: !additive,
      }),
    );
    sprite.userData.ownedMaterial = true;
    sprite.renderOrder = additive ? 4 : 3;
    this.level.add(sprite);
    return sprite;
  }

  lightFlash(position, radius) {
    this.flashLight.position.copy(position).add(new THREE.Vector3(0, 1.5, 0));
    this.flashLevel = Math.max(this.flashLevel, radius * 22);
    this.flashLight.distance = 8 + radius * 5;
  }

  pickupBadge(kind, parent) {
    if (!this.badgeMaterials.has(kind)) this.badgeMaterials.set(kind, createPickupBadgeMaterial(kind));
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
    const size = badgeWorldSize(this.camera, this.canvas.clientHeight, this.canvas.clientWidth < 700 ? 46 : 50);
    badge.scale.set(size.width, size.height, 1);
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
      if (child.isInstancedMesh) child.dispose();
      if (child.userData.ownedMap) child.material?.map?.dispose();
      if (child.userData.disposable) {
        child.geometry?.dispose();
        child.material?.dispose();
      } else if (child.userData.ownedMaterial) child.material?.dispose();
    });
    object.removeFromParent();
  }

  clear() {
    this.disposeObject(this.level);
    this.level = new THREE.Group();
    this.scene.add(this.level);
    this.scrollProps = [];
    this.followPosition = null;
    this.followPlayerPosition = null;
    this.sceneryChunks = [];
    this.distant = null;
    this.flashLevel = 0;
  }

  createSky() {
    const geometry = new THREE.SphereGeometry(450, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x2f7fe0) },
        horizon: { value: new THREE.Color(0xffd9a8) },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vDir;
        void main(){ float h = clamp(vDir.y * 1.6 + 0.15, 0., 1.); vec3 c = mix(horizon, top, pow(h, .8));
          gl_FragColor = vec4(c, 1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const sky = new THREE.Mesh(geometry, mat);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    return sky;
  }

  createWater() {
    const geometry = new THREE.PlaneGeometry(700, 700, 110, 110);
    geometry.rotateX(-Math.PI / 2);
    const shader = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        deep: { value: new THREE.Vector3(0.02, 0.36, 0.5) },
        shallow: { value: new THREE.Vector3(0.05, 0.62, 0.7) },
        haze: { value: new THREE.Color(0xffd9a8) },
      },
      vertexShader: `uniform float time; varying vec3 worldP;
        void main() { vec3 p = position;
          p.y += sin(p.x*.48+time*.8)*.07 + sin(p.z*.62-time)*.055;
          worldP = (modelMatrix*vec4(p,1.)).xyz;
          gl_Position=projectionMatrix*viewMatrix*vec4(worldP,1.); }`,
      fragmentShader: `uniform float time; uniform vec3 deep; uniform vec3 shallow; uniform vec3 haze; varying vec3 worldP;
        void main() { vec2 p=worldP.xz;
          float ripple=sin(p.y*2.6+sin(p.x*.45+time*.17)*1.2-time*1.3);
          float cross=sin(p.x*1.7-p.y*.9+time*.9);
          float bands=sin(p.y*.16-time*.2+sin(p.x*.21))*.5+.5;
          vec3 c=mix(deep,shallow,.25+bands*.6);
          float foam=pow(max(0.,ripple),22.)*smoothstep(.2,.9,sin(p.x*.36+p.y*.3))*.12;
          float glint=pow(max(0.,ripple*cross),40.)*.35;
          c+=vec3(.75,.95,.9)*foam + vec3(1.,.95,.8)*glint;
          float distanceFog=smoothstep(60.,210.,length(p));
          c=mix(c,haze,distanceFog*.7);
          gl_FragColor=vec4(c,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return new THREE.Mesh(geometry, shader);
  }

  applyMood(chapter) {
    const mood = MOODS[chapter] || MOODS[0];
    this.sky.material.uniforms.top.value.set(mood.top);
    this.sky.material.uniforms.horizon.value.set(mood.horizon);
    this.scene.fog.color.set(mood.horizon);
    this.sun.color.set(mood.sun);
    this.sun.intensity = mood.sunIntensity;
    this.hemi.color.set(mood.sky);
    this.hemi.groundColor.set(mood.ground);
    this.hemi.intensity = mood.hemi;
    this.rim.color.set(mood.rim);
    const [a, b, c, d, e, f] = mood.water;
    this.water.material.uniforms.deep.value.set(a, b, c);
    this.water.material.uniforms.shallow.value.set(d, e, f);
    this.water.material.uniforms.haze.value.set(mood.horizon);
    this.renderer.toneMappingExposure = mood.exposure;
    this.sunOffset = new THREE.Vector3(...mood.sunOffset);
  }

  island(x, z, width, depth, height = 1, parent = this.level, colors = [0xf2d19a, 0xc99f74, 0x5cbf45]) {
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
        bevelEnabled: true,
        bevelSize: 0.35,
        bevelThickness: 0.2,
        bevelSegments: 2,
      });
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, material(color));
      mesh.position.set(x, top - layerHeight, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // The geometry is unique to this island (released on the next scenery build); the material is shared.
      parent.add(mesh);
      this.ownedGeometries.push(geo);
    };
    this.ownedGeometries = this.ownedGeometries || [];
    make(1.12, 0.18, colors[0], 0.38);
    make(1.02, height - 0.05, colors[1], height);
    make(1, height, colors[2], 0.16);
  }

  createScenery(chapter, mission, index = 0) {
    for (const geometry of this.ownedGeometries || []) geometry.dispose();
    this.ownedGeometries = [];
    this.chapter = chapter;
    this.missionIndex = index;
    this.applyMood(chapter);
    this.strikeLayout = chapter === 0 ? STRIKE_MISSIONS[index] : null;
    this.strikeFollow = { x: 0, z: 0 };
    if (chapter === 0) this.createHarbour();
    else if (chapter === 1) this.createRiver();
    else createRescueScenery(this, mission);
    this.resize();
  }

  createHarbour() {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const layout = this.strikeLayout;
    const bounds = cityBounds(layout);
    const south = bounds.maxZ + 7;
    // Moored boats along the quay and islands on the horizon give the district a place in the world.
    // (Not in a harbour mission, where a boat past the quay could be mistaken for a target.)
    for (let i = 0; i < (layout.harbour ? 0 : 4); i++) {
      const boat = this.model("boat", V(-22 + i * 14, 0.05, south + 4 + (i % 2) * 2), 0.8);
      boat.rotation.y = Math.PI / 2 + (i % 2 ? 0.2 : -0.15);
    }
    const distant = new THREE.Group();
    this.level.add(distant);
    const span = bounds.maxX - bounds.minX + 80;
    for (let i = 0; i < 5; i++) {
      const x = bounds.minX - 40 + (i * span) / 4,
        z = bounds.minZ - 48 - (i % 2) * 14;
      this.island(x, z, 22 + (i % 3) * 8, 16, 2 + (i % 2), distant);
      this.model("rock", V(x - 3, 2, z), 3 + (i % 2) * 1.5, distant);
      for (let p = 0; p < 2; p++) this.model("palm", V(x + 4 + p * 3, 2.6, z + 3 - p * 2), 1.2, distant);
    }
    // Distant dressing never needs to cast shadows into the playable district.
    distant.traverse((child) => (child.castShadow = false));
    this.distant = distant;
  }

  createRiver() {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    for (const side of [-1, 1]) {
      this.box(V(side * 25.5, 0.3, -30), V(22, 1.4, 200), 0x6fbf4a);
      this.box(V(side * 13.3, 0.42, -30), V(2.4, 1.16, 200), 0xf2d19a);
      this.box(V(side * 26, 1.06, -30), V(21, 0.12, 200), 0x5cbf45);
      for (let i = 0; i < 22; i++) {
        const prop = new THREE.Group();
        this.level.add(prop);
        const x = side * (16.8 + (i % 3) * 2.4),
          z = 30 - i * 6;
        prop.position.set(x, 1.1, z);
        const kind = i % 5 === 2 ? "stilt-house" : i % 4 === 0 ? "rock" : i % 2 ? "jungle-tree" : "palm";
        const name = this.assets.has(kind) ? kind : "palm";
        const mesh = this.model(name, V(), kind === "rock" ? 1.8 : kind === "stilt-house" ? 1 : 1.15, prop);
        mesh.rotation.y = i * 1.3 + side;
        this.scrollProps.push(prop);
      }
    }
  }

  resize() {
    const width = this.canvas.clientWidth || innerWidth,
      height = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(width, height, false);
    this.canvasRect = this.canvas.getBoundingClientRect();
    const aspect = width / height,
      mobile = width < 700;
    if (this.chapter === 0 && this.strikeLayout) this.frameCity(aspect, mobile);
    else {
      this.strikeWindow = null;
      const heightWorld = Math.max(43, 38 / aspect);
      this.camera.left = (-heightWorld * aspect) / 2;
      this.camera.right = (heightWorld * aspect) / 2;
      this.camera.top = heightWorld / 2;
      this.camera.bottom = -heightWorld / 2;
      if (this.chapter === 1) {
        this.camera.position.set(0, 38, 31);
        this.target.set(0, 0, -5);
      } else {
        this.camera.position.set(mobile ? 0 : 5, 32, 34);
        this.target.set(0, 1, -1);
      }
      this.camera.position.sub(this.target).multiplyScalar(2.1).add(this.target);
      this.camera.lookAt(this.target);
      this.camera.updateProjectionMatrix();
    }
    if (this.distant) this.distant.visible = !mobile;
    this.baseCamera.copy(this.camera.position);
    if (this.chapter === 2 && this.followPlayerPosition) this.followPlayer(this.followPlayerPosition, 0, true);
    else if (this.strikeWindow) this.applyStrikeCamera();
    else {
      this.sun.position.copy(this.sunOffset || new THREE.Vector3(-26, 44, 30));
      this.sun.target.position.set(0, 0, 0);
    }
    this.level.traverse((object) => {
      if (object.userData.pickupBadge) this.resizeBadge(object);
    });
    this.needsRender = true;
  }

  // Fit a window of the city and the formation's flight band inside the HUD-free part of the
  // screen. A harbour's window is the whole basin; a big city's is about the old district's size,
  // and the camera slides it after the flight (followStrike).
  frameCity(aspect, mobile) {
    const layout = this.strikeLayout;
    const w = layout.grid ? 1.75 * CITY.pitch + 4 : (layout.cols * CITY.pitch) / 2 + 4,
      d = layout.grid ? 1.5 * CITY.pitch + 5 : (layout.rows * CITY.pitch) / 2 + 5;
    this.strikeWindow = { w, d, bounds: cityBounds(layout) };
    this.target.set(0, 4, 0);
    // Portrait phones look along the flight path so the district fills the screen width:
    // the formation then flies down the screen instead of across it.
    this.strikePortrait = aspect < 0.85;
    if (this.strikePortrait) this.camera.position.set(58, 62, 6);
    else this.camera.position.set(6, 62, 58);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld(true);
    const inverse = this.camera.matrixWorldInverse;
    const min = new THREE.Vector2(Infinity, Infinity),
      max = new THREE.Vector2(-Infinity, -Infinity);
    const include = (x, y, z) => {
      const p = new THREE.Vector3(x, y, z).applyMatrix4(inverse);
      min.min(new THREE.Vector2(p.x, p.y));
      max.max(new THREE.Vector2(p.x, p.y));
    };
    for (const x of [-w, w]) for (const z of [-d, d]) include(x, CITY.ground, z);
    // Keep the formation in view once it is over the district (portrait: from its first third).
    // Landscape frames the whole sweep, turns included, so the wingover at either edge stays in
    // view. Portrait looks along the flight path and keeps the district large instead.
    const sweep = layout.grid ? w + 2 : (layout.cols * CITY.pitch) / 2 + FLIGHT.turnMargin + FLIGHT.turnReach * 0.5;
    const band = this.strikePortrait ? [-w * 0.3, w] : [-sweep, sweep];
    for (const x of band) for (const z of [-d + 3, d - 3]) include(x, FLIGHT.altitude, z);
    // HUD bands the district must avoid: top bar, flight panel, and (landscape phones) the side panel.
    const tall = this.canvas.clientHeight || innerHeight;
    const landscapePhone = aspect > 1 && tall < 520;
    const smallLandscape = landscapePhone && tall <= 420;
    const topShare = this.strikePortrait ? 0.14 : landscapePhone ? 0.15 : mobile ? 0.12 : 0.1;
    // The UI reports how much of the screen bottom its flight panel and stick cover (hudInset).
    const measured = this.hudInset ? this.hudInset / tall + 0.02 : 0;
    const bottomShare = Math.max(
      this.strikePortrait ? 0.3 : smallLandscape ? 0.2 : landscapePhone ? 0.04 : mobile ? 0.3 : 0.22,
      measured,
    );
    const rightShare = smallLandscape ? 0.18 : landscapePhone ? 0.4 : 0;
    let spanY = (max.y - min.y) / (1 - topShare - bottomShare);
    let spanX = ((max.x - min.x) * 1.04) / (1 - rightShare);
    if (spanX / spanY > aspect) spanY = spanX / aspect;
    else spanX = spanY * aspect;
    const cx = (min.x + max.x) / 2 + (spanX * rightShare) / 2;
    // Camera-space y grows up the screen: a larger bottom reserve moves the view centre down,
    // which lifts the district clear of the flight panel.
    const cy = (min.y + max.y) / 2 + (spanY * (topShare - bottomShare)) / 2;
    this.camera.left = cx - spanX / 2;
    this.camera.right = cx + spanX / 2;
    this.camera.top = cy + spanY / 2;
    this.camera.bottom = cy - spanY / 2;
    this.camera.updateProjectionMatrix();
    // The camera's pose for a window centred on the origin; following only translates it.
    this.strikeCameraBase = this.camera.position.clone();
  }

  // Slide the strike window after `point` (the pipper): it may wander around the middle of the
  // window freely; only near the edge does the window move, smoothly, and never past the city.
  followStrike(point, dt, snap = false) {
    const win = this.strikeWindow;
    if (!win) return;
    const f = this.strikeFollow;
    const hx = win.w * 0.35,
      hz = win.d * 0.3;
    const keep = (value, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, value)));
    let tx = keep(f.x, point.x - hx, point.x + hx),
      tz = keep(f.z, point.z - hz, point.z + hz);
    tx = keep(tx, win.bounds.minX + win.w - 6, win.bounds.maxX - win.w + 6);
    tz = keep(tz, win.bounds.minZ + win.d - 6, win.bounds.maxZ - win.d + 6);
    if (snap) {
      f.x = tx;
      f.z = tz;
    } else {
      const k = 1 - Math.exp(-dt * 2.5);
      f.x += (tx - f.x) * k;
      f.z += (tz - f.z) * k;
    }
    this.applyStrikeCamera();
  }

  applyStrikeCamera() {
    if (!this.strikeCameraBase) return;
    const f = this.strikeFollow;
    this.camera.position.copy(this.strikeCameraBase).add(new THREE.Vector3(f.x, 0, f.z));
    this.camera.updateMatrixWorld();
    this.baseCamera.copy(this.camera.position);
    // The sun and its shadow map travel with the window.
    this.sun.position.set(f.x, 0, f.z).add(this.sunOffset || new THREE.Vector3(-26, 44, 30));
    this.sun.target.position.set(f.x, 0, f.z);
    this.sun.target.updateMatrixWorld();
    this.needsRender = true;
  }

  // The rooftop or ground point under a screen position in the strike view.
  pickStrike(clientX, clientY, buildings, groundY) {
    const rect = this.canvasRect || this.canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, (-(clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(pointer, this.camera);
    const ray = this.ray.ray,
      box = new THREE.Box3(),
      hit = new THREE.Vector3();
    let best = null;
    for (const b of buildings) {
      box.min.set(b.min[0], b.min[1], b.min[2]);
      box.max.set(b.max[0], b.max[1], b.max[2]);
      if (!ray.intersectBox(box, hit)) continue;
      const d = hit.distanceTo(ray.origin);
      if (!best || d < best.d) best = { d, x: hit.x, y: hit.y, z: hit.z, building: b.id };
    }
    if (best) return best;
    const p = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY), new THREE.Vector3());
    return p ? { x: p.x, y: groundY, z: p.z, building: null } : null;
  }

  followPlayer(position, dt, snap = false) {
    this.followPlayerPosition = position.clone();
    const goal = new THREE.Vector3(position.x, 0, position.z - 7);
    if (!this.followPosition || snap) this.followPosition = goal;
    else this.followPosition.lerp(goal, 1 - Math.exp(-dt * 5));
    this.baseCamera.copy(this.followPosition).add(new THREE.Vector3(0, 65, 68));
    this.camera.position.copy(this.baseCamera);
    this.camera.lookAt(this.followPosition);
    this.camera.updateMatrixWorld();
    this.sun.position.copy(this.followPosition).add(this.sunOffset || new THREE.Vector3(-26, 44, 30));
    this.sun.target.position.copy(this.followPosition);
    for (const chunk of this.sceneryChunks || []) chunk.visible = Math.abs(chunk.userData.centerZ - position.z) < 75;
  }

  screenDirection(raw) {
    const origin = new THREE.Vector3(),
      endpoint = new THREE.Vector3();
    this.ray.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.ray.ray.intersectPlane(this.plane, origin);
    this.ray.setFromCamera(
      new THREE.Vector2((raw.x * 0.1 * this.canvas.clientHeight) / this.canvas.clientWidth, -raw.z * 0.1),
      this.camera,
    );
    this.ray.ray.intersectPlane(this.plane, endpoint);
    return endpoint.sub(origin).setY(0).normalize();
  }

  aim(clientX, clientY, entities = []) {
    const rect = this.canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      (-(clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.ray.setFromCamera(pointer, this.camera);
    const targets = entities.filter((e) => !e.dead && e.mesh.visible).map((e) => e.mesh);
    const hit = this.ray.intersectObjects(targets, true)[0];
    if (hit) return hit.point;
    return this.ray.ray.intersectPlane(this.plane, new THREE.Vector3()) || new THREE.Vector3(0, 0, -10);
  }

  project(point) {
    // The canvas rect is cached on resize: reading it per label forced a layout after every HUD write.
    const p = new THREE.Vector3(point.x, point.y, point.z).project(this.camera),
      r = this.canvasRect || this.canvas.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height, visible: p.z < 1 };
  }

  render(time, shake = 0) {
    const delta = Math.max(0, Math.min(0.1, time - this.lastRender));
    this.lastRender = time;
    this.needsRender = false;
    this.water.material.uniforms.time.value = time;
    this.flashLevel = Math.max(0, this.flashLevel - delta * 160);
    this.flashLight.intensity = this.flashLevel;
    this.camera.position.copy(this.baseCamera);
    if (shake > 0) {
      this.camera.position.x += Math.sin(time * 80) * shake;
      this.camera.position.y += Math.cos(time * 95) * shake * 0.5;
    }
    this.camera.updateMatrixWorld();
    this.sky.position.copy(this.camera.position);
    // Keep floating symbols out of HUD text and controls; the supply case stays visible.
    const pixelScale = this.canvas.clientHeight / ((this.camera.top - this.camera.bottom) / this.camera.zoom);
    for (const badge of this.pickupBadges) {
      const point = this.project(badge.getWorldPosition(this.badgePoint));
      const halfWidth = (badge.scale.x * pixelScale) / 2;
      const top = point.y - badge.scale.y * pixelScale;
      badge.visible = !this.badgeKeepouts.some(
        (rect) =>
          point.x - halfWidth < rect.right && point.x + halfWidth > rect.left && top < rect.bottom && point.y > rect.top,
      );
    }
    this.renderer.render(this.scene, this.camera);
  }
}
