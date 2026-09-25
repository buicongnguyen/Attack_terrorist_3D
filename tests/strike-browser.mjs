// Chapter 1 browser checks: mechanics plus a scripted pilot that flies every strike mission
// with the same controls a player has (lane, throttle, payload, drill floor, release).

export function autopilot() {
  const { game: g, ui } = window.__TIDELOCK__;
  const BOMB_KINDS = ["drill", "scatter", "shockwave", "lance"];
  const results = [];
  for (let index = 0; index < 6; index++) {
    ui.start(index);
    g.paused = false;
    const op = g.op;
    const unsafe = new Map();
    let task = null;
    let waitBombs = false;
    let jink = 0,
      jinkDir = 1;
    for (let step = 0; step < 120 * 420 && g.status === "playing"; step++) {
      if (step % 6 === 0 && !waitBombs) task = choose();
      steer(task);
      // Flak counter, as the HUD teaches: break sideways as soon as a lock's solution freezes.
      const lockIn = Math.min(9, ...op.aa.filter((n) => !n.dead && n.state === "lock").map((n) => (n.solution ? 0 : n.lock)));
      if (lockIn < 0.05 && jink <= 0) {
        jink = 1;
        jinkDir = op.flight.lateral > 0.5 ? -1 : 1;
      }
      if (jink > 0) {
        jink -= 1 / 120;
        g.input.z = jinkDir;
        // One bomb per task: wait for it to land before judging the next release.
      } else if (task && !waitBombs && tryRelease(task)) waitBombs = true;
      if (waitBombs && op.bombs.length === 0 && op.combo.timer <= 0) waitBombs = false;
      g.update(1 / 120);
    }
    g.input.x = g.input.z = 0;
    results.push({
      index,
      status: g.status,
      reason: g.reason,
      used: op.used,
      par: op.layout.par,
      time: Math.round(g.time),
      left: op.remaining(),
      stars: op.stars(g.status === "success"),
      lost: op.aircraft.filter((a) => !a.alive).length,
      score: g.score,
    });

    function has(kind) {
      return op.aircraft.some((a) => a.alive && a.payload[kind] > 0);
    }
    function count(kind) {
      return op.aircraft.reduce((n, a) => n + (a.alive ? a.payload[kind] || 0 : 0), 0);
    }
    function building(id) {
      return op.buildings.find((b) => b.id === id);
    }
    function pickKind(prefs, key) {
      const banned = unsafe.get(key) || new Set();
      return prefs.find((kind) => has(kind) && !banned.has(kind)) || null;
    }
    function rallyPending() {
      return op.events.some((e) => e.alive > 0);
    }
    // Keep Scatter for gatherings while one is still scheduled.
    function spare(kind) {
      if (kind !== "scatter" || !rallyPending()) return true;
      return count("scatter") > 1;
    }
    function choose() {
      const tasks = [];
      const roofTask = (target, pri, key) => {
        const b = building(target.cur.b);
        const kind = pickKind(["shockwave", "drill", spare("scatter") ? "scatter" : null, "lance"].filter(Boolean), key);
        if (kind) tasks.push({ key, pri, kind, floor: b ? b.floors + 1 : 1, aim: () => target.position, target });
      };
      op.aa.forEach((n, i) => !n.dead && roofTask(n, 0, `aa${i}`));
      op.masts.forEach((m, i) => !m.dead && roofTask(m, 1, `mast${i}`));
      op.events.forEach((e, i) => {
        if (e.alive < 1) return;
        const s = e.status || { active: false, next: 99 };
        if (!(s.active ? s.remaining > 2.6 : s.next < 2.2)) return;
        const indoor = e.centre.b && e.centre.f < building(e.centre.b).floors;
        const key = `rally${i}`;
        const kind = indoor ? pickKind(["drill"], key) : pickKind(["scatter", "shockwave", "drill"], key);
        if (kind) tasks.push({ key, pri: -1, kind, floor: indoor ? e.centre.f + 1 : building(e.centre.b)?.floors + 1 || 1, aim: () => e.centre, rally: e });
      });
      op.trucks.forEach((t, i) => {
        if (t.dead) return;
        const p = lead(t);
        if (window.__TIDELOCK_STRIKE__.shelterStruck(op.blocks, op.buildings, { x: p.x, y: p.y, z: p.z }, "shockwave", 1.5)) return;
        const kind = pickKind(["lance", "shockwave", spare("scatter") ? "scatter" : null].filter(Boolean), `truck${i}`);
        if (kind) tasks.push({ key: `truck${i}`, pri: 3, kind, floor: 1, aim: () => lead(t), target: t });
      });
      // Remaining fighters, grouped by building floor so one Drill can clear a room.
      const groups = new Map();
      for (const e of op.enemies) {
        if (e.dead || e.state === "fall") continue;
        const member = op.events.find((ev) => ev.group === e.plan.group);
        if (member && !e.hidden && (member.status?.next ?? 0) < 30 && e.state === "route") continue;
        // Walkers in the street are bombed one by one; two passing each other are not a group.
        const key = e.cur.b ? `${e.cur.b}:${e.cur.f}` : `street:${op.enemies.indexOf(e)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(e);
      }
      for (const [key, members] of groups) {
        const b = members[0].cur.b ? building(members[0].cur.b) : null;
        const indoor = b && members[0].cur.f < b.floors;
        const prefs = indoor ? ["drill"] : ["shockwave", "drill", spare("scatter") ? "scatter" : null].filter(Boolean);
        let kind = pickKind(prefs, key);
        // Out of Drills: a Shockwave in the street shatters the glass front of a ground floor.
        if (!kind && indoor && members[0].cur.f === 0 && members.every((m) => m.state !== "hide" || m.path.at(-1).t <= g.time)) {
          kind = pickKind(["shockwave", "scatter"], key + ":street");
          if (kind)
            tasks.push({
              key: key + ":street",
              pri: 5,
              kind,
              floor: 1,
              aim: () => ({ x: centroid(members.filter((m) => !m.dead)).x, y: 1, z: b.z + 4 + 1.2 }),
              target: { cur: { b: null } },
            });
          continue;
        }
        if (!kind) continue;
        tasks.push({
          key,
          pri: 4 - members.length * 0.1,
          kind,
          floor: indoor ? members[0].cur.f + 1 : b ? b.floors + 1 : 1,
          aim: () => centroid(members.filter((m) => !m.dead)),
          members,
        });
      }
      tasks.sort((a, b) => a.pri - b.pri);
      // Echo's advice for jumpy cells: the first strike goes on the gathering.
      const waiting = op.layout.alert && op.used === 0 && op.events.some((e) => e.alive > 1);
      if (waiting) return tasks.find((t) => t.rally) || null;
      return tasks[0] || null;
    }
    function centroid(list) {
      if (!list.length) return { x: 0, y: 0, z: 0 };
      const c = { x: 0, y: 0, z: 0 };
      for (const e of list) {
        const p = lead(e);
        c.x += p.x / list.length;
        c.y += p.y / list.length;
        c.z += p.z / list.length;
      }
      return c;
    }
    // Aim where a scheduled walker will be when the bomb arrives.
    function lead(e) {
      const route = e.plan?.route || e.route;
      if (!route || (e.state && e.state !== "route")) return e.position;
      const fall = Math.sqrt((2 * Math.max(1, 24 - e.position.y)) / 9.81);
      const p = window.__TIDELOCK_STRIKE__.sampleRoute(route, g.time + fall + 0.2);
      return p;
    }
    function shooter(kind) {
      return op.aircraft.find((a) => a.alive && a.payload[kind] > 0);
    }
    function steer(task) {
      g.input.x = 0;
      g.input.z = 0;
      if (!task) return;
      op.select(task.kind);
      op.setFloor(task.floor);
      const a = shooter(task.kind);
      const f = a?.forecast;
      if (!f || f.kind !== task.kind) return;
      const aim = task.aim();
      const error = aim.z - f.impact.z;
      g.input.z = Math.max(-1, Math.min(1, error * 0.9));
    }
    function tryRelease(task) {
      const a = shooter(task.kind);
      const f = a?.forecast;
      if (!a || !f || f.kind !== task.kind || a.cooldown > 0 || op.flight.phase !== "pass") return false;
      const aim = task.aim();
      const dx = f.impact.x - aim.x,
        dz = f.impact.z - aim.z;
      const tolerance = task.kind === "lance" ? 3 : task.kind === "scatter" ? 1.4 : 0.9;
      if (Math.abs(dx) > tolerance || Math.abs(dz) > 1.2) return false;
      if (task.kind === "drill") {
        const want = task.members?.[0]?.cur.b || task.target?.cur?.b || task.rally?.centre.b || null;
        if ((f.building?.id || null) !== want) return false;
      }
      if (f.shelter) {
        if (!unsafe.has(task.key)) unsafe.set(task.key, new Set());
        unsafe.get(task.key).add(task.kind);
        return false;
      }
      return op.release(task.kind);
    }
  }
  return results;
}

export async function checkStrike(page, check) {
  const mechanics = await page.evaluate(() => {
    const { game: g, ui } = window.__TIDELOCK__;
    const out = {};
    ui.start(1);
    g.paused = false;
    const op = g.op;
    out.threeDrills = op.aircraft[0].payload.drill === 3;
    op.setFloor(3);
    for (let i = 0; i < 20; i++) g.update(1 / 120);
    const forecast = op.aircraft[0].forecast;
    out.forecastExists = Boolean(forecast && forecast.points.length > 5);
    const before = op.flight.lane;
    g.input.z = 1;
    for (let i = 0; i < 120; i++) g.update(1 / 120);
    g.input.z = 0;
    out.laneSteering = op.flight.lane > before + 3;
    g.input.x = 1;
    for (let i = 0; i < 120; i++) g.update(1 / 120);
    g.input.x = 0;
    out.throttle = op.flight.speed > window.__TIDELOCK_STRIKE__.FLIGHT.speed + 0.5;
    const used = op.used;
    out.release = op.release("drill") && op.used === used + 1 && op.aircraft[0].payload.drill === 2;
    out.cooldown = !op.release("drill");
    for (let i = 0; i < 400; i++) g.update(1 / 120);
    out.bombResolved = op.bombs.length === 0;
    ui.start(3);
    g.paused = false;
    out.salvo = g.op.salvo() && g.op.bombs.length === 3 && g.op.used === 3;
    ui.start(0);
    g.paused = false;
    const s0 = g.op;
    s0.flight.phase = "turn";
    out.noReleaseInTurn = !s0.release("shockwave");
    // Losing the last aircraft waits for its bomb to land before the mission is called.
    ui.start(0);
    g.paused = false;
    for (let i = 0; i < 30; i++) g.update(1 / 120);
    g.op.release("shockwave");
    g.op.hitAircraft(g.op.aircraft[0]);
    g.op.hitAircraft(g.op.aircraft[0]);
    g.op.hitAircraft(g.op.aircraft[0]);
    g.update(1 / 120);
    out.flightLossWaitsForBombs = g.status === "playing" && g.op.bombs.length === 1;
    for (let i = 0; i < 600 && g.op.bombs.length; i++) g.update(1 / 120);
    for (let i = 0; i < 4; i++) g.update(1 / 120);
    out.thenMissionFails = g.status !== "playing";
    // The roof of the tallest tower is selectable.
    ui.start(5);
    g.op.setFloor(99);
    out.roofOfTallestTower = g.op.floor === 8;
    // People crossing a hole in their floor fall through it.
    ui.start(1);
    g.paused = false;
    for (const block of g.op.blocks) if (block.b === 0 && block.f === 3 && block.kind === "slab") {
      block.alive = false;
      g.op.city.hide(block);
    }
    for (let i = 0; i < 240; i++) g.update(1 / 120);
    out.peopleFallThroughHoles = g.op.enemies.filter((e) => e.cur.b === "T1").every((e) => e.cur.f < 3);
    return out;
  });
  for (const [name, value] of Object.entries(mechanics)) check(`strike ${name}`, value);

  const review = await page.evaluate(() => {
    const { game: g, ui } = window.__TIDELOCK__;
    const out = {};
    // Step the game until done() is true (or the step budget runs out); each() runs before every step.
    const until = (steps, done, each) => {
      for (let i = 0; i < steps && g.status === "playing" && !done(); i++) {
        each?.();
        g.update(1 / 120);
      }
      return done();
    };

    // Flak: holding course once the fire solution has frozen gets the target hit; breaking away dodges.
    const flakPass = (breakAway) => {
      ui.start(3);
      g.paused = false;
      const op = g.op;
      op.aa.slice(1).forEach((n) => (n.dead = true));
      const nest = op.aa[0];
      nest.cooldown = 0;
      op.flight.lane = nest.position.z;
      let target = null,
        solved = false,
        fired = false;
      until(
        120 * 20,
        () => fired && op.shells.length === 0,
        () => {
          g.input.x = 0;
          g.input.z = 0;
          if (!target && nest.state === "lock") target = nest.target;
          if (nest.solution) solved = true;
          if (target && nest.state === "idle" && op.shells.length) fired = true;
          if (breakAway && (nest.solution || op.shells.length)) g.input.z = op.flight.lane > 0 ? -1 : 1;
        },
      );
      return { lost: target ? target.maxHp - target.hp : -1, solved, fired };
    };
    const held = flakPass(false);
    const broke = flakPass(true);
    out.flakHitsAHeldCourse = held.fired && held.lost > 0;
    out.flakMissesABreakAfterTheSolution = broke.fired && broke.solved && broke.lost === 0;
    out.flakLockKeepsItsTarget = (() => {
      ui.start(3);
      g.paused = false;
      const nest = g.op.aa[0];
      nest.cooldown = 0;
      g.op.flight.lane = nest.position.z;
      let first = null,
        kept = true;
      until(120 * 20, () => nest.state === "idle" && first !== null, () => {
        if (nest.state === "lock") {
          first ??= nest.target;
          if (nest.target !== first) kept = false;
        }
      });
      return first !== null && kept;
    })();

    // Success waits for bombs that are still falling.
    ui.start(0);
    g.paused = false;
    until(30, () => false);
    g.op.release("shockwave");
    for (const t of g.op.targets()) {
      t.dead = true;
      if (t.marker) t.marker.visible = false;
    }
    g.update(1 / 120);
    out.successWaitsForBombs = g.status === "playing" && g.op.bombs.length === 1;
    until(1200, () => g.status !== "playing");
    out.thenSucceeds = g.status === "success";

    // A Drill detonates where its forecast said it would.
    ui.start(1);
    g.paused = false;
    const op = g.op;
    const tower = op.buildings.find((b) => b.id === "T1");
    op.flight.lane = tower.z;
    op.select("drill");
    op.setFloor(3);
    let predicted = null,
      landed = null;
    const detonate = op.detonate.bind(op);
    op.detonate = (bomb, point) => {
      landed ??= { x: point.x, y: point.y, z: point.z };
      return detonate(bomb, point);
    };
    until(120 * 20, () => landed !== null, () => {
      const f = op.aircraft[0].forecast;
      if (!predicted && f?.building?.id === "T1" && Math.abs(f.impact.x - tower.x) < 0.8) {
        predicted = { x: f.impact.x, y: f.impact.y, z: f.impact.z };
        op.release("drill");
      }
    });
    out.drillLandsOnItsForecast =
      Boolean(predicted && landed) && Math.hypot(predicted.x - landed.x, predicted.y - landed.y, predicted.z - landed.z) < 0.6;

    // A gathering only counts while its members are actually there.
    ui.start(2);
    g.paused = false;
    const op2 = g.op;
    const event = op2.events[0];
    const label = () => op2.snapshot().labels.find((l) => l.id === `rally-${event.group}`)?.text || "";
    out.rallyShowsWhoIsThere = until(120 * 40, () => event.status?.active && event.present > 0) && label().includes("THERE");
    for (const e of op2.enemies) if (e.plan.group === event.group) op2.hide(e, true);
    g.update(1 / 120);
    out.scatteredRallyIsNotCounted = event.present === 0 && label().includes("SCATTERED");

    // Coach hints and progressive controls.
    ui.start(0);
    ui.updateHUD(true);
    const coach = document.getElementById("coach");
    out.coachTeachesTheFirstPass = !coach.hidden && /ring/.test(coach.textContent);
    out.singleAircraftHidesFlightControls =
      document.getElementById("floor-control").hidden && document.getElementById("salvo").hidden && document.getElementById("formation").hidden;
    ui.start(5);
    ui.updateHUD(true);
    out.fullFlightShowsFlightControls =
      !document.getElementById("floor-control").hidden && !document.getElementById("salvo").hidden && !document.getElementById("formation").hidden;
    return out;
  });
  for (const [name, value] of Object.entries(review)) check(`strike ${name}`, value === true);

  const runs = await page.evaluate(`(${autopilot.toString()})()`);
  for (const run of runs) {
    console.log(`  strike 1.${run.index + 1}: ${run.status} ${run.reason || ""} used ${run.used}/${run.par} in ${run.time}s stars ${run.stars} lost ${run.lost} left ${JSON.stringify(run.left)}`);
    check(`strike mission 1.${run.index + 1} completed by scripted pilot`, run.status === "success");
  }
  return runs;
}
