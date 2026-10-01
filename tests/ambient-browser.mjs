// Living details and graphics levels (2.9): every scenario has its wildlife, it reacts to blasts,
// the gunboat and the helicopter, it stays light (a few draws, no shadows), reduced motion calms
// it, and phones start at the Balanced level.
export async function checkAmbient(browser, url, check) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${url}?qa=1`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 90000 });
  const scenes = await page.evaluate(() => {
    const { game: g, ui } = __TIDELOCK__;
    const run = (seconds) => {
      for (let i = 0; i < 120 * seconds; i++) g.update(1 / 120);
    };
    const enter = (index) => {
      document.querySelectorAll("dialog[open]").forEach((d) => d.close());
      ui.start(index);
      document.querySelectorAll("dialog[open]").forEach((d) => d.close());
      g.paused = false;
      run(2);
    };
    // Meshes, shadows and triangles the details add.
    const weight = () => {
      const parts = [g.ambient.fish, g.ambient.birds, g.ambient.circlers, g.ambient.reeds].filter(Boolean).map((p) => p.mesh);
      const triangles = parts.reduce((sum, m) => sum + (m.geometry.attributes.position.count / 3) * m.count, 0);
      return { meshes: parts.length, triangles, shadows: parts.some((m) => m.castShadow || m.receiveShadow) };
    };
    // A blast beside the first perched bird; how many are in the air a second later.
    const blastByBird = () => {
      const b = g.ambient.birds;
      const i = Array.from(b.state).indexOf(0);
      if (i < 0) return 0;
      g.blast({ x: b.x[i] + 1.5, y: b.y[i], z: b.z[i] }, 1, 0xff8a2b);
      run(1);
      return g.ambient.stats().flying;
    };
    const out = {};
    for (const [index, expect] of [
      [0, { birds: "pigeons" }],
      [6, { birds: "gulls", fish: true, circling: true }],
      [9, { birds: "egrets", fish: true, circling: true, reeds: true }],
      [15, { birds: "waders", fish: true, circling: true }],
      [16, { birds: "waders", fish: true, circling: true }],
      [17, { birds: "waders", fish: true, circling: true }],
    ]) {
      enter(index);
      const s = g.ambient.stats(),
        w = weight();
      out[index] = {
        kinds:
          s.kind === expect.birds &&
          s.birds > 0 &&
          (expect.fish ? s.fish > 0 : s.fish === 0) &&
          (expect.circling ? s.circling > 0 : s.circling === 0) &&
          (expect.reeds ? s.reeds > 0 : s.reeds === 0),
        fishInWater: s.fishInWater === s.fish,
        light: w.meshes <= 4 && w.triangles < 9000 && !w.shadows,
        blastFlushesBirds: blastByBird() > 0,
        summary: `${s.birds} ${s.kind}, ${s.fish} fish, ${s.circling} circling, ${s.reeds} reeds, ${w.meshes} draws, ${Math.round(w.triangles)} tris`,
      };
    }
    // The canal: half a minute of flow later every fish is still in the water, and the reed row
    // has slid with the current.
    enter(9);
    const reedsBefore = g.ambient.reeds.mesh.position.z;
    const fishBefore = g.ambient.stats().fish;
    run(30);
    const canal = g.ambient.stats();
    out.canalFlow = canal.fish === fishBefore && canal.fishInWater === canal.fish && g.ambient.reeds.mesh.position.z !== reedsBefore && g.ambient.reeds.mesh.position.z < 44;
    // The gunboat parts the fish at its bow.
    const f = g.ambient.fish;
    f.x[0] = g.player.position.x;
    f.z[0] = g.player.position.z - 2;
    run(0.1);
    out.bowScattersFish = f.flee[0] > 0;
    // The helicopter's downwash flushes the waders it passes over.
    enter(15);
    const b = g.ambient.birds;
    const i = Array.from(b.state).indexOf(0);
    g.player.position.set(b.x[i] + 2, g.player.position.y, b.z[i]);
    run(0.6);
    out.downwashFlushesWaders = b.state[i] !== 0;
    // Reduced motion: no circling flocks, and birds keep to their perches.
    g.reducedMotion = true;
    enter(6);
    const calm = g.ambient.stats();
    out.reducedMotionCalm = calm.circling === 0 && blastByBird() === 0;
    g.reducedMotion = false;
    // Settings changed in the menu apply to the mission in progress: Battery saver halves the
    // wildlife, and reduced motion drops the circling flocks, at once.
    enter(9);
    const full = g.ambient.stats().fish;
    const picker = document.getElementById("graphics-quality");
    picker.value = "low";
    picker.dispatchEvent(new Event("change"));
    const thinned = g.ambient.stats().fish;
    picker.value = "auto";
    picker.dispatchEvent(new Event("change"));
    const motion = document.getElementById("reduced-motion");
    motion.checked = true;
    motion.dispatchEvent(new Event("change"));
    const stilled = g.ambient.stats().circling;
    motion.checked = false;
    motion.dispatchEvent(new Event("change"));
    out.settingsApplyAtOnce = thinned === Math.round(full / 2) && g.ambient.stats().fish === full && stilled === 0 && g.ambient.stats().circling > 0 && g.ambient.stats().meshes === 4;
    // The graphics picker: Battery saver drops the shadow pass and the resolution; Auto restores.
    const { view } = __TIDELOCK__;
    const select = document.getElementById("graphics-quality");
    select.value = "low";
    select.dispatchEvent(new Event("change"));
    const low = !view.sun.castShadow && view.renderer.getPixelRatio() === Math.min(devicePixelRatio, 0.85);
    select.value = "auto";
    select.dispatchEvent(new Event("change"));
    out.graphicsPicker = low && view.sun.castShadow && view.sun.shadow.mapSize.x === 2048 && select.options[0].textContent === "Auto (Sharp)";
    return out;
  });
  for (const index of [0, 6, 9, 15, 16, 17]) {
    const s = scenes[index];
    console.log(`  life ${index}: ${s.summary}`);
    for (const key of ["kinds", "fishInWater", "light", "blastFlushesBirds"]) check(`life mission ${index} ${key}`, s[key] === true);
  }
  for (const key of ["canalFlow", "bowScattersFish", "downwashFlushesWaders", "reducedMotionCalm", "settingsApplyAtOnce", "graphicsPicker"]) check(`life ${key}`, scenes[key] === true);
  check(`life page errors${errors.length ? ": " + errors[0].slice(0, 60) : ""}`, errors.length === 0);
  await page.close();

  // A phone starts Balanced: 1.25x resolution, no antialiasing, 1024 shadows, three-quarter wildlife.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await phone.goto(`${url}?qa=1`);
  await phone.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 90000 });
  const mobile = await phone.evaluate(() => {
    const { view, governor, game } = __TIDELOCK__;
    return {
      level: governor.level,
      ratio: view.renderer.getPixelRatio(),
      antialias: view.renderer.getContext().getContextAttributes().antialias,
      shadow: view.sun.shadow.mapSize.x,
      budget: game.ambientBudget,
    };
  });
  check(
    `life phone starts Balanced (${JSON.stringify(mobile)})`,
    mobile.level === "medium" && mobile.ratio === 1.25 && mobile.antialias === false && mobile.shadow === 1024 && mobile.budget === 0.75,
  );
  await phone.close();
}
