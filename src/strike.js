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
  burstGround,
  DRILL_SLOWDOWN,
  STEP,
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
  turnPoint,
  laneLimits,
  cityBounds,
  isPattern,
  groundAt,
} from "./strike-data.js";
import { patternPoints, patternDiagram, predictHits, ROTATION_STEP, SHAPES } from "./harbour-data.js";
import { Fleet, dampAngle } from "./harbour.js";
import { CityView } from "./city.js";
import { MISSION_STORY, STRIKE_RADIO } from "./story.js";
import { clamp } from "./physics.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const forward = V(0, 0, -1);
const LIVERY = ["#ffc62b", "#ff8a6b", "#33d69f"];
const HIDE_SECONDS = 18;
// Flak telegraphs for 2 s; a volley can hurt only the aircraft it locked, and only once.
// The fire solution freezes `solution` seconds before the shot: a lane change after that moment
// (the HUD shows BREAK) throws the volley off. The slow flight stays in range longer, so nests
// reload slowly.
const FLAK = { range: 13, lock: 2, solution: 0.8, speed: 34, burst: 2.1, cooldown: 7, grace: 5 };
const yawFor = (dir) => -dir * (Math.PI / 2);

const markerCache = new Map();
function markerMaterial(kind) {
  if (markerCache.has(kind)) return markerCache.get(kind);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const c = canvas.getContext("2d");
  // Ship markers carry their hit points; "target" marks ships under the current pattern.
  const ship = /^(ship|target)(\d)$/.exec(kind);
  const fill = ship
    ? ship[1] === "target"
      ? "#ffd23f"
      : "#ff4b2b"
    : { enemy: "#ff4b2b", officer: "#ffc62b", hidden: "#ff9f1c", truck: "#ff4b2b", civilian: "#2f86e8" }[kind];
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
  if (ship && +ship[2] > 1) c.fillText(ship[2], 0, 1);
  if (kind === "civilian") {
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.arc(0, 0, 6, 0, Math.PI * 2);
    c.fill();
  }
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

// Every bomb (not just the Lance) homes gently onto a target near its impact point: this much
// sideways acceleration, in m/s², is enough to pull a near miss onto the target.
const ASSIST_STEER = 6;
// How close the pipper must be to the aim point before the flight drops by itself.
const AIM_TOLERANCE = 1.1;
// A click this close to a target marks the target itself (and follows it if it moves).
const AIM_SNAP = 3.5;
// Seconds between the automatic turns a mark asks for.
const AUTO_TURN_GAP = 5;
// How far past the last live target a flight with no mark flies before it turns round.
const PATROL_MARGIN = 18;

// Steer a guided bomb toward `aim`: match the horizontal speed needed to arrive as it falls.
function guide(s, aim, dt, steer = BOMBS.lance.steer) {
  const dy = s.y - (aim.y + 0.5);
  const a = -GRAVITY / 2,
    disc = s.vy * s.vy + 4 * a * Math.max(0.1, dy);
  const t = Math.max(0.25, (s.vy + Math.sqrt(disc)) / (2 * a));
  const want = { x: (aim.x - s.x) / t, z: (aim.z - s.z) / t };
  const max = steer * dt;
  s.vx += clamp(want.x - s.vx, -max, max);
  s.vz += clamp(want.z - s.vz, -max, max);
}

export class StrikeOperation {
  constructor(game) {
    const g = (this.game = game),
      view = g.view;
    this.layout = STRIKE_MISSIONS[g.index];
    this.story = MISSION_STORY[g.index];
    this.buildings = resolveBuildings(this.layout);
    this.blocks = buildBlocks(this.buildings);
    this.maxFloor = Math.max(1, ...this.buildings.map((b) => b.floors)) + 1;
    // Harbour layouts mark their quays; bombs anywhere else fall to sea level.
    this.land = this.layout.harbour?.land || null;
    this.turnX = turnPoint(this.layout);
    this.lanes = laneLimits(this.layout);
    this.bounds = cityBounds(this.layout);
    // Early missions hit harder, and every bomb homes a little onto a target near its impact.
    this.power = this.layout.power ?? 1;
    this.assistRadius = this.layout.assist ?? 0;
    this.aim = null;
    // Floor tiles by building, storey and grid cell: support checks are O(1) per person.
    this.tileSize = (CITY.half * 2) / CITY.tiles;
    this.slabs = new Map();
    for (const block of this.blocks)
      if (block.kind === "slab" || block.kind === "roof")
        this.slabs.set(this.tileKey(block.b, block.f, block.min[0] + 0.01, block.min[2] + 0.01), block);
    this.city = new CityView(view, this.layout, this.buildings, this.blocks, g.index);
    // The flight starts just west of the mission's own blocks, heading east, and sweeps back and
    // forth over the whole city; `dir` is +1 flying east.
    this.flight = {
      x: Math.max(-this.turnX + 2, -(this.layout.cols * CITY.pitch) / 2 - 10),
      dir: 1,
      lane: this.layout.startLane ?? 3,
      speed: FLIGHT.speed,
      lateral: 0,
      phase: "pass",
      turn: 0,
      turnFrom: 1,
      turnX0: 0,
      spacing: FLIGHT.tight,
      wide: false,
      pass: 1,
    };
    this.floor = 1;
    this.patternStep = 0;
    this.bombs = [];
    this.shells = [];
    this.used = 0;
    this.damaged = false;
    this.combo = { count: 0, timer: 0 };
    this.said = new Map();
    this.forecastTimer = 0;
    this.hints = new Set();
    this.emptyTimer = 0;
    const slots = formationSlots(this.layout.aircraft.length, FLIGHT.tight);
    this.aircraft = this.layout.aircraft.map((a, i) => this.createAircraft(a, i, slots[i]));
    // Harbour missions open on the pattern they teach.
    const loaded = (kind) => this.aircraft.some((a) => a.payload[kind] > 0);
    this.selected = loaded(this.layout.select) ? this.layout.select : BOMB_ORDER.find(loaded);
    const { plans, events } = planEnemies(this.layout, this.buildings);
    this.events = events.map((e) => ({ ...e, fired: false, ring: null }));
    this.enemies = plans.map((plan) => this.createEnemy(plan));
    this.aa = this.layout.aa.map((place, i) => this.createFlak(place, i));
    this.masts = this.layout.masts.map((place) => this.createMast(place));
    this.trucks = this.createConvoy();
    this.fleet = this.layout.fleet ? new Fleet(this) : null;
    for (const event of this.events) {
      event.ring = view.ring(V(event.centre.x, event.centre.y + 0.08, event.centre.z), 2.6, 0xffc62b, 0.22);
      event.ring.renderOrder = 6;
    }
    this.lockMarker = view.ring(V(), 1.6, 0x18d5ff, 0.22);
    this.lockMarker.material.depthTest = false;
    this.lockMarker.renderOrder = 11;
    this.lockMarker.visible = false;
    // The player's drop mark, and the gold ring on whatever the next bomb will home onto.
    this.aimMarker = view.ring(V(), 1.4, 0xffd23f, 0.28);
    this.aimMarker.material.depthTest = false;
    this.aimMarker.renderOrder = 11;
    this.aimMarker.visible = false;
    this.assistMarker = view.ring(V(), 1.1, 0xffc62b, 0.18);
    this.assistMarker.material.depthTest = false;
    this.assistMarker.renderOrder = 11;
    this.assistMarker.visible = false;
    // Place the flight before the first frame: a release must never start from the models' origin.
    this.updateFlight(0);
    this.follow(0, true);
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
    // The pipper is drawn twice: solid where the impact point is visible, and faint through any
    // building in front of it, so a ring behind a tower never looks as if it sits on the roof.
    const pipper = new THREE.Group();
    const layer = (solid) => {
      const rings = [view.ring(V(), 0.95, 0xffffff, 0.2, pipper), view.ring(V(), 1, 0xffffff, 0.08, pipper)];
      const parts = [...rings];
      for (const angle of [0, Math.PI / 2]) {
        const tick = new THREE.Mesh(
          new THREE.PlaneGeometry(2.6, 0.12),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
        );
        tick.rotation.set(-Math.PI / 2, 0, angle);
        tick.userData.disposable = true;
        pipper.add(tick);
        parts.push(tick);
      }
      for (const part of parts) {
        part.material.depthTest = solid;
        part.renderOrder = solid ? 9 : 8;
        part.userData.solid = solid;
      }
      return rings;
    };
    const [inner, outer] = layer(true);
    const [ghostInner, ghostOuter] = layer(false);
    view.level.add(pipper);
    const cells = new THREE.Group();
    cells.visible = false;
    const cellRings = Array.from({ length: 12 }, () => {
      // Thick rings, so blue or yellow cells still read against the water.
      const ring = view.ring(V(), 1, 0xffffff, 0.3, cells);
      ring.material.depthTest = false;
      ring.renderOrder = 9;
      return ring;
    });
    const outline = new THREE.Line(
      new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(13 * 3), 3)),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthTest: false }),
    );
    outline.frustumCulled = false;
    outline.renderOrder = 9;
    outline.userData.disposable = true;
    cells.add(outline);
    view.level.add(cells);
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
      smoke: 0,
      mesh,
      props: ["PropellerL", "PropellerR"].map((n) => mesh.getObjectByName(n)).filter(Boolean),
      centrePylon: mesh.getObjectByName("PylonC"),
      arc,
      pipper,
      pipperRings: { inner: [inner, ghostInner], outer: [outer, ghostOuter] },
      cells,
      cellRings,
      outline,
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
    nest.beam = this.beam(0xff3b3b);
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

  marker(kind) {
    return markerMaterial(kind);
  }

  // Flak on a ship: a nest that rides the hull and dies with it.
  createShipFlak(ship) {
    const g = this.game;
    const nest = g.entity("aa", null, ship.position.clone(), { hp: 1, radius: 1.3 });
    nest.cur = { b: null, f: 0 };
    nest.state = "idle";
    // Ship guns open up a few seconds after the rooftop nests would, one after another.
    nest.cooldown = FLAK.grace + 4 + this.aa.length * 1.5;
    nest.lock = 0;
    nest.mounted = ship;
    nest.turret = ship.turret || null;
    nest.warning = g.view.ring(V(0, 0.12 - ship.def.flak.y, 0), 2.4, 0xff3b3b, 0.16, nest.mesh);
    nest.warning.material.opacity = 0.15;
    nest.beam = this.beam(0xff3b3b);
    this.aa.push(nest);
    return nest;
  }

  destroyMounted(nest) {
    nest.dead = true;
    nest.state = "idle";
    nest.beam.visible = false;
    this.game.view.disposeObject(nest.mesh);
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

  say(key, again = 0) {
    const last = this.said.get(key);
    if (last !== undefined && (!again || this.game.time - last < again)) return;
    const line = this.story?.radio?.[key] || STRIKE_RADIO[key];
    if (!line) return;
    this.said.set(key, this.game.time);
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
    this.floorTouched = true;
    this.floor = clamp(Math.round(value), 1, this.maxFloor);
    this.forecastTimer = 0;
  }

  toggleFormation() {
    this.flight.wide = !this.flight.wide;
    this.forecastTimer = 0;
  }

  // Aim where the player clicked or tapped: snap to a target near the point, then let the flight
  // fly there and drop by itself. The point is { x, z }; `target` may be given directly.
  setAim(point, target = null) {
    if (this.game.status !== "playing") return false;
    if (!target) {
      const near = this.targets()
        .map((t) => ({ t, d: Math.hypot(t.position.x - point.x, t.position.z - point.z) }))
        .filter((c) => c.d < AIM_SNAP)
        .sort((a, b) => a.d - b.d)[0];
      target = near?.t || null;
    }
    this.aim = target ? { target } : { x: point.x, z: point.z };
    this.aimUsed = true;
    this.forecastTimer = 0;
    return true;
  }

  clearAim() {
    this.aim = null;
  }

  // Where the drop should land now: a marked target where it will be when the bomb lands.
  aimPoint() {
    const aim = this.aim;
    if (!aim) return null;
    if (!aim.target) return aim;
    if (aim.target.dead) {
      this.aim = null;
      return null;
    }
    const f = this.shooterFor(this.selected)?.forecast;
    const p = this.predict(aim.target, f ? f.time : 2);
    return { x: p.x, z: p.z };
  }

  // Steering toward the aim point: slow over the target, fast on the way; turn round only once the
  // point is far enough behind that a turn brings the pipper back over it.
  autoPilot() {
    const aim = this.aimPoint();
    if (!aim) return null;
    const f = this.flight;
    const a = this.shooterFor(this.selected) || this.aircraft.find((x) => x.alive);
    const impact = a?.forecast?.impact;
    const pipperZ = impact ? impact.z : f.lane + (a?.slot.z || 0);
    const dz = aim.z - pipperZ;
    const lateral = clamp(dz * 1.4, -1, 1) * (Math.abs(dz) > 6 ? FLIGHT.lateralFast : FLIGHT.lateral);
    let throttle = 0;
    if (impact && a && f.phase === "pass") {
      const lead = Math.abs(impact.x - a.mesh.position.x);
      const ahead = (aim.x - impact.x) * f.dir;
      const behindAircraft = (a.mesh.position.x - aim.x) * f.dir;
      // A moving mark can swing behind and ahead again: one automatic turn per few seconds.
      const settled = this.game.time - (this.autoTurnAt ?? -Infinity) > AUTO_TURN_GAP;
      if (behindAircraft > lead + 1 && settled && this.canReverse()) {
        this.reverse();
        this.autoTurnAt = this.game.time;
      } else throttle = Math.abs(dz) > 3 && ahead < 10 ? -1 : ahead > 18 ? 1 : ahead > 8 ? 0.35 : 0;
    }
    return { throttle, lateral };
  }

  // Drop by itself once the pipper sits on the aim point, unless the drop would touch a civilian.
  autoRelease() {
    const aim = this.aimPoint();
    if (!aim || !this.canRelease()) return;
    const a = this.shooterFor(this.selected);
    const f = a?.forecast;
    if (!a || !f || a.cooldown > 0 || f.shelter || f.prediction?.civilian) return;
    const p = f.detonation || f.impact;
    // A marked target that the Lance has locked, or that the bomb will home onto, is good enough.
    const target = this.aim.target;
    const locked = target && (f.lock === target || this.assistLock === target);
    if (!locked && Math.hypot(p.x - aim.x, p.z - aim.z) > AIM_TOLERANCE) return;
    // A Drill marked on someone indoors goes to their floor, and only into their building.
    if (this.selected === "drill" && target?.cur?.b) {
      if (f.building?.id !== target.cur.b) return;
      const b = this.buildings.find((x) => x.id === target.cur.b);
      const floor = target.cur.f >= b.floors ? b.floors + 1 : target.cur.f + 1;
      if (this.floor !== floor) {
        this.setFloor(floor);
        return;
      }
    }
    if (this.release(this.selected)) this.clearAim();
  }

  // Bombs home gently onto the nearest target within the mission's assist radius of their impact.
  assistTarget(point, kind, time = 0) {
    if (!point || kind === "lance" || isPattern(kind) || !this.assistRadius) return null;
    return (
      this.targets()
        .map((t) => ({ t, d: Math.hypot(t.position.x - point.x, t.position.z - point.z) }))
        .filter((c) => c.d < this.assistRadius)
        .sort((a, b) => a.d - b.d)
        .find((c) => this.assistSafe(c.t, kind, time))?.t || null
    );
  }

  // Homing ends on the target, and the forecast only vouches for the unassisted impact: a target
  // whose blast would reach the shelter or a civilian hull is never homed on.
  assistSafe(target, kind, time) {
    const at = this.predict(target, time);
    const points = forecastPoints({ kind, impact: { x: at.x, y: at.y ?? target.position.y, z: at.z } });
    if (points.some((p) => shelterStruck(this.blocks, this.buildings, p, p.kind, 0.6, this.power))) return false;
    return !(this.fleet && predictHits(this.fleet.predicted(this.game.time + time), points, BOMBS[kind].radius * this.power).civilian);
  }

  // A bomb's blast: stronger early on (the mission's power), except pattern bomblets, whose size
  // is the shape puzzle.
  blastDef(def) {
    return def.pattern ? def : { ...def, radius: def.radius * this.power };
  }

  // Turn a pattern bomb by 45° steps (clockwise on screen for positive steps).
  rotate(steps = 1) {
    this.patternStep = (((this.patternStep + steps) % 8) + 8) % 8;
    this.rotated = true;
    this.forecastTimer = 0;
  }

  get patternAngle() {
    return this.patternStep * ROTATION_STEP;
  }

  // Reverse is refused mid-turn, and at an edge where turning round would point the flight
  // straight back out (the edge would only turn it round again).
  canReverse() {
    const f = this.flight;
    return f.phase === "pass" && this.game.status === "playing" && -f.x * f.dir < this.turnX - 1;
  }

  // In the wide city, a flight with no marked drop turns round a little past the last live
  // target instead of crossing empty blocks to the far edge (a mark takes it anywhere).
  patrolEdge(dir) {
    if (!this.layout.grid || this.aim) return Infinity;
    let edge = -Infinity;
    for (const t of this.targets()) edge = Math.max(edge, t.position.x * dir);
    for (const e of this.events) if (e.alive > 0) edge = Math.max(edge, e.centre.x * dir);
    return edge === -Infinity ? Infinity : edge + PATROL_MARGIN;
  }

  // Turn the flight round now: a wingover back along the same lane.
  reverse(auto = false) {
    const f = this.flight;
    if (!auto && !this.canReverse()) return false;
    if (f.phase !== "pass" || this.game.status !== "playing") return false;
    f.phase = "turn";
    f.turn = 0;
    f.turnFrom = f.dir;
    f.turnX0 = f.x;
    f.dir = -f.dir;
    if (!auto) this.reversed = true;
    this.forecastTimer = 0;
    return true;
  }

  kindFor(aircraft) {
    if (aircraft.payload[this.selected] > 0) return this.selected;
    return BOMB_ORDER.find((kind) => aircraft.payload[kind] > 0) || null;
  }

  canRelease() {
    return this.game.status === "playing" && !this.game.paused && this.flight.phase === "pass";
  }

  // The aircraft that drops the next bomb of `kind`: its pipper is the bright one on screen.
  shooterFor(kind) {
    return this.aircraft.find((a) => a.alive && a.payload[kind] > 0) || null;
  }

  release(kind = this.selected) {
    if (!this.canRelease()) return false;
    // The shooter whose pipper is shown drops first; while it re-arms, the next one ripples in.
    const shooter = this.shooterFor(kind);
    const aircraft =
      shooter?.cooldown <= 0 ? shooter : this.aircraft.find((a) => a.alive && a.payload[kind] > 0 && a.cooldown <= 0);
    if (!aircraft) return false;
    this.drop(aircraft, kind);
    this.autoSelect();
    return true;
  }

  salvo() {
    if (!this.canRelease()) return false;
    this.salvoUsed = true;
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
    const pylon = aircraft.centrePylon;
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
    // The forecast (and its hit count) at the instant of release, so the panel never blinks.
    const { forecast, state, prediction } = this.preview(aircraft, kind);
    forecast.prediction = prediction;
    aircraft.forecast = forecast;
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
      target: kind === "lance" ? this.lockTarget(aircraft.forecast?.impact, state) : null,
      assist: this.assistTarget(forecast.impact, kind, forecast.time),
      angle: this.patternAngle,
      dead: false,
    };
    this.bombs.push(bomb);
    g.audio.play("release");
    // Ships see the bombs fall and turn away from where they will land.
    if (this.fleet) this.fleet.evade(forecastPoints(aircraft.forecast), g.time + aircraft.forecast.time, def.radius);
  }

  forecast(state, kind, step = this.patternStep) {
    return forecastImpact(this.blocks, this.buildings, state, kind, this.floor, { land: this.land, angle: step * ROTATION_STEP });
  }

  // What `aircraft` would do if it released `kind` now, turned to `step`: the forecast, and for a
  // harbour the ships it would hit where they will be when the bombs land.
  preview(aircraft, kind, step = this.patternStep) {
    aircraft.mesh.updateMatrixWorld(true);
    const state = this.releaseState(aircraft);
    const forecast = this.forecast(state, kind, step);
    forecast.kind = kind;
    const def = BOMBS[kind];
    const prediction = this.fleet
      ? predictHits(
          this.fleet.predicted(this.game.time + forecast.time),
          forecastPoints(forecast),
          def.radius,
          def.shipDamage ?? 1,
          forecast.time,
        )
      : null;
    return { forecast, state, prediction };
  }

  // The Lance locks the nearest target to its pipper (trucks first) that it can actually reach.
  lockTarget(point, release) {
    if (!point || !release) return null;
    const candidates = this.targets()
      .map((t) => ({ t, d: Math.hypot(t.position.x - point.x, t.position.z - point.z) - (t.type === "truck" ? 3 : 0) }))
      .filter((c) => c.d < 8)
      .sort((x, y) => x.d - y.d)
      .slice(0, 4);
    return candidates.find((c) => this.lanceReaches(release, c.t))?.t || null;
  }

  targets() {
    return [
      ...this.trucks.filter((t) => !t.dead),
      ...(this.fleet ? this.fleet.hostile().filter((s) => !s.dead) : []),
      ...this.masts.filter((t) => !t.dead),
      ...this.aa.filter((t) => !t.dead && !t.mounted),
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
    this.autoRelease();
    this.updateTrucks(dt);
    this.fleet?.update(dt);
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
    this.follow(dt);
    if (g.debrisActive) g.physics.world.step(dt);
  }

  // The camera slides after the flight: it keeps the pipper (or the flight) in its window and
  // only moves when that point strays toward the window's edge.
  follow(dt, snap = false) {
    const a = this.shooterFor(this.selected) || this.aircraft.find((x) => x.alive);
    const p = a?.forecast?.impact || (a ? { x: a.mesh.position.x, z: a.mesh.position.z } : null);
    if (p) this.game.view.followStrike(p, dt, snap);
    const aim = this.aimPoint();
    this.aimMarker.visible = Boolean(aim);
    if (aim) {
      this.aimMarker.position.set(aim.x, (this.land ? 0.1 : CITY.ground) + 0.2, aim.z);
      this.aimMarker.scale.setScalar(1 + Math.sin(this.game.time * 6) * 0.12);
    }
  }

  updateFlight(dt) {
    const g = this.game,
      f = this.flight;
    // With an aim point the flight steers itself; any held key or stick input takes over while held.
    const auto = g.status === "playing" ? this.autoPilot() : null;
    const manualX = Math.abs(g.input.x) > 0.05,
      manualZ = Math.abs(g.input.z) > 0.05;
    // Speed is screen-relative: pushing toward the direction of flight speeds the flight up.
    const throttle = auto && !manualX ? auto.throttle : g.input.x * f.dir;
    const targetSpeed = clamp(FLIGHT.speed + throttle * FLIGHT.throttle, FLIGHT.minSpeed, FLIGHT.maxSpeed);
    f.speed += clamp(targetSpeed - f.speed, -FLIGHT.accel * dt, FLIGHT.accel * dt);
    f.lateral = THREE.MathUtils.damp(f.lateral, auto && !manualZ ? auto.lateral : g.input.z * FLIGHT.lateral, 5, dt);
    f.lane = clamp(f.lane + f.lateral * dt, this.lanes.min, this.lanes.max);
    f.spacing = THREE.MathUtils.damp(f.spacing, f.wide ? FLIGHT.wide : FLIGHT.tight, 4, dt);
    // Turn progress: a wingover that climbs, swings out and comes back on the same lane.
    let u = 0,
      vx = 0;
    if (f.phase === "pass") {
      f.x += f.speed * f.dir * dt;
      vx = f.speed * f.dir;
      if (f.x * f.dir > Math.min(this.turnX, this.patrolEdge(f.dir))) this.reverse(true);
    } else {
      f.turn += dt;
      if (f.turn >= FLIGHT.turnTime) {
        f.phase = "pass";
        f.pass++;
        f.x = f.turnX0;
        // Release is allowed again this tick, so the aircraft must already carry the new speed.
        vx = f.speed * f.dir;
      } else {
        u = f.turn / FLIGHT.turnTime;
        f.x = f.turnX0 + f.turnFrom * FLIGHT.turnReach * Math.sin(Math.PI * u);
        vx = ((f.turnFrom * FLIGHT.turnReach * Math.PI) / FLIGHT.turnTime) * Math.cos(Math.PI * u);
      }
    }
    const turning = f.phase === "turn";
    const swing = turning ? Math.sin(Math.PI * u) : 0;
    // Trailing wingmen swap sides through the turn so they end up behind the lead again.
    const trail = turning ? f.turnFrom * (1 - 2 * u) : f.dir;
    const yaw = turning ? yawFor(f.turnFrom) + Math.PI * u * f.turnFrom : yawFor(f.dir);
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
      const x = f.x + slot.x * trail;
      a.velocity.set(vx, 0, f.lateral);
      a.mesh.position.set(x, FLIGHT.altitude + bob - a.index * 0.4 + FLIGHT.turnClimb * swing, f.lane + slot.z);
      a.mesh.visible = true;
      const bank = turning ? -1.15 * swing * f.turnFrom : THREE.MathUtils.damp(a.mesh.rotation.z, f.lateral * 0.08 * f.dir, 6, dt);
      a.mesh.rotation.set(0, yaw, bank);
      // The model's nose is its local -Z, so its tail points along (sin yaw, 0, cos yaw).
      const back = V(Math.sin(yaw), 0, Math.cos(yaw));
      if (a.hp < a.maxHp) {
        a.smoke -= dt;
        if (a.smoke <= 0) {
          a.smoke = 0.08;
          g.puff(a.mesh.position.clone().addScaledVector(back, 1.2).add(V(0, 0.2, 0)), 0x3b3440, 0.35, 0.9);
        }
      } else if (!turning) {
        a.contrail = (a.contrail ?? a.index * 0.03) - dt;
        if (a.contrail <= 0) {
          a.contrail = 0.12;
          for (const side of [-1, 1])
            g.puff(a.mesh.position.clone().addScaledVector(back, 2.4).add(V(0, 0.1, side * 3.1)), 0xffffff, 0.12, 0.35);
        }
      }
    }
  }

  // After the result is decided, ordnance already in the air still lands and aircraft still fly.
  settle(dt) {
    // updateFlight also carries downed aircraft away.
    this.updateFlight(dt);
    this.updateBombs(dt);
    this.updateFlak(dt);
    this.fleet?.update(dt);
    if (this.combo.timer > 0) {
      this.combo.timer -= dt;
      if (this.combo.timer <= 0) this.closeCombo();
    }
  }

  updateDowned(a, dt) {
    if (!a.mesh.parent) return;
    a.exit += dt;
    a.exitDir ??= this.flight.dir;
    a.mesh.position.x += dt * 5 * a.exitDir;
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
            e.blendFrom = { x: p.x, y: p.y, z: p.z };
            e.blendUntil = t + 0.35;
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
      if (e.state === "route" && e.blendUntil > t) {
        const k = 1 - (e.blendUntil - t) / 0.35;
        p = { ...p, x: e.blendFrom.x + (p.x - e.blendFrom.x) * k, y: e.blendFrom.y + (p.y - e.blendFrom.y) * k, z: e.blendFrom.z + (p.z - e.blendFrom.z) * k };
      }
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
    this.flakLocks = [];
    const reach = (a, extra) =>
      a.alive &&
      this.flight.phase === "pass" &&
      Math.hypot(a.mesh.position.x - nest.position.x, a.mesh.position.z - nest.position.z) < FLAK.range + extra;
    let nest;
    for (nest of this.aa) {
      nest.beam.visible = false;
      if (nest.dead) continue;
      nest.cooldown -= dt;
      const target =
        nest.state === "lock"
          ? reach(nest.target, 4)
            ? nest.target
            : null
          : this.aircraft
              .filter((a) => reach(a, 0))
              .sort(
                (x, y) =>
                  Math.hypot(x.mesh.position.x - nest.position.x, x.mesh.position.z - nest.position.z) -
                  Math.hypot(y.mesh.position.x - nest.position.x, y.mesh.position.z - nest.position.z),
              )[0];
      if (nest.turret && target) {
        const d = target.mesh.position.clone().sub(nest.position);
        // A ship-mounted gun turns relative to its hull.
        const base = nest.mounted ? nest.mounted.mesh.rotation.y : 0;
        nest.turret.rotation.y = dampAngle(nest.turret.rotation.y, Math.atan2(-d.x, -d.z) - base, 6, dt);
      }
      if (nest.state === "idle" && target && nest.cooldown <= 0) {
        nest.state = "lock";
        nest.lock = FLAK.lock;
        nest.target = target;
        nest.solution = null;
        this.say("flak");
      }
      if (nest.state === "lock") {
        if (!target) {
          nest.state = "idle";
          nest.solution = null;
          nest.cooldown = 0.6;
        } else {
          nest.lock -= dt;
          if (!nest.solution && nest.lock <= FLAK.solution)
            nest.solution = { position: target.mesh.position.clone(), velocity: target.velocity.clone(), ahead: Math.max(0, nest.lock) };
          this.flakLocks.push({ callsign: nest.target.callsign, in: nest.lock, solved: Boolean(nest.solution) });
          const positions = nest.beam.geometry.attributes.position;
          positions.setXYZ(0, nest.position.x, nest.position.y + 1.2, nest.position.z);
          positions.setXYZ(1, nest.target.mesh.position.x, nest.target.mesh.position.y, nest.target.mesh.position.z);
          positions.needsUpdate = true;
          // The beam flickers while the nest is tracking and holds steady once it has a solution.
          nest.beam.visible = Boolean(nest.solution) || Math.sin(g.time * 30) > -0.3;
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
          if (a === shell.volley.target && a.alive && !shell.volley.hit.has(a) && a.mesh.position.distanceTo(shell.mesh.position) < FLAK.burst) {
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
    // Aim where the target would be had it held the course it flew when the solution froze.
    const s = nest.solution || { position: nest.target.mesh.position.clone(), velocity: nest.target.velocity.clone(), ahead: 0 };
    nest.solution = null;
    const target = s.position.clone().addScaledVector(s.velocity, s.ahead);
    const tof = origin.distanceTo(target) / FLAK.speed;
    const lead = target.addScaledVector(s.velocity, tof);
    // A volley threatens only the aircraft its lock line named, so the HUD's warning is the whole story.
    const volley = { hit: new Set(), target: nest.target };
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
    if (!a.alive || this.game.status !== "playing") return;
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
      a.cells.visible = false;
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
      else if (bomb.assist && !bomb.assist.dead && bomb.time > 0.2) {
        const t = this.predict(bomb.assist, Math.max(0, -s.vy / 9.81));
        guide(s, { x: t.x, y: bomb.assist.position.y, z: t.z }, dt, ASSIST_STEER);
      }
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
      else if (bomb.kind === "scatter" || isPattern(bomb.kind)) {
        const below = surfaceBelow(this.buildings, this.blocks, b.x, b.z, this.land);
        const hit = blockHits(this.blocks, this.buildings, a, b)[0];
        if (hit || b.y <= below + BOMBS[bomb.kind].burst) this.burst(bomb, hit ? lerp3(a, b, hit.t) : b);
      } else {
        const hit = blockHits(this.blocks, this.buildings, a, b)[0];
        if (hit) this.detonate(bomb, lerp3(a, b, hit.t));
      }
      const ground = groundAt(this.land, b.x, b.z);
      if (!bomb.dead && b.y <= ground) {
        // Detonate at the exact ground (or sea) crossing, the point the pipper forecast shows.
        const t = (a.y - ground) / Math.max(1e-6, a.y - b.y);
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
    guide(s, aim, dt);
  }

  // Where a target will be `ahead` seconds from now: scheduled walkers and trucks are predictable.
  predict(target, ahead) {
    if (target.type === "ship") {
      const p = this.fleet.poseAt(target, this.game.time + ahead);
      return { x: p.x, y: 0, z: p.z };
    }
    const route = target.route || (target.state === "route" ? target.plan?.route : null);
    if (!route) return target.position;
    const p = sampleRoute(route, this.game.time + ahead);
    return { x: p.x, y: p.y, z: p.z };
  }

  // Fly a Lance from `release` at `target`; true when it would detonate within reach of it.
  lanceReaches(release, target) {
    const s = { ...release };
    const lift = target.type === "truck" ? 0.9 : 0.8;
    for (let i = 1; i < 900; i++) {
      const t = i * STEP;
      const aim = this.predict(target, t);
      if (t > 0.3) guide(s, aim, STEP);
      const a = { x: s.x, y: s.y, z: s.z };
      stepBomb(s, STEP);
      const b = { x: s.x, y: s.y, z: s.z };
      const hit = blockHits(this.blocks, this.buildings, a, b)[0];
      const ground = groundAt(this.land, b.x, b.z);
      const end = hit ? lerp3(a, b, hit.t) : b.y <= ground ? lerp3(a, b, (a.y - ground) / (a.y - b.y)) : null;
      if (!end) continue;
      const reach = BOMBS.lance.radius * this.power;
      if (target.type === "ship") return Math.hypot(end.x - aim.x, end.z - aim.z) < reach + target.def.beam / 2 - 0.4;
      const chest = { x: aim.x, y: aim.y + lift, z: aim.z };
      return (
        Math.hypot(end.x - chest.x, end.y - chest.y, end.z - chest.z) < reach - 0.4 &&
        !lineBlocked(this.blocks, this.buildings, end, chest)
      );
    }
    return false;
  }

  updateDrill(bomb, a, b) {
    for (const hit of blockHits(this.blocks, this.buildings, a, b)) {
      if (bomb.crossed.has(hit.block.id)) continue;
      bomb.crossed.add(hit.block.id);
      this.breakBlock(hit.block, b);
      if (hit.block.kind === "slab" || hit.block.kind === "roof") {
        bomb.state.vy *= DRILL_SLOWDOWN;
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
    const def = BOMBS[bomb.kind];
    const centre = scatterCentre(point, s, burstGround(this.buildings, this.blocks, point, s, this.land));
    g.blast(point, 0.9, def.color, { quiet: true });
    g.audio.play("pop");
    const model = g.view.assets.has("bomblet") ? "bomblet" : "missile-friendly";
    const vy = s.vy * 0.8;
    const points = def.pattern ? patternPoints(def.pattern, centre, bomb.angle || 0) : scatterPattern(centre);
    for (const p of points) {
      // Each bomblet times its throw to the surface under its own landing point.
      const h = Math.max(0.3, point.y - surfaceBelow(this.buildings, this.blocks, p.x, p.z, this.land));
      const t = Math.max(0.25, (vy + Math.sqrt(vy * vy + 2 * -GRAVITY * h)) / -GRAVITY);
      const state = { x: point.x, y: point.y, z: point.z, vx: (p.x - point.x) / t, vy, vz: (p.z - point.z) / t };
      const mesh = g.view.model(model, V(point.x, point.y, point.z), 1);
      this.bombs.push({ kind: "bomblet", def, state, mesh, crossed: new Set(), time: 0, trail: 0, owner: bomb.owner, dead: false });
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
    const def = this.blastDef(bomb.kind === "bomblet" ? bomb.def || BOMBS.scatter : BOMBS[bomb.kind]);
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
    if (shelterStruck(this.blocks, this.buildings, point, bomb.kind, 0, def.pattern ? 1 : this.power)) this.abort();
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
    // Hulls in reach take the bomb's ship damage; the Island Belle aborts the strike.
    if (this.fleet) kills += this.fleet.hit(point, def, def.shipDamage ?? 1).length;
    for (const nest of this.aa) {
      if (nest.dead || nest.mounted || !exposed(nest, 0.6)) continue;
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
      if (prop.dead || prop.mounted) continue;
      const building = buildingById(this.buildings, prop.cur.b);
      if (!this.supported(building, prop.cur.f, prop.position.x, prop.position.z)) {
        this.destroy(prop, prop.type === "mast" ? 250 : 150);
        this.game.kills++;
      }
    }
  }

  abort(reason = "shelter", what = null) {
    if (this.aborted) return;
    this.aborted = true;
    this.abortedBy = what;
    this.say(reason === "ferry" ? "ferryHit" : "abort");
    this.game.finish(false, reason);
  }

  updateEvents() {
    const g = this.game;
    for (const event of this.events) {
      const members = this.enemies.filter((e) => !e.dead && e.plan.group === event.group);
      const alive = members.length;
      const status = rallyStatus(event, g.time);
      event.present = members.filter(
        (e) =>
          e.state === "route" &&
          Math.hypot(e.position.x - event.centre.x, e.position.y - event.centre.y, e.position.z - event.centre.z) < 2.2,
      ).length;
      event.status = status;
      event.alive = alive;
      event.ring.visible = alive > 0;
      const pulse = status.active ? 0.6 + Math.sin(g.time * 10) * 0.3 : status.next < 8 ? 0.45 : 0.18;
      event.ring.material.opacity = pulse;
      event.ring.material.color.set(status.active ? 0xff4b2b : 0xffc62b);
      event.ring.scale.setScalar(status.active ? 1 + Math.sin(g.time * 6) * 0.05 : 1);
      if (status.active && event.present >= Math.max(1, Math.ceil(alive / 2)) && !event.fired) {
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
        a.cells.visible = false;
        continue;
      }
      const { forecast, state, prediction } = this.preview(a, kind);
      a.forecast = forecast;
      forecast.prediction = prediction;
      const def = BOMBS[kind];
      // Only the next shooter's pipper is bright; the others show what they carry, dimmed.
      const primary = kind === this.selected && a === this.shooterFor(kind);
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
      const ringRadius =
        kind === "scatter"
          ? def.spread + def.radius * this.power * 0.6
          : kind === "shockwave"
            ? def.radius * this.power
            : kind === "lance"
              ? 1.8
              : def.pattern
                ? 0.7
                : 1.3 * this.power;
      for (const ring of a.pipperRings.outer) ring.scale.setScalar(ringRadius);
      for (const ring of a.pipperRings.inner) ring.scale.setScalar(primary ? 0.8 : 0.6);
      for (const child of a.pipper.children) {
        child.material.color.set(def.color);
        child.material.opacity = (primary ? 0.95 : 0.45) * (child.userData.solid ? 1 : 0.32);
      }
      const points = forecastPoints(forecast);
      const risk =
        forecast.crossesShelter ||
        Boolean(forecast.prediction?.civilian) ||
        points.some((p) => shelterStruck(this.blocks, this.buildings, p, p.kind, 0.6, def.pattern ? 1 : this.power));
      forecast.shelter = risk;
      this.drawCells(a, def.pattern ? points : null, risk ? 0x2f86e8 : def.color, primary);
      if (risk) {
        // Every pipper over a no-strike target turns blue; only the next release raises the alarm.
        if (primary) shelterWarning = true;
        for (const child of a.pipper.children) child.material.color.set(0x2f86e8);
      }
      if (kind === "lance") forecast.lock = this.lockTarget(impact, state);
    }
    this.markTargets();
    const lead = this.aircraft.find((a) => a.alive && a.forecast && a.forecast.kind === this.selected);
    const drill = lead?.forecast?.kind === "drill" ? lead.forecast : null;
    this.city.showBand(drill?.building || null, drill ? drill.floor : 0, BOMBS.drill.color);
    if (shelterWarning) this.say(this.fleet ? "ferry" : "shelter", 25);
    this.updateLockMarker();
    // The gold ring marks what the selected bomb will home onto.
    const shooter = this.shooterFor(this.selected);
    const assist = shooter?.forecast ? this.assistTarget(shooter.forecast.impact, this.selected, shooter.forecast.time) : null;
    this.assistMarker.visible = Boolean(assist) && this.flight.phase === "pass";
    if (assist) this.assistMarker.position.set(assist.position.x, assist.position.y + 0.12, assist.position.z);
    this.assistLock = assist;
    this.shelterWarning = shelterWarning;
  }

  // A pattern's bomblet cells and outline on the water.
  drawCells(a, points, color, primary) {
    a.cells.visible = Boolean(points);
    if (!points) return;
    const def = BOMBS[a.forecast.kind];
    a.cellRings.forEach((ring, i) => {
      const p = points[i];
      ring.visible = Boolean(p);
      if (!p) return;
      ring.position.set(p.x, a.forecast.impact.y + 0.14, p.z);
      ring.scale.setScalar(def.radius);
      ring.material.color.set(color);
      ring.material.opacity = primary ? 0.9 : 0.35;
    });
    const order = SHAPES[def.pattern].closed ? [...points, points[0]] : points;
    const positions = a.outline.geometry.attributes.position;
    order.forEach((p, i) => positions.setXYZ(i, p.x, a.forecast.impact.y + 0.16, p.z));
    positions.needsUpdate = true;
    a.outline.geometry.setDrawRange(0, order.length);
    a.outline.geometry.computeBoundingSphere();
    a.outline.material.color.set(color);
    a.outline.material.opacity = primary ? 0.85 : 0.3;
  }

  // Ships the selected pattern would hit light up yellow; the rest keep their red marker.
  markTargets() {
    if (!this.fleet) return;
    const lead = this.shooterFor(this.selected);
    const marked = new Set((lead?.forecast?.prediction?.ships || []).map((s) => s.ship.ship));
    for (const ship of this.fleet.ships) {
      if (ship.dead || ship.civilian) continue;
      ship.marker.material = markerMaterial(`${marked.has(ship) ? "target" : "ship"}${Math.max(1, ship.hp)}`);
    }
  }

  updateLockMarker() {
    const lead = this.aircraft.find((a) => a.alive && a.forecast?.kind === "lance" && this.selected === "lance");
    const lock = lead?.forecast?.lock;
    this.lockMarker.visible = Boolean(lock);
    if (lock) {
      this.lockMarker.position.set(lock.position.x, lock.position.y + 0.15, lock.position.z);
      this.lockMarker.scale.setScalar(1 + Math.sin(this.game.time * 8) * 0.08);
    }
    this.lanceLock = Boolean(lock);
  }

  // Coach hints for the teaching missions; the UI words them for keyboard or touch.
  hint() {
    const g = this.game;
    if (g.status !== "playing") return null;
    const lead = this.aircraft.find((a) => a.alive && a.forecast?.kind === this.selected);
    const over = lead?.forecast?.building?.id;
    const index = g.index;
    const lesson = this.layout.lesson;
    if (index === 0 && this.used === 0) return this.aim ? "aiming" : "aim";
    if (index === 0 && !this.reversed && this.flight.pass <= 2 && this.left().total > 0) return "reverse";
    if (index === 1 && !this.floorTouched && !this.aimUsed) return "floor";
    if (index === 2 && this.events.some((e) => e.alive && !e.status?.active && e.status?.next < 14)) return "rally";
    if (index === 3 && !this.salvoUsed && this.flight.pass <= 2) return "salvo";
    if (index === 4 && g.time < 14) return "shelter";
    if (this.selected === "lance") return this.lanceLock ? "lance" : "lanceNone";
    const prediction = lead?.forecast?.prediction;
    if (prediction?.civilian) return "ferry";
    if (lesson === "stick" && !this.rotated) return "rotate";
    if (lesson === "shapes" && this.used < 2) return "shapes";
    if (lesson === "ring" && this.used === 0) return "ring";
    if (isPattern(this.selected) && prediction?.sinks >= 2) return "fits";
    return null;
  }

  left() {
    const left = this.remaining();
    return { ...left, total: left.enemies + left.aa + left.masts + left.trucks + left.ships };
  }

  remaining() {
    return {
      enemies: this.enemies.filter((e) => !e.dead).length,
      aa: this.aa.filter((a) => !a.dead && !a.mounted).length,
      masts: this.masts.filter((m) => !m.dead).length,
      trucks: this.trucks.filter((t) => !t.dead).length,
      ships: this.fleet ? this.fleet.left() : 0,
    };
  }

  totalTargets() {
    const fixed = this.aa.filter((n) => !n.mounted).length;
    return this.enemies.length + fixed + this.masts.length + this.trucks.length + (this.fleet ? this.fleet.hostile().length : 0);
  }

  checkOutcome(dt) {
    const g = this.game;
    if (g.status !== "playing") return;
    const left = this.remaining();
    const total = left.enemies + left.aa + left.masts + left.trucks + left.ships;
    if (total === 0) {
      if (this.bombs.length) return;
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
      turn: this.flight.phase === "turn" ? FLIGHT.turnTime - this.flight.turn : 0,
      speed: this.flight.speed,
      dir: this.flight.dir,
      pass: this.flight.pass,
      harbour: Boolean(this.fleet),
      reversible: this.canReverse(),
      aim: this.aim ? { ...this.aimPoint(), marked: Boolean(this.aim?.target) } : null,
      radar: this.radar(),
      pattern: this.patternInfo(),
      events: [
        ...this.events.map((e) => ({
          label: e.label,
          place: e.place,
          alive: e.alive ?? e.members,
          members: e.members,
          present: e.present ?? 0,
          ...(e.status || rallyStatus(e, g.time)),
        })),
        ...(this.fleet ? this.fleet.events() : []),
      ],
      ladder: this.ladder(),
      left,
      total,
      used: this.used,
      par: this.layout.par,
      flak: (this.flakLocks || []).sort((a, b) => a.in - b.in),
      hint: this.hint(),
      shelter: this.shelterWarning,
      progress: total ? 1 - (left.enemies + left.aa + left.masts + left.trucks + left.ships) / total : 1,
      labels: [...this.patternLabels(), ...(this.fleet ? this.fleet.labels() : []), ...this.rallyLabels()],
    };
  }

  // What the minimap shows: the city, the flight, its pipper, the aim, and everything to hit.
  radar() {
    const a = this.shooterFor(this.selected) || this.aircraft.find((x) => x.alive);
    const dot = (t, kind) => ({ x: t.position.x, z: t.position.z, kind });
    return {
      bounds: this.bounds,
      flight: a ? { x: a.mesh.position.x, z: a.mesh.position.z, dir: this.flight.dir } : null,
      pipper: a?.forecast ? { x: a.forecast.impact.x, z: a.forecast.impact.z } : null,
      targets: [
        ...this.enemies.filter((e) => !e.dead).map((e) => dot(e, e.officer ? "officer" : "enemy")),
        ...this.aa.filter((n) => !n.dead && !n.mounted).map((n) => dot(n, "flak")),
        ...this.masts.filter((m) => !m.dead).map((m) => dot(m, "mast")),
        ...this.trucks.filter((t) => !t.dead).map((t) => dot(t, "truck")),
        ...(this.fleet ? this.fleet.ships.filter((s) => !s.dead).map((s) => dot(s, s.civilian ? "civilian" : "ship")) : []),
      ],
      rallies: this.events.filter((e) => e.alive > 0).map((e) => ({ x: e.centre.x, z: e.centre.z, active: Boolean(e.status?.active) })),
    };
  }

  // What the pattern panel shows: the selected shape, its angle and what it would hit.
  patternInfo() {
    const def = BOMBS[this.selected];
    if (!def?.pattern) return null;
    const p = this.shooterFor(this.selected)?.forecast?.prediction;
    return {
      kind: this.selected,
      name: def.name,
      angle: this.patternStep * 45,
      diagram: patternDiagram(def.pattern, this.patternAngle),
      hits: p?.hits ?? 0,
      sinks: p?.sinks ?? 0,
      civilian: Boolean(p?.civilian),
    };
  }

  // A hit counter floating over the selected pattern.
  patternLabels() {
    const lead = this.shooterFor(this.selected);
    if (!lead?.forecast?.prediction || this.flight.phase !== "pass") return [];
    const p = lead.forecast.prediction,
      at = lead.forecast.impact;
    // Hang the counter just south of the pattern, clear of the group labels over the ships.
    const south = Math.max(at.z, ...forecastPoints(lead.forecast).map((q) => q.z)) + 1.6;
    const text = p.civilian ? "CIVILIAN IN THE PATTERN" : p.hits ? `${p.hits} ON TARGET${p.sinks ? ` / ${p.sinks} SINK` : ""}` : "NO SHIPS";
    return [{ id: "pattern", x: at.x, y: at.y + 0.6, z: south, text, hot: p.hits > 1 && !p.civilian }];
  }

  rallyLabels() {
    return this.events
        .filter((e) => (e.alive ?? 1) > 0)
        .map((e) => ({
          id: `rally-${e.group}`,
          x: e.centre.x,
          y: e.centre.y + 2.8,
          z: e.centre.z,
          text: e.status?.active
            ? e.present
              ? `${e.label} / ${e.present} THERE / ${Math.ceil(e.status.remaining)}s`
              : `${e.label} / SCATTERED`
            : `${e.label} / ${Math.ceil(e.status?.next ?? e.at)}s`,
          hot: Boolean(e.status?.active && e.present),
        }));
  }
}
