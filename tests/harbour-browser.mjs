// Harbour strike checks (missions 1.7-1.9): pattern bombs, ships, the ferry, and a scripted pilot
// that wins each mission with the controls a player has (lane, speed, Reverse, payload, angle, release).

export function harbourPilot(indices) {
  const { game: g, ui } = window.__TIDELOCK__;
  const results = [];
  for (const index of indices) {
    ui.start(index);
    g.paused = false;
    const op = g.op;
    let target = null,
      waitBombs = false,
      jink = 0,
      jinkDir = 1,
      lastRelease = 0,
      reversals = 0;
    for (let step = 0; step < 120 * 420 && g.status === "playing"; step++) {
      if (step % 12 === 0 && !waitBombs) target = chooseGroup();
      steer();
      // Flak counter, as a player would: break sideways once the fire solution freezes.
      const lockIn = Math.min(9, ...op.aa.filter((n) => !n.dead && n.state === "lock").map((n) => (n.solution ? 0 : n.lock)));
      if (lockIn < 0.05 && jink <= 0) {
        jink = 1.1;
        jinkDir = op.flight.lateral > 0.5 ? -1 : 1;
      }
      if (jink > 0) {
        jink -= 1 / 120;
        g.input.z = jinkDir;
      } else if (step % 6 === 0 && !waitBombs && tryRelease()) {
        waitBombs = true;
        lastRelease = g.time;
      }
      if (waitBombs && op.bombs.length === 0) waitBombs = false;
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
      left: op.remaining().ships,
      stars: op.stars(g.status === "success"),
      lost: op.aircraft.filter((a) => !a.alive).length,
      reversals,
    });

    function aliveIn(group) {
      return group.ships.filter((s) => !s.dead && !s.civilian);
    }
    // The group with the most ships left, preferring one that is holding still.
    function chooseGroup() {
      const groups = op.fleet.groups.filter((gr) => aliveIn(gr).length);
      groups.sort((a, b) => weight(b) - weight(a));
      return groups[0] || null;
    }
    function weight(group) {
      const ships = aliveIn(group);
      const pose = window.__TIDELOCK_HARBOUR__.shipPose(group.data, group.ships.indexOf(ships[0]), g.time, group.plan);
      return ships.length + (pose.holding ? 0.5 : 0);
    }
    function centre(group, time) {
      const ships = aliveIn(group);
      const c = { x: 0, z: 0 };
      for (const s of ships) {
        const p = op.fleet.poseAt(s, time);
        c.x += p.x / ships.length;
        c.z += p.z / ships.length;
      }
      return c;
    }
    function steer() {
      g.input.x = 0;
      g.input.z = 0;
      if (!target) return;
      const a = op.shooterFor(op.selected) || op.aircraft.find((x) => x.alive && x.forecast);
      const f = a?.forecast;
      if (!f) return;
      const c = centre(target, g.time + f.time);
      g.input.z = Math.max(-1, Math.min(1, (c.z - f.impact.z) * 0.8));
      // A target well behind the pipper: turning round beats flying on to the edge.
      const ahead = (c.x - f.impact.x) * op.flight.dir;
      if (ahead < -12 && Math.abs(c.z - f.impact.z) < 4 && op.reverse()) reversals++;
    }
    // Try every loaded pattern at every angle from the shooter that would drop it; release the best
    // when it sinks enough of the target group (or anything, once it has been a while).
    function tryRelease() {
      if (op.flight.phase !== "pass" || !target) return false;
      const n = aliveIn(target).length;
      if (!n) return false;
      const need = g.time - lastRelease > 70 ? 1 : Math.min(n, 3);
      let best = null;
      for (const kind of Object.keys(window.__TIDELOCK_STRIKE__.BOMBS)) {
        const a = op.shooterFor(kind);
        if (!a || a.cooldown > 0) continue;
        const steps = window.__TIDELOCK_STRIKE__.BOMBS[kind].pattern ? [0, 1, 2, 3, 4, 5, 6, 7] : [op.patternStep];
        for (const s of steps) {
          const { prediction } = op.preview(a, kind, s);
          if (!prediction || prediction.civilian) continue;
          const score = prediction.sinks * 10 + prediction.hits;
          if (!best || score > best.score) best = { kind, s, score, prediction };
        }
      }
      if (!best || best.prediction.sinks < need) return false;
      op.select(best.kind);
      op.rotate(best.s - op.patternStep);
      return op.release(best.kind);
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
    // Speed is screen-relative: flying west, pushing right slows the flight down.
    g.input.x = 1;
    run(120);
    g.input.x = 0;
    out.pushingAgainstTheFlightSlowsIt = op.flight.speed < S.FLIGHT.speed - 0.5;
    // The edges turn the flight round by themselves.
    op.flight.x = -op.turnX - 0.1;
    run(2);
    out.edgesTurnTheFlightRound = op.flight.phase === "turn";

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
    out.sunkShipsCountAsKills = g.op.remaining().ships === 2 && g.score > 0;

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
    return out;
  });
  for (const [name, value] of Object.entries(mechanics)) check(`harbour ${name}`, value === true);

  const runs = await page.evaluate(`(${harbourPilot.toString()})([6, 7, 8])`);
  for (const run of runs) {
    console.log(
      `  harbour 1.${run.index + 1}: ${run.status} ${run.reason || ""} used ${run.used}/${run.par} in ${run.time}s stars ${run.stars} lost ${run.lost} ships left ${run.left} reversals ${run.reversals}`,
    );
    check(`harbour mission 1.${run.index + 1} completed by scripted pilot`, run.status === "success");
  }
  return runs;
}
