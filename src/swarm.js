// Fish schools (2.9): every fish in a scene is one instance of a 32-triangle mesh, so a whole
// school is one draw call. The swim is a wave bent into the body on the GPU; the CPU only steers
// (a goal, a capped turn rate, the short way round) and writes one matrix per fish. From the
// lightweight-game-objects skill's swarm template, after Zoo Garden's pond fish.
import * as THREE from "three";

const TAU = Math.PI * 2;

// Cosmetic randomness of its own, so missions, retries and scripted runs replay exactly.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The signed angle from a to b, the short way round.
export const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

// Water a school keeps to: contains(x, z) and a random point inside (a goal; `near` x, z may
// keep it close by, as a river does).
export const rectWater = ({ minX, maxX, minZ, maxZ }, wet = () => true) => ({
  minX,
  maxX,
  minZ,
  maxZ,
  contains: (x, z) => x >= minX && x <= maxX && z >= minZ && z <= maxZ && wet(x, z),
  random(rng) {
    for (let i = 0; i < 40; i++) {
      const x = minX + rng() * (maxX - minX),
        z = minZ + rng() * (maxZ - minZ);
      if (wet(x, z)) return { x, z };
    }
    return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
  },
});

// A low-poly fish one metre long, nose at +z. Every triangle has its own vertices (a faceted toy
// look). aBend runs 0 at the nose to 1 at the tail tip, aPaint picks the accent colour (a saddle
// and the tail fin), aShade bakes a darker back and lighter flanks.
export function fishGeometry() {
  const S = [
    [0, 0, 0],
    [0.14, 0.15, 0.12],
    [0.38, 0.19, 0.15],
    [0.66, 0.1, 0.09],
    [0.82, 0.035, 0.035],
  ];
  const ring = ([t, w, h]) => [
    { p: [w, 0, 0.5 - t], t },
    { p: [0, h, 0.5 - t], t },
    { p: [-w, 0, 0.5 - t], t },
    { p: [0, -h, 0.5 - t], t },
  ];
  const pos = [],
    bend = [],
    paint = [],
    shade = [];
  const tri = (a, b, c, p, s) => {
    for (const v of [a, b, c]) {
      pos.push(...v.p);
      bend.push(v.t);
      paint.push(p);
      shade.push(s);
    }
  };
  const rings = S.map(ring);
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < 4; k++) {
      const a0 = rings[i][k],
        b0 = rings[i][(k + 1) % 4],
        a1 = rings[i + 1][k],
        b1 = rings[i + 1][(k + 1) % 4];
      const back = k < 2,
        p = back && i === 1 ? 1 : 0,
        s = back ? (k === 0 ? 0.86 : 0.78) : 1.12;
      // The nose ring is a point: its first triangle would be empty.
      if (i > 0) tri(a0, a1, b0, p, s);
      tri(b0, a1, b1, p, s);
    }
  }
  const [r, top, l, bottom] = rings[rings.length - 1];
  tri(r, bottom, l, 0, 0.9);
  tri(l, top, r, 0, 0.9);
  // A forked tail fin, flat so it reads from above.
  const root = { p: [0, 0, -0.3], t: 0.82 },
    notch = { p: [0, 0.01, -0.42], t: 0.92 },
    right = { p: [0.2, 0.02, -0.54], t: 1 },
    left = { p: [-0.2, 0.02, -0.54], t: 1 };
  tri(root, right, notch, 1, 1);
  tri(root, notch, left, 1, 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute("aBend", new THREE.Float32BufferAttribute(bend, 1));
  geometry.setAttribute("aPaint", new THREE.Float32BufferAttribute(paint, 1));
  geometry.setAttribute("aShade", new THREE.Float32BufferAttribute(shade, 1));
  geometry.computeVertexNormals();
  return geometry;
}

// Lambert plus the swim wave and per-fish paint. The fish lie just over the (opaque) water and
// are tinted toward it at partial opacity, so they read as swimming under the surface.
function swarmMaterial(water) {
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: water.opacity, depthWrite: false });
  const uniforms = { uWater: { value: water.color.clone() }, uMix: { value: water.mix } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute float aBend; attribute float aPaint; attribute float aShade;
attribute vec2 aSwim; attribute vec3 aBody; attribute vec3 aAccent;
varying vec3 vPaint;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
transformed.x += sin(aSwim.x - aBend * 3.2) * aSwim.y * aBend * aBend;
vPaint = mix(aBody, aAccent, aPaint) * aShade;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uWater; uniform float uMix; varying vec3 vPaint;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb * vPaint, uWater, uMix);");
  };
  material.customProgramCacheKey = () => "tidelock-swarm";
  material.userData.uniforms = uniforms;
  return material;
}

export class Swarm {
  // `water` is a rectWater; `tint` is { color: THREE.Color, mix, opacity }. `quiet` (reduced
  // motion) slows the fish and calms the tail.
  constructor({ water, count, schools, length = 1, y = 0.15, speed = [0.7, 1.3], colors, seed = 1, tint, quiet = false }) {
    Object.assign(this, { water, count, y, quiet, time: 0, fleeSpeed: quiet ? 2 : 3.6, turnRate: quiet ? 1.8 : 2.6 });
    const rng = (this.rng = mulberry32(seed));
    const between = (a, b) => a + rng() * (b - a);
    const F = () => new Float32Array(count);
    Object.assign(this, { x: F(), z: F(), h: F(), v: F(), cruise: F(), gx: F(), gz: F(), gt: F(), flee: F(), fh: F() });
    Object.assign(this, { phase: F(), amp: F(), size: F(), bob: F(), ox: F(), oz: F(), leader: new Int32Array(count) });
    this.swim = new Float32Array(count * 2);
    const body = new Float32Array(count * 3),
      accent = new Float32Array(count * 3),
      color = new THREE.Color();
    const group = Math.max(1, Math.ceil(count / Math.max(1, schools)));
    const slow = quiet ? 0.6 : 1;
    for (let i = 0; i < count; i++) {
      const lead = Math.floor(i / group) * group,
        slot = i - lead,
        pair = colors[Math.floor(lead / group) % colors.length];
      this.leader[i] = lead;
      // Followers keep a slot behind and to either side of their leader.
      this.ox[i] = slot ? (slot % 2 ? 1 : -1) * between(0.35, 0.8) * length : 0;
      this.oz[i] = slot ? -(0.45 + 0.5 * Math.ceil(slot / 2)) * length * between(0.8, 1.2) : 0;
      this.size[i] = length * between(0.8, 1.2);
      this.cruise[i] = between(speed[0], speed[1]) * slow;
      this.phase[i] = rng() * TAU;
      this.bob[i] = rng() * TAU;
      this.amp[i] = 0.1;
      this.h[i] = rng() * TAU;
      color.set(pair[0]).toArray(body, i * 3);
      color.set(pair[1]).toArray(accent, i * 3);
      const p = lead === i ? water.random(rng) : null;
      this.x[i] = p ? p.x : this.x[lead] + this.ox[i];
      this.z[i] = p ? p.z : this.z[lead] + this.oz[i];
      if (!p && !water.contains(this.x[i], this.z[i])) {
        this.x[i] = this.x[lead];
        this.z[i] = this.z[lead];
      }
    }
    const geometry = fishGeometry();
    this.swimAttribute = new THREE.InstancedBufferAttribute(this.swim, 2).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("aSwim", this.swimAttribute);
    geometry.setAttribute("aBody", new THREE.InstancedBufferAttribute(body, 3));
    geometry.setAttribute("aAccent", new THREE.InstancedBufferAttribute(accent, 3));
    this.mesh = new THREE.InstancedMesh(geometry, swarmMaterial(tint), count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Fish roam: the bounds would go stale, and it is one draw call either way.
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 1;
    this.mesh.name = "fish";
    this.mesh.userData.disposable = true;
    this.update(0);
  }

  // Startle every fish within `radius` of (x, z): a dart away, then back to cruising.
  scare(x, z, radius) {
    const r2 = radius * radius;
    for (let i = 0; i < this.count; i++) {
      const dx = this.x[i] - x,
        dz = this.z[i] - z;
      if (dx * dx + dz * dz > r2) continue;
      this.flee[i] = 0.8 + this.rng() * 0.6;
      this.fh[i] = Math.atan2(dx, dz) + (this.rng() - 0.5) * 0.6;
    }
  }

  // The canal flows past the camera: carry every fish with it, and send a school that leaves
  // the near end back to the far end, together.
  drift(dz) {
    if (!dz) return;
    const { water, count } = this,
      span = water.maxZ - water.minZ;
    for (let i = 0; i < count; i++) {
      this.z[i] += dz;
      this.gz[i] += dz;
    }
    for (let i = 0; i < count; i++) {
      if (this.leader[i] !== i || this.z[i] <= water.maxZ) continue;
      for (let j = i; j < count && this.leader[j] === i; j++) {
        this.z[j] -= span;
        this.gz[j] -= span;
      }
    }
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    const { count, water, x, z, h, v } = this,
      m = this.mesh.instanceMatrix.array,
      ease = 1 - Math.exp(-3 * dt),
      easeAmp = 1 - Math.exp(-6 * dt),
      calm = this.quiet ? 0.05 : 0.09,
      dart = this.quiet ? 0.1 : 0.17;
    for (let i = 0; i < count; i++) {
      const lead = this.leader[i],
        fleeing = this.flee[i] > 0;
      let tx, tz, want;
      if (fleeing) {
        this.flee[i] -= dt;
        tx = x[i] + Math.sin(this.fh[i]) * 4;
        tz = z[i] + Math.cos(this.fh[i]) * 4;
        want = this.fleeSpeed;
      } else if (lead !== i && this.flee[lead] <= 0) {
        const c = Math.cos(h[lead]),
          s = Math.sin(h[lead]);
        tx = x[lead] + this.ox[i] * c + this.oz[i] * s;
        tz = z[lead] - this.ox[i] * s + this.oz[i] * c;
        want = Math.min(this.fleeSpeed, v[lead] * 0.9 + Math.hypot(tx - x[i], tz - z[i]) * 1.6);
      } else {
        this.gt[i] -= dt;
        if (this.gt[i] <= 0 || Math.hypot(this.gx[i] - x[i], this.gz[i] - z[i]) < 0.4) {
          const g = water.random(this.rng, x[i], z[i]);
          this.gx[i] = g.x;
          this.gz[i] = g.z;
          this.gt[i] = 4 + this.rng() * 5;
        }
        tx = this.gx[i];
        tz = this.gz[i];
        want = this.cruise[i];
      }
      const turn = this.turnRate * (fleeing ? 2 : 1) * dt;
      if (Math.abs(tx - x[i]) + Math.abs(tz - z[i]) > 1e-4) h[i] += Math.max(-turn, Math.min(turn, angleDelta(h[i], Math.atan2(tx - x[i], tz - z[i]))));
      v[i] += (want - v[i]) * ease;
      const nx = x[i] + Math.sin(h[i]) * v[i] * dt,
        nz = z[i] + Math.cos(h[i]) * v[i] * dt;
      // A fish already outside (a follower trailing over the end of a scrolling canal) swims
      // freely back to its school.
      if (water.contains(nx, nz) || !water.contains(x[i], z[i])) {
        x[i] = nx;
        z[i] = nz;
      } else {
        // At the edge: hold position and keep turning one way until open water lies ahead (a
        // winding river has no single centre to turn back to).
        h[i] += turn * 2 * (i % 2 ? 1 : -1);
        if (lead === i) this.gt[i] = 0;
      }
      h[i] = Math.atan2(Math.sin(h[i]), Math.cos(h[i]));
      // The tail's beat follows the speed; the phase is accumulated so a change of beat never jumps.
      this.phase[i] = (this.phase[i] + dt * (2.2 + v[i] * 3.2) * TAU) % TAU;
      this.amp[i] += ((fleeing ? dart : calm) - this.amp[i]) * easeAmp;
      this.swim[i * 2] = this.phase[i];
      this.swim[i * 2 + 1] = this.amp[i];
      const s = this.size[i],
        c = Math.cos(h[i]) * s,
        sn = Math.sin(h[i]) * s,
        o = i * 16;
      m[o] = c;
      m[o + 1] = 0;
      m[o + 2] = -sn;
      m[o + 3] = 0;
      m[o + 4] = 0;
      m[o + 5] = s;
      m[o + 6] = 0;
      m[o + 7] = 0;
      m[o + 8] = sn;
      m[o + 9] = 0;
      m[o + 10] = c;
      m[o + 11] = 0;
      m[o + 12] = x[i];
      m[o + 13] = this.y + Math.sin(this.time * 1.3 + this.bob[i]) * 0.02;
      m[o + 14] = z[i];
      m[o + 15] = 1;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.swimAttribute.needsUpdate = true;
  }

  inside() {
    let n = 0;
    for (let i = 0; i < this.count; i++) if (this.water.contains(this.x[i], this.z[i])) n++;
    return n;
  }
}
