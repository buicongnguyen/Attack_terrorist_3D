import * as THREE from "three";
import {
  STRIKE_MISSIONS,
  FLIGHT,
  BOMBS,
  BOMB_ORDER,
  CITY,
  WALK,
  GRAVITY,
  resolveBuildings,
  buildBlocks,
  buildingById,
  buildingAt,
  planEnemies,
  sampleRoute,
  samplePath,
  rallyStatus,
  formationSlots,
  stepBomb,
  forecastImpact,
  blockHits,
  blocksNear,
  lineBlocked,
  surfaceBelow,
  scatterPattern,
  scatterCentre,
  shelterStruck,
  forecastPoints,
  pathBetween,
  timeline,
  storyY,
  comboBonus,
  strikeStars,
  convoyRoute,
  resolvePlace,
  lerp3,
} from "./strike-data.js";
import { CityView } from "./city.js";
import { MISSION_STORY } from "./story.js";
import { clamp } from "./physics.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const forward = V(0, 0, -1);
const LIVERY = ["#ffc62b", "#ff8a6b", "#33d69f"];
const HIDE_SECONDS = 12;
// Flak telegraphs for 1.5 s; one volley can hurt an aircraft at most once.
const FLAK = { range: 13, lock: 1.5, speed: 34, burst: 2.1, cooldown: 3.8, grace: 3.5 };

const markerCache = new Map();
function markerMaterial(kind) {
  if (markerCache.has(kind)) return markerCache.get(kind);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const c = canvas.getContext("2d");
  const fill = { enemy: "#ff4b2b", officer: "#ffc62b", hidden: "#ff9f1c", truck: "#ff4b2b" }[kind];
  c.translate(32, 32);
  c.rotate(Math.PI / 4);
  c.fillStyle = "#1a1420";
  c.fillRect(-19, -19, 38, 38);
  c.fillStyle = fill;
  c.fillRect(-14, -14, 28, 28);
  c.rotate(-Math.PI / 4);
  c.fillStyle = "#1a1420";
  c.font = "bold 22px Arial";
  c.textAlign = "center";
  c.textBaseline = "middle";
  if (kind === "officer") c.fillText("★", 0, 1);
  if (kind === "hidden") c.fillText("!", 0, 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
  });
  markerCache.set(kind, material);
  return material;
}

export class StrikeOperation {
  constructor(game) {
    const g = (this.game = game),
      view = g.view;
    this.layout = STRIKE_MISSIONS[g.index];
    this.story = MISSION_STORY[g.index];
    this.buildings = resolveBuildings(this.layout);
    this.blocks = buildBlocks(this.buildings);
    this.maxFloor = Math.max(...this.buildings.map((b) => b.floors)) + 1;
    // Floor tiles by building, storey and grid cell: support checks are O(1) per person.
    this.tileSize = (CITY.half * 2) / CITY.tiles;
    this.slabs = new Map();
    for (const block of this.blocks)
      if (block.kind === "slab" || block.kind === "roof")
        this.slabs.set(this.tileKey(block.b, block.f, block.min[0] + 0.01, block.min[2] + 0.01), block);
    this.city = new CityView(view, this.layout, this.buildings, this.blocks, g.index);
    this.flight = {
      x: FLIGHT.entryX + 16,
      lane: 3,
      speed: FLIGHT.speed,
      lateral: 0,
      phase: "pass",
      turn: 0,
      spacing: FLIGHT.tight,
      wide: false,
      pass: 1,
    };
    this.floor = 1;
    this.bombs = [];
    this.shells = [];
    this.used = 0;
    this.damaged = false;
    this.combo = { count: 0, timer: 0 };
    this.said = new Set();
    this.forecastTimer = 0;
    this.emptyTimer = 0;
    const slots = formationSlots(this.layout.aircraft.length, FLIGHT.tight);
    this.aircraft = this.layout.aircraft.map((a, i) => this.createAircraft(a, i, slots[i]));
    this.selected = BOMB_ORDER.find((kind) => this.aircraft.some((a) => a.payload[kind] > 0));
    const { plans, events } = planEnemies(this.layout, this.buildings);
    this.events = events.map((e) => ({ ...e, fired: false, ring: null }));
    this.enemies = plans.map((plan) => this.createEnemy(plan));
    this.aa = this.layout.aa.map((place, i) => this.createFlak(place, i));
    this.masts = this.layout.masts.map((place) => this.createMast(place));
    this.trucks = this.createConvoy();
    for (const event of this.events) {
      event.ring = view.ring(V(event.centre.x, event.centre.y + 0.08, event.centre.z), 2.6, 0xffc62b, 0.22);
      event.ring.renderOrder = 6;
    }
    this.lockBeam = this.beam(0xff3b3b);
  }

  // ------------------------------------------------------------------ setup

  createAircraft(data, i, slot) {
    const view = this.game.view;
    const mesh = view.model(view.assets.has("bomber") ? "bomber" : "plane", V(), 0.72);
    mesh.rotation.y = -Math.PI / 2;
    mesh.traverse((child) => {
      if (child.isMesh && child.material?.name === "Livery") {
        child.material = child.material.clone();
        child.material.color.set(LIVERY[i]);
        child.userData.ownedMaterial = true;
      }
    });
    const arc = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.5, gapSize: 0.35, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    arc.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(200 * 3), 3));
    arc.frustumCulled = false;
    arc.renderOrder = 8;
    arc.userData.disposable = true;
    view.level.add(arc);
    const pipper = new THREE.Group();
    const inner = view.ring(V(), 0.95, 0xffffff, 0.2, pipper);
    const outer = view.ring(V(), 1, 0xffffff, 0.08, pipper);
    for (const r of [inner, outer]) {
      r.material.depthTest = false;
      r.renderOrder = 9;
    }
    for (const angle of [0, Math.PI / 2]) {
      const tick = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 0.12),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
      );
      tick.rotation.set(-Math.PI / 2, 0, angle);
      tick.renderOrder = 9;
      tick.userData.disposable = true;
      pipper.add(tick);
    }
    view.level.add(pipper);
    return {
      ...data,
      payload: { ...data.payload },
      index: i,
      slot: { ...slot },
      hp: 3,
      maxHp: 3,
      alive: true,
      exit: 0,
      cooldown: 0,
      pylon: 0,
      smoke: 0,
      mesh,
      props: ["PropellerL", "PropellerR"].map((n) => mesh.getObjectByName(n)).filter(Boolean),
      pylons: ["PylonL", "PylonR", "PylonC"].map((n) => mesh.getObjectByName(n)).filter(Boolean),
      arc,
      pipper,
      pipperInner: inner,
      pipperOuter: outer,
      forecast: null,
      velocity: V(),
    };
  }

  createEnemy(plan) {
    const g = this.game;
    const p = sampleRoute(plan.route, 0);
    const e = g.opponent(V(p.x, p.y, p.z), { radius: 0.6, scale: 0.95 });
    e.plan = plan;
    e.state = "route";
    e.cur = { b: p.b, f: p.f };
    e.officer = Boolean(plan.officer);
    if (e.officer)
      e.mesh.traverse((child) => {
        if (child.isMesh && child.material?.name === "Hostile accent") {
          child.material = child.material.clone();
          child.material.color.set("#ffc62b");
          child.userData.ownedMaterial = true;
        }
      });
    e.marker = new THREE.Sprite(markerMaterial(e.officer ? "officer" : "enemy"));
    e.marker.scale.setScalar(0.85);
    e.marker.position.set(0, 2.25, 0);
    e.marker.renderOrder = 12;
    e.mesh.add(e.marker);
    e.hidden = false;
    return e;
  }

  createFlak(place, i) {
    const g = this.game,
      p = resolvePlace(this.buildings, place);
    const model = g.view.assets.has("aa-nest") ? "aa-nest" : "cannon";
    const nest = g.entity("aa", model, V(p.x, p.y, p.z), { hp: 1, radius: 1.3 });
    nest.cur = { b: p.b, f: p.f };
    nest.state = "idle";
    nest.cooldown = FLAK.grace + i * 1.2;
    nest.lock = 0;
    nest.turret = nest.mesh.getObjectByName("Turret");
    nest.warning = g.view.ring(V(0, 0.08, 0), 2.1, 0xff3b3b, 0.16, nest.mesh);
    nest.warning.material.opacity = 0.15;
    return nest;
  }

  createMast(place) {
    const g = this.game,
      p = resolvePlace(this.buildings, place);
    const model = g.view.assets.has("relay-mast") ? "relay-mast" : "beacon";
    const mast = g.entity("mast", model, V(p.x, p.y, p.z), { hp: 1, radius: 1.2 });
    mast.cur = { b: p.b, f: p.f };
    mast.dish = mast.mesh.getObjectByName("Dish");
    mast.light = [];
    mast.mesh.traverse((child) => {
      if (child.isMesh && child.material?.name === "Beacon light") {
        child.material = child.material.clone();
        child.userData.ownedMaterial = true;
        mast.light.push(child.material);
      }
    });
    mast.ring = g.view.ring(V(0, 0.08, 0), 1.8, 0xff4b2b, 0.14, mast.mesh);
    return mast;
  }

  createConvoy() {
    const convoy = this.layout.convoy;
    if (!convoy) return [];
    const g = this.game;
    const probe = convoyRoute(convoy.points, convoy.speed);
    return Array.from({ length: convoy.count }, (_, i) => {
      // Trucks drive nose to tail (`gap` seconds apart) unless the layout spreads them out.
      const route = convoyRoute(convoy.points, convoy.speed, i * (convoy.gap ?? probe.period / convoy.count));
      const p = sampleRoute(route, 0);
      const model = g.view.assets.has("technical") ? "technical" : "aa-truck";
      const truck = g.entity("truck", model, V(p.x, p.y, p.z), { hp: 2, radius: 1.5 });
      truck.route = route;
      truck.turret = truck.mesh.getObjectByName("Turret") || truck.mesh.getObjectByName("TruckTurret");
      truck.marker = new THREE.Sprite(markerMaterial("truck"));
      truck.marker.scale.setScalar(1.1);
      truck.marker.position.set(0, 3, 0);
      truck.marker.renderOrder = 12;
      truck.mesh.add(truck.marker);
      return truck;
    });
  }

  beam(color) {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([V(), V(0, 1, 0)]),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85, depthTest: false }),
    );
    line.renderOrder = 10;
    line.frustumCulled = false;
    line.visible = false;
    line.userData.disposable = true;
    this.game.view.level.add(line);
    return line;
  }

  say(key) {
    if (this.said.has(key)) return;
    const line = this.story?.radio?.[key];
    if (!line) return;
    this.said.add(key);
    this.game.radio(line);
  }

  // ------------------------------------------------------------------ player actions

  select(kind) {
    if (!BOMBS[kind] || !this.aircraft.some((a) => a.alive && a.payload[kind] > 0)) return false;
    this.selected = kind;
    this.forecastTimer = 0;
    return true;
  }

  setFloor(value) {
    this.floor = clamp(Math.round(value), 1, this.maxFloor);
    this.forecastTimer = 0;
  }

  toggleFormation() {
    this.flight.wide = !this.flight.wide;
    this.forecastTimer = 0;
  }

  kindFor(aircraft) {
    if (aircraft.payload[this.selected] > 0) return this.selected;
    return BOMB_ORDER.find((kind) => aircraft.payload[kind] > 0) || null;
  }

  canRelease() {
    return this.game.status === "playing" && !this.game.paused && this.flight.phase === "pass";
  }

  release(kind = this.selected) {
    if (!this.canRelease()) return false;
    const aircraft = this.aircraft.find((a) => a.alive && a.payload[kind] > 0 && a.cooldown <= 0);
    if (!aircraft) return false;
    this.drop(aircraft, kind);
    this.autoSelect();
    return true;
  }

  salvo() {
    if (!this.canRelease()) return false;
    let dropped = 0;
    for (const aircraft of this.aircraft) {
      if (!aircraft.alive || aircraft.cooldown > 0) continue;
      const kind = this.kindFor(aircraft);
      if (!kind) continue;
      this.drop(aircraft, kind);
      dropped++;
    }
    if (dropped > 1) this.game.notify("toast", `SALVO x${dropped}`);
    this.autoSelect();
    return dropped > 0;
  }

  autoSelect() {
    if (!this.aircraft.some((a) => a.alive && a.payload[this.selected] > 0)) {
      const next = BOMB_ORDER.find((kind) => this.aircraft.some((a) => a.alive && a.payload[kind] > 0));
      if (next) this.selected = next;
    }
  }

  releaseState(aircraft) {
    const pylon = aircraft.pylons[aircraft.pylon % Math.max(1, aircraft.pylons.length)];
    const origin = pylon
      ? pylon.getWorldPosition(V())
      : aircraft.mesh.position.clone().add(V(0, -0.6, 0));
    return {
      x: origin.x,
      y: origin.y,
      z: origin.z,
      vx: aircraft.velocity.x,
      vy: -1.2,
      vz: aircraft.velocity.z,
    };
  }

  drop(aircraft, kind) {
    const g = this.game,
      view = g.view;
    aircraft.mesh.updateMatrixWorld(true);
    const state = this.releaseState(aircraft);
    aircraft.forecast = { ...forecastImpact(this.blocks, this.buildings, state, kind, this.floor), kind };
    aircraft.pylon++;
    aircraft.payload[kind]--;
    aircraft.cooldown = FLIGHT.release;
    this.used++;
    g.shots++;
    const def = BOMBS[kind];
    const model = view.assets.has(def.model) ? def.model : "missile-friendly";
    const mesh = view.model(model, V(state.x, state.y, state.z), 1);
    const bomb = {
      kind,
      state,
      mesh,
      floor: this.floor,
      crossed: new Set(),
      time: 0,
      trail: 0,
      owner: aircraft,
      target: kind === "lance" ? this.lockTarget(aircraft.forecast?.impact) : null,
      dead: false,
    };
    this.bombs.push(bomb);
    g.audio.play("release");
  }

  lockTarget(point) {
    if (!point) return null;
    let best = null,
      bestDistance = 7;
    for (const t of this.targets()) {
      const d = Math.hypot(t.position.x - point.x, t.position.z - point.z);
      if (d < bestDistance) {
        bestDistance = d;
        best = t;
      }
    }
    return best;
  }

  targets() {
    return [
      ...this.trucks.filter((t) => !t.dead),
      ...this.masts.filter((t) => !t.dead),
      ...this.aa.filter((t) => !t.dead),
      ...this.enemies.filter((t) => !t.dead),
    ];
  }

  // ------------------------------------------------------------------ simulation

  update(dt) {
    const g = this.game;
    this.say("start");
    this.updateFlight(dt);
    this.updateEnemies(dt);
    this.checkSupport();
    this.updateTrucks(dt);
    this.updateMasts(dt);
    this.updateFlak(dt);
    this.updateBombs(dt);
    this.updateEvents();
    this.forecastTimer -= dt;
    if (this.forecastTimer <= 0) {
      this.forecastTimer = 0.07;
      this.updateForecasts();
    }
    if (this.combo.timer > 0) {
      this.combo.timer -= dt;
      if (this.combo.timer <= 0) this.closeCombo();
    }
    this.checkOutcome(dt);
    if (g.debrisActive) g.physics.world.step(dt);
  }

  updateFlight(dt) {
    const g = this.game,
      f = this.flight;
    const targetSpeed = clamp(FLIGHT.speed + g.input.x * 4, FLIGHT.minSpeed, FLIGHT.maxSpeed);
    f.speed += clamp(targetSpeed - f.speed, -FLIGHT.accel * dt, FLIGHT.accel * dt);
    f.lateral = THREE.MathUtils.damp(f.lateral, g.input.z * FLIGHT.lateral, 5, dt);
    f.lane = clamp(f.lane + f.lateral * dt, FLIGHT.laneMin, FLIGHT.laneMax);
    f.spacing = THREE.MathUtils.damp(f.spacing, f.wide ? FLIGHT.wide : FLIGHT.tight, 4, dt);
    if (f.phase === "pass") {
      f.x += f.speed * dt;
      if (f.x > FLIGHT.exitX) {
        f.phase = "turn";
        f.turn = FLIGHT.turnTime;
        f.pass++;
      }
    } else {
      f.turn -= dt;
      if (f.turn <= 0) {
        f.phase = "pass";
        f.x = FLIGHT.entryX;
      }
    }
    const slots = formationSlots(this.aircraft.length, f.spacing);
    for (const a of this.aircraft) {
      a.cooldown = Math.max(0, a.cooldown - dt);
      for (const prop of a.props) prop.rotation.z += dt * 55;
      if (!a.alive) {
        this.updateDowned(a, dt);
        continue;
      }
      const slot = slots[a.index];
      const bob = Math.sin(g.time * 1.6 + a.index * 1.3) * 0.18;
      const x = f.x + slot.x;
      a.velocity.set(f.phase === "pass" ? f.speed : 0, 0, f.lateral);
      a.mesh.position.set(x, FLIGHT.altitude + bob - a.index * 0.4, f.lane + slot.z);
      a.mesh.visible = f.phase === "pass";
      a.mesh.rotation.set(0, -Math.PI / 2, THREE.MathUtils.damp(a.mesh.rotation.z, f.lateral * 0.06, 6, dt));
      if (a.hp < a.maxHp) {
        a.smoke -= dt;
        if (a.smoke <= 0 && a.mesh.visible) {
          a.smoke = 0.08;
          g.puff(a.mesh.position.clone().add(V(-1.2, 0.2, 0)), 0x3b3440, 0.35, 0.9);
        }
      } else if (a.mesh.visible) {
        a.contrail = (a.contrail ?? a.index * 0.03) - dt;
        if (a.contrail <= 0) {
          a.contrail = 0.09;
          for (const side of [-1, 1])
            g.puff(a.mesh.position.clone().add(V(-2.4, 0.1, side * 3.1)), 0xffffff, 0.12, 0.35);
        }
      }
    }
  }

  // After the result is decided, ordnance already in the air still lands and aircraft still fly.
  settle(dt) {
    this.updateBombs(dt);
    this.updateFlak(dt);
    for (const a of this.aircraft) if (!a.alive) this.updateDowned(a, dt);
    if (this.combo.timer > 0) {
      this.combo.timer -= dt;
      if (this.combo.timer <= 0) this.closeCombo();
    }
  }

  updateDowned(a, dt) {
    if (!a.mesh.parent) return;
    a.exit += dt;
    a.mesh.position.x += dt * 12;
    a.mesh.position.y += dt * 4;
    a.mesh.position.z -= dt * 9;
    a.mesh.rotation.z += dt * 0.9;
    if (Math.floor(a.exit * 14) !== Math.floor((a.exit - dt) * 14))
      this.game.puff(a.mesh.position.clone(), 0x2f2c35, 0.5, 1.3);
    if (a.exit > 3.5) {
      this.game.view.disposeObject(a.mesh);
    }
  }

  currentPlace(e) {
    return { x: e.position.x, y: e.position.y, z: e.position.z, b: e.cur?.b ?? null, f: e.cur?.f ?? 0 };
  }

  updateEnemies(dt) {
    const g = this.game,
      t = g.time;
    for (const e of this.enemies) {
      if (e.dead) continue;
      let p = null;
      if (e.state === "route") p = sampleRoute(e.plan.route, t);
      else if (e.state === "hide" || e.state === "rejoin") {
        p = samplePath(e.path, t);
        if (p.done) {
          if (e.state === "hide" && t >= e.hideUntil) this.rejoin(e);
          else if (e.state === "rejoin") {
            const due = sampleRoute(e.plan.route, t);
            if (Math.hypot(due.x - p.x, due.y - p.y, due.z - p.z) > 0.6) {
              this.rejoin(e);
              continue;
            }
            e.state = "route";
            e.hidden = false;
            e.marker.material = markerMaterial(e.officer ? "officer" : "enemy");
          }
        }
      } else if (e.state === "fall") {
        e.fallSpeed = (e.fallSpeed || 0) + 16 * dt;
        e.position.y -= e.fallSpeed * dt;
        if (e.position.y <= e.fallTo) {
          e.position.y = e.fallTo;
          e.fallSpeed = 0;
          g.puff(e.position.clone().add(V(0, 0.3, 0)), 0xd9c3a0, 0.4, 0.6);
          if (e.falls > 1) {
            // Twice dropped through the floor: they give up the schedule and take cover downstairs.
            this.hide(e, true);
            e.hideUntil = Infinity;
          } else if (this.layout.alert) this.hide(e, true);
          else this.rejoin(e);
        }
        continue;
      }
      if (!p) continue;
      const moved = Math.hypot(p.x - e.position.x, p.z - e.position.z);
      e.position.set(p.x, p.y, p.z);
      e.cur = { b: p.b, f: p.f };
      if (moved > 0.0005) e.mesh.rotation.y = THREE.MathUtils.damp(e.mesh.rotation.y, p.heading, 10, dt);
      e.walking = moved > 0.0005;
      e.limbs?.forEach((limb, i) => {
        if (limb) limb.rotation.x = e.walking ? Math.sin(t * 9 + i * Math.PI) * 0.55 : Math.sin(t * 2 + i) * 0.05;
      });
    }
  }

  hide(e, force = false) {
    if (e.dead || (!force && (e.state === "hide" || e.state === "fall"))) return;
    const g = this.game;
    const from = this.currentPlace(e);
    const building = from.b
      ? buildingById(this.buildings, from.b)
      : this.buildings
          .filter((b) => b.kind !== "shelter")
          .sort(
            (a, b) =>
              Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z),
          )[0];
    const slot = (e.id ?? this.enemies.indexOf(e)) % 4;
    const spot = {
      x: building.x + [-2, 2, -1.6, 1.8][slot],
      y: storyY(0),
      z: building.z + [-1.8, -1.2, 1.4, 1.6][slot],
      b: building.id,
      f: 0,
    };
    e.path = timeline(pathBetween(this.layout, this.buildings, from, spot), WALK.run, g.time);
    e.state = "hide";
    e.hidden = true;
    e.hideUntil = e.path[e.path.length - 1].t + HIDE_SECONDS;
    e.marker.material = markerMaterial("hidden");
  }

  rejoin(e) {
    const g = this.game;
    const from = this.currentPlace(e);
    // Aim at where the schedule will be when the run ends, so the group reforms on time.
    let eta = 6;
    for (let i = 0; i < 5; i++) {
      const p = sampleRoute(e.plan.route, g.time + eta);
      e.path = timeline(
        pathBetween(this.layout, this.buildings, from, { x: p.x, y: p.y, z: p.z, b: p.b, f: p.f }),
        WALK.run,
        g.time,
      );
      const next = e.path[e.path.length - 1].t - g.time;
      if (Math.abs(next - eta) < 0.05) break;
      eta = next;
    }
    e.state = "rejoin";
  }

  updateTrucks(dt) {
    const g = this.game;
    for (const truck of this.trucks) {
      if (truck.dead) continue;
      const p = sampleRoute(truck.route, g.time);
      const heading = Math.atan2(p.x - truck.position.x, p.z - truck.position.z);
      if (Math.hypot(p.x - truck.position.x, p.z - truck.position.z) > 1e-4)
        truck.mesh.rotation.y = THREE.MathUtils.damp(truck.mesh.rotation.y, heading + Math.PI, 8, dt);
      truck.position.set(p.x, p.y, p.z);
      const lead = this.aircraft.find((a) => a.alive);
      if (truck.turret && lead) {
        const d = lead.mesh.position.clone().sub(truck.position);
        truck.turret.rotation.y = Math.atan2(-d.x, -d.z) - truck.mesh.rotation.y;
      }
    }
  }

  updateMasts(dt) {
    for (const mast of this.masts) {
      if (mast.dead) continue;
      if (mast.dish) mast.dish.rotation.y += dt * 1.4;
      const on = Math.sin(this.game.time * 6) > 0;
      for (const m of mast.light) m.emissiveIntensity = on ? 2.4 : 0.2;
      mast.ring.material.opacity = 0.35 + Math.sin(this.game.time * 4) * 0.2;
    }
  }

  updateFlak(dt) {
    const g = this.game;
    this.lockBeam.visible = false;
    this.flakLock = null;
    for (const nest of this.aa) {
      if (nest.dead) continue;
      nest.cooldown -= dt;
      const target = this.aircraft
        .filter((a) => a.alive && this.flight.phase === "pass")
        .map((a) => ({ a, d: Math.hypot(a.mesh.position.x - nest.position.x, a.mesh.position.z - nest.position.z) }))
        .filter((x) => x.d < FLAK.range + (nest.state === "lock" ? 4 : 0))
        .sort((x, y) => x.d - y.d)[0]?.a;
      if (nest.turret && target) {
        const d = target.mesh.position.clone().sub(nest.position);
        nest.turret.rotation.y = THREE.MathUtils.damp(nest.turret.rotation.y, Math.atan2(-d.x, -d.z), 6, dt);
      }
      if (nest.state === "idle" && target && nest.cooldown <= 0) {
        nest.state = "lock";
        nest.lock = FLAK.lock;
        nest.target = target;
        this.say("flak");
      }
      if (nest.state === "lock") {
        if (!target || !nest.target.alive || nest.target !== target) {
          nest.state = "idle";
          nest.cooldown = 0.6;
        } else {
          nest.lock -= dt;
          this.flakLock = nest.target;
          const positions = this.lockBeam.geometry.attributes.position;
          positions.setXYZ(0, nest.position.x, nest.position.y + 1.2, nest.position.z);
          positions.setXYZ(1, nest.target.mesh.position.x, nest.target.mesh.position.y, nest.target.mesh.position.z);
          positions.needsUpdate = true;
          this.lockBeam.visible = Math.sin(g.time * 30) > -0.3;
          nest.warning.material.opacity = 0.4 + Math.sin(g.time * 18) * 0.35;
          if (nest.lock <= 0) this.fireFlak(nest);
        }
      } else nest.warning.material.opacity = 0.14;
    }
    for (const shell of this.shells) {
      shell.age += dt;
      shell.mesh.position.addScaledVector(shell.velocity, dt);
      if (shell.age >= shell.fuse) {
        shell.dead = true;
        g.view.disposeObject(shell.mesh);
        g.blast(shell.mesh.position, 1.4, 0x2f2c35, { smoke: true, quiet: true });
        g.audio.play("flak");
        for (const a of this.aircraft)
          if (a.alive && !shell.volley.hit.has(a) && a.mesh.position.distanceTo(shell.mesh.position) < FLAK.burst) {
            shell.volley.hit.add(a);
            this.hitAircraft(a);
          }
      }
    }
    this.shells = this.shells.filter((s) => !s.dead);
  }

  fireFlak(nest) {
    const g = this.game;
    nest.state = "idle";
    nest.cooldown = FLAK.cooldown;
    const origin = nest.position.clone().add(V(0, 1.4, 0));
    const target = nest.target.mesh.position.clone();
    const tof = origin.distanceTo(target) / FLAK.speed;
    const lead = target.addScaledVector(nest.target.velocity, tof);
    const volley = { hit: new Set() };
    for (let i = 0; i < 3; i++) {
      const aim = lead.clone().add(V((i - 1) * 1.8, (i % 2) * 0.8, (i - 1) * 0.9));
      const mesh = g.view.sphere(origin.clone(), V(0.22, 0.22, 0.22), 0xffcc1f);
      this.shells.push({
        mesh,
        velocity: aim.clone().sub(origin).divideScalar(tof),
        fuse: tof,
        age: 0,
        dead: false,
        volley,
      });
    }
    g.audio.play("shot");
  }

  hitAircraft(a) {
    if (!a.alive) return;
    const g = this.game;
    a.hp--;
    this.damaged = true;
    g.shake = Math.max(g.shake, 0.25);
    g.audio.play("hit");
    if (a.hp <= 0) {
      a.alive = false;
      a.exit = 0;
      for (const key of Object.keys(a.payload)) a.payload[key] = 0;
      a.arc.visible = false;
      a.pipper.visible = false;
      g.radio({ who: a.crew === "iona" ? "iona" : a.crew, text: `${a.callsign} is hit! Breaking off.` });
      this.autoSelect();
    } else g.notify("toast", `${a.callsign.toUpperCase()} HIT`);
  }

  updateBombs(dt) {
    for (const bomb of this.bombs) {
      if (bomb.dead) continue;
      bomb.time += dt;
      const s = bomb.state;
      const a = { x: s.x, y: s.y, z: s.z };
      if (bomb.kind === "lance" && bomb.time > 0.3) this.steer(bomb, dt);
      stepBomb(s, dt);
      const b = { x: s.x, y: s.y, z: s.z };
      bomb.mesh.position.set(b.x, b.y, b.z);
      const dir = V(s.vx, s.vy, s.vz).normalize();
      if (dir.lengthSq()) bomb.mesh.quaternion.setFromUnitVectors(forward, dir);
      bomb.trail -= dt;
      if (bomb.trail <= 0) {
        bomb.trail = 0.05;
        this.game.puff(bomb.mesh.position, bomb.kind === "bomblet" ? 0xe5c7ff : 0xfff1d6, 0.14, 0.4);
      }
      if (bomb.kind === "drill") this.updateDrill(bomb, a, b);
      else if (bomb.kind === "scatter") {
        const below = surfaceBelow(this.buildings, this.blocks, b.x, b.z);
        const hit = blockHits(this.blocks, this.buildings, a, b)[0];
        if (hit || b.y <= below + BOMBS.scatter.burst) this.burst(bomb, hit ? lerp3(a, b, hit.t) : b);
      } else {
        const hit = blockHits(this.blocks, this.buildings, a, b)[0];
        if (hit) this.detonate(bomb, lerp3(a, b, hit.t));
      }
      if (!bomb.dead && b.y <= CITY.ground) {
        // Detonate at the exact ground crossing, the point the pipper forecast shows.
        const t = (a.y - CITY.ground) / Math.max(1e-6, a.y - b.y);
        this.detonate(bomb, lerp3(a, b, t));
      }
      if (!bomb.dead && bomb.time > 9) this.detonate(bomb, b);
    }
    this.bombs = this.bombs.filter((b) => !b.dead);
  }

  steer(bomb, dt) {
    const target = bomb.target;
    if (!target || target.dead) return;
    const s = bomb.state;
    const aim = target.position;
    // No-strike interlock: the seeker lets go rather than follow a target next to a shelter.
    if (shelterStruck(this.blocks, this.buildings, { x: aim.x, y: aim.y, z: aim.z }, "lance", 0.6)) {
      bomb.target = null;
      this.game.notify("toast", "LANCE INTERLOCK / NO-STRIKE ZONE");
      return;
    }
    const dy = s.y - (aim.y + 0.5);
    // Time left to fall to the target's height under gravity, then match the horizontal need.
    const a = -GRAVITY / 2,
      disc = s.vy * s.vy + 4 * a * Math.max(0.1, dy);
    const t = Math.max(0.25, (s.vy + Math.sqrt(disc)) / (2 * a));
    const want = { x: (aim.x - s.x) / t, z: (aim.z - s.z) / t };
    const max = BOMBS.lance.steer * dt;
    s.vx += clamp(want.x - s.vx, -max, max);
    s.vz += clamp(want.z - s.vz, -max, max);
  }

  updateDrill(bomb, a, b) {
    for (const hit of blockHits(this.blocks, this.buildings, a, b)) {
      if (bomb.crossed.has(hit.block.id)) continue;
      bomb.crossed.add(hit.block.id);
      this.breakBlock(hit.block, b);
      if (hit.block.kind === "slab" || hit.block.kind === "roof") {
        bomb.state.vy *= 0.93;
        this.game.puff(lerp3(a, b, hit.t), 0xf7e3c4, 0.5, 0.5);
        this.game.audio.play("crunch");
      }
      if (this.buildings[hit.block.b].kind === "shelter") this.abort();
    }
    const building = buildingAt(this.buildings, b.x, b.z);
    if (building) {
      const target = Math.min(bomb.floor - 1, building.floors);
      const detonateY = target >= building.floors ? building.top : storyY(target) + 1.1;
      if (b.y <= detonateY) this.detonate(bomb, b);
    }
  }

  burst(bomb, point) {
    const g = this.game;
    bomb.dead = true;
    g.view.disposeObject(bomb.mesh);
    const s = bomb.state;
    const below = surfaceBelow(this.buildings, this.blocks, point.x, point.z);
    const centre = scatterCentre(point, s, below);
    g.blast(point, 0.9, 0xc77dff, { quiet: true });
    g.audio.play("pop");
    const model = g.view.assets.has("bomblet") ? "bomblet" : "missile-friendly";
    const vy = s.vy * 0.8;
    for (const p of scatterPattern(centre)) {
      // Each bomblet times its throw to the surface under its own landing point.
      const h = Math.max(0.3, point.y - surfaceBelow(this.buildings, this.blocks, p.x, p.z));
      const t = Math.max(0.25, (vy + Math.sqrt(vy * vy + 2 * -GRAVITY * h)) / -GRAVITY);
      const state = { x: point.x, y: point.y, z: point.z, vx: (p.x - point.x) / t, vy, vz: (p.z - point.z) / t };
      const mesh = g.view.model(model, V(point.x, point.y, point.z), 1);
      this.bombs.push({ kind: "bomblet", state, mesh, crossed: new Set(), time: 0, trail: 0, owner: bomb.owner, dead: false });
    }
  }

  breakBlock(block, origin) {
    if (!block.alive) return;
    block.alive = false;
    this.city.hide(block);
    const building = this.buildings[block.b];
    const size = V(block.max[0] - block.min[0], block.max[1] - block.min[1], block.max[2] - block.min[2]);
    const centre = V((block.max[0] + block.min[0]) / 2, (block.max[1] + block.min[1]) / 2, (block.max[2] + block.min[2]) / 2);
    const color =
      block.kind === "glass"
        ? 0xb8f0ff
        : block.kind === "wall"
          ? new THREE.Color(building.color).getHex()
          : block.kind === "roof"
            ? 0xeadbc2
            : 0xfff3dc;
    this.game.debrisChunk(centre, size, color, V(origin.x, origin.y, origin.z));
    if (building.kind === "shelter") this.abort();
  }

  detonate(bomb, point) {
    const g = this.game;
    if (bomb.dead) return;
    bomb.dead = true;
    g.view.disposeObject(bomb.mesh);
    const def = bomb.kind === "bomblet" ? BOMBS.scatter : BOMBS[bomb.kind];
    const radius = def.radius;
    const breakRadius = def.breakRadius;
    const p = V(point.x, point.y, point.z);
    g.blast(p, radius, def.color, { quiet: bomb.kind === "bomblet" && Math.random() < 0.6 });
    // Break structure first; people behind freshly broken walls are exposed to the blast.
    for (const block of blocksNear(this.blocks, point, breakRadius * 1.5)) {
      const limit = block.kind === "glass" ? breakRadius * 1.5 : breakRadius;
      const d = Math.hypot(
        Math.max(block.min[0] - point.x, 0, point.x - block.max[0]),
        Math.max(block.min[1] - point.y, 0, point.y - block.max[1]),
        Math.max(block.min[2] - point.z, 0, point.z - block.max[2]),
      );
      if (d < limit) this.breakBlock(block, point);
    }
    if (shelterStruck(this.blocks, this.buildings, point, bomb.kind)) this.abort();
    let kills = 0;
    const exposed = (target, lift) => {
      const chest = { x: target.position.x, y: target.position.y + lift, z: target.position.z };
      return (
        Math.hypot(chest.x - point.x, chest.y - point.y, chest.z - point.z) < radius &&
        !lineBlocked(this.blocks, this.buildings, point, chest)
      );
    };
    for (const e of this.enemies) {
      if (e.dead || !exposed(e, 0.8)) continue;
      g.kill(e, false);
      e.marker.visible = false;
      kills++;
      g.score += e.officer ? 200 : 100;
    }
    for (const nest of this.aa) {
      if (nest.dead || !exposed(nest, 0.6)) continue;
      this.destroy(nest, 150);
      this.say("aa");
      kills++;
    }
    for (const mast of this.masts) {
      if (mast.dead || !exposed(mast, 0.8)) continue;
      this.destroy(mast, 250);
      kills++;
    }
    for (const truck of this.trucks) {
      if (truck.dead || !exposed(truck, 0.9)) continue;
      truck.hp -= bomb.kind === "bomblet" ? 1 : 2;
      if (truck.hp <= 0) {
        this.destroy(truck, 200);
        kills++;
      }
    }
    if (kills) {
      g.kills += kills;
      g.hits++;
      this.combo.count += kills;
      this.combo.timer = 1.1;
    }
    if (this.layout.alert) {
      let fled = 0;
      for (const e of this.enemies) {
        if (e.dead || e.state === "hide") continue;
        if (Math.hypot(e.position.x - point.x, e.position.z - point.z) < this.layout.alert) {
          this.hide(e);
          fled++;
        }
      }
      if (fled) this.say("alert");
    }
    this.checkSupport();
  }

  destroy(target, score) {
    const g = this.game;
    target.dead = true;
    target.hp = 0;
    g.score += score;
    g.view.disposeObject(target.mesh);
    g.blast(target.position.clone().add(V(0, 0.8, 0)), 2.2, 0xffc62b, { quiet: true });
  }

  closeCombo() {
    const count = this.combo.count;
    this.combo.count = 0;
    if (count < 2) return;
    const bonus = comboBonus(count);
    this.game.score += bonus;
    this.game.notify("combo", { count, bonus });
    if (count >= 3) this.say("multi");
  }

  // People standing on a broken slab tile drop to the next intact floor below.
  tileKey(b, f, x, z) {
    const building = this.buildings[b];
    const i = clamp(Math.floor((x - (building.x - CITY.half)) / this.tileSize), 0, CITY.tiles - 1);
    const j = clamp(Math.floor((z - (building.z - CITY.half)) / this.tileSize), 0, CITY.tiles - 1);
    return `${b}|${f}|${i}|${j}`;
  }

  supported(building, f, x, z) {
    return f <= 0 || Boolean(this.slabs.get(this.tileKey(building.index, f, x, z))?.alive);
  }

  checkSupport() {
    for (const e of this.enemies) {
      if (e.dead || e.state === "fall" || !e.cur?.b || e.cur.f <= 0) continue;
      const building = buildingById(this.buildings, e.cur.b);
      let f = e.cur.f;
      if (this.supported(building, f, e.position.x, e.position.z)) continue;
      while (f > 0 && !this.supported(building, f, e.position.x, e.position.z)) f--;
      e.state = "fall";
      e.fallTo = storyY(f);
      e.cur = { b: building.id, f };
      e.falls = (e.falls || 0) + 1;
    }
    // A flak nest or jammer whose roof tile is gone drops into the building and is wrecked.
    for (const prop of [...this.aa, ...this.masts]) {
      if (prop.dead) continue;
      const building = buildingById(this.buildings, prop.cur.b);
      if (!this.supported(building, prop.cur.f, prop.position.x, prop.position.z)) {
        this.destroy(prop, prop.type === "mast" ? 250 : 150);
        this.game.kills++;
      }
    }
  }

  abort() {
    if (this.aborted) return;
    this.aborted = true;
    this.say("shelter");
    this.game.finish(false, "shelter");
  }

  updateEvents() {
    const g = this.game;
    for (const event of this.events) {
      const alive = this.enemies.filter((e) => !e.dead && e.plan.group === event.group).length;
      const status = rallyStatus(event, g.time);
      event.status = status;
      event.alive = alive;
      event.ring.visible = alive > 0;
      const pulse = status.active ? 0.6 + Math.sin(g.time * 10) * 0.3 : status.next < 8 ? 0.45 : 0.18;
      event.ring.material.opacity = pulse;
      event.ring.material.color.set(status.active ? 0xff4b2b : 0xffc62b);
      event.ring.scale.setScalar(status.active ? 1 + Math.sin(g.time * 6) * 0.05 : 1);
      if (status.active && alive > 0 && !event.fired) {
        event.fired = true;
        this.say("rally");
      }
      if (!status.active) event.fired = false;
    }
  }

  updateForecasts() {
    const g = this.game;
    let shelterWarning = false;
    for (const a of this.aircraft) {
      const kind = a.alive ? this.kindFor(a) : null;
      const show = kind && this.flight.phase === "pass" && g.status === "playing";
      a.arc.visible = a.pipper.visible = Boolean(show);
      if (!show) {
        a.forecast = null;
        continue;
      }
      a.mesh.updateMatrixWorld(true);
      const state = this.releaseState(a);
      const forecast = forecastImpact(this.blocks, this.buildings, state, kind, this.floor);
      forecast.kind = kind;
      a.forecast = forecast;
      const def = BOMBS[kind];
      const primary = kind === this.selected;
      const positions = a.arc.geometry.attributes.position;
      const count = Math.min(200, forecast.points.length);
      for (let i = 0; i < count; i++) {
        const p = forecast.points[i];
        positions.setXYZ(i, p.x, p.y, p.z);
      }
      positions.needsUpdate = true;
      a.arc.geometry.setDrawRange(0, count);
      a.arc.geometry.computeBoundingSphere();
      a.arc.computeLineDistances();
      a.arc.material.color.set(def.color);
      a.arc.material.opacity = primary ? 0.95 : 0.4;
      const impact = forecast.impact;
      a.pipper.position.set(impact.x, impact.y + 0.12, impact.z);
      const ringRadius = kind === "scatter" ? def.spread + def.radius * 0.6 : kind === "shockwave" ? def.radius : kind === "lance" ? 1.8 : 1.3;
      a.pipperOuter.scale.setScalar(ringRadius);
      a.pipperInner.scale.setScalar(primary ? 0.8 : 0.6);
      for (const child of a.pipper.children) {
        child.material.color.set(def.color);
        child.material.opacity = primary ? 0.95 : 0.45;
      }
      const risk =
        forecast.crossesShelter ||
        forecastPoints(forecast).some((p) => shelterStruck(this.blocks, this.buildings, p, p.kind, 0.6));
      forecast.shelter = risk;
      if (risk) {
        shelterWarning = true;
        for (const child of a.pipper.children) child.material.color.set(0x2f86e8);
      }
      if (kind === "lance") forecast.lock = this.lockTarget(impact);
    }
    const lead = this.aircraft.find((a) => a.alive && a.forecast && a.forecast.kind === this.selected);
    const drill = lead?.forecast?.kind === "drill" ? lead.forecast : null;
    this.city.showBand(drill?.building || null, drill ? drill.floor : 0, BOMBS.drill.color);
    if (shelterWarning) this.say("shelter");
    this.shelterWarning = shelterWarning;
  }

  remaining() {
    return {
      enemies: this.enemies.filter((e) => !e.dead).length,
      aa: this.aa.filter((a) => !a.dead).length,
      masts: this.masts.filter((m) => !m.dead).length,
      trucks: this.trucks.filter((t) => !t.dead).length,
    };
  }

  totalTargets() {
    return this.enemies.length + this.aa.length + this.masts.length + this.trucks.length;
  }

  checkOutcome(dt) {
    const g = this.game;
    if (g.status !== "playing") return;
    const left = this.remaining();
    const total = left.enemies + left.aa + left.masts + left.trucks;
    if (total === 0) {
      this.closeCombo();
      this.say("success");
      g.finish(true);
      return;
    }
    if (!this.aircraft.some((a) => a.alive)) {
      if (this.bombs.length === 0 && this.combo.timer <= 0) g.finish(false, "flight");
      return;
    }
    const ordnance = this.aircraft.some((a) => a.alive && Object.values(a.payload).some((n) => n > 0));
    if (!ordnance && this.bombs.length === 0 && this.combo.timer <= 0) {
      this.emptyTimer += dt;
      if (this.emptyTimer > 1.2) g.finish(false, "ordnance");
    } else this.emptyTimer = 0;
  }

  finishBonus() {
    const left = this.aircraft.reduce(
      (sum, a) => sum + (a.alive ? Object.values(a.payload).reduce((x, y) => x + y, 0) : 0),
      0,
    );
    return 300 + left * 150 + this.aircraft.filter((a) => a.alive).length * 100;
  }

  stars(success) {
    return strikeStars({ success, used: this.used, par: this.layout.par, damaged: this.damaged });
  }

  // ------------------------------------------------------------------ HUD data

  ladder() {
    const lead = this.aircraft.find((a) => a.alive && a.forecast && a.forecast.kind === this.selected) ||
      this.aircraft.find((a) => a.alive && a.forecast);
    const building = lead?.forecast?.building || null;
    if (!building) return null;
    const floors = [];
    for (let f = building.floors; f >= 0; f--) {
      const count = this.enemies.filter((e) => !e.dead && e.cur?.b === building.id && e.cur.f === f).length;
      const props =
        f === building.floors
          ? this.aa.filter((a) => !a.dead && a.cur.b === building.id).length +
            this.masts.filter((m) => !m.dead && m.cur.b === building.id).length
          : 0;
      floors.push({ f, label: f === building.floors ? "ROOF" : `F${f + 1}`, count, props });
    }
    const drillFloor = lead.forecast.kind === "drill" ? lead.forecast.floor : null;
    return { name: building.name || building.id, kind: building.kind, floors, drillFloor };
  }

  snapshot() {
    const g = this.game;
    const left = this.remaining();
    const total = this.totalTargets();
    return {
      mode: "strike",
      aircraft: this.aircraft.map((a) => ({
        callsign: a.callsign,
        crew: a.crew,
        hp: a.hp,
        maxHp: a.maxHp,
        alive: a.alive,
        payload: { ...a.payload },
        cooldown: a.cooldown,
      })),
      selected: this.selected,
      floor: this.floor,
      wide: this.flight.wide,
      phase: this.flight.phase,
      turn: this.flight.turn,
      speed: this.flight.speed,
      pass: this.flight.pass,
      events: this.events.map((e) => ({
        label: e.label,
        place: e.place,
        alive: e.alive ?? e.members,
        members: e.members,
        ...(e.status || rallyStatus(e, g.time)),
      })),
      ladder: this.ladder(),
      left,
      total,
      used: this.used,
      par: this.layout.par,
      flak: this.flakLock ? this.flakLock.callsign : null,
      flakIn: Math.min(...this.aa.filter((n) => !n.dead && n.state === "lock").map((n) => n.lock), 9),
      shelter: this.shelterWarning,
      progress: total ? 1 - (left.enemies + left.aa + left.masts + left.trucks) / total : 1,
      labels: this.events
        .filter((e) => (e.alive ?? 1) > 0)
        .map((e) => ({
          id: `rally-${e.group}`,
          x: e.centre.x,
          y: e.centre.y + 2.8,
          z: e.centre.z,
          text: e.status?.active
            ? `${e.label} / NOW ${Math.ceil(e.status.remaining)}s`
            : `${e.label} / ${Math.ceil(e.status?.next ?? e.at)}s`,
          hot: Boolean(e.status?.active),
        })),
    };
  }
}
