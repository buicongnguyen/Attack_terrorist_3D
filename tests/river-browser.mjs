// Chapter 2 browser checks: convoy mechanics and a scripted skipper for every river mission.

export function skipper() {
  const { game: g, ui } = window.__TIDELOCK__;
  const out = [];
  for (let index = 6; index <= 8; index++) {
    ui.start(index);
    g.paused = false;
    const op = g.op;
    for (let step = 0; step < 120 * 240 && g.status === "playing"; step++) {
      if (step % 4 === 0) decide();
      g.update(1 / 120);
    }
    g.input.fire = false;
    g.input.x = g.input.z = 0;
    g.input.stickAim = null;
    out.push({
      index,
      status: g.status,
      reason: g.reason,
      distance: Math.round(op.distance),
      length: op.data.length,
      barges: op.barges.map((b) => Math.round(b.hp)),
      shields: g.shields.reduce((a, b) => a + b, 0),
      stars: op.stars(g.status === "success"),
      blocked: op.blocked,
      boss: op.boss?.phase || null,
      time: Math.round(g.time),
    });
  }
  return out;

  function decide() {
    const op = g.op;
    const p = g.player.position;
    const hostile = window.__TIDELOCK_RESCUE__.isHostileEntity;
    const missiles = g.projectiles.filter((s) => s.hostile && s.missile && !s.dead);
    const targets = g.entities.filter((e) => hostile(e) && e.position.z > -40 && e.position.z < 22);
    const score = (e) => {
      const d = e.position.distanceTo(p);
      const bonus = { drums: -30, crate: -30, generator: -25, tower: -20, launcher: -12, skiff: -8, mine: e.position.z > -10 ? -10 : 5 }[e.type] ?? 0;
      return d + bonus;
    };
    const target = missiles.sort((a, b) => a.position.distanceTo(p) - b.position.distanceTo(p))[0] ||
      targets.sort((a, b) => score(a) - score(b))[0];
    g.input.fire = Boolean(target);
    if (target) g.input.aim.copy(target.hostile ? target.position : g.targetPosition(target));
    // Stay ahead of the barges, shadow the threat's lane, and slide away from close mines.
    let goalX = target ? Math.max(-7, Math.min(7, target.position.x * 0.6)) : 0;
    const goalZ = op.holding ? 2 : 5;
    for (const mine of g.entities)
      if (mine.type === "mine" && !mine.dead && mine.position.z > p.z - 12 && mine.position.z < p.z + 3 && Math.abs(mine.position.x - p.x) < 3.2)
        goalX = p.x + (p.x > mine.position.x ? 5 : -5);
    const heal = g.entities.find((e) => e.type === "pickup" && !e.dead && e.kind === "health" && e.position.z > p.z - 16 && e.position.z < p.z + 4);
    if (heal && g.shields.reduce((a, b) => a + b, 0) < 7) goalX = heal.position.x;
    g.input.x = Math.max(-1, Math.min(1, (goalX - p.x) * 0.5));
    g.input.z = Math.max(-1, Math.min(1, (goalZ - p.z) * 0.4));
  }
}

export async function checkRiver(page, check) {
  const mechanics = await page.evaluate(() => {
    const { game: g, ui } = window.__TIDELOCK__;
    const out = {};
    ui.start(6);
    g.paused = false;
    const op = g.op;
    out.twoBarges = op.barges.length === 2 && op.barges.every((b) => b.alive && b.hp === b.max);
    const x0 = op.barges[0].position.x;
    g.input.x = 1;
    for (let i = 0; i < 240; i++) g.update(1 / 120);
    g.input.x = 0;
    out.bargesFollowWake = op.barges[0].position.x > x0 + 1.5 && op.barges[1].position.x > x0 + 0.5;
    const d0 = op.distance;
    for (let i = 0; i < 120; i++) g.update(1 / 120);
    out.convoyAdvances = op.distance > d0 + 3;
    // A hostile round aimed at a barge is absorbed by Marlin when she sits in the way.
    g.projectiles.forEach((s) => (s.dead = true));
    const barge = op.barges[0];
    g.player.position.set(barge.position.x, g.player.position.y, barge.position.z - 5);
    const from = barge.position.clone().add({ x: 0, y: 1, z: -14 });
    const shot = g.spawnShot(from, barge.position.clone().add({ x: 0, y: 1, z: 0 }), false, true, null, { kind: "barge", barge, position: barge.position });
    const hp = barge.hp,
      shields = g.shields.reduce((a, b) => a + b, 0);
    for (let i = 0; i < 240 && !shot.dead; i++) g.update(1 / 120);
    out.bodyBlock = barge.hp === hp && g.shields.reduce((a, b) => a + b, 0) === shields - 1 && op.blocked === 1;
    // Fuel drums take the neighbouring crew with them.
    ui.start(6);
    g.paused = false;
    const drumsEvent = { d: 0, type: "guns", side: 1, count: 2, crew: 2, drums: true };
    g.op.spawn(drumsEvent);
    const drums = g.entities.find((e) => e.type === "drums");
    const crew = g.entities.filter((e) => (e.type === "enemy" || e.type === "cannon") && !e.dead && e.position.distanceTo(drums.position) < 5.6);
    g.damage(drums, 1);
    out.drumChain = crew.length >= 3 && crew.every((e) => e.dead);
    // Pincer skiffs arrive at the meeting point together.
    ui.start(7);
    g.paused = false;
    g.op.spawn({ d: 0, type: "skiffs", pattern: "pincer", count: 6, meet: { x: 0, z: -2 }, delay: 6 });
    for (let i = 0; i < 6 * 120; i++) g.update(1 / 120);
    const skiffs = g.entities.filter((e) => e.type === "skiff" && !e.dead);
    out.pincerMeets = skiffs.length === 6 && skiffs.every((s) => Math.hypot(s.position.x, s.position.z + 2) < 2.2);
    g.damage(skiffs[0], 5);
    out.skiffChain = g.entities.filter((e) => e.type === "skiff" && !e.dead).length <= 1;
    // A column overtaking from behind keeps every boat on its first tick.
    g.entities.filter((e) => e.type === "skiff").forEach((e) => (e.dead = true));
    g.op.spawn({ d: 0, type: "skiffs", pattern: "column", count: 4, x: 7 });
    g.update(1 / 120);
    out.columnKeepsTrailingBoats = g.entities.filter((e) => e.type === "skiff" && !e.dead).length === 4;
    return out;
  });
  for (const [name, value] of Object.entries(mechanics)) check(`river ${name}`, value);
  const runs = await page.evaluate(`(${skipper.toString()})()`);
  for (const run of runs) {
    console.log(`  river 2.${run.index - 5}: ${run.status} ${run.reason || ""} ${run.distance}/${run.length} barges ${run.barges} shields ${run.shields} stars ${run.stars} blocked ${run.blocked} boss ${run.boss} in ${run.time}s`);
    check(`river mission 2.${run.index - 5} completed by scripted skipper`, run.status === "success");
  }
  return runs;
}
