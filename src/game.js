import * as THREE from "three";
import { PICKUPS } from "./pickups.js";
import { RescueOperation } from "./rescue.js";
import {
  RESCUE_HEIGHT,
  RESCUE_BOUNDS,
  isHostileEntity,
} from "./rescue-data.js";
import {
  MISSIONS,
  DEFAULT_LOADOUT,
  COLORS,
  SHOT_INTERVAL,
  damageShields,
} from "./data.js";
import {
  createPhysics,
  addBox,
  addBomb,
  movement,
  segmentSphere,
  clamp,
  guideForce,
  forecast,
} from "./physics.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const forward = V(0, 0, -1);
const up = V(0, 1, 0);
const pickupTypes = ["health", "star", "gun", "medal"];
const turretNode = (mesh) => {
  let node = null;
  mesh.traverse((child) => {
    if (!child.isMesh && /^Turret[._\d]*$/.test(child.name)) node = child;
  });
  return node;
};

export class Game {
  constructor(view, audio, notify) {
    this.view = view;
    this.audio = audio;
    this.notify = notify;
    this.input = { x: 0, z: 0, fire: false, aim: V(0, 0, -10), stickAim: null };
    this.loadout = { ...DEFAULT_LOADOUT };
    this.nextLoadout = null;
    this.weapon = "gun";
    this.paused = false;
    this.reducedMotion = false;
  }

  start(index) {
    if (this.physics)
      for (const body of [...this.physics.world.bodies])
        this.physics.world.removeBody(body);
    this.view.clear();
    this.index = index;
    this.mission = MISSIONS[index];
    this.chapter = this.mission.chapter;
    this.rescue = null;
    this.view.createScenery(this.chapter, this.mission);
    this.physics = createPhysics();
    this.entities = [];
    this.projectiles = [];
    this.effects = [];
    this.debris = [];
    this.blocks = [];
    this.bombs = [];
    this.time = 0;
    this.score = 0;
    this.kills = 0;
    this.shots = 0;
    this.hits = 0;
    this.damageTaken = 0;
    this.cooldown = 0;
    this.rocketCooldown = 0;
    this.status = "playing";
    this.finishTimer = 0;
    this.sentResult = false;
    this.paused = false;
    this.shake = 0;
    this.auto = 0;
    this.twin = 0;
    this.supportCooldown = 0;
    this.velocity = V();
    this.shields = this.chapter ? [3, 3, 3] : [1, 1, 1];
    this.input.fire = false;
    this.input.x = 0;
    this.input.z = 0;
    this.input.stickAim = null;
    this.input.winch = false;
    this.nextLoadout = null;
    this.playerTurret = null;
    this.rotor = null;
    this.ammo = 0;
    if (this.chapter === 0) this.setupBombing();
    if (this.chapter === 1) this.setupRiver();
    if (this.chapter === 2) this.setupHeli();
    this.reticle = this.view.ring(V(0, 0.04, -8), 0.65, COLORS.gold, 0.08);
    this.reticle.visible = this.chapter !== 0;
    this.notify("start", { mission: this.mission, index });
  }

  entity(type, model, position, options = {}) {
    const mesh = model
      ? this.view.model(model, position, options.scale || 1)
      : new THREE.Group();
    if (!model) {
      mesh.position.copy(position);
      this.view.level.add(mesh);
    }
    const entity = {
      type,
      mesh,
      radius: 0.7,
      hp: 1,
      dead: false,
      age: 0,
      ...options,
    };
    entity.position = mesh.position;
    mesh.userData.entity = entity;
    this.entities.push(entity);
    return entity;
  }

  opponent(position, options = {}) {
    const enemy = this.entity("enemy", "enemy", position, {
      radius: 0.62,
      ...options,
    });
    enemy.baseY = position.y;
    enemy.mesh.rotation.y = Math.PI;
    enemy.ring = this.view.ring(
      V(0, 0.03, 0),
      0.53,
      COLORS.hostile,
      0.055,
      enemy.mesh,
    );
    enemy.limbs = ["ArmL", "ArmR", "LegL", "LegR"].map((n) =>
      enemy.mesh.getObjectByName(n),
    );
    return enemy;
  }

  setupBombing() {
    const m = this.mission;
    this.ammo = m.bombs;
    this.player = this.view.model("plane", V(-11, 14.5, 0.6), 0.8);
    this.player.rotation.y = -Math.PI / 2;
    this.ground = addBox(this.physics, V(0, 0.3, 0), V(33, 1.4, 15));
    this.ground.userData = { terrain: true };
    const tileWidth = m.width / Math.ceil(m.width / 1.6);
    for (let floor = 0; floor <= m.floors; floor++) {
      const y = 1.15 + floor * 2.8;
      const thickness = floor === 0 ? 0.64 : 0.32;
      for (
        let x = -m.width / 2 + tileWidth / 2;
        x < m.width / 2;
        x += tileWidth
      ) {
        for (let z = -1.65; z <= 1.7; z += 1.1)
          this.addBlock(
            V(x, y, z),
            V(tileWidth - 0.035, thickness, 1.065),
            floor === 0 ? 2 : 1,
            floor === 0 ? 0x8b9e96 : 0xe2e4d5,
            `floor-${floor}`,
          );
      }
      if (floor < m.floors) {
        this.addBlock(
          V(-m.width / 2, y + 1.4, -0.1),
          V(0.32, 2.5, 4.6),
          1,
          0xbec8be,
        );
        this.addBlock(
          V(m.width / 2, y + 1.4, -0.1),
          V(0.32, 2.5, 4.6),
          1,
          0xbec8be,
        );
        this.addBlock(V(0, y + 1.4, -2.3), V(m.width, 2.5, 0.26), 1, 0xaebeb7);
        for (let x = -m.width / 2 + 1.3; x < m.width / 2; x += 2.8) {
          this.view.box(V(x, y + 1.6, -2.12), V(1.25, 0.9, 0.05), 0x568387);
          this.view.box(V(x, y + 1.6, -2.07), V(0.055, 0.93, 0.05), 0xdde1d2);
        }
        for (let x of [-m.width / 2 + 0.4, m.width / 2 - 0.4])
          this.addBlock(V(x, y + 1.4, 2), V(0.28, 2.5, 0.3), 1, 0xd1d9c9);
      }
    }
    const perFloor = m.enemies <= 3 ? m.enemies : Math.ceil(m.enemies / 2);
    for (let i = 0; i < m.enemies; i++) {
      const floor = Math.floor(i / perFloor);
      const count = Math.min(perFloor, m.enemies - floor * perFloor);
      const x =
        count === 1
          ? 0
          : (((i % perFloor) - (count - 1) / 2) * (m.width - 3)) /
            Math.max(1, count - 1);
      this.opponent(V(x, 1.51 + floor * 2.8, 0.7));
    }
    this.view.model("beacon", V(m.width / 2 + 2.8, 1, -2), 0.9);
    this.view.box(
      V(0, 1.15 + m.floors * 2.8 + 0.35, -1.5),
      V(2, 0.4, 0.9),
      0x4b7376,
    );
    this.view.model("beacon", V(0, 1.15 + m.floors * 2.8 + 0.55, -1.5), 0.7);
    this.view.ring(V(0, 1.04, 0), m.width / 2 + 0.8, COLORS.gold, 0.055);
    this.preview = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({
        color: 0xffedb0,
        dashSize: 0.2,
        gapSize: 0.23,
        transparent: true,
        opacity: 0.9,
      }),
    );
    this.preview.userData.disposable = true;
    this.view.level.add(this.preview);
    this.forecastCooldown = 0;
  }

  addBlock(position, size, resistance, color, layer = null) {
    const mesh = this.view.box(position, size, color);
    const body = addBox(this.physics, position, size);
    body.collisionFilterGroup = 2;
    const block = {
      mesh,
      body,
      position,
      size,
      resistance,
      layer,
      dead: false,
      bounds: new THREE.Box3().setFromCenterAndSize(position, size),
    };
    body.userData = { block };
    this.blocks.push(block);
    return block;
  }

  segmentBlock(a, b, block) {
    const direction = b.clone().sub(a),
      length = direction.length();
    if (length < 0.00001) return null;
    const ray = new THREE.Ray(a, direction.multiplyScalar(1 / length));
    const bounds = block.bounds.clone().expandByScalar(0.16);
    if (bounds.containsPoint(a)) return a.clone();
    const point = ray.intersectBox(bounds, new THREE.Vector3());
    return point && point.distanceTo(a) <= length ? point : null;
  }

  drop() {
    if (
      this.paused ||
      this.status !== "playing" ||
      this.chapter !== 0 ||
      this.ammo < 1
    )
      return;
    const config = { ...(this.nextLoadout || this.loadout) };
    this.nextLoadout = null;
    const position = this.player.position.clone().add(V(0, -0.5, 0));
    const body = addBomb(this.physics, position, config);
    const mesh = this.view.model("missile-friendly", position, 0.8);
    const bomb = {
      mesh,
      body,
      config,
      time: 0,
      contactTime: null,
      seen: new Set(),
      layers: new Set(),
      penetrated: 0,
      dead: false,
      last: position.clone(),
    };
    body.addEventListener("collide", (event) => {
      if (bomb.dead) return;
      if (event.body.userData?.terrain || event.body.userData?.block) {
        if (bomb.contactTime === null) {
          bomb.contactTime = bomb.time;
          this.audio.play("hit");
        }
        if (config.type === "drill") bomb.pendingDetonation = true;
      }
    });
    this.bombs.push(bomb);
    this.ammo--;
    this.shots++;
    this.audio.play("shot");
  }

  detonate(bomb) {
    if (bomb.dead) return;
    bomb.dead = true;
    const position = bomb.mesh.position.clone();
    this.physics.world.removeBody(bomb.body);
    this.view.disposeObject(bomb.mesh);
    this.explode(position, 3.25, COLORS.gold);
    for (const block of this.blocks) {
      if (
        !block.dead &&
        block.bounds.distanceToPoint(position) <
          2.55 / Math.sqrt(block.resistance)
      )
        this.breakBlock(block, position);
    }
    for (const target of this.entities) {
      if (
        !target.dead &&
        target.type === "enemy" &&
        target.position
          .clone()
          .add(V(0, 0.6, 0))
          .distanceTo(position) < 3.4
      )
        this.kill(target);
    }
  }

  breakBlock(block, origin) {
    if (block.dead) return;
    block.dead = true;
    block.mesh.visible = false;
    this.physics.world.removeBody(block.body);
    if (this.debris.length >= 42) return;
    const size = block.size
      .clone()
      .clamp(V(0.15, 0.15, 0.15), V(0.65, 0.5, 0.65));
    const mesh = this.view.box(block.position, size, 0xb8c3b5);
    const body = addBox(this.physics, block.position, size, 0.7);
    body.collisionFilterGroup = 4;
    body.collisionFilterMask = 1;
    const kick = block.position
      .clone()
      .sub(origin)
      .normalize()
      .multiplyScalar(3);
    body.velocity.set(
      kick.x,
      2 + Math.random() * 3,
      kick.z + (Math.random() - 0.5) * 2,
    );
    body.angularVelocity.set(2, 3, 1);
    this.debris.push({ mesh, body, life: 2.5 });
  }

  setupRiver() {
    this.player = this.view.model("boat", V(0, 0.1, 10));
    this.playerTurret = turretNode(this.player);
    this.boatParts = Object.fromEntries(
      [
        "SingleGun",
        "TwinGunL",
        "TwinGunR",
        "Muzzle",
        "MuzzleL",
        "MuzzleR",
        "SupportRack",
        "Radar",
      ].map((name) => [name, this.player.getObjectByName(name)]),
    );
    this.updateBoatLoadout();
    this.travel = 0;
    this.spawnNumber = 0;
    this.pickupNumber = 0;
    for (let i = 0; i < 9; i++) this.spawnRiverRow(2 - i * 11);
    for (let i = 0; i < 4; i++)
      this.spawnPickup(5 - i * 22, pickupTypes[i], ((i % 3) - 1) * 3.5);
    this.spawnCooldown = 11 / this.mission.speed;
    this.pickupCooldown = 7;
    this.shieldMeshes = this.createShields(3.1, 0.6);
    this.wakeCooldown = 0;
  }

  spawnRiverRow(z) {
    const i = this.spawnNumber++;
    const side = i % 2 ? -1 : 1;
    const gun = this.entity("cannon", "cannon", V(side * 12.2, 1.05, z), {
      radius: 1.1,
      hp: 3,
      cooldown: 1.8 + (i % 3) * 0.6,
      scrolling: true,
    });
    gun.mesh.rotation.y = (side * Math.PI) / 2;
    for (let crew = 0; crew < 2; crew++)
      this.opponent(V(side * (13.5 + crew * 0.55), 1.08, z + 1.5 - crew * 3), {
        scrolling: true,
        scale: 0.9,
      });
    if (i % 3 === 1) {
      const launcher = this.entity(
        "launcher",
        "launcher",
        V(-side * 13.5, 1.1, z - 2),
        { hp: 6, radius: 1.9, cooldown: 2.5, warning: 0, scrolling: true },
      );
      launcher.light = this.view.ring(
        V(0, 0.1, 0),
        1.85,
        COLORS.hostile,
        0.13,
        launcher.mesh,
      );
      this.entity("cannon", "cannon", V(-side * 12.2, 1.05, z + 2), {
        radius: 1.1,
        hp: 3,
        cooldown: 2,
        scrolling: true,
      });
      this.opponent(V(-side * 15, 1.1, z + 1.7), {
        scrolling: true,
        scale: 0.9,
      });
    }
    const mine = this.entity(
      "mine",
      "mine",
      V(Math.sin(i * 2.43) * 7.2, -0.18, z - 4),
      { radius: 0.8, scrolling: true, hp: 1 },
    );
    mine.halo = this.view.ring(
      V(0, 0.1, 0),
      1.35,
      COLORS.hostile,
      0.08,
      mine.mesh,
    );
  }

  spawnPickup(z, kind, x = Math.sin(this.pickupNumber++ * 2) * 6) {
    const info = PICKUPS[kind];
    if (!info) throw new Error(`Unknown pickup: ${kind}`);
    const pickup = this.entity("pickup", null, V(x, 0.22, z), {
      kind,
      scrolling: true,
      radius: 1.45,
    });
    pickup.body = this.view.model(info.model, V(), 1, pickup.mesh);
    pickup.badge = this.view.pickupBadge(kind, pickup.mesh);
    pickup.halo = this.view.ring(
      V(0, -0.15, 0),
      1.3,
      info.color,
      0.08,
      pickup.mesh,
    );
    return pickup;
  }

  setupHeli() {
    this.player = this.view.model("helicopter", V(0, RESCUE_HEIGHT, 18), 0.95);
    this.rotor = this.player.getObjectByName("Rotor");
    this.tailRotor = this.player.getObjectByName("TailRotor");
    this.heliTurret = this.player.getObjectByName("ChinTurret");
    this.heliMuzzle = this.player.getObjectByName("HeliMuzzle");
    this.shieldMeshes = this.createShields(3.1, 0);
    this.rescue = new RescueOperation(this);
    this.view.followPlayer(this.player.position, 0, true);
    this.wakeCooldown = 0;
  }

  createShields(radius, y) {
    return [0, 1, 2].map((i) => {
      const geo = new THREE.TorusGeometry(
        radius,
        0.055,
        5,
        26,
        (Math.PI * 2) / 3 - 0.11,
      );
      const mat = new THREE.MeshBasicMaterial({
        color: COLORS.friendly,
        transparent: true,
        opacity: 0.57,
      });
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
      if (this.debris.length) this.physics.world.step(dt);
      this.finishTimer += dt;
      if (this.finishTimer > 1.1 && !this.sentResult) {
        this.sentResult = true;
        this.notify("result", this.result());
      }
      return;
    }
    this.time += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.rocketCooldown = Math.max(0, this.rocketCooldown - dt);
    if (this.chapter === 0) this.updateBombing(dt);
    else {
      this.updateVehicle(dt);
      if (this.chapter === 1) this.updateRiver(dt);
      else this.updateHeli(dt);
      this.updateProjectiles(dt);
      if (
        this.chapter === 1 &&
        this.status === "playing" &&
        this.time >= this.mission.duration
      )
        this.finish(true);
    }
    this.updatePeople(dt);
  }

  updateBombing(dt) {
    this.player.position.x += 4 * dt;
    if (this.player.position.x > 17) this.player.position.x = -17;
    this.player.position.y = 14.5 + Math.sin(this.time * 1.7) * 0.09;
    for (const name of ["PropellerL", "PropellerR"]) {
      const p = this.player.getObjectByName(name);
      if (p) p.rotation.z += dt * 48;
    }
    for (const bomb of this.bombs) {
      if (bomb.dead) continue;
      bomb.last.copy(bomb.body.position);
      bomb.body.force.x += guideForce(bomb.time, bomb.config);
    }
    this.physics.world.step(dt);
    for (const bomb of this.bombs) {
      if (bomb.dead) continue;
      bomb.time += dt;
      bomb.mesh.position.copy(bomb.body.position);
      if (bomb.pendingDetonation) {
        this.detonate(bomb);
        continue;
      }
      const direction = V(
        bomb.body.velocity.x,
        bomb.body.velocity.y,
        bomb.body.velocity.z,
      ).normalize();
      if (direction.lengthSq())
        bomb.mesh.quaternion.setFromUnitVectors(forward, direction);
      if (bomb.config.type === "drill") {
        const crossed = this.blocks
          .filter(
            (b) =>
              !b.dead &&
              !bomb.seen.has(b) &&
              this.segmentBlock(bomb.last, bomb.mesh.position, b),
          )
          .sort((a, b) => b.position.y - a.position.y);
        for (const block of crossed) {
          bomb.seen.add(block);
          const layer = block.layer || block;
          const newLayer = !bomb.layers.has(layer);
          if (newLayer) {
            bomb.layers.add(layer);
            bomb.penetrated += block.resistance;
          }
          this.breakBlock(block, bomb.mesh.position);
          if (newLayer)
            bomb.body.velocity.scale(
              Math.pow(0.88, block.resistance),
              bomb.body.velocity,
            );
          this.puff(bomb.mesh.position, 0xcad8ce, 0.5);
          if (bomb.penetrated >= bomb.config.walls) {
            this.detonate(bomb);
            break;
          }
        }
      }
      if (
        !bomb.dead &&
        bomb.contactTime !== null &&
        bomb.time - bomb.contactTime >= bomb.config.fuse
      )
        this.detonate(bomb);
      if (
        !bomb.dead &&
        (bomb.time > 8 ||
          bomb.mesh.position.y < -0.5 ||
          Math.abs(bomb.mesh.position.x) > 35)
      )
        this.detonate(bomb);
      if (
        !bomb.dead &&
        Math.floor(bomb.time / 0.065) !== Math.floor((bomb.time - dt) / 0.065)
      )
        this.puff(bomb.mesh.position, 0xe3eee1, 0.13, 0.32);
    }
    this.forecastCooldown -= dt;
    if (this.forecastCooldown <= 0) {
      this.forecastCooldown = 0.065;
      const points = forecast(
        this.player.position.clone().add(V(0, -0.5, 0)),
        this.nextLoadout || this.loadout,
        (a, b) =>
          this.blocks.some(
            (block) =>
              !block.dead &&
              this.segmentBlock(V(a.x, a.y, a.z), V(b.x, b.y, b.z), block),
          ) || b.y < 1.2,
      );
      this.preview.geometry.dispose();
      this.preview.geometry = new THREE.BufferGeometry().setFromPoints(
        points.map((p) => V(p.x, p.y, p.z)),
      );
      this.preview.computeLineDistances();
      this.preview.visible = this.ammo > 0;
    }
    if (!this.entities.some((e) => e.type === "enemy" && !e.dead))
      this.finish(true);
    else if (!this.ammo && this.bombs.every((b) => b.dead)) this.finish(false);
  }

  updateVehicle(dt) {
    const river = this.chapter === 1;
    movement(
      this.velocity,
      { x: this.input.x, z: this.input.z },
      dt,
      river ? 33 : 60,
      river ? 3.7 : 4.1,
      river ? 7.6 : 14,
    );
    this.player.position.x = clamp(
      this.player.position.x + this.velocity.x * dt,
      river ? -9 : RESCUE_BOUNDS.left,
      river ? 9 : RESCUE_BOUNDS.right,
    );
    this.player.position.z = clamp(
      this.player.position.z + this.velocity.z * dt,
      river ? -7 : RESCUE_BOUNDS.far,
      river ? 18 : RESCUE_BOUNDS.near,
    );
    this.player.position.y =
      (river ? 0.08 : RESCUE_HEIGHT) +
      Math.sin(this.time * (river ? 2.5 : 1.3)) * 0.07;
    this.player.rotation.z = THREE.MathUtils.damp(
      this.player.rotation.z,
      -this.velocity.x * (river ? 0.012 : 0.035),
      6,
      dt,
    );
    this.player.rotation.x = THREE.MathUtils.damp(
      this.player.rotation.x,
      this.velocity.z * (river ? 0.008 : 0.016),
      6,
      dt,
    );
    let aim = this.input.aim;
    this.aimTarget = null;
    if (this.input.stickAim) {
      const direction = this.view.screenDirection(this.input.stickAim);
      this.aimTarget = this.directionTarget(direction);
      aim = this.aimTarget
        ? this.targetPosition(this.aimTarget)
        : this.player.position
            .clone()
            .addScaledVector(direction, 35)
            .setY(river ? 0.2 : 1.5);
    }
    if (river && this.twin > 0 && !this.input.fire) {
      const target = this.nearestTarget();
      if (target) aim = this.targetPosition(target);
    }
    if (river) this.aimBoatTurret(aim);
    this.reticle.position.copy(aim);
    this.reticle.position.y = Math.max(0.13, aim.y + 0.1);
    this.reticle.visible = true;
    if (this.input.fire && !this.input.winch)
      this.fire(aim, this.chapter === 2 && this.weapon !== "gun");
    if (!river) this.view.followPlayer(this.player.position, dt);
    for (let i = 0; i < 3; i++) {
      this.shieldMeshes[i].position
        .copy(this.player.position)
        .add(V(0, river ? 0.45 : -0.6, 0));
      this.shieldMeshes[i].visible = this.shields[i] > 0;
      this.shieldMeshes[i].material.opacity = river
        ? 0.18 + this.shields[i] * 0.1
        : 0.5;
    }
    this.wakeCooldown -= dt;
    if (this.wakeCooldown <= 0) {
      this.wakeCooldown = river ? 0.17 : 0.65;
      const p = this.player.position.clone();
      p.y = 0.11;
      if (river) p.z += 2;
      const ring = this.view.ring(
        p,
        river ? 0.55 : 2,
        0xc5f4de,
        river ? 0.07 : 0.025,
      );
      this.effects.push({
        mesh: ring,
        life: river ? 1.2 : 1.8,
        maxLife: river ? 1.2 : 1.8,
        ring: true,
        growth: river ? 1.2 : 2,
      });
    }
  }

  updateRiver(dt) {
    const flow = this.mission.speed * dt;
    this.travel += flow;
    for (const prop of this.view.scrollProps) {
      prop.position.z += flow;
      if (prop.position.z > 32) prop.position.z -= 120;
    }
    this.spawnCooldown -= dt;
    this.pickupCooldown -= dt;
    if (this.spawnCooldown <= 0) {
      this.spawnRiverRow(-73);
      this.spawnCooldown += 11 / this.mission.speed;
    }
    if (this.pickupCooldown <= 0) {
      this.spawnPickup(-38, pickupTypes[this.pickupNumber % 4]);
      this.pickupCooldown += 7;
    }
    this.auto = Math.max(0, this.auto - dt);
    this.twin = Math.max(0, this.twin - dt);
    this.updateBoatLoadout();
    if (this.boatParts.Radar) this.boatParts.Radar.rotation.y += dt * 1.6;
    this.supportCooldown -= dt;
    if (this.twin > 0) {
      const target = this.nearestTarget();
      if (target) this.fire(this.targetPosition(target));
    }
    if (this.auto > 0 && this.supportCooldown <= 0) {
      const target = this.nearestTarget();
      if (target) {
        this.spawnShot(
          this.boatParts.SupportRack
            ? this.boatParts.SupportRack.getWorldPosition(V()).add(
                V(0, 0.2, -0.8),
              )
            : this.player.position.clone().add(V(0, 1.1, -1)),
          this.targetPosition(target),
          true,
          false,
          target,
        );
        this.supportCooldown = 0.7;
      }
    }
    for (const e of this.entities) {
      if (e.scrolling) e.position.z += flow;
      if (e.dead) continue;
      e.age += dt;
      if (e.position.z > 30) {
        e.dead = true;
        this.view.disposeObject(e.mesh);
        continue;
      }
      if (e.type === "mine") {
        const distance = Math.hypot(
          e.position.x - this.player.position.x,
          e.position.z - this.player.position.z,
        );
        const danger = clamp(1 - distance / 10, 0, 1);
        e.mesh.scale.setScalar(1 + danger * 0.38);
        e.position.y = -0.2 + danger * 0.35;
        e.halo.material.opacity = 0.08 + danger * 0.75;
        e.halo.scale.setScalar(
          1 + Math.sin(this.time * (3 + danger * 8)) * 0.12,
        );
        if (distance < 2) {
          this.kill(e, false);
          this.hurtPlayer(e.position, 2);
        }
      }
      if (e.type === "pickup") {
        e.position.y = 0.22 + Math.sin(this.time * 2.3 + e.position.z) * 0.065;
        e.body.rotation.y += dt * 0.35;
        e.body.rotation.z = Math.sin(this.time * 1.8 + e.position.z) * 0.06;
        e.halo.material.opacity = 0.38 + Math.sin(this.time * 2) * 0.08;
        if (
          Math.hypot(
            e.position.x - this.player.position.x,
            e.position.z - this.player.position.z,
          ) < 2.4
        )
          this.collect(e);
      }
      if (
        e.type === "cannon" &&
        Math.abs(e.position.z - this.player.position.z) < 28
      ) {
        e.cooldown -= dt;
        const turret = turretNode(e.mesh);
        if (turret) {
          const dir = this.player.position.clone().sub(e.position);
          turret.rotation.y = Math.atan2(-dir.x, -dir.z) - e.mesh.rotation.y;
        }
        if (e.cooldown <= 0) {
          const aim = this.player.position
            .clone()
            .add(V(0, 1.1, 0))
            .addScaledVector(this.velocity, 0.35);
          this.spawnShot(e.position.clone().add(V(0, 1, 0)), aim, false, true);
          e.cooldown = this.mission.fireRate;
        }
      }
      if (
        e.type === "launcher" &&
        Math.abs(e.position.z - this.player.position.z) < 34
      ) {
        e.cooldown -= dt;
        e.light.material.opacity =
          e.cooldown < 1 ? 0.5 + Math.sin(this.time * 18) * 0.45 : 0.08;
        if (e.cooldown <= 0) {
          this.spawnShot(
            e.position.clone().add(V(0, 2.7, 0)),
            this.player.position.clone().add(V(0, 1, 0)),
            true,
            true,
          );
          e.cooldown = 4.5;
        }
      }
    }
    this.entities = this.entities.filter(
      (e) => !e.dead || e.fallTime !== undefined,
    );
  }

  collect(pickup) {
    if (this.rescue) return this.rescue.collect(pickup);
    if (pickup.dead || this.status !== "playing") return;
    const info = PICKUPS[pickup.kind];
    pickup.dead = true;
    this.view.disposeObject(pickup.mesh);
    if (pickup.kind === "health") this.shields = [3, 3, 3];
    if (pickup.kind === "star") this.twin = info.duration;
    if (pickup.kind === "gun") this.auto = info.duration;
    this.updateBoatLoadout();
    this.score += info.reward;
    this.notify("toast", info.toast);
    this.audio.play("pickup");
    this.puff(pickup.position, info.color, 0.8);
    const ring = this.view.ring(
      this.player.position.clone().add(V(0, 0.3, 0)),
      0.9,
      info.color,
      0.11,
    );
    this.effects.push({
      mesh: ring,
      life: 0.75,
      maxLife: 0.75,
      ring: true,
      growth: 4,
    });
  }

  updateBoatLoadout() {
    if (this.chapter !== 1 || !this.boatParts) return;
    if (this.boatParts.SingleGun)
      this.boatParts.SingleGun.visible = this.twin <= 0;
    for (const name of ["TwinGunL", "TwinGunR"])
      if (this.boatParts[name]) this.boatParts[name].visible = this.twin > 0;
    if (this.boatParts.SupportRack)
      this.boatParts.SupportRack.visible = this.auto > 0;
  }

  aimBoatTurret(aim) {
    if (!this.playerTurret) return;
    this.player.updateMatrixWorld(true);
    const localAim = this.playerTurret.parent
      .worldToLocal(aim.clone())
      .sub(this.playerTurret.position);
    this.playerTurret.rotation.y = Math.atan2(-localAim.x, -localAim.z);
    this.player.updateMatrixWorld(true);
  }

  updateHeli(dt) {
    this.rescue.update(dt);
  }

  updateCaves(dt) {
    for (const e of this.entities) {
      if (e.type !== "cave" || e.dead || e.phase === "disabled") continue;
      if (this.rescue && e.position.distanceTo(this.player.position) > 48)
        continue;
      e.age += dt;
      if (e.phase === "hidden") {
        if (this.time >= e.appearAt) {
          e.phase = "opening";
          e.timer = 0;
        }
        continue;
      }
      e.timer += dt;
      if (e.phase === "opening") {
        e.mesh.scale.setScalar(e.size * clamp(e.timer / 1.4, 0.01, 1));
        if (e.timer >= 1.4) {
          e.phase = "enemy";
          e.timer = 0;
          e.crew.visible = true;
        }
      } else if (e.phase === "enemy" && e.timer >= 3) {
        e.phase = "launcher";
        e.timer = 0;
        e.launcher.visible = true;
      } else if (e.phase === "launcher" && e.timer >= 5) {
        this.spawnShot(
          this.targetPosition(e).add(V(0, 0.8, 0)),
          this.player.position.clone(),
          true,
          true,
        );
        e.timer = 2.5;
      }
      if (e.crew.visible) {
        e.crew.position.y = -0.6 + Math.min(e.timer, 1) * 0.15;
        e.crew.rotation.x =
          e.phase === "enemy" ? Math.max(0, 1 - e.timer) * 0.9 : 0;
      }
      e.warningRing.visible = e.phase === "launcher";
      if (e.warningRing.visible)
        e.warningRing.material.opacity = 0.3 + Math.sin(this.time * 7) * 0.25;
    }
  }

  targetPosition(e) {
    if (e.hostile || e.type === "drone") return e.position.clone();
    if (e.type === "aa-truck") return e.position.clone().add(V(0, 1.1, 0));
    return e.position
      .clone()
      .add(
        V(
          0,
          e.type === "cave"
            ? 0.45
            : e.type === "launcher"
              ? 1.4
              : e.type === "cannon"
                ? 1
                : e.type === "enemy"
                  ? 0.7
                  : 0.1,
          e.type === "cave" ? 1.5 : 0,
        ),
      );
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
          a.position.distanceToSquared(this.player.position) -
          b.position.distanceToSquared(this.player.position),
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
    if (this.paused || this.status !== "playing" || this.chapter === 0)
      return false;
    if (this.chapter === 2 && this.input.winch) return false;
    if (rocket ? this.rocketCooldown > 0 : this.cooldown > 0) return false;
    const guided = this.chapter === 2 && this.weapon === "guided";
    const target = guided
      ? this.entities
          .filter(isHostileEntity)
          .sort(
            (a, b) =>
              this.targetPosition(a).distanceToSquared(aim) -
              this.targetPosition(b).distanceToSquared(aim),
          )[0]
      : null;
    if (
      guided &&
      (!target ||
        this.targetPosition(target).distanceTo(aim) > 4 ||
        target.position.distanceTo(this.player.position) > 55)
    )
      return false;
    if (this.rescue && rocket) {
      const key = guided ? "guided" : "rockets";
      if (this.rescue.gear[key] <= 0) return false;
      this.rescue.gear[key]--;
    }
    if (rocket) this.rocketCooldown = 1.2;
    else this.cooldown = SHOT_INTERVAL;
    if (this.chapter === 1) this.aimBoatTurret(aim);
    if (this.chapter === 2 && this.heliTurret) {
      this.player.updateMatrixWorld(true);
      const direction = aim
        .clone()
        .sub(this.heliTurret.getWorldPosition(V()))
        .normalize();
      direction.applyQuaternion(
        this.player.getWorldQuaternion(new THREE.Quaternion()).invert(),
      );
      this.heliTurret.quaternion.setFromUnitVectors(forward, direction);
      this.player.updateMatrixWorld(true);
    }
    const origin =
      this.chapter === 1 && this.boatParts.Muzzle
        ? this.boatParts.Muzzle.getWorldPosition(V())
        : this.chapter === 2 && this.heliMuzzle
          ? this.heliMuzzle.getWorldPosition(V())
          : this.player.position
              .clone()
              .add(V(0, this.chapter === 1 ? 1.1 : -0.1, -1.15));
    if (this.twin > 0 && !rocket) {
      for (const side of [-1, 1])
        this.spawnShot(
          this.chapter === 1 && this.boatParts[side < 0 ? "MuzzleL" : "MuzzleR"]
            ? this.boatParts[side < 0 ? "MuzzleL" : "MuzzleR"].getWorldPosition(
                V(),
              )
            : origin.clone().add(V(side * 0.7, 0, 0)),
          aim.clone().add(V(side * 0.3, 0, 0)),
          false,
          false,
        );
    } else this.spawnShot(origin, aim, rocket, false, target);
    if (this.chapter === 2)
      this.puff(
        origin,
        rocket ? 0xffd47e : COLORS.friendly,
        rocket ? 0.2 : 0.12,
        0.09,
      );
    this.audio.play("shot");
    return true;
  }

  spawnShot(origin, aim, missile, hostile, target = null) {
    let mesh;
    if (missile)
      mesh = this.view.model(
        hostile ? "missile-enemy" : "missile-friendly",
        origin,
        hostile ? 1.5 : 1.1,
      );
    else
      mesh = this.view.box(
        origin,
        V(0.07, 0.07, 0.85),
        hostile ? COLORS.hostile : COLORS.friendly,
      );
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
      speed,
      age: 0,
      life: missile ? 12 : hostile ? 5 : 2.1,
      last: origin.clone(),
      trail: 0,
      dead: false,
      radius: missile ? 0.5 : 0.11,
    };
    mesh.quaternion.setFromUnitVectors(forward, velocity.clone().normalize());
    this.projectiles.push(shot);
    if (!hostile) this.shots++;
    return shot;
  }

  updateProjectiles(dt) {
    for (const shot of this.projectiles) {
      if (shot.dead) continue;
      shot.age += dt;
      shot.life -= dt;
      shot.last.copy(shot.position);
      if (shot.missile) {
        const goal =
          shot.hostile && (shot.distracted || this.rescue?.countermeasures > 0)
            ? null
            : shot.hostile
              ? this.player.position
                  .clone()
                  .add(V(0, this.chapter === 1 ? 1 : 0, 0))
              : shot.target && !shot.target.dead
                ? this.targetPosition(shot.target)
                : null;
        if (goal) {
          const desired = goal.sub(shot.position).normalize();
          const direction = shot.velocity.clone().normalize();
          const turn = new THREE.Quaternion().setFromUnitVectors(
            direction,
            desired,
          );
          const limited = new THREE.Quaternion().rotateTowards(
            turn,
            dt * (shot.hostile ? 1.2 : 3.5),
          );
          direction.applyQuaternion(limited);
          shot.speed = Math.min(shot.hostile ? 11 : 22, shot.speed + dt * 0.65);
          shot.velocity.copy(direction).multiplyScalar(shot.speed);
        }
        shot.trail -= dt;
        if (shot.trail <= 0) {
          this.puff(
            shot.position,
            shot.hostile ? 0xffb396 : 0xc8ffe9,
            0.17,
            0.6,
          );
          shot.trail = 0.07;
        }
        const threat = shot.hostile
          ? clamp(1 - shot.position.distanceTo(this.player.position) / 28, 0, 1)
          : 0;
        shot.mesh.scale.setScalar(
          (shot.hostile ? 1.5 : 1.1) *
            (1 + threat * 0.25 + Math.sin(shot.age * 7) * 0.025),
        );
      }
      shot.position.addScaledVector(shot.velocity, dt);
      shot.mesh.quaternion.setFromUnitVectors(
        forward,
        shot.velocity.clone().normalize(),
      );
      if (shot.hostile) {
        const centre = this.player.position
          .clone()
          .add(V(0, this.chapter === 1 ? 0.85 : 0, 0));
        const t = segmentSphere(shot.last, shot.position, centre, 3.1);
        if (t !== null) {
          this.hurtPlayer(shot.last.clone().lerp(shot.position, t), 1);
          this.explode(
            shot.position,
            shot.missile ? 1.1 : 0.38,
            COLORS.hostile,
            false,
          );
          shot.dead = true;
        }
      } else {
        let hit = null;
        for (const enemyShot of this.projectiles) {
          if (!enemyShot.hostile || !enemyShot.missile || enemyShot.dead)
            continue;
          const t = segmentSphere(
            shot.last,
            shot.position,
            enemyShot.position,
            0.75 + shot.radius,
          );
          if (t !== null && (!hit || t < hit.t))
            hit = { t, missile: enemyShot };
        }
        for (const e of this.entities) {
          if (!isHostileEntity(e)) continue;
          const t = segmentSphere(
            shot.last,
            shot.position,
            this.targetPosition(e),
            e.radius + shot.radius,
          );
          if (t !== null && (!hit || t < hit.t)) hit = { t, entity: e };
        }
        if (hit) {
          const endpoint = shot.position.clone();
          shot.position.copy(shot.last).lerp(endpoint, hit.t);
          shot.dead = true;
          this.hits++;
          if (hit.missile) {
            hit.missile.dead = true;
            const bonus =
              90 +
              Math.round(
                clamp(
                  1 -
                    hit.missile.position.distanceTo(this.player.position) / 25,
                  0,
                  1,
                ) * 110,
              );
            this.score += bonus;
            this.notify("toast", `INTERCEPT +${bonus}`);
            this.explode(hit.missile.position, 1.25, COLORS.gold);
          } else {
            this.damage(hit.entity, shot.missile ? 5 : 1, shot.missile);
            this.explode(
              shot.position,
              shot.missile ? 1.7 : 0.28,
              shot.missile ? COLORS.gold : COLORS.friendly,
              false,
            );
            if (shot.missile)
              for (const e of this.entities) {
                if (
                  e !== hit.entity &&
                  !e.dead &&
                  isHostileEntity(e) &&
                  this.targetPosition(e).distanceTo(shot.position) < 3.7
                )
                  this.damage(e, 3, true);
              }
          }
        }
      }
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

  damage(e, amount, rocket = false) {
    if (
      amount <= 0 ||
      e.dead ||
      e.friendly ||
      e.type === "pickup" ||
      (e.type === "cave" &&
        ["hidden", "closed", "opening", "disabled"].includes(e.phase))
    )
      return;
    e.hp -= amount;
    this.puff(this.targetPosition(e), 0xffd88b, 0.24, 0.2);
    if (e.type === "cave") {
      e.phase = "disabled";
      e.timer = 0;
      e.mouth.scale.set(0.9, 0.2, 0.2);
      e.crew.visible = false;
      e.launcher.visible = false;
      e.warningRing.visible = false;
      this.score += rocket ? 150 : 100;
      this.kills++;
      this.explode(this.targetPosition(e), 1.5, COLORS.gold);
      return;
    }
    if (this.chapter === 2 && e.type === "aa-truck" && !e.launcherDisabled) {
      e.launcherDisabled = true;
      const rack = e.mesh.getObjectByName("TruckTurret");
      if (rack) rack.visible = false;
      if (e.warning) e.warning.visible = false;
      this.explode(this.targetPosition(e), 0.85, COLORS.gold);
    }
    if (e.hp <= 0) this.kill(e);
  }

  kill(e, reward = true) {
    if (e.dead) return;
    e.dead = true;
    if (reward) {
      this.kills++;
      this.score += e.type === "launcher" ? 250 : e.type === "mine" ? 60 : 100;
    }
    if (e.type === "enemy") {
      e.fallTime = 0;
      if (e.ring) e.ring.visible = false;
      this.puff(e.position.clone().add(V(0, 0.5, 0)), 0xdacba6, 0.45);
    } else {
      this.view.disposeObject(e.mesh);
      this.explode(
        e.position.clone().add(V(0, 0.5, 0)),
        e.type === "launcher" ? 4.8 : e.type === "cannon" ? 1.7 : 1.1,
        COLORS.gold,
      );
      if (e.type === "launcher") {
        for (const nearby of this.entities)
          if (
            !nearby.dead &&
            ["cannon", "enemy", "launcher"].includes(nearby.type) &&
            nearby.position.distanceTo(e.position) < 6
          )
            this.kill(nearby);
      }
    }
  }

  hurtPlayer(position, amount) {
    if (this.status !== "playing") return;
    const offset = position.clone().sub(this.player.position);
    let angle = Math.atan2(offset.z, offset.x);
    if (angle < 0) angle += Math.PI * 2;
    let sector = Math.floor(angle / ((Math.PI * 2) / 3)) % 3;
    if (this.chapter === 1 && this.shields[sector] === 0)
      sector = this.shields.findIndex((hp) => hp > 0);
    if (sector < 0) {
      this.finish(false);
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
    this.notify(
      "toast",
      result.breached
        ? "HULL BREACH"
        : this.shields[sector] === 0
          ? "SHIELD SECTOR LOST"
          : "SHIELD HIT",
    );
    if (result.breached) this.finish(false);
  }

  updatePeople(dt) {
    for (const e of this.entities) {
      if (e.type !== "enemy") continue;
      if (e.dead) {
        if (e.fallTime === undefined) continue;
        e.fallTime += dt;
        e.mesh.rotation.x = (-Math.min(1, e.fallTime * 3) * Math.PI) / 2;
        e.position.y = e.baseY - Math.max(0, e.fallTime - 0.8) * 0.55;
        const scale = e.scale || 1;
        e.mesh.scale.setScalar(
          scale * Math.max(0.01, 1 - Math.max(0, e.fallTime - 1.4) / 1.1),
        );
        if (e.fallTime > 2.5) {
          this.view.disposeObject(e.mesh);
          delete e.fallTime;
        }
      } else {
        e.age += dt;
        const crawl = Math.max(0, 1 - e.age / 1.2);
        e.mesh.rotation.x = crawl * 0.85;
        e.limbs?.forEach((limb, i) => {
          if (limb)
            limb.rotation.x = Math.sin(e.age * 2.5 + i * Math.PI) * 0.09;
        });
      }
    }
  }

  puff(position, color, size = 0.4, life = 0.45) {
    if (this.effects.length > 110) return;
    const mesh = this.view.sphere(position, V(size, size, size), color);
    this.effects.push({
      mesh,
      life,
      maxLife: life,
      size,
      velocity: V(
        (Math.random() - 0.5) * 0.8,
        0.6 + Math.random(),
        (Math.random() - 0.5) * 0.8,
      ),
    });
  }

  explode(position, radius, color, sound = true) {
    const ring = this.view.ring(
      position.clone().add(V(0, 0.05, 0)),
      0.3,
      color,
      0.1,
    );
    this.effects.push({
      mesh: ring,
      life: 0.48,
      maxLife: 0.48,
      ring: true,
      growth: radius * 3,
    });
    for (let i = 0; i < Math.min(16, 4 + radius * 3); i++) {
      this.puff(
        position
          .clone()
          .add(
            V(
              (Math.random() - 0.5) * radius * 0.55,
              Math.random() * 0.5,
              (Math.random() - 0.5) * radius * 0.55,
            ),
          ),
        i % 3 === 0 ? 0x6b7f77 : i % 2 ? 0xffdf88 : color,
        0.15 + Math.random() * radius * 0.15,
        0.35 + Math.random() * 0.5,
      );
    }
    if (radius > 2) this.shake = 0.18;
    if (sound) this.audio.play("blast");
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
        e.mesh.position.addScaledVector(e.velocity, dt);
        e.mesh.scale.setScalar(
          e.size * (1 + age * 0.6) * Math.min(1, e.life * 6),
        );
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
  }

  finish(success) {
    if (this.status !== "playing") return;
    this.status = success ? "success" : "failed";
    this.input.fire = false;
    if (success) {
      this.score +=
        this.chapter === 0
          ? this.ammo * 100 + 300
          : 300 + this.shields.reduce((a, b) => a + b, 0) * 40;
      this.audio.play("win");
    } else this.explode(this.player.position, 2.3, COLORS.hostile);
  }

  result() {
    let stars = 0;
    if (this.status === "success") {
      stars =
        this.chapter === 0
          ? this.shots <= Math.ceil(this.mission.enemies / 2)
            ? 3
            : 2
          : this.damageTaken === 0
            ? 3
            : this.damageTaken <= (this.chapter === 1 ? 4 : 1)
              ? 2
              : 1;
    }
    return {
      success: this.status === "success",
      score: this.score,
      stars,
      index: this.index,
      kills: this.kills,
      accuracy: this.shots
        ? Math.min(100, Math.round((this.hits / this.shots) * 100))
        : 0,
    };
  }

  snapshot() {
    return {
      index: this.index,
      chapter: this.chapter,
      time: this.time,
      score: this.score,
      status: this.status,
      ammo: this.ammo,
      remaining: this.entities.filter((e) => e.type === "enemy" && !e.dead)
        .length,
      shields: [...this.shields],
      projectiles: this.projectiles.length,
      bombs: this.bombs.filter((b) => !b.dead).length,
      player: this.player.position.toArray(),
      auto: this.auto,
      twin: this.twin,
      progress: this.chapter
        ? this.rescue
          ? this.status === "success"
            ? 1
            : this.rescue.snapshot().progress
          : Math.min(1, this.time / this.mission.duration)
        : this.kills / this.mission.enemies,
      rescue: this.rescue?.snapshot() || null,
    };
  }
}
