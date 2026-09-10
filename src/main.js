import "./style.css";
import { WorldView } from "./world.js";
import { Game } from "./game.js";
import { AudioBus } from "./audio.js";
import { FixedClock } from "./physics.js";
import { UI, readSave } from "./ui.js";

async function boot() {
  const view = new WorldView(document.getElementById("world"));
  await view.loadAssets(
    (fraction) =>
      (document.getElementById("loading-progress").style.width =
        `${fraction * 100}%`),
  );
  const save = readSave(),
    audio = new AudioBus(save.muted);
  let ui;
  const game = new Game(view, audio, (type, data) => ui?.onEvent(type, data));
  ui = new UI(game, view, save);
  game.start(0);
  document.getElementById("loading").hidden = true;
  document.getElementById("app").hidden = false;
  view.resize();
  const clock = new FixedClock();
  let previous = performance.now();
  let wasPaused = false;
  const animate = (now) => {
    const delta = Math.min((now - previous) / 1000, 0.1);
    previous = now;
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
  if (new URLSearchParams(location.search).has("qa")) {
    window.__TIDELOCK__ = { game, view, ui, clock };
  }
  document.documentElement.dataset.ready = "true";
}

boot().catch((error) => {
  console.error("Tidelock startup failed:", error);
  document.getElementById("loading-label").textContent =
    "The mission could not load. Check your connection and WebGL support, then reload.";
  const button = document.createElement("button");
  button.textContent = "Reload mission";
  button.className = "primary-button";
  button.onclick = () => location.reload();
  document.getElementById("loading").append(button);
});
