// The frame loop (5.1): one call per animation frame. It samples the graphics governor, reads
// input, runs the 120 Hz fixed steps for the real time that passed (each frame counts at most
// 0.1 s, and a paused game runs none and keeps no backlog), refreshes the HUD and renders: every
// frame while the game runs, and once more on the frame it pauses or when the view asks for it.
// The radio director (5.1) is ticked after every step, as the golden harness ticks it.
// Pure: no DOM and no clock of its own, so tests drive it with fake timestamps.
import { GRACE, saveGovernor } from "./quality.js";

export function createLoop({ clock, governor, game, ui, view, radio = null, now = 0, hidden = () => false }) {
  let previous = now,
    wasPaused = false;
  const step = (dt) => {
    game.update(dt);
    radio?.tick(dt);
  };
  return {
    frame(now) {
      const real = (now - previous) / 1000,
        delta = Math.min(real, 0.1);
      previous = now;
      const change = governor.sample(real, !game.paused && game.status === "playing" && !hidden() && game.time > GRACE);
      if (change) {
        view.applyQuality(governor);
        game.ambientBudget = governor.profile.life;
        if (change === "level") saveGovernor(governor);
        ui.updateGraphics?.();
      }
      ui.updateInput();
      if (!game.paused) clock.advance(delta, step);
      else clock.reset();
      ui.updateHUD();
      if (!game.paused || !wasPaused || view.needsRender) view.render(game.time, game.reducedMotion ? 0 : game.shake);
      wasPaused = game.paused;
    },
  };
}
