import * as THREE from "three";
import {
  RIVER,
  RIVER_MISSIONS,
  SKIFF,
  WEAPONS,
  AIR_STRIKE,
  SUPPORT,
  SCENERY,
  BARRACKS,
  skiffPath,
  riverStars,
  strikeLine,
  laserHeat,
} from "./river-data.js";
import { MISSION_STORY, RIVER_RADIO } from "./story.js";
import { isHostileEntity } from "./rescue-data.js";
import { PICKUPS } from "./pickups.js";
import { COLORS, chapterStart } from "./data.js";
import { clamp, segmentSphere } from "./physics.js";
import { dampAngle } from "./harbour.js";
import { Ripples, healthMaterial } from "./ripples.js";

// The laser beam: a white-hot core inside two additive glows, stretched from muzzle to hit.
const BEAM = {
  geometry: new THREE.CylinderGeometry(1, 1, 1, 12, 1, true),
  layers: [
    { radius: 0.07, color: 0xffffff, opacity: 1 },
    { radius: 0.24, color: 0x7fe8ff, opacity: 0.55 },
    { radius: 0.55, color: 0x2fb6ff, opacity: 0.2 },
  ],
};
const UP = new THREE.Vector3(0, 1, 0);

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// Targets worth a rocket salvo when Marlin holds the deck gun on them (2.7).
const HEAVY = new Set(["launcher", "barracks", "tower", "generator"]);
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
    this.data = RIVER_MISSIONS[g.index - chapterStart(1)];
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
    // Marlin's arsenal and the help that can join from crates.
    // The difficulty sets the stock, the air strikes, the barges' armour and the enemy's rate of fire.
    this.rockets = Math.round(WEAPONS.rocket.stock * g.mode.rockets);
    this.strikes = g.mode.strikes;
    this.fireRate = this.data.fireRate * g.mode.enemyReload;
    this.laser = { heat: 0, locked: false, beam: false };
    this.airStrike = null;
    this.support = { heli: null, ally: null };
    this.beam = this.createBeam();
    this.ripples = new Ripples(view, 90);
    // Houses, trees and sheds on the banks (2.7): shot down, they come back intact when their
    // stretch of bank scrolls round again.
    this.scenery = view.scrollProps
      .filter((prop) => prop.userData.scenery)
      .map((prop) => {
        const spec = SCENERY[prop.userData.scenery];
        const record = { prop, kind: prop.userData.scenery, spec, hp: spec.hp, alive: true, hidden: false, model: prop.children[0], wreck: null, burn: 0 };
        prop.userData.record = record;
        return record;
      });
  }

  // Ripple styles for the canal's enemy (see ripples.js): gun lines red, the dangerous launchers
  // and the lock gate gold, skiffs small.
  rippleStyle(e) {
    return (
      {
        cannon: { size: 2.4, color: 0xff4b2b, gain: 0.8 },
        launcher: { size: 3.2, color: 0xffc62b, gain: 1 },
        barracks: { size: 3.6, color: 0xffc62b, gain: 1 },
        skiff: { size: 1.7, color: 0xff4b2b, gain: 0.7 },
        tower: { size: 3.8, color: 0xffc62b, gain: 1 },
        generator: { size: 3.2, color: 0xffc62b, gain: 1 },
        enemy: { size: 1.1, color: 0xff4b2b, gain: 0.45 },
      }[e.type] || null
    );
  }

  // Hits left with the deck gun, as a row of pips over guns, launchers and skiffs.
  addHealthBar(e) {
    const bar = new THREE.Sprite(this.healthFor(e));
    const big = e.type === "launcher" || e.type === "barracks";
    bar.position.set(0, big ? 4.2 : 2.6, 0);
    bar.scale.set(big ? 3.4 : 2.4, 0.9, 1);
    bar.renderOrder = 12;
    e.mesh.add(bar);
    e.hpBar = bar;
    e.maxHp ??= e.hp;
  }

  healthFor(e) {
    const hits = (hp) => Math.max(0, Math.ceil(hp / WEAPONS.gun.damage));
    return healthMaterial(hits(e.hp), hits(e.maxHp ?? e.hp));
  }

  say(key) {
    if (this.said.has(key)) return;
    const line = this.story?.radio?.[key] || RIVER_RADIO[key];
    if (!line) return;
    this.said.add(key);
    this.game.radio(line);
  }

  createBarge(z, i) {
    const view = this.game.view;
    const model = view.assets.has("barge") ? "barge" : "boat";
    const mesh = view.model(model, V(i ? RIVER.bargeSpread : -RIVER.bargeSpread, 0.05, z), model === "barge" ? 0.82 : 1.2);
    return {
      index: i,
      mesh,
      position: mesh.position,
      hp: RIVER.bargeHp * this.game.mode.bargeHp,
      max: RIVER.bargeHp * this.game.mode.bargeHp,
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
        const gun = g.entity("cannon", "cannon", V(s * (RIVER.bank + 0.2), 1.05, cz), {
          radius: 1.1,
          hp: 4,
          cooldown: 1.6 + k * 0.9,
          scrolling: true,
          aim: 0,
        });
        gun.mesh.rotation.y = (s * Math.PI) / 2;
        this.clearScenery(s, cz, 3);
        gun.turret = turretNode(gun.mesh);
        gun.line = this.aimLine();
        this.addHealthBar(gun);
        for (let c = 0; c < (event.crew || 0); c++)
          g.opponent(V(s * (RIVER.bank + 1.4 + c * 0.7), 1.08, cz + 1.3 - c * 2.6), { scrolling: true, scale: 0.9 });
      }
      if (event.drums) {
        const drums = g.entity(
          g.view.assets.has("fuel-drums") ? "drums" : "drums",
          g.view.assets.has("fuel-drums") ? "fuel-drums" : "supply",
          V(s * (RIVER.bank + 1.7), 1.05, z - ((event.count - 1) * 4.6) / 2 + 0.2),
          { radius: 1.2, hp: 1, scrolling: true },
        );
        drums.halo = g.view.ring(V(0, 0.08, 0), 1.5, 0xffcc1f, 0.14, drums.mesh);
      }
      if (event.launcher) {
        const launcher = g.entity("launcher", "launcher", V(s * (RIVER.bank + 3.4), 1.1, z - event.count * 4.6 - 1), {
          hp: 8,
          radius: 1.9,
          cooldown: 3,
          scrolling: true,
        });
        launcher.mesh.rotation.y = (-s * Math.PI) / 2;
        this.clearScenery(s, launcher.position.z, 4.5);
        launcher.light = g.view.ring(V(0, 0.1, 0), 1.85, COLORS.hostile, 0.13, launcher.mesh);
        this.addHealthBar(launcher);
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
        this.addHealthBar(skiff);
      }
      if (event.pattern !== "pincer") this.say("skiffs");
    } else if (event.type === "barracks") this.spawnBarracks(event, z);
    else if (event.type === "bridge") this.spawnBridge(z);
    else if (event.type === "radio") this.say(event.key);
    else if (event.type === "checkpoint") g.notify("checkpoint", event.name);
  }

  // A barracks on the bank, its door to the water; once in sight it sends riflemen down to the
  // water's edge one by one. Houses and trees where it stands make way until they scroll round.
  spawnBarracks(event, z) {
    const g = this.game,
      view = g.view,
      side = event.side;
    const x = side * (RIVER.bank + BARRACKS.offset);
    const b = g.entity("barracks", view.assets.has("barracks-hut") ? "barracks-hut" : null, V(x, 1.08, z), {
      hp: BARRACKS.hp,
      maxHp: BARRACKS.hp,
      radius: 3,
      hitRadius: 2.6,
      scrolling: true,
      side,
      crew: event.crew,
      crewTotal: event.crew,
      timer: 0,
    });
    if (!view.assets.has("barracks-hut")) {
      view.box(V(0, 1.2, 0), V(6, 2.4, 3.6), 0x8f9a5b, b.mesh);
      view.box(V(0, 2.55, 0), V(6.4, 0.3, 4), 0x2f2c35, b.mesh);
    }
    b.mesh.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.addHealthBar(b);
    this.clearScenery(side, z, 5.5);
    this.say("barracks");
  }

  updateBarracks(b, dt) {
    const g = this.game;
    if (b.crew <= 0 || b.position.z < -40) return;
    b.timer -= dt;
    if (b.timer > 0) return;
    b.timer = BARRACKS.every;
    const n = b.crewTotal - b.crew--;
    const side = b.side;
    const e = g.opponent(V(side * (RIVER.bank + BARRACKS.offset - 2.2), 1.08, b.position.z + ((n % 3) - 1) * 1.6), {
      scrolling: true,
      scale: 0.9,
      hp: 2,
      cooldown: 1.2 + n * 0.4,
      aim: 0,
    });
    e.run = { x: side * (RIVER.bank + 1.3 + (n % 2) * 0.8) };
    e.mesh.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  // A rifleman running from the barracks to the water, who then fights like a bridge gunner.
  updateRunner(e, dt) {
    const dx = e.run.x - e.position.x;
    e.running = true;
    if (Math.abs(dx) > 0.05) {
      e.position.x += Math.sign(dx) * Math.min(Math.abs(dx), 3.4 * dt);
      return;
    }
    e.run = null;
    e.running = false;
    e.gunner = true;
    e.line = this.aimLine();
  }

  // ------------------------------------------------------------------ scenery on the banks
  // Houses and trees where the enemy sets up make way until their stretch scrolls round.
  clearScenery(side, z, reach) {
    for (const r of this.scenery)
      if (Math.sign(r.prop.position.x) === side && Math.abs(r.prop.position.z - z) < reach) {
        r.hidden = true;
        r.model.visible = false;
      }
  }

  // Where fragments land: the bank top, or sinking into the canal.
  groundAt(x) {
    return Math.abs(x) > RIVER.bank + 0.5 ? 1.12 : -0.6;
  }

  // The first house, tree or shed a round's path crosses (see Game.resolveFriendlyShot).
  sceneryHit(shot, test) {
    const reach = RIVER.bank - 3;
    if (Math.abs(shot.last.x) < reach && Math.abs(shot.position.x) < reach) return null;
    let best = null;
    for (const r of this.scenery) {
      if (!r.alive || r.hidden) continue;
      const c = r.prop.position;
      const t = test({ x: c.x, y: c.y + r.spec.lift, z: c.z }, r.spec.radius);
      if (t !== null && (!best || t < best.t)) best = { t, scenery: r, apply: (amount) => this.hurtScenery(r, amount) };
    }
    return best;
  }

  hurtScenery(r, amount) {
    if (!r.alive || r.hidden || amount <= 0) return;
    r.hp -= amount;
    this.game.puff(r.prop.position.clone().add(V(0, r.spec.lift, 0)), 0xdacba6, 0.4, 0.3);
    if (r.hp <= 0) this.destroyScenery(r);
  }

  // Down it goes: a blast, pieces thrown into the sky, smoke from anything that burns, and
  // what is left (a stump, a charred shell, scattered logs) scrolls on with the bank.
  destroyScenery(r) {
    const g = this.game,
      view = g.view;
    r.alive = false;
    r.model.visible = false;
    const at = r.prop.position.clone().add(V(0, r.spec.lift * 0.6, 0));
    const wreck = new THREE.Group();
    r.prop.add(wreck);
    r.wreck = wreck;
    const kind = r.spec.wreck;
    if (kind === "tree") {
      g.blast(at, 1.1, 0xffc62b, { quiet: true, small: true });
      g.shatter(at.clone().add(V(0, 0.8, 0)), r.spec.colors, 12, 0.9);
      view.box(V(0, 0.3, 0), V(0.45, 0.6, 0.45), 0x8b5a3c, wreck);
      view.box(V(0, 0.62, 0), V(0.5, 0.06, 0.5), 0xe0a868, wreck);
    } else if (kind === "reeds" || kind === "post") {
      g.shatter(at, r.spec.colors, 5, 0.6);
      g.flash(at, 0xfff1b8, 0.6);
      if (kind === "post") view.box(V(0, 0.2, 0), V(0.25, 0.4, 0.25), 0x3a4048, wreck);
    } else {
      // Houses, sheds, containers and log piles go up in flames.
      g.blast(at, kind === "logs" ? 1.8 : 2.6, 0xff8a2b);
      g.shatter(at.clone().add(V(0, 0.6, 0)), r.spec.colors, kind === "logs" ? 12 : 16, kind === "logs" ? 1.1 : 1.35);
      r.smoke = g.smokeColumn(r.prop.position, kind === "logs" ? 5 : 4, kind === "logs" ? 1 : 1.2, V(0, 1, 0));
      const charred = kind === "logs" ? [0x5a3a24, 0x8b5a3c] : [0x2f2c35, 0x4a4652, 0x6b4a33];
      for (let i = 0; i < 4; i++) {
        const piece = view.box(V((i - 1.5) * 0.9, 0.18 + (i % 2) * 0.12, (i % 2 ? 0.5 : -0.5)), V(1 + (i % 2) * 0.4, 0.36, 0.7), charred[i % charred.length], wreck);
        piece.rotation.y = i * 0.7;
      }
    }
    g.score += r.spec.reward;
  }

  // A stretch of bank scrolling round comes back intact.
  restoreScenery(prop) {
    const r = prop.userData.record;
    if (!r) return;
    if (r.wreck) this.game.view.disposeObject(r.wreck);
    r.wreck = null;
    // No smoke rising from the house that stands there now.
    if (r.smoke) r.smoke.t = 0;
    r.smoke = null;
    r.alive = true;
    r.hidden = false;
    r.hp = r.spec.hp;
    r.burn = 0;
    r.model.visible = true;
  }

  // Blasts on the bank (drums, crates, the air strike) knock scenery down too.
  blastScenery(point, radius, amount) {
    for (const r of this.scenery) {
      if (!r.alive || r.hidden) continue;
      if (Math.hypot(r.prop.position.x - point.x, r.prop.position.z - point.z) < radius + r.spec.radius) this.hurtScenery(r, amount);
    }
  }

  spawnBridge(z) {
    const g = this.game,
      view = g.view;
    const deck = new THREE.Group();
    deck.position.set(0, 0, z);
    view.level.add(deck);
    const span = RIVER.bank * 2 + 1.6;
    view.box(V(0, 3, 0), V(span, 0.6, 3.2), 0xc99f74, deck);
    view.box(V(0, 3.55, -1.5), V(span, 0.5, 0.2), 0xe2704f, deck);
    view.box(V(0, 3.55, 1.5), V(span, 0.5, 0.2), 0xe2704f, deck);
    for (const x of [-13, -4.5, 4.5, 13]) view.box(V(x, 1.4, 0), V(0.9, 3, 1.4), 0x9a8f86, deck);
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
    for (const x of [-10, -4.8, 4.8, 10]) {
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
    // The gate was built for the old canal: scaled up evenly (so its doors swing true) it spans the wider one.
    gate.mesh.scale.multiplyScalar(RIVER.bank / 12.2);
    gate.leaves = ["GateL", "GateR"].map((n) => gate.mesh.getObjectByName(n));
    const towers = [-1, 1].map((s) => {
      const model = view.assets.has("gate-tower") ? "gate-tower" : "launcher";
      const tower = g.entity("tower", model, V(s * (RIVER.bank + 2), 1.05, z), {
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
      if (prop.position.z > 36) {
        prop.position.z -= 132;
        this.restoreScenery(prop);
      }
    }
    for (const line of this.lines) line.visible = false;
    g.auto = Math.max(0, g.auto - dt);
    g.twin = Math.max(0, g.twin - dt);
    g.updateBoatLoadout();
    if (g.boatParts.Radar) g.boatParts.Radar.rotation.y += dt * 1.6;
    g.supportCooldown -= dt;
    if (g.twin > 0) {
      const target = g.nearestTarget();
      if (target) g.fire(g.targetPosition(target), false, true);
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
    this.updateLaser(dt);
    this.updateAirStrike(dt, flow);
    this.updateGunship(dt);
    this.updateEscort(dt);
    this.updateMarks();
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
      const target = clamp(leader + (barge.index ? RIVER.bargeSpread : -RIVER.bargeSpread), -RIVER.laneX + 2.5, RIVER.laneX - 2.5);
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
    amount *= g.mode.enemyDamage;
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
      else if (e.type === "barracks") this.updateBarracks(e, dt);
      else if (e.type === "enemy" && e.run) this.updateRunner(e, dt);
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
      e.cooldown = this.fireRate;
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
      e.cooldown = 2.6 * this.game.mode.enemyReload;
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
      e.cooldown = 5 * this.game.mode.enemyReload;
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
        e.cooldown = SKIFF.fireEvery * this.game.mode.enemyReload;
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
          tower.cooldown = cfg.shellEvery * this.game.mode.enemyReload;
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

  onBlocked(shot, glanced = false) {
    if (this.game.status !== "playing") return;
    if (shot.aimedAt?.kind === "barge") {
      this.blocked++;
      if (glanced) return;
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
      this.blastScenery(e.position, radius, 8);
      if (e.type === "crate" && e.bridge) {
        e.bridge.mesh.children[0]?.children.slice(0, 3).forEach((part) => (part.visible = false));
        g.notify("toast", "BRIDGE AMBUSH BROKEN");
      }
      if (chain) this.say("drums");
    }
    if (e.type === "barracks") {
      // Pieces into the sky, smoke, a charred shell left on the bank, and anyone still inside.
      g.shatter(e.position.clone().add(V(0, 1.2, 0)), [0x8f9a5b, 0x2f2c35, 0xc47f45, 0xff4b2b], 18, 1.5);
      const wreck = g.entity("wreck", null, e.position.clone(), { friendly: true, scrolling: true });
      for (let i = 0; i < 5; i++)
        g.view.box(V((i % 3 - 1) * 1.6, 0.25 + (i % 2) * 0.2, i < 3 ? -0.8 : 0.8), V(1.6, 0.5 + (i % 2) * 0.3, 1.2), i % 2 ? 0x2f2c35 : 0x5d6340, wreck.mesh).rotation.y = i * 0.4;
      g.smokeColumn(wreck.position, 5, 1.4, V(0, 1, 0));
      this.blastScenery(e.position, 4, 8);
      if (e.crew > 0) {
        g.score += 50 * e.crew;
        g.notify("toast", `BARRACKS DOWN / ${e.crew} INSIDE`);
        e.crew = 0;
      }
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

  // After the result is decided the scene keeps moving: the beam goes out, bombs still burst and
  // the help flies on without firing.
  settle(dt) {
    this.beam.group.visible = this.beam.tip.visible = false;
    this.updateAirStrike(dt, 0);
    this.updateGunship(dt);
    this.updateEscort(dt);
  }

  // Ripples under the enemy in view, health pips kept current, and how many are aiming now.
  updateMarks() {
    const g = this.game;
    const items = [];
    this.aiming = 0;
    for (const e of g.entities) {
      if (!isHostileEntity(e)) continue;
      if (e.hpBar) e.hpBar.material = this.healthFor(e);
      if (e.aim > 0 && e.target) this.aiming++;
      if (e.position.z < -48 || e.position.z > 26) continue;
      const style = this.rippleStyle(e);
      if (style) items.push({ x: e.position.x, y: (e.type === "tower" ? 1.1 : e.position.y) + 0.12, z: e.position.z, ...style });
    }
    this.ripples.update(g.time, items);
  }

  // ------------------------------------------------------------------ Marlin's weapons

  muzzle() {
    const g = this.game;
    return g.boatParts.Muzzle ? g.boatParts.Muzzle.getWorldPosition(V()) : g.player.position.clone().add(V(0, 1.1, -1));
  }

  // The hostile nearest to a point (within `reach`), for rockets and help to lock on to.
  hostileNear(point, reach) {
    let best = null,
      bestD = reach;
    for (const e of this.game.entities) {
      if (!isHostileEntity(e)) continue;
      const d = Math.hypot(e.position.x - point.x, e.position.z - point.z);
      if (d < bestD) {
        best = e;
        bestD = d;
      }
    }
    return best;
  }

  // With the deck gun held on a heavy target (a bunker, a barracks, the gate's towers or its
  // generator), a salvo follows on its own (2.7): one per target every few seconds, and never the
  // last salvo in the rack, which stays for the player.
  autoRockets(aim) {
    const g = this.game;
    if (this.rockets <= WEAPONS.rocket.salvo || g.rocketCooldown > 0 || g.status !== "playing") return false;
    const target = g.aimTarget || this.hostileNear(aim, 5);
    if (!target || !HEAVY.has(target.type) || target.shielded) return false;
    if (g.time - (target.autoRocketAt ?? -Infinity) < 4) return false;
    if (!this.fireRockets(aim)) return false;
    target.autoRocketAt = g.time;
    if (!this.said.has("autoRockets")) {
      this.said.add("autoRockets");
      g.notify("toast", "ROCKETS FOLLOW ON THE BIG TARGET");
    }
    return true;
  }

  // Rockets (key 2): a salvo of three from the rack, fanned a little, homing on what you aim at.
  fireRockets(aim) {
    const g = this.game,
      spec = WEAPONS.rocket;
    if (g.rocketCooldown > 0 || g.status !== "playing") return false;
    if (this.rockets <= 0) {
      g.rocketCooldown = 0.8;
      g.notify("toast", "NO ROCKETS / FIND A CRATE");
      return false;
    }
    const target = g.aimTarget || this.hostileNear(aim, 6);
    const origin = this.muzzle().add(V(0, 0.3, 0));
    const n = Math.min(spec.salvo, this.rockets);
    g.aimBoatTurret(aim);
    for (let i = 0; i < n; i++) {
      const side = (i - (n - 1) / 2) * spec.spread;
      g.spawnShot(origin.clone().add(V(side * 0.4, 0, 0)), aim.clone().add(V(side, 0, 0)), true, false, target);
    }
    this.rockets -= n;
    g.rocketCooldown = spec.cooldown;
    g.flash(origin, 0xffd47e, 1.1);
    g.audio.play("shot");
    return true;
  }

  createBeam() {
    const view = this.game.view;
    const group = new THREE.Group();
    group.visible = false;
    group.renderOrder = 6;
    for (const layer of BEAM.layers) {
      const mesh = new THREE.Mesh(
        BEAM.geometry,
        new THREE.MeshBasicMaterial({
          color: layer.color,
          transparent: true,
          opacity: layer.opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      mesh.scale.set(layer.radius, 1, layer.radius);
      mesh.userData.ownedMaterial = true;
      mesh.frustumCulled = false;
      group.add(mesh);
    }
    view.level.add(group);
    const tip = view.fxSprite("glow", 0x9ff3ff, 1, true);
    tip.visible = false;
    return { group, tip, spark: 0, sound: 0 };
  }

  // Laser (key 3): a held beam that burns the first hostile it touches and knocks down enemy
  // missiles. It overheats after a few seconds and must cool before it fires again.
  updateLaser(dt) {
    const g = this.game,
      spec = WEAPONS.laser,
      beam = this.beam;
    const firing = g.input.fire && g.weapon === "laser" && g.status === "playing" && !g.paused;
    const wasLocked = this.laser.locked;
    this.laser = laserHeat(this.laser, firing, dt);
    if (this.laser.locked && !wasLocked) {
      g.notify("toast", "LASER OVERHEATED");
      this.say("overheat");
    }
    beam.group.visible = beam.tip.visible = this.laser.beam;
    if (!this.laser.beam || !g.aimPoint) return;
    g.aimBoatTurret(g.aimPoint);
    const origin = this.muzzle();
    const dir = g.aimPoint.clone().sub(origin);
    dir.y = Math.max(dir.y, -0.25 * Math.hypot(dir.x, dir.z));
    dir.normalize();
    const far = origin.clone().addScaledVector(dir, spec.range);
    // First thing on the beam: an enemy missile (shot down) or a hostile (burned).
    let hit = null;
    for (const shot of g.projectiles) {
      if (!shot.hostile || !shot.missile || shot.dead) continue;
      const t = segmentSphere(origin, far, shot.position, 0.8);
      if (t !== null && (!hit || t < hit.t)) hit = { t, missile: shot };
    }
    for (const e of g.entities) {
      if (!isHostileEntity(e)) continue;
      for (const lift of e.hitLifts || [null]) {
        const centre = lift === null ? g.targetPosition(e) : e.position.clone().add(V(0, lift, 0));
        const t = segmentSphere(origin, far, centre, (e.hitRadius ?? e.radius) + spec.width * 0.4);
        if (t !== null && (!hit || t < hit.t)) hit = { t, entity: e };
      }
    }
    for (const r of this.scenery) {
      if (!r.alive || r.hidden) continue;
      const c = r.prop.position;
      const t = segmentSphere(origin, far, V(c.x, c.y + r.spec.lift, c.z), r.spec.radius);
      if (t !== null && (!hit || t < hit.t)) hit = { t, scenery: r };
    }
    const end = hit ? origin.clone().lerp(far, hit.t) : far;
    if (hit?.missile) {
      hit.missile.dead = true;
      g.score += 90;
      g.notify("toast", "INTERCEPT +90");
      g.blast(hit.missile.position, 1.2, COLORS.gold);
    } else if (hit?.entity) this.burn(hit.entity, spec.dps * dt);
    else if (hit?.scenery) {
      const r = hit.scenery;
      r.burn += spec.dps * dt;
      const whole = Math.floor(r.burn);
      if (whole > 0) {
        r.burn -= whole;
        this.hurtScenery(r, whole);
      }
    }
    // Stretch the beam from the muzzle to the hit.
    const length = origin.distanceTo(end);
    beam.group.position.copy(origin).lerp(end, 0.5);
    beam.group.quaternion.setFromUnitVectors(UP, dir);
    const flicker = 1 + Math.sin(g.time * 60) * 0.12;
    beam.group.children.forEach((mesh, i) => mesh.scale.set(BEAM.layers[i].radius * flicker, length, BEAM.layers[i].radius * flicker));
    beam.tip.position.copy(end);
    beam.tip.scale.setScalar(hit ? 1.6 * flicker : 0.8);
    beam.spark -= dt;
    if (hit && beam.spark <= 0) {
      beam.spark = 0.05;
      g.ember(end.clone().add(V((Math.random() - 0.5) * 0.6, Math.random() * 0.5, (Math.random() - 0.5) * 0.6)), 0xfff1a8, 0.5, 0.3);
    }
    beam.sound -= dt;
    if (beam.sound <= 0) {
      beam.sound = 0.14;
      g.audio.play("shot");
    }
  }

  // Damage over time: whole points land as they add up, so kills and puffs stay ordinary.
  burn(e, amount) {
    e.burn = (e.burn || 0) + amount;
    const whole = Math.floor(e.burn);
    if (whole <= 0) return;
    e.burn -= whole;
    this.game.damage(e, whole);
  }

  // ------------------------------------------------------------------ air strike

  // Q: Kestrel Two lays a line of bombs right across the canal where Marlin aims, ahead of the
  // barges. A marked line shows where they will fall.
  callAirStrike(z = this.game.aimPoint ? this.game.aimPoint.z : -20) {
    const g = this.game;
    if (g.status !== "playing" || this.airStrike) return false;
    if (this.strikes <= 0) {
      g.notify("toast", "NO AIR STRIKES / FIND A CRATE");
      this.say("noStrike");
      return false;
    }
    this.strikes--;
    const points = strikeLine(z).map((p) => ({ ...p, marker: g.view.ring(V(p.x, 0.14, p.z), 1.6, 0xff8a1f, 0.22) }));
    this.airStrike = { t: 0, points, bombers: [], bombs: [], dropped: 0, struck: new Set() };
    this.said.delete("strikeIn");
    this.say("strikeIn");
    g.notify("toast", "AIR STRIKE INBOUND");
    return true;
  }

  gainStrike() {
    this.strikes++;
    this.said.delete("strikeGain");
    this.say("strikeGain");
  }

  updateAirStrike(dt, flow) {
    const g = this.game,
      a = this.airStrike;
    if (!a) return;
    a.t += dt;
    // The line stays on the water it marked, which scrolls past with the convoy.
    for (const p of a.points) {
      p.z += flow * dt;
      if (p.marker) {
        p.marker.position.z = p.z;
        p.marker.material.opacity = 0.45 + Math.sin(g.time * 14) * 0.35;
        p.marker.scale.setScalar(1 + Math.max(0, AIR_STRIKE.warning - a.t) * 0.25);
      }
    }
    // Two bombers cross the canal from the west, low and fast.
    if (!a.bombers.length && a.t > AIR_STRIKE.warning - 1.1) {
      for (const [i, dz] of [
        [0, -2.2],
        [1, 2.2],
      ]) {
        const model = g.view.assets.has("bomber") ? "bomber" : "boat";
        const mesh = g.view.model(model, V(-52 - i * 6, 12 + i * 0.8, a.points[0].z + dz), 1);
        mesh.rotation.y = -Math.PI / 2;
        a.bombers.push({ mesh, dz, props: ["PropellerL", "PropellerR"].map((n) => mesh.getObjectByName(n)).filter(Boolean) });
      }
      g.audio.play("radio");
    }
    for (const b of a.bombers) {
      b.mesh.position.x += 42 * dt;
      b.mesh.position.z = a.points[0].z + b.dz;
      b.mesh.rotation.z = Math.sin(g.time * 3) * 0.05;
      for (const prop of b.props) prop.rotation.y += dt * 40;
    }
    // Each bomb falls as the lead bomber passes over its mark.
    const lead = a.bombers[0];
    if (lead)
      while (a.dropped < a.points.length && lead.mesh.position.x >= a.points[a.dropped].x - 5) {
        const p = a.points[a.dropped++];
        const mesh = g.view.model(g.view.assets.has("bomb-blast") ? "bomb-blast" : "missile-friendly", V(p.x - 4, 11, p.z), 1.1);
        mesh.rotation.x = Math.PI / 2;
        a.bombs.push({ mesh, p, t: 0 });
      }
    for (const bomb of a.bombs) {
      if (bomb.done) continue;
      bomb.t += dt;
      const u = Math.min(1, bomb.t / 0.6);
      bomb.mesh.position.set(bomb.p.x - 4 * (1 - u), 11 * (1 - u * u), bomb.p.z);
      if (u >= 1) {
        bomb.done = true;
        g.view.disposeObject(bomb.mesh);
        if (bomb.p.marker) g.view.disposeObject(bomb.p.marker);
        bomb.p.marker = null;
        this.detonateStrike(bomb.p, a.struck);
      }
    }
    const finished = a.dropped === a.points.length && a.bombs.every((b) => b.done) && a.bombers.every((b) => b.mesh.position.x > 60);
    if (finished) {
      for (const b of a.bombers) g.view.disposeObject(b.mesh);
      this.airStrike = null;
    }
  }

  // Each bomb's blast: the bombs overlap, but a strike hits any one target once, and the lock
  // gate's hardened towers and generator only take a dent. Once the mission is decided the
  // bombs still burst but change nothing.
  detonateStrike(p, struck = new Set()) {
    const g = this.game;
    const at = V(p.x, 0.4, p.z);
    g.blast(at, 3.4, 0xff8a2b);
    const splash = g.view.ring(V(p.x, 0.12, p.z), 0.6, 0xdff9f2, 0.2);
    g.effects.push({ mesh: splash, life: 1.1, maxLife: 1.1, ring: true, growth: 6 });
    if (g.status !== "playing") return;
    for (const e of g.entities) {
      if (!isHostileEntity(e) || struck.has(e)) continue;
      if (Math.hypot(e.position.x - p.x, e.position.z - p.z) >= AIR_STRIKE.radius + (e.radius || 0)) continue;
      struck.add(e);
      g.damage(e, e.type === "tower" || e.type === "generator" ? AIR_STRIKE.hardened : AIR_STRIKE.damage, true);
    }
    for (const shot of g.projectiles)
      if (shot.hostile && !shot.dead && Math.hypot(shot.position.x - p.x, shot.position.z - p.z) < AIR_STRIKE.radius) shot.dead = true;
    this.blastScenery(p, AIR_STRIKE.radius, AIR_STRIKE.damage);
  }

  // ------------------------------------------------------------------ help from crates

  // The Hornet gunship flies Marlin's wing: it shoots where Marlin shoots, or at the nearest
  // threat when Marlin holds fire, and sends a rocket at the nearest target every few seconds.
  callGunship() {
    const g = this.game;
    const heli = this.support.heli;
    if (heli && heli.t > 0) {
      heli.t = SUPPORT.heli.time;
      return;
    }
    if (heli) g.view.disposeObject(heli.mesh);
    const mesh = g.view.model("gunship", V(g.player.position.x + 8, 12, 34), 1);
    this.support.heli = {
      mesh,
      t: SUPPORT.heli.time,
      cooldown: 1,
      rocket: 1.5,
      rotor: mesh.getObjectByName("Rotor"),
      tail: mesh.getObjectByName("TailRotor"),
      muzzle: mesh.getObjectByName("HeliMuzzle"),
      velocity: V(),
    };
    this.said.delete("heli");
    this.say("heli");
  }

  updateGunship(dt) {
    const g = this.game,
      h = this.support.heli;
    if (!h) return;
    h.t -= dt;
    const leaving = h.t <= 0;
    if (leaving && !h.left) {
      h.left = true;
      this.said.delete("heliOut");
      this.say("heliOut");
    }
    const side = g.player.position.x > 0 ? -1 : 1;
    const station = leaving ? V(h.mesh.position.x, 18, -90) : V(clamp(g.player.position.x + side * 7, -RIVER.laneX, RIVER.laneX), 6.5, g.player.position.z - 4);
    const before = h.mesh.position.clone();
    const rate = leaving ? 0.7 : 1.8;
    h.mesh.position.x = THREE.MathUtils.damp(h.mesh.position.x, station.x, rate, dt);
    h.mesh.position.y = THREE.MathUtils.damp(h.mesh.position.y, station.y, rate, dt) + Math.sin(g.time * 2.2) * 0.01;
    h.mesh.position.z = THREE.MathUtils.damp(h.mesh.position.z, station.z, rate, dt);
    if (dt > 0) h.velocity.copy(h.mesh.position).sub(before).divideScalar(dt);
    if (h.rotor) h.rotor.rotation.y += dt * 32;
    if (h.tail) h.tail.rotation.x += dt * 40;
    if (leaving) {
      h.mesh.rotation.set(-0.25, 0, 0);
      if (h.mesh.position.z < -70) {
        g.view.disposeObject(h.mesh);
        this.support.heli = null;
      }
      return;
    }
    // Marlin's fire direction first; otherwise the nearest threat ahead.
    const threat = g.nearestTarget();
    const aim = g.input.fire && g.aimPoint ? g.aimPoint.clone() : threat ? g.targetPosition(threat) : null;
    const face = aim ? Math.atan2(-(aim.x - h.mesh.position.x), -(aim.z - h.mesh.position.z)) : 0;
    h.mesh.rotation.set(-0.12 - clamp(h.velocity.z * 0.02, -0.2, 0.2), dampAngle(h.mesh.rotation.y, face, 4, dt), clamp(-h.velocity.x * 0.05, -0.35, 0.35));
    h.cooldown -= dt;
    h.rocket -= dt;
    if (!aim || g.status !== "playing") return;
    const origin = h.muzzle ? h.muzzle.getWorldPosition(V()) : h.mesh.position.clone().add(V(0, -0.5, -2));
    if (h.cooldown <= 0) {
      h.cooldown = SUPPORT.heli.every;
      const jitter = V((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6);
      g.spawnShot(origin, aim.clone().add(jitter), false, false, null, null, { damage: SUPPORT.heli.damage, ally: true, color: 0x9ff3ff });
      g.flash(origin, 0xfff1b8, 0.45);
    }
    if (h.rocket <= 0 && threat) {
      h.rocket = SUPPORT.heli.rocketEvery;
      g.spawnShot(h.mesh.position.clone().add(V(0, -0.6, 0)), g.targetPosition(threat), true, false, threat, null, { ally: true });
    }
  }

  // Duarte's harbour launch rides beside the barges and shoots whatever comes closest to it.
  callEscort() {
    const g = this.game;
    const ally = this.support.ally;
    if (ally && ally.t > 0) {
      ally.t = SUPPORT.ally.time;
      return;
    }
    if (ally) g.view.disposeObject(ally.mesh);
    const side = g.player.position.x > 0 ? -1 : 1;
    const mesh = g.view.model("escort-boat", V(side * 9, 0.08, 34), 1);
    this.support.ally = {
      mesh,
      side,
      t: SUPPORT.ally.time,
      cooldown: 1,
      turret: mesh.getObjectByName("Turret"),
      muzzle: mesh.getObjectByName("Muzzle"),
      wake: 0,
    };
    this.said.delete("ally");
    this.say("ally");
  }

  updateEscort(dt) {
    const g = this.game,
      a = this.support.ally;
    if (!a) return;
    a.t -= dt;
    const leaving = a.t <= 0;
    if (leaving && !a.left) {
      a.left = true;
      this.said.delete("allyOut");
      this.say("allyOut");
    }
    // Abreast of the barges on the far side from Marlin.
    if (!leaving) a.side = g.player.position.x > 3 ? -1 : g.player.position.x < -3 ? 1 : a.side;
    const target = leaving ? V(a.side * (RIVER.laneX - 1), 0, 44) : V(a.side * (RIVER.laneX - 3.5), 0, 8);
    const p = a.mesh.position;
    const before = p.clone();
    p.x = THREE.MathUtils.damp(p.x, target.x, 0.9, dt);
    p.z = THREE.MathUtils.damp(p.z, target.z, leaving ? 0.6 : 1.1, dt);
    p.y = 0.08 + Math.sin(g.time * 2.4 + 1) * 0.05;
    const dx = p.x - before.x;
    a.mesh.rotation.set(0, clamp(-dx * 4, -0.4, 0.4), clamp(-dx * 3, -0.15, 0.15));
    a.wake -= dt;
    if (a.wake <= 0) {
      a.wake = 0.2;
      const ring = g.view.ring(V(p.x, 0.11, p.z + 2), 0.5, 0xdff9f2, 0.07);
      g.effects.push({ mesh: ring, life: 1.1, maxLife: 1.1, ring: true, growth: 1.3 });
    }
    if (leaving) {
      if (p.z > 40) {
        g.view.disposeObject(a.mesh);
        this.support.ally = null;
      }
      return;
    }
    // The nearest threat within the launch's gun range: riding beside the barges, it guards
    // that side of the convoy.
    let best = null,
      bestD = SUPPORT.ally.range;
    for (const e of g.entities) {
      if (!isHostileEntity(e)) continue;
      const d = e.position.distanceTo(p);
      if (d < bestD) {
        best = e;
        bestD = d;
      }
    }
    if (a.turret && best) {
      a.mesh.updateMatrixWorld(true);
      const local = a.turret.parent.worldToLocal(g.targetPosition(best)).sub(a.turret.position);
      a.turret.rotation.y = Math.atan2(-local.x, -local.z);
    }
    a.cooldown -= dt;
    if (!best || a.cooldown > 0 || g.status !== "playing") return;
    a.cooldown = SUPPORT.ally.every;
    a.mesh.updateMatrixWorld(true);
    const origin = a.muzzle ? a.muzzle.getWorldPosition(V()) : p.clone().add(V(0, 1, -1.5));
    g.spawnShot(origin, g.targetPosition(best), false, false, null, null, { damage: SUPPORT.ally.damage, ally: true, color: 0x8fffc8 });
    g.flash(origin, 0xfff1b8, 0.45);
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
      // Guns aiming at the convoy right now, and the chance a round that arrives does harm.
      incoming: { aiming: this.aiming || 0, chance: this.game.hitChance },
      weapons: {
        rockets: this.rockets,
        heat: this.laser.heat,
        overheated: this.laser.locked,
        strikes: this.strikes,
        striking: Boolean(this.airStrike),
      },
      help: {
        heli: this.support.heli ? Math.max(0, this.support.heli.t) : 0,
        ally: this.support.ally ? Math.max(0, this.support.ally.t) : 0,
      },
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
    return 300 + this.game.shields.reduce((a, b) => a + b, 0) * 40 + this.barges.reduce((s, b) => s + (b.alive ? (b.hp / this.game.mode.bargeHp) * 20 : 0), 0);
  }
}
