// GPU particles (3.0): effects cost two draws however busy the fight, blasts on the water
// splash, boats leave wakes, and reduced motion stops the ongoing trails.
export async function checkFx(browser, url, check) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${url}?qa=1`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 90000 });
  const out = await page.evaluate(() => {
    const { game: g, ui, view } = __TIDELOCK__;
    const run = (seconds) => {
      for (let i = 0; i < 120 * seconds; i++) g.update(1 / 120);
    };
    const enter = (index) => {
      document.querySelectorAll("dialog[open]").forEach((d) => d.close());
      ui.start(index);
      document.querySelectorAll("dialog[open]").forEach((d) => d.close());
      g.paused = false;
      run(0.5);
    };
    const calls = () => {
      view.renderer.info.autoReset = false;
      view.renderer.info.reset();
      view.render(g.time);
      return view.renderer.info.render.calls;
    };
    const r = {};
    // Thirty blasts add no draw calls beyond the pools and the blast rings.
    enter(0);
    const quiet = calls();
    const f = view.strikeFollow;
    for (let i = 0; i < 30; i++) g.blast({ x: f.x + Math.cos(i) * 8, y: 1.1, z: f.z + Math.sin(i) * 8 }, 1.6, 0xff8a2b, { quiet: true });
    run(0.05);
    const busy = calls();
    r.blastsStayCheap = view.fx.glow.alive() > 200 && view.fx.smoke.alive() > 100 && view.fx.rings.alive() >= 30 && busy - quiet <= 2;
    r.summary = `${quiet} -> ${busy} draws with ${view.fx.glow.alive()} glows, ${view.fx.smoke.alive()} smoke, ${view.fx.rings.alive()} rings`;
    // Street blasts leave scorch marks that fade; one in the air leaves none.
    const scorchBefore = view.fx.scorch.spawned;
    g.blast({ x: f.x, y: 1.05, z: f.z }, 1.6, 0xff8a2b, { quiet: true, scorch: 1 });
    g.blast({ x: f.x, y: 9, z: f.z }, 1.6, 0xff8a2b, { quiet: true, scorch: 1 });
    run(0.2);
    const scorched = view.fx.scorch.spawned - scorchBefore === 1 && view.fx.scorch.alive() >= 1;
    run(10);
    r.scorchMarks = scorched && view.fx.scorch.alive() === 0;
    // A new mission starts with no particles left over.
    ui.start(9);
    r.newMissionClears = view.fx.glow.alive() + view.fx.smoke.alive() + view.fx.rings.alive() + view.fx.scorch.alive() === 0;
    enter(9);
    // On the canal: wakes behind the boats, a plume where a blast hits the water.
    const before = view.fx.smoke.spawned;
    run(1);
    r.wakes = view.fx.smoke.spawned - before > 40;
    const s0 = view.fx.smoke.spawned;
    g.blast({ x: g.player.position.x - 4, y: 0.2, z: g.player.position.z - 10 }, 1, 0xffc62b, { quiet: true });
    r.waterBlastSplashes = view.fx.smoke.spawned - s0 >= 16;
    // Several sim steps between renders (2-4 per frame): a blast's slots stay queued for upload
    // while wakes keep spawning, until the frame renders.
    view.render(g.time);
    const glow = view.fx.glow,
      first = glow.next;
    g.blast({ x: g.player.position.x + 3, y: 1, z: g.player.position.z - 6 }, 1.4, 0xff8a2b, { quiet: true });
    const last = (glow.next - 1 + glow.capacity) % glow.capacity;
    for (let i = 0; i < 4; i++) g.update(1 / 120);
    const queued = (slot) => glow.start.updateRanges.some((r) => r.start <= slot * 4 && r.start + r.count >= slot * 4 + 4);
    r.stepsKeepUploads = last >= first && queued(first) && queued(last);
    view.render(g.time);
    // Reduced motion: no ongoing wakes.
    g.reducedMotion = true;
    const s1 = view.fx.smoke.spawned;
    run(1);
    r.reducedMotionStopsTrails = view.fx.smoke.spawned === s1;
    g.reducedMotion = false;
    // Lantern's rotor wash.
    enter(15);
    const s2 = view.fx.smoke.spawned;
    run(1);
    r.rotorWash = view.fx.smoke.spawned - s2 > 20;
    return r;
  });
  console.log(`  fx: ${out.summary}`);
  for (const key of ["blastsStayCheap", "newMissionClears", "wakes", "waterBlastSplashes", "reducedMotionStopsTrails", "rotorWash", "scorchMarks", "stepsKeepUploads"]) check(`fx ${key}`, out[key] === true);
  check(`fx page errors${errors.length ? ": " + errors[0].slice(0, 60) : ""}`, errors.length === 0);
  await page.close();
}
