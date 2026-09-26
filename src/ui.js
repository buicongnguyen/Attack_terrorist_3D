import {
  createIcons,
  Crosshair,
  Volume2,
  VolumeX,
  Pause,
  Play,
  SlidersHorizontal,
  Scan,
  Siren,
  Building2,
  MoveHorizontal,
  ChevronsDown,
  ChevronsUp,
  Layers,
  ArrowDownToLine,
  Move,
  Rocket,
  Target,
  Shield,
  Ship,
  Navigation,
  Sparkles,
  ArrowUpFromLine,
  X,
  RotateCcw,
  SkipForward,
  BookOpen,
  BadgeCheck,
  ArrowRight,
  Star,
  Drill,
  Bomb,
  LocateFixed,
  Plane,
  TriangleAlert,
  Radio,
  Check,
  Circle,
  Users,
  Ellipsis,
  CornerDownRight,
  Magnet,
  CircleDashed,
  Grid2x2,
  ArrowLeftRight,
  Map as MapIcon,
  Zap,
} from "lucide";
import { CHAPTERS, MISSIONS, missionNumber, chapterSize, saveResult, migrateSave } from "./data.js";
import { BOMBS, BOMB_ORDER, FLIGHT, STRIKE_MISSIONS, isPattern } from "./strike-data.js";
import { patternDiagram, ROTATION_STEP } from "./harbour-data.js";
import { CAST, PROLOGUE, CHAPTER_STORY, MISSION_STORY, FINALE, speaker } from "./story.js";
import { activeBonuses } from "./pickups.js";
import { DIFFICULTIES, DIFFICULTY, DEFAULT_DIFFICULTY, difficulty, percent } from "./difficulty.js";
import { RescueHUD } from "./rescue-hud.js";
import { isHostileEntity } from "./rescue-data.js";

const iconSet = {
  Crosshair,
  Volume2,
  VolumeX,
  Pause,
  Play,
  SlidersHorizontal,
  Scan,
  Siren,
  Building2,
  MoveHorizontal,
  ChevronsDown,
  ChevronsUp,
  Layers,
  ArrowDownToLine,
  Move,
  Rocket,
  Target,
  Shield,
  Ship,
  Navigation,
  Sparkles,
  ArrowUpFromLine,
  X,
  RotateCcw,
  SkipForward,
  BookOpen,
  BadgeCheck,
  ArrowRight,
  Star,
  Drill,
  Bomb,
  LocateFixed,
  Plane,
  TriangleAlert,
  Radio,
  Check,
  Circle,
  Users,
  Ellipsis,
  CornerDownRight,
  Magnet,
  CircleDashed,
  Grid2x2,
  ArrowLeftRight,
  Map: MapIcon,
  Zap,
};
const BOMB_ICON = {
  drill: "drill",
  scatter: "sparkles",
  shockwave: "bomb",
  lance: "locate-fixed",
  stick: "ellipsis",
  ell: "corner-down-right",
  yoke: "magnet",
  ring: "circle-dashed",
  box: "grid-2x2",
};
const $ = (id) => document.getElementById(id);
const SAVE_KEY = "tidelock-v4";
// Older saves number missions before the harbour (v2) or canal (v3) missions were inserted.
const LEGACY_KEYS = [
  ["tidelock-v3", 3],
  ["tidelock-v2", 2],
];
export const refreshIcons = () => createIcons({ icons: iconSet, attrs: { "aria-hidden": "true" } });

export function readSave() {
  try {
    const current = localStorage.getItem(SAVE_KEY);
    const legacy = LEGACY_KEYS.map(([key, version]) => [localStorage.getItem(key), version]).find(([value]) => value);
    const saved = current ? JSON.parse(current) : legacy ? migrateSave(JSON.parse(legacy[0]), legacy[1]) : {};
    const records = {};
    for (const [key, value] of Object.entries(saved.records || {})) {
      if (
        Number.isInteger(+key) &&
        +key >= 0 &&
        +key < MISSIONS.length &&
        Number.isFinite(value?.score) &&
        Number.isFinite(value?.stars)
      )
        records[key] = { score: Math.max(0, value.score), stars: Math.min(3, Math.max(0, value.stars)) };
    }
    return {
      records,
      muted: Boolean(saved.muted),
      reducedMotion: Boolean(saved.reducedMotion),
      seenPrologue: Boolean(saved.seenPrologue),
      difficulty: DIFFICULTIES.includes(saved.difficulty) ? saved.difficulty : DEFAULT_DIFFICULTY,
    };
  } catch {
    return { records: {}, muted: false, reducedMotion: false, seenPrologue: false, difficulty: DEFAULT_DIFFICULTY };
  }
}

// Gameplay keys are read by physical position (e.code), so AZERTY and Dvorak keep the WASD shape.
// Events without a code (some synthetic or IME events) fall back to the printed key.
const keyCode = (e) => {
  if (e.code) return e.code;
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (key === " ") return "Space";
  if (/^[A-Z]$/.test(key)) return `Key${key}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  return key;
};
const GAME_KEYS = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

// Coach lines for the teaching missions: [keyboard, touch].
const COACH = {
  aim: [
    "Click the jammer mast: the flight flies there and drops the bomb by itself",
    "Tap the jammer mast: the flight flies there and drops the bomb by itself",
  ],
  aiming: [
    "Flying to your mark. It drops by itself; SPACE drops now, right-click cancels",
    "Flying to your mark. It drops by itself; Release drops now",
  ],
  floor: [
    "Click a spotter in the tower: the Drill sets its own floor. E / C set it by hand",
    "Tap a spotter in the tower: the Drill sets its own floor",
  ],
  rally: ["A crowd gathers soon. Line up the ring before the countdown ends", "A crowd gathers soon. Line up the ring before the countdown ends"],
  salvo: ["Salvo (X) drops from every aircraft at once", "Tap Salvo to drop from every aircraft at once"],
  shelter: ["The blue roof is the civilian shelter. Keep every ring off it", "The blue roof is the civilian shelter. Keep every ring off it"],
  lance: ["Lance locked on the cyan ring. Release", "Lance locked on the cyan ring. Release"],
  lanceNone: ["No Lance lock yet. Bring the ring near a truck or a crowd", "No Lance lock yet. Bring the ring near a truck or a crowd"],
  reverse: ["Missed it? F turns the flight round for another pass", "Missed it? Tap Reverse to turn the flight round"],
  rotate: [
    "Turn the Stick with the angle buttons, E / C or the wheel until it lies along the column",
    "Turn the Stick with the angle buttons until it lies along the column",
  ],
  shapes: [
    "Fit the L to the pier corner and the U to the dry dock. The angle buttons turn it",
    "Fit the L to the pier corner and the U to the dry dock. The angle buttons turn it",
  ],
  ring: [
    "Centre the O-Ring on the ferry: the escorts sit on the ring",
    "Centre the O-Ring on the ferry: the escorts sit on the ring",
  ],
  ferry: ["A civilian boat is inside the pattern. Hold your release", "A civilian boat is inside the pattern. Hold your release"],
  fits: ["That fits. Release with SPACE or a click", "That fits. Tap Release"],
};

// Assigns markup only when it changed, so HUD refreshes don't rebuild identical DOM.
const lastHTML = new WeakMap();
const setHTML = (el, html) => {
  if (lastHTML.get(el) === html) return;
  lastHTML.set(el, html);
  el.innerHTML = html;
};

const escape = (text) =>
  String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function portrait(who) {
  const cast = speaker(who);
  return `<span class="portrait ${cast.hostile ? "hostile" : ""}" style="--tone:${cast.color}">${cast.initials}</span>`;
}

function lineMarkup(line) {
  const cast = speaker(line.who);
  return `${portrait(line.who)}<div><b>${escape(cast.name)}</b><small>${escape(cast.role)}</small><p>${escape(line.text)}</p></div>`;
}

export class UI {
  constructor(game, view, save) {
    this.game = game;
    this.view = view;
    this.save = save;
    this.params = new URLSearchParams(location.search);
    this.qa = this.params.has("qa");
    this.keys = new Set();
    this.pointerFire = false;
    this.pointerPosition = null;
    this.moveStick = { x: 0, z: 0 };
    this.fireStick = null;
    this.winchHeld = false;
    this.padResets = [];
    this.lastHUD = -1;
    this.toastTime = 0;
    this.comboTime = 0;
    this.labels = new Map();
    this.dialog = $("menu-dialog");
    this.brief = $("brief-dialog");
    this.game.difficulty = save.difficulty || DEFAULT_DIFFICULTY;
    this.buildDifficulty();
    this.game.reducedMotion = save.reducedMotion || matchMedia("(prefers-reduced-motion: reduce)").matches;
    $("reduced-motion").checked = this.game.reducedMotion;
    document.documentElement.dataset.reducedMotion = String(this.game.reducedMotion);
    $("audio-enabled").checked = !save.muted;
    this.updateSound();
    this.bind();
    this.bindStick("move-stick", false);
    this.bindStick("fire-stick", true);
    this.rescueHUD = new RescueHUD(game);
    // Touch layout follows the primary pointer, then whichever input was used last: a touchscreen
    // laptop keeps keyboard hints until it is touched, and a tablet shows its sticks on first touch.
    const coarse = matchMedia("(pointer: coarse)");
    this.finePointer = matchMedia("(any-pointer: fine)");
    this.setTouch(coarse.matches || (navigator.maxTouchPoints > 0 && !this.finePointer.matches));
    coarse.addEventListener("change", () => this.setTouch(coarse.matches));
    window.addEventListener("pointerdown", (e) => e.pointerType === "touch" && this.setTouch(true), true);
    window.addEventListener(
      "pointermove",
      (e) => e.pointerType === "mouse" && this.finePointer.matches && (e.movementX || e.movementY) && this.setTouch(false),
      true,
    );
    // A resize (phone toolbars, rotation) must not drop a stick the player is holding.
    window.addEventListener("resize", () => this.keys.clear());
    refreshIcons();
    this.badgeOverlays = [
      ...document.querySelectorAll(
        ".topbar, .mission-hud, #comms, #shield-hud, #powerup, .joystick, .weapon-bar, #rescue-hud, #rescue-actions, #flight-panel, #ladder, #convoy-hud, #intel",
      ),
    ];
    this.overlayObserver = new ResizeObserver(() => this.updateBadgeBounds());
    this.badgeOverlays.forEach((node) => this.overlayObserver.observe(node));
    window.addEventListener("resize", () => this.updateBadgeBounds());
  }

  setTouch(on) {
    const value = String(Boolean(on));
    if (document.documentElement.dataset.touch === value) return;
    document.documentElement.dataset.touch = value;
    this.touch = Boolean(on);
    this.clearInput();
    this.coachKey = null;
    if (this.brief?.open) $("brief-controls").innerHTML = this.controlHints(this.game.chapter);
    if (this.badgeOverlays) requestAnimationFrame(() => this.updateBadgeBounds());
  }

  updateBadgeBounds() {
    const rects = this.badgeOverlays.map((node) => node.getBoundingClientRect());
    this.view.badgeKeepouts = rects.filter((rect) => rect.width > 0 && rect.height > 0);
    // Floating strike callouts (coach, flak) sit just above the flight panel or the stick.
    const style = document.documentElement.style;
    const clear = (id) => {
      const r = $(id).getBoundingClientRect();
      return r.height > 0 ? `${Math.round(innerHeight - r.top)}px` : "0px";
    };
    style.setProperty("--panel-clear", clear("flight-panel"));
    style.setProperty("--stick-clear", clear("move-stick"));
    // The strike camera frames the district above a full-width flight panel and the touch stick.
    if (this.game.chapter === 0) {
      const panel = $("flight-panel").getBoundingClientRect(),
        stick = $("move-stick").getBoundingClientRect();
      let top = panel.width > innerWidth * 0.6 ? panel.top : innerHeight;
      if (stick.height > 0 && top < innerHeight) top = Math.min(top, stick.top);
      const inset = Math.max(0, Math.round(innerHeight - top));
      if (Math.abs(inset - (this.view.hudInset || 0)) > 2) {
        this.view.hudInset = inset;
        this.view.resize();
      }
    }
    this.view.needsRender = true;
  }

  // The difficulty picker in Mission Control. A new mode applies from the next mission start.
  buildDifficulty() {
    const box = $("difficulty-options");
    box.innerHTML = DIFFICULTIES.map(
      (name) => `<button type="button" role="radio" data-mode="${name}" class="mode-${name}">${DIFFICULTY[name].label}</button>`,
    ).join("");
    box.onclick = (event) => {
      const button = event.target.closest("[data-mode]");
      if (button) this.setDifficulty(button.dataset.mode);
    };
    this.showDifficulty();
  }

  setDifficulty(name) {
    if (!DIFFICULTIES.includes(name)) return;
    const changed = name !== this.game.difficulty;
    this.game.difficulty = this.save.difficulty = name;
    this.persist();
    this.showDifficulty(changed && this.game.mission && this.game.status === "playing");
  }

  showDifficulty(pending = false) {
    const name = this.game.difficulty;
    for (const button of $("difficulty-options").querySelectorAll("[data-mode]")) {
      const on = button.dataset.mode === name;
      button.classList.toggle("selected", on);
      button.setAttribute("aria-checked", String(on));
    }
    $("difficulty-blurb").textContent = `${difficulty(name).blurb}${pending ? " Retry the mission to play it this way." : ""}`;
  }

  persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
    } catch {
      /* Private-mode storage is optional. */
    }
  }

  get strike() {
    return this.game.chapter === 0 ? this.game.op : null;
  }

  bind() {
    $("drop").onclick = () => {
      this.game.audio.unlock();
      this.strike?.release();
    };
    $("salvo").onclick = () => {
      this.game.audio.unlock();
      this.strike?.salvo();
    };
    $("formation").onclick = () => this.strike?.toggleFormation();
    $("reverse").onclick = () => this.strike?.reverse();
    $("floor-up").onclick = () => this.dial(1);
    $("floor-down").onclick = () => this.dial(-1);
    $("settings").onclick = () => this.menu();
    $("pause").onclick = () => this.menu();
    $("resume").onclick = $("menu-close").onclick = () => this.resume();
    this.dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      this.resume();
    });
    $("retry").onclick = $("result-retry").onclick = () => this.start(this.game.index);
    $("skip").onclick = () => this.start((this.game.index + 1) % MISSIONS.length);
    $("story").onclick = () => {
      this.dialog.close();
      this.prologue(true);
    };
    $("result-next").onclick = () =>
      this.start(this.game.status === "success" ? (this.game.index + 1) % MISSIONS.length : this.game.index);
    $("result-dialog").addEventListener("cancel", (e) => e.preventDefault());
    $("brief-launch").onclick = () => this.launch();
    this.brief.addEventListener("cancel", (e) => {
      e.preventDefault();
      this.launch();
    });
    $("prologue-start").onclick = () => this.closePrologue();
    $("prologue-dialog").addEventListener("cancel", (e) => {
      e.preventDefault();
      this.closePrologue();
    });
    document.querySelectorAll("[data-chapter]").forEach((button) => {
      button.onclick = () => this.start(MISSIONS.findIndex((m) => m.chapter === +button.dataset.chapter));
    });
    $("sound").onclick = () => {
      this.game.audio.unlock();
      this.save.muted = !this.save.muted;
      this.updateSound();
      this.persist();
    };
    $("audio-enabled").onchange = () => {
      this.save.muted = !$("audio-enabled").checked;
      this.updateSound();
      this.persist();
    };
    $("reduced-motion").onchange = () => {
      this.game.reducedMotion = $("reduced-motion").checked;
      this.save.reducedMotion = this.game.reducedMotion;
      document.documentElement.dataset.reducedMotion = String(this.game.reducedMotion);
      this.persist();
    };
    $("gun-weapon").onclick = () => this.weapon("gun");
    $("rocket-weapon").onclick = () => this.weapon("rocket");
    $("guided-weapon").onclick = () => this.weapon("guided");
    $("laser-weapon").onclick = () => this.weapon("laser");
    $("strike-action").onclick = () => this.game.op?.callAirStrike?.();
    $("flare-action").onclick = () => this.game.rescue?.flare();
    const winch = $("winch-action");
    winch.onpointerdown = (event) => {
      if (this.game.paused || !this.game.rescue) return;
      event.preventDefault();
      winch.setPointerCapture(event.pointerId);
      this.winchHeld = true;
    };
    winch.onpointerup = winch.onpointercancel = winch.onlostpointercapture = () => (this.winchHeld = false);
    $("flight-cards").addEventListener("click", (event) => {
      const chip = event.target.closest("[data-bomb]");
      if (chip) this.strike?.select(chip.dataset.bomb);
    });
    $("ladder-floors").addEventListener("click", (event) => {
      const strike = this.strike;
      if (!strike) return;
      const row = event.target.closest("[data-floor]");
      if (row) strike.setFloor(+row.dataset.floor + 1);
      // Angle buttons point the pattern along one of four axes; the lit one again flips it round.
      const turn = event.target.closest("[data-turn]");
      if (turn) {
        const want = +turn.dataset.turn,
          step = strike.patternStep;
        strike.setPatternStep(step % 4 === want ? step + 4 : want + (step >= 4 ? 4 : 0));
      }
      // Clicking the shape itself turns it one step.
      if (event.target.closest(".pattern-diagram") && isPattern(strike.selected)) strike.rotate(1);
    });
    // A HUD button clicked with a pointer hands focus back to the game, so Space never re-presses it.
    $("app").addEventListener("click", (event) => {
      if (event.detail > 0) event.target.closest("button")?.blur();
    });
    window.addEventListener("keydown", (e) => this.keydown(e));
    window.addEventListener("keyup", (e) => this.keys.delete(keyCode(e)));
    this.view.canvas.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "touch") this.aim(e.clientX, e.clientY);
    });
    this.view.canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || this.game.paused) return;
      if (this.game.chapter === 0) {
        // A click or tap marks where the bomb should land: the flight flies there and drops.
        if (this.game.status !== "playing") return;
        this.game.audio.unlock();
        this.markDrop(e.clientX, e.clientY);
        return;
      }
      this.game.audio.unlock();
      this.aim(e.clientX, e.clientY);
      this.pointerFire = true;
      this.view.canvas.setPointerCapture(e.pointerId);
    });
    this.view.canvas.addEventListener(
      "wheel",
      (e) => {
        if (!this.strike || this.game.paused || this.game.status !== "playing") return;
        e.preventDefault();
        // One step per notch: trackpads send many small deltas, and sideways scrolls none.
        this.wheel = (this.wheel || 0) + (e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY);
        while (Math.abs(this.wheel) >= 100) {
          // Scrolling up raises the floor or turns the pattern clockwise.
          this.dial(this.wheel < 0 ? 1 : -1);
          this.wheel -= Math.sign(this.wheel) * 100;
        }
      },
      { passive: false },
    );
    // Right-click cancels the drop mark.
    this.view.canvas.addEventListener("contextmenu", (e) => {
      if (!this.strike) return;
      e.preventDefault();
      this.strike.clearAim();
    });
    // The minimap: tap or click anywhere on it to mark a drop point there.
    $("radar-map").addEventListener("pointerdown", (e) => {
      if (!this.strike || this.game.paused || this.game.status !== "playing") return;
      e.preventDefault();
      this.game.audio.unlock();
      const point = this.radarToWorld(e.offsetX, e.offsetY);
      if (point) this.strike.setAim(point);
    });
    const release = () => (this.pointerFire = false);
    this.view.canvas.addEventListener("pointerup", release);
    this.view.canvas.addEventListener("pointercancel", release);
    this.view.canvas.addEventListener("lostpointercapture", release);
    window.addEventListener("blur", () => {
      this.clearInput();
      if (this.game.status === "playing" && !this.anyDialog()) this.menu();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.game.status === "playing" && !this.anyDialog()) this.menu();
    });
  }

  // The flight panel's dial: the pattern angle while a pattern bomb is selected, else the Drill floor.
  dial(step) {
    const strike = this.strike;
    if (!strike) return;
    const mode = this.dialMode();
    if (mode === "angle") strike.rotate(step);
    else if (mode === "floor") strike.setFloor(strike.floor + step);
  }

  // What the dial controls: a selected pattern's angle, the Drill floor if the flight carries
  // Drills, or nothing.
  dialMode() {
    const strike = this.strike;
    if (!strike) return null;
    if (isPattern(strike.selected)) return "angle";
    return strike.aircraft.some((a) => a.payload.drill !== undefined) ? "floor" : null;
  }

  // Payload keys number the bombs in the order their chips appear, card by card.
  flightKinds() {
    const strike = this.strike;
    if (!strike) return [];
    const kinds = [];
    for (const a of strike.aircraft)
      for (const kind of BOMB_ORDER) if (a.payload[kind] !== undefined && !kinds.includes(kind)) kinds.push(kind);
    return kinds;
  }

  markDrop(clientX, clientY) {
    const strike = this.strike;
    if (!strike) return;
    const point = this.view.pickStrike(clientX, clientY, strike.buildings, strike.land ? 0.05 : 1);
    if (point) strike.setAim(point);
  }

  // Minimap transform: world metres to canvas pixels, turned like the camera in portrait.
  radarFrame() {
    const canvas = $("radar-map");
    const b = this.game.op?.bounds;
    if (!b) return null;
    const portrait = this.view.strikePortrait;
    const spanX = b.maxX - b.minX + 8,
      spanZ = b.maxZ - b.minZ + 8;
    const across = portrait ? spanZ : spanX,
      down = portrait ? spanX : spanZ;
    const scale = Math.min(canvas.width / across, canvas.height / down);
    const cx = (b.minX + b.maxX) / 2,
      cz = (b.minZ + b.maxZ) / 2;
    return { canvas, portrait, scale, cx, cz };
  }

  worldToRadar(f, x, z) {
    const u = f.portrait ? -(z - f.cz) : x - f.cx,
      v = f.portrait ? x - f.cx : z - f.cz;
    return [f.canvas.width / 2 + u * f.scale, f.canvas.height / 2 + v * f.scale];
  }

  radarToWorld(px, py) {
    const f = this.radarFrame();
    if (!f) return null;
    const canvas = f.canvas,
      r = canvas.getBoundingClientRect();
    const u = ((px * canvas.width) / r.width - canvas.width / 2) / f.scale,
      v = ((py * canvas.height) / r.height - canvas.height / 2) / f.scale;
    return f.portrait ? { x: f.cx + v, z: f.cz - u } : { x: f.cx + u, z: f.cz + v };
  }

  drawRadar(op) {
    const f = this.radarFrame();
    if (!f || !op.radar) return;
    const c = f.canvas.getContext("2d");
    const at = (x, z) => this.worldToRadar(f, x, z);
    c.clearRect(0, 0, f.canvas.width, f.canvas.height);
    const b = op.radar.bounds;
    // City plate, then every building as a block; the shelter in blue.
    const corners = [at(b.minX, b.minZ), at(b.maxX, b.maxZ)];
    c.fillStyle = "rgba(240, 215, 170, 0.22)";
    c.fillRect(Math.min(corners[0][0], corners[1][0]), Math.min(corners[0][1], corners[1][1]), Math.abs(corners[1][0] - corners[0][0]), Math.abs(corners[1][1] - corners[0][1]));
    for (const building of this.game.op.buildings) {
      const [x0, y0] = at(building.min[0], building.min[2]),
        [x1, y1] = at(building.max[0], building.max[2]);
      c.fillStyle = building.kind === "shelter" ? "#2f86e8" : "rgba(255, 255, 255, 0.28)";
      c.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
    // The camera's window.
    const win = this.view.strikeWindow,
      follow = this.view.strikeFollow;
    if (win && follow) {
      const [x0, y0] = at(follow.x - win.w, follow.z - win.d),
        [x1, y1] = at(follow.x + win.w, follow.z + win.d);
      c.strokeStyle = "rgba(255, 255, 255, 0.7)";
      c.lineWidth = 1;
      c.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
    // The safe airspace, and tunnel entrances (with a dot while someone hides inside).
    if (op.radar.airspace) {
      const s = op.radar.airspace;
      const [x0, y0] = at(-s.x, s.min),
        [x1, y1] = at(s.x, s.max);
      c.setLineDash([4, 3]);
      c.strokeStyle = "rgba(127, 216, 255, 0.8)";
      c.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      c.setLineDash([]);
    }
    for (const t of op.radar.tunnels || []) {
      const [x, y] = at(t.x, t.z);
      c.fillStyle = "#1a1420";
      c.fillRect(x - 3.5, y - 3.5, 7, 7);
      c.strokeStyle = "#ffcc1f";
      c.lineWidth = 1.5;
      c.strokeRect(x - 3.5, y - 3.5, 7, 7);
      if (t.inside) {
        c.fillStyle = "#ff4b2b";
        c.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
    }
    for (const r of op.radar.rallies) {
      const [x, y] = at(r.x, r.z);
      c.strokeStyle = r.active ? "#ff4b2b" : "#ffc62b";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x, y, 5, 0, Math.PI * 2);
      c.stroke();
    }
    const colors = { enemy: "#ff4b2b", officer: "#ffc62b", flak: "#ff3b3b", mast: "#ff8a2b", truck: "#ff4b2b", ship: "#ff4b2b", civilian: "#7fd8ff" };
    for (const t of op.radar.targets) {
      const [x, y] = at(t.x, t.z);
      c.fillStyle = colors[t.kind] || "#ff4b2b";
      const size = t.kind === "enemy" || t.kind === "officer" ? 2.2 : 3.2;
      c.fillRect(x - size, y - size, size * 2, size * 2);
    }
    if (op.radar.pipper) {
      const [x, y] = at(op.radar.pipper.x, op.radar.pipper.z);
      c.strokeStyle = BOMBS[op.selected]?.css || "#ffffff";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x, y, 4, 0, Math.PI * 2);
      c.stroke();
    }
    if (op.aim) {
      const [x, y] = at(op.aim.x, op.aim.z);
      c.strokeStyle = "#ffd23f";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x - 6, y);
      c.lineTo(x + 6, y);
      c.moveTo(x, y - 6);
      c.lineTo(x, y + 6);
      c.stroke();
    }
    if (op.radar.flight) {
      const [x, y] = at(op.radar.flight.x, op.radar.flight.z);
      const heading = f.portrait ? (op.radar.flight.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : op.radar.flight.dir > 0 ? 0 : Math.PI;
      c.save();
      c.translate(x, y);
      c.rotate(heading);
      c.fillStyle = "#ffc62b";
      c.beginPath();
      c.moveTo(7, 0);
      c.lineTo(-5, -5);
      c.lineTo(-2, 0);
      c.lineTo(-5, 5);
      c.closePath();
      c.fill();
      c.restore();
    }
  }

  anyDialog() {
    return [this.dialog, this.brief, $("result-dialog"), $("prologue-dialog")].some((d) => d.open);
  }

  keydown(e) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    const code = keyCode(e),
      confirm = e.key === "Enter" || e.key === " ";
    if (this.anyDialog()) {
      // A Space or Enter still held from the last release must not click through the next dialog.
      if (confirm && e.repeat) e.preventDefault();
      if (this.brief.open && confirm && !e.repeat) {
        e.preventDefault();
        this.launch();
      }
      // Everything else (Escape, Tab, Space on a focused button) keeps its native dialog behaviour.
      return;
    }
    if (GAME_KEYS.has(code)) e.preventDefault();
    if (e.key === "Escape") {
      if (!e.repeat) this.menu();
      return;
    }
    if (this.game.paused || this.game.status !== "playing") return;
    this.game.audio.unlock();
    if (this.finePointer.matches && !e.repeat) this.setTouch(false);
    this.keys.add(code);
    if (e.repeat) return;
    if (code === "KeyR") return this.start(this.game.index);
    const digit = +(/^(?:Digit|Numpad)([1-9])$/.exec(code)?.[1] || 0);
    const strike = this.strike;
    if (strike) {
      const pick = this.flightKinds()[digit - 1];
      if (pick) strike.select(pick);
      if (code === "Space") strike.release();
      if (code === "KeyX") strike.salvo();
      if (code === "KeyQ") strike.toggleFormation();
      if (code === "KeyF") strike.reverse();
      if (code === "KeyE") this.dial(1);
      if (code === "KeyC") this.dial(-1);
      return;
    }
    if (digit) this.weapon(this.arsenal()[digit - 1] || this.game.weapon);
    if (code === "KeyF") this.game.rescue?.flare();
    if (code === "KeyQ" && this.game.chapter === 1) this.game.op.callAirStrike();
  }

  aim(x, y) {
    this.pointerPosition = { x, y };
    if (this.game.chapter === 0) return;
    const shots = this.game.projectiles.filter((s) => s.hostile && s.missile);
    this.game.input.aim.copy(this.view.aim(x, y, [...this.game.entities.filter(isHostileEntity), ...shots]));
  }

  bindStick(id, fire) {
    const element = $(id),
      knob = element.querySelector(".stick-knob");
    let pointer = null;
    const move = (event) => {
      if (pointer !== event.pointerId) return;
      const r = element.getBoundingClientRect();
      const radius = r.width * 0.32;
      let x = (event.clientX - r.left - r.width / 2) / radius;
      let z = (event.clientY - r.top - r.height / 2) / radius;
      const length = Math.hypot(x, z);
      if (length > 1) {
        x /= length;
        z /= length;
      }
      knob.style.transform = `translate(${x * radius}px,${z * radius}px)`;
      if (fire) this.fireStick = length < 0.18 ? null : { x, z };
      else this.moveStick = length < 0.1 ? { x: 0, z: 0 } : { x, z };
    };
    element.onpointerdown = (event) => {
      if (pointer !== null || this.game.paused) return;
      event.preventDefault();
      pointer = event.pointerId;
      this.game.audio.unlock();
      element.setPointerCapture(pointer);
      move(event);
    };
    element.onpointermove = move;
    const reset = () => {
      const old = pointer;
      pointer = null;
      if (old !== null && element.hasPointerCapture(old)) element.releasePointerCapture(old);
      knob.style.transform = "";
      if (fire) this.fireStick = null;
      else this.moveStick = { x: 0, z: 0 };
    };
    const release = (event) => {
      if (pointer === event.pointerId) reset();
    };
    this.padResets.push(reset);
    element.onpointerup = element.onpointercancel = element.onlostpointercapture = release;
  }

  clearInput() {
    this.padResets.forEach((reset) => reset());
    this.keys.clear();
    this.pointerFire = false;
    this.fireStick = null;
    this.winchHeld = false;
    this.moveStick = { x: 0, z: 0 };
    Object.assign(this.game.input, { winch: false, fire: false, stickAim: null, x: 0, z: 0 });
    document.querySelectorAll(".stick-knob").forEach((el) => (el.style.transform = ""));
  }

  updateInput() {
    if (this.game.paused) return;
    const held = (code) => (this.keys.has(code) ? 1 : 0);
    const input = this.game.input;
    let { x: stickX, z: stickZ } = this.moveStick;
    // The stick is screen-relative. In the portrait strike camera screen right runs north (-z) and
    // screen down runs east (+x); keys keep their meaning there (W / S steer, A / D throttle).
    if (this.game.chapter === 0 && this.view.strikePortrait) [stickX, stickZ] = [stickZ, -stickX];
    input.x = held("KeyD") + held("ArrowRight") - held("KeyA") - held("ArrowLeft") + stickX;
    input.z = held("KeyS") + held("ArrowDown") - held("KeyW") - held("ArrowUp") + stickZ;
    input.x = Math.max(-1, Math.min(1, input.x));
    input.z = Math.max(-1, Math.min(1, input.z));
    if (this.game.chapter === 0) {
      input.fire = false;
      return;
    }
    input.fire = this.pointerFire || this.keys.has("Space") || Boolean(this.fireStick);
    if (this.aimedByStick && !this.fireStick && this.game.aimPoint) input.aim.copy(this.game.aimPoint);
    this.aimedByStick = Boolean(this.fireStick);
    input.stickAim = this.fireStick;
    if (input.fire && !this.fireStick && this.pointerPosition) this.aim(this.pointerPosition.x, this.pointerPosition.y);
    input.winch = this.game.chapter === 2 && (this.winchHeld || this.keys.has("KeyE"));
    if (this.game.chapter === 2) {
      const length = Math.min(1, Math.hypot(input.x, input.z));
      if (length > 0) {
        const direction = this.view.screenDirection(input);
        input.x = direction.x * length;
        input.z = direction.z * length;
      }
    }
  }

  // Weapons on keys 1-3: Marlin carries rockets and a laser, Lantern rockets and guided missiles.
  arsenal() {
    return [["gun"], ["gun", "rocket", "laser"], ["gun", "rocket", "guided"]][this.game.chapter] || ["gun"];
  }

  weapon(kind) {
    if (!this.arsenal().includes(kind)) kind = "gun";
    this.game.weapon = kind;
    for (const name of ["gun", "rocket", "guided", "laser"]) $(`${name}-weapon`).classList.toggle("selected", kind === name);
    $("weapon-label").textContent =
      kind === "guided"
        ? "GUIDED MISSILES"
        : kind === "rocket"
          ? "ROCKET PODS"
          : kind === "laser"
            ? "LASER / HOLD"
            : this.game.chapter === 1
              ? "DECK GUN"
              : "CHAIN GUN";
  }

  updateSound() {
    this.game.audio.muted = this.save.muted;
    $("sound").innerHTML = `<i data-lucide="${this.save.muted ? "volume-x" : "volume-2"}"></i>`;
    $("sound").setAttribute("aria-label", this.save.muted ? "Unmute sound" : "Mute sound");
    $("sound").title = this.save.muted ? "Unmute sound" : "Mute sound";
    $("audio-enabled").checked = !this.save.muted;
    refreshIcons();
  }

  // ------------------------------------------------------------------ dialogs

  prologue(force = false) {
    if (!force && (this.save.seenPrologue || (this.qa && !this.params.has("prologue")))) return false;
    this.game.paused = true;
    this.clearInput();
    $("prologue-eyebrow").textContent = PROLOGUE.eyebrow;
    $("prologue-title").textContent = PROLOGUE.title;
    $("prologue-text").innerHTML = PROLOGUE.paragraphs.map((p) => `<p>${escape(p)}</p>`).join("");
    $("prologue-action").textContent = force ? "Back to the mission" : PROLOGUE.action;
    $("prologue-dialog").showModal();
    return true;
  }

  closePrologue() {
    $("prologue-dialog").close();
    this.save.seenPrologue = true;
    this.persist();
    this.game.audio.unlock();
    if (this.pendingBrief && this.game.status === "playing") this.showBrief();
    else if (!this.anyDialog()) this.game.paused = false;
  }

  showBrief() {
    this.pendingBrief = false;
    const g = this.game,
      story = MISSION_STORY[g.index],
      chapter = CHAPTER_STORY[g.chapter];
    const first = MISSIONS.findIndex((m) => m.chapter === g.chapter) === g.index;
    $("brief-eyebrow").textContent = `CHAPTER 0${g.chapter + 1} / ${chapter.title.toUpperCase()} / MISSION ${missionNumber(g.index)}`;
    $("brief-clock").textContent = `${story.place} / ${story.clock}`;
    $("brief-title").textContent = g.mission.name;
    $("brief-chapter").textContent = first ? chapter.intro : "";
    $("brief-chapter").hidden = !first;
    $("brief-goals").innerHTML = story.goals.map((goal) => `<li><i data-lucide="target"></i>${escape(goal)}</li>`).join("");
    $("brief-lines").innerHTML = story.brief.map((line) => `<div class="radio-line">${lineMarkup(line)}</div>`).join("");
    $("brief-controls").innerHTML = this.controlHints(g.chapter);
    refreshIcons();
    g.paused = true;
    this.brief.showModal();
    $("brief-launch").focus();
  }

  controlHints(chapter) {
    // Chapter 1 only lists the controls this mission's flight can use.
    const op = chapter === 0 ? this.game.op : null;
    const drill = Boolean(op?.aircraft.some((a) => a.payload.drill !== undefined));
    const flight = (op?.aircraft.length || 0) > 1;
    const kinds = new Set(op ? op.aircraft.flatMap((a) => Object.keys(a.payload)) : []);
    const pattern = [...kinds].some(isPattern);
    const keys = [
      [
        ["W / S", "Steer the formation"],
        ["A / D", "Fly along the line (tap back to nudge, hold to turn)"],
        ["F", "Reverse"],
        kinds.size > 1 && [`1-${kinds.size}`, "Payload"],
        ["CLICK", "Mark the drop: the flight flies there and drops"],
        ["SPACE", "Drop now"],
        ["RIGHT CLICK", "Cancel the mark"],
        flight && ["X", "Salvo"],
        flight && ["Q", "Formation spacing"],
        drill && ["E / C", "Drill floor"],
        pattern && ["E / C / WHEEL", "Turn the pattern"],
      ],
      [
        ["WASD", "Steer Marlin"],
        ["POINTER", "Aim and fire"],
        ["1 / 2 / 3", "Gun / rockets / laser"],
        ["Q", "Air strike where you aim"],
        ["BLOCK", "Sit between guns and barges"],
      ],
      [
        ["WASD", "Fly Lantern"],
        ["POINTER", "Aim and fire"],
        ["1 / 2 / 3", "Gun / rockets / guided"],
        ["HOLD E", "Winch or land"],
        ["F", "Flares"],
      ],
    ];
    const touch = [
      [
        ["STICK", "Fly the formation"],
        ["REVERSE", "Turn the flight round"],
        kinds.size > 1 && ["CARDS", "Tap a payload"],
        ["TAP", "Mark the drop: the flight flies there and drops"],
        ["RELEASE", "Drop now"],
        flight && ["SALVO", "Every aircraft at once"],
        drill && ["LADDER", "Tap a floor for the Drill"],
        pattern && ["ARROWS", "Turn the pattern"],
      ],
      [
        ["LEFT STICK", "Steer Marlin"],
        ["RIGHT STICK", "Aim and fire"],
        ["ICONS", "Gun, rockets, laser; orange for the air strike"],
        ["BLOCK", "Sit between guns and barges"],
      ],
      [
        ["LEFT STICK", "Fly Lantern"],
        ["RIGHT STICK", "Aim and fire"],
        ["WINCH", "Hold to lift or land"],
        ["FLARES", "Tap to break a lock"],
      ],
    ];
    const tag = this.touch ? "b" : "kbd";
    return (this.touch ? touch : keys)[chapter]
      .filter(Boolean)
      .map(([key, text]) => `<span><${tag} class="pad">${key}</${tag}>${text}</span>`)
      .join("");
  }

  launch() {
    if (!this.brief.open) return;
    this.brief.close();
    this.clearInput();
    this.game.audio.unlock();
    this.game.paused = false;
  }

  menu() {
    if (this.anyDialog() || !this.game.mission) return;
    this.game.paused = true;
    this.clearInput();
    this.fillMissions();
    const story = MISSION_STORY[this.game.index];
    $("mission-briefing").textContent = `${this.game.mission.name}: ${story.goals.join(". ")}.`;
    this.dialog.showModal();
  }

  resume() {
    this.dialog.close();
    this.clearInput();
    this.game.paused = false;
  }

  start(index) {
    this.dialog.close();
    $("result-dialog").close();
    this.brief.close();
    this.clearInput();
    this.game.audio.unlock();
    this.game.start(index);
  }

  fillMissions() {
    const list = $("mission-list");
    list.innerHTML = "";
    CHAPTERS.forEach((chapter, c) => {
      const group = document.createElement("div");
      group.className = "mission-group";
      group.innerHTML = `<span class="group-title" style="--tone:${chapter.color}">0${c + 1} ${chapter.name}</span>`;
      MISSIONS.forEach((mission, index) => {
        if (mission.chapter !== c) return;
        const record = this.save.records[index];
        const button = document.createElement("button");
        button.className = `${index === this.game.index ? "active" : ""} ${record ? "completed" : ""}`;
        button.innerHTML = `<span>${c + 1}.${missionNumber(index)}</span>${escape(mission.name)}<em>${"★".repeat(record?.stars || 0)}${"☆".repeat(3 - (record?.stars || 0))}</em>`;
        button.setAttribute(
          "aria-label",
          `Mission ${c + 1}.${missionNumber(index)}: ${mission.name}, ${record ? `${record.stars} of 3 stars` : "not completed"}`,
        );
        button.onclick = () => this.start(index);
        group.append(button);
      });
      list.append(group);
    });
  }

  // ------------------------------------------------------------------ events

  onEvent(type, data) {
    if (type === "start") this.onStart(data);
    else if (type === "toast") {
      $("toast").textContent = data;
      $("toast").classList.add("visible");
      this.toastTime = performance.now() + 2100;
    } else if (type === "radio") this.radio(data);
    else if (type === "combo") {
      $("combo-count").textContent = `MULTI-KILL x${data.count}`;
      $("combo-bonus").textContent = `+${data.bonus}`;
      $("combo").classList.remove("visible");
      void $("combo").offsetWidth;
      $("combo").classList.add("visible");
      this.comboTime = performance.now() + 1600;
    } else if (type === "checkpoint") {
      $("toast").textContent = data;
      $("toast").classList.add("visible", "checkpoint");
      this.toastTime = performance.now() + 2600;
    } else if (type === "result") this.showResult(data);
  }

  onStart(data) {
    const c = this.game.chapter,
      m = data.mission,
      story = MISSION_STORY[data.index];
    document.body.dataset.chapter = c;
    document.querySelectorAll("[data-chapter]").forEach((button) =>
      button.classList.toggle("active", +button.dataset.chapter === c),
    );
    $("chapter-label").textContent = `CHAPTER 0${c + 1} / ${CHAPTER_STORY[c].subtitle.toUpperCase()}`;
    $("mission-name").textContent = m.name;
    $("objective").textContent = story.goals[0];
    $("mission-index").textContent = `MISSION ${String(missionNumber(data.index)).padStart(2, "0")} / ${String(chapterSize(c)).padStart(2, "0")}`;
    $("difficulty-chip").textContent = this.game.mode.label.toUpperCase();
    $("difficulty-chip").className = `mode-chip mode-${this.game.difficulty}`;
    this.showDifficulty();
    $("footer-mode").textContent = [`${story.place} / AIRBORNE`, `${story.place} / UPRIVER`, `${story.place} / EXTRACTION`][c];
    $("flight-panel").hidden = $("ladder").hidden = $("intel").hidden = $("radar").hidden = c !== 0;
    if (c === 0) $("radar-title").textContent = `${STRIKE_MISSIONS[data.index].harbour ? "HARBOUR" : "CITY"} MAP / ${this.touch ? "TAP" : "CLICK"} TO MARK`;
    $("combat-controls").hidden = c === 0;
    $("shield-hud").hidden = c === 0;
    $("convoy-hud").hidden = c !== 1;
    $("rocket-weapon").hidden = c === 0;
    $("guided-weapon").hidden = c !== 2;
    $("laser-weapon").hidden = $("strike-action").hidden = c !== 1;
    $("rocket-weapon").classList.remove("empty");
    $("laser-weapon").classList.remove("overheated");
    $("rescue-hud").hidden = $("rescue-actions").hidden = c !== 2;
    $("rocket-stock").hidden = c === 0;
    $("rocket-weapon").disabled = false;
    // Progressive HUD: Drill floor, salvo and formation controls only appear when this flight can use them.
    const flight = c === 0 ? this.game.op.aircraft : [];
    const drill = flight.some((a) => a.payload.drill !== undefined);
    const pattern = flight.some((a) => Object.keys(a.payload).some(isPattern));
    $("floor-control").hidden = !drill && !pattern;
    $("ladder").classList.toggle("no-drill", !drill);
    $("ladder").classList.toggle("pattern-mode", c === 0 && Boolean(this.game.op.fleet));
    this.patternKey = null;
    $("salvo").hidden = $("formation").hidden = flight.length < 2;
    $("coach").hidden = true;
    this.coachKey = null;
    // The shield panel names the chance that enemy fire reaching you does harm.
    const chance = this.game.hitChance > 0 ? `${percent(this.game.hitChance)} HIT` : "SAFE";
    $("shield-title").textContent = `${c === 1 ? "MARLIN" : "LANTERN"} SHIELDS / ${chance}`;
    $("comms").innerHTML = "";
    for (const el of this.labels.values()) el.remove();
    this.labels.clear();
    if (c === 0) this.buildFlightCards();
    this.weapon("gun");
    $("toast").classList.remove("visible", "checkpoint");
    $("flak-warning").hidden = true;
    $("flak-warning").classList.remove("calm", "break");
    // Flak locks are urgent alerts; the canal's steady banner is announced politely.
    $("flak-warning").setAttribute("role", c === 0 ? "alert" : "status");
    this.intelKey = this.ladderKey = null;
    this.lastHUD = -1;
    this.updateHUD(true);
    const skip = this.qa && !this.params.has("brief");
    if (skip) this.game.paused = false;
    else if (!this.prologue()) this.showBrief();
    else this.pendingBrief = true;
  }

  radio(line) {
    const feed = $("comms");
    const cast = speaker(line.who);
    const item = document.createElement("div");
    item.className = `radio-line live ${cast.hostile ? "intercept" : ""}`;
    item.innerHTML = lineMarkup(line);
    feed.prepend(item);
    while (feed.children.length > 2) feed.lastChild.remove();
    setTimeout(() => item.classList.add("fading"), 7000);
    setTimeout(() => item.remove(), 7800);
  }

  buildFlightCards() {
    const op = this.game.op;
    const keys = this.flightKinds();
    $("flight-cards").innerHTML = op.aircraft
      .map((a) => {
        const cast = CAST[a.crew] || CAST.iona;
        const chips = BOMB_ORDER.filter((kind) => a.payload[kind] !== undefined)
          .map(
            (kind) =>
              `<button class="bomb-chip" data-bomb="${kind}" style="--bomb:${BOMBS[kind].css}" title="${BOMBS[kind].name}: ${BOMBS[kind].summary} (${keys.indexOf(kind) + 1})"><i data-lucide="${BOMB_ICON[kind]}"></i><span>${BOMBS[kind].name}</span><strong>0</strong></button>`,
          )
          .join("");
        return `<div class="flight-card" data-aircraft="${a.index}" style="--tone:${["#ffc62b", "#ff8a6b", "#33d69f"][a.index]}"><div class="card-head"><i data-lucide="plane"></i><b>${escape(a.callsign)}</b><span class="hp"></span></div><div class="chips">${chips}</div><small>${escape(cast.name)}</small></div>`;
      })
      .join("");
    refreshIcons();
  }

  showResult(result) {
    this.clearInput();
    this.game.paused = true;
    if (result.success) {
      this.save.records = saveResult(this.save.records, result.index, result.score, result.stars);
      this.persist();
    }
    const story = MISSION_STORY[result.index];
    const finale = result.success && result.index === MISSIONS.length - 1;
    const chapterEnd = result.success && MISSIONS[result.index + 1]?.chapter !== MISSIONS[result.index].chapter;
    $("result-eyebrow").textContent = finale
      ? FINALE.eyebrow
      : result.success
        ? chapterEnd
          ? `CHAPTER 0${this.game.chapter + 1} COMPLETE`
          : "MISSION COMPLETE"
        : "MISSION FAILED";
    $("result-title").textContent = finale ? FINALE.title : result.success ? this.game.mission.name : "Regroup, Kestrel.";
    $("result-story").textContent = finale ? `${story.success} ${FINALE.text}` : result.success ? story.success : this.failureText(result, story);
    $("result-stars").innerHTML = Array.from(
      { length: 3 },
      (_, i) => `<i data-lucide="star" class="${i < result.stars ? "earned" : ""}"></i>`,
    ).join("");
    $("result-stars").setAttribute("aria-label", `${result.stars} of 3 stars`);
    $("result-criteria").innerHTML = this.criteria(result)
      .map(([ok, text]) => `<li class="${ok ? "met" : ""}"><i data-lucide="${ok ? "check" : "circle"}"></i>${escape(text)}</li>`)
      .join("");
    $("result-score").textContent = result.score.toLocaleString();
    $("result-targets").textContent = result.kills;
    $("result-best").textContent = (this.save.records[result.index]?.score || 0).toLocaleString();
    $("result-next").innerHTML = `${finale ? "Play again" : result.success ? "Next mission" : "Try again"}<i data-lucide="arrow-right"></i>`;
    refreshIcons();
    $("result-dialog").showModal();
    $("result-next").focus();
  }

  failureText(result, story) {
    return (
      {
        shelter: "A bomb struck the civilian shelter and the strike was aborted. Keep every pipper off the blue roof.",
        ferry: `A bomb struck the ${this.game.op?.abortedBy || "Island Belle"} and the strike was aborted. When the pattern turns blue, a civilian boat is inside it: hold your release.`,
        flight: "Kestrel Flight was shot down. Silence the flak first and change lane when a red lock line appears.",
        barges: "Both barges sank before reaching the lock. Shield them with Marlin and steer them clear of mines.",
      }[result.reason] || story.failure
    );
  }

  criteria(result) {
    const g = this.game,
      op = g.op;
    if (g.chapter === 0)
      return [
        [result.success, op.fleet ? `Sink ${op.fleet.needed()} boats, the key ships among them` : "Eliminate every target"],
        [result.success && op.used <= op.layout.par, `Use ${op.layout.par} bombs or fewer (used ${op.used})`],
        [result.success && !op.damaged, "Bring the whole flight home unscathed"],
      ];
    if (g.chapter === 1) {
      const lost = op.barges.filter((b) => !b.alive).length;
      return [
        [result.success, "Deliver the convoy"],
        [result.success && lost === 0, "Both barges survive"],
        [result.stars >= 3, "Barges above 60% with Marlin barely scratched"],
      ];
    }
    return [
      [result.success, "Everyone aboard and home"],
      [result.stars >= 2, "Take at most one hit"],
      [result.stars >= 3, "Take no hits"],
    ];
  }

  // ------------------------------------------------------------------ HUD

  updateHUD(force = false) {
    if (!this.game.mission) return;
    const now = performance.now();
    if (now > this.toastTime) $("toast").classList.remove("visible", "checkpoint");
    if (now > this.comboTime) $("combo").classList.remove("visible");
    if (!force && now - this.lastHUD < 80) return;
    this.lastHUD = now;
    const state = this.game.snapshot(),
      chapter = state.chapter,
      op = state.op;
    $("score").textContent = String(state.score).padStart(5, "0");
    $("mission-progress").style.width = `${state.progress * 100}%`;
    $("mission-percent").textContent = `${Math.floor(state.progress * 100)}%`;
    if (chapter === 0) this.updateStrike(op);
    else {
      const total = state.shields.reduce((a, b) => a + b, 0);
      $("shield-count").textContent = `${total} / 9`;
      setHTML(
        $("shield-segments"),
        state.shields
          .map((value) => `<span>${Array.from({ length: 3 }, (_, i) => `<i class="${i >= value ? "lost" : ""}"></i>`).join("")}</span>`)
          .join(""),
      );
    }
    if (chapter === 1) this.updateRiver(state, op);
    if (chapter === 2) {
      $("objective-count").textContent = `${op.rescued} / ${op.total}`;
      $("objective-unit").textContent = "SOLDIERS ABOARD";
    }
    const bonuses = activeBonuses({ ...state, heli: op.help?.heli, ally: op.help?.ally });
    $("powerup").hidden = chapter !== 1 || bonuses.length === 0;
    for (const kind of ["star", "gun", "heli", "ally"]) {
      const bonus = bonuses.find((entry) => entry.kind === kind);
      const row = $(`bonus-${kind}`);
      row.hidden = !bonus;
      if (!bonus) continue;
      row.querySelector("strong").textContent = `${bonus.remaining.toFixed(1)}s`;
      row.querySelector(".bonus-fill").style.transform = `scaleX(${Math.min(1, bonus.remaining / bonus.duration)})`;
    }
    this.updateLabels(op.labels || []);
    if (force) this.updateBadgeBounds();
    this.rescueHUD.update(state);
  }

  updateStrike(op) {
    this.drawRadar(op);
    const left = op.left.enemies + op.left.aa + op.left.masts + op.left.trucks + (op.left.ships || 0);
    $("objective-count").textContent = String(left).padStart(2, "0");
    const parts = [
      op.left.enemies && `${op.left.enemies} HOSTILES`,
      op.left.ships && `${op.left.ships} SHIPS`,
      op.left.aa && `${op.left.aa} FLAK`,
      op.left.masts && `${op.left.masts} JAMMER`,
      op.left.trucks && `${op.left.trucks} TRUCKS`,
    ].filter(Boolean);
    $("objective-unit").textContent = parts.join(" / ") || "TARGETS LEFT";
    op.aircraft.forEach((a, i) => {
      const card = document.querySelector(`[data-aircraft="${i}"]`);
      if (!card) return;
      card.classList.toggle("down", !a.alive);
      setHTML(
        card.querySelector(".hp"),
        a.alive ? Array.from({ length: a.maxHp }, (_, k) => `<i class="${k < a.hp ? "" : "lost"}"></i>`).join("") : "DOWN",
      );
      card.querySelectorAll("[data-bomb]").forEach((chip) => {
        const kind = chip.dataset.bomb;
        chip.querySelector("strong").textContent = a.payload[kind] ?? 0;
        chip.disabled = !a.alive || !a.payload[kind];
        chip.classList.toggle("selected", kind === op.selected && a.payload[kind] > 0);
      });
    });
    // The dial reads the pattern angle while a pattern bomb is selected, else the Drill floor.
    const pattern = op.pattern;
    const mode = this.dialMode();
    $("floor-kind").textContent = mode === "angle" ? "ANGLE" : "DRILL";
    $("floor-value").textContent = mode === "angle" ? `${pattern?.angle ?? 0}°` : mode === "floor" ? `F${op.floor}` : "–";
    $("floor-control").classList.toggle("angle", mode === "angle");
    $("floor-control").setAttribute("aria-label", mode === "angle" ? "Pattern angle" : "Drill detonation floor");
    $("floor-up").disabled = $("floor-down").disabled = !mode;
    $("formation-label").textContent = op.wide ? "WIDE" : "TIGHT";
    // In the portrait camera the flight runs down the screen flying east.
    const arrow = this.view.strikePortrait ? (op.dir > 0 ? "↓" : "↑") : op.dir > 0 ? "→" : "←";
    $("speed-value").textContent = `${arrow} ${Math.round((op.speed / FLIGHT.maxSpeed) * 100)}%`;
    $("reverse").disabled = !op.reversible;
    const ready = op.phase === "pass" && this.game.status === "playing";
    const any = op.aircraft.some((a) => a.alive && Object.values(a.payload).some((n) => n > 0));
    $("drop").disabled = !ready || !any;
    $("salvo").disabled = !ready || !any;
    $("drop-label").textContent = ready ? `Release ${BOMBS[op.selected]?.name || ""}` : `Turning ${Math.max(0, op.turn).toFixed(1)}s`;
    // The most urgent first: gatherings on now, then the soonest. CSS shows as many as fit.
    const events = op.events.filter((e) => e.alive > 0).sort((a, b) => b.active - a.active || a.next - b.next);
    const intelKey = events.map((e) => e.label).join("|");
    if (intelKey !== this.intelKey) {
      this.intelKey = intelKey;
      $("intel").innerHTML = events
        .map(
          (e) =>
            `<div class="intel-chip"><i data-lucide="${e.id ? "ship" : "users"}"></i><b>${escape(e.label)}</b><span>${escape(e.place)}</span><strong></strong></div>`,
        )
        .join("");
      refreshIcons();
    }
    [...$("intel").children].forEach((chip, i) => {
      const e = events[i];
      // A gathering only counts while its members are actually there; runners scatter it.
      const there = e.active && e.present > 0;
      const className = `intel-chip ${there ? "hot" : e.active ? "scattered" : e.next < 8 ? "soon" : ""}`;
      if (chip.className !== className) chip.className = className;
      const text = e.active ? (there ? `${e.present}/${e.alive} ${Math.ceil(e.remaining)}s` : "SCATTERED") : `${Math.ceil(e.next)}s`;
      const strong = chip.querySelector("strong");
      if (strong.textContent !== text) strong.textContent = text;
    });
    $("intel").hidden = events.length === 0;
    const flak = op.flak || [];
    $("flak-warning").hidden = flak.length === 0;
    if (flak.length) {
      // The most urgent lock leads; any others are counted.
      const [first] = flak;
      // The warning says how likely a held course is to be hit (the difficulty's hit chance);
      // narrow screens name the aircraft K1-K3.
      const risk = first.chance > 0 ? `${percent(first.chance)} IF HELD` : "SAFE FOR NOW";
      const narrow = innerWidth < 1100;
      const who = narrow ? `K${["one", "two", "three"].indexOf(first.callsign.split(" ").pop().toLowerCase()) + 1}` : first.callsign.toUpperCase();
      const text = `FLAK${narrow ? "" : " LOCK"} / ${who} / ${first.solved ? "BREAK!" : `${Math.max(0, first.in).toFixed(1)}s`} / ${risk}${flak.length > 1 ? ` +${flak.length - 1}` : ""}`;
      $("flak-warning").classList.toggle("break", first.solved);
      if ($("flak-text").textContent !== text) $("flak-text").textContent = text;
    }
    // Coach hints give way to a flak warning, which is the more urgent callout.
    const coach = flak.length || !op.hint ? "" : COACH[op.hint]?.[this.touch ? 1 : 0] || "";
    if (coach !== this.coachKey) {
      this.coachKey = coach;
      $("coach").textContent = coach;
      $("coach").hidden = !coach;
      $("coach").classList.toggle("go", op.hint === "release" || op.hint === "lance");
    }
    if (op.harbour) return this.updatePattern(op);
    const ladder = op.ladder;
    $("ladder").classList.toggle("empty", !ladder);
    $("ladder-name").textContent = ladder ? `${ladder.name}${ladder.kind === "shelter" ? " / NO STRIKE" : ""}` : "PIPPER ON OPEN GROUND";
    $("ladder").classList.toggle("shelter", ladder?.kind === "shelter" || op.shelter);
    const ladderKey = ladder ? `${ladder.name}|${ladder.floors.length}` : "";
    if (ladderKey !== this.ladderKey) {
      this.ladderKey = ladderKey;
      $("ladder-floors").innerHTML = ladder
        ? ladder.floors
            .map((f) => `<button data-floor="${f.f}" aria-label="Floor ${f.label}"><span>${f.label}</span><em></em></button>`)
            .join("")
        : "";
    }
    if (ladder)
      [...$("ladder-floors").children].forEach((row, i) => {
        const f = ladder.floors[i];
        row.classList.toggle("drill", f.f === ladder.drillFloor);
        row.classList.toggle("set", f.f + 1 === op.floor);
        const marks = `${"●".repeat(Math.min(6, f.count))}${f.props ? "▲".repeat(f.props) : ""}`;
        const em = row.querySelector("em");
        if (em.textContent !== marks) em.textContent = marks;
      });
  }

  // Four angle buttons under the pattern, each drawn as the shape itself at that angle (none for
  // the O-Ring, which looks the same at every angle).
  turnChips(p, color) {
    const names = ["Across", "Diagonal down", "Up and down", "Diagonal up"];
    // Buttons run in screen order; the portrait camera turns the world a quarter, so each shows
    // the world angle that looks that way on screen.
    const turn = this.view.strikePortrait ? 2 : 0;
    return `<div class="turn-chips">${[0, 1, 2, 3]
      .map((screen) => {
        const step = (screen - turn + 4) % 4;
        const on = p.angle % 180 === step * 45;
        const svg = this.patternSvg(patternDiagram(BOMBS[p.kind].pattern, step * ROTATION_STEP), color, 0.62, 2, 0.8);
        return `<button type="button" data-turn="${step}" class="${on ? "on" : ""}" aria-pressed="${on}" aria-label="${names[screen]}" title="${names[screen]}${on ? " (again to flip)" : ""}">${svg}</button>`;
      })
      .join("")}</div>`;
  }

  // A pattern's bomblets drawn as the player sees them: in portrait the camera looks along the
  // flight, so world x runs down the screen and world z runs right to left (as on the minimap).
  patternSvg(cells, color, radius, minSpan, pad, attrs = 'aria-hidden="true"', extra = "") {
    const portrait = this.view.strikePortrait;
    const at = (c) => (portrait ? { u: -c.z, v: c.x } : { u: c.x, v: c.z });
    const span = Math.max(minSpan, ...cells.map((c) => Math.max(Math.abs(c.x), Math.abs(c.z)))) + pad;
    const dots = cells
      .map((c) => {
        const p = at(c);
        return `<circle cx="${p.u.toFixed(2)}" cy="${p.v.toFixed(2)}" r="${radius}" fill="${color}"/>`;
      })
      .join("");
    return `<svg ${attrs} viewBox="${-span} ${-span} ${span * 2} ${span * 2}">${extra}${dots}</svg>`;
  }

  // Harbour missions: the ladder panel shows the selected pattern, its angle and what it would hit.
  updatePattern(op) {
    const p = op.pattern;
    const panel = $("ladder");
    panel.classList.remove("empty");
    panel.classList.toggle("shelter", Boolean(p?.civilian || op.shelter));
    $("ladder-name").textContent = p ? `${p.name.toUpperCase()} / ${p.angle}°` : `${(BOMBS[op.selected]?.name || "").toUpperCase()}`;
    const key = p ? `${p.kind}|${p.angle}|${this.view.strikePortrait}` : op.selected;
    if (key !== this.patternKey) {
      this.patternKey = key;
      const color = BOMBS[op.selected]?.css || "#fff";
      const cells = p?.diagram || [{ x: 0, z: 0 }];
      const label = escape(p ? `${p.name} at ${p.angle} degrees` : BOMBS[op.selected]?.name || "");
      const diagram = this.patternSvg(
        cells,
        color,
        0.55,
        3,
        0.9,
        `class="pattern-diagram" role="img" aria-label="${label}"`,
        `<title>${p ? "Click to turn" : label}</title><circle cx="0" cy="0" r="0.22" fill="#ffffff" opacity="0.8"/>`,
      );
      $("ladder-floors").innerHTML = `${diagram}${p && p.kind !== "ring" ? this.turnChips(p, color) : ""}<p class="pattern-count"></p>`;
    }
    const count = $("ladder-floors").querySelector(".pattern-count");
    let text;
    if (op.phase !== "pass") text = "TURNING";
    else if (!p) text = "Single bomb";
    else if (p.civilian) text = "CIVILIAN IN THE PATTERN";
    else if (p.hits) text = `${p.hits} ON TARGET${p.sinks ? ` / ${p.sinks} SINK` : ""}`;
    else text = "NO SHIPS UNDER IT";
    if (count && count.textContent !== text) count.textContent = text;
    count?.classList.toggle("hot", Boolean(p && p.sinks && !p.civilian));
  }

  updateRiver(state, op) {
    // The top banner says how likely enemy fire is to hurt when a gun has you in its sights.
    const incoming = op.incoming;
    $("flak-warning").hidden = !incoming.aiming;
    $("flak-warning").classList.add("calm");
    if (incoming.aiming) {
      const risk = incoming.chance > 0 ? `${percent(incoming.chance)} HIT CHANCE` : "CAN'T HIT YOU YET";
      const text = innerWidth < 700 ? `${incoming.aiming} AIMING / ${incoming.chance > 0 ? `${percent(incoming.chance)} HIT` : "SAFE"}` : `ENEMY FIRE / ${incoming.aiming} AIMING / ${risk}`;
      if ($("flak-text").textContent !== text) $("flak-text").textContent = text;
    }
    const w = op.weapons;
    $("rocket-stock").textContent = w.rockets;
    $("rocket-weapon").classList.toggle("empty", w.rockets <= 0);
    $("laser-heat").style.transform = `scaleX(${w.heat.toFixed(3)})`;
    $("laser-weapon").classList.toggle("overheated", w.overheated);
    $("strike-stock").textContent = w.strikes;
    $("strike-action").disabled = w.strikes <= 0 || w.striking;
    $("objective-count").textContent = `${Math.max(0, Math.ceil(op.length - op.distance))}`;
    $("objective-unit").textContent = op.holding ? "CONVOY HOLDING" : "METRES TO GO";
    setHTML(
      $("barge-bars"),
      op.barges
        .map(
          (b, i) =>
            `<div class="bar ${b.alive ? "" : "lost"}"><span>${i ? "RELIEF TWO" : "HARBOR MERCY"}</span><div><i style="transform:scaleX(${(b.hp / b.max).toFixed(3)})"></i></div></div>`,
        )
        .join(""),
    );
    $("boss-bars").hidden = !op.boss || op.boss.phase === "approach";
    if (op.boss)
      setHTML($("boss-bars"), [
        ...op.boss.towers.map((hp, i) => `<div class="bar hostile"><span>GATE TOWER ${i ? "EAST" : "WEST"}</span><div><i style="transform:scaleX(${hp.toFixed(3)})"></i></div></div>`),
        `<div class="bar hostile ${op.boss.shielded ? "shielded" : ""}"><span>GENERATOR${op.boss.shielded ? " / SHIELDED" : ""}</span><div><i style="transform:scaleX(${op.boss.generator.toFixed(3)})"></i></div></div>`,
      ].join(""));
  }

  updateLabels(labels) {
    const layer = $("world-labels");
    const seen = new Set();
    for (const label of labels) {
      seen.add(label.id);
      let el = this.labels.get(label.id);
      if (!el) {
        el = document.createElement("div");
        el.className = "world-label";
        layer.append(el);
        this.labels.set(label.id, el);
      }
      const p = this.view.project(label);
      if (el.textContent !== label.text) el.textContent = label.text;
      el.classList.toggle("hot", Boolean(label.hot));
      if ((el.dataset.kind || "") !== (label.kind || "")) el.dataset.kind = label.kind || "";
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
    }
    for (const [id, el] of this.labels)
      if (!seen.has(id)) {
        el.remove();
        this.labels.delete(id);
      }
  }
}
