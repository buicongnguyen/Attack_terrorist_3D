// GPU particle pools (3.0). Every glow, spark and puff of smoke used to be its own sprite with
// its own material, so a heavy firefight drew a few hundred extra calls. Now each pool is one
// instanced draw: a particle is written once when it is born (where, how fast, how it falls,
// grows and fades, its colour), and the vertex shader moves it from its age. Nothing is touched
// per frame but one time uniform; the newest particle overwrites the oldest when a pool is full.
import * as THREE from "three";

const VERTEX = `
attribute vec4 aStart;
attribute vec4 aVel;
attribute vec4 aShape;
attribute vec3 aTint;
uniform float uTime;
varying vec2 vUv;
varying vec4 vTint;
#include <fog_pars_vertex>
void main() {
  float t = uTime - aStart.w;
  float age = t / aShape.z;
  if (t < 0.0 || age >= 1.0) {
    // Dead or unborn: outside clip space, so it never rasterises.
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec3 p = aStart.xyz + aVel.xyz * t;
  p.y -= 0.5 * aVel.w * t * t;
  float size = max(0.01, aShape.x * (1.0 + age * aShape.y));
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  mvPosition.xy += position.xy * size;
  gl_Position = projectionMatrix * mvPosition;
  vUv = uv;
  // Full strength for the first half of its life, then fading out.
  vTint = vec4(aTint, aShape.w * min(1.0, (1.0 - age) * 2.0));
  #include <fog_vertex>
}`;

const FRAGMENT = `
uniform sampler2D uMap;
varying vec2 vUv;
varying vec4 vTint;
#include <fog_pars_fragment>
void main() {
  vec4 texel = texture2D(uMap, vUv);
  gl_FragColor = vec4(vTint.rgb * texel.rgb, texel.a * vTint.a);
  if (gl_FragColor.a < 0.004) discard;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class FxPool {
  constructor(texture, { capacity = 512, additive = false, renderOrder = 3, name = "fx" } = {}) {
    this.capacity = capacity;
    this.next = 0;
    this.time = 0;
    this.spawned = 0;
    const quad = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute("position", quad.getAttribute("position"));
    geometry.setAttribute("uv", quad.getAttribute("uv"));
    const attribute = (size) => new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size).setUsage(THREE.DynamicDrawUsage);
    this.start = attribute(4);
    this.vel = attribute(4);
    this.shape = attribute(4);
    this.tint = attribute(3);
    // Every slot starts long dead.
    for (let i = 0; i < capacity; i++) {
      this.start.array[i * 4 + 3] = -1e6;
      this.shape.array[i * 4 + 2] = 1;
    }
    geometry.setAttribute("aStart", this.start);
    geometry.setAttribute("aVel", this.vel);
    geometry.setAttribute("aShape", this.shape);
    geometry.setAttribute("aTint", this.tint);
    geometry.instanceCount = capacity;
    this.uniforms = { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: { value: 0 }, uMap: { value: texture } };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      // Glows stay bright; smoke takes the scene's tone mapping like everything else.
      toneMapped: !additive,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.name = name;
    this.color = new THREE.Color();
    this.dirtyFrom = Infinity;
    this.dirtyTo = -1;
  }

  // One particle. `v` is a velocity { x, y, z } (or null for still), `gravity` pulls it down in
  // m/s², `grow` is how much it swells over its life (negative shrinks), `opacity` its strength.
  spawn(p, v, size, grow, life, color, opacity = 1, gravity = 0) {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.spawned++;
    const s = this.start.array,
      ve = this.vel.array,
      sh = this.shape.array,
      ti = this.tint.array;
    s[i * 4] = p.x;
    s[i * 4 + 1] = p.y;
    s[i * 4 + 2] = p.z;
    s[i * 4 + 3] = this.time;
    ve[i * 4] = v ? v.x : 0;
    ve[i * 4 + 1] = v ? v.y : 0;
    ve[i * 4 + 2] = v ? v.z : 0;
    ve[i * 4 + 3] = gravity;
    sh[i * 4] = size;
    sh[i * 4 + 1] = grow;
    sh[i * 4 + 2] = Math.max(0.01, life);
    sh[i * 4 + 3] = opacity;
    this.color.set(color).toArray(ti, i * 3);
    this.dirtyFrom = Math.min(this.dirtyFrom, i);
    this.dirtyTo = Math.max(this.dirtyTo, i);
  }

  // Advance the clock (frozen while paused) and upload only the slots written since last time.
  update(dt) {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    if (this.dirtyTo < 0) return;
    const from = this.dirtyFrom,
      count = this.dirtyTo - from + 1;
    for (const attribute of [this.start, this.vel, this.shape, this.tint]) {
      if (!attribute) continue;
      const size = attribute.itemSize;
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(from * size, count * size);
      attribute.needsUpdate = true;
    }
    this.dirtyFrom = Infinity;
    this.dirtyTo = -1;
  }

  // A new mission: every particle dies at once.
  reset() {
    for (let i = 0; i < this.capacity; i++) this.start.array[i * 4 + 3] = -1e6;
    this.dirtyFrom = 0;
    this.dirtyTo = this.capacity - 1;
  }

  // Particles alive now (for QA).
  alive() {
    let n = 0;
    for (let i = 0; i < this.capacity; i++) {
      const t = this.time - this.start.array[i * 4 + 3];
      if (t >= 0 && t < this.shape.array[i * 4 + 2]) n++;
    }
    return n;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

// Expanding rings on the water or the ground (shock rings, wakes, splashes): one draw for all.
// The band is drawn in the fragment shader on a flat quad; the ring keeps its proportions as it
// grows (as the old scaled ring meshes did) and fades out over its life.
const RING_VERTEX = `
attribute vec4 aStart;
attribute vec4 aShape;
attribute vec3 aTint;
uniform float uTime;
varying vec2 vLocal;
varying vec4 vTint;
varying float vInner;
#include <fog_pars_vertex>
void main() {
  float t = uTime - aStart.w;
  float age = t / aShape.z;
  if (t < 0.0 || age >= 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float r = aShape.x * (1.0 + age * aShape.y);
  vec3 p = aStart.xyz + vec3(position.x * r, 0.0, position.y * r);
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vLocal = position.xy;
  vInner = aShape.w;
  vTint = vec4(aTint, (1.0 - age) * 0.6);
  #include <fog_vertex>
}`;
const RING_FRAGMENT = `
varying vec2 vLocal;
varying vec4 vTint;
varying float vInner;
#include <fog_pars_fragment>
void main() {
  float d = length(vLocal);
  float edge = fwidth(d);
  float band = smoothstep(vInner - edge, vInner + edge, d) * (1.0 - smoothstep(1.0 - edge, 1.0 + edge, d));
  if (band < 0.01) discard;
  gl_FragColor = vec4(vTint.rgb, vTint.a * band);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class RingPool {
  constructor({ capacity = 256 } = {}) {
    this.capacity = capacity;
    this.next = 0;
    this.time = 0;
    this.spawned = 0;
    const quad = new THREE.PlaneGeometry(2, 2);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute("position", quad.getAttribute("position"));
    const attribute = (size) => new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size).setUsage(THREE.DynamicDrawUsage);
    this.start = attribute(4);
    this.shape = attribute(4);
    this.tint = attribute(3);
    for (let i = 0; i < capacity; i++) {
      this.start.array[i * 4 + 3] = -1e6;
      this.shape.array[i * 4 + 2] = 1;
    }
    geometry.setAttribute("aStart", this.start);
    geometry.setAttribute("aShape", this.shape);
    geometry.setAttribute("aTint", this.tint);
    geometry.instanceCount = capacity;
    this.uniforms = { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: { value: 0 } };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: RING_VERTEX,
      fragmentShader: RING_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.name = "fx-rings";
    this.color = new THREE.Color();
    this.dirtyFrom = Infinity;
    this.dirtyTo = -1;
  }

  // A ring of `radius` and band `thickness` at `p`, growing by `growth` times its radius.
  spawn(p, radius, color, thickness, life, growth) {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.spawned++;
    this.start.array.set([p.x, p.y, p.z, this.time], i * 4);
    this.shape.array.set([radius, growth, Math.max(0.01, life), Math.max(0, (radius - thickness) / radius)], i * 4);
    this.color.set(color).toArray(this.tint.array, i * 3);
    this.dirtyFrom = Math.min(this.dirtyFrom, i);
    this.dirtyTo = Math.max(this.dirtyTo, i);
  }
}
for (const name of ["update", "reset", "alive"]) RingPool.prototype[name] = FxPool.prototype[name];
