// Graphics quality (2.9), from the smooth-dense-scenes skill's governor (after Zoo Garden). On
// phones the frame cost is mostly pixels (resolution and antialiasing) and the shadow pass, so
// phones start at a modest resolution without antialiasing, and in Auto the governor trades
// resolution first and shadows second when the frame rate sags, then recovers. The choice is kept
// per device, never in the campaign save.

export const QUALITY = {
  low: { label: "Battery saver", ratio: 0.85, shadow: 0, life: 0.5 },
  medium: { label: "Balanced", ratio: 1.25, shadow: 1024, life: 0.75 },
  // Tidelock's long-standing desktop cap.
  high: { label: "Sharp", ratio: 1.75, shadow: 2048, life: 1 },
};
export const QUALITY_KEY = "tidelock-graphics";
// Seconds after a mission starts that don't count: shaders compile and the scene settles.
export const GRACE = 4;

export function detectDevice() {
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const agent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  return { mobile: coarse || /Android|iPhone|iPad|iPod/i.test(agent), dpr: typeof devicePixelRatio === "number" ? devicePixelRatio : 1 };
}

// Antialiasing is fixed when the WebGL context is made: off on high-density phones, whose pixels
// are small already. Keeping the drawing buffer stops tiled phone GPUs discarding the frame, so
// only the QA build (pixel checks read the canvas back) keeps it.
export function rendererOptions(device, qa = false) {
  return { antialias: !(device.mobile && device.dpr >= 2), alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: qa };
}

export class Governor {
  constructor(device, stored = null) {
    this.device = device;
    const valid = (s) => s === "auto" || s in QUALITY;
    this.setting = valid(stored?.setting) ? stored.setting : "auto";
    this.autoLevel = stored?.autoLevel in QUALITY ? stored.autoLevel : null;
    // QA runs hold the level steady unless a check asks for adaptation.
    this.locked = false;
    this.fps = 0;
    this.frames = 0;
    this.elapsed = 0;
    this.slow = 0;
    this.ratio = this.targetRatio();
  }

  get level() {
    if (this.setting !== "auto") return this.setting;
    return this.autoLevel ?? (this.device.mobile ? "medium" : "high");
  }
  get profile() {
    return QUALITY[this.level];
  }
  targetRatio() {
    return Math.min(this.device.dpr, this.profile.ratio);
  }
  choose(setting) {
    this.setting = setting in QUALITY ? setting : "auto";
    if (this.setting === "auto") this.autoLevel = null;
    this.ratio = this.targetRatio();
  }

  // Every frame, with its real duration. Once a second in Auto: three slow seconds in a row
  // (under 36 fps) lower the resolution a quarter step down to 1x, then the level, then the
  // resolution again down to 0.7x; a fast second (over 57 fps) raises it toward the level's
  // target. Frames longer than a quarter second (a hitch, a hidden tab) are ignored.
  sample(dt, playing) {
    if (dt > 0.25) return null;
    this.frames++;
    this.elapsed += dt;
    if (this.elapsed < 1) return null;
    const fps = this.frames / this.elapsed;
    this.fps = fps;
    this.frames = 0;
    this.elapsed = 0;
    if (!playing || this.setting !== "auto" || this.locked) return null;
    if (fps < 36) {
      if (++this.slow < 3) return null;
      this.slow = 0;
      if (this.ratio > 1) {
        this.ratio = Math.max(1, this.ratio - 0.25);
        return "ratio";
      }
      const lower = { high: "medium", medium: "low" }[this.level];
      if (lower) {
        this.autoLevel = lower;
        this.ratio = Math.min(this.ratio, this.targetRatio());
        return "level";
      }
      if (this.ratio > 0.7) {
        this.ratio = Math.max(0.7, this.ratio - 0.15);
        return "ratio";
      }
      return null;
    }
    this.slow = 0;
    const target = this.targetRatio();
    if (fps > 57 && this.ratio < target) {
      this.ratio = Math.min(target, this.ratio + 0.25);
      return "ratio";
    }
    return null;
  }

  toJSON() {
    return { setting: this.setting, autoLevel: this.autoLevel };
  }
}

export function loadGovernor(device = detectDevice()) {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(QUALITY_KEY) ?? "null");
  } catch {
    // Private mode or blocked storage: the defaults apply.
  }
  return new Governor(device, stored);
}

export function saveGovernor(governor) {
  try {
    localStorage.setItem(QUALITY_KEY, JSON.stringify(governor));
  } catch {
    // The setting lasts for this visit.
  }
}
