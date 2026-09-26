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

// The same test on the map (x and z only): Lantern's flat rounds hit whatever they cross (2.7).
export function segmentCircle(a, b, centre, radius) {
  return segmentSphere({ x: a.x, y: 0, z: a.z }, { x: b.x, y: 0, z: b.z }, { x: centre.x, y: 0, z: centre.z }, radius);
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
