// Surge clock and requisition (5.0): the storm closes the streets on a player who does nothing,
// stars become points, purchases apply from the next mission and survive a reload.
export async function checkProgress(browser, url, check) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${url}?qa=1`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 90000 });
  const out = await page.evaluate(() => {
    const { game: g, ui } = __TIDELOCK__;
    const $ = (id) => document.getElementById(id);
    const r = {};
    const run = (seconds) => {
      for (let i = 0; i < 120 * seconds && g.status === "playing"; i++) g.update(1 / 120);
    };
    const enter = (index) => {
      document.querySelectorAll("dialog[open]").forEach((d) => d.close());
      ui.start(index);
      document.querySelectorAll("dialog[open]").forEach((d) => d.close());
      g.paused = false;
      return g.op;
    };
    localStorage.removeItem("tidelock-v4");
    g.upgrades = {};
    g.difficulty = "normal";

    // ---- the surge clock
    let op = enter(0);
    r.windowMatchesTheRule = op.surge === 270;
    // The tide chip is rendered in the top bar, not merely un-hidden (5.1 H1; hud-browser checks every width).
    ui.updateHUD(true);
    const chip = $("tide-chip").getBoundingClientRect();
    r.hudShowsTheClock =
      getComputedStyle($("tide-chip")).display !== "none" && chip.width > 0 && chip.bottom <= innerHeight && $("tide-text").textContent === "HIGH TIDE 4:30" && parseFloat(getComputedStyle($("tide-text")).fontSize) >= 13;
    r.tideStartsGold = !$("tide-chip").classList.contains("warn") && !$("tide-chip").classList.contains("urgent");
    g.difficulty = "easy";
    op = enter(0);
    const easy = op.surge;
    g.difficulty = "hard";
    op = enter(0);
    r.modesStretchAndShrinkIt = easy > 270 && op.surge < 270;
    g.difficulty = "normal";
    op = enter(0);
    g.hurtPlayer = () => {};
    run(op.surge - 119);
    ui.updateHUD(true);
    r.tideTurnsOrangeAtTwoMinutes = $("tide-chip").classList.contains("warn") && !$("tide-chip").classList.contains("urgent");
    r.tideBarFollowsTheWindow = $("tide-fill").style.transform === `scaleX(${Math.floor((1 - 119 / op.surge) * 100) / 100})`;
    run(58);
    const notYet = g.status === "playing" && op.surgeWarned === 0;
    run(2);
    r.warnsAtSixtySeconds = notYet && op.surgeWarned === 1;
    ui.updateHUD(true);
    r.clockTurnsUrgent = $("tide-chip").classList.contains("urgent") && !$("tide-chip").classList.contains("warn");
    run(60);
    r.closedWindowLosesTheMission = g.status === "failed" && g.reason === "surge";
    delete g.hurtPlayer;
    // The harbour has the longer window, and the canal and valleys have none.
    op = enter(6);
    r.harbourHasALongerWindow = op.surge > 480;
    enter(9);
    ui.updateHUD(true);
    r.canalHasNoClock = $("tide-chip").hidden;

    // ---- requisition: points from stars, purchases, and what they do
    ui.save.records = { 0: { score: 1, stars: 3 }, 1: { score: 1, stars: 3 }, 2: { score: 1, stars: 3 }, 9: { score: 1, stars: 2 }, 15: { score: 1, stars: 3 } };
    ui.save.upgrades = {};
    g.upgrades = {};
    ui.menu();
    r.pointsShowTheStars = $("req-points").textContent === "14 points";
    const buyButton = (id) => document.querySelector(`#req-list [data-upgrade="${id}"]`);
    const baseline = {};
    {
      document.querySelectorAll("dialog[open]").forEach((d) => d.close());
      g.paused = false;
      const k = enter(0);
      baseline.bombs = k.aircraft[0].payload.shockwave ?? Object.values(k.aircraft[0].payload)[0];
      baseline.power = k.power;
      const m = enter(9);
      baseline.rockets = m.rockets;
      baseline.bargeHp = m.barges[0].max;
      const l = enter(15);
      baseline.flares = l.gear.flares;
      baseline.heliRockets = l.gear.rockets;
      ui.menu();
    }
    r.buttonsFollowThePoints = !buyButton("ordnance").disabled && buyButton("ordnance").textContent === "Buy 3";
    for (const id of ["ordnance", "blast", "plating", "pods", "flares", "racks"]) buyButton(id)?.click();
    // 14 points: ordnance 3 + blast 2 + plating 3 + pods 2 + flares 2 = 12, racks (3) does not fit.
    r.purchasesSpendPoints = $("req-points").textContent === "2 points" && ui.save.upgrades.racks === undefined && ui.save.upgrades.ordnance === 1 && ui.save.upgrades.flares === 1;
    r.unaffordableStaysLocked = buyButton("racks").disabled;
    ui.resume();
    r.gameKnowsTheUpgrades = g.upgrades.pods === 1;
    // Effects at the next mission start.
    {
      const k = enter(0);
      const bombs = k.aircraft[0].payload.shockwave ?? Object.values(k.aircraft[0].payload)[0];
      r.spareOrdnanceAddsABomb = bombs === baseline.bombs + 1 && Math.abs(k.power / baseline.power - 1.08) < 1e-9;
      const m = enter(9);
      r.podsAndPlatingApply = m.rockets === Math.round((baseline.rockets / 1) * 1.3) || Math.abs(m.rockets - baseline.rockets * 1.3) <= 1;
      r.platingApplies = Math.abs(m.barges[0].max / baseline.bargeHp - 1.15) < 1e-9;
      const l = enter(15);
      r.flareRackApplies = l.gear.flares === baseline.flares + 2 && l.gear.rockets === baseline.heliRockets;
    }
    // A save survives a reload and cannot be hand-edited past the limits.
    ui.save.upgrades = { ordnance: 1, blast: 1, plating: 1, pods: 1, flares: 1 };
    ui.persist();
    r.savedInTheSave = JSON.parse(localStorage.getItem("tidelock-v4")).upgrades.flares === 1;
    localStorage.setItem("tidelock-v4", JSON.stringify({ ...JSON.parse(localStorage.getItem("tidelock-v4")), upgrades: { ordnance: 99, nope: 3, blast: -2 } }));
    return r;
  });
  for (const [name, value] of Object.entries(out)) check(`progress ${name}`, value === true);

  // After a reload the cleaned save is what the game sees.
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 90000 });
  const cleaned = await page.evaluate(() => JSON.stringify(__TIDELOCK__.game.upgrades));
  check(`progress a hand-edited save is cleaned on load (${cleaned})`, cleaned === '{"ordnance":2}');
  check(`progress page errors${errors.length ? ": " + errors[0].slice(0, 60) : ""}`, errors.length === 0);
  await page.close();
}
