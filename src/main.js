import "@fontsource-variable/fredoka/wght.css";
import "./style.css";
import { WorldView } from "./world.js";
import { Game } from "./game.js";
import { AudioBus } from "./audio.js";
import { FixedClock } from "./physics.js";
import { UI, readSave } from "./ui.js";
import { detectDevice, rendererOptions, loadGovernor, saveGovernor, GRACE } from "./quality.js";
import { firstOpenMission } from "./data.js";
import * as strikeData from "./strike-data.js";
import * as rescueData from "./rescue-data.js";
import * as harbourData from "./harbour-data.js";

document.documentElement.dataset.boot = "started";

async function boot() {
  const params = new URLSearchParams(location.search),
    qa = params.has("qa");
  // 2.9: phones start at a modest resolution without antialiasing; Auto adapts after that.
  const device = detectDevice(),
    governor = loadGovernor(device);
  if (qa) governor.locked = !params.has("adapt");
  const view = new WorldView(document.getElementById("world"), rendererOptions(device, qa));
  view.governor = governor;
  view.applyQuality(governor);
  await view.loadAssets(
    (fraction) =>
      (document.getElementById("loading-progress").style.width =
        `${fraction * 100}%`),
  );
  const save = readSave(),
    audio = new AudioBus(save.muted);
  let ui;
  const game = new Game(view, audio, (type, data) => ui?.onEvent(type, data));
  game.ambientBudget = governor.profile.life;
  ui = new UI(game, view, save);
  game.start(firstOpenMission(save.records));
  document.getElementById("loading").hidden = true;
  document.getElementById("app").hidden = false;
  view.resize();
  const clock = new FixedClock();
  let previous = performance.now();
  let wasPaused = false;
  const animate = (now) => {
    const real = (now - previous) / 1000,
      delta = Math.min(real, 0.1);
    previous = now;
    const change = governor.sample(real, !game.paused && game.status === "playing" && !document.hidden && game.time > GRACE);
    if (change) {
      view.applyQuality(governor);
      game.ambientBudget = governor.profile.life;
      if (change === "level") saveGovernor(governor);
      ui.updateGraphics?.();
    }
    ui.updateInput();
    if (!game.paused) clock.advance(delta, (dt) => game.update(dt));
    else clock.reset();
    ui.updateHUD();
    if (!game.paused || !wasPaused || view.needsRender) {
      view.render(game.time, game.reducedMotion ? 0 : game.shake);
    }
    wasPaused = game.paused;
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
  window.addEventListener("resize", () => view.resize());
  if (qa) {
    window.__TIDELOCK__ = { game, view, ui, clock, governor };
    window.__TIDELOCK_STRIKE__ = strikeData;
    window.__TIDELOCK_RESCUE__ = rescueData;
    window.__TIDELOCK_HARBOUR__ = harbourData;
  }
  document.documentElement.dataset.ready = "true";
}

boot().catch((error) => {
  console.error("Tidelock startup failed:", error);
  document.getElementById("loading-label").textContent =
    "The mission could not load. Check your connection and WebGL support, then reload.";
  document.getElementById("loading-retry").hidden = false;
});
