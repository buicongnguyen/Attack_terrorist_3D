import * as THREE from "three";
import {
  rescueLayout,
  RESCUE_HEIGHT,
  RESCUE_BOUNDS,
  RESCUE_GEAR,
  rearm,
  WINCH_SECONDS,
  hoverReady,
  rescueProgress,
  isHostileEntity,
} from "./rescue-data.js";
import { clamp } from "./physics.js";
import { MISSION_STORY } from "./story.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class RescueOperation {
  constructor(game) {
    this.game = game;
    const view = game.view;
    game.player = view.model("helicopter", V(0, RESCUE_HEIGHT, 18), 0.95);
    this.rotor = game.player.getObjectByName("Rotor");
    this.tailRotor = game.player.getObjectByName("TailRotor");
    this.heliTurret = game.player.getObjectByName("ChinTurret");
    this.heliMuzzle = game.player.getObjectByName("HeliMuzzle");
    game.shieldMeshes = game.createShields(3.1, 0);
    view.followPlayer(game.player.position, 0, true);
    this.vehicle = {
      accel: 60,
      drag: 4.1,
      max: 14,
      bounds: { left: RESCUE_BOUNDS.left, right: RESCUE_BOUNDS.right, far: RESCUE_BOUNDS.far, near: RESCUE_BOUNDS.near },
      height: RESCUE_HEIGHT,
      bob: 1.3,
      bank: 0.035,
      pitch: 0.016,
    };
    this.story = MISSION_STORY[game.index];
    this.said = new Set();
    this.layout = rescueLayout(game.mission.team, game.mission.crew);
    this.gear = { ...RESCUE_GEAR };
    this.rescued = 0;
    this.selected = 0;
    this.hoist = 0;
    this.hoistTarget = null;
    this.countermeasures = 0;
    this.flareCooldown = 0;
    this.baseCooldown = 0;
    this.state = "EN ROUTE";
    this.soldiers = this.layout.survivors.map((site, i) => {
      const soldier = game.entity(
        "survivor",
        "rescue-soldier",
        V(site.x, 1.15, site.z),
        {
          ...site,
          friendly: true,
          rescued: false,
          radius: 0.8,
          name: site.name,
          person: site.person,
          signal: i + 1,
        },
      );
      soldier.marker = game.view.ring(
        V(0, 0.08, 0),
        3.2,
        0x65f3b0,
        0.12,
        soldier.mesh,
      );
      soldier.wave = soldier.mesh.getObjectByName("WaveArm");
      return soldier;
    });
    this.soldiers.forEach((soldier, i) => this.populate(soldier, i));
    for (const item of this.layout.supplies) {
      const supply = game.spawnPickup(item.z, item.kind, item.x);
      supply.scrolling = false;
      supply.baseY = Math.abs(item.x) >= 12 ? 1.3 : 0.25;
      supply.position.y = supply.baseY;
    }
    this.cable = game.view.box(V(), V(0.025, 1, 0.025), 0xdbe6d3);
    this.cable.visible = false;
    this.hook = game.view.ring(V(), 0.35, 0xffdd7d, 0.075);
    this.hook.visible = false;
  }

  populate(site, index) {
    const g = this.game,
      side = Math.sign(site.position.x);
    this.cave(side * 37, site.position.z - 13, index * 2);
    this.cave(-side * 34, site.position.z - 25, index * 2 + 1);
    const cannon = g.entity(
      "cannon",
      "cannon",
      V(site.position.x + side * 8, 1.15, site.position.z - 7),
      {
        hp: 3,
        radius: 1.15,
        cooldown: 1.8,
        range: 30,
      },
    );
    cannon.warning = g.view.ring(V(0, 0.1, 0), 1.5, 0xff8168, 0.1, cannon.mesh);
    for (let n = 0; n < 2; n++) {
      const enemy = g.opponent(
        V(site.position.x + (n ? 5 : -6), 1.15, site.position.z - 7 - n * 4),
        { hp: 2, scale: 1.05 },
      );
      enemy.patrol = {
        x: enemy.position.x,
        z: enemy.position.z,
        phase: index + n * 2,
      };
      enemy.cooldown = 2.5 + n;
      enemy.range = 23;
    }
    const truck = g.entity(
      "aa-truck",
      "aa-truck",
      V(-side * 24, 1.15, site.position.z + 5),
      {
        hp: 7,
        radius: 1.65,
        cooldown: 3.2,
        range: 37,
        patrol: { x: -side * 24, z: site.position.z + 5, phase: index },
      },
    );
    truck.warning = g.view.ring(V(0, 0.1, 0), 2.3, 0xff8168, 0.1, truck.mesh);
    if (index > 0 || g.mission.team > 2)
      g.entity("drone", "drone", V(side * 12, 7.7, site.position.z - 19), {
        hp: 3,
        radius: 1,
        cooldown: 2.7,
        range: 33,
        home: V(side * 12, 7.7, site.position.z - 19),
      });
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
    cave.mouth = view.sphere(
      V(0, 0.38, 1.5),
      V(1.08, 0.93, 0.35),
      0x233c40,
      cave.mesh,
    );
    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(1.03, 0.17, 5, 12, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0xc4c7b5, roughness: 1 }),
    );
    arch.position.set(0, 0.25, 1.62);
    arch.userData.disposable = true;
    cave.mesh.add(arch);
    cave.crew = view.model("enemy", V(0, -0.6, 1.65), 0.85, cave.mesh);
    cave.launcher = view.box(
      V(0, -0.2, 1.4),
      V(0.75, 0.48, 1.25),
      0x9b6060,
      cave.mesh,
    );
    cave.mesh.scale.setScalar(0.01);
    cave.crew.visible = false;
    cave.launcher.visible = false;
    cave.warningRing = view.ring(
      V(0, -0.65, 1.6),
      1.3,
      0xff705f,
      0.08,
      cave.mesh,
    );
    cave.signalDelay = (index % 2) * 0.7;
  }

  objective() {
    if (this.rescued === this.soldiers.length)
      return {
        ...this.layout.base,
        name: "HIGHWATER PAD",
        sector: "RETURN TO BASE",
      };
    if (this.soldiers[this.selected]?.rescued)
      this.selected = this.soldiers.findIndex((s) => !s.rescued);
    const s = this.soldiers[this.selected];
    return {
      x: s.position.x,
      z: s.position.z,
      name: s.person || s.name,
      sector: this.layout.survivors[this.selected].sector,
    };
  }

  select(index) {
    if (this.soldiers[index] && !this.soldiers[index].rescued)
      this.selected = index;
  }

  flare() {
    const g = this.game;
    if (
      g.paused ||
      g.status !== "playing" ||
      !this.gear.flares ||
      this.flareCooldown > 0
    )
      return false;
    this.gear.flares--;
    this.countermeasures = 3;
    this.flareCooldown = 4;
    for (const shot of g.projectiles)
      if (
        shot.hostile &&
        shot.missile &&
        distance(shot.position, g.player.position) < 55
      )
        shot.distracted = true;
    for (let i = 0; i < 8; i++) {
      const p = g.player.position
        .clone()
        .add(V((i % 2 ? 1 : -1) * 1.1, -0.3, 0.8));
      g.puff(p, 0xffe5a2, 0.28, 1.4);
      const effect = g.effects[g.effects.length - 1];
      if (effect?.velocity)
        effect.velocity.set((i % 2 ? 1 : -1) * (2 + i * 0.5), -1, 2 + i * 0.35);
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
    if (pickup.kind === "ammo")
      this.gear.rockets = Math.min(24, this.gear.rockets + 10);
    if (pickup.kind === "support") {
      this.gear.guided = Math.min(12, this.gear.guided + 4);
      this.gear.flares = Math.min(6, this.gear.flares + 2);
    }
    g.score += 60;
    g.audio.play("pickup");
    g.puff(pickup.position, 0x8ff3c7, 0.8);
    g.notify(
      "toast",
      pickup.kind === "health"
        ? "SHIELDS RESTORED"
        : pickup.kind === "ammo"
          ? "ROCKETS +10"
          : "GUIDED +4 / FLARES +2",
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
    for (const e of g.entities) {
      if (e.dead) continue;
      const d = distance(e.position, g.player.position);
      e.mesh.visible = d < 76;
      if (e.type === "cave" && d < 46 && !Number.isFinite(e.appearAt))
        e.appearAt = g.time + e.signalDelay;
      if (e.type === "pickup") {
        e.body.rotation.y += dt * 0.35;
        e.position.y =
          (e.baseY ?? (Math.abs(e.position.x) >= 12 ? 1.3 : 0.25)) +
          Math.sin(g.time * 2 + e.position.z) * 0.07;
        if (d < 3.5) this.collect(e);
      }
      if (e.type === "survivor" && !e.rescued) {
        if (e.wave) e.wave.rotation.z = Math.sin(g.time * 4) * 0.25;
        e.marker.material.opacity = 0.45 + Math.sin(g.time * 3) * 0.15;
        continue;
      }
      if (!["enemy", "cannon", "aa-truck", "drone"].includes(e.type) || d > 48)
        continue;
      if (e.patrol) {
        e.position.z =
          e.patrol.z +
          Math.sin(
            g.time * (e.type === "aa-truck" ? 0.22 : 0.5) + e.patrol.phase,
          ) *
            (e.type === "aa-truck" ? 7 : 2);
        e.position.x =
          e.patrol.x +
          Math.cos(g.time * 0.45 + e.patrol.phase) *
            (e.type === "enemy" ? 1.5 : 0);
      }
      if (e.type === "drone") {
        const goal = d < 32 ? g.player.position : e.home;
        const dir = goal.clone().sub(e.position).setY(0);
        if (dir.length() > 10)
          e.position.addScaledVector(dir.normalize(), dt * 3.3);
        e.position.y = 7.7 + Math.sin(g.time * 2 + e.position.z) * 0.4;
        if (e.rotor === undefined) e.rotor = e.mesh.getObjectByName("DroneRotor") || null;
        if (e.rotor) e.rotor.rotation.y += dt * 32;
      }
      if (d > e.range || e.launcherDisabled) continue;
      e.cooldown -= dt;
      if (e.turretNode === undefined) {
        let node = e.mesh.getObjectByName("TruckTurret");
        if (!node)
          e.mesh.traverse((child) => {
            if (!child.isMesh && /^Turret[._\d]*$/.test(child.name)) node = child;
          });
        e.turretNode = node || null;
      }
      const turret = e.turretNode;
      if (turret)
        turret.rotation.y = Math.atan2(
          e.position.x - g.player.position.x,
          e.position.z - g.player.position.z,
        );
      if (e.warning) e.warning.material.opacity = e.cooldown < 0.9 ? 0.7 : 0.12;
      if (e.cooldown <= 0) {
        const missile = e.type === "aa-truck";
        const origin = g.targetPosition(e);
        g.spawnShot(
          origin,
          g.player.position.clone().addScaledVector(g.velocity, 0.3),
          missile,
          true,
        );
        e.cooldown =
          e.type === "enemy"
            ? 3.4
            : e.type === "drone"
              ? 2.6
              : missile
                ? 5.5
                : 3;
      }
    }
    this.updateCaves(dt);
    this.updateWinch(dt);
    g.entities = g.entities.filter((e) => !e.dead || e.fallTime !== undefined);
  }

  updateWinch(dt) {
    const g = this.game;
    const soldier = this.soldiers
      .filter((s) => !s.rescued)
      .sort(
        (a, b) =>
          distance(a.position, g.player.position) -
          distance(b.position, g.player.position),
      )[0];
    const atBase = distance(g.player.position, this.layout.base) < 5;
    const site = atBase ? this.layout.base : soldier?.position;
    const danger =
      site &&
      g.entities.some(
        (e) =>
          isHostileEntity(e) &&
          !e.launcherDisabled &&
          distance(e.position, site) < 9,
      );
    const near = site && distance(g.player.position, site) < 4.2;
    const ready =
      site && hoverReady(g.player.position, g.velocity, site, danger);
    this.canWinch = Boolean(near);
    this.state = near
      ? danger
        ? "ZONE CONTESTED"
        : ready
          ? atBase
            ? "BASE / READY"
            : "WINCH READY"
          : "STABILIZING"
      : this.rescued === this.soldiers.length
        ? "RETURN TO BASE"
        : "EN ROUTE";
    const target = atBase ? "base" : soldier;
    if (target !== this.hoistTarget) {
      if (this.hoistTarget?.type === "survivor" && !this.hoistTarget.rescued)
        this.hoistTarget.position.y = 1.15;
      this.hoist = 0;
      this.hoistTarget = target;
    }
    this.cable.visible = false;
    this.hook.visible = false;
    if (g.input.winch && ready && (atBase || soldier)) {
      this.hoist += dt;
      this.state = atBase ? "LANDING" : "HOISTING";
      const t = clamp(this.hoist / WINCH_SECONDS, 0, 1);
      if (!atBase) {
        const bottom = 1.15 + t * (RESCUE_HEIGHT - 2.1);
        soldier.position.y = bottom;
        this.cable.position.set(
          soldier.position.x,
          (bottom + g.player.position.y) / 2,
          soldier.position.z,
        );
        this.cable.scale.y = Math.max(0.1, g.player.position.y - bottom);
        this.cable.visible = true;
        this.hook.position.set(
          soldier.position.x,
          bottom + 0.1,
          soldier.position.z,
        );
        this.hook.visible = true;
      }
      if (this.hoist >= WINCH_SECONDS) {
        this.hoist = 0;
        if (atBase) {
          if (this.rescued === this.soldiers.length) {
            this.say("success");
            g.finish(true);
          }
          else if (this.baseCooldown <= 0) {
            g.shields = [3, 3, 3];
            this.gear = rearm(this.gear);
            this.baseCooldown = 15;
            g.notify("toast", "BASE / REPAIRED AND REARMED");
          }
        } else {
          soldier.rescued = true;
          soldier.dead = true;
          g.view.disposeObject(soldier.mesh);
          this.rescued++;
          g.score += 350;
          g.audio.play("pickup");
          g.notify(
            "toast",
            this.rescued === this.soldiers.length
              ? "TEAM ABOARD / RETURN TO BASE"
              : `${(soldier.person || soldier.name).toUpperCase()} ABOARD`,
          );
          if (this.rescued === this.soldiers.length) this.say("pickup");
          this.objective();
        }
      }
    } else {
      this.hoist = 0;
      if (soldier && !soldier.rescued) soldier.position.y = 1.15;
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
      if (e.crew.visible) {
        e.crew.position.y = -0.6 + Math.min(e.timer, 1) * 0.15;
        e.crew.rotation.x = e.phase === "enemy" ? Math.max(0, 1 - e.timer) * 0.9 : 0;
      }
      e.warningRing.visible = e.phase === "launcher";
      if (e.warningRing.visible) e.warningRing.material.opacity = 0.3 + Math.sin(g.time * 7) * 0.25;
    }
  }

  // A landed hit collapses the cave mouth for good; missiles already in the air keep flying.
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
    g.blast(g.targetPosition(e), 1.5, 0xffd36b);
  }

  stars(success) {
    if (!success) return 0;
    const damage = this.game.damageTaken;
    return damage === 0 ? 3 : damage <= 1 ? 2 : 1;
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
      hoist: this.hoist / WINCH_SECONDS,
      canWinch: this.canWinch,
      flareCooldown: this.flareCooldown,
      progress: rescueProgress(
        this.rescued,
        this.soldiers.length,
        distance(g.player.position, this.layout.base),
      ),
    };
  }
}
