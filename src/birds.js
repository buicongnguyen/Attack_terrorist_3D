// Birds (2.9), from the lightweight-game-objects skill: every bird of a kind is one instance of a
// 20-triangle mesh, so a flock is one draw call; wings flap and fold on the GPU.
// - Perchers sit on roofs, quays and river banks. A blast, the gunboat or the helicopter's
//   downwash startles them: the nearest goes first and its group follows in a ripple. They
//   climb away, circle, and later settle on another free perch.
// - Circlers are background flocks (gulls, swallows, hawks, bats) on looping paths computed in
//   the vertex shader: no CPU at all beyond one time uniform.
import * as THREE from "three";
import { mulberry32, angleDelta } from "./swarm.js";

const TAU = Math.PI * 2;
const PERCHED = 0,
  WAITING = 1,
  FLYING = 2,
  LANDING = 3;

// A 20-triangle bird, span 1, nose at +z: wedge body, two-part wings, fan tail and beak. Vertex
// colours are shades (instance colour multiplies them): dark wing tips, a pale belly.
export function birdGeometry() {
  const body = [1, 1, 1],
    wing = [0.88, 0.88, 0.9],
    tip = [0.42, 0.42, 0.46],
    belly = [1.05, 1.03, 1],
    beak = [1.6, 1.05, 0.3];
  const n = [0, 0, 0.32],
    h = [0, 0.07, 0],
    b = [0, -0.05, 0],
    t = [0, 0, -0.3],
    l = [-0.08, 0, 0],
    r = [0.08, 0, 0];
  const wl = [-0.28, 0, 0.04],
    wr = [0.28, 0, 0.04],
    wlt = [-0.5, 0, -0.06],
    wrt = [0.5, 0, -0.06],
    wb = [0, 0, -0.1];
  const tris = [
    [n, l, h, body],
    [n, h, r, body],
    [h, l, t, body],
    [h, t, r, body],
    [n, b, l, belly],
    [n, r, b, belly],
    [b, t, l, belly],
    [b, r, t, belly],
    [[0, 0.02, 0.4], [-0.025, 0, 0.31], [0.025, 0, 0.31], beak, true],
    [l, wl, wb, wing, true],
    [wl, wlt, wb, tip, true],
    [r, wb, wr, wing, true],
    [wr, wb, wrt, tip, true],
    [t, [-0.1, 0, -0.44], [0.1, 0, -0.44], wing, true],
  ];
  const pos = [],
    col = [];
  for (const [a, c1, c2, k, both] of tris) {
    pos.push(...a, ...c1, ...c2);
    col.push(...k, ...k, ...k);
    if (both) {
      pos.push(...a, ...c2, ...c1);
      col.push(...k, ...k, ...k);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// aFlap = (wing phase, beat amplitude, fold). Folded wings tuck in along the body, for a bird
// standing on a perch; the beat lifts the wing tips most.
function birdMaterial() {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute vec3 aFlap;").replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
float side = abs(position.x);
float wing = smoothstep(0.08, 0.5, side);
transformed.y += wing * side * sin(aFlap.x) * aFlap.y * 1.1;
float folded = aFlap.z * wing;
transformed.x = sign(position.x) * mix(side, 0.08 + (side - 0.08) * 0.14, folded);
transformed.z -= folded * (side - 0.08) * 0.75;`,
    );
  };
  material.customProgramCacheKey = () => "tidelock-birds";
  return material;
}

// Yaw about +Y, bank about the forward axis, uniform scale, straight into the instance buffer.
function pose(m, i, x, y, z, yaw, bank, s) {
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw),
    cb = Math.cos(bank) * s,
    sb = Math.sin(bank) * s,
    o = i * 16;
  m[o] = cy * cb;
  m[o + 1] = sb;
  m[o + 2] = -sy * cb;
  m[o + 3] = 0;
  m[o + 4] = -cy * sb;
  m[o + 5] = cb;
  m[o + 6] = sy * sb;
  m[o + 7] = 0;
  m[o + 8] = sy * s;
  m[o + 9] = 0;
  m[o + 10] = cy * s;
  m[o + 11] = 0;
  m[o + 12] = x;
  m[o + 13] = y;
  m[o + 14] = z;
  m[o + 15] = 1;
}

export class Perchers {
  // `groups` are lists of perch spots { x, y, z }; `fill` is the share of spots taken at the
  // start (the rest are free places to settle). `span` is the wingspan in metres. `quiet`
  // (reduced motion): the birds stay on their perches.
  constructor({ groups, fill = 0.7, span = 1, colors, seed = 1, quiet = false, ceiling = 12, name = "birds" }) {
    const rng = (this.rng = mulberry32(seed));
    this.spots = [];
    groups.forEach((group, g) => group.forEach((s) => this.spots.push({ x: s.x, y: s.y, z: s.z, group: g, owner: -1 })));
    const taken = this.spots.filter(() => rng() < fill);
    const count = (this.count = taken.length);
    Object.assign(this, { quiet, ceiling, span, time: 0 });
    const F = () => new Float32Array(count);
    Object.assign(this, { x: F(), y: F(), z: F(), yaw: F(), want: F(), bank: F(), vx: F(), vy: F(), vz: F(), timer: F(), air: F() });
    Object.assign(this, { phase: F(), amp: F(), fold: F(), burst: F(), scale: F(), turn: F(), threatX: F(), threatZ: F() });
    this.state = new Uint8Array(count);
    this.spot = new Int32Array(count);
    this.flap = new Float32Array(count * 3);
    this.mesh = new THREE.InstancedMesh(birdGeometry(), birdMaterial(), Math.max(1, count));
    this.mesh.count = count;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = this.mesh.receiveShadow = false;
    this.mesh.name = name;
    this.mesh.userData.disposable = true;
    const color = new THREE.Color();
    taken.forEach((s, i) => {
      s.owner = i;
      this.spot[i] = this.spots.indexOf(s);
      this.x[i] = s.x;
      this.y[i] = s.y;
      this.z[i] = s.z;
      this.yaw[i] = this.want[i] = rng() * TAU;
      this.scale[i] = span * (0.85 + rng() * 0.3);
      this.fold[i] = 1;
      this.timer[i] = rng() * 4;
      this.phase[i] = rng() * TAU;
      this.turn[i] = rng() < 0.5 ? -1 : 1;
      this.mesh.setColorAt(i, color.set(colors[Math.floor(rng() * colors.length)]));
    });
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.flapAttribute = new THREE.InstancedBufferAttribute(this.flap, 3).setUsage(THREE.DynamicDrawUsage);
    this.mesh.geometry.setAttribute("aFlap", this.flapAttribute);
    this.update(0);
  }

  // Startle the perched birds within `radius` of (x, z), and the rest of their groups: a ripple
  // of take-offs, nearest first. Returns how many groups took off (one sound each).
  startle(x, z, radius) {
    if (this.quiet || !this.count) return 0;
    const r2 = radius * radius,
      near = (i) => this.state[i] === PERCHED && (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2 <= r2;
    let any = false;
    for (let i = 0; i < this.count && !any; i++) any = near(i);
    if (!any) return 0;
    const groups = new Set();
    for (let i = 0; i < this.count; i++) if (near(i)) groups.add(this.spots[this.spot[i]].group);
    const going = [];
    for (let i = 0; i < this.count; i++)
      if (this.state[i] === PERCHED && groups.has(this.spots[this.spot[i]].group)) going.push([i, Math.hypot(this.x[i] - x, this.z[i] - z)]);
    going.sort((a, b) => a[1] - b[1]);
    going.forEach(([i], rank) => {
      this.state[i] = WAITING;
      this.timer[i] = 0.05 + rank * 0.1 + this.rng() * 0.08;
      this.threatX[i] = x;
      this.threatZ[i] = z;
    });
    return groups.size;
  }

  // Perches within `radius` of a blast at about their height are struck off (the roof may be
  // holed); flak bursting high overhead leaves them be. A bird on its way to one picks another.
  spoil(x, y, z, radius) {
    const r2 = radius * radius;
    for (const s of this.spots) {
      if ((s.x - x) ** 2 + (s.z - z) ** 2 > r2 || Math.abs(s.y - y) > radius + 1) continue;
      s.spoiled = true;
      const owner = s.owner;
      if (owner >= 0 && this.state[owner] === LANDING) {
        s.owner = -1;
        this.state[owner] = FLYING;
        this.air[owner] = 1 + this.rng() * 2;
        this.spot[owner] = -1;
      }
    }
  }

  // Carry everything with a flowing world (the canal) and wrap what leaves the near end.
  drift(dz, minZ, maxZ) {
    const span = maxZ - minZ;
    for (const s of this.spots) {
      s.z += dz;
      // A spot coming round to the far end is fresh beach again.
      if (s.z > maxZ) {
        s.z -= span;
        s.spoiled = false;
      }
    }
    for (let i = 0; i < this.count; i++) {
      if (this.state[i] === PERCHED || this.state[i] === WAITING) {
        const s = this.spots[this.spot[i]];
        this.z[i] = s.z;
        continue;
      }
      this.z[i] += dz;
      this.threatZ[i] += dz;
      if (this.z[i] > maxZ) this.z[i] -= span;
    }
  }

  launch(i) {
    const rng = this.rng,
      s = this.spots[this.spot[i]];
    s.owner = -1;
    this.spot[i] = -1;
    this.state[i] = FLYING;
    const away = Math.atan2(this.x[i] - this.threatX[i], this.z[i] - this.threatZ[i]) + (rng() - 0.5) * 1.1,
      speed = 3.6 + rng() * 2;
    this.vx[i] = Math.sin(away) * speed;
    this.vz[i] = Math.cos(away) * speed;
    this.vy[i] = 3 + rng();
    this.air[i] = 5 + rng() * 5;
    this.burst[i] = 1.2;
  }

  // A free spot to settle on, clear of where the trouble was.
  landingSpot(i) {
    let best = -1,
      bestScore = Infinity;
    for (let k = 0; k < this.spots.length; k++) {
      const s = this.spots[k];
      if (s.owner !== -1 || s.spoiled) continue;
      const fromThreat = Math.hypot(s.x - this.threatX[i], s.z - this.threatZ[i]);
      const score = Math.hypot(s.x - this.x[i], s.z - this.z[i]) + (fromThreat < 12 ? 400 : 0) + this.rng() * 8;
      if (score < bestScore) {
        bestScore = score;
        best = k;
      }
    }
    return best;
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    const m = this.mesh.instanceMatrix.array,
      rng = this.rng;
    for (let i = 0; i < this.count; i++) {
      const state = this.state[i];
      let flapping = 0;
      if (state === PERCHED || state === WAITING) {
        // Standing: now and then a turn of the head and body.
        this.timer[i] -= dt;
        if (state === WAITING && this.timer[i] <= 0) this.launch(i);
        else if (state === PERCHED && this.timer[i] <= 0) {
          this.want[i] = this.yaw[i] + (rng() - 0.5) * 2;
          this.timer[i] = 2 + rng() * 4;
        }
        this.yaw[i] += angleDelta(this.yaw[i], this.want[i]) * (1 - Math.exp(-4 * dt));
        this.bank[i] *= 1 - Math.min(1, dt * 6);
      }
      if (this.state[i] === FLYING || this.state[i] === LANDING) {
        const landing = this.state[i] === LANDING;
        let heading = Math.atan2(this.vx[i], this.vz[i]),
          speed = Math.hypot(this.vx[i], this.vz[i]);
        let turnRate = 0;
        if (!landing) {
          this.air[i] -= dt;
          // Climb hard, then level into a wide circle.
          this.vy[i] += (0.3 - this.vy[i]) * Math.min(1, dt * 0.8);
          if (this.y[i] > this.ceiling) this.vy[i] = Math.min(this.vy[i], 0);
          if (this.air[i] < 3.5) turnRate = 0.7 * this.turn[i];
          if (this.air[i] <= 0) {
            const k = this.landingSpot(i);
            if (k >= 0) {
              this.spot[i] = k;
              this.spots[k].owner = i;
              this.state[i] = LANDING;
            } else this.air[i] = 2;
          }
        } else {
          // Glide down to the spot, slowing as it gets close.
          const s = this.spots[this.spot[i]],
            dx = s.x - this.x[i],
            dz = s.z - this.z[i],
            d = Math.hypot(dx, dz);
          const want = Math.atan2(dx, dz),
            delta = angleDelta(heading, want);
          turnRate = Math.max(-2.4, Math.min(2.4, delta * 2.5));
          speed += (Math.min(5, 0.8 + d * 0.9) - speed) * Math.min(1, dt * 2);
          this.vy[i] = Math.max(-3, Math.min(1.5, (s.y + Math.min(3, d * 0.35) - this.y[i]) * 1.8));
          if (d < 1.5) {
            const k = Math.min(1, dt * 3);
            this.x[i] += dx * k;
            this.z[i] += dz * k;
          }
          if (d < 0.3 && Math.abs(this.y[i] - s.y) < 0.25) {
            this.state[i] = PERCHED;
            this.x[i] = s.x;
            this.y[i] = s.y;
            this.z[i] = s.z;
            this.want[i] = heading;
            this.timer[i] = 1 + rng() * 3;
            this.vx[i] = this.vz[i] = this.vy[i] = 0;
          }
          if (d < 2.5) flapping = 1;
        }
        if (this.state[i] !== PERCHED) {
          heading += turnRate * dt;
          this.vx[i] = Math.sin(heading) * speed;
          this.vz[i] = Math.cos(heading) * speed;
          this.x[i] += this.vx[i] * dt;
          this.y[i] += this.vy[i] * dt;
          this.z[i] += this.vz[i] * dt;
          this.yaw[i] += angleDelta(this.yaw[i], heading) * (1 - Math.exp(-8 * dt));
          this.bank[i] += (-turnRate * 0.45 - this.bank[i]) * Math.min(1, dt * 3);
          // Beat in bursts and glide between them; always beat while climbing.
          this.burst[i] -= dt;
          if (this.burst[i] < -0.8 - (i % 3) * 0.3) this.burst[i] = 0.6 + rng() * 0.6;
          if (this.burst[i] > 0 || this.vy[i] > 0.8) flapping = 1;
        }
      }
      const perched = this.state[i] === PERCHED || this.state[i] === WAITING;
      this.fold[i] += ((perched ? 1 : 0) - this.fold[i]) * Math.min(1, dt * (perched ? 5 : 12));
      this.amp[i] += ((flapping ? 0.9 : 0.06) - this.amp[i]) * Math.min(1, dt * 6);
      this.phase[i] = (this.phase[i] + dt * (flapping ? 15 : 3) * (0.9 + (i % 5) * 0.05)) % TAU;
      this.flap[i * 3] = this.phase[i];
      this.flap[i * 3 + 1] = perched ? 0 : this.amp[i];
      this.flap[i * 3 + 2] = this.fold[i];
      pose(m, i, this.x[i], this.y[i], this.z[i], this.yaw[i], this.bank[i], this.scale[i]);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.flapAttribute.needsUpdate = true;
  }

  counts() {
    let perched = 0,
      flying = 0;
    for (let i = 0; i < this.count; i++) this.state[i] === PERCHED ? perched++ : flying++;
    return { birds: this.count, perched, flying };
  }
}

// Background flocks on looping paths around a centre that may follow the camera. `kind` picks
// the colours, beat and wobble. The flock is drawn by the GPU from time alone.
const CIRCLER = {
  gull: { colors: [0xffffff, 0xf0f3f7], beat: [5, 7], amp: 0.55, wobble: 0.15, bank: 0.35 },
  swallow: { colors: [0x27306b, 0x3b2f5c], beat: [11, 15], amp: 0.7, wobble: 0.3, bank: 0.5 },
  hawk: { colors: [0x7a5233, 0x8f6440], beat: [3, 4], amp: 0.35, wobble: 0.05, bank: 0.4 },
  bat: { colors: [0x2a2340, 0x372d4a], beat: [12, 16], amp: 0.9, wobble: 0.6, bank: 0.4 },
};

export function createCirclers(kind, { count, center, radius, height, speed = [0.25, 0.55], size = 1, seed = 11 }) {
  const shape = CIRCLER[kind],
    rng = mulberry32(seed);
  const geometry = birdGeometry();
  const orbit = new Float32Array(count * 4),
    style = new Float32Array(count * 4),
    tone = new Float32Array(count * 3),
    color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const dir = rng() < 0.5 ? -1 : 1;
    orbit.set([radius[0] + rng() * (radius[1] - radius[0]), height[0] + rng() * (height[1] - height[0]), dir * (speed[0] + rng() * (speed[1] - speed[0])), rng() * TAU], i * 4);
    style.set([shape.beat[0] + rng() * (shape.beat[1] - shape.beat[0]), shape.amp, shape.wobble, size * (0.85 + rng() * 0.3)], i * 4);
    color.set(shape.colors[Math.floor(rng() * shape.colors.length)]).toArray(tone, i * 3);
  }
  geometry.setAttribute("iOrbit", new THREE.InstancedBufferAttribute(orbit, 4));
  geometry.setAttribute("iStyle", new THREE.InstancedBufferAttribute(style, 4));
  geometry.setAttribute("iTone", new THREE.InstancedBufferAttribute(tone, 3));
  const uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uTime: { value: 0 },
    uCenter: { value: new THREE.Vector3(center.x, 0, center.z) },
    uBank: { value: shape.bank },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    vertexColors: true,
    vertexShader: `
uniform float uTime, uBank;
uniform vec3 uCenter;
attribute vec4 iOrbit, iStyle;
attribute vec3 iTone;
varying vec3 vTone;
#include <fog_pars_vertex>
void main() {
  float a = uTime * iOrbit.z + iOrbit.w;
  float r = iOrbit.x * (1.0 + 0.15 * sin(a * 2.3 + iOrbit.w));
  float w = iStyle.z;
  vec3 c = uCenter + vec3(cos(a) * r, iOrbit.y + sin(a * 1.7 + iOrbit.w) * (0.6 + w), sin(a) * r * 0.75);
  c += vec3(sin(uTime * 3.1 + iOrbit.w * 5.0), sin(uTime * 4.3 + iOrbit.w * 3.0) * 0.6, cos(uTime * 2.7 + iOrbit.w * 7.0)) * w * 0.5;
  float dir = sign(iOrbit.z);
  vec3 fwd = normalize(vec3(-sin(a), 0.0, cos(a) * 0.75) * dir);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  vec3 up = cross(fwd, right);
  float bank = uBank * dir;
  vec3 r2 = right * cos(bank) + up * sin(bank);
  vec3 u2 = up * cos(bank) - right * sin(bank);
  vec3 p = position;
  float side = abs(p.x);
  float wing = smoothstep(0.08, 0.5, side);
  p.y += wing * side * sin(uTime * iStyle.x + iOrbit.w * 3.0) * iStyle.y * 1.1;
  p *= iStyle.w;
  vec3 world = c + r2 * p.x + u2 * p.y + fwd * p.z;
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vTone = iTone * color * (0.78 + 0.22 * u2.y);
  #include <fog_vertex>
}`,
    fragmentShader: `
varying vec3 vTone;
#include <fog_pars_fragment>
void main() {
  gl_FragColor = vec4(vTone, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  mesh.castShadow = mesh.receiveShadow = false;
  mesh.name = `circling-${kind}`;
  mesh.userData.disposable = true;
  return {
    mesh,
    count,
    update(time) {
      uniforms.uTime.value = time;
    },
    // Ease the loops' centre toward (x, z), so a flock keeps over the part of the map in view.
    follow(x, z, dt) {
      const k = 1 - Math.exp(-dt * 0.6),
        c = uniforms.uCenter.value;
      c.x += (x - c.x) * k;
      c.z += (z - c.z) * k;
    },
  };
}
