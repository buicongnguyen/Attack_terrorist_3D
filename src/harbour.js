import * as THREE from "three";
import {
  SHIPS,
  WATER_LEVEL,
  DECK_REACH,
  PERMANENT,
  REACTION,
  DODGE_LIMIT,
  fleetPlan,
  shipPose,
  stationStatus,
  hullDistance,
  shipReach,
  evasion,
  onLand,
} from "./harbour-data.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const FALLBACK = { "patrol-boat": "skiff", "missile-boat": "skiff", frigate: "boat", destroyer: "barge", ferry: "barge" };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// Damp an angle toward a target the short way round.
export const dampAngle = (from, to, rate, dt) => from + wrap(to - from) * (1 - Math.exp(-rate * dt));

// The Front's flotilla in a harbour mission: scheduled formations, evasive turns, hull hits.
export class Fleet {
  constructor(op) {
    this.op = op;
    this.game = op.game;
    this.land = op.layout.harbour?.land || null;
    this.groups = (op.layout.fleet || []).map((data) => ({ data, plan: fleetPlan(data), ships: [] }));
    this.ships = [];
    for (const group of this.groups)
      group.data.ships.forEach((cls, i) => {
        const ship = this.createShip(group, cls, i);
        group.ships.push(ship);
        this.ships.push(ship);
      });
    this.update(0);
  }

  createShip(group, cls, index) {
    const g = this.game,
      view = g.view;
    const def = SHIPS[cls];
    const model = view.assets.has(def.model) ? def.model : FALLBACK[def.model];
    const pose = shipPose(group.data, index, g.time, group.plan);
    const ship = g.entity("ship", model, V(pose.x, 0, pose.z), { hp: def.hp, radius: def.beam / 2, scale: def.scale || 1 });
    Object.assign(ship, {
      cls,
      def,
      group,
      index,
      maxHp: def.hp,
      civilian: Boolean(def.civilian),
      dodge: { x: 0, z: 0 },
      evade: null,
      sink: 0,
      wake: index * 0.07,
      smoke: 0,
      heading: pose.heading,
    });
    ship.turret = ship.mesh.getObjectByName("Turret") || ship.mesh.getObjectByName("TurretA");
    ship.guns = ["TurretF", "TurretA"].map((n) => ship.mesh.getObjectByName(n)).filter(Boolean);
    // Children of a scaled-down model (the pilot launch) are scaled back to full size.
    const k = def.scale || 1;
    ship.marker = new THREE.Sprite(this.op.marker(ship.civilian ? "civilian" : `ship${def.hp}`));
    ship.marker.scale.setScalar((ship.civilian ? 1.3 : 1.1) / k);
    ship.marker.position.set(0, (3.1 + def.beam * 0.4) / k, 0);
    ship.marker.renderOrder = 12;
    ship.mesh.add(ship.marker);
    if (ship.civilian) {
      // A no-strike ring on the water, like the shelter's roof light in the city.
      ship.halo = view.ring(V(0, 0.12 / k, 0), (def.length * 0.62) / k, 0x7fd8ff, 0.14 / k, ship.mesh);
      ship.halo.material.opacity = 0.6;
    }
    if (def.flak) ship.nest = this.op.createShipFlak(ship);
    return ship;
  }

  // Groups whose charge has been freed switch to their `freed` timetable from now on.
  checkFreed() {
    if (this.game.status !== "playing") return;
    for (const group of this.groups) {
      const freed = group.data.freed;
      if (!freed || group.freed) continue;
      const guards = this.groups.find((g) => g.data.id === freed.after);
      if (!guards || guards.ships.some((s) => !s.dead)) continue;
      group.freed = true;
      // Station headings are authored in degrees.
      const from = group.ships.map((s) => ({ x: s.position.x, z: s.position.z, heading: (s.heading * 180) / Math.PI }));
      // Sail from where it is now to the freed route, then stay there for the rest of the mission.
      group.data = {
        ...group.data,
        start: this.game.time,
        speed: freed.speed ?? group.data.speed,
        stations: [
          { ...from[0], hold: 0.01, slots: from },
          ...freed.stations.map((s) => ({ ...s, hold: PERMANENT })),
        ],
      };
      group.plan = fleetPlan(group.data);
      this.op.say("freed");
    }
  }

  // Pose a ship would have at `time` if nothing changed its course (dodge included). The
  // forecast, the hit test and the model all use this one pose, so they always agree.
  poseAt(ship, time) {
    const p = shipPose(ship.group.data, ship.index, time, ship.group.plan);
    return { x: p.x + ship.dodge.x, z: p.z + ship.dodge.z, heading: p.heading, moored: p.moored };
  }

  update(dt) {
    const g = this.game,
      t = g.time;
    this.checkFreed();
    for (const ship of this.ships) {
      if (ship.dead) {
        this.updateSinking(ship, dt);
        continue;
      }
      const course = shipPose(ship.group.data, ship.index, t, ship.group.plan);
      ship.moored = course.moored;
      this.updateDodge(ship, course, dt);
      const x = course.x + ship.dodge.x,
        z = course.z + ship.dodge.z;
      const moved = Math.hypot(x - ship.position.x, z - ship.position.z);
      // The hull keeps its timetable heading: a sidestep moves it without turning it.
      ship.heading = course.heading;
      ship.position.set(x, Math.sin(t * 1.3 + ship.index * 1.7) * 0.05, z);
      ship.mesh.rotation.set(0, -ship.heading - Math.PI / 2, Math.sin(t * 0.9 + ship.index) * 0.02);
      if (ship.nest) {
        const f = ship.def.flak.f;
        ship.nest.position.set(x + Math.cos(ship.heading) * f, ship.def.flak.y, z + Math.sin(ship.heading) * f);
      }
      this.updateGuns(ship, dt);
      if (dt > 0) this.effects(ship, moved / dt, dt);
      if (ship.halo) ship.halo.material.opacity = 0.45 + Math.sin(t * 3) * 0.2;
    }
  }

  // Sidestep falling bombs along the direction the forecast predicted, then drift back into
  // formation. Moored boats and civilians can't; nothing sails onto a quay.
  updateDodge(ship, course, dt) {
    const g = this.game,
      d = ship.dodge;
    const e = ship.evade;
    if (e && g.time >= e.start && g.time < e.until && !course.moored && !ship.civilian) {
      const step = ship.def.evade * Math.min(dt, e.until - g.time);
      const nx = d.x + e.dir.x * step,
        nz = d.z + e.dir.z * step;
      if (Math.hypot(nx, nz) <= DODGE_LIMIT && !onLand(this.land, course.x + nx, course.z + nz)) {
        d.x = nx;
        d.z = nz;
      }
      return;
    }
    if (e && g.time >= e.until) ship.evade = null;
    const len = Math.hypot(d.x, d.z);
    if (len > 0) {
      const back = Math.min(len, 0.5 * dt);
      d.x -= (d.x / len) * back;
      d.z -= (d.z / len) * back;
    }
  }

  updateGuns(ship, dt) {
    const lead = this.op.aircraft.find((a) => a.alive);
    if (!lead || !ship.guns.length) return;
    for (const gun of ship.guns) {
      // A turret that carries the ship's flak is aimed by the flak code instead.
      if (gun === ship.nest?.turret) continue;
      const d = lead.mesh.position.clone().sub(ship.position);
      gun.rotation.y = dampAngle(gun.rotation.y, Math.atan2(-d.x, -d.z) - ship.mesh.rotation.y, 3, dt);
    }
  }

  effects(ship, speed, dt) {
    const g = this.game;
    ship.wake -= dt;
    if (speed > 0.15 && ship.wake <= 0) {
      ship.wake = 0.35;
      const back = ship.def.length * 0.5;
      const p = V(ship.position.x - Math.cos(ship.heading) * back, 0.1, ship.position.z - Math.sin(ship.heading) * back);
      const ring = g.view.ring(p, 0.45, 0xdff9f2, 0.08);
      g.effects.push({ mesh: ring, life: 1.4, maxLife: 1.4, ring: true, growth: 1.8 });
    }
    if (ship.hp < ship.maxHp) {
      ship.smoke -= dt;
      if (ship.smoke <= 0) {
        ship.smoke = 0.14;
        g.puff(ship.position.clone().add(V(0, 1.6, 0)), 0x3b3440, 0.4, 1);
      }
    }
  }

  updateSinking(ship, dt) {
    if (!ship.mesh.parent || ship.sink === null) return;
    ship.sink += dt;
    ship.position.y = -Math.min(2.4, ship.sink * ship.sink * 0.35);
    ship.mesh.rotation.z = Math.min(0.45, ship.sink * 0.18);
    ship.mesh.rotation.x = Math.min(0.2, ship.sink * 0.06);
    if (Math.floor(ship.sink * 8) !== Math.floor((ship.sink - dt) * 8))
      this.game.puff(ship.position.clone().add(V(0, 1.2, 0)), 0x2f2c35, 0.5, 1.2);
    if (ship.sink > 3.4) {
      this.game.view.disposeObject(ship.mesh);
      ship.sink = null;
    }
  }

  // Bombs are away: ships the pattern would catch sidestep after REACTION seconds, the same
  // way (and as far) as the forecast assumed.
  evade(points, impactTime, radius) {
    const g = this.game;
    for (const ship of this.ships) {
      if (ship.dead || ship.civilian) continue;
      const pose = this.poseAt(ship, impactTime);
      if (pose.moored) continue;
      const step = evasion(ship.cls, pose, points, radius, impactTime - g.time);
      if (!step) continue;
      ship.evade = { dir: { x: step.dx, z: step.dz }, start: g.time + REACTION, until: impactTime };
    }
  }

  // Ships the forecast should consider at `time` (what the pipper's hit count reads).
  predicted(time) {
    return this.ships
      .filter((s) => !s.dead)
      .map((s) => {
        const pose = this.poseAt(s, time);
        return { ship: s, cls: s.cls, hp: s.hp, pose, moored: pose.moored, name: s.def.name };
      });
  }

  // A detonation at `point`: damage every hull in reach. Returns the ships it sank.
  hit(point, def, damage) {
    if (Math.abs(point.y - WATER_LEVEL) > DECK_REACH) return [];
    const sunk = [];
    for (const ship of this.ships) {
      if (ship.dead) continue;
      const pose = { x: ship.position.x, z: ship.position.z, heading: ship.heading };
      if (hullDistance(pose, ship.def.length, point) >= shipReach(ship.cls, def.radius)) continue;
      if (ship.civilian) {
        this.op.abort("ferry", ship.def.name);
        continue;
      }
      ship.hp -= damage;
      this.game.puff(ship.position.clone().add(V(0, 1, 0)), 0xffb35c, 0.5, 0.5);
      if (ship.hp <= 0) {
        this.sinkShip(ship);
        sunk.push(ship);
      } else ship.marker.material = this.op.marker(`ship${ship.hp}`);
    }
    return sunk;
  }

  sinkShip(ship) {
    const g = this.game;
    ship.dead = true;
    ship.hp = 0;
    ship.sink = 0;
    ship.marker.visible = false;
    g.score += ship.def.score;
    g.blast(ship.position.clone().add(V(0, 0.8, 0)), 1.6 + ship.def.length * 0.18, 0xffc62b, { quiet: true });
    if (ship.nest && !ship.nest.dead) this.op.destroyMounted(ship.nest);
  }

  hostile() {
    return this.ships.filter((s) => !s.civilian);
  }

  // Boats still to sink: the mission's quota, and never fewer than its key ships still afloat.
  left() {
    const hostile = this.hostile();
    const alive = hostile.filter((s) => !s.dead);
    const layout = this.op.layout;
    const keys = alive.filter((s) => layout.required?.includes(s.group.data.id)).length;
    return Math.max(this.needed() - (hostile.length - alive.length), keys);
  }

  needed() {
    return this.op.layout.quota ?? this.hostile().length;
  }

  // Intel strip entries: each labelled station with a timetable, like the city's gatherings.
  events() {
    const out = [];
    for (const group of this.groups) {
      const alive = group.ships.filter((s) => !s.dead && !s.civilian).length;
      group.data.stations.forEach((station, i) => {
        if (!station.label || station.hold >= PERMANENT) return;
        const status = stationStatus(group.data, i, this.game.time, group.plan);
        out.push({
          label: station.label,
          place: station.place || "",
          alive,
          members: group.ships.length,
          present: status.active ? alive : 0,
          ...status,
          centre: { x: station.x, y: 0, z: station.z },
          id: `${group.data.id}-${i}`,
        });
      });
    }
    return out;
  }

  // World labels: every labelled station, placed over the group while it is there.
  labels() {
    const out = [];
    for (const group of this.groups) {
      const alive = group.ships.filter((s) => !s.dead);
      if (!alive.length || alive.every((s) => s.civilian)) continue;
      group.data.stations.forEach((station, i) => {
        if (!station.label) return;
        const status = stationStatus(group.data, i, this.game.time, group.plan);
        if (!status.active && status.next > 12) return;
        const c = status.active
          ? alive.reduce((a, s) => ({ x: a.x + s.position.x / alive.length, z: a.z + s.position.z / alive.length }), { x: 0, z: 0 })
          : { x: station.x, z: station.z };
        const count = alive.filter((s) => !s.civilian).length;
        out.push({
          id: `fleet-${group.data.id}-${i}`,
          x: c.x,
          y: 4.2,
          z: c.z,
          text: status.active
            ? isFinite(status.remaining)
              ? `${station.label} / ${Math.ceil(status.remaining)}s`
              : `${station.label} / ${count}`
            : `${station.label} / ${Math.ceil(status.next)}s`,
          hot: status.active,
        });
      });
    }
    return out;
  }
}
