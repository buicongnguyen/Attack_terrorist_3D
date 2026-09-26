import * as THREE from "three";
import { PICKUPS } from "./pickups.js";
import { RescueOperation } from "./rescue.js";
import { StrikeOperation } from "./strike.js";
import { RiverOperation } from "./river.js";
import { isHostileEntity } from "./rescue-data.js";
import { MISSIONS, COLORS, SHOT_INTERVAL, damageShields } from "./data.js";
import { DECK_GUN_RANGE, WEAPONS } from "./river-data.js";
import { createPhysics, addBox, movement, segmentSphere, clamp } from "./physics.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const forward = V(0, 0, -1);

// Shared shot geometry: friendly rounds are bright tracers in a soft halo, hostile rounds are
// glowing fireballs. Neither is disposed with a shot.
const SHOT = {
  tracer: new THREE.BoxGeometry(0.1, 0.1, 1.6),
  halo: new THREE.BoxGeometry(0.32, 0.32, 2.3),
  ball: new THREE.SphereGeometry(0.2, 10, 8),
  core: new THREE.MeshBasicMaterial({ color: 0xfffbe0, toneMapped: false }),
  ember: new THREE.MeshBasicMaterial({ color: 0xffe9a8, toneMapped: false }),
  glow: new THREE.MeshBasicMaterial({
    color: 0x7fe8ff,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }),
};
const haloMaterials = new Map();
const haloMaterial = (color) => {
  if (!haloMaterials.has(color)) {
    const m = SHOT.glow.clone();
    m.color.set(color);
    haloMaterials.set(color, m);
  }
  return haloMaterials.get(color);
};
const HOSTILE_TARGET_LIFT = {
  cave: 0.45,
  launcher: 1.4,
  cannon: 1,
  enemy: 0.7,
  skiff: 0.7,
  drums: 0.6,
  crate: 0.5,
  tower: 5.2,
  generator: 0,
  "aa-truck": 1.1,
};

export class Game {
  constructor(view, audio, notify) {
    this.view = view;
    this.audio = audio;
    this.notify = notify;
    this.input = { x: 0, z: 0, fire: false, aim: V(0, 0, -10), stickAim: null, winch: false };
    this.weapon = "gun";
    this.paused = false;
    this.reducedMotion = false;
  }

  start(index) {
    if (this.physics)
      for (const body of [...this.physics.world.bodies]) this.physics.world.removeBody(body);
    this.view.clear();
    this.index = index;
    this.mission = MISSIONS[index];
    this.chapter = this.mission.chapter;
    this.view.createScenery(this.chapter, this.mission, index);
    this.physics = createPhysics();
    const ground = addBox(this.physics, V(0, this.chapter === 0 ? 0.5 : -0.5, 0), V(200, 1, 200));
    ground.userData = { terrain: true };
    this.entities = [];
    this.projectiles = [];
    this.effects = [];
    this.debris = [];
    this.debrisActive = false;
    this.time = 0;
    this.score = 0;
    this.kills = 0;
    this.shots = 0;
    this.hits = 0;
    this.damageTaken = 0;
    this.cooldown = 0;
    this.rocketCooldown = 0;
    this.status = "playing";
    this.reason = null;
    this.finishTimer = 0;
    this.sentResult = false;
    this.paused = false;
    this.shake = 0;
    this.auto = 0;
    this.twin = 0;
    this.supportCooldown = 0;
    this.velocity = V();
    this.shields = [3, 3, 3];
    Object.assign(this.input, { fire: false, x: 0, z: 0, stickAim: null, winch: false });
    this.player = null;
    this.playerTurret = null;
    this.boatParts = {};
    this.shieldMeshes = [];
    this.rescue = null;
    this.op =
      this.chapter === 0
        ? new StrikeOperation(this)
        : this.chapter === 1
          ? new RiverOperation(this)
          : new RescueOperation(this);
    if (this.chapter === 2) this.rescue = this.op;
    this.reticle = this.view.ring(V(0, 0.04, -8), 0.65, COLORS.gold, 0.08);
    this.reticle.visible = this.chapter !== 0;
    this.notify("start", { mission: this.mission, index });
  }

  radio(line) {
    this.notify("radio", line);
    this.audio.play("radio");
  }

  entity(type, model, position, options = {}) {
    const mesh = model ? this.view.model(model, position, options.scale || 1) : new THREE.Group();
    if (!model) {
      mesh.position.copy(position);
      this.view.level.add(mesh);
    }
    const entity = { type, mesh, radius: 0.7, hp: 1, dead: false, age: 0, ...options };
    entity.position = mesh.position;
    mesh.userData.entity = entity;
    this.entities.push(entity);
    return entity;
  }

  opponent(position, options = {}) {
    const enemy = this.entity("enemy", "enemy", position, { radius: 0.62, ...options });
    enemy.baseY = position.y;
    enemy.mesh.rotation.y = Math.PI;
    enemy.ring = this.view.ring(V(0, 0.03, 0), 0.53, COLORS.hostile, 0.055, enemy.mesh);
    enemy.limbs = ["ArmL", "ArmR", "LegL", "LegR"].map((n) => enemy.mesh.getObjectByName(n));
    return enemy;
  }

  spawnPickup(z, kind, x = 0) {
    const info = PICKUPS[kind];
    if (!info) throw new Error(`Unknown pickup: ${kind}`);
    const pickup = this.entity("pickup", null, V(x, 0.22, z), { kind, scrolling: true, radius: 1.45 });
    pickup.body = this.view.model(info.model, V(), 1, pickup.mesh);
    pickup.badge = this.view.pickupBadge(kind, pickup.mesh);
    pickup.halo = this.view.ring(V(0, -0.15, 0), 1.3, info.color, 0.08, pickup.mesh);
    return pickup;
  }

  createShields(radius, y) {
    return [0, 1, 2].map((i) => {
      const geo = new THREE.TorusGeometry(radius, 0.06, 6, 30, (Math.PI * 2) / 3 - 0.11);
      const mat = new THREE.MeshBasicMaterial({ color: COLORS.friendly, transparent: true, opacity: 0.57 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = Math.PI / 2;
      mesh.rotation.z = (i * Math.PI * 2) / 3 + 0.055;
      mesh.scale.y = 1.15;
      mesh.position.set(0, y, 0);
      mesh.userData.disposable = true;
      // Shields follow position, but their collision sectors do not bank with the vehicle.
      this.view.level.add(mesh);
      return mesh;
    });
  }

  update(dt) {
    if (this.paused) return;
    this.shake = Math.max(0, this.shake - dt * 1.5);
    this.updateEffects(dt);
    if (this.status !== "playing") {
      this.updatePeople(dt);
      if (this.chapter === 0) this.op.settle(dt);
      else {
        this.op.settle?.(dt);
        this.updateProjectiles(dt);
      }
      if (this.debrisActive) this.physics.world.step(dt);
      this.finishTimer += dt;
      if (this.finishTimer > 1.4 && !this.sentResult) {
        this.sentResult = true;
        this.notify("result", this.result());
      }
      return;
    }
    this.time += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.rocketCooldown = Math.max(0, this.rocketCooldown - dt);
    if (this.chapter === 0) this.op.update(dt);
    else {
      this.updateVehicle(dt);
      this.op.update(dt);
      this.updateProjectiles(dt);
      if (this.debrisActive) this.physics.world.step(dt);
    }
    this.updatePeople(dt);
  }

  updateVehicle(dt) {
    const v = this.op.vehicle;
    movement(this.velocity, { x: this.input.x, z: this.input.z }, dt, v.accel, v.drag, v.max);
    this.player.position.x = clamp(this.player.position.x + this.velocity.x * dt, v.bounds.left, v.bounds.right);
    this.player.position.z = clamp(this.player.position.z + this.velocity.z * dt, v.bounds.far, v.bounds.near);
    this.player.position.y = v.height + Math.sin(this.time * v.bob) * 0.07;
    this.player.rotation.z = THREE.MathUtils.damp(this.player.rotation.z, -this.velocity.x * v.bank, 6, dt);
    this.player.rotation.x = THREE.MathUtils.damp(this.player.rotation.x, this.velocity.z * v.pitch, 6, dt);
    const river = this.chapter === 1;
    let aim = this.input.aim;
    this.aimTarget = null;
    if (this.input.stickAim) {
      const direction = this.view.screenDirection(this.input.stickAim);
      this.aimTarget = this.directionTarget(direction);
      aim = this.aimTarget
        ? this.targetPosition(this.aimTarget)
        : this.player.position.clone().addScaledVector(direction, 35).setY(river ? 0.2 : 1.5);
    }
    if (river && this.twin > 0 && !this.input.fire) {
      const target = this.nearestTarget();
      if (target) aim = this.targetPosition(target);
    }
    if (river) this.aimBoatTurret(aim);
    this.aimPoint = aim;
    this.reticle.position.copy(aim);
    this.reticle.position.y = Math.max(0.13, aim.y + 0.1);
    this.reticle.visible = true;
    // Marlin's rockets fly in salvos and the laser is a held beam; both are the river op's.
    if (this.input.fire && !this.input.winch) {
      if (river && this.weapon === "rocket") this.op.fireRockets(aim);
      else if (!(river && this.weapon === "laser")) this.fire(aim, this.chapter === 2 && this.weapon !== "gun");
    }
    if (!river) this.view.followPlayer(this.player.position, dt);
    for (let i = 0; i < 3; i++) {
      this.shieldMeshes[i].position.copy(this.player.position).add(V(0, river ? 0.45 : -0.6, 0));
      this.shieldMeshes[i].visible = this.shields[i] > 0;
      this.shieldMeshes[i].material.opacity = river ? 0.18 + this.shields[i] * 0.1 : 0.5;
    }
    this.wakeCooldown = (this.wakeCooldown ?? 0) - dt;
    if (this.wakeCooldown <= 0) {
      this.wakeCooldown = river ? 0.17 : 0.65;
      const p = this.player.position.clone();
      p.y = river ? 0.11 : 1.3;
      if (river) p.z += 2;
      const ring = this.view.ring(p, river ? 0.55 : 2, 0xdff9f2, river ? 0.07 : 0.025);
      this.effects.push({ mesh: ring, life: river ? 1.2 : 1.8, maxLife: river ? 1.2 : 1.8, ring: true, growth: river ? 1.2 : 2 });
    }
  }

  collect(pickup) {
    if (this.rescue) return this.rescue.collect(pickup);
    if (pickup.dead || this.status !== "playing") return;
    const info = PICKUPS[pickup.kind];
    pickup.dead = true;
    this.view.disposeObject(pickup.mesh);
    if (pickup.kind === "health") {
      this.shields = [3, 3, 3];
      for (const barge of this.op.barges || []) if (barge.alive) barge.hp = Math.min(barge.max, barge.hp + 6);
    }
    if (pickup.kind === "star") this.twin = info.duration;
    if (pickup.kind === "gun") this.auto = info.duration;
    if (pickup.kind === "ammo") this.op.rockets = Math.min(WEAPONS.rocket.max, (this.op.rockets || 0) + WEAPONS.rocket.refill);
    if (pickup.kind === "heli") this.op.callGunship?.();
    if (pickup.kind === "ally") this.op.callEscort?.();
    if (pickup.kind === "strike") this.op.gainStrike?.();
    this.updateBoatLoadout();
    this.score += info.reward;
    this.notify("toast", pickup.kind === "ammo" ? `ROCKETS +${WEAPONS.rocket.refill}` : info.toast);
    this.audio.play("pickup");
    this.puff(pickup.position, info.color, 0.8);
    const ring = this.view.ring(this.player.position.clone().add(V(0, 0.3, 0)), 0.9, info.color, 0.11);
    this.effects.push({ mesh: ring, life: 0.75, maxLife: 0.75, ring: true, growth: 4 });
  }

  updateBoatLoadout() {
    if (this.chapter !== 1 || !this.boatParts) return;
    if (this.boatParts.SingleGun) this.boatParts.SingleGun.visible = this.twin <= 0;
    for (const name of ["TwinGunL", "TwinGunR"])
      if (this.boatParts[name]) this.boatParts[name].visible = this.twin > 0;
    if (this.boatParts.SupportRack) this.boatParts.SupportRack.visible = this.auto > 0;
  }

  aimBoatTurret(aim) {
    if (!this.playerTurret) return;
    this.player.updateMatrixWorld(true);
    const localAim = this.playerTurret.parent.worldToLocal(aim.clone()).sub(this.playerTurret.position);
    this.playerTurret.rotation.y = Math.atan2(-localAim.x, -localAim.z);
    this.player.updateMatrixWorld(true);
  }

  targetPosition(e) {
    if (e.hostile || e.type === "drone") return e.position.clone();
    const lift = e.lift ?? HOSTILE_TARGET_LIFT[e.type] ?? 0.1;
    return e.position.clone().add(V(0, lift, e.type === "cave" ? 1.5 : 0));
  }

  nearestTarget() {
    return this.entities
      .filter(
        (e) =>
          isHostileEntity(e) &&
          e.position.distanceTo(this.player.position) < 55 &&
          (this.chapter === 2 || e.position.z < this.player.position.z + 8),
      )
      .sort(
        (a, b) =>
          a.position.distanceToSquared(this.player.position) - b.position.distanceToSquared(this.player.position),
      )[0];
  }

  directionTarget(direction) {
    let best = null,
      score = -Infinity;
    const candidates = [
      ...this.entities.filter(isHostileEntity),
      ...this.projectiles.filter((p) => p.hostile && p.missile && !p.dead),
    ];
    for (const target of candidates) {
      const delta = this.targetPosition(target).sub(this.player.position);
      const distance = delta.length();
      if (distance > 55) continue;
      const dot = delta.setY(0).normalize().dot(direction);
      const value = dot * 2 - distance * 0.001 + (target.hostile ? 0.005 : 0);
      if (dot > 0.94 && value > score) {
        score = value;
        best = target;
      }
    }
    return best;
  }

  fire(aim, rocket = false) {
    if (this.paused || this.status !== "playing" || this.chapter === 0) return false;
    if (this.chapter === 2 && this.input.winch) return false;
    if (rocket ? this.rocketCooldown > 0 : this.cooldown > 0) return false;
    const guided = this.chapter === 2 && this.weapon === "guided";
    const target = guided
      ? this.entities
          .filter(isHostileEntity)
          .sort((a, b) => this.targetPosition(a).distanceToSquared(aim) - this.targetPosition(b).distanceToSquared(aim))[0]
      : null;
    if (
      guided &&
      (!target || this.targetPosition(target).distanceTo(aim) > 4 || target.position.distanceTo(this.player.position) > 55)
    )
      return false;
    if (this.rescue && rocket) {
      const key = guided ? "guided" : "rockets";
      if (this.rescue.gear[key] <= 0) return false;
      this.rescue.gear[key]--;
    }
    if (rocket) this.rocketCooldown = 1.2;
    else this.cooldown = this.chapter === 1 ? WEAPONS.gun.interval : SHOT_INTERVAL;
    const round = this.chapter === 1 ? { damage: WEAPONS.gun.damage } : {};
    if (this.chapter === 1) this.aimBoatTurret(aim);
    if (this.chapter === 2 && this.op.heliTurret) {
      this.player.updateMatrixWorld(true);
      const direction = aim.clone().sub(this.op.heliTurret.getWorldPosition(V())).normalize();
      direction.applyQuaternion(this.player.getWorldQuaternion(new THREE.Quaternion()).invert());
      this.op.heliTurret.quaternion.setFromUnitVectors(forward, direction);
      this.player.updateMatrixWorld(true);
    }
    const origin =
      this.chapter === 1 && this.boatParts.Muzzle
        ? this.boatParts.Muzzle.getWorldPosition(V())
        : this.chapter === 2 && this.op.heliMuzzle
          ? this.op.heliMuzzle.getWorldPosition(V())
          : this.player.position.clone().add(V(0, this.chapter === 1 ? 1.1 : -0.1, -1.15));
    if (this.twin > 0 && !rocket) {
      for (const side of [-1, 1]) {
        const muzzle = this.boatParts[side < 0 ? "MuzzleL" : "MuzzleR"];
        this.spawnShot(
          this.chapter === 1 && muzzle ? muzzle.getWorldPosition(V()) : origin.clone().add(V(side * 0.7, 0, 0)),
          aim.clone().add(V(side * 0.3, 0, 0)),
          false,
          false,
          null,
          null,
          round,
        );
      }
    } else this.spawnShot(origin, aim, rocket, false, target, null, rocket ? {} : round);
    this.flash(origin, rocket ? 0xffd47e : 0xfff1b8, rocket ? 0.6 : this.chapter === 1 ? 0.7 : 0.35);
    this.audio.play("shot");
    return true;
  }

  // Shots read at a glance: friendly rounds are bright tracers, hostile rounds glowing fireballs
  // that leave embers, and missiles burn at the tail (their smoke trail is added in flight).
  shotMesh(origin, missile, hostile, options = {}) {
    if (missile) {
      const mesh = this.view.model(hostile ? "missile-enemy" : "missile-friendly", origin, hostile ? 1.5 : 1.1);
      const flame = this.view.fxSprite("glow", hostile ? 0xff6a1f : 0xbff8ff, 1, true);
      flame.scale.setScalar(hostile ? 0.85 : 0.7);
      flame.position.set(0, 0, 0.5);
      mesh.add(flame);
      return mesh;
    }
    const group = new THREE.Group();
    group.position.copy(origin);
    if (hostile) {
      group.add(new THREE.Mesh(SHOT.ball, SHOT.ember));
      const glow = this.view.fxSprite("glow", 0xff4a12, 1, true);
      glow.scale.setScalar(this.chapter === 1 ? 1.5 : 1.1);
      group.add(glow);
    } else {
      group.add(new THREE.Mesh(SHOT.tracer, SHOT.core));
      group.add(new THREE.Mesh(SHOT.halo, haloMaterial(options.color ?? (this.chapter === 1 ? 0xffc62b : COLORS.friendly))));
    }
    this.view.level.add(group);
    return group;
  }

  spawnShot(origin, aim, missile, hostile, target = null, aimedAt = null, options = {}) {
    const mesh = this.shotMesh(origin, missile, hostile, options);
    const speed = missile ? (hostile ? 6 : 19) : hostile ? 12 : 55;
    const velocity = aim.clone().sub(origin).normalize().multiplyScalar(speed);
    if (!hostile && !missile) velocity.addScaledVector(this.velocity, 0.18);
    const shot = {
      mesh,
      position: mesh.position,
      velocity,
      missile,
      hostile,
      target,
      aimedAt,
      speed,
      age: 0,
      life: missile ? 12 : hostile ? 5 : this.chapter === 1 ? DECK_GUN_RANGE / speed : 2.1,
      last: origin.clone(),
      trail: 0,
      dead: false,
      radius: missile ? 0.5 : 0.11,
      damage: options.damage ?? null,
      ally: Boolean(options.ally),
    };
    mesh.quaternion.setFromUnitVectors(forward, velocity.clone().normalize());
    this.projectiles.push(shot);
    // Help from allies doesn't count towards the player's accuracy.
    if (!hostile && !shot.ally) this.shots++;
    return shot;
  }

  updateProjectiles(dt) {
    for (const shot of this.projectiles) {
      if (shot.dead) continue;
      shot.age += dt;
      shot.life -= dt;
      shot.last.copy(shot.position);
      if (shot.missile) this.steerMissile(shot, dt);
      else if (shot.hostile) {
        // Fire rounds shed embers.
        shot.trail -= dt;
        if (shot.trail <= 0) {
          shot.trail = 0.04;
          this.ember(shot.position, 0xff6a1f, 0.42, 0.24);
        }
      }
      shot.position.addScaledVector(shot.velocity, dt);
      shot.mesh.quaternion.setFromUnitVectors(forward, shot.velocity.clone().normalize());
      if (shot.hostile) this.resolveHostileShot(shot);
      else this.resolveFriendlyShot(shot);
      if (
        shot.life <= 0 ||
        shot.position.y < -0.8 ||
        (this.chapter === 2
          ? shot.position.distanceTo(this.player.position) > 95
          : Math.abs(shot.position.z) > 90 || Math.abs(shot.position.x) > 45)
      )
        shot.dead = true;
    }
    this.projectiles = this.projectiles.filter((shot) => {
      if (!shot.dead) return true;
      this.view.disposeObject(shot.mesh);
      return false;
    });
  }

  steerMissile(shot, dt) {
    const homing = shot.homing?.barge ? (shot.homing.barge.alive ? shot.homing.barge.position : null) : null;
    const goal =
      shot.hostile && (shot.distracted || this.rescue?.countermeasures > 0)
        ? null
        : shot.hostile
          ? (homing || this.player.position).clone().add(V(0, this.chapter === 1 ? 1 : 0, 0))
          : shot.target && !shot.target.dead
            ? this.targetPosition(shot.target)
            : null;
    if (goal) {
      const desired = goal.sub(shot.position).normalize();
      const direction = shot.velocity.clone().normalize();
      const turn = new THREE.Quaternion().setFromUnitVectors(direction, desired);
      const limited = new THREE.Quaternion().rotateTowards(turn, dt * (shot.hostile ? 1.2 : 3.5));
      direction.applyQuaternion(limited);
      shot.speed = Math.min(shot.hostile ? 11 : 22, shot.speed + dt * 0.65);
      shot.velocity.copy(direction).multiplyScalar(shot.speed);
    }
    shot.trail -= dt;
    if (shot.trail <= 0) {
      this.puff(shot.position, shot.hostile ? 0xffb396 : 0xe8fbff, 0.24, 0.7);
      this.ember(shot.position, shot.hostile ? 0xff7a2b : 0x9ff3ff, 0.5, 0.18);
      shot.trail = 0.05;
    }
    const threat = shot.hostile ? clamp(1 - shot.position.distanceTo(this.player.position) / 28, 0, 1) : 0;
    shot.mesh.scale.setScalar((shot.hostile ? 1.5 : 1.1) * (1 + threat * 0.25 + Math.sin(shot.age * 7) * 0.025));
  }

  resolveHostileShot(shot) {
    const centre = this.player.position.clone().add(V(0, this.chapter === 1 ? 0.85 : 0, 0));
    const radius = this.chapter === 1 ? 2.6 : 3.1;
    const t = segmentSphere(shot.last, shot.position, centre, radius);
    const other = this.op.friendlyHit?.(shot);
    if (t === null && !other) return;
    shot.dead = true;
    if (other && (t === null || other.t < t)) {
      other.apply();
      this.blast(shot.last.clone().lerp(shot.position, other.t), shot.missile ? 1.1 : 0.45, COLORS.hostile, { quiet: true });
      return;
    }
    this.op.onBlocked?.(shot);
    this.hurtPlayer(shot.last.clone().lerp(shot.position, t), shot.heavy ? 2 : 1);
    this.blast(shot.position, shot.missile ? 1.1 : 0.38, COLORS.hostile, { quiet: true });
  }

  resolveFriendlyShot(shot) {
    let hit = null;
    for (const enemyShot of this.projectiles) {
      if (!enemyShot.hostile || !enemyShot.missile || enemyShot.dead) continue;
      const t = segmentSphere(shot.last, shot.position, enemyShot.position, 0.75 + shot.radius);
      if (t !== null && (!hit || t < hit.t)) hit = { t, missile: enemyShot };
    }
    for (const e of this.entities) {
      if (!isHostileEntity(e)) continue;
      // Tall targets (the gate towers) carry a stack of hit spheres from base to top, not one at their aim point.
      for (const lift of e.hitLifts || [null]) {
        const centre = lift === null ? this.targetPosition(e) : e.position.clone().add(V(0, lift, 0));
        const t = segmentSphere(shot.last, shot.position, centre, (e.hitRadius ?? e.radius) + shot.radius);
        if (t !== null && (!hit || t < hit.t)) hit = { t, entity: e };
      }
    }
    if (!hit) return;
    const endpoint = shot.position.clone();
    shot.position.copy(shot.last).lerp(endpoint, hit.t);
    shot.dead = true;
    if (!shot.ally) this.hits++;
    if (hit.missile) {
      hit.missile.dead = true;
      const bonus =
        90 + Math.round(clamp(1 - hit.missile.position.distanceTo(this.player.position) / 25, 0, 1) * 110);
      this.score += bonus;
      this.notify("toast", `INTERCEPT +${bonus}`);
      this.blast(hit.missile.position, 1.25, COLORS.gold);
      return;
    }
    this.damage(hit.entity, shot.damage ?? (shot.missile ? 5 : 1), shot.missile);
    this.blast(shot.position, shot.missile ? 1.7 : 0.3, shot.missile ? COLORS.gold : COLORS.friendly, {
      quiet: !shot.missile,
      small: !shot.missile,
    });
    if (shot.missile)
      for (const e of this.entities) {
        if (e !== hit.entity && !e.dead && isHostileEntity(e) && this.targetPosition(e).distanceTo(shot.position) < 3.7)
          this.damage(e, 3, true);
      }
  }

  damage(e, amount, rocket = false) {
    if (
      amount <= 0 ||
      e.dead ||
      e.friendly ||
      e.shielded ||
      e.type === "pickup" ||
      (e.type === "cave" && ["hidden", "opening", "disabled"].includes(e.phase))
    )
      return;
    e.hp -= amount;
    this.puff(this.targetPosition(e), 0xffd88b, 0.3, 0.25);
    if (e.type === "cave") return this.op.disableCave(e, rocket);
    if (this.chapter === 2 && e.type === "aa-truck" && !e.launcherDisabled) {
      e.launcherDisabled = true;
      const rack = e.mesh.getObjectByName("TruckTurret");
      if (rack) rack.visible = false;
      if (e.warning) e.warning.visible = false;
      this.blast(this.targetPosition(e), 0.85, COLORS.gold);
    }
    if (e.hp <= 0) this.kill(e);
  }

  kill(e, reward = true) {
    if (e.dead) return;
    e.dead = true;
    if (reward) {
      this.kills++;
      this.score +=
        {
          launcher: 250,
          mine: 60,
          skiff: 120,
          drums: 80,
          crate: 150,
          tower: 600,
          generator: 900,
        }[e.type] ?? 100;
    }
    if (e.type === "enemy") {
      e.fallTime = 0;
      if (e.ring) e.ring.visible = false;
      if (e.marker) e.marker.visible = false;
      this.puff(e.position.clone().add(V(0, 0.5, 0)), 0xdacba6, 0.45);
    } else {
      this.view.disposeObject(e.mesh);
      const size = { launcher: 4.8, cannon: 1.7, tower: 5.5, generator: 4.2 }[e.type] ?? 1.1;
      this.blast(e.position.clone().add(V(0, e.type === "tower" ? 4 : 0.5, 0)), size, COLORS.gold);
      if (e.type === "launcher") {
        for (const nearby of this.entities)
          if (!nearby.dead && ["cannon", "enemy", "launcher"].includes(nearby.type) && nearby.position.distanceTo(e.position) < 6)
            this.kill(nearby);
      }
    }
    this.op.onKill?.(e, reward);
  }

  hurtPlayer(position, amount) {
    if (this.status !== "playing") return;
    const offset = position.clone().sub(this.player.position);
    let angle = Math.atan2(offset.z, offset.x);
    if (angle < 0) angle += Math.PI * 2;
    let sector = Math.floor(angle / ((Math.PI * 2) / 3)) % 3;
    if (this.chapter === 1 && this.shields[sector] === 0) sector = this.shields.findIndex((hp) => hp > 0);
    if (sector < 0) {
      this.finish(false, "hull");
      return;
    }
    let result;
    if (this.chapter === 1) {
      let remaining = amount;
      const shields = [...this.shields];
      for (let i = 0; i < 3; i++) {
        const s = (sector + i) % 3,
          absorbed = Math.min(shields[s], remaining);
        shields[s] -= absorbed;
        remaining -= absorbed;
      }
      result = { shields, breached: remaining > 0 };
    } else result = damageShields(this.shields, sector, amount);
    this.shields = result.shields;
    this.damageTaken += amount;
    this.shake = 0.28;
    this.audio.play("hit");
    this.notify("toast", result.breached ? "HULL BREACH" : this.shields[sector] === 0 ? "SHIELD SECTOR LOST" : "SHIELD HIT");
    if (result.breached) this.finish(false, "hull");
  }

  updatePeople(dt) {
    for (const e of this.entities) {
      if (e.type !== "enemy") continue;
      if (e.dead) {
        if (e.fallTime === undefined) continue;
        e.fallTime += dt;
        e.mesh.rotation.x = (-Math.min(1, e.fallTime * 3) * Math.PI) / 2;
        const scale = e.scale || 1;
        e.mesh.scale.setScalar(scale * Math.max(0.01, 1 - Math.max(0, e.fallTime - 1.2) / 1.1));
        if (e.fallTime > 2.3) {
          this.view.disposeObject(e.mesh);
          delete e.fallTime;
        }
      } else if (this.chapter !== 0) {
        e.age += dt;
        const crawl = Math.max(0, 1 - e.age / 1.2);
        e.mesh.rotation.x = crawl * 0.85;
        e.limbs?.forEach((limb, i) => {
          if (limb) limb.rotation.x = Math.sin(e.age * 2.5 + i * Math.PI) * 0.09;
        });
      }
    }
  }

  // ------------------------------------------------------------------ effects

  puff(position, color, size = 0.4, life = 0.45) {
    if (this.effects.length > 260) return;
    const sprite = this.view.fxSprite("smoke", color, 0.85);
    sprite.position.copy(position);
    sprite.scale.setScalar(size * 2);
    this.effects.push({
      mesh: sprite,
      life,
      maxLife: life,
      size: size * 2,
      grow: 0.8,
      fade: 0.85,
      velocity: V((Math.random() - 0.5) * 0.8, 0.6 + Math.random(), (Math.random() - 0.5) * 0.8),
    });
  }

  ember(position, color, size, life) {
    // Embers are garnish: they stop well short of the cap, so explosions always have room.
    if (this.effects.length > 180) return;
    const sprite = this.view.fxSprite("glow", color, 0.9, true);
    sprite.position.copy(position);
    sprite.scale.setScalar(size);
    this.effects.push({ mesh: sprite, life, maxLife: life, size, grow: -0.6, fade: 0.9, velocity: V() });
  }

  flash(position, color, size) {
    if (this.effects.length > 260) return;
    const sprite = this.view.fxSprite("glow", color, 1, true);
    sprite.position.copy(position);
    sprite.scale.setScalar(size);
    this.effects.push({ mesh: sprite, life: 0.1, maxLife: 0.1, size, grow: 0.5, fade: 1, velocity: V() });
  }

  // Layered explosion: flash, fireballs, sparks, lingering smoke and a ground shock ring.
  blast(position, radius, color, options = {}) {
    const p = position.clone ? position.clone() : V(position.x, position.y, position.z);
    const budget = 260 - this.effects.length;
    if (budget < 6) return;
    const ring = this.view.ring(p.clone().add(V(0, 0.08, 0)), 0.3, color, 0.12);
    this.effects.push({ mesh: ring, life: 0.5, maxLife: 0.5, ring: true, growth: radius * 3 });
    this.flash(p, 0xfff4c2, radius * (options.small ? 1.2 : 2.2));
    const fire = options.small ? 2 : Math.min(7, 2 + Math.round(radius * 1.2));
    for (let i = 0; i < fire; i++) {
      const sprite = this.view.fxSprite("glow", i % 2 ? 0xff8a2b : i % 3 ? color : 0xffc62b, 1, true);
      const offset = V((Math.random() - 0.5) * radius * 0.6, Math.random() * radius * 0.35, (Math.random() - 0.5) * radius * 0.6);
      sprite.position.copy(p).add(offset);
      const size = radius * (0.7 + Math.random() * 0.6);
      sprite.scale.setScalar(size);
      this.effects.push({ mesh: sprite, life: 0.45 + Math.random() * 0.3, maxLife: 0.7, size, grow: 0.7, fade: 1, velocity: offset.multiplyScalar(1.5).add(V(0, 1.4, 0)) });
    }
    const smoke = options.small ? 1 : Math.min(7, 2 + Math.round(radius));
    for (let i = 0; i < smoke; i++) {
      const sprite = this.view.fxSprite("smoke", options.smoke ? 0x2f2c35 : i % 2 ? 0x5a4f55 : 0x7c6f6a, 0.8);
      sprite.position.copy(p).add(V((Math.random() - 0.5) * radius * 0.7, Math.random() * 0.6, (Math.random() - 0.5) * radius * 0.7));
      const size = radius * (0.6 + Math.random() * 0.5);
      sprite.scale.setScalar(size);
      this.effects.push({ mesh: sprite, life: 1.3 + Math.random() * 0.9, maxLife: 2.2, size, grow: 1.1, fade: 0.75, velocity: V((Math.random() - 0.5) * 0.6, 1.1 + Math.random() * 0.8, (Math.random() - 0.5) * 0.6) });
    }
    const sparks = options.small ? 0 : Math.min(8, Math.round(radius * 2));
    for (let i = 0; i < sparks; i++) {
      const sprite = this.view.fxSprite("glow", 0xffe08a, 1, true);
      sprite.position.copy(p);
      sprite.scale.setScalar(0.25);
      const a = Math.random() * Math.PI * 2;
      this.effects.push({ mesh: sprite, life: 0.5 + Math.random() * 0.4, maxLife: 0.9, size: 0.25, grow: -0.5, fade: 1, gravity: 14, velocity: V(Math.cos(a) * radius * 2.2, 3 + Math.random() * radius * 2, Math.sin(a) * radius * 2.2) });
    }
    if (radius > 2) {
      this.shake = Math.max(this.shake, Math.min(0.45, 0.08 + radius * 0.05));
      this.view.lightFlash(p, radius);
    }
    if (!options.quiet) this.audio.play(radius > 3.5 ? "bigblast" : "blast");
  }

  // Fragments are rigid bodies that only collide with the ground plane.
  debrisChunk(centre, size, color, origin) {
    if (this.debris.length >= 60) return;
    const chunk = size.clone().clamp(V(0.15, 0.12, 0.15), V(0.8, 0.5, 0.8));
    const mesh = this.view.box(centre, chunk, color);
    const body = addBox(this.physics, centre, chunk, 0.7);
    body.collisionFilterGroup = 4;
    body.collisionFilterMask = 1;
    const kick = centre.clone().sub(origin).setY(0).normalize().multiplyScalar(2.5 + Math.random() * 2);
    body.velocity.set(kick.x, 2 + Math.random() * 4, kick.z);
    body.angularVelocity.set(Math.random() * 4, Math.random() * 4, Math.random() * 4);
    this.debris.push({ mesh, body, life: 2.6 });
    this.debrisActive = true;
  }

  updateEffects(dt) {
    this.effects = this.effects.filter((e) => {
      e.life -= dt;
      if (e.life <= 0) {
        this.view.disposeObject(e.mesh);
        return false;
      }
      const age = 1 - e.life / e.maxLife;
      if (e.ring) {
        e.mesh.scale.setScalar(1 + age * e.growth);
        e.mesh.material.opacity = (1 - age) * 0.6;
      } else {
        if (e.gravity) e.velocity.y -= e.gravity * dt;
        e.mesh.position.addScaledVector(e.velocity, dt);
        e.mesh.scale.setScalar(Math.max(0.01, e.size * (1 + age * e.grow)));
        e.mesh.material.opacity = e.fade * Math.min(1, e.life / (e.maxLife * 0.5));
      }
      return true;
    });
    this.debris = this.debris.filter((e) => {
      e.life -= dt;
      e.mesh.position.copy(e.body.position);
      e.mesh.quaternion.copy(e.body.quaternion);
      if (e.life <= 0) {
        this.physics.world.removeBody(e.body);
        this.view.disposeObject(e.mesh);
        return false;
      }
      return true;
    });
    this.debrisActive = this.debris.length > 0;
  }

  finish(success, reason = null) {
    if (this.status !== "playing") return;
    this.status = success ? "success" : "failed";
    this.reason = reason;
    this.input.fire = false;
    if (success) {
      this.score += this.op.finishBonus?.() ?? 300;
      this.audio.play("win");
    } else {
      if (this.player && reason === "hull") this.blast(this.player.position, 2.3, COLORS.hostile);
      this.audio.play("fail");
    }
  }

  result() {
    const success = this.status === "success";
    return {
      success,
      score: this.score,
      stars: this.op.stars(success),
      index: this.index,
      kills: this.kills,
      reason: this.reason,
      accuracy: this.shots ? Math.min(100, Math.round((this.hits / this.shots) * 100)) : 0,
    };
  }

  snapshot() {
    const op = this.op.snapshot();
    return {
      index: this.index,
      chapter: this.chapter,
      time: this.time,
      score: this.score,
      status: this.status,
      shields: [...this.shields],
      projectiles: this.projectiles.length,
      player: this.player ? this.player.position.toArray() : null,
      auto: this.auto,
      twin: this.twin,
      progress: this.status === "success" ? 1 : (op.progress ?? 0),
      remaining: this.chapter === 0 ? op.left.enemies : 0,
      op,
      rescue: this.rescue ? op : null,
    };
  }
}
