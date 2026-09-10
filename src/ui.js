import {
  createIcons,
  Crosshair,
  Volume2,
  VolumeX,
  Pause,
  Play,
  SlidersHorizontal,
  Plane,
  Ship,
  Scan,
  Radio,
  Shield,
  Bomb,
  ChevronDown,
  ArrowDownToLine,
  Move,
  Rocket,
  X,
  RotateCcw,
  SkipForward,
  BadgeCheck,
  ArrowRight,
  Star,
  TriangleAlert,
  Navigation,
  Sparkles,
  ArrowUpFromLine,
  Target,
} from "lucide";
import {
  CHAPTERS,
  MISSIONS,
  DEFAULT_LOADOUT,
  missionNumber,
  saveResult,
} from "./data.js";
import { activeBonuses } from "./pickups.js";
import { RescueHUD } from "./rescue-hud.js";
import { isHostileEntity } from "./rescue-data.js";

const iconSet = {
  Crosshair,
  Volume2,
  VolumeX,
  Pause,
  Play,
  SlidersHorizontal,
  Plane,
  Ship,
  Scan,
  Radio,
  Shield,
  Bomb,
  ChevronDown,
  ArrowDownToLine,
  Move,
  Rocket,
  X,
  RotateCcw,
  SkipForward,
  BadgeCheck,
  ArrowRight,
  Star,
  TriangleAlert,
  Navigation,
  Sparkles,
  ArrowUpFromLine,
  Target,
};
const $ = (id) => document.getElementById(id);
export const refreshIcons = () =>
  createIcons({ icons: iconSet, attrs: { "aria-hidden": "true" } });
export function readSave() {
  try {
    const saved = JSON.parse(localStorage.getItem("tidelock-v1") || "{}");
    const records = {};
    for (const [key, value] of Object.entries(saved.records || {})) {
      if (
        Number.isInteger(+key) &&
        +key >= 0 &&
        +key < MISSIONS.length &&
        Number.isFinite(value?.score) &&
        Number.isFinite(value?.stars)
      )
        records[key] = {
          score: Math.max(0, value.score),
          stars: Math.min(3, Math.max(0, value.stars)),
        };
    }
    return {
      records,
      muted: Boolean(saved.muted),
      reducedMotion: Boolean(saved.reducedMotion),
    };
  } catch {
    return { records: {}, muted: false, reducedMotion: false };
  }
}

export class UI {
  constructor(game, view, save) {
    this.game = game;
    this.view = view;
    this.save = save;
    this.keys = new Set();
    this.pointerFire = false;
    this.moveStick = { x: 0, z: 0 };
    this.fireStick = null;
    this.winchHeld = false;
    this.padResets = [];
    this.lastHUD = -1;
    this.toastTime = 0;
    this.dialog = $("menu-dialog");
    this.game.reducedMotion =
      save.reducedMotion ||
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    $("reduced-motion").checked = this.game.reducedMotion;
    $("audio-enabled").checked = !save.muted;
    this.updateSound();
    this.bind();
    this.bindStick("move-stick", false);
    this.bindStick("fire-stick", true);
    this.rescueHUD = new RescueHUD(game);
    const touchQuery = matchMedia("(any-pointer: coarse)");
    const touchLayout = () => {
      document.documentElement.dataset.touch = String(
        touchQuery.matches || navigator.maxTouchPoints > 0,
      );
      this.clearInput();
    };
    touchLayout();
    touchQuery.addEventListener("change", touchLayout);
    window.addEventListener("resize", () => this.clearInput());
    refreshIcons();
    this.badgeOverlays = [
      ...document.querySelectorAll(
        ".topbar, .mission-hud, .world-caption, #shield-hud, #powerup, .joystick, .weapon-bar, #rescue-hud, #rescue-actions",
      ),
    ];
    this.overlayObserver = new ResizeObserver(() => this.updateBadgeBounds());
    this.badgeOverlays.forEach((node) => this.overlayObserver.observe(node));
    window.addEventListener("resize", () => this.updateBadgeBounds());
  }

  updateBadgeBounds() {
    this.view.badgeKeepouts = this.badgeOverlays
      .map((node) => node.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    this.view.needsRender = true;
  }

  persist() {
    try {
      localStorage.setItem("tidelock-v1", JSON.stringify(this.save));
    } catch {
      /* Private-mode storage is optional. */
    }
  }

  bind() {
    $("drop").onclick = () => {
      this.game.audio.unlock();
      this.game.drop();
    };
    $("settings").onclick = () => this.menu();
    $("pause").onclick = () => this.menu();
    $("resume").onclick = $("menu-close").onclick = () => this.resume();
    this.dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      this.resume();
    });
    $("retry").onclick = $("result-retry").onclick = () =>
      this.start(this.game.index);
    $("skip").onclick = () =>
      this.start((this.game.index + 1) % MISSIONS.length);
    $("result-next").onclick = () =>
      this.start(
        this.game.status === "success"
          ? (this.game.index + 1) % MISSIONS.length
          : this.game.index,
      );
    $("result-dialog").addEventListener("cancel", (e) => e.preventDefault());
    document.querySelectorAll("[data-chapter]").forEach((button) => {
      button.onclick = () =>
        this.start(
          MISSIONS.findIndex((m) => m.chapter === +button.dataset.chapter),
        );
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
      this.persist();
    };
    $("loadout-toggle").onclick = () => $("loadout").classList.toggle("open");
    $("loadout-close").onclick = () => $("loadout").classList.remove("open");
    document.querySelectorAll("[data-bomb]").forEach(
      (button) =>
        (button.onclick = () => {
          document
            .querySelectorAll("[data-bomb]")
            .forEach((b) => b.classList.toggle("selected", b === button));
          this.updateLoadout();
        }),
    );
    ["angle", "speed", "fuse", "walls", "flight-path", "scope"].forEach((id) =>
      $(id).addEventListener("input", () => this.updateLoadout()),
    );
    $("gun-weapon").onclick = () => this.weapon("gun");
    $("rocket-weapon").onclick = () => this.weapon("rocket");
    $("guided-weapon").onclick = () => this.weapon("guided");
    $("flare-action").onclick = () => this.game.rescue?.flare();
    const winch = $("winch-action");
    winch.onpointerdown = (event) => {
      if (this.game.paused || !this.game.rescue) return;
      event.preventDefault();
      winch.setPointerCapture(event.pointerId);
      this.winchHeld = true;
    };
    winch.onpointerup =
      winch.onpointercancel =
      winch.onlostpointercapture =
        () => (this.winchHeld = false);
    window.addEventListener("keydown", (e) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      const key = e.key.toLowerCase();
      if (
        [" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)
      )
        e.preventDefault();
      if (key === "escape" && !e.repeat && !$("result-dialog").open) {
        this.dialog.open ? this.resume() : this.menu();
        return;
      }
      if (this.game.paused || this.game.status !== "playing") return;
      this.game.audio.unlock();
      this.keys.add(key);
      if (!e.repeat) {
        if (key === " " && this.game.chapter === 0) this.game.drop();
        if (key === "r") this.start(this.game.index);
        if (key === "1") this.weapon("gun");
        if (key === "2") this.weapon("rocket");
        if (key === "3") this.weapon("guided");
        if (key === "f") this.game.rescue?.flare();
      }
    });
    window.addEventListener("keyup", (e) =>
      this.keys.delete(e.key.toLowerCase()),
    );
    this.view.canvas.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "touch") this.aim(e.clientX, e.clientY);
    });
    this.view.canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || this.game.paused || this.game.chapter === 0) return;
      this.game.audio.unlock();
      this.aim(e.clientX, e.clientY);
      this.pointerFire = true;
      this.view.canvas.setPointerCapture(e.pointerId);
    });
    const release = () => {
      this.pointerFire = false;
    };
    this.view.canvas.addEventListener("pointerup", release);
    this.view.canvas.addEventListener("pointercancel", release);
    this.view.canvas.addEventListener("lostpointercapture", release);
    window.addEventListener("blur", () => {
      this.clearInput();
      if (this.game.status === "playing") this.menu();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.game.status === "playing") this.menu();
    });
  }

  aim(x, y) {
    const shots = this.game.projectiles.filter((s) => s.hostile && s.missile);
    this.game.input.aim.copy(
      this.view.aim(x, y, [
        ...this.game.entities.filter(isHostileEntity),
        ...shots,
      ]),
    );
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
      if (old !== null && element.hasPointerCapture(old))
        element.releasePointerCapture(old);
      knob.style.transform = "";
      if (fire) this.fireStick = null;
      else this.moveStick = { x: 0, z: 0 };
    };
    const release = (event) => {
      if (pointer === event.pointerId) reset();
    };
    this.padResets.push(reset);
    element.onpointerup =
      element.onpointercancel =
      element.onlostpointercapture =
        release;
  }

  clearInput() {
    this.padResets.forEach((reset) => reset());
    this.keys.clear();
    this.pointerFire = false;
    this.fireStick = null;
    this.winchHeld = false;
    this.game.input.winch = false;
    this.moveStick = { x: 0, z: 0 };
    this.game.input.fire = false;
    this.game.input.stickAim = null;
    this.game.input.x = 0;
    this.game.input.z = 0;
    document
      .querySelectorAll(".stick-knob")
      .forEach((el) => (el.style.transform = ""));
  }

  updateInput() {
    if (this.game.paused) return;
    const held = (key) => (this.keys.has(key) ? 1 : 0);
    this.game.input.x =
      held("d") +
      held("arrowright") -
      held("a") -
      held("arrowleft") +
      this.moveStick.x;
    this.game.input.z =
      held("s") +
      held("arrowdown") -
      held("w") -
      held("arrowup") +
      this.moveStick.z;
    this.game.input.fire =
      this.pointerFire || this.keys.has(" ") || Boolean(this.fireStick);
    this.game.input.stickAim = this.fireStick;
    this.game.input.winch =
      this.game.chapter === 2 && (this.winchHeld || this.keys.has("e"));
    if (this.game.chapter === 2) {
      const input = this.game.input,
        length = Math.min(1, Math.hypot(input.x, input.z));
      if (length > 0) {
        const direction = this.view.screenDirection(input);
        input.x = direction.x * length;
        input.z = direction.z * length;
      }
    }
  }

  updateLoadout() {
    const config = {
      type: document.querySelector("[data-bomb].selected").dataset.bomb,
      path: $("flight-path").value,
      angle: +$("angle").value,
      speed: +$("speed").value,
      fuse: +$("fuse").value,
      walls: +$("walls").value,
    };
    if ($("scope").value === "next") this.game.nextLoadout = config;
    else {
      this.game.loadout = config;
      this.game.nextLoadout = null;
    }
    $("angle-value").textContent = `${config.angle}\u00b0`;
    $("speed-value").textContent = `${config.speed} m/s`;
    $("fuse-value").textContent = `${config.fuse.toFixed(1)} s`;
    $("walls-value").textContent = config.walls;
    $("walls").disabled = config.type !== "drill";
    $("fuse").disabled = config.type === "drill";
  }

  weapon(kind) {
    if (this.game.chapter !== 2) kind = "gun";
    this.game.weapon = kind;
    $("gun-weapon").classList.toggle("selected", kind === "gun");
    $("rocket-weapon").classList.toggle("selected", kind === "rocket");
    $("guided-weapon").classList.toggle("selected", kind === "guided");
    $("weapon-label").textContent =
      kind === "guided"
        ? "GUIDED MISSILES"
        : kind === "rocket"
          ? "ROCKET PODS"
          : this.game.chapter === 1
            ? "DECK GUN"
            : "CHAIN GUN";
  }

  updateSound() {
    this.game.audio.muted = this.save.muted;
    $("sound").innerHTML =
      `<i data-lucide="${this.save.muted ? "volume-x" : "volume-2"}"></i>`;
    $("sound").setAttribute(
      "aria-label",
      this.save.muted ? "Unmute sound" : "Mute sound",
    );
    $("sound").title = this.save.muted ? "Unmute sound" : "Mute sound";
    $("audio-enabled").checked = !this.save.muted;
    refreshIcons();
  }

  menu() {
    if ($("result-dialog").open || this.dialog.open || !this.game.mission)
      return;
    this.game.paused = true;
    this.clearInput();
    this.fillMissions();
    $("mission-briefing").textContent = this.game.mission.text;
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
    this.clearInput();
    this.game.audio.unlock();
    $("loadout").classList.remove("open");
    this.game.start(index);
  }

  fillMissions() {
    $("mission-list").innerHTML = "";
    MISSIONS.forEach((mission, index) => {
      const button = document.createElement("button");
      button.textContent = `${mission.chapter + 1}.${missionNumber(index)}`;
      button.title = mission.name;
      button.setAttribute(
        "aria-label",
        `Mission ${mission.chapter + 1}.${missionNumber(index)}: ${mission.name}`,
      );
      button.className = `${index === this.game.index ? "active" : ""} ${this.save.records[index] ? "completed" : ""}`;
      button.onclick = () => this.start(index);
      $("mission-list").append(button);
    });
  }

  onEvent(type, data) {
    if (type === "start") {
      const c = this.game.chapter,
        m = data.mission;
      document.body.dataset.chapter = c;
      document
        .querySelectorAll("[data-chapter]")
        .forEach((button) =>
          button.classList.toggle("active", +button.dataset.chapter === c),
        );
      $("chapter-label").textContent =
        `CHAPTER 0${c + 1} / ${CHAPTERS[c].label.toUpperCase()}`;
      $("mission-name").textContent = m.name;
      $("objective").textContent = [
        "Clear the relay garrison",
        "Reach the mountain station",
        "Rescue the soldiers and return to base",
      ][c];
      $("mission-index").textContent =
        `MISSION ${String(missionNumber(data.index)).padStart(2, "0")} / ${c === 0 ? "06" : "03"}`;
      $("transmission").textContent = m.text;
      $("coordinate-detail").textContent = [
        "SECTOR A / 06:42 AM",
        "SECTOR B / 08:16 AM",
        "SECTOR C / 09:35 AM",
      ][c];
      $("footer-mode").textContent = [
        "AIRBORNE / ACTIVE",
        "UPRIVER / ACTIVE",
        "EXTRACTION / ACTIVE",
      ][c];
      $("loadout").hidden = c !== 0;
      $("bomb-actions").hidden = c !== 0;
      $("combat-controls").hidden = c === 0;
      $("shield-hud").hidden = c === 0;
      $("rocket-weapon").hidden = c !== 2;
      $("guided-weapon").hidden = c !== 2;
      $("rescue-hud").hidden = $("rescue-actions").hidden = c !== 2;
      $("rocket-stock").hidden = c !== 2;
      $("rocket-weapon").disabled = false;
      $("shield-title").textContent =
        c === 1 ? "SHIELD INTEGRITY" : "SHIELD SECTORS";
      $("scope").value = "all";
      this.updateLoadout();
      this.weapon("gun");
      $("toast").classList.remove("visible");
      this.lastHUD = -1;
      this.updateHUD(true);
    } else if (type === "toast") {
      $("toast").textContent = data;
      $("toast").classList.add("visible");
      this.toastTime = performance.now() + 2100;
    } else if (type === "result") this.showResult(data);
  }

  showResult(result) {
    this.clearInput();
    this.game.paused = true;
    if (result.success) {
      this.save.records = saveResult(
        this.save.records,
        result.index,
        result.score,
        result.stars,
      );
      this.persist();
    }
    const finale = result.success && result.index === MISSIONS.length - 1;
    $("result-eyebrow").textContent = finale
      ? "OPERATION COMPLETE"
      : result.success
        ? "MISSION COMPLETE"
        : "MISSION INTERRUPTED";
    $("result-title").textContent = finale
      ? "Everyone is coming home."
      : result.success
        ? ["Relay secured", "Channel cleared", "Team delivered"][
            this.game.chapter
          ]
        : "Another approach.";
    $("result-story").textContent = finale
      ? "The rescue team is safe. The relief corridor is open. Well flown, Kestrel."
      : result.success
        ? [
            "The relay is silent. One step closer to opening the relief corridor.",
            "The launch made it through. Your next waypoint is ready.",
            "The rescued soldiers are safe at base. Your next sortie is ready.",
          ][this.game.chapter]
        : this.game.chapter === 0
          ? "The garrison is still active. Adjust the release point and payload for another pass."
          : "We lost protection before reaching the objective. Regroup and try the route again.";
    $("result-stars").innerHTML = Array.from(
      { length: 3 },
      (_, i) =>
        `<i data-lucide="star" class="${i < result.stars ? "earned" : ""}"></i>`,
    ).join("");
    $("result-stars").setAttribute("aria-label", `${result.stars} of 3 stars`);
    $("result-score").textContent = result.score.toLocaleString();
    $("result-targets").textContent = result.kills;
    $("result-best").textContent = (
      this.save.records[result.index]?.score || 0
    ).toLocaleString();
    $("result-next").innerHTML =
      `${finale ? "Play again" : result.success ? "Next mission" : "Try again"}<i data-lucide="arrow-right"></i>`;
    refreshIcons();
    $("result-dialog").showModal();
  }

  updateHUD(force = false) {
    if (!this.game.mission) return;
    const now = performance.now();
    if (now > this.toastTime) $("toast").classList.remove("visible");
    if (!force && now - this.lastHUD < 85) return;
    this.lastHUD = now;
    const state = this.game.snapshot(),
      chapter = state.chapter;
    $("score").textContent = String(state.score).padStart(5, "0");
    if (innerWidth <= 900)
      $("coordinate-detail").textContent =
        `SCORE ${String(state.score).padStart(5, "0")}`;
    $("mission-progress").style.width = `${state.progress * 100}%`;
    $("mission-percent").textContent = `${Math.floor(state.progress * 100)}%`;
    $("objective-count").textContent =
      chapter === 0
        ? String(state.remaining).padStart(2, "0")
        : chapter === 2
          ? `${state.rescue.rescued} / ${state.rescue.total}`
          : `${Math.ceil(Math.max(0, this.game.mission.duration - state.time))}s`;
    $("objective-unit").textContent =
      chapter === 0
        ? "HOSTILES REMAINING"
        : chapter === 1
          ? "TO WAYPOINT"
          : "SOLDIERS ABOARD";
    $("ammo").textContent = String(state.ammo || 0).padStart(2, "0");
    $("drop").disabled = !state.ammo || state.status !== "playing";
    const total = state.shields.reduce((a, b) => a + b, 0);
    $("shield-count").textContent = `${total} / ${chapter ? 9 : 3}`;
    const max = chapter ? 3 : 1;
    $("shield-segments").innerHTML = state.shields
      .map(
        (value) =>
          `<span>${Array.from({ length: max }, (_, i) => `<i class="${i >= value ? "lost" : ""}"></i>`).join("")}</span>`,
      )
      .join("");
    const bonuses = activeBonuses(state);
    $("powerup").hidden = chapter !== 1 || bonuses.length === 0;
    for (const kind of ["star", "gun"]) {
      const bonus = bonuses.find((entry) => entry.kind === kind);
      const row = $(`bonus-${kind}`);
      row.hidden = !bonus;
      if (!bonus) continue;
      row.querySelector("strong").textContent =
        `${bonus.remaining.toFixed(1)}s`;
      row.querySelector(".bonus-fill").style.transform =
        `scaleX(${Math.min(1, bonus.remaining / bonus.duration)})`;
    }
    if (force) this.updateBadgeBounds();
    this.rescueHUD.update(state);
  }
}
