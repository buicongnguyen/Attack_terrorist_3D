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
  Waves,
  Ban,
  LogOut,
  createElement,
} from "lucide";
import { CHAPTERS, MISSIONS, missionNumber, chapterSize, saveResult, migrateSave } from "./data.js";
import { BOMBS, BOMB_ORDER, FLIGHT, STRIKE_MISSIONS, armRally, isPattern } from "./strike-data.js";
import { patternDiagram, ROTATION_STEP } from "./harbour-data.js";
import {
  CAST,
  PROLOGUE,
  CHAPTER_STORY,
  MISSION_STORY,
  FINALE,
  INQUIRY_FILES,
  FAILURE_RADIO,
  FAILURE_TEXT,
  failureKey,
  filesRead,
  finaleRecord,
  landfallLabel,
  speaker,
} from "./story.js";
import { RadioDirector, STORY, minimumFor } from "./radio-queue.js";
import { CUES } from "./audio.js";
import { riverCriteria } from "./river-data.js";
import { activeBonuses } from "./pickups.js";
import { DIFFICULTIES, DIFFICULTY, DEFAULT_DIFFICULTY, difficulty, percent } from "./difficulty.js";
import { RescueHUD } from "./rescue-hud.js";
import { isHostileEntity } from "./rescue-data.js";
import { saveGovernor } from "./quality.js";
import { UPGRADES, available, buy, level, nextCost, sanitize, affordable } from "./requisition.js";
import { EdgeMarkers, freeRectOf, outside } from "./edge-markers.js";

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
  Waves,
  Ban,
  LogOut,
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
// World tags carry a glyph by what they mark, not only a colour (5.1 H1): a key target a star, a
// civilian a no-strike sign, a hostile none. Their leading text symbol gives way to the glyph.
const TAG_GLYPH = { key: Star, civilian: Ban };
// Boss and objective tags are never hidden: they are kept inside the free play rect.
const PINNED_TAGS = new Set(["boss", "gates", "station"]);
// City map marks by shape (5.1 H1): key targets a diamond, civilians a hollow ring, hostiles a dot.
const KEY_MARKS = new Set(["key", "officer", "mast"]);
// m:ss for the intel chip and the tide chip.
const clock = (seconds) => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
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
        /^\d+$/.test(key) &&
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
      ending: saved.ending in FINALE.choices ? saved.ending : null,
      upgrades: sanitize(saved.upgrades),
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
  // The canal's one hint (5.1 K1).
  boom: ["Shoot the boom to let the barges through", "Shoot the boom to let the barges through"],
};

// Assigns markup only when it changed, so HUD refreshes don't rebuild identical DOM.
const lastHTML = new WeakMap();
const setHTML = (el, html) => {
  if (lastHTML.get(el) === html) return;
  lastHTML.set(el, html);
  el.innerHTML = html;
};

// The HUD's writes happen 12 times a second: each one only touches the DOM when the value
// changes. A same-value class or hidden write still queues a mutation record, and the shared
// gesture helper re-measures every control on each one.
export function setText(el, value) {
  const text = String(value ?? "");
  if (el.textContent !== text) el.textContent = text;
}
export function setHidden(el, hidden) {
  if (el.hidden !== Boolean(hidden)) el.hidden = Boolean(hidden);
}
export function setClass(el, name, on) {
  if (el.classList.contains(name) !== Boolean(on)) el.classList.toggle(name, Boolean(on));
}

const escape = (text) =>
  String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Blender-rendered chapter medallions (public/ui); a missing file just hides the image.
const EMBLEMS = ["city", "river", "valley"];
// `key` is a chapter number, or "tidelock" for the finale.
const emblemUrl = (key) => `${import.meta.env.BASE_URL}ui/emblem-${EMBLEMS[key] || (key === "tidelock" ? key : "city")}.webp`;
function showEmblem(img, key, onMissing) {
  // Shown at once (a repeated address fires no new load event); a file that fails hides it again.
  img.hidden = false;
  img.onerror = () => {
    img.hidden = true;
    onMissing?.();
  };
  img.src = emblemUrl(key);
}

// The Ashen Front's emblem (5.1): a flame over a broken wall. Original artwork, drawn inline.
const ASHEN_EMBLEM =
  '<svg class="ashen" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c1.7 2.5 4.2 4.2 4.2 7.3a4.2 4.2 0 0 1-8.4 0c0-1.7.8-2.8 1.7-3.8.2 1.5 1 2.3 2 2.5-.5-2.2-.2-4.1.5-6z" fill="currentColor"/><path d="M3 15.5h7.2l1.4-1.6 1.6 1.6H21M3 19h18M7.5 15.5V19M16.5 15.5V19M12 19v3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function portrait(who) {
  const cast = speaker(who);
  return `<span class="portrait ${cast.hostile ? "hostile" : ""}" style="--tone:${cast.color}">${cast.hostile ? ASHEN_EMBLEM : `<span class="initials">${cast.initials}</span>`}</span>`;
}

function lineMarkup(line) {
  const cast = speaker(line.who);
  const tag = cast.hostile ? '<em class="intercept-tag">INTERCEPT</em>' : "";
  return `${portrait(line.who)}<div><b>${escape(cast.name)}</b><small>${escape(cast.role)}</small>${tag}<p>${escape(line.text)}</p></div>`;
}

// The callout lanes (5.1 H1): the banner lane across the middle (multi-kills, checkpoints, later
// medals), the toast lane under the top bar and the hint lane above the controls. One message
// per lane: a new one replaces the last and resets the lane's classes. The same toast within 3 s
// merges into one with a count ('GLANCING HIT x3'). Timers run on game time, so a pause holds
// every message.
const MERGE_WINDOW = 3;
export class Callouts {
  constructor(game) {
    this.game = game;
    this.toastLane = { el: $("toast"), text: "", count: 0, at: -Infinity, until: -Infinity };
    this.bannerLane = { el: $("combo"), until: -Infinity };
    this.hintLane = { el: $("coach"), text: "", go: false };
  }

  toast(text, hold = 2.1) {
    const lane = this.toastLane,
      now = this.game.time;
    if (text === lane.text && now - lane.at < MERGE_WINDOW) lane.count++;
    else {
      lane.text = text;
      lane.count = 1;
    }
    lane.at = now;
    lane.until = now + hold;
    lane.el.textContent = lane.count > 1 ? `${text} x${lane.count}` : text;
    lane.el.className = "visible";
  }

  banner(main, sub, kind, hold) {
    const lane = this.bannerLane;
    $("combo-count").textContent = main;
    $("combo-bonus").textContent = sub;
    // Restart the entrance animation for every message.
    lane.el.className = "";
    void lane.el.offsetWidth;
    lane.el.className = `visible ${kind}`;
    lane.until = this.game.time + hold;
  }

  // The hint lane holds a coach line while it applies: no timer.
  hint(text, go = false) {
    const lane = this.hintLane;
    if (text === lane.text && go === lane.go) return;
    lane.text = text;
    lane.go = go;
    lane.el.textContent = text;
    lane.el.hidden = !text;
    lane.el.className = go ? "go" : "";
  }

  update() {
    const now = this.game.time;
    if (now > this.toastLane.until) setClass(this.toastLane.el, "visible", false);
    if (now > this.bannerLane.until) setClass(this.bannerLane.el, "visible", false);
  }

  clear() {
    Object.assign(this.toastLane, { text: "", count: 0, at: -Infinity, until: -Infinity });
    this.bannerLane.until = -Infinity;
    if (this.toastLane.el.className) this.toastLane.el.className = "";
    if (this.bannerLane.el.className) this.bannerLane.el.className = "";
    this.hint("");
  }
}

// Score pops (5.1 J1): 16 spans made once in #pops (inside #world-labels), each one text node
// rewritten in place, so the layer never gains or loses a child. A pop rises 28 px over 0.9 s by
// transform alone, re-projected every frame; a new one takes the oldest span.
export const POPS = { count: 16, life: 900, rise: 28 };
export class Pops {
  constructor(layer, view) {
    this.view = view;
    this.point = { x: 0, y: 0, visible: false };
    this.made = 0;
    this.slots = Array.from({ length: POPS.count }, () => {
      const el = document.createElement("span");
      el.append(document.createTextNode(""));
      el.style.visibility = "hidden";
      layer.append(el);
      return { el, x: 0, y: 0, z: 0, born: -Infinity, live: false, shown: false, tone: "" };
    });
  }

  add(x, y, z, text, tone, now = performance.now()) {
    let slot = this.slots[0];
    for (const other of this.slots) if (other.born < slot.born) slot = other;
    Object.assign(slot, { x, y, z, born: now, live: true });
    slot.el.firstChild.nodeValue = text;
    if (tone !== slot.tone) slot.el.className = slot.tone = tone;
    // The newest pop carries the highest number (tests read the last ones by it).
    slot.el.dataset.order = String(++this.made);
  }

  // `still`: reduced motion, the pops stay where they appear.
  update(now, still) {
    const rise = still ? 0 : POPS.rise;
    for (const slot of this.slots) {
      if (!slot.live) continue;
      const u = (now - slot.born) / POPS.life,
        p = u < 1 && this.view.projectInto(this.point, slot);
      const shown = Boolean(p?.visible);
      if (shown !== slot.shown) {
        slot.shown = shown;
        slot.el.style.visibility = shown ? "" : "hidden";
      }
      if (u >= 1) slot.live = false;
      if (!shown) continue;
      slot.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y - rise * u)}px)`;
      slot.el.style.opacity = u < 0.6 ? "1" : ((1 - u) / 0.4).toFixed(2);
    }
  }

  clear() {
    for (const slot of this.slots) {
      slot.live = false;
      slot.born = -Infinity;
      if (slot.shown) slot.el.style.visibility = "hidden";
      slot.shown = false;
    }
  }
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
    this.padResets = [];
    this.lastHUD = -1;
    this.labels = new Map();
    this.seenLabels = new Set();
    this.lastLabels = [];
    this.screenPoint = { x: 0, y: 0, visible: false };
    this.callouts = new Callouts(game);
    this.edge = new EdgeMarkers($("edge-markers"));
    this.pops = new Pops($("pops"), view);
    // The hurt edge (5.1 J1): when its direction was set, and whether SHIELDS LOW was said.
    this.hurtAt = 0;
    this.warnedLow = false;
    this.audioAt = 0;
    // The viewport minus the HUD panels (5.1 H1), recomputed when the layout changes.
    this.hudRects = [];
    this.freeRect = null;
    // Phone layouts collapse the city map and the intel strip to buttons (5.1 H1).
    this.phoneLayout = matchMedia("(max-width: 700px), (orientation: landscape) and (max-height: 520px)");
    // The radio director (5.1): 3 lines at once on wider screens, a one-line ticker on phones.
    this.director = new RadioDirector(this.phoneLayout.matches ? 1 : 3);
    this.radioVersion = -1;
    this.radioEls = new Map();
    this.phoneLayout.addEventListener("change", () => {
      this.director.setSlots(this.phoneLayout.matches ? 1 : 3);
      this.openTicker(false);
    });
    // Losses per mission in this session: two in a row offer Easy (5.1).
    this.failures = new Map();
    this.debriefTimers = [];
    this.pointsGained = 0;
    this.dialog = $("menu-dialog");
    this.brief = $("brief-dialog");
    this.game.difficulty = save.difficulty || DEFAULT_DIFFICULTY;
    this.game.upgrades = save.upgrades || {};
    this.buildDifficulty();
    this.game.reducedMotion = save.reducedMotion || matchMedia("(prefers-reduced-motion: reduce)").matches;
    $("reduced-motion").checked = this.game.reducedMotion;
    document.documentElement.dataset.reducedMotion = String(this.game.reducedMotion);
    $("audio-enabled").checked = !save.muted;
    this.updateSound();
    this.bind();
    if (this.qa && this.params.get("listen") === "1") this.buildListen();
    this.updatePointsDot();
    this.bindStick("move-stick", false);
    this.bindStick("fire-stick", true);
    this.rescueHUD = new RescueHUD(game);
    // Touch layout follows the primary pointer, then whichever input was used last: a touchscreen
    // laptop keeps keyboard hints until it is touched, and a tablet shows its sticks on first touch.
    const coarse = matchMedia("(pointer: coarse)");
    this.finePointer = matchMedia("(any-pointer: fine)");
    this.setTouch(coarse.matches || (navigator.maxTouchPoints > 0 && !this.finePointer.matches));
    coarse.addEventListener("change", () => this.setTouch(coarse.matches));
    // Fingers still on the screen: a mouse nudged meanwhile must not switch layouts (the switch
    // clears input and would drop a held stick).
    this.touches = new Set();
    window.addEventListener(
      "pointerdown",
      (e) => {
        if (e.pointerType !== "touch") return;
        this.touches.add(e.pointerId);
        this.setTouch(true);
      },
      true,
    );
    const lift = (e) => this.touches.delete(e.pointerId);
    window.addEventListener("pointerup", lift, true);
    window.addEventListener("pointercancel", lift, true);
    window.addEventListener("blur", () => this.touches.clear());
window.addEventListener('pagehide', () => this.touches.clear());
window.addEventListener('mobile-game-interruption', () => this.touches.clear());
    window.addEventListener(
      "pointermove",
      (e) => e.pointerType === "mouse" && this.finePointer.matches && (e.movementX || e.movementY) && !this.touches.size && this.setTouch(false),
      true,
    );
    // A resize (phone toolbars, rotation) releases held keys, which would otherwise stick.
    window.addEventListener("resize", () => this.keys.clear());
    refreshIcons();
    this.badgeOverlays = [
      ...document.querySelectorAll(
        ".topbar, #boss-slot, .mission-hud, #comms, #shield-hud, #powerup, .joystick, .weapon-bar, #rescue-hud, #rescue-actions, #flight-panel, #ladder, #convoy-hud, #intel, #intel-next, #map-toggle, #radar",
      ),
    ];
    this.overlayObserver = new ResizeObserver(() => this.updateBadgeBounds());
    this.badgeOverlays.forEach((node) => this.overlayObserver.observe(node));
    window.addEventListener("resize", () => this.updateBadgeBounds());
  }

  // The graphics picker shows the setting, and in Auto the level this device runs at.
  updateGraphics() {
    const governor = this.view.governor,
      select = $("graphics-quality");
    if (!governor || !select) return;
    select.value = governor.setting;
    select.options[0].textContent = governor.setting === "auto" ? `Auto (${governor.profile.label})` : "Auto";
  }

  setTouch(on) {
    const value = String(Boolean(on));
    if (document.documentElement.dataset.touch === value) return;
    document.documentElement.dataset.touch = value;
    this.touch = Boolean(on);
    this.clearInput();
    this.ladderKey = null;
    if (this.brief?.open) $("brief-controls").innerHTML = this.controlHints(this.game.chapter);
    if (this.badgeOverlays) requestAnimationFrame(() => this.updateBadgeBounds());
  }

  updateBadgeBounds() {
    const rects = this.badgeOverlays.map((node) => node.getBoundingClientRect());
    this.view.badgeKeepouts = this.hudRects = rects.filter((rect) => rect.width > 0 && rect.height > 0);
    // The free play rect: world tags are kept out of the panels and edge markers ride its border.
    this.freeRect = freeRectOf(this.hudRects, innerWidth, innerHeight, this.freeRect || undefined);
    // Floating strike callouts (coach, flak) sit just above the flight panel or the stick.
    const style = document.documentElement.style;
    const clear = (id) => {
      const r = $(id).getBoundingClientRect();
      return r.height > 0 ? `${Math.round(innerHeight - r.top)}px` : "0px";
    };
    style.setProperty("--panel-clear", clear("flight-panel"));
    style.setProperty("--stick-clear", clear("move-stick"));
    style.setProperty("--weapon-clear", clear("weapon-bar"));
    // The canal's coach hint keeps clear of the radio ticker (5.1 K1): above it on portrait phones,
    // beside it on landscape phones.
    style.setProperty("--comms-clear", clear("comms"));
    const comms = $("comms").getBoundingClientRect();
    style.setProperty("--comms-left", comms.width > 0 ? `${Math.round(comms.left)}px` : "50vw");
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
    // The result's other ways out (5.1): Mission control, Requisition (both come back to the
    // result), and Easy after two losses.
    $("result-menu").onclick = () => this.menuFromResult();
    $("result-req").onclick = () => this.menuFromResult(true);
    $("result-easy").onclick = () => {
      this.setDifficulty("easy");
      this.start(this.game.index);
    };
    // A tap or click on the result during its hold shows the actions at once.
    $("result-dialog").addEventListener("pointerdown", () => this.revealResult());
    // Phones: a tap on the radio ticker lists the last three lines.
    $("comms").addEventListener("click", () => this.phoneLayout.matches && this.openTicker(!this.tickerOpen));
    $("skip").onclick = () => this.start((this.game.index + 1) % MISSIONS.length);
    $("story").onclick = () => {
      this.dialog.close();
      this.prologue(true);
    };
    $("result-next").onclick = () =>
      this.start(this.game.status === "success" ? (this.game.index + 1) % MISSIONS.length : this.game.index);
    $("result-dialog").addEventListener("cancel", (e) => e.preventDefault());
    for (const button of [$("finale-broadcast"), $("finale-seal")]) {
      button.querySelector("span").textContent = FINALE.choices[button.dataset.ending].label;
      button.onclick = () => this.chooseEnding(button.dataset.ending);
    }
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
    // A chapter tab clicked mid-mission asks first (5.1 H1).
    document.querySelectorAll("[data-chapter]").forEach((button) => {
      button.onclick = () => this.askChapter(+button.dataset.chapter);
    });
    const leave = $("leave-dialog");
    $("leave-stay").onclick = () => this.stay();
    $("leave-go").onclick = () => this.start(this.leaveTo);
    leave.addEventListener("cancel", (e) => {
      e.preventDefault();
      this.stay();
    });
    // Phone layouts: the objective line opens the mission card, the map button the city map, the
    // intel chip the whole timeline.
    $("objective-line").onclick = () => this.toggle("brief-open", $("objective-line"));
    $("map-toggle").onclick = () => {
      this.toggle("map-open", $("map-toggle"));
      this.pinged = false;
      setHidden($("map-ping"), true);
    };
    $("intel-next").onclick = () => this.toggle("intel-open", $("intel-next"));
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
    // 2.9: the graphics level (resolution, shadows, how much wildlife). Auto adapts by itself.
    const graphics = $("graphics-quality");
    graphics.onchange = () => {
      const governor = this.view.governor;
      if (!governor) return;
      governor.choose(graphics.value);
      this.view.applyQuality(governor);
      this.game.ambientBudget = governor.profile.life;
      this.game.restock();
      saveGovernor(governor);
      this.updateGraphics();
    };
    this.updateGraphics();
    $("reduced-motion").onchange = () => {
      this.game.reducedMotion = $("reduced-motion").checked;
      this.save.reducedMotion = this.game.reducedMotion;
      document.documentElement.dataset.reducedMotion = String(this.game.reducedMotion);
      this.game.restock();
      this.persist();
    };
    $("gun-weapon").onclick = () => this.weapon("gun");
    $("rocket-weapon").onclick = () => this.weapon("rocket");
    $("guided-weapon").onclick = () => this.weapon("guided");
    $("laser-weapon").onclick = () => this.weapon("laser");
    $("strike-action").onclick = () => this.game.op?.callAirStrike?.();
    $("flare-action").onclick = () => this.game.chapter === 2 && this.game.op.flare();
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
      this.firePointer = e.pointerId;
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
      e.preventDefault();
      this.strike?.clearAim();
    });
    // The minimap: tap or click anywhere on it to mark a drop point there.
    $("radar-map").addEventListener("pointerdown", (e) => {
      if (!this.strike || this.game.paused || this.game.status !== "playing") return;
      e.preventDefault();
      this.game.audio.unlock();
      const point = this.radarToWorld(e.offsetX, e.offsetY);
      if (point) this.strike.markAt(point);
    });
    // A second finger lifting must not stop the first one's fire.
    const release = (e) => {
      if (e.pointerId === undefined || this.firePointer === undefined || e.pointerId === this.firePointer) this.pointerFire = false;
    };
    this.view.canvas.addEventListener("pointerup", release);
    this.view.canvas.addEventListener("pointercancel", release);
    this.view.canvas.addEventListener("lostpointercapture", release);
    window.addEventListener("blur", () => {
      this.clearInput();
      if (this.game.status === "playing" && !this.anyDialog()) this.menu();
    });
window.addEventListener('pagehide', () => {
      this.clearInput();
      if (this.game.status === "playing" && !this.anyDialog()) this.menu();
    });
window.addEventListener('mobile-game-interruption', () => {
      this.clearInput();
      if (this.game.status === "playing" && !this.anyDialog()) this.menu();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.game.status === "playing" && !this.anyDialog()) this.menu();
      // A hidden tab rests the sound at once (5.1 J1).
      this.game.audio.idle(0, document.hidden, this.game.paused, this.anyDialog());
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

  // A click marks the first thing along the line of sight. A gathering's ring is drawn on its own
  // floor, inside its building (5.1 C1): a click on the ring is taken at that floor's height, so it
  // arms the drop on the gathering rather than marking the roof or the facade in front of it.
  markDrop(clientX, clientY) {
    const strike = this.strike;
    if (!strike) return;
    for (const e of strike.events) {
      const at = this.view.pickPlane(clientX, clientY, e.centre.y);
      if (at && armRally([e], at, this.game.time)) return strike.markAt(at);
    }
    const point = this.view.pickStrike(clientX, clientY, strike.buildings, strike.land ? 0.05 : 1);
    if (point) strike.markAt(point);
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
    const colors = { enemy: "#ff4b2b", officer: "#ffc62b", flak: "#ff3b3b", mast: "#ff8a2b", truck: "#ff4b2b", ship: "#ff4b2b", key: "#ff4b2b", civilian: "#7fd8ff", down: "#8a96a8" };
    for (const t of op.radar.targets) {
      const [x, y] = at(t.x, t.z);
      const color = colors[t.kind] || "#ff4b2b";
      c.beginPath();
      if (t.kind === "civilian") {
        // Civilians: a hollow ring.
        c.strokeStyle = color;
        c.lineWidth = 1.5;
        c.arc(x, y, 3.2, 0, Math.PI * 2);
        c.stroke();
        continue;
      }
      c.fillStyle = color;
      if (KEY_MARKS.has(t.kind)) {
        // Key targets: a diamond.
        c.moveTo(x, y - 4.5);
        c.lineTo(x + 4.5, y);
        c.lineTo(x, y + 4.5);
        c.lineTo(x - 4.5, y);
        c.closePath();
      } else c.arc(x, y, t.kind === "enemy" ? 2.2 : 3, 0, Math.PI * 2);
      c.fill();
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
    return [this.dialog, this.brief, $("result-dialog"), $("prologue-dialog"), $("leave-dialog")].some((d) => d.open);
  }

  // Opens or closes one of the phone HUD's collapsed panels (a class on #app) from its button.
  toggle(name, button, on = !$("app").classList.contains(name)) {
    setClass($("app"), name, on);
    button.setAttribute("aria-expanded", String(on));
    if (name === "map-open" && on && this.game.chapter === 0) this.drawRadar(this.game.op.snapshot());
  }

  askChapter(chapter) {
    const index = MISSIONS.findIndex((m) => m.chapter === chapter);
    if (this.game.status !== "playing" || this.anyDialog()) return this.start(index);
    this.leaveTo = index;
    this.game.paused = true;
    this.clearInput();
    // The dialog hands focus back to what had it on close: never the tab (Enter would ask again).
    document.activeElement?.blur();
    $("leave-text").textContent = `${this.game.mission.name} is still under way. Chapter 0${chapter + 1}, ${CHAPTERS[chapter].name}, starts from its first mission.`;
    $("leave-dialog").showModal();
    $("leave-stay").focus();
  }

  stay() {
    $("leave-dialog").close();
    this.clearInput();
    this.game.paused = false;
  }

  keydown(e) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    const code = keyCode(e),
      confirm = e.key === "Enter" || e.key === " ";
    if (this.anyDialog()) {
      // A Space or Enter still held from the last release must not click through the next dialog.
      if (confirm && e.repeat) e.preventDefault();
      if (this.holding && e.key === "Enter") {
        e.preventDefault();
        if (!e.repeat) this.revealResult();
        return;
      }
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
    // R restarts, but only when pressed twice: it sits beside the flight keys.
    if (code === "KeyR") {
      const now = performance.now();
      if (now - (this.restartAsked ?? -Infinity) < 1500 || this.game.status !== "playing") {
        this.restartAsked = -Infinity;
        return this.start(this.game.index);
      }
      this.restartAsked = now;
      return this.game.notify("toast", "PRESS R AGAIN TO RESTART");
    }
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
    if (code === "KeyF" && this.game.chapter === 2) this.game.op.flare();
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
    this.moveStick = { x: 0, z: 0 };
    Object.assign(this.game.input, { fire: false, stickAim: null, pointerAim: false, x: 0, z: 0 });
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
    // Lantern (2.7): holding the mouse button fires towards the pointer; Space fires the way she flies.
    input.pointerAim = this.pointerFire && !this.fireStick;
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
    if (this.save.muted) this.game.audio.hum(false);
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
    if (this.backToResult) this.resume();
    else if (this.pendingBrief && this.game.status === "playing") this.showBrief();
    else if (!this.anyDialog()) this.game.paused = false;
  }

  showBrief() {
    this.pendingBrief = false;
    const g = this.game,
      story = MISSION_STORY[g.index],
      chapter = CHAPTER_STORY[g.chapter];
    const first = MISSIONS.findIndex((m) => m.chapter === g.chapter) === g.index;
    showEmblem($("brief-emblem"), g.chapter);
    $("brief-eyebrow").textContent = `CHAPTER 0${g.chapter + 1} / ${chapter.title.toUpperCase()} / ${first ? landfallLabel(story.clock) : `MISSION ${missionNumber(g.index)}`}`;
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
        ["WASD", "Fly Lantern: fly over people and crates to pick them up"],
        ["HOLD CLICK", "Fire towards the pointer"],
        ["SPACE", "Fire the way you fly"],
        ["1 / 2 / 3", "Gun / rockets / guided"],
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
        drill && ["ARROWS", "Raise or lower the Drill floor"],
        pattern && ["ARROWS", "Turn the pattern"],
      ],
      [
        ["LEFT STICK", "Steer Marlin"],
        ["RIGHT STICK", "Aim and fire"],
        ["ICONS", "Gun, rockets, laser; orange for the air strike"],
        ["BLOCK", "Sit between guns and barges"],
      ],
      [
        ["LEFT STICK", "Fly Lantern: fly over people and crates"],
        ["RIGHT STICK", "Fire in that direction"],
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
    this.game.audio.play("missionStart");
    this.game.paused = false;
  }

  menu() {
    if (this.anyDialog() || !this.game.mission) return;
    this.game.paused = true;
    this.clearInput();
    this.fillMissions();
    const story = MISSION_STORY[this.game.index];
    $("mission-briefing").textContent = `${this.game.mission.name}: ${story.goals.join(". ")}.`;
    this.fillFiles();
    this.fillRequisition();
    this.dialog.showModal();
  }

  // The Sound test (?qa&listen=1, 5.1 J1): a row and a Play button for every cue of the CUES table,
  // the new ones first, and Play all. The owner's listen gate for the cue set.
  buildListen() {
    const kinds = Object.keys(CUES);
    $("listen-details").hidden = false;
    $("listen-details").open = true;
    $("listen-count").textContent = `${kinds.length} cues`;
    $("listen-list").innerHTML = kinds
      .map((kind) => {
        const cue = CUES[kind];
        return `<div class="req-row listen-row"><div><strong>${escape(cue.label)}${cue.fresh ? " <em>NEW</em>" : ""}</strong><small>${cue.note ? `${escape(cue.note)} · ` : ""}${kind}</small></div><button data-cue="${kind}" class="secondary-button">Play</button></div>`;
      })
      .join("");
    for (const button of $("listen-list").querySelectorAll("[data-cue]")) button.onclick = () => this.listen([button.dataset.cue]);
    $("listen-all").onclick = () => this.listen(kinds);
  }

  // Plays cues one after another, half a second apart; a new request ends the last queue.
  listen(kinds, i = 0) {
    clearTimeout(this.listenTimer);
    if (i >= kinds.length) return;
    const seconds = this.game.audio.preview(kinds[i]);
    this.listenTimer = setTimeout(() => this.listen(kinds, i + 1), (seconds + 0.5) * 1000);
  }

  // The inquiry files recovered so far (a file comes with its mission's first win).
  fillFiles() {
    const found = INQUIRY_FILES.filter((file) => this.save.records[file.index]);
    $("files-count").textContent = `${found.length} / ${INQUIRY_FILES.length}`;
    const ending = FINALE.choices[this.save.ending];
    $("files-list").innerHTML =
      (found.length
        ? found.map((file) => `<article><strong>${escape(file.title)}</strong><p>${escape(file.text)}</p></article>`).join("")
        : "<p>No files yet. Echo team is still inside the Glass District.</p>") +
      (ending ? `<p class="files-ending">Your ending: ${escape(ending.title)}.</p>` : "");
  }

  // Requisition (5.0): the points the stars bought, and what they can buy. A purchase applies from
  // the next mission start, like a change of difficulty.
  fillRequisition() {
    const points = available(this.save.records, this.save.upgrades);
    $("req-points").textContent = `${points} point${points === 1 ? "" : "s"}`;
    const rows = UPGRADES.map((u) => {
      const have = level(this.save.upgrades, u.id),
        cost = nextCost(u.id, this.save.upgrades),
        full = cost === null;
      const pips = u.costs.map((_, i) => `<i class="${i < have ? "on" : ""}"></i>`).join("");
      return `<div class="req-row"><div><strong>${escape(u.name)}</strong><small>${["Kestrel", "Marlin", "Lantern"][u.chapter]}: ${escape(u.blurb)}</small><span class="req-pips">${pips}</span></div><button data-upgrade="${u.id}" class="secondary-button" ${full || cost > points ? "disabled" : ""}>${full ? "Maxed" : `Buy ${cost}`}</button></div>`;
    });
    $("req-list").innerHTML = rows.join("");
    for (const button of $("req-list").querySelectorAll("[data-upgrade]"))
      button.onclick = () => {
        const next = buy(button.dataset.upgrade, this.save.records, this.save.upgrades);
        if (!next) return;
        this.save.upgrades = next;
        this.game.upgrades = next;
        this.persist();
        this.fillRequisition();
        this.updatePointsDot();
      };
  }

  // The finale's choice: what happens to the files. The epilogue follows, with the campaign's record.
  chooseEnding(key) {
    const ending = FINALE.choices[key];
    if (!ending) return;
    this.save.ending = key;
    this.persist();
    const stars = MISSIONS.reduce((sum, _, i) => sum + (this.save.records[i]?.stars || 0), 0);
    $("result-title").textContent = ending.title;
    $("result-story").textContent = `${ending.text} ${finaleRecord(stars, MISSIONS.length * 3)}`;
    $("finale-choice").hidden = true;
    $("result-file").hidden = true;
    document.querySelector("#result-dialog .result-actions").hidden = false;
    $("result-next").focus();
  }

  resume() {
    this.dialog.close();
    this.clearInput();
    if (this.backToResult) {
      this.backToResult = false;
      this.updatePointsDot();
      this.fillPoints();
      $("result-dialog").showModal();
      $("result-next").focus();
      return;
    }
    this.game.paused = false;
  }

  // Mission control over a finished mission: closing it comes back to the result.
  menuFromResult(requisition = false) {
    $("result-dialog").close();
    this.backToResult = true;
    this.menu();
    if (!requisition) return;
    $("req-details").open = true;
    $("req-details").scrollIntoView({ block: "nearest" });
    $("req-list").querySelector("button:not([disabled])")?.focus();
  }

  // The pause button carries a dot while the points buy an upgrade.
  updatePointsDot() {
    setClass($("pause"), "points", affordable(this.save.records, this.save.upgrades));
  }

  start(index) {
    this.backToResult = false;
    this.endDebrief();
    this.dialog.close();
    $("leave-dialog").close();
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
      group.innerHTML = `<span class="group-title" style="--tone:${chapter.color}"><img class="emblem" alt="" width="34" height="34" src="${emblemUrl(c)}" />0${c + 1} ${chapter.name}</span>`;
      group.querySelector("img").addEventListener("error", (e) => e.target.remove());
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
    else if (type === "toast") this.callouts.toast(data);
    else if (type === "radio") this.director.say(data.line, data.key);
    // A combo that broke a gathering closes with its own banner (5.1 C1).
    else if (type === "combo" && data.title) this.callouts.banner(data.title, data.bonus ? `x${data.count} +${data.bonus}` : "", "checkpoint", 2.6);
    else if (type === "combo") this.callouts.banner(`MULTI-KILL x${data.count}`, `+${data.bonus}`, "combo", 1.6);
    else if (type === "checkpoint" || type === "banner") this.callouts.banner(data, "", "checkpoint", 2.6);
    else if (type === "pop") this.pops.add(data.x, data.y, data.z, data.text, data.tone);
    else if (type === "hurt") {
      // Every hit flashes again: the attribute comes off and a reflow restarts the fade.
      const edge = $("hurt-edge");
      delete edge.dataset.dir;
      void edge.offsetWidth;
      edge.dataset.dir = data;
      this.hurtAt = performance.now();
    }
    else if (type === "record") this.record(data);
    else if (type === "result") this.showResult(data);
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
    $("flight-panel").hidden = $("ladder").hidden = $("intel").hidden = $("radar").hidden = $("map-toggle").hidden = c !== 0;
    // Collapsed phone panels start closed; the boss slot waits for a boss.
    for (const [name, button] of [
      ["brief-open", "objective-line"],
      ["map-open", "map-toggle"],
      ["intel-open", "intel-next"],
    ])
      this.toggle(name, $(button), false);
    this.pinged = false;
    this.pings = 0;
    setHidden($("map-ping"), true);
    setHidden($("intel-next"), true);
    setHidden($("boss-slot"), true);
    setClass($("app"), "boss-on", false);
    this.tideElapsed = -1;
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
    // The shield panel names the chance that enemy fire reaching you does harm.
    const chance = this.game.hitChance > 0 ? `${percent(this.game.hitChance)} HIT` : "SAFE";
    $("shield-title").textContent = `${c === 1 ? "MARLIN" : "LANTERN"} SHIELDS / ${chance}`;
    this.director.clear();
    this.openTicker(false);
    this.pointsGained = 0;
    for (const tag of this.labels.values()) tag.el.remove();
    this.labels.clear();
    this.lastLabels = [];
    this.edge.clear();
    this.pops.clear();
    this.hurtAt = 0;
    delete $("hurt-edge").dataset.dir;
    setClass($("hurt-edge"), "low-shield", false);
    this.warnedLow = false;
    if (c === 0) this.buildFlightCards();
    this.weapon("gun");
    // Every callout lane starts empty, the multi-kill banner included.
    this.callouts.clear();
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

  // The radio feed (5.1): the director's lines on screen, newest first, one element per line
  // kept while it shows. Rebuilt only when the director changes (called before the HUD lays out
  // its world tags). An opened phone ticker also lists the last three lines said.
  renderRadio() {
    const d = this.director,
      feed = $("comms");
    this.radioVersion = d.version;
    const lines = [...d.shown].sort((a, b) => b.shownAt - a.shownAt);
    if (this.tickerOpen) for (const entry of d.recent(3)) if (!lines.includes(entry)) lines.push(entry);
    for (const [entry, el] of this.radioEls)
      if (!lines.includes(entry)) {
        el.remove();
        this.radioEls.delete(entry);
      }
    lines.forEach((entry, i) => {
      let el = this.radioEls.get(entry);
      if (!el) {
        el = document.createElement("div");
        el.className = `radio-line live ${speaker(entry.line.who).hostile ? "intercept" : ""} ${entry.priority === STORY ? "story" : ""}`;
        el.innerHTML = lineMarkup(entry.line);
        this.radioEls.set(entry, el);
      }
      setClass(el, "past", !d.shown.includes(entry));
      if (feed.children[i] !== el) feed.insertBefore(el, feed.children[i] || null);
    });
    // The feed changed size: world tags must keep clear of it from this frame on, not only once
    // the resize observer reports.
    this.updateBadgeBounds();
  }

  openTicker(on) {
    this.tickerOpen = on;
    setClass($("comms"), "open", on);
    $("comms").setAttribute("aria-expanded", String(on));
    this.radioVersion = -1;
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
    // One payload kind across the flight: each card folds into one row (5.1 H1).
    setClass($("flight-cards"), "one-kind", keys.length === 1);
    refreshIcons();
  }

  // Save a win (the best score and stars per mission are kept).
  record(result) {
    if (!result.success) return;
    const before = available(this.save.records, this.save.upgrades);
    this.save.records = saveResult(this.save.records, result.index, result.score, result.stars);
    this.pointsGained += available(this.save.records, this.save.upgrades) - before;
    this.persist();
    this.updatePointsDot();
  }

  showResult(result) {
    this.clearInput();
    this.game.paused = true;
    // Lane timers run on game time, which the result holds: nothing may linger under the dialog.
    this.callouts.clear();
    this.record(result);
    const story = MISSION_STORY[result.index];
    const finale = result.success && result.index === MISSIONS.length - 1;
    // A win shows its chapter's medallion; a failure keeps the plain icon.
    const emblem = $("result-emblem-img");
    // A loss shows a warning, never the win's badge.
    const icon = document.createElement("i");
    icon.id = "result-icon";
    icon.dataset.lucide = result.success ? "badge-check" : "triangle-alert";
    $("result-icon").replaceWith(icon);
    $("result-icon").style.display = result.success ? "none" : "";
    if (result.success) showEmblem(emblem, finale ? "tidelock" : this.game.chapter, () => ($("result-icon").style.display = ""));
    else emblem.hidden = true;
    const chapterEnd = result.success && MISSIONS[result.index + 1]?.chapter !== MISSIONS[result.index].chapter;
    $("result-eyebrow").textContent = finale
      ? FINALE.eyebrow
      : result.success
        ? chapterEnd
          ? `CHAPTER 0${this.game.chapter + 1} COMPLETE`
          : "MISSION COMPLETE"
        : "MISSION FAILED";
    $("result-title").textContent = finale ? FINALE.title : result.success ? this.game.mission.name : `Regroup, ${["Kestrel", "Marlin", "Lantern"][this.game.chapter]}.`;
    $("result-story").textContent = finale ? `${story.success} ${FINALE.text}` : result.success ? story.success : this.failureText(result, story);
    // 5.1: the closing line, kept on the card (the radio feed hides while the result is open).
    const quote = result.success ? story.radio.success : FAILURE_RADIO[failureKey(result.reason, this.game.chapter, this.harbour())] || story.radio.start;
    $("result-quote").innerHTML = lineMarkup(quote);
    $("result-stars").innerHTML = Array.from({ length: 3 }, () => '<i data-lucide="star"></i>').join("");
    $("result-stars").setAttribute("aria-label", `${result.stars} of 3 stars`);
    $("result-criteria").innerHTML = this.criteria(result)
      .map(([ok, text], i) => `<li class="${ok ? "met" : ""}" style="--i:${i}"><i data-lucide="${ok ? "check" : "circle"}"></i>${escape(text)}</li>`)
      .join("");
    $("result-score").textContent = result.score.toLocaleString();
    this.resultWon = result.success;
    this.fillPoints();
    // A loss: Mission control instead of a second Retry, and Easy after two in a row.
    const losses = result.success ? 0 : (this.failures.get(result.index) || 0) + 1;
    this.failures.set(result.index, losses);
    setHidden($("result-retry"), !result.success);
    setHidden($("result-menu"), result.success);
    setHidden($("result-easy"), losses < 2 || this.game.difficulty === "easy");
    // The finale's file panel.
    const files = filesRead(this.save.records);
    $("finale-files-list").innerHTML = files.rows
      .map((row) => `<li class="${row.found ? "found" : ""}">${escape(row.found ? row.title : "Not recovered")}</li>`)
      .join("");
    $("finale-files-count").textContent = files.text;
    $("result-targets").textContent = result.kills;
    $("result-best").textContent = (this.save.records[result.index]?.score || 0).toLocaleString();
    $("result-next").innerHTML = `${finale ? "Play again" : result.success ? "Next mission" : "Try again"}<i data-lucide="arrow-right"></i>`;
    const file = result.success ? story.file : null;
    $("result-file").hidden = !file;
    if (file) {
      $("result-file-title").textContent = `RECOVERED / ${file.title}`;
      $("result-file-text").textContent = file.text;
    }
    // The finale asks its question first; the usual buttons come back with the epilogue.
    $("finale-choice").hidden = !finale;
    $("finale-question").textContent = FINALE.question;
    document.querySelector("#result-dialog .result-actions").hidden = finale;
    refreshIcons();
    $("result-dialog").showModal();
    // The hold: the actions wait until the closing line has been read, counted from when it was
    // said on the radio (the dialog opens 1.4 s later); a failure line never said counts from now.
    // ?qa skips it unless &hold=1.
    const said = this.director.log.some((entry) => entry.line === quote);
    const hold = Math.min(6, minimumFor(quote.text)) - (said ? 1.4 : 0);
    this.holdFor = this.qa && !this.params.has("hold") ? 0 : Math.max(0, hold);
    this.holding = this.holdFor > 0;
    setClass($("result-dialog"), "holding", this.holding);
    if (this.holding) {
      $("result-quote").focus();
      this.later(() => this.revealResult(), this.holdFor * 1000);
    } else (finale ? $("finale-broadcast") : $("result-next")).focus();
    this.debrief(result);
  }

  // Stars one at a time, 300 ms apart with a punch and a rising note; the score counts up over
  // 0.6 s; the criteria tick in turn (CSS). All at once under reduced motion.
  debrief(result) {
    const stars = [...$("result-stars").children],
      score = $("result-score");
    const earn = (i) => {
      stars[i].classList.add("earned");
      this.game.audio.play("star", i);
    };
    if (this.game.reducedMotion) {
      for (let i = 0; i < result.stars; i++) stars[i].classList.add("earned");
      return;
    }
    // Each star schedules the next, so they are never closer than 300 ms.
    const reveal = (i) => i < result.stars && this.later(() => (earn(i), reveal(i + 1)), 300);
    reveal(0);
    const begin = performance.now();
    const count = (now) => {
      const u = Math.min(1, (now - begin) / 600);
      score.textContent = Math.round(result.score * u).toLocaleString();
      if (u < 1 && $("result-dialog").open) this.countFrame = requestAnimationFrame(count);
    };
    score.textContent = "0";
    this.countFrame = requestAnimationFrame(count);
  }

  later(work, ms) {
    this.debriefTimers.push(setTimeout(work, ms));
  }

  endDebrief() {
    for (const timer of this.debriefTimers) clearTimeout(timer);
    this.debriefTimers.length = 0;
    cancelAnimationFrame(this.countFrame);
    this.holding = false;
    setClass($("result-dialog"), "holding", false);
  }

  // The result's actions appear: at the end of the hold, or at once on a tap, click or Enter.
  revealResult() {
    if (!this.holding) return;
    this.holding = false;
    setClass($("result-dialog"), "holding", false);
    const finale = !$("finale-choice").hidden;
    (finale ? $("finale-broadcast") : $("result-next")).focus();
  }

  // Requisition on the result: the points a win brought (none, no line), and a way to spend them
  // when they buy something. Written again when Mission control hands back to the result.
  fillPoints() {
    const points = available(this.save.records, this.save.upgrades);
    setHidden($("result-points"), !this.resultWon || this.pointsGained === 0);
    $("result-points").textContent = `+${this.pointsGained} requisition point${this.pointsGained === 1 ? "" : "s"} · ${points} to spend`;
    setHidden($("result-req"), !affordable(this.save.records, this.save.upgrades));
  }

  harbour() {
    return this.game.chapter === 0 && Boolean(STRIKE_MISSIONS[this.game.index]?.harbour);
  }

  failureText(result, story) {
    const text = FAILURE_TEXT[failureKey(result.reason, this.game.chapter, this.harbour())];
    return text ? text.replace("{boat}", this.game.op?.abortedBy || "Island Belle") : story.failure;
  }

  criteria(result) {
    const g = this.game,
      op = g.op;
    if (g.chapter === 0)
      return [
        [result.success, op.fleet ? `Sink ${op.fleet.needed()} boats, the key ships among them` : "Eliminate every target"],
        [result.success && op.used <= op.layout.par, `Use ${op.layout.par} bomb${op.layout.par === 1 ? "" : "s"} or fewer (used ${op.used})`],
        [result.success && !op.damaged, "Bring the whole flight home unscathed"],
      ];
    if (g.chapter === 1) return riverCriteria(op.starInput(result.success));
    if (g.op?.siege)
      return [
        [result.success, "The Tidelock is closed"],
        [result.success && g.op.siege.integrity / g.op.siege.max >= 0.7, "Station kept above 70%"],
        [result.success && g.hitsTaken <= 2, "Take at most two hits"],
      ];
    return [
      [result.success, "Everyone aboard and home"],
      [result.stars >= 2, "Take at most one hit"],
      [result.stars >= 3, "Take no hits"],
    ];
  }

  // ------------------------------------------------------------------ HUD

  updateHUD(force = false) {
    if (!this.game.mission) return;
    // Every frame: callout timers, a paused HUD holds its animations, the map's ping dot and the
    // edge markers.
    this.callouts.update();
    if (this.director.version !== this.radioVersion) this.renderRadio();
    setClass($("app"), "paused", this.game.paused);
    if (this.game.chapter === 0) this.updatePing();
    this.updateEdges();
    const now = performance.now();
    // 5.1 J1: score pops ride their points; the hurt edge fades 350 ms after a hit; the laser hum
    // stops with play.
    this.pops.update(now, this.game.reducedMotion);
    if (this.hurtAt && now - this.hurtAt > 350) {
      this.hurtAt = 0;
      delete $("hurt-edge").dataset.dir;
    }
    if (this.game.paused || this.game.status !== "playing") this.game.audio.hum(false);
    if (!force && now - this.lastHUD < 80) return;
    this.lastHUD = now;
    // The sound rests while paused with no dialog open (audio.js MIX.rest).
    this.game.audio.idle(this.audioAt ? (now - this.audioAt) / 1000 : 0, document.hidden, this.game.paused, this.anyDialog());
    this.audioAt = now;
    const state = this.game.snapshot(),
      chapter = state.chapter,
      op = state.op;
    setText($("score"), String(state.score).padStart(5, "0"));
    $("mission-progress").style.width = `${state.progress * 100}%`;
    setText($("mission-percent"), `${Math.floor(state.progress * 100)}%`);
    if (chapter === 0) this.updateStrike(op);
    else {
      const total = state.shields.reduce((a, b) => a + b, 0);
      setText($("shield-count"), `${total} / 9`);
      // 3 of 9 or fewer: a slow red pulse at the screen edge, and one SHIELDS LOW (5.1 J1).
      const low = total <= 3 && state.status === "playing";
      setClass($("hurt-edge"), "low-shield", low);
      if (low && !this.warnedLow) {
        this.warnedLow = true;
        this.callouts.toast("SHIELDS LOW");
      }
      setHTML(
        $("shield-segments"),
        state.shields
          .map((value) => `<span>${Array.from({ length: 3 }, (_, i) => `<i class="${i >= value ? "lost" : ""}"></i>`).join("")}</span>`)
          .join(""),
      );
      this.updateRounds(state.round);
    }
    if (chapter === 1) this.updateRiver(state, op);
    this.updateTide(chapter === 0 ? op.surge : undefined);
    if (chapter === 2 && op.siege) {
      // The finale: the gates are the objective; the station and Marrow carry world labels.
      this.objective(`${Math.floor(op.siege.gate * 100)}%`, "GATES CLOSED");
    } else if (chapter === 2) this.objective(`${op.rescued} / ${op.total}`, "SOLDIERS ABOARD");
    const bonuses = activeBonuses({ ...state, heli: op.help?.heli, ally: op.help?.ally });
    setHidden($("powerup"), chapter !== 1 || bonuses.length === 0);
    for (const kind of ["star", "gun", "heli", "ally"]) {
      const bonus = bonuses.find((entry) => entry.kind === kind);
      const row = $(`bonus-${kind}`);
      setHidden(row, !bonus);
      if (!bonus) continue;
      setText(row.querySelector("strong"), `${bonus.remaining.toFixed(1)}s`);
      row.querySelector(".bonus-fill").style.transform = `scaleX(${Math.min(1, bonus.remaining / bonus.duration)})`;
    }
    this.lastLabels = op.labels || [];
    this.updateLabels(this.lastLabels);
    if (force) this.updateBadgeBounds();
    this.rescueHUD.update(state);
  }

  // The objective count and unit, in the mission card and in the phones' objective line (`line`
  // when the phones need a shorter unit).
  objective(count, unit, line = unit) {
    setText($("objective-count"), count);
    setText($("objective-line-count"), count);
    setText($("objective-unit"), unit);
    setText($("objective-line-unit"), line);
  }

  // The tide chip (5.1 H1): the surge window left, read as HIGH TIDE, in the top bar at every width. Gold, orange
  // from 120 s, red and pulsing from 60 s; the bar under the top bar fills as the window runs out
  // and is written only when its whole percentage changes. Generic, so later clocks can use it.
  updateTide(left) {
    const chip = $("tide-chip"),
      on = left !== undefined;
    setHidden(chip, !on);
    if (!on) return;
    const seconds = Math.ceil(left);
    setText($("tide-text"), `HIGH TIDE ${clock(seconds)}`);
    setClass(chip, "urgent", seconds <= 60);
    setClass(chip, "warn", seconds > 60 && seconds <= 120);
    const elapsed = Math.floor((1 - left / this.game.op.surge) * 100);
    if (elapsed !== this.tideElapsed) {
      this.tideElapsed = elapsed;
      $("tide-fill").style.transform = `scaleX(${elapsed / 100})`;
    }
  }

  // The city map's ping (5.1 H1): a gathering going live or a new flak lock lights a dot on the
  // collapsed map button, checked every frame, until the map is opened.
  updatePing() {
    const op = this.game.op;
    let count = op.flakLocks?.length || 0;
    for (const e of op.events) if (e.status?.active) count++;
    // The harbour endgame (5.1 C1) pings the map once: the key hulls are left.
    if (op.fleet?.endgame) count++;
    if (count > this.pings && !$("app").classList.contains("map-open")) this.pinged = true;
    this.pings = count;
    setHidden($("map-ping"), !this.pinged);
  }

  // Whether a screen point lies outside the free play rect.
  offFrame(point) {
    const p = this.view.projectInto(this.screenPoint, point);
    return p.visible && outside(this.freeRect, p.x, p.y);
  }

  // Whether a canal threat is out of sight (5.1 K1): above or below the free play rect, off the
  // screen at a side, or on screen under a HUD panel. A point in plain view beside the free rect
  // (a bank gun on a wide screen) is in sight, so it gets no chevron.
  outOfSight(point) {
    const p = this.view.projectInto(this.screenPoint, point),
      free = this.freeRect;
    if (!p.visible) return false;
    if (p.y < free.top || p.y > free.bottom || p.x < 0 || p.x > innerWidth) return true;
    if (this.hudRects) for (const r of this.hudRects) if (p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom) return true;
    return false;
  }

  // Edge markers (5.1 H1), every frame: what threatens from outside the free play rect. The canal's
  // aiming guns and launchers out of sight (K1: past the free rect's top or bottom, or under a
  // panel); the valley's missiles, launch crews and drone pads, and Marrow; the harbour's key
  // hulls. Nothing here allocates.
  updateEdges() {
    const g = this.game,
      edge = this.edge,
      free = this.freeRect;
    edge.begin();
    if (free && g.status === "playing") {
      if (g.chapter === 1) {
        for (const e of g.entities) {
          if (!isHostileEntity(e)) continue;
          const kind = e.type === "launcher" ? "launcher" : e.aim > 0 && e.target ? "gun" : null;
          if (!kind) continue;
          if (this.outOfSight(e.position)) edge.track(e, e.position, kind);
        }
      } else if (g.chapter === 2) {
        for (const shot of g.projectiles) if (shot.hostile && shot.missile && !shot.dead && this.offFrame(shot.position)) edge.track(shot, shot.position, "missile");
        for (const label of this.lastLabels) {
          if (label.id === "boss") {
            if (this.offFrame(label)) edge.track(label.id, label, "boss");
          } else if ((label.text.startsWith("LAUNCH") || label.text.startsWith("DRONES")) && this.offFrame(label)) edge.track(label.id, label, "launch", label.text);
        }
      } else for (const label of this.lastLabels) if (label.kind === "key" && this.offFrame(label)) edge.track(label.id, label, "key");
    }
    edge.end();
    edge.update(this.view, free);
  }

  updateStrike(op) {
    // A collapsed phone map is not drawn.
    if (!this.phoneLayout.matches || $("app").classList.contains("map-open")) this.drawRadar(op);
    const left = op.left.enemies + op.left.aa + op.left.masts + op.left.trucks + (op.left.ships || 0);
    const parts = [
      op.left.enemies && `${op.left.enemies} HOSTILES`,
      op.left.ships && `${op.left.ships} SHIPS`,
      op.left.aa && `${op.left.aa} FLAK`,
      op.left.masts && `${op.left.masts} JAMMER`,
      op.left.trucks && `${op.left.trucks} TRUCKS`,
    ].filter(Boolean);
    // The harbour endgame names what is left to sink (5.1 C1); the phones' line only counts it.
    const unit = op.objective || parts.join(" / ") || "TARGETS LEFT";
    this.objective(String(left).padStart(2, "0"), unit, op.objective ? "KEY SHIPS" : unit);
    op.aircraft.forEach((a, i) => {
      const card = document.querySelector(`[data-aircraft="${i}"]`);
      if (!card) return;
      setClass(card, "down", !a.alive);
      setHTML(
        card.querySelector(".hp"),
        a.alive ? Array.from({ length: a.maxHp }, (_, k) => `<i class="${k < a.hp ? "" : "lost"}"></i>`).join("") : "DOWN",
      );
      card.querySelectorAll("[data-bomb]").forEach((chip) => {
        const kind = chip.dataset.bomb;
        setText(chip.querySelector("strong"), a.payload[kind] ?? 0);
        chip.disabled = !a.alive || !a.payload[kind];
        setClass(chip, "selected", kind === op.selected && a.payload[kind] > 0);
      });
    });
    // The dial reads the pattern angle while a pattern bomb is selected, else the Drill floor.
    const pattern = op.pattern;
    const mode = this.dialMode();
    setText($("floor-kind"), mode === "angle" ? "ANGLE" : "DRILL");
    setText($("floor-value"), mode === "angle" ? `${pattern?.angle ?? 0}°` : mode === "floor" ? `F${op.floor}` : "–");
    setClass($("floor-control"), "angle", mode === "angle");
    // Phones leave the angle to the pattern panel's buttons (5.1 H1); a decided mission hides Release.
    setClass($("flight-panel"), "angle-dial", mode === "angle");
    setClass($("flight-panel"), "decided", this.game.status !== "playing");
    $("floor-control").setAttribute("aria-label", mode === "angle" ? "Pattern angle" : "Drill detonation floor");
    $("floor-up").disabled = $("floor-down").disabled = !mode;
    setText($("formation-label"), op.wide ? "WIDE" : "TIGHT");
    // In the portrait camera the flight runs down the screen flying east.
    const arrow = this.view.strikePortrait ? (op.dir > 0 ? "↓" : "↑") : op.dir > 0 ? "→" : "←";
    setText($("speed-value"), `${arrow} ${Math.round((op.speed / FLIGHT.maxSpeed) * 100)}%`);
    $("reverse").disabled = !op.reversible;
    const ready = op.phase === "pass" && this.game.status === "playing";
    const any = op.aircraft.some((a) => a.alive && Object.values(a.payload).some((n) => n > 0));
    $("drop").disabled = !ready || !any;
    $("salvo").disabled = !ready || !any;
    // An armed drop (5.1 C1) says when it goes and who is expected.
    setText($("drop-label"), op.armed || (ready ? `Release ${BOMBS[op.selected]?.name || ""}` : `Turning ${Math.max(0, op.turn).toFixed(1)}s`));
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
      setText(chip.querySelector("strong"), e.active ? (there ? `${e.present}/${e.alive} ${Math.ceil(e.remaining)}s` : "SCATTERED") : `${Math.ceil(e.next)}s`);
    });
    setHidden($("intel"), events.length === 0);
    // Phones show one chip, the next event, and a tap opens the whole strip (5.1 H1).
    const next = events[0];
    setHidden($("intel-next"), !next);
    if (next) {
      const there = next.active && next.present > 0;
      setText(
        $("intel-next-text"),
        next.active ? (there ? `${next.label} ON ${clock(next.remaining)} · ${next.present}/${next.alive}` : `${next.label} SCATTERED`) : `${next.label} ${clock(next.next)} · ${next.alive}`,
      );
      setClass($("intel-next"), "hot", there);
      setClass($("intel-next"), "soon", !next.active && next.next < 8);
    }
    const flak = op.flak || [];
    setHidden($("flak-warning"), flak.length === 0);
    if (flak.length) {
      // The most urgent lock leads; any others are counted.
      const [first] = flak;
      // The warning says how likely a held course is to be hit (the difficulty's hit chance);
      // narrow screens name the aircraft K1-K3.
      const risk = first.chance > 0 ? `${percent(first.chance)} IF HELD` : "SAFE FOR NOW";
      const narrow = innerWidth < 1100;
      const who = narrow ? `K${["one", "two", "three"].indexOf(first.callsign.split(" ").pop().toLowerCase()) + 1}` : first.callsign.toUpperCase();
      const text = `FLAK${narrow ? "" : " LOCK"} / ${who} / ${first.solved ? "BREAK!" : `${Math.max(0, first.in).toFixed(1)}s`} / ${risk}${flak.length > 1 ? ` +${flak.length - 1}` : ""}`;
      setClass($("flak-warning"), "break", first.solved);
      setText($("flak-text"), text);
    }
    // Coach hints give way to a flak warning, which is the more urgent callout.
    const coach = flak.length || !op.hint ? "" : COACH[op.hint]?.[this.touch ? 1 : 0] || "";
    this.callouts.hint(coach, op.hint === "release" || op.hint === "lance");
    if (op.harbour) return this.updatePattern(op);
    const ladder = op.ladder;
    setClass($("ladder"), "empty", !ladder);
    setText($("ladder-name"), ladder ? `${ladder.name}${ladder.kind === "shelter" ? " / NO STRIKE" : ""}` : "PIPPER ON OPEN GROUND");
    setClass($("ladder"), "shelter", ladder?.kind === "shelter" || op.shelter);
    // On touch the floors are a read-out (too many for 44 px rows): the dial's arrows set the floor.
    const ladderKey = ladder ? `${ladder.name}|${ladder.floors.length}|${this.touch}` : "";
    if (ladderKey !== this.ladderKey) {
      this.ladderKey = ladderKey;
      const tag = this.touch ? "div" : "button";
      $("ladder-floors").innerHTML = ladder
        ? ladder.floors.map((f) => `<${tag} data-floor="${f.f}" aria-label="Floor ${f.label}"><span>${f.label}</span><em></em></${tag}>`).join("")
        : "";
    }
    if (ladder)
      [...$("ladder-floors").children].forEach((row, i) => {
        const f = ladder.floors[i];
        setClass(row, "drill", f.f === ladder.drillFloor);
        setClass(row, "set", f.f + 1 === op.floor);
        setText(row.querySelector("em"), `${"●".repeat(Math.min(6, f.count))}${f.props ? "▲".repeat(f.props) : ""}`);
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
    setClass(panel, "empty", false);
    setClass(panel, "shelter", p?.civilian || op.shelter);
    setText($("ladder-name"), p ? `${p.name.toUpperCase()} / ${p.angle}°` : `${(BOMBS[op.selected]?.name || "").toUpperCase()}`);
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
    if (count) {
      setText(count, text);
      setClass(count, "hot", p && p.sinks && !p.civilian);
    }
  }

  // The gun button shows the rounds in use (2.7): nothing for standard rounds, else the kind and
  // how many are left, in the rounds' colour; the desktop label names them.
  updateRounds(round) {
    const badge = $("round-stock");
    const special = round && round.kind !== "standard";
    setHidden(badge, !special);
    if (special) {
      setText(badge, `${round.kind === "plasma" ? "PL" : round.short}${round.count}`);
      if (badge.dataset.round !== round.kind) badge.dataset.round = round.kind;
    }
    const gun = this.game.chapter === 1 ? "DECK GUN" : "CHAIN GUN";
    if (this.game.weapon === "gun") setText($("weapon-label"), special ? `${gun} / ${round.name} ${round.count}` : gun);
  }

  updateRiver(state, op) {
    // The top banner says how likely enemy fire is to hurt when a gun has you in its sights.
    const incoming = op.incoming;
    setHidden($("flak-warning"), !incoming.aiming);
    setClass($("flak-warning"), "calm", true);
    if (incoming.aiming) {
      const risk = incoming.chance > 0 ? `${percent(incoming.chance)} HIT CHANCE` : "CAN'T HIT YOU YET";
      const text = innerWidth < 700 ? `${incoming.aiming} AIMING / ${incoming.chance > 0 ? `${percent(incoming.chance)} HIT` : "SAFE"}` : `ENEMY FIRE / ${incoming.aiming} AIMING / ${risk}`;
      setText($("flak-text"), text);
    }
    const w = op.weapons;
    setText($("rocket-stock"), w.rockets);
    setClass($("rocket-weapon"), "empty", w.rockets <= 0);
    $("laser-heat").style.transform = `scaleX(${w.heat.toFixed(3)})`;
    setClass($("laser-weapon"), "overheated", w.overheated);
    setText($("strike-stock"), w.strikes);
    $("strike-action").disabled = w.strikes <= 0 || w.striking;
    this.objective(`${Math.max(0, Math.ceil(op.length - op.distance))}`, op.holding ? "CONVOY HOLDING" : "METRES TO GO");
    this.callouts.hint(op.hint ? COACH[op.hint][this.touch ? 1 : 0] : "");
    setHTML(
      $("barge-bars"),
      op.barges
        .map(
          (b, i) =>
            `<div class="bar ${b.alive ? "" : "lost"}"><span>${i ? "RELIEF TWO" : "HARBOR MERCY"}</span><div><i style="transform:scaleX(${(b.hp / b.max).toFixed(3)})"></i></div></div>`,
        )
        .join(""),
    );
    // The Lock Gate's bars live in the boss slot under the top bar (5.1 H1).
    const boss = Boolean(op.boss) && op.boss.phase !== "approach";
    setHidden($("boss-slot"), !boss);
    setClass($("app"), "boss-on", boss);
    if (boss)
      setHTML($("boss-slot"), [
        ...op.boss.towers.map((hp, i) => `<div class="bar hostile"><span>GATE TOWER ${i ? "EAST" : "WEST"}</span><div><i style="transform:scaleX(${hp.toFixed(3)})"></i></div></div>`),
        `<div class="bar hostile ${op.boss.shielded ? "shielded" : ""}"><span>GENERATOR${op.boss.shielded ? " / SHIELDED" : ""}</span><div><i style="transform:scaleX(${op.boss.generator.toFixed(3)})"></i></div></div>`,
      ].join(""));
  }

  // World tags (5.1 H1): a glyph by kind; a tag under a HUD panel is hidden that tick, and boss
  // and objective tags are kept inside the free play rect instead. Sizes are measured once per
  // text change, all together, so a tick forces at most one layout.
  updateLabels(labels) {
    const layer = $("world-labels"),
      seen = this.seenLabels,
      free = this.freeRect;
    seen.clear();
    for (const label of labels) {
      seen.add(label.id);
      let tag = this.labels.get(label.id);
      if (!tag) {
        const el = document.createElement("div");
        el.className = "world-label";
        const text = document.createElement("span");
        el.append(text);
        layer.append(el);
        tag = { el, text, glyph: null, kind: null, raw: null, w: 0, h: 0, x: NaN, y: NaN, shown: true };
        this.labels.set(label.id, tag);
      }
      const kind = label.kind || "";
      if (kind !== tag.kind) {
        tag.kind = kind;
        // A plain tag carries no data-kind at all (the attribute alone restyles a tag).
        if (kind) tag.el.dataset.kind = kind;
        else delete tag.el.dataset.kind;
        tag.glyph?.remove();
        tag.glyph = TAG_GLYPH[kind] ? createElement(TAG_GLYPH[kind]) : null;
        if (tag.glyph) {
          tag.glyph.classList.add("lucide", `lucide-${kind === "key" ? "star" : "ban"}`);
          tag.el.prepend(tag.glyph);
        }
        tag.raw = null;
      }
      if (label.text !== tag.raw) {
        tag.raw = label.text;
        // The glyph replaces a leading star or dot.
        setText(tag.text, tag.glyph ? label.text.replace(/^[★●] /, "") : label.text);
        tag.w = -1;
      }
      setClass(tag.el, "hot", label.hot);
    }
    for (const [id, tag] of this.labels)
      if (!seen.has(id)) {
        tag.el.remove();
        this.labels.delete(id);
      } else if (tag.w < 0) {
        tag.w = tag.el.offsetWidth;
        tag.h = tag.el.offsetHeight;
      }
    for (const label of labels) {
      const tag = this.labels.get(label.id),
        p = this.view.projectInto(this.screenPoint, label);
      // The tag hangs centred over its point.
      let x = p.x - tag.w / 2,
        y = p.y - tag.h,
        shown = p.visible;
      if (free && (PINNED_TAGS.has(label.id) || label.kind === "key")) {
        x = Math.min(Math.max(x, free.left), free.right - tag.w);
        y = Math.min(Math.max(y, free.top), free.bottom - tag.h);
      } else if (shown)
        for (const r of this.hudRects)
          if (x < r.right && x + tag.w > r.left && y < r.bottom && y + tag.h > r.top) {
            shown = false;
            break;
          }
      x = Math.round(x);
      y = Math.round(y);
      if (x !== tag.x || y !== tag.y) {
        tag.x = x;
        tag.y = y;
        tag.el.style.transform = `translate(${x}px, ${y}px)`;
      }
      if (shown !== tag.shown) {
        tag.shown = shown;
        tag.el.style.visibility = shown ? "" : "hidden";
      }
    }
  }
}
