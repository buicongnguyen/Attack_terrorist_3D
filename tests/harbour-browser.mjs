// Harbour strike checks (missions 1.7-1.9): pattern bombs, ships, the ferry, and a scripted pilot
// that wins each mission with the controls a player has: it picks a group, the pattern and angle
// that sink most of it, marks the spot (as a click on the map does) and lets the flight fly
// there and drop; it breaks away from flak by hand.

export function harbourPilot(indices) {
  const { game: g, ui } = window.__TIDELOCK__;
  const H = window.__TIDELOCK_HARBOUR__,
    S = window.__TIDELOCK_STRIKE__;
  const results = [];
  for (const index of indices) {
    ui.start(index);
    g.paused = false;
    const op = g.op;
    let plan = null,
      waitBombs = false,
      jink = 0,
      jinkDir = 1,
      used = 0,
      marks = 0;
    for (let step = 0; step < 120 * 420 && g.status === "playing"; step++) {
      if (!waitBombs && (!plan || step % 30 === 0)) {
        if (!plan || plan.group.ships.every((s) => s.dead)) plan = choose();
        if (plan) mark(plan);
      }
      // Flak counter, as a player would: break sideways once the fire solution freezes.
      const lockIn = Math.min(9, ...op.aa.filter((n) => !n.dead && n.state === "lock").map((n) => (n.solution ? 0 : n.lock)));
      if (lockIn < 0.05 && jink <= 0) {
        jink = 1.1;
        jinkDir = op.flight.lateral > 0.5 ? -1 : 1;
      }
      g.input.z = 0;
      if (jink > 0) {
        jink -= 1 / 120;
        g.input.z = jinkDir;
      }
      g.update(1 / 120);
      if (op.used > used) {
        used = op.used;
        waitBombs = true;
        plan = null;
        op.clearAim();
      }
      if (waitBombs && op.bombs.length === 0) waitBombs = false;
    }
    g.input.x = g.input.z = 0;
    results.push({
      index,
      status: g.status,
      reason: g.reason,
      used: op.used,
      par: op.layout.par,
      time: Math.round(g.time),
      left: op.remaining().ships,
      stars: op.stars(g.status === "success"),
      lost: op.aircraft.filter((a) => !a.alive).length,
      marks,
    });

    function alive(group) {
      return group.ships.filter((s) => !s.dead && !s.civilian);
    }
    function loaded() {
      return Object.keys(S.BOMBS).filter((kind) => op.aircraft.some((a) => a.alive && a.payload[kind] > 0));
    }
    // The group and fit worth most now: sinks first, key groups before the rest, near before far.
    function choose() {
      const fall = 2.2;
      const ships = op.fleet.predicted(g.time + fall);
      const flight = op.flight.x;
      let best = null;
      for (const group of op.fleet.groups) {
        const left = alive(group);
        if (!left.length) continue;
        const mine = ships.filter((s) => s.ship.group === group);
        const c = mine.reduce((a, s) => ({ x: a.x + s.pose.x / mine.length, z: a.z + s.pose.z / mine.length }), { x: 0, z: 0 });
        const key = op.layout.required?.includes(group.data.id) ? 25 : 0;
        for (const kind of loaded()) {
          const def = S.BOMBS[kind];
          const steps = def.pattern ? (kind === "ring" ? [0] : [0, 1, 2, 3, 4, 5, 6, 7]) : [0];
          // Centred on the group, or on any one of its boats (a row, a raft, a hull).
          const centres = [c, ...mine.filter((s) => !s.ship.dead).map((s) => ({ x: s.pose.x, z: s.pose.z }))];
          for (const step of steps)
            for (const centre of centres) {
              const at = centre;
              const offset = { x: at.x - c.x, z: at.z - c.z };
              const points = def.pattern
                ? H.patternPoints(def.pattern, at, step * H.ROTATION_STEP).map((p) => ({ ...p, y: 0.05, kind }))
                : [{ x: at.x, y: 0.05, z: at.z, kind }];
              const r = H.predictHits(mine, points, def.radius, def.shipDamage ?? 1, fall);
              if (!r.sinks) continue;
              const score = r.sinks * 10 + r.hits + key - Math.abs(at.x - flight) / 12;
              if (!best || score > best.score) best = { group, kind, step, at, offset, score, points };
            }
        }
      }
      // Never a pattern that would touch a civilian.
      if (best && H.predictHits(ships, best.points, S.BOMBS[best.kind].radius).civilian) return null;
      return best;
    }
    // Select the payload and angle, then mark the spot: the flight flies there and drops by itself.
    function mark(p) {
      op.select(p.kind);
      op.setPatternStep(p.step);
      // Moving groups: keep the mark on the group's centre where it will be when the bombs land.
      const ships = alive(p.group);
      const c = ships.reduce((a, s) => {
        const pose = op.fleet.poseAt(s, g.time + 2.2);
        return { x: a.x + pose.x / ships.length, z: a.z + pose.z / ships.length };
      }, { x: 0, z: 0 });
      op.aim = { x: c.x + p.offset.x, z: c.z + p.offset.z };
      marks++;
    }
  }
  return results;
}

export async function checkHarbour(page, check) {
  const mechanics = await page.evaluate(() => {
    const { game: g, ui } = window.__TIDELOCK__;
    const H = window.__TIDELOCK_HARBOUR__,
      S = window.__TIDELOCK_STRIKE__;
    const out = {};
    const run = (steps) => {
      for (let i = 0; i < steps && g.status === "playing"; i++) g.update(1 / 120);
    };
    // The harbour opens on the pattern it teaches; turning it changes the angle and the diagram.
    ui.start(6);
    g.paused = false;
    run(12);
    const op = g.op;
    const before = op.snapshot().pattern;
    op.rotate(1);
    run(12);
    const after = op.snapshot().pattern;
    out.opensOnThePattern = op.selected === "stick" && before.angle === 0;
    out.rotatesByFortyFive = after.angle === 45 && Math.abs(after.diagram[4].x - after.diagram[4].z) < 1e-9;
    op.rotate(-1);
    // Reverse: a wingover back along the same lane, then the flight flies the other way.
    const x0 = op.flight.x,
      lane = op.flight.lane;
    out.reverseStartsATurn = op.reverse() && op.flight.phase === "turn" && !op.canRelease();
    run(Math.ceil(S.FLIGHT.turnTime * 120) + 2);
    out.reverseFliesBack = op.flight.phase === "pass" && op.flight.dir === -1 && Math.abs(op.flight.x - x0) < 0.3 && Math.abs(op.flight.lane - lane) < 0.3;
    // Speed is screen-relative: flying west, a push to the right slows the flight (held on, it
    // would turn round).
    run(120);
    const pace = op.flight.speed;
    g.input.x = 1;
    run(Math.floor(S.FLIGHT.backHold * 120) - 6);
    g.input.x = 0;
    out.pushingAgainstTheFlightSlowsIt = pace > 1 && op.flight.speed < pace - 0.5 && op.flight.dir === -1 && op.flight.phase === "pass";
    // Drifting on, the edge of the safe airspace turns the flight round by itself.
    run(60);
    const steady = op.flight.phase === "pass" && op.flight.dir === -1;
    op.flight.x = -op.turnX - 0.1;
    run(2);
    out.edgesTurnTheFlightRound = steady && op.flight.phase === "turn";

    // A pattern bomb bursts into its shape and the counter matches what sinks.
    ui.start(6);
    g.paused = false;
    const column = g.op.fleet.groups.find((x) => x.data.id === "column");
    const station = column.data.stations[0];
    // Just below burst height, so it bursts on the next step.
    const bomb = { kind: "stick", state: { x: station.x, y: 5.9, z: station.z, vx: 0, vy: -1, vz: 0 }, mesh: g.view.model("bomb-cluster"), angle: Math.PI / 4, owner: g.op.aircraft[0], dead: false };
    g.op.bombs.push(bomb);
    run(1);
    out.stickBurstsIntoFive = g.op.bombs.filter((b) => b.kind === "bomblet").length === 5;
    run(240);
    out.alignedStickSinksTheColumn = column.ships.every((s) => s.dead);
    // The four column boats come off the mission's quota.
    out.sunkShipsCountAsKills = g.op.remaining().ships === g.op.fleet.needed() - 4 && g.score > 0;
    // Once the quota is met the rest may run, but not a key ship: the channel column must go.
    const ships = g.op.fleet.hostile();
    ships.filter((s) => s.group.data.id !== "column").forEach((s) => (s.dead = true));
    column.ships.forEach((s) => (s.dead = false));
    out.quotaWaitsForTheKeyShips = g.op.remaining().ships === 4;
    column.ships.forEach((s) => (s.dead = true));
    ships.filter((s) => s.group.data.id !== "column").slice(0, ships.length - g.op.fleet.needed()).forEach((s) => (s.dead = false));
    out.quotaLetsTheRestRun = g.op.remaining().ships === 0;

    // The hit counter tells the truth, sidesteps included: fly the pattern onto its target, read
    // the counter, release, and count what sinks.
    const trueCount = (index, kind, step, pick) => {
      ui.start(index);
      g.paused = false;
      run(24);
      const o = g.op;
      o.select(kind);
      o.rotate(step - o.patternStep);
      const target = pick(o);
      for (let k = 0; k < 8; k++) {
        const f = o.preview(o.shooterFor(kind), kind).forecast;
        o.flight.x += target.x - f.impact.x;
        o.flight.lane += target.z - f.impact.z;
        run(1);
      }
      const said = o.preview(o.shooterFor(kind), kind).prediction.sinks;
      const before = o.remaining().ships;
      o.release(kind);
      run(120 * 4);
      return { said, sank: before - o.remaining().ships };
    };
    const columnRun = trueCount(6, "stick", 1, (o) => o.layout.fleet[0].stations[0]);
    out.counterMatchesTheColumn = columnRun.said === 4 && columnRun.sank === 4;
    const ringRun = trueCount(8, "ring", 0, (o) => o.fleet.ships.find((s) => s.cls === "ferry").position);
    out.counterMatchesTheRing = ringRun.said >= 4 && ringRun.sank === ringRun.said && g.status === "playing";
    // Payload keys follow the chips on screen, card by card.
    ui.start(8);
    const chips = [...new Set([...document.querySelectorAll("#flight-cards [data-bomb]")].map((c) => c.dataset.bomb))];
    out.payloadKeysFollowTheChips = JSON.stringify(ui.flightKinds()) === JSON.stringify(chips) && chips[0] === "stick";
    // A trackpad's small wheel deltas add up to one step per notch; sideways scrolls do nothing.
    g.paused = false;
    const step0 = g.op.patternStep;
    const wheel = (dy, dx = 0) => g.view.canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: dy, deltaX: dx, cancelable: true }));
    for (let k = 0; k < 3; k++) wheel(-30);
    const early = g.op.patternStep;
    wheel(-30);
    wheel(0, 120);
    out.wheelStepsPerNotch = early === step0 && g.op.patternStep === (step0 + 1) % 8;
    // Just past an edge turn, Reverse would only send the flight back out: it is refused.
    const edge = g.op;
    edge.flight.x = edge.turnX + 0.5;
    edge.flight.dir = 1;
    run(1);
    run(Math.ceil(S.FLIGHT.turnTime * 120) + 1);
    out.reverseRefusedAtTheEdge = edge.flight.dir === -1 && edge.flight.phase === "pass" && !edge.canReverse() && !edge.reverse();
    // The tick a turn ends, the aircraft already carry the new speed a release will inherit.
    edge.flight.x = 0;
    edge.reverse();
    let vx = null;
    for (let i = 0; i < 400 && edge.flight.phase === "turn"; i++) {
      run(1);
      if (edge.flight.phase === "pass") vx = edge.aircraft[0].velocity.x;
    }
    out.releaseSpeedAfterTurn = vx !== null && Math.abs(vx - edge.flight.speed * edge.flight.dir) < 1e-9;
    // Ships turn away from falling bombs; moored boats can't.
    ui.start(7);
    g.paused = false;
    run(60);
    const frigate = g.op.fleet.ships.find((s) => s.cls === "frigate");
    const moored = g.op.fleet.ships.find((s) => s.group.data.id === "dock");
    // Bombs about to land a metre off each hull.
    g.op.fleet.evade([{ x: frigate.position.x + 1, z: frigate.position.z }, { x: moored.position.x + 1, z: moored.position.z }], g.time + 2.2, 1.3);
    run(200);
    // A gentle sidestep: the frigate moves a few tenths of a metre, as the forecast assumed.
    out.shipsDodgeFallingBombs = Math.hypot(frigate.dodge.x, frigate.dodge.z) > 0.3;
    out.mooredBoatsCannotDodge = Math.hypot(moored.dodge.x, moored.dodge.z) === 0;
    // Flak on a ship dies with it.
    const nest = frigate.nest;
    g.op.fleet.sinkShip(frigate);
    out.shipFlakDiesWithItsShip = nest.dead && !g.op.aa.some((n) => n.mounted && !n.dead && n.mounted === frigate);

    // Hitting a civilian aborts the strike.
    ui.start(7);
    g.paused = false;
    run(12);
    const launch = g.op.fleet.ships.find((s) => s.civilian);
    g.op.detonate({ kind: "stick", mesh: g.view.model("bomb-cluster"), dead: false }, { x: launch.position.x, y: 0.05, z: launch.position.z });
    out.civilianHitAborts = g.status === "failed" && g.reason === "ferry";

    // The pattern warns before that: a forecast over the ferry is flagged.
    ui.start(8);
    g.paused = false;
    run(12);
    const ferry = g.op.fleet.ships.find((s) => s.cls === "ferry");
    const points = H.patternPoints("stick", { x: ferry.position.x, z: ferry.position.z }, 0);
    out.forecastSeesTheFerry = H.predictHits(g.op.fleet.predicted(g.time), points, 1.3).civilian === "Island Belle";
    // Breaking the escort ring frees the ferry, which sails for the quay.
    for (const s of g.op.fleet.ships) if (s.group.data.id === "ring") g.op.fleet.sinkShip(s);
    const ferryX = ferry.position.x;
    run(120 * 8);
    out.brokenRingFreesTheFerry = ferry.group.freed && ferry.position.x < ferryX - 2;
    // A mark in the far west basin: the flight flies over there, the camera slides after it,
    // and the Stick laid across a boatyard row sinks the row.
    ui.start(6);
    g.paused = false;
    run(12);
    const yard = g.op.fleet.groups.find((x) => x.data.id === "boatyard");
    const row = yard.ships.slice(0, 4);
    g.op.select("stick");
    g.op.setPatternStep(0);
    g.op.setAim({ x: -56, z: -9 });
    // The click lands 1.4 m from a raider, so the mark snaps to it and follows it.
    const marked = Boolean(g.op.aim?.target);
    for (let i = 0; i < 120 * 150 && g.op.used === 0 && g.status === "playing"; i++) run(1);
    run(120 * 5);
    out.harbourMarkFliesThereAndSinksTheRow = marked && g.op.used === 1 && row.every((ship) => ship.dead);
    out.cameraSlidWest = g.view.strikeFollow.x < -20;
    // The angle buttons point the Stick across, down or on either diagonal; the lit one flips it.
    g.op.setPatternStep(0);
    ui.updateHUD(true);
    document.querySelector('#ladder-floors [data-turn="2"]')?.click();
    const down = g.op.patternStep === 2;
    document.querySelector('#ladder-floors [data-turn="2"]')?.click();
    out.angleButtonsTurnAndFlip = down && g.op.patternStep === 6;
    // A mark on a boat that never stops (a raider circling in the outer roads) still gets its drop:
    // the flight flies along with it.
    ui.start(7);
    g.paused = false;
    run(12);
    const circler = g.op.fleet.groups.find((x) => x.data.id === "roadsRing").ships[0];
    g.op.select("stick");
    g.op.setAim(circler.position, circler);
    for (let i = 0; i < 120 * 90 && g.op.used === 0 && g.status === "playing"; i++) run(1);
    out.markOnAMovingBoatDrops = g.op.used === 1;
    // Badges, not sentences: every group over the water is a symbol and a count.
    ui.start(8);
    g.paused = false;
    run(24);
    const badges = g.op.fleet.labels();
    out.harbourBadgesAreShort = badges.length > 5 && badges.every((l) => l.text.length <= 12 && /^[★●] \d/.test(l.text));
    out.keyShipsWearStars = badges.some((l) => l.kind === "key" && l.text.startsWith("★"));
    return out;
  });
  for (const [name, value] of Object.entries(mechanics)) check(`harbour ${name}`, value === true);

  const runs = await page.evaluate(`(${harbourPilot.toString()})([6, 7, 8])`);
  for (const run of runs) {
    console.log(
      `  harbour 1.${run.index + 1}: ${run.status} ${run.reason || ""} used ${run.used}/${run.par} in ${run.time}s stars ${run.stars} lost ${run.lost} ships left ${run.left} marks ${run.marks}`,
    );
    check(`harbour mission 1.${run.index + 1} completed by scripted pilot`, run.status === "success");
  }
  return runs;
}
