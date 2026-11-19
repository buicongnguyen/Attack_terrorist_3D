import * as THREE from "three";
import {
  rescueLayout,
  riverEdge,
  RESCUE_HEIGHT,
  RESCUE_GEAR,
  rearm,
  PICKUP_RADIUS,
  PIN_RADIUS,
  LIFT_SECONDS,
  LAND_RADIUS,
  LAND_SECONDS,
  REPAIR_COOLDOWN,
  THREATS,
  rescueProgress,
  isHostileEntity,
  riverAt,
} from "./rescue-data.js";
import { LAND, terrainHeight } from "./rescue-world.js";
import { clamp } from "./physics.js";
import { MISSION_STORY } from "./story.js";
import { bonuses } from "./requisition.js";
import { chapterStart } from "./data.js";
import { ROUNDS } from "./armoury.js";
import { Ripples } from "./ripples.js";
import { dampAngle } from "./harbour.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const smooth = (t) => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};
// People and vehicles stand on the ground; the racks of launch sites and trucks rise this far.
const GROUND = LAND - 0.05;
const RACK = { site: 1.05, truck: 0.95 };
// Where a drone station parks its drones (the model's two cradles), and how high they sit.
const CRADLES = [
  [-1.25, 0.4],
  [1.25, 0.4],
];
// Drones parked small enough that the two fit side by side, their origin above the cradle.
const CRADLE_Y = 0.32;
// What pins a signal down: people and emplacements, not vehicles passing by or drones.
const PINS = new Set(["enemy", "cannon", "missile-site", "barracks"]);
// Ripples under what matters: gold under launchers, trucks, stations; red under guns, barracks and soldiers.
const MARKS = {
  "missile-site": { size: 3.4, color: 0xffc62b, gain: 1 },
  "missile-truck": { size: 2.8, color: 0xffc62b, gain: 1 },
  "drone-pad": { size: 3.2, color: 0xffc62b, gain: 1 },
  barracks: { size: 3.6, color: 0xff4b2b, gain: 0.9 },
  "aa-truck": { size: 2.4, color: 0xff4b2b, gain: 0.8 },
  cannon: { size: 2.2, color: 0xff4b2b, gain: 0.8 },
  enemy: { size: 1.1, color: 0xff4b2b, gain: 0.45 },
};
const PARKED = 0.7;
// Colours of the pieces thrown up by each kind of wreck.
const WRECK = {
  "missile-site": [0xd8c6aa, 0x2f2c35, 0xff4b2b, 0x8d8791],
  "missile-truck": [0x2f2c35, 0x4a4652, 0xff4b2b, 0x24262b],
  "aa-truck": [0x2f2c35, 0x8d8791, 0xff4b2b, 0x24262b],
  "drone-pad": [0x3a4048, 0xffcc1f, 0x2f2c35, 0xd8c6aa],
  barracks: [0x8f9a5b, 0x2f2c35, 0xc47f45, 0xff4b2b],
  cannon: [0x2f2c35, 0x8d8791, 0xff4b2b],
  drone: [0x2f2c35, 0xff4b2b, 0x8d8791],
};

export class RescueOperation {
  constructor(game) {
    this.game = game;
    const view = game.view;
    this.index = game.index - chapterStart(2);
    this.layout = rescueLayout(this.index, game.mission.crew);
    this.map = this.layout.map;
    const start = this.layout.start;
    game.player = view.model("helicopter", V(start.x, RESCUE_HEIGHT, start.z), 0.95);
    // Lantern turns to face her fire; bank and pitch then act in her own frame.
    game.player.rotation.order = "YXZ";
    this.rotor = game.player.getObjectByName("Rotor");
    this.tailRotor = game.player.getObjectByName("TailRotor");
    this.heliTurret = game.player.getObjectByName("ChinTurret");
    this.heliMuzzle = game.player.getObjectByName("HeliMuzzle");
    game.shieldMeshes = game.createShields(3.1, 0);
    view.followPlayer(game.player.position, 0, true);
    const b = this.layout.bounds;
    this.vehicle = {
      // 2.7: a little slower (14 m/s before), so the ground fight has time to happen.
      accel: 52,
      drag: 4.1,
      max: 11,
      bounds: { left: b.left, right: b.right, far: b.far, near: b.near },
      height: RESCUE_HEIGHT,
      bob: 1.3,
      bank: 0.035,
      pitch: 0.016,
    };
    this.story = MISSION_STORY[game.index];
    this.said = new Set();
    // 5.0: requisition raises the load Lantern starts with and is topped up to at a base.
    const perks = bonuses(game.upgrades);
    this.load = { rockets: RESCUE_GEAR.rockets + perks.heliRockets, guided: RESCUE_GEAR.guided + perks.heliGuided, flares: RESCUE_GEAR.flares + perks.flares };
    this.gear = { ...this.load };
    this.rescued = 0;
    this.selected = 0;
    this.countermeasures = 0;
    this.flareCooldown = 0;
    this.baseCooldown = 0;
    this.landing = null;
    this.state = "EN ROUTE";
    this.labels = [];
    this.uid = 0;
    this.soldiers = this.layout.survivors.map((site, i) => {
      const soldier = game.entity("survivor", "rescue-soldier", V(site.x, GROUND, site.z), {
        ...site,
        friendly: true,
        rescued: false,
        radius: 0.8,
        name: site.name,
        person: site.person,
        signal: i + 1,
      });
      soldier.marker = view.ring(V(0, 0.08, 0), 3.2, 0x65f3b0, 0.12, soldier.mesh);
      soldier.wave = soldier.mesh.getObjectByName("WaveArm");
      return soldier;
    });
    let caves = 0;
    for (const threat of this.layout.threats) {
      if (threat.type === "cave") this.cave(threat.x, threat.z, caves++);
      else this.spawnThreat(threat);
    }
    for (const item of this.layout.supplies) {
      const supply = game.spawnPickup(item.z, item.kind, item.x);
      supply.scrolling = false;
      supply.baseY = riverEdge(this.map, item.x, item.z) < 0 ? 0.3 : LAND + 0.1;
      supply.position.y = supply.baseY;
    }
    this.cable = view.box(V(), V(0.025, 1, 0.025), 0xdbe6d3);
    this.cable.visible = false;
    this.ripples = new Ripples(view, 60);
    this.siege = null;
    if (this.map.siege) this.startSiege();
  }

  // ------------------------------------------------------------------ the siege (4.0)

  // Eye of the Storm: the Tidelock's gates cross the river beside the station and close over
  // `seconds`; the station has an integrity that sappers and Marrow's gunship wear down.
  startSiege() {
    const view = this.game.view,
      cfg = this.map.siege;
    const river = riverAt(this.map, cfg.gate.z),
      half = river.width / 2;
    const leaves = [-1, 1].map((side) => {
      const open = river.x + side * half * 1.5,
        shut = river.x + side * half * 0.5;
      const leaf = new THREE.Group();
      leaf.position.set(open, 0, cfg.gate.z);
      view.level.add(leaf);
      view.box(V(0, 1.6, 0), V(half, 3.4, 1.4), 0x2f86e8, leaf);
      view.box(V(0, 3.45, 0), V(half, 0.3, 1.6), 0xffc62b, leaf);
      view.box(V(0, 2, 0.72), V(half * 0.9, 0.5, 0.06), 0x7fd8ff, leaf);
      view.box(V(side * (half + 1.2) + river.x, 1.5, cfg.gate.z), V(2.6, 3.8, 3.2), 0xd9cdb8);
      return { leaf, open, shut };
    });
    for (const m of cfg.motors) {
      view.box(V(m.x, LAND + 0.9, m.z), V(2.2, 1.8, 2.2), 0x3a4048);
      view.box(V(m.x, LAND + 1.95, m.z), V(2.5, 0.25, 2.5), 0xffc62b);
      view.ring(V(m.x, LAND + 0.06, m.z), 2.6, 0x7fe8ff, 0.12);
    }
    this.siege = { cfg, t: 0, gate: 0, integrity: cfg.integrity, max: cfg.integrity, next: 0, boss: null, bossDown: false, held: 0, flip: false, leaves };
    this.state = "STATION 100%";
  }

  hurtStation(amount, text) {
    const s = this.siege,
      g = this.game;
    if (g.status !== "playing") return;
    s.integrity = Math.max(0, s.integrity - amount * g.mode.enemyDamage);
    g.audio.play("hit");
    g.notify("toast", `${text} / STATION ${Math.round((s.integrity / s.max) * 100)}%`);
  }

  spawnWave(w) {
    const g = this.game,
      s = this.siege,
      cfg = s.cfg;
    if (w.sappers) {
      for (let i = 0; i < w.sappers; i++) {
        const e = this.soldier(w.from[0] + (i % 2) * 1.8, w.from[1] + i * 1.5);
        e.hp = THREATS.sapper.hp;
        e.alert = true;
        e.sapper = cfg.motors[i % cfg.motors.length];
        // Gold rings: these are the ones to stop.
        e.ring?.material.color.set(0xffc62b);
      }
      g.notify("toast", `SAPPERS FROM THE ${w.from[1] > -34 ? "SOUTH" : "NORTH"} / STOP THEM AT THE MOTORS`);
      this.say("sappers");
    }
    if (w.drones) {
      for (let i = 0; i < w.drones; i++) {
        const at = V(w.from[0] + i * 3, 7.7, w.from[1] + i * 2);
        const e = g.entity("drone", "drone", at, { hp: THREATS.drone.hp, radius: 1, cooldown: 2 + i * 0.6, range: THREATS.drone.range, alert: true });
        e.home = V(cfg.station.x + (i - 1) * 9, 7.7, cfg.station.z + 8);
      }
      this.say("drones");
    }
    if (w.truck) this.spawnThreat({ type: "missile-truck", route: w.truck });
    if (w.boss) this.spawnBoss();
  }

  // Marrow, in a Hornet gunship taken at Highwater: he circles the station, hunts Lantern with
  // missiles and gun bursts, and strafes the control room.
  spawnBoss() {
    const g = this.game,
      s = this.siege,
      spec = s.cfg.boss,
      c = s.cfg.station;
    const e = g.entity("gunship", "gunship", V(c.x + 30, 8.2, c.z - 70), {
      hp: spec.hp,
      maxHp: spec.hp,
      radius: 2.4,
      lift: 0,
      alert: true,
      angle: -Math.PI / 2,
      missile: 3,
      burst: 1.5,
      strafe: spec.strafe,
    });
    e.rotor = e.mesh.getObjectByName("Rotor");
    e.tail = e.mesh.getObjectByName("TailRotor");
    g.view.ring(V(0, -0.5, 0), 3.4, 0xff4b2b, 0.18, e.mesh);
    s.boss = e;
    this.say("boss");
    g.notify("toast", "MARROW / HORNET TWO INBOUND");
  }

  updateBoss(e, dt, d) {
    const g = this.game,
      s = this.siege,
      spec = s.cfg.boss,
      c = s.cfg.station;
    if (e.rotor) e.rotor.rotation.y += dt * 35;
    if (e.tail) e.tail.rotation.x += dt * 44;
    const rage = e.hp < e.maxHp / 2;
    e.angle += dt * spec.speed * (rage ? 1.5 : 1);
    const tx = c.x + 6 + Math.cos(e.angle) * spec.orbit,
      tz = c.z + Math.sin(e.angle) * spec.orbit * 0.8;
    const px = e.position.x,
      pz = e.position.z,
      k = 1 - Math.exp(-dt * 1.2);
    e.position.x += (tx - px) * k;
    e.position.z += (tz - pz) * k;
    e.position.y = 8.2 + Math.sin(g.time * 1.7) * 0.4;
    const hx = e.position.x - px,
      hz = e.position.z - pz;
    if (Math.hypot(hx, hz) > 1e-4) e.mesh.rotation.y = dampAngle(e.mesh.rotation.y, Math.atan2(-hx, -hz), 5, dt);
    if (rage && !e.raged) {
      e.raged = true;
      this.say("rage");
      this.spawnWave({ drones: 2, from: [e.position.x, e.position.z] });
    }
    e.missile -= dt;
    if (e.missile <= 0 && d < 46) {
      this.shoot(e, -0.4, true);
      e.missile = spec.missile * g.mode.enemyReload * (rage ? 0.75 : 1);
    }
    e.burst -= dt;
    if (e.burst <= 0 && d < 30) {
      this.shoot(e, -0.4);
      e.burst = spec.burst * g.mode.enemyReload;
    }
    e.strafe -= dt;
    if (e.strafe <= 0) {
      e.strafe = spec.strafe;
      for (let i = 0; i < 3; i++) g.blast(V(c.x + (i - 1) * 2.6, LAND + 1.6, c.z - 3), 1.1, 0xff4b2b, { quiet: i > 0, small: true });
      this.hurtStation(spec.strafeDamage, "MARROW STRAFES THE CONTROL ROOM");
    }
    this.labels.push({ id: "boss", x: e.position.x, y: e.position.y + 2.8, z: e.position.z, text: `MARROW / ${Math.max(1, Math.ceil((e.hp / e.maxHp) * 100))}%`, hot: true });
  }

  // A sapper runs for his gate motor; if he gets there, the charge goes off.
  updateSapper(e, dt) {
    const m = e.sapper;
    e.running = true;
    if (!this.moveTowards(e, m.x - 1.7, m.z, THREATS.sapper.speed, dt)) return;
    this.game.blast(V(m.x, LAND + 1, m.z), 2.2, 0xff8a2b);
    this.hurtStation(THREATS.sapper.damage, "CHARGE ON THE GATE MOTOR");
    this.say("charge");
    this.game.kill(e, false);
  }

  updateSiege(dt) {
    const g = this.game,
      s = this.siege,
      cfg = s.cfg;
    const u = smooth(s.gate);
    for (const { leaf, open, shut } of s.leaves) leaf.position.x = open + (shut - open) * u;
    if (g.status !== "playing") return;
    s.t += dt;
    const stalled = Boolean(s.boss && !s.boss.dead) && s.gate >= cfg.stall;
    if (!stalled) s.gate = Math.min(1, s.gate + dt / cfg.seconds);
    else {
      // Marrow holds the gates: every few seconds more sappers come.
      this.say("stall");
      s.held += dt;
      if (s.held >= cfg.stallWave) {
        s.held = 0;
        s.flip = !s.flip;
        this.spawnWave({ sappers: 3, from: s.flip ? [-38, 6] : [-38, -72] });
      }
    }
    while (s.next < cfg.waves.length && cfg.waves[s.next].at <= s.t) this.spawnWave(cfg.waves[s.next++]);
    if (s.gate > 0.5) this.say("half");
    const river = riverAt(this.map, cfg.gate.z);
    this.labels.push({ id: "gates", x: river.x, y: 5.2, z: cfg.gate.z, text: stalled ? "GATES STALLED / SHOOT DOWN MARROW" : `GATES ${Math.floor(s.gate * 100)}%`, hot: stalled });
    const health = Math.round((s.integrity / s.max) * 100);
    this.labels.push({ id: "station", x: cfg.station.x - 6, y: 6.2, z: cfg.station.z - 4.4, text: `STATION ${health}%`, hot: health < 35 });
    this.state = `${stalled ? "GATES STALLED / " : ""}STATION ${health}%`;
    if (s.integrity <= 0) {
      g.blast(V(cfg.station.x, LAND + 2, cfg.station.z - 3), 4.5, 0xff8a2b);
      g.finish(false, "station");
    } else if (s.gate >= 1) {
      this.say("success");
      g.finish(true);
    }
  }

  // ------------------------------------------------------------------ the enemy
  spawnThreat(t) {
    const g = this.game,
      view = g.view;
    const has = (name) => view.assets.has(name);
    if (t.type === "soldiers") {
      for (let i = 0; i < t.count; i++) {
        const a = (i / t.count) * Math.PI * 2 + t.x;
        this.soldier(t.x + Math.cos(a) * 2.2, t.z + Math.sin(a) * 2.2);
      }
      // A sandbagged post, so the group reads as a place.
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 1.6 + 0.4;
        view.box(V(t.x + Math.cos(a) * 3.6, LAND + 0.25, t.z + Math.sin(a) * 3.6), V(1.2, 0.5, 0.7), 0xd9a45a).rotation.y = -a;
      }
    } else if (t.type === "missile-site") {
      const spec = THREATS.site;
      const site = g.entity("missile-site", has("missile-site") ? "missile-site" : "launcher", V(t.x, GROUND, t.z), {
        hp: spec.hp,
        maxHp: spec.hp,
        radius: 2.3,
        state: "idle",
        timer: 0,
        crew: [],
        fired: false,
        uid: ++this.uid,
        scale: has("missile-site") ? 1 : 0.8,
      });
      if (!has("missile-site")) site.mesh.scale.setScalar(0.8);
      // The launcher points south, where Lantern comes from.
      site.mesh.rotation.y = Math.PI;
      site.rack = site.mesh.getObjectByName("Rack");
      site.warning = view.ring(V(0, 0.1, 0), 2.8, 0xffc62b, 0.14, site.mesh);
      for (let i = 0; i < (t.crew ?? 3); i++) {
        const a = (i / (t.crew ?? 3)) * Math.PI * 2 + 0.5;
        const c = this.soldier(t.x + Math.cos(a) * spec.crewRadius, t.z + Math.sin(a) * spec.crewRadius);
        c.site = site;
        c.post = { x: t.x + Math.cos(a) * spec.post, z: t.z + Math.sin(a) * spec.post };
        site.crew.push(c);
      }
    } else if (t.type === "missile-truck") {
      const spec = THREATS.truck;
      const [x, z] = t.route[0];
      const truck = g.entity("missile-truck", has("missile-truck") ? "missile-truck" : "aa-truck", V(x, GROUND, z), {
        hp: spec.hp,
        maxHp: spec.hp,
        radius: 1.8,
        route: t.route,
        leg: 1,
        state: "drive",
        timer: 0,
        cool: 0,
        fired: false,
        uid: ++this.uid,
      });
      truck.rack = truck.mesh.getObjectByName("Rack") || truck.mesh.getObjectByName("TruckTurret");
      truck.warning = view.ring(V(0, 0.1, 0), 2.4, 0xffc62b, 0.12, truck.mesh);
      truck.warning.visible = false;
    } else if (t.type === "flak-truck") {
      const spec = THREATS.flak;
      const [x, z] = t.route[0];
      const truck = g.entity("aa-truck", "aa-truck", V(x, GROUND, z), {
        hp: spec.hp,
        radius: 1.65,
        route: t.route,
        leg: 1,
        cooldown: 2 + g.random(),
        range: spec.range,
      });
      truck.turretNode = truck.mesh.getObjectByName("TruckTurret");
      truck.warning = view.ring(V(0, 0.1, 0), 2.3, 0xff8168, 0.1, truck.mesh);
    } else if (t.type === "drone-pad") {
      const spec = THREATS.pad;
      const pad = g.entity("drone-pad", has("drone-pad") ? "drone-pad" : null, V(t.x, GROUND, t.z), {
        hp: spec.hp,
        maxHp: spec.hp,
        radius: 2.6,
        state: "idle",
        timer: 0,
        parked: [],
        uid: ++this.uid,
      });
      if (!has("drone-pad")) {
        view.box(V(0, 0.15, 0), V(5, 0.3, 5), 0x3a4048, pad.mesh);
        view.box(V(0, 0.31, 0), V(4.4, 0.04, 4.4), 0xffcc1f, pad.mesh);
      }
      pad.warning = view.ring(V(0, 0.4, 0), 3, 0xffc62b, 0.14, pad.mesh);
      for (const [cx, cz] of CRADLES.slice(0, spec.drones)) {
        const drone = view.model("drone", V(cx, CRADLE_Y + 0.26 * PARKED, cz), PARKED, pad.mesh);
        drone.userData.rotor = drone.getObjectByName("DroneRotor");
        pad.parked.push(drone);
      }
    } else if (t.type === "barracks") {
      const spec = THREATS.barracks;
      const b = g.entity("barracks", has("barracks-hut") ? "barracks-hut" : null, V(t.x, GROUND, t.z), {
        hp: spec.hp,
        maxHp: spec.hp,
        radius: 3,
        crewLeft: t.crew ?? spec.crew,
        state: "idle",
        timer: 0,
      });
      if (!has("barracks-hut")) {
        view.box(V(0, 1.2, 0), V(6, 2.4, 3.6), 0x8f9a5b, b.mesh);
        view.box(V(0, 2.55, 0), V(6.4, 0.3, 4), 0x2f2c35, b.mesh);
      }
      // The door faces the middle of the valley.
      b.facing = t.x > 0 ? -1 : 1;
      b.mesh.rotation.y = t.x > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else if (t.type === "cannon") {
      const cannon = g.entity("cannon", "cannon", V(t.x, GROUND, t.z), {
        hp: THREATS.cannon.hp,
        radius: 1.15,
        cooldown: 1.8,
        range: THREATS.cannon.range,
      });
      cannon.warning = view.ring(V(0, 0.1, 0), 1.5, 0xff8168, 0.1, cannon.mesh);
    }
  }

  soldier(x, z) {
    const g = this.game;
    const e = g.opponent(V(x, GROUND, z), { hp: THREATS.soldier.hp, scale: 1.05 });
    e.state = "idle";
    e.cooldown = 1.5 + g.random() * 2;
    e.range = THREATS.soldier.range;
    e.home = { x, z };
    e.mesh.rotation.y = g.random() * Math.PI * 2;
    return e;
  }

  // The alarm: a unit that sees Lantern (or is shot at) wakes, and so does everyone near it.
  alarm(e) {
    if (e.alert) return;
    this.wake(e);
    for (const other of this.game.entities)
      if (!other.dead && !other.alert && other !== e && isHostileEntity(other) && distance(other.position, e.position) < THREATS.alarm) {
        this.wake(other);
        if (other.site && !other.site.alert) this.alarm(other.site);
      }
    if (e.site) this.alarm(e.site);
  }

  // One unit awake, and a launch site's crew with it (a cave's crew is a model, not people).
  wake(u) {
    u.alert = true;
    if (Array.isArray(u.crew)) for (const c of u.crew) c.alert = true;
  }

  onHit(e) {
    this.alarm(e);
  }

  // Where pieces thrown up by a wreck come down.
  groundAt(x, z) {
    return terrainHeight(this.map, x, z);
  }

  cave(x, z, index) {
    const g = this.game,
      view = g.view;
    const cave = g.entity("cave", null, V(x, 1.8, z), {
      radius: 1.55,
      hp: 4,
      maxHp: 4,
      phase: "hidden",
      timer: 0,
      appearAt: Infinity,
      size: 1,
    });
    view.model("rock", V(0, -0.6, 0), 1.9, cave.mesh);
    cave.mouth = view.sphere(V(0, 0.38, 1.5), V(1.08, 0.93, 0.35), 0x233c40, cave.mesh);
    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(1.03, 0.17, 5, 12, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0xc4c7b5, roughness: 1 }),
    );
    arch.position.set(0, 0.25, 1.62);
    arch.userData.disposable = true;
    cave.mesh.add(arch);
    cave.crew = view.model("enemy", V(0, -0.6, 1.65), 0.85, cave.mesh);
    cave.launcher = view.box(V(0, -0.2, 1.4), V(0.75, 0.48, 1.25), 0x9b6060, cave.mesh);
    cave.mesh.scale.setScalar(0.01);
    cave.crew.visible = false;
    cave.launcher.visible = false;
    cave.warningRing = view.ring(V(0, -0.65, 1.6), 1.3, 0xff705f, 0.08, cave.mesh);
    cave.signalDelay = (index % 2) * 0.7;
  }

  objective() {
    if (this.siege) return { ...this.siege.cfg.station, name: "HIGHWATER STATION", sector: "HOLD THE STATION" };
    if (this.rescued === this.soldiers.length)
      return { ...this.layout.landing, name: this.layout.landing.name, sector: "LAND HERE" };
    if (this.soldiers[this.selected]?.rescued || this.soldiers[this.selected]?.lift !== undefined)
      this.selected = Math.max(0, this.soldiers.findIndex((s) => !s.rescued && s.lift === undefined));
    const s = this.soldiers[this.selected];
    return { x: s.position.x, z: s.position.z, name: s.person || s.name, sector: this.layout.survivors[this.selected].sector };
  }

  select(index) {
    if (this.soldiers[index] && !this.soldiers[index].rescued) this.selected = index;
  }

  flare() {
    const g = this.game;
    if (g.paused || g.status !== "playing" || !this.gear.flares || this.flareCooldown > 0) return false;
    this.gear.flares--;
    this.countermeasures = 3;
    this.flareCooldown = 4;
    for (const shot of g.projectiles)
      if (shot.hostile && shot.missile && distance(shot.position, g.player.position) < 55) shot.distracted = true;
    for (let i = 0; i < 8; i++) {
      const p = g.player.position.clone().add(V((i % 2 ? 1 : -1) * 1.1, -0.3, 0.8));
      g.puff(p, 0xffe5a2, 0.28, 1.4, { x: (i % 2 ? 1 : -1) * (2 + i * 0.5), y: -1, z: 2 + i * 0.35 });
      // A burning flare head on each smoke trail.
      if (!g.reducedMotion) g.ember(p, 0xfff1b8, 0.45, 1.2, { x: (i % 2 ? 1 : -1) * (2 + i * 0.5), y: -1, z: 2 + i * 0.35 });
    }
    g.notify("toast", "FLARES / LOCK BROKEN");
    g.audio.play("pickup");
    return true;
  }

  collect(pickup) {
    const g = this.game;
    if (pickup.dead || g.status !== "playing") return;
    pickup.dead = true;
    g.view.disposeObject(pickup.mesh);
    if (pickup.kind === "health") g.shields = [3, 3, 3];
    const before = { ...this.gear };
    if (pickup.kind === "ammo") this.gear.rockets = Math.min(this.load.rockets + 10, this.gear.rockets + 10);
    if (pickup.kind === "support") {
      this.gear.guided = Math.min(this.load.guided + 6, this.gear.guided + 4);
      this.gear.flares = Math.min(this.load.flares + 2, this.gear.flares + 2);
    }
    const added = (key) => this.gear[key] - before[key];
    const rounds = ROUNDS[pickup.kind] ? pickup.kind : null;
    if (rounds) g.gainRounds(rounds);
    g.score += 60;
    g.audio.play("pickup");
    g.puff(pickup.position, 0x8ff3c7, 0.8);
    if (!rounds)
      g.notify(
        "toast",
        pickup.kind === "health"
          ? "SHIELDS RESTORED"
          : pickup.kind === "ammo"
            ? `ROCKETS +${added("rockets")}${added("rockets") ? "" : " / FULL"}`
            : `GUIDED +${added("guided")} / FLARES +${added("flares")}`,
      );
  }

  update(dt) {
    const g = this.game;
    this.say("start");
    this.countermeasures = Math.max(0, this.countermeasures - dt);
    this.flareCooldown = Math.max(0, this.flareCooldown - dt);
    this.baseCooldown = Math.max(0, this.baseCooldown - dt);
    if (this.rotor) this.rotor.rotation.y += dt * 35;
    if (this.tailRotor) this.tailRotor.rotation.x += dt * 44;
    this.labels = [];
    const heli = g.player.position;
    for (const e of g.entities) {
      if (e.dead) continue;
      const d = distance(e.position, heli);
      e.mesh.visible = d < 80;
      if (e.type === "cave" && d < 46 && !Number.isFinite(e.appearAt)) e.appearAt = g.time + e.signalDelay;
      if (e.type === "pickup") {
        e.body.rotation.y += dt * 0.35;
        e.position.y = (e.baseY ?? LAND + 0.1) + Math.sin(g.time * 2 + e.position.z) * 0.07;
        // Fly through a crate to take it.
        if (d < 4) this.collect(e);
        continue;
      }
      // The siege's sappers and Marrow act wherever Lantern is.
      if (e.sapper) {
        this.updateSapper(e, dt);
        continue;
      }
      if (e.type === "gunship") {
        this.updateBoss(e, dt, d);
        continue;
      }
      if (d > 64) continue;
      if (e.type === "enemy") this.updateSoldier(e, dt, d);
      else if (e.type === "missile-site") this.updateSite(e, dt, d);
      else if (e.type === "missile-truck") this.updateTruck(e, dt, d);
      else if (e.type === "aa-truck") this.updateFlak(e, dt, d);
      else if (e.type === "drone-pad") this.updatePad(e, dt, d);
      else if (e.type === "drone") this.updateDrone(e, dt, d);
      else if (e.type === "barracks") this.updateBarracks(e, dt, d);
      else if (e.type === "cannon") this.updateCannon(e, dt, d);
    }
    this.updateCaves(dt);
    this.updateSurvivors(dt);
    this.updateBases(dt);
    if (this.siege) this.updateSiege(dt);
    this.updateMarks();
    g.entities = g.entities.filter((e) => !e.dead || e.fallTime !== undefined);
  }

  // A shot at Lantern from a unit: a bullet (with a little lead), or a homing missile.
  shoot(e, lift, missile = false) {
    const g = this.game;
    const origin = e.position.clone().add(V(0, lift, 0));
    g.spawnShot(origin, g.player.position.clone().addScaledVector(g.velocity, missile ? 0 : 0.3), missile, true);
    if (missile) {
      g.flash(origin, 0xffc27a, 1.1);
      g.puff(origin, 0x8d8791, 0.6, 1);
    }
  }

  moveTowards(e, x, z, speed, dt) {
    const dx = x - e.position.x,
      dz = z - e.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return true;
    const step = Math.min(d, speed * dt);
    e.position.x += (dx / d) * step;
    e.position.z += (dz / d) * step;
    e.mesh.rotation.y = dampAngle(e.mesh.rotation.y, Math.atan2(-dx, -dz), 10, dt);
    return d <= step + 0.05;
  }

  faceHeli(e, dt) {
    const p = this.game.player.position;
    e.mesh.rotation.y = dampAngle(e.mesh.rotation.y, Math.atan2(-(p.x - e.position.x), -(p.z - e.position.z)), 6, dt);
  }

  updateSoldier(e, dt, d) {
    const spec = THREATS.soldier;
    e.running = false;
    // Anyone who arrived without orders holds where they stand.
    e.home ??= { x: e.position.x, z: e.position.z };
    e.range ??= spec.range;
    e.cooldown ??= spec.every;
    if (!e.alert && d < spec.detect) this.alarm(e);
    // A launch crew runs to its posts at the launcher and stays there.
    if (e.site) {
      if (!e.alert || e.state === "man") return;
      e.running = true;
      if (this.moveTowards(e, e.post.x, e.post.z, THREATS.site.crewSpeed, dt)) {
        e.state = "man";
        e.running = false;
      }
      return;
    }
    // Soldiers out of a barracks run to their spot first.
    if (e.rally) {
      e.running = true;
      if (this.moveTowards(e, e.rally.x, e.rally.z, spec.speed, dt)) {
        e.home = e.rally;
        e.rally = null;
      }
      return;
    }
    if (!e.alert) return;
    // Awake: sidestep about their post and fire at Lantern when she is in range.
    const t = this.game.time + e.home.x;
    e.position.x = e.home.x + Math.sin(t * 0.7) * 1.2;
    this.faceHeli(e, dt);
    e.cooldown -= dt;
    if (d < e.range && e.cooldown <= 0) {
      this.shoot(e, 1.1);
      e.cooldown = spec.every * this.game.mode.enemyReload;
    }
  }

  // A launch site fires only while a live crew member stands at its posts: the rack rises for
  // `prep` seconds, the missile goes, and another follows after `reload`. Kill the crew first
  // and the site never fires.
  updateSite(site, dt, d) {
    const g = this.game,
      spec = THREATS.site;
    if (!site.alert && d < spec.detect) this.alarm(site);
    const alive = site.crew.filter((c) => !c.dead);
    const manned = alive.filter((c) => c.state === "man");
    if (!alive.length && site.state !== "silent") {
      site.state = "silent";
      if (!site.fired) {
        g.score += 100;
        g.notify("toast", "LAUNCH CREW DOWN / +100");
        this.say("siteSilent");
      }
    }
    if (site.state === "idle" && manned.length) {
      site.state = "prep";
      site.timer = 0;
    }
    if (site.state === "prep") {
      if (!manned.length) site.state = "idle";
      else {
        site.timer += dt;
        this.labels.push({ id: `site-${site.uid}`, x: site.position.x, y: 4.2, z: site.position.z, text: `LAUNCH / ${Math.max(1, Math.ceil(spec.prep - site.timer))}s`, hot: true });
        if (site.timer >= spec.prep) {
          if (d < spec.range) {
            this.shoot(site, 2.4, true);
            site.fired = true;
          }
          site.state = "reload";
          site.timer = 0;
        }
      }
    } else if (site.state === "reload") {
      // The rack stays up: another missile every reload while someone mans it.
      site.timer += dt;
      if (!manned.length) site.state = "idle";
      else if (site.timer >= spec.reload * g.mode.enemyReload) {
        if (d < spec.range) this.shoot(site, 2.4, true);
        site.timer = 0;
      }
    }
    const raised = site.state === "prep" ? smooth(site.timer / spec.prep) : site.state === "reload" ? 1 : 0;
    if (site.rack) site.rack.rotation.x = THREE.MathUtils.damp(site.rack.rotation.x, raised * RACK.site, 5, dt);
    site.warning.visible = site.state === "prep" || site.state === "reload";
    site.warning.material.opacity = 0.35 + Math.sin(g.time * 12) * 0.3;
  }

  // A missile truck drives its road; when it sees Lantern it stops, raises its rack for five
  // seconds and fires, lowers it, and drives on. Kill it any time: before it fires is best.
  updateTruck(t, dt, d) {
    const spec = THREATS.truck;
    if (!t.alert && d < spec.detect) this.alarm(t);
    t.cool = Math.max(0, t.cool - dt);
    if (t.state === "drive") {
      this.patrol(t, spec.speed, dt);
      if (t.alert && d < spec.detect && t.cool <= 0) {
        t.state = "erect";
        t.timer = 0;
      }
    } else if (t.state === "erect") {
      t.timer += dt;
      this.labels.push({ id: `truck-${t.uid}`, x: t.position.x, y: 3.6, z: t.position.z, text: `LAUNCH / ${Math.max(1, Math.ceil(spec.erect - t.timer))}s`, hot: true });
      if (t.timer >= spec.erect) {
        if (d < spec.range) {
          this.shoot(t, 2.2, true);
          t.fired = true;
        }
        t.state = "lower";
        t.timer = 0;
      }
    } else if (t.state === "lower") {
      t.timer += dt;
      if (t.timer >= spec.lower) {
        t.state = "drive";
        t.cool = spec.drive * this.game.mode.enemyReload;
      }
    }
    const raised = t.state === "erect" ? smooth(t.timer / spec.erect) : t.state === "lower" ? 1 - smooth(t.timer / spec.lower) : 0;
    if (t.rack) t.rack.rotation.x = raised * RACK.truck;
    t.warning.visible = t.state === "erect";
    t.warning.material.opacity = 0.35 + Math.sin(this.game.time * 12) * 0.3;
  }

  // Back and forth along a route.
  patrol(t, speed, dt) {
    const [x, z] = t.route[t.leg];
    if (this.moveTowards(t, x, z, speed, dt)) {
      if (t.leg === t.route.length - 1 || t.leg === 0) t.dir = t.leg === 0 ? 1 : -1;
      t.leg = clamp(t.leg + (t.dir ?? 1), 0, t.route.length - 1);
    }
  }

  updateFlak(t, dt, d) {
    const g = this.game,
      spec = THREATS.flak;
    this.patrol(t, spec.speed, dt);
    if (t.turretNode) t.turretNode.rotation.y = Math.atan2(t.position.x - g.player.position.x, t.position.z - g.player.position.z) - t.mesh.rotation.y;
    if (d > t.range) return;
    t.cooldown -= dt;
    t.warning.material.opacity = t.cooldown < 0.9 ? 0.7 : 0.12;
    if (t.cooldown <= 0) {
      // A short burst of three.
      for (let i = 0; i < 3; i++) this.shoot(t, 1.6 + i * 0.15);
      t.cooldown = spec.every * g.mode.enemyReload;
    }
  }

  // A drone station: once it sees Lantern its drones spin up and lift after five seconds. Hit
  // it before then and they never fly.
  updatePad(pad, dt, d) {
    const g = this.game,
      spec = THREATS.pad;
    if (!pad.alert && d < spec.detect) this.alarm(pad);
    if (pad.state === "idle" && pad.alert) {
      pad.state = "spin";
      pad.timer = 0;
    }
    if (pad.state === "spin") {
      pad.timer += dt;
      const u = smooth(pad.timer / spec.launch);
      for (const [i, drone] of pad.parked.entries()) {
        drone.position.y = CRADLE_Y + 0.26 * PARKED + u * 1.1 + Math.sin(g.time * 9 + i) * 0.05 * u;
        if (drone.userData.rotor) drone.userData.rotor.rotation.y += dt * (8 + u * 40);
      }
      this.labels.push({ id: `pad-${pad.uid}`, x: pad.position.x, y: 3.4, z: pad.position.z, text: `DRONES / ${Math.max(1, Math.ceil(spec.launch - pad.timer))}s`, hot: true });
      if (pad.timer >= spec.launch) {
        pad.state = "empty";
        for (const drone of pad.parked) {
          const at = drone.getWorldPosition(V());
          g.view.disposeObject(drone);
          const e = g.entity("drone", "drone", at, { hp: THREATS.drone.hp, radius: 1, cooldown: 2, range: THREATS.drone.range, climb: 0, from: at.y, alert: true });
          e.home = V(at.x, 7.7, at.z);
        }
        pad.parked = [];
        this.say("drones");
      }
    }
    pad.warning.visible = pad.state === "spin";
    pad.warning.material.opacity = 0.35 + Math.sin(g.time * 12) * 0.3;
  }

  updateDrone(e, dt, d) {
    const g = this.game;
    if (e.rotor === undefined) e.rotor = e.mesh.getObjectByName("DroneRotor") || null;
    if (e.rotor) e.rotor.rotation.y += dt * 32;
    // Freshly launched drones climb before they hunt.
    if (e.climb !== undefined && e.climb < 1) {
      e.climb = Math.min(1, e.climb + dt / THREATS.pad.climb);
      e.position.y = e.from + (7.7 - e.from) * smooth(e.climb);
      return;
    }
    const goal = d < 32 ? g.player.position : e.home;
    const dir = goal.clone().sub(e.position).setY(0);
    if (dir.length() > 10) e.position.addScaledVector(dir.normalize(), dt * 3.3);
    e.position.y = 7.7 + Math.sin(g.time * 2 + e.position.z) * 0.4;
    if (d > e.range) return;
    e.cooldown -= dt;
    if (e.cooldown <= 0) {
      this.shoot(e, 0);
      e.cooldown = THREATS.drone.every * g.mode.enemyReload;
    }
  }

  // Once the alarm is up, barracks send their soldiers out one by one to fight.
  updateBarracks(b, dt, d) {
    const spec = THREATS.barracks;
    if (!b.alert && d < spec.detect) this.alarm(b);
    if (!b.alert || b.crewLeft <= 0) return;
    b.timer -= dt;
    if (b.timer > 0) return;
    b.timer = spec.every * this.game.mode.enemyReload;
    const n = b.crewLeft--;
    const door = { x: b.position.x + b.facing * 2.4, z: b.position.z };
    const e = this.soldier(door.x, door.z);
    e.alert = true;
    e.rally = { x: b.position.x + b.facing * (6 + (n % 2) * 2), z: b.position.z + ((n % 3) - 1) * 3 };
  }

  updateCannon(e, dt, d) {
    const g = this.game;
    if (e.turretNode === undefined) {
      let node = null;
      e.mesh.traverse((child) => {
        if (!child.isMesh && /^Turret[._\d]*$/.test(child.name)) node = child;
      });
      e.turretNode = node;
    }
    if (e.turretNode) e.turretNode.rotation.y = Math.atan2(e.position.x - g.player.position.x, e.position.z - g.player.position.z);
    if (d > e.range) return;
    e.cooldown -= dt;
    if (e.warning) e.warning.material.opacity = e.cooldown < 0.9 ? 0.7 : 0.12;
    if (e.cooldown <= 0) {
      this.shoot(e, 1);
      e.cooldown = THREATS.cannon.every * g.mode.enemyReload;
    }
  }

  // ------------------------------------------------------------------ people and bases
  // How many enemy on the ground still pin a signal down.
  guards(s) {
    let n = 0;
    for (const e of this.game.entities)
      if (isHostileEntity(e) && PINS.has(e.type) && distance(e.position, s.position) < PIN_RADIUS) n++;
    return n;
  }

  // Fly over a signal and the soldier rides a line up into Lantern: no hovering, no winch. A
  // signal still pinned by enemy close around it waits until they are cleared.
  updateSurvivors(dt) {
    const g = this.game,
      heli = g.player.position;
    this.cable.visible = false;
    for (const [i, s] of this.soldiers.entries()) {
      if (s.rescued) continue;
      if (s.lift === undefined) {
        if (s.wave) s.wave.rotation.z = Math.sin(g.time * 4) * 0.25;
        s.marker.material.opacity = 0.45 + Math.sin(g.time * 3) * 0.15;
        const near = distance(s.position, heli);
        s.pinned = this.guards(s);
        s.marker.material.color.set(s.pinned ? 0xff4b2b : 0x65f3b0);
        if (near < 42)
          this.labels.push({
            id: `signal-${i}`,
            x: s.position.x,
            y: 3.2,
            z: s.position.z,
            text: s.pinned ? `PINNED / ${s.pinned}` : `FLY OVER / ${(s.person || s.name).split(" ").pop().toUpperCase()}`,
            hot: Boolean(s.pinned),
          });
        if (g.status === "playing" && !s.pinned && near < PICKUP_RADIUS) {
          s.lift = 0;
          s.from = s.position.clone();
          s.marker.visible = false;
          g.audio.play("pickup");
        }
        continue;
      }
      s.lift += dt / LIFT_SECONDS;
      const u = smooth(s.lift);
      s.position.lerpVectors(s.from, heli.clone().add(V(0, -1, 0)), u);
      s.mesh.scale.setScalar(Math.max(0.3, 1 - u * 0.6));
      this.cable.position.set(s.position.x, (s.position.y + heli.y) / 2, s.position.z);
      this.cable.scale.y = Math.max(0.1, heli.y - s.position.y);
      this.cable.visible = true;
      if (s.lift >= 1) {
        s.rescued = true;
        s.dead = true;
        g.view.disposeObject(s.mesh);
        this.rescued++;
        g.score += 350;
        g.notify("toast", this.rescued === this.soldiers.length ? `ALL ABOARD / LAND AT ${this.layout.landing.name}` : `${(s.person || s.name).toUpperCase()} ABOARD`);
        if (this.rescued === this.soldiers.length) this.say("pickup");
        this.objective();
      }
    }
  }

  // Over a friendly pad Lantern is repaired and rearmed; with everyone aboard, the landing base
  // takes her in: she settles onto the pad and the sortie is over.
  updateBases(dt) {
    const g = this.game,
      heli = g.player.position,
      { start, landing } = this.layout;
    const aboard = !this.siege && this.rescued === this.soldiers.length;
    if (this.landing) {
      this.landing.t += dt;
      const u = smooth(this.landing.t / LAND_SECONDS);
      heli.x = this.landing.from.x + (landing.x - this.landing.from.x) * u;
      heli.z = this.landing.from.z + (landing.z - this.landing.from.z) * u;
      this.vehicle.height = RESCUE_HEIGHT - (RESCUE_HEIGHT - 2.4) * u;
      g.velocity.multiplyScalar(0.8);
      this.state = "LANDING";
      if (this.landing.t >= LAND_SECONDS && g.status === "playing") {
        this.say("success");
        g.finish(true);
      }
      return;
    }
    // In the siege only the camp pad repairs: leaving the station is the price.
    for (const base of this.siege ? [landing] : [start, landing]) {
      if (distance(heli, base) > LAND_RADIUS) continue;
      if (base === landing && aboard && g.status === "playing") {
        this.landing = { t: 0, from: heli.clone() };
        return;
      }
      const needs = g.shields.some((s) => s < 3) || Object.keys(this.load).some((k) => this.gear[k] < this.load[k]);
      if (needs && this.baseCooldown <= 0) {
        g.shields = [3, 3, 3];
        this.gear = rearm(this.gear, this.load);
        this.baseCooldown = REPAIR_COOLDOWN;
        g.notify("toast", "BASE / REPAIRED AND REARMED");
      }
    }
    if (this.siege) return;
    this.state = aboard
      ? "ALL ABOARD / LAND"
      : this.soldiers.some((s) => s.lift !== undefined && !s.rescued)
        ? "PICKING UP"
        : "EN ROUTE";
  }

  updateMarks() {
    const g = this.game,
      items = [];
    for (const e of g.entities) {
      if (!isHostileEntity(e) || e.type === "drone" || e.type === "cave") continue;
      if (distance(e.position, g.player.position) > 60) continue;
      const style = MARKS[e.type] || null;
      if (style) items.push({ x: e.position.x, y: LAND + 0.1, z: e.position.z, ...style });
    }
    this.ripples.update(g.time, items);
  }

  // What a kill leaves: a launch site, truck or station goes up with a crater of holes where it
  // stood; everything big throws pieces into the sky and smokes.
  onKill(e) {
    const g = this.game;
    const at = e.position.clone();
    const colours = WRECK[e.type];
    if (colours) {
      const power = { "missile-site": 1.6, "missile-truck": 1.3, "drone-pad": 1.4, barracks: 1.5, "aa-truck": 1.1, cannon: 0.9, drone: 0.8 }[e.type] || 1;
      g.shatter(at.clone().add(V(0, 1, 0)), colours, Math.round(10 * power), power);
      if (e.type !== "drone") g.smokeColumn(at, e.type === "barracks" ? 5 : 4, power, V(0, 1, 0));
    }
    if (["missile-site", "missile-truck", "drone-pad", "barracks", "aa-truck", "cannon"].includes(e.type))
      g.crater(V(at.x, LAND, at.z), { "missile-site": 3.2, "drone-pad": 3, barracks: 3.4, "missile-truck": 2.6 }[e.type] ?? 2);
    if (e.type === "missile-site") {
      for (const c of e.crew) if (!c.dead && distance(c.position, at) < 6) g.kill(c);
      if (!e.fired) g.notify("toast", "LAUNCHER DESTROYED BEFORE LAUNCH");
    }
    if (e.type === "missile-truck" && !e.fired) {
      g.score += 150;
      g.notify("toast", "EARLY KILL / +150");
    }
    if (e.type === "drone-pad" && e.parked.length) {
      for (const drone of e.parked) g.shatter(drone.getWorldPosition(V()), WRECK.drone, 5, 0.7);
      g.score += 60 * e.parked.length;
      g.notify("toast", `DRONES GROUNDED / +${60 * e.parked.length}`);
      e.parked = [];
    }
    if (e.type === "gunship" && this.siege) {
      this.siege.bossDown = true;
      g.score += 1500;
      g.shatter(at, [0x2f86e8, 0x2f2c35, 0xff4b2b, 0xd8c6aa], 24, 2);
      g.smokeColumn(V(at.x, LAND, at.z), 6, 1.6, V(0, 1, 0));
      g.notify("toast", "MARROW IS DOWN / +1500");
      this.say("bossDown");
    }
    if (e.type === "barracks" && e.crewLeft > 0) {
      g.score += 50 * e.crewLeft;
      g.notify("toast", `BARRACKS DOWN / ${e.crewLeft} INSIDE`);
      e.crewLeft = 0;
    }
  }

  say(key) {
    if (this.said.has(key)) return;
    const line = this.story?.radio?.[key];
    if (!line) return;
    this.said.add(key);
    this.game.radio(line);
  }

  updateCaves(dt) {
    const g = this.game;
    for (const e of g.entities) {
      if (e.type !== "cave" || e.dead || e.phase === "disabled") continue;
      if (e.position.distanceTo(g.player.position) > 48) continue;
      e.age += dt;
      if (e.phase === "hidden") {
        if (g.time >= e.appearAt) {
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
        g.spawnShot(g.targetPosition(e).add(V(0, 0.8, 0)), g.player.position.clone(), true, true);
        e.timer = 2.5;
      }
      if (e.phase === "launcher")
        this.labels.push({ id: `cave-${e.position.x}-${e.position.z}`, x: e.position.x, y: 3.6, z: e.position.z, text: `LAUNCH / ${Math.max(1, Math.ceil(5 - e.timer))}s`, hot: true });
      if (e.crew.visible) {
        e.crew.position.y = -0.6 + Math.min(e.timer, 1) * 0.15;
        e.crew.rotation.x = e.phase === "enemy" ? Math.max(0, 1 - e.timer) * 0.9 : 0;
      }
      e.warningRing.visible = e.phase === "launcher";
      if (e.warningRing.visible) e.warningRing.material.opacity = 0.3 + Math.sin(g.time * 7) * 0.25;
    }
  }

  // A landed hit collapses the cave mouth for good (a blast and a scorched crater); missiles
  // already in the air keep flying.
  disableCave(e, rocket) {
    const g = this.game;
    e.phase = "disabled";
    e.timer = 0;
    e.mouth.scale.set(0.9, 0.2, 0.2);
    e.crew.visible = false;
    e.launcher.visible = false;
    e.warningRing.visible = false;
    g.score += rocket ? 150 : 100;
    g.kills++;
    const at = g.targetPosition(e);
    g.blast(at, 2.6, 0xffd36b);
    g.shatter(at, [0x9c7552, 0x2f2c35, 0xff4b2b], 8, 1);
    g.smokeColumn(at.clone(), 4, 1, V(0, 0.5, 0));
    g.crater(V(e.position.x, LAND, e.position.z + 2.2), 2);
  }

  stars(success) {
    if (!success) return 0;
    // Hits taken, not damage points (harder modes make a hit cost more).
    const hits = this.game.hitsTaken;
    // The siege: a star for the win, one for the station kept above 70 %, one for at most two hits.
    if (this.siege) return 1 + (this.siege.integrity / this.siege.max >= 0.7 ? 1 : 0) + (hits <= 2 ? 1 : 0);
    return hits === 0 ? 3 : hits <= 1 ? 2 : 1;
  }

  finishBonus() {
    return 300 + this.game.shields.reduce((a, b) => a + b, 0) * 40;
  }

  snapshot() {
    const g = this.game,
      objective = this.objective();
    return {
      mode: "rescue",
      rescued: this.rescued,
      total: this.soldiers.length,
      objective,
      distance: distance(g.player.position, objective),
      gear: { ...this.gear },
      state: this.state,
      flareCooldown: this.flareCooldown,
      labels: this.labels,
      progress: this.siege ? Math.min(0.99, this.siege.gate) : rescueProgress(this.rescued, this.soldiers.length, distance(g.player.position, this.layout.landing)),
      siege: this.siege
        ? { gate: this.siege.gate, integrity: this.siege.integrity / this.siege.max, boss: this.siege.boss && !this.siege.boss.dead ? this.siege.boss.hp / this.siege.boss.maxHp : null, bossDown: this.siege.bossDown }
        : null,
    };
  }
}

