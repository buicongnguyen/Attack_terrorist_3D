import * as THREE from "three";
import { RIVER, RIVER_MISSIONS, SKIFF, DECK_GUN_RANGE, skiffPath, riverStars } from "./river-data.js";
import { MISSION_STORY } from "./story.js";
import { PICKUPS } from "./pickups.js";
import { COLORS } from "./data.js";
import { clamp, segmentSphere } from "./physics.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const turretNode = (mesh) => {
  let node = null;
  mesh.traverse((child) => {
    if (!child.isMesh && /^Turret[._\d]*$/.test(child.name)) node = child;
  });
  return node;
};

export class RiverOperation {
  constructor(game) {
    const g = (this.game = game),
      view = g.view;
    this.index = g.index;
    this.data = RIVER_MISSIONS[g.index - 6];
    this.story = MISSION_STORY[g.index];
    this.vehicle = { accel: 34, drag: 3.7, max: 8, bounds: { left: -RIVER.laneX, right: RIVER.laneX, far: RIVER.far, near: RIVER.near }, height: 0.08, bob: 2.5, bank: 0.012, pitch: 0.008 };
    g.player = view.model("boat", V(0, 0.08, 4));
    g.playerTurret = turretNode(g.player);
    g.boatParts = Object.fromEntries(
      ["SingleGun", "TwinGunL", "TwinGunR", "Muzzle", "MuzzleL", "MuzzleR", "SupportRack", "Radar"].map((name) => [
        name,
        g.player.getObjectByName(name),
      ]),
    );
    g.updateBoatLoadout();
    g.shieldMeshes = g.createShields(RIVER.shield + 0.4, 0.6);
    this.distance = 0;
    this.scriptIndex = 0;
    this.holding = false;
    this.said = new Set();
    this.lines = [];
    this.barges = RIVER.bargeZ.map((z, i) => this.createBarge(z, i));
    this.orders = [];
    this.boss = null;
    this.bargeDamage = 0;
    this.blocked = 0;
    this.combo = { count: 0, timer: 0 };
  }

  say(key) {
    if (this.said.has(key)) return;
    const line = this.story?.radio?.[key];
    if (!line) return;
    this.said.add(key);
    this.game.radio(line);
  }

  createBarge(z, i) {
    const view = this.game.view;
    const model = view.assets.has("barge") ? "barge" : "boat";
    const mesh = view.model(model, V(i ? 2.4 : -2.4, 0.05, z), model === "barge" ? 0.82 : 1.2);
    return {
      index: i,
      mesh,
      position: mesh.position,
      hp: RIVER.bargeHp,
      max: RIVER.bargeHp,
      alive: true,
      smoke: 0,
      sink: 0,
      radius: 2.3,
    };
  }

  aimLine() {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([V(), V(0, 0, 1)]),
      new THREE.LineDashedMaterial({ color: 0xff3b3b, dashSize: 0.6, gapSize: 0.35, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    line.frustumCulled = false;
    line.visible = false;
    line.renderOrder = 7;
    line.userData.disposable = true;
    this.game.view.level.add(line);
    this.lines.push(line);
    return line;
  }

  dropLine(e) {
    if (!e.line) return;
    this.lines = this.lines.filter((line) => line !== e.line);
    this.game.view.disposeObject(e.line);
    e.line = null;
  }

  pointLine(line, from, to) {
    const p = line.geometry.attributes.position;
    p.setXYZ(0, from.x, from.y, from.z);
    p.setXYZ(1, to.x, to.y, to.z);
    p.needsUpdate = true;
    line.computeLineDistances();
    line.visible = true;
  }

  // ------------------------------------------------------------------ script

  spawn(event) {
    const g = this.game,
      z = RIVER.spawnZ;
    if (event.type === "guns") {
      const s = event.side;
      for (let k = 0; k < event.count; k++) {
        const cz = z - k * 4.6;
        const gun = g.entity("cannon", "cannon", V(s * 12.4, 1.05, cz), {
          radius: 1.1,
          hp: 4,
          cooldown: 1.6 + k * 0.9,
          scrolling: true,
          aim: 0,
        });
        gun.mesh.rotation.y = (s * Math.PI) / 2;
        gun.turret = turretNode(gun.mesh);
        gun.line = this.aimLine();
        for (let c = 0; c < (event.crew || 0); c++)
          g.opponent(V(s * (13.6 + c * 0.7), 1.08, cz + 1.3 - c * 2.6), { scrolling: true, scale: 0.9 });
      }
      if (event.drums) {
        const drums = g.entity(
          g.view.assets.has("fuel-drums") ? "drums" : "drums",
          g.view.assets.has("fuel-drums") ? "fuel-drums" : "supply",
          V(s * 13.9, 1.05, z - ((event.count - 1) * 4.6) / 2 + 0.2),
          { radius: 1.2, hp: 1, scrolling: true },
        );
        drums.halo = g.view.ring(V(0, 0.08, 0), 1.5, 0xffcc1f, 0.14, drums.mesh);
      }
      if (event.launcher) {
        const launcher = g.entity("launcher", "launcher", V(s * 15.6, 1.1, z - event.count * 4.6 - 1), {
          hp: 8,
          radius: 1.9,
          cooldown: 3,
          scrolling: true,
        });
        launcher.mesh.rotation.y = (-s * Math.PI) / 2;
        launcher.light = g.view.ring(V(0, 0.1, 0), 1.85, COLORS.hostile, 0.13, launcher.mesh);
      }
    } else if (event.type === "mines") {
      for (const x of event.xs) {
        const mine = g.entity("mine", "mine", V(x, -0.18, z), { radius: 0.85, scrolling: true, hp: 1 });
        mine.halo = g.view.ring(V(0, 0.1, 0), 1.35, COLORS.hostile, 0.08, mine.mesh);
      }
    } else if (event.type === "pickup") {
      g.spawnPickup(z + 30, event.kind, event.x);
    } else if (event.type === "skiffs") {
      const order = { ...event, spawned: g.time, x: event.x ?? 0 };
      if (event.pattern === "pincer") {
        order.ring = g.view.ring(V(order.meet.x, 0.12, order.meet.z), 2.6, 0xff4b2b, 0.2);
        this.say("pincer");
      }
      this.orders.push(order);
      for (let i = 0; i < event.count; i++) {
        const p = skiffPath({ ...order, index: i }, 0);
        const model = g.view.assets.has("skiff") ? "skiff" : "boat";
        const skiff = g.entity("skiff", model, V(p.x, 0.1, p.z), {
          hp: SKIFF.hp,
          radius: 1.3,
          order,
          slot: i,
          // First shots ripple down the formation instead of landing as one volley.
          cooldown: 1.5 + i * 0.8,
          aim: 0,
          scale: model === "boat" ? 0.6 : 1,
        });
        if (model === "boat") skiff.mesh.scale.setScalar(0.6);
        skiff.line = this.aimLine();
        skiff.turret = turretNode(skiff.mesh);
      }
      if (event.pattern !== "pincer") this.say("skiffs");
    } else if (event.type === "bridge") this.spawnBridge(z);
    else if (event.type === "radio") this.say(event.key);
    else if (event.type === "checkpoint") g.notify("checkpoint", event.name);
  }

  spawnBridge(z) {
    const g = this.game,
      view = g.view;
    const deck = new THREE.Group();
    deck.position.set(0, 0, z);
    view.level.add(deck);
    view.box(V(0, 3, 0), V(26, 0.6, 3.2), 0xc99f74, deck);
    view.box(V(0, 3.55, -1.5), V(26, 0.5, 0.2), 0xe2704f, deck);
    view.box(V(0, 3.55, 1.5), V(26, 0.5, 0.2), 0xe2704f, deck);
    for (const x of [-9, -3, 3, 9]) view.box(V(x, 1.4, 0), V(0.9, 3, 1.4), 0x9a8f86, deck);
    this.bridge = { deck, alive: true };
    const bridgeEntity = g.entity("bridge", null, V(0, 0, z), { scrolling: true, friendly: true });
    bridgeEntity.mesh.add(deck);
    deck.position.set(0, 0, 0);
    const crate = g.entity("crate", view.assets.has("fuel-drums") ? "fuel-drums" : "supply", V(0.6, 3.3, z), {
      hp: 2,
      radius: 1.1,
      scrolling: true,
      bridge: bridgeEntity,
    });
    crate.halo = view.ring(V(0, 0.08, 0), 1.3, 0xffcc1f, 0.14, crate.mesh);
    for (const x of [-7, -3.4, 3.4, 7.2]) {
      const gunner = g.opponent(V(x, 3.3, z + 0.4), { scrolling: true, scale: 0.9, hp: 1, gunner: true, cooldown: 2 + Math.abs(x) * 0.2, aim: 0 });
      gunner.line = this.aimLine();
    }
  }

  spawnGate() {
    const g = this.game,
      view = g.view,
      z = RIVER.spawnZ;
    const cfg = this.data.boss;
    const gate = g.entity("gate", view.assets.has("lock-gate") ? "lock-gate" : null, V(0, 0, z), {
      scrolling: true,
      friendly: true,
    });
    if (!view.assets.has("lock-gate")) {
      view.box(V(-4.5, 2.5, 0), V(9, 5, 1), 0x6d6a72, gate.mesh);
      view.box(V(4.5, 2.5, 0), V(9, 5, 1), 0x6d6a72, gate.mesh);
    }
    gate.leaves = ["GateL", "GateR"].map((n) => gate.mesh.getObjectByName(n));
    const towers = [-1, 1].map((s) => {
      const model = view.assets.has("gate-tower") ? "gate-tower" : "launcher";
      const tower = g.entity("tower", model, V(s * 14.2, 1.05, z), {
        hp: cfg.towerHp,
        maxHp: cfg.towerHp,
        radius: 2.4,
        scrolling: true,
        cooldown: 2 + (s > 0 ? cfg.shellEvery / 2 : 0),
        lift: 5.6,
        hitLifts: [1.8, 4, 5.6],
        hitRadius: 2.2,
      });
      tower.turret = turretNode(tower.mesh);
      tower.warning = view.ring(V(0, 0.1, 0), 2.6, 0xff3b3b, 0.18, tower.mesh);
      return tower;
    });
    const generator = g.entity("generator", null, V(0, 3.6, z), {
      hp: cfg.generatorHp,
      maxHp: cfg.generatorHp,
      radius: 1.6,
      scrolling: true,
      shielded: true,
    });
    view.sphere(V(), V(0.9, 0.9, 0.9), 0xff4b2b, generator.mesh);
    generator.bubble = new THREE.Mesh(
      new THREE.SphereGeometry(2.1, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.35, emissive: 0x2f86e8, emissiveIntensity: 0.6, depthWrite: false }),
    );
    generator.bubble.userData.disposable = true;
    generator.mesh.add(generator.bubble);
    this.boss = { gate, towers, generator, phase: "approach", open: 0, wave: cfg.waveEvery * 0.6 };
  }

  // ------------------------------------------------------------------ update

  update(dt) {
    const g = this.game;
    this.say("start");
    const flow = this.holding ? 0 : this.data.speed;
    this.flow = flow;
    this.distance += flow * dt;
    while (this.scriptIndex < this.data.script.length && this.data.script[this.scriptIndex].d <= this.distance)
      this.spawn(this.data.script[this.scriptIndex++]);
    if (this.data.gate && !this.boss && this.distance >= this.data.gate) this.spawnGate();
    for (const prop of g.view.scrollProps) {
      prop.position.z += flow * dt;
      if (prop.position.z > 36) prop.position.z -= 132;
    }
    for (const line of this.lines) line.visible = false;
    g.auto = Math.max(0, g.auto - dt);
    g.twin = Math.max(0, g.twin - dt);
    g.updateBoatLoadout();
    if (g.boatParts.Radar) g.boatParts.Radar.rotation.y += dt * 1.6;
    g.supportCooldown -= dt;
    if (g.twin > 0) {
      const target = g.nearestTarget();
      if (target) g.fire(g.targetPosition(target));
    }
    if (g.auto > 0 && g.supportCooldown <= 0) {
      const target = g.nearestTarget();
      if (target) {
        g.spawnShot(
          g.boatParts.SupportRack ? g.boatParts.SupportRack.getWorldPosition(V()).add(V(0, 0.2, -0.8)) : g.player.position.clone().add(V(0, 1.1, -1)),
          g.targetPosition(target),
          true,
          false,
          target,
        );
        g.supportCooldown = 0.7;
      }
    }
    if (this.combo.timer > 0) {
      this.combo.timer -= dt;
      if (this.combo.timer <= 0) this.closeCombo();
    }
    this.updateBarges(dt);
    this.updateEntities(dt, flow);
    this.updateSkiffs(dt);
    if (this.boss) this.updateBoss(dt);
    g.entities = g.entities.filter((e) => !e.dead || e.fallTime !== undefined);
    if (g.status !== "playing") return;
    if (!this.barges.some((b) => b.alive)) g.finish(false, "barges");
    else if (this.distance >= this.data.length && (!this.boss || this.boss.phase === "open")) {
      this.closeCombo();
      this.say("success");
      g.finish(true);
    }
  }

  // Kills that land within a second of each other chain into one combo worth n² x 30.
  closeCombo() {
    const n = this.combo.count;
    this.combo.count = 0;
    this.combo.timer = 0;
    if (n < 2) return;
    const bonus = n * n * 30;
    this.game.score += bonus;
    this.game.notify("combo", { count: n, bonus });
  }

  updateBarges(dt) {
    const g = this.game;
    // Echelon behind Marlin: each barge follows her wake a little to one side.
    const leader = g.player.position.x;
    for (const barge of this.barges) {
      if (!barge.alive) {
        barge.sink += dt;
        barge.mesh.position.y = 0.05 - Math.min(2.2, barge.sink * 0.6);
        barge.mesh.rotation.z = Math.min(0.5, barge.sink * 0.2);
        if (barge.sink > 4) barge.mesh.visible = false;
        continue;
      }
      const target = clamp(leader + (barge.index ? 2.4 : -2.4), -7.6, 7.6);
      const lag = RIVER.follow * (1 + barge.index * 0.6);
      barge.mesh.position.x = THREE.MathUtils.damp(barge.mesh.position.x, target, 1 / lag, dt);
      barge.mesh.position.y = 0.05 + Math.sin(g.time * 1.8 + barge.index) * 0.05;
      barge.mesh.rotation.y = clamp((target - barge.mesh.position.x) * -0.05, -0.2, 0.2);
      if (barge.hp < barge.max * 0.5) {
        barge.smoke -= dt;
        if (barge.smoke <= 0) {
          barge.smoke = 0.18;
          g.puff(barge.mesh.position.clone().add(V(0.6, 2.2, 1)), 0x3b3440, 0.45, 1.1);
        }
      }
      if (Math.floor(g.time * 6) !== Math.floor((g.time - dt) * 6)) {
        const p = barge.mesh.position.clone();
        p.y = 0.11;
        p.z += 4;
        const ring = g.view.ring(p, 0.7, 0xdff9f2, 0.08);
        g.effects.push({ mesh: ring, life: 1.2, maxLife: 1.2, ring: true, growth: 1.4 });
      }
    }
  }

  hurtBarge(barge, amount, position) {
    if (!barge.alive || this.game.status !== "playing") return;
    const g = this.game;
    barge.hp = Math.max(0, barge.hp - amount);
    this.bargeDamage += amount;
    g.puff(position || barge.mesh.position.clone().add(V(0, 1.5, 0)), 0xffb35c, 0.5, 0.6);
    g.audio.play("hit");
    this.say("barge");
    if (barge.hp <= 0) {
      barge.alive = false;
      g.blast(barge.mesh.position.clone().add(V(0, 1, 0)), 3.5, 0xff8a2b);
      g.radio({ who: "okafor", text: barge.index === 0 ? "Harbor Mercy is going down! Get the crew across!" : "We lost the second barge! Keep going!" });
    }
  }

  // Pick a target: mostly the barges, sometimes Marlin herself.
  chooseTarget(shooter, parity) {
    const alive = this.barges.filter((b) => b.alive);
    if (!alive.length || parity % 3 === 2) return { kind: "player", position: this.game.player.position };
    const barge = alive.sort(
      (a, b) => a.position.distanceToSquared(shooter.position) - b.position.distanceToSquared(shooter.position),
    )[0];
    return { kind: "barge", barge, position: barge.position };
  }

  aimAt(shooter, origin, telegraph, fire) {
    const g = this.game;
    if (!shooter.target || shooter.aim <= 0) return false;
    shooter.aim -= g.stepTime;
    const target = shooter.target.kind === "barge" && !shooter.target.barge.alive ? null : shooter.target;
    if (!target) {
      shooter.aim = 0;
      return false;
    }
    const aimPoint = target.position.clone().add(V(0, 1, 0));
    if (shooter.line) this.pointLine(shooter.line, origin, aimPoint);
    if (shooter.aim <= 0) fire(origin, aimPoint, target);
    return true;
  }

  updateEntities(dt, flow) {
    const g = this.game;
    g.stepTime = dt;
    for (const e of g.entities) {
      if (e.scrolling) e.position.z += flow * dt;
      if (e.dead) continue;
      e.age += dt;
      if (e.position.z > RIVER.despawnZ && e.type !== "skiff") {
        e.dead = true;
        this.dropLine(e);
        g.view.disposeObject(e.mesh);
        continue;
      }
      const near = e.position.z > -46 && e.position.z < 24;
      if (e.type === "mine") this.updateMine(e);
      else if (e.type === "pickup") {
        e.position.y = 0.22 + Math.sin(g.time * 2.3 + e.position.z) * 0.065;
        e.body.rotation.y += dt * 0.35;
        e.halo.material.opacity = 0.38 + Math.sin(g.time * 2) * 0.08;
        if (Math.hypot(e.position.x - g.player.position.x, e.position.z - g.player.position.z) < 2.4) g.collect(e);
      } else if ((e.type === "drums" || e.type === "crate") && e.halo)
        e.halo.material.opacity = 0.35 + Math.sin(g.time * 5) * 0.25;
      else if (e.type === "cannon" && near) this.updateGun(e, dt);
      else if (e.type === "launcher" && near) this.updateLauncher(e, dt);
      else if (e.type === "enemy" && e.gunner && near) this.updateGunner(e, dt);
    }
  }

  updateMine(e) {
    const g = this.game;
    const d = Math.hypot(e.position.x - g.player.position.x, e.position.z - g.player.position.z);
    const danger = clamp(1 - d / 10, 0, 1);
    e.mesh.scale.setScalar(1 + danger * 0.38);
    e.position.y = -0.2 + danger * 0.35;
    e.halo.material.opacity = 0.08 + danger * 0.75;
    e.halo.scale.setScalar(1 + Math.sin(g.time * (3 + danger * 8)) * 0.12);
    if (d < 2) {
      g.kill(e, false);
      g.hurtPlayer(e.position, 2);
      return;
    }
    for (const barge of this.barges) {
      if (!barge.alive) continue;
      if (Math.hypot(e.position.x - barge.position.x, e.position.z - barge.position.z) < 2.3) {
        g.kill(e, false);
        this.hurtBarge(barge, 5, e.position.clone());
        return;
      }
    }
  }

  updateGun(e, dt) {
    const g = this.game;
    e.cooldown -= dt;
    if (e.turret) {
      const aim = e.target?.position || g.player.position;
      const dir = aim.clone().sub(e.position);
      e.turret.rotation.y = Math.atan2(-dir.x, -dir.z) - e.mesh.rotation.y;
    }
    const origin = e.position.clone().add(V(0, 1.1, 0));
    if (this.aimAt(e, origin, 0.9, (from, to) => g.spawnShot(from, to, false, true, null, e.target))) return;
    if (e.cooldown <= 0 && e.position.z > -44) {
      e.parity = (e.parity || 0) + 1;
      e.target = this.chooseTarget(e, e.parity);
      e.aim = 0.9;
      e.cooldown = this.data.fireRate;
    }
  }

  updateGunner(e, dt) {
    const g = this.game;
    e.cooldown -= dt;
    const origin = e.position.clone().add(V(0, 0.9, 0));
    if (this.aimAt(e, origin, 0.8, (from, to) => g.spawnShot(from, to, false, true, null, e.target))) return;
    if (e.cooldown <= 0 && e.position.z > -30) {
      e.parity = (e.parity || 0) + 1;
      e.target = this.chooseTarget(e, e.parity);
      e.aim = 0.8;
      e.cooldown = 2.6;
    }
  }

  updateLauncher(e, dt) {
    const g = this.game;
    e.cooldown -= dt;
    e.light.material.opacity = e.cooldown < 1.2 ? 0.5 + Math.sin(g.time * 18) * 0.45 : 0.08;
    if (e.cooldown <= 0 && e.position.z > -46) {
      const target = this.chooseTarget(e, 1);
      const shot = g.spawnShot(e.position.clone().add(V(0, 2.7, 0)), target.position.clone().add(V(0, 1, 0)), true, true, null, target);
      shot.homing = target;
      e.cooldown = 5;
    }
  }

  updateSkiffs(dt) {
    const g = this.game;
    for (const order of this.orders) {
      const t = g.time - order.spawned;
      if (order.ring) {
        const left = order.delay - t;
        order.ring.visible = left > -0.8;
        order.ring.material.opacity = 0.35 + Math.sin(g.time * 8) * 0.25;
        order.ring.scale.setScalar(1 + Math.max(0, left) * 0.12);
        order.label = left > -0.8 ? { x: order.meet.x, y: 1.5, z: order.meet.z, text: left > 0 ? `PINCER / ${Math.ceil(left)}s` : "PINCER / NOW", hot: left <= 0.6 } : null;
      }
    }
    for (const e of g.entities) {
      if (e.type !== "skiff" || e.dead) continue;
      const t = g.time - e.order.spawned;
      const p = skiffPath({ ...e.order, index: e.slot }, t);
      if (p.done || (e.order.pattern !== "column" && p.z > RIVER.despawnZ + 6)) {
        e.dead = true;
        this.dropLine(e);
        g.view.disposeObject(e.mesh);
        continue;
      }
      const dx = p.x - e.position.x,
        dz = p.z - e.position.z;
      e.position.set(p.x, 0.1 + Math.sin(g.time * 7 + e.slot) * 0.04, p.z);
      if (Math.hypot(dx, dz) > 1e-4) e.mesh.rotation.y = Math.atan2(-dx, -dz);
      if (Math.floor(g.time * 10) !== Math.floor((g.time - dt) * 10)) {
        const ring = g.view.ring(V(p.x, 0.11, p.z), 0.4, 0xffffff, 0.08);
        g.effects.push({ mesh: ring, life: 0.9, maxLife: 0.9, ring: true, growth: 2 });
      }
      const ram = this.barges.find((b) => b.alive && Math.hypot(b.position.x - p.x, b.position.z - p.z) < 2.2);
      if (ram) {
        this.hurtBarge(ram, 3, e.position.clone());
        g.kill(e, false);
        continue;
      }
      e.cooldown -= dt;
      const origin = e.position.clone().add(V(0, 0.9, 0));
      if (this.aimAt(e, origin, SKIFF.aim, (from, to) => g.spawnShot(from, to, false, true, null, e.target))) continue;
      if (e.cooldown <= 0 && e.position.z > -30 && e.position.z < 26) {
        e.parity = (e.parity || 0) + 1;
        e.target = this.chooseTarget(e, e.parity);
        e.aim = SKIFF.aim;
        e.cooldown = SKIFF.fireEvery;
      }
    }
    this.orders = this.orders.filter((o) => {
      const alive = g.entities.some((e) => e.type === "skiff" && !e.dead && e.order === o);
      if (!alive && o.ring) g.view.disposeObject(o.ring);
      return alive;
    });
  }

  updateBoss(dt) {
    const g = this.game,
      boss = this.boss,
      cfg = this.data.boss;
    if (boss.phase === "approach" && boss.gate.position.z >= -24) {
      boss.phase = "towers";
      this.holding = true;
      this.say("hold");
    }
    if (boss.phase === "towers" || boss.phase === "generator") {
      boss.wave -= dt;
      if (boss.wave <= 0) {
        boss.wave = cfg.waveEvery;
        // Boss waves alternate banks, so the fight is learnable rather than random.
        boss.waves = (boss.waves || 0) + 1;
        // They slip out of the bank channels beside the towers and pincer in front of the barges.
        this.spawn({ type: "skiffs", pattern: "pincer", count: 4, meet: { x: boss.waves % 2 ? -3 : 3, z: -4 }, delay: 5 });
      }
      for (const tower of boss.towers) {
        if (tower.dead) continue;
        tower.cooldown -= dt;
        const target = tower.target || this.chooseTarget(tower, 1);
        if (tower.turret) {
          const dir = target.position.clone().sub(tower.position);
          tower.turret.rotation.y = Math.atan2(-dir.x, -dir.z);
        }
        tower.warning.material.opacity = tower.cooldown < 1.4 ? 0.5 + Math.sin(g.time * 16) * 0.4 : 0.12;
        if (tower.cooldown < 1.4 && !tower.target) tower.target = this.chooseTarget(tower, 1);
        if (tower.cooldown <= 0) {
          const t = tower.target || target;
          const shot = g.spawnShot(tower.position.clone().add(V(0, 6.2, 0)), t.position.clone().add(V(0, 1, 0)), true, true, null, t);
          shot.homing = t;
          shot.heavy = true;
          tower.cooldown = cfg.shellEvery;
          tower.target = null;
        }
      }
    }
    if (boss.phase === "towers" && boss.towers.every((t) => t.dead)) {
      boss.phase = "generator";
      boss.generator.shielded = false;
      boss.generator.bubble.visible = false;
      this.say("shield");
    }
    if (boss.phase === "generator" && boss.generator.dead) {
      boss.phase = "opening";
      this.say("open");
    }
    if (boss.phase === "opening") {
      boss.open = Math.min(1, boss.open + dt / 2.4);
      const [left, right] = boss.gate.leaves;
      if (left) left.rotation.y = boss.open * 1.45;
      if (right) right.rotation.y = -boss.open * 1.45;
      if (boss.open >= 1) {
        boss.phase = "open";
        this.holding = false;
        // Highwater's medal floats out through the open gate for Marlin to pick up.
        this.game.spawnPickup(boss.gate.position.z + 3, "medal", 0);
      }
    }
    if (!boss.generator.dead) boss.generator.mesh.rotation.y += dt * 1.5;
  }

  // Hostile rounds can strike a barge; Marlin's own hull is tested by the shared projectile code.
  friendlyHit(shot) {
    let best = null;
    for (const barge of this.barges) {
      if (!barge.alive) continue;
      const t = segmentSphere(shot.last, shot.position, barge.position.clone().add(V(0, 1, 0)), barge.radius);
      if (t !== null && (!best || t < best.t)) best = { t, apply: () => this.hurtBarge(barge, shot.heavy ? 4 : shot.missile ? 3 : 1) };
    }
    return best;
  }

  onBlocked(shot) {
    if (this.game.status !== "playing") return;
    if (shot.aimedAt?.kind === "barge") {
      this.blocked++;
      this.game.score += 20;
      this.game.notify("toast", "SHOT BLOCKED +20");
    }
  }

  onKill(e, reward = true) {
    const g = this.game;
    this.dropLine(e);
    if (reward && g.status === "playing") {
      this.combo.count++;
      this.combo.timer = 1;
    }
    if (e.type === "drums" || e.type === "crate") {
      const radius = e.type === "crate" ? 8 : 5.6;
      g.blast(e.position.clone().add(V(0, 0.6, 0)), radius, 0xff8a2b);
      let chain = 0;
      for (const other of g.entities) {
        if (other === e || other.dead || other.friendly) continue;
        if (!["cannon", "enemy", "launcher", "skiff", "mine", "drums"].includes(other.type)) continue;
        if (other.position.distanceTo(e.position) < radius) {
          g.damage(other, 8);
          chain++;
        }
      }
      if (e.type === "crate" && e.bridge) {
        e.bridge.mesh.children[0]?.children.slice(0, 3).forEach((part) => (part.visible = false));
        g.notify("toast", "BRIDGE AMBUSH BROKEN");
      }
      if (chain) this.say("drums");
    }
    if (e.type === "skiff") {
      g.blast(e.position.clone().add(V(0, 0.4, 0)), SKIFF.chain, 0xff8a2b, { quiet: true });
      let chain = 0;
      for (const other of g.entities) {
        if (other === e || other.dead) continue;
        if (!["skiff", "mine", "drums"].includes(other.type)) continue;
        if (Math.hypot(other.position.x - e.position.x, other.position.z - e.position.z) < SKIFF.chain) {
          g.damage(other, 3);
          chain++;
        }
      }
      e.chain = chain;
    }
  }

  snapshot() {
    const labels = this.orders.map((o) => o.label).filter(Boolean);
    const boss = this.boss;
    return {
      mode: "river",
      distance: this.distance,
      length: this.data.length,
      progress: Math.min(1, this.distance / this.data.length),
      barges: this.barges.map((b) => ({ hp: b.hp, max: b.max, alive: b.alive })),
      holding: this.holding,
      boss: boss
        ? {
            phase: boss.phase,
            towers: boss.towers.map((t) => (t.dead ? 0 : t.hp / t.maxHp)),
            generator: boss.generator.dead ? 0 : boss.generator.hp / boss.generator.maxHp,
            shielded: boss.generator.shielded,
          }
        : null,
      labels: labels.map((l, i) => ({ id: `pincer-${i}`, ...l })),
    };
  }

  stars(success) {
    const alive = this.barges.filter((b) => b.alive);
    const health = alive.reduce((s, b) => s + b.hp / b.max, 0) / this.barges.length;
    return riverStars({
      success,
      bargesLost: this.barges.length - alive.length,
      bargeHealth: health,
      damage: this.game.damageTaken,
    });
  }

  finishBonus() {
    return 300 + this.game.shields.reduce((a, b) => a + b, 0) * 40 + this.barges.reduce((s, b) => s + (b.alive ? b.hp * 20 : 0), 0);
  }
}
