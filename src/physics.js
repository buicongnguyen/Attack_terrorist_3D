import * as CANNON from "cannon-es";
import { STEP, GRAVITY } from "./data.js";

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export class FixedClock {
  accumulator = 0;
  advance(delta, update) {
    this.accumulator += Math.min(Math.max(0, delta), 0.1);
    while (this.accumulator + 1e-10 >= STEP) {
      update(STEP);
      this.accumulator -= STEP;
    }
  }
  reset() {
    this.accumulator = 0;
  }
}

export function segmentSphere(a, b, centre, radius) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    dz = b.z - a.z;
  const ox = a.x - centre.x,
    oy = a.y - centre.y,
    oz = a.z - centre.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  if (c <= 0) return 0;
  const aa = dx * dx + dy * dy + dz * dz;
  if (aa < 1e-12) return null;
  const bb = ox * dx + oy * dy + oz * dz;
  const discriminant = bb * bb - aa * c;
  if (discriminant < 0) return null;
  const t = (-bb - Math.sqrt(discriminant)) / aa;
  return t >= 0 && t <= 1 ? t : null;
}

export function movement(velocity, intent, dt, acceleration, drag, maxSpeed) {
  const len = Math.hypot(intent.x, intent.z);
  const divisor = Math.max(1, len);
  velocity.x += (intent.x / divisor) * acceleration * dt;
  velocity.z += (intent.z / divisor) * acceleration * dt;
  const damping = Math.exp(-drag * dt);
  velocity.x *= damping;
  velocity.z *= damping;
  const speed = Math.hypot(velocity.x, velocity.z);
  if (speed > maxSpeed) {
    velocity.x *= maxSpeed / speed;
    velocity.z *= maxSpeed / speed;
  }
}

export function bombVelocity(config) {
  const angle = (config.angle * Math.PI) / 180;
  return {
    x: 4 + Math.sin(angle) * config.speed,
    y: -Math.cos(angle) * config.speed,
    z: 0,
  };
}

export function guideForce(time, config) {
  if (config.path === "hook") return time > 0.65 ? 18 : 0;
  if (config.path === "zigzag") return Math.sin(time * 5) * 22;
  return 0;
}

export function createPhysics() {
  const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, GRAVITY, 0),
    allowSleep: true,
  });
  world.defaultContactMaterial.friction = 0.5;
  world.defaultContactMaterial.restitution = 0.05;
  const groundMaterial = new CANNON.Material("ground");
  const bounceMaterial = new CANNON.Material("bounce");
  world.addContactMaterial(
    new CANNON.ContactMaterial(groundMaterial, bounceMaterial, {
      friction: 0.24,
      restitution: 0.56,
    }),
  );
  return { world, groundMaterial, bounceMaterial };
}

export function addBox(physics, position, size, mass = 0) {
  const body = new CANNON.Body({
    mass,
    material: physics.groundMaterial,
    shape: new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)),
  });
  body.position.copy(position);
  physics.world.addBody(body);
  return body;
}

export function addBomb(physics, position, config) {
  const body = new CANNON.Body({
    mass: 1,
    material:
      config.type === "bounce"
        ? physics.bounceMaterial
        : physics.groundMaterial,
    shape: new CANNON.Sphere(0.18),
    linearDamping: 0.04,
    angularDamping: 0.3,
  });
  body.position.copy(position);
  body.velocity.copy(bombVelocity(config));
  // Drilling collisions are swept and resolved against individual destructible slabs.
  if (config.type === "drill") body.collisionFilterMask = 1;
  physics.world.addBody(body);
  return body;
}

export function forecast(position, config, stopAt) {
  const p = { ...position },
    velocity = bombVelocity(config),
    points = [{ ...p }];
  for (let i = 1; i <= 420; i++) {
    const before = { ...p };
    velocity.x += guideForce(i * STEP, config) * STEP;
    velocity.y += GRAVITY * STEP;
    const damping = Math.pow(0.96, STEP);
    velocity.x *= damping;
    velocity.y *= damping;
    p.x += velocity.x * STEP;
    p.y += velocity.y * STEP;
    if (i % 8 === 0) points.push({ ...p });
    if (stopAt(before, p) || p.y < 0.2) {
      points.push({ ...p });
      break;
    }
  }
  return points;
}
