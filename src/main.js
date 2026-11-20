import './mobile-game-init.mjs';
import "@fontsource-variable/fredoka/wght.css";
import "./style.css";
import { WorldView } from "./world.js";
import { Game } from "./game.js";
import { AudioBus } from "./audio.js";
import { FixedClock } from "./physics.js";
import { createLoop } from "./loop.js";
import { mulberry32 } from "./rng.js";
import { UI, readSave } from "./ui.js";
import { detectDevice, rendererOptions, loadGovernor } from "./quality.js";
import { firstOpenMission } from "./data.js";
import * as strikeData from "./strike-data.js";
import * as rescueData from "./rescue-data.js";
import * as harbourData from "./harbour-data.js";

document.documentElement.dataset.boot = "started";

async function boot() {
  const params = new URLSearchParams(location.search),
    qa = params.has("qa");
  // Deterministic renders for QA (?qa&det=1): every cosmetic random number comes from one fixed
  // seed, so two runs of the same steps draw the same pixels. game.random is never touched.
  if (qa && params.get("det") === "1") Math.random = mulberry32(1);
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
  // Hit-stops (5.1 J1) are off under ?qa unless &feel=1, so scripted checks run in step time.
  const feel = !qa || params.get("feel") === "1";
  const loop = createLoop({ clock, governor, game, ui, view, radio: ui.director, now: performance.now(), hidden: () => document.hidden, feel });
  const animate = (now) => {
    loop.frame(now);
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
  window.addEventListener("resize", () => view.resize());
  if (qa) {
    window.__TIDELOCK__ = { game, view, ui, clock, governor, loop };
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
