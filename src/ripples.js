import * as THREE from "three";

// Ripples (2.5): two rings spread out from under every live target, so the eye finds them from
// anywhere on screen. One instanced mesh draws them all; each ring fades through its own alpha.
export class Ripples {
  constructor(view, capacity) {
    const count = Math.max(1, capacity * 2);
    const geometry = new THREE.RingGeometry(0.82, 1, 48);
    geometry.rotateX(-Math.PI / 2);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    this.alpha.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("rippleAlpha", this.alpha);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        "void main() {",
        "attribute float rippleAlpha;\nvarying float vRippleAlpha;\nvoid main() {\n  vRippleAlpha = rippleAlpha;",
      );
      shader.fragmentShader = shader.fragmentShader
        .replace("void main() {", "varying float vRippleAlpha;\nvoid main() {")
        .replace("#include <opaque_fragment>", "#include <opaque_fragment>\n  gl_FragColor.a *= vRippleAlpha;");
    };
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.userData.disposable = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(0));
    view.level.add(this.mesh);
    this.color = new THREE.Color();
    this.matrix = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.s = new THREE.Vector3();
    this.p = new THREE.Vector3();
  }

  // `items`: { x, y, z, size, color, gain } for every target to ripple under this frame.
  update(time, items) {
    let i = 0;
    for (const t of items) {
      if (i + 2 > this.mesh.count) break;
      for (let k = 0; k < 2; k++) {
        const phase = (time * 0.7 + k * 0.5 + (t.x + t.z) * 0.013 + 10) % 1;
        const scale = t.size * (0.45 + phase * 1.3);
        this.p.set(t.x, t.y, t.z);
        this.s.set(scale, 1, scale);
        this.mesh.setMatrixAt(i, this.matrix.compose(this.p, this.q, this.s));
        this.mesh.setColorAt(i, this.color.set(t.color));
        this.alpha.setX(i, (1 - phase) * t.gain);
        i++;
      }
    }
    for (; i < this.mesh.count; i++) this.mesh.setMatrixAt(i, this.matrix.makeScale(0, 0, 0));
    this.mesh.instanceMatrix.needsUpdate = true;
    this.alpha.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

const healthCache = new Map();

// A health bar marker: one pip per hit the target can take, lit for what it has left; yellow
// while a pattern covers it, and a star in front for a key target. One-hit boats are a dot.
export function healthMaterial(hp, max, marked = false, key = false) {
  const kind = `${hp}:${max}:${marked ? 1 : 0}:${key ? 1 : 0}`;
  if (healthCache.has(kind)) return healthCache.get(kind);
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 48;
  const c = canvas.getContext("2d");
  const fill = marked ? "#ffd23f" : "#ff4b2b";
  const pips = Math.max(1, max),
    w = pips === 1 ? 20 : Math.min(18, 84 / pips),
    gap = 4,
    total = pips * w + (pips - 1) * gap + (key ? 30 : 0);
  let x = (128 - total) / 2;
  if (key) {
    c.textBaseline = "middle";
    c.fillStyle = "#1a1420";
    c.font = "bold 34px Arial";
    c.fillText("★", x - 2, 26);
    c.fillStyle = fill;
    c.font = "bold 28px Arial";
    c.fillText("★", x, 26);
    x += 30;
  }
  for (let i = 0; i < pips; i++) {
    c.fillStyle = "#1a1420";
    c.beginPath();
    c.roundRect(x - 3, 11, w + 6, 26, 7);
    c.fill();
    c.fillStyle = i < hp ? fill : "rgba(255, 255, 255, 0.25)";
    c.beginPath();
    c.roundRect(x, 14, w, 20, 5);
    c.fill();
    x += w + gap;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, transparent: true, toneMapped: false });
  healthCache.set(kind, material);
  return material;
}
