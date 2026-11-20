// The frame loop (5.1): one call per animation frame. It samples the graphics governor, reads
// input, runs the 120 Hz fixed steps for the real time that passed (each frame counts at most
// 0.1 s, and a paused game runs none and keeps no backlog), refreshes the HUD and renders: every
// frame while the game runs, and once more on the frame it pauses or when the view asks for it.
// The radio director (5.1) is ticked after every step, as the golden harness ticks it.
// Pure: no DOM and no clock of its own, so tests drive it with fake timestamps.
//
// The present (5.1 J1): hit-stop, slow motion and trauma shake live here and only here. The game
// asks for them through game.impact and game.shake; the loop keeps its windows in game.present,
// which game.update never reads. Fixed steps stay 1/120 s whatever happens to real time.
import { GRACE, saveGovernor } from "./quality.js";
import { STEP } from "./data.js";

export const FEEL = Object.freeze({
  // Hit-stops (s): 3-4 kills in one blast; 5+ kills or a key target; the mission-deciding hit.
  stop: Object.freeze({ burst: 0.05, heavy: 0.09, decisive: 0.12 }),
  // The deciding hit's slow motion after its stop: `slow` s of real time at `rate`.
  slow: 0.5,
  rate: 0.4,
  // At most `cap` s of stop in any rolling second.
  cap: 0.16,
  // Trauma in [0, 1] added by a hit, decaying `decay` a second of real time.
  bump: Object.freeze({ small: 0.15, big: 0.35, hurt: 0.45, key: 0.5 }),
  decay: 1.6,
  // Shake: trauma squared times `reach` m of smooth noise at 7 and 16 Hz, plus a `kick` m push
  // away from a big blast or a hit, gone over `kickTime` s.
  reach: 0.55,
  kick: 0.25,
  kickTime: 0.12,
});

// The windows the loop keeps: no steps before stopUntil, slow steps before slowUntil (real time,
// seconds), the last kick, and the stops granted lately, for the cap.
export class Present {
  constructor() {
    this.stopUntil = -Infinity;
    this.slowUntil = -Infinity;
    // A stop is running: the first frame after it counts one step at most.
    this.held = false;
    this.kickAt = -Infinity;
    this.kickX = 0;
    this.kickZ = 0;
    this.grantAt = new Float64Array(16).fill(-Infinity);
    this.grantFor = new Float64Array(16);
    this.grants = 0;
  }

  // A new mission: no stop, slow motion or kick carries over (the cap's record stays).
  reset() {
    this.stopUntil = this.slowUntil = this.kickAt = -Infinity;
    this.held = false;
  }

  // Stop time already granted inside the last second.
  used(now) {
    let sum = 0;
    for (let i = 0; i < this.grantAt.length; i++) {
      const from = Math.max(this.grantAt[i], now - 1),
        to = Math.min(this.grantAt[i] + this.grantFor[i], now);
      if (to > from) sum += to - from;
    }
    return sum;
  }

  // The requests of the steps just run, from `now` (s). `on` is false under reduced motion and
  // under ?qa without &feel=1, and the stops are then dropped. The request is cleared either way.
  take(now, impact, on) {
    if (impact.kick) {
      this.kickAt = now;
      this.kickX = impact.kickX;
      this.kickZ = impact.kickZ;
    }
    if (on && impact.stop > 0) {
      const length = Math.min(impact.stop, FEEL.cap - this.used(now));
      if (length > 0.005) {
        const slot = this.grants++ % this.grantAt.length;
        this.grantAt[slot] = now;
        this.grantFor[slot] = length;
        this.stopUntil = now + length;
        this.held = true;
      }
    }
    if (on && impact.slow > 0) this.slowUntil = Math.max(now, this.stopUntil) + impact.slow;
    impact.stop = impact.slow = 0;
    impact.kick = false;
  }
}

// Smooth value noise in [-1, 1] over hashed integer lattice values: no random numbers, so the same
// instant gives the same offset at any frame rate.
function lattice(i, seed) {
  let h = Math.imul(i ^ Math.imul(seed + 1, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 2147483647.5 - 1;
}
function value(x, seed) {
  const i = Math.floor(x),
    f = x - i,
    a = lattice(i, seed);
  return a + (lattice(i + 1, seed) - a) * f * f * (3 - 2 * f);
}

// The shake at real time `t` (s) into `out`: x and y along the camera's right and up axes, kx and
// kz the kick in world metres. Pure.
export function shakeOffset(out, trauma, t, present) {
  const reach = trauma * trauma * FEEL.reach;
  out.x = reach * (0.65 * value(t * 7, 0) + 0.35 * value(t * 16, 1));
  out.y = reach * (0.65 * value(t * 7, 2) + 0.35 * value(t * 16, 3));
  const age = t - present.kickAt,
    kick = age >= 0 && age < FEEL.kickTime ? FEEL.kick * (1 - age / FEEL.kickTime) : 0;
  out.kx = present.kickX * kick;
  out.kz = present.kickZ * kick;
  return out;
}

export function createLoop({ clock, governor, game, ui, view, radio = null, now = 0, hidden = () => false, feel = true }) {
  let previous = now,
    drawn = now,
    wasPaused = false;
  const present = (game.present = new Present()),
    offset = { x: 0, y: 0, kx: 0, kz: 0 };
  const step = (dt) => {
    game.update(dt);
    radio?.tick(dt);
  };
  // The hit requests of the steps just run become windows from `now` (ms).
  const settle = (now) => present.take(now / 1000, game.impact, feel && !game.reducedMotion);
  // A render at `now` (ms), shaken; trauma decays by the real time since the last one (a clock
  // that starts over, as the golden interleave's does, decays nothing).
  const render = (now) => {
    game.shake = Math.max(0, game.shake - (Math.max(0, now - drawn) / 1000) * FEEL.decay);
    drawn = now;
    view.render(game.time, game.reducedMotion ? null : shakeOffset(offset, game.shake, now / 1000, present));
  };
  return {
    settle,
    // The HUD and a render, as a frame draws them (the golden interleave checks call this).
    draw(now) {
      ui.updateHUD();
      render(now);
    },
    frame(now) {
      const real = (now - previous) / 1000,
        t = now / 1000;
      let delta = Math.min(real, 0.1);
      previous = now;
      const change = governor.sample(real, !game.paused && game.status === "playing" && !hidden() && game.time > GRACE);
      if (change) {
        view.applyQuality(governor);
        game.ambientBudget = governor.profile.life;
        if (change === "level") saveGovernor(governor);
        ui.updateGraphics?.();
      }
      ui.updateInput();
      if (game.impact.fresh) {
        game.impact.fresh = false;
        present.reset();
      }
      // A paused game and a hit-stop run no steps and keep no backlog; HUD and render go on.
      if (game.paused || t < present.stopUntil) clock.reset();
      else {
        if (present.held) {
          // No catch-up burst after a stop: its first frame counts one step at most.
          present.held = false;
          delta = Math.min(delta, t - present.stopUntil, STEP);
        }
        if (t < present.slowUntil) delta *= FEEL.rate;
        clock.advance(delta, step);
        settle(now);
      }
      ui.updateHUD();
      if (!game.paused || !wasPaused || view.needsRender) render(now);
      wasPaused = game.paused;
    },
  };
}

// Frame times for the qa readout (5.1 X1, ?qa&fps=1): the gaps between animation frames over the
// last `window` ms, and their p50 and p95 (nearest rank, as perf-browser reports them). A ring of
// timestamps, so sampling allocates nothing; 30 s at 240 Hz fits.
export class FrameStats {
  constructor(windowMs = 30000, capacity = 7200) {
    this.window = windowMs;
    this.times = new Float64Array(capacity);
    this.gaps = new Float64Array(capacity);
    this.head = 0;
    this.count = 0;
  }

  sample(now) {
    this.times[this.head] = now;
    this.head = (this.head + 1) % this.times.length;
    this.count = Math.min(this.count + 1, this.times.length);
  }

  // { frames, p50, p95 } in ms over the window ending at the last sample; null with under 2 frames.
  read() {
    const n = this.times.length;
    const last = this.times[(this.head - 1 + n) % n];
    let k = 0;
    for (let i = 1; i < this.count; i++) {
      const at = this.times[(this.head - i + n) % n],
        before = this.times[(this.head - i - 1 + n) % n];
      if (last - before > this.window) break;
      this.gaps[k++] = at - before;
    }
    if (k === 0) return null;
    const sorted = this.gaps.subarray(0, k).sort();
    const at = (q) => sorted[Math.min(k - 1, Math.floor(q * k))];
    return { frames: k, p50: at(0.5), p95: at(0.95) };
  }
}
