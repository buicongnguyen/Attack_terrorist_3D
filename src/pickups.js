import * as THREE from "three";
import { SUPPORT } from "./river-data.js";
import { ROUNDS } from "./armoury.js";

export const PICKUPS = Object.freeze({
  health: {
    model: "pickup-health",
    color: 0x35e0a8,
    label: "REPAIR",
    reward: 60,
    toast: "SHIELDS RESTORED",
  },
  star: {
    model: "pickup-star",
    color: 0xffd369,
    label: "TWIN x2",
    reward: 60,
    duration: 10,
    toast: "TWIN GUNS / 10 SEC",
  },
  gun: {
    model: "pickup-gun",
    color: 0x6bdaff,
    label: "GUIDED",
    reward: 60,
    duration: 8,
    toast: "GUIDED SUPPORT / 8 SEC",
  },
  // Canal help (2.4): a gunship that fires where Marlin fires, an escort boat, an air strike.
  heli: {
    model: "pickup-gun",
    color: 0x7fd8ff,
    label: "GUNSHIP",
    reward: 80,
    duration: SUPPORT.heli.time,
    toast: `GUNSHIP ON STATION / ${SUPPORT.heli.time} SEC`,
  },
  ally: {
    model: "pickup-star",
    color: 0x33d69f,
    label: "ESCORT",
    reward: 80,
    duration: SUPPORT.ally.time,
    toast: `ESCORT BOAT JOINS / ${SUPPORT.ally.time} SEC`,
  },
  strike: {
    model: "pickup-medal",
    color: 0xff8a1f,
    label: "AIR STRIKE",
    reward: 80,
    toast: "AIR STRIKE +1",
  },
  medal: {
    model: "pickup-medal",
    color: 0xffb957,
    label: "+250",
    reward: 250,
    toast: "FIELD MEDAL +250",
  },
  ammo: {
    model: "pickup-gun",
    color: 0xffd369,
    label: "ROCKETS",
    reward: 60,
    toast: "ROCKETS +10",
  },
  support: {
    model: "pickup-gun",
    color: 0x6bdaff,
    label: "SUPPORT",
    reward: 60,
    toast: "GUIDED +4 / FLARES +2",
  },
  // Rounds for the main gun (2.7): the gun switches to the strongest it holds.
  ap: {
    model: "pickup-gun",
    color: ROUNDS.ap.color,
    label: "AP",
    reward: 60,
    rounds: "ap",
    toast: `AP ROUNDS +${ROUNDS.ap.magazine}`,
  },
  he: {
    model: "pickup-gun",
    color: ROUNDS.he.color,
    label: "HE",
    reward: 60,
    rounds: "he",
    toast: `HE ROUNDS +${ROUNDS.he.magazine}`,
  },
  plasma: {
    model: "pickup-star",
    color: ROUNDS.plasma.color,
    label: "PLASMA",
    reward: 80,
    rounds: "plasma",
    toast: `PLASMA +${ROUNDS.plasma.magazine}`,
  },
});

export function activeBonuses(state) {
  return [
    { kind: "star", remaining: state.twin, ...PICKUPS.star },
    { kind: "gun", remaining: state.auto, ...PICKUPS.gun },
    { kind: "heli", remaining: state.heli || 0, ...PICKUPS.heli },
    { kind: "ally", remaining: state.ally || 0, ...PICKUPS.ally },
  ].filter((bonus) => bonus.remaining > 0);
}

export function badgeWorldSize(camera, canvasHeight, pixels = 50) {
  const width =
    ((camera.top - camera.bottom) / camera.zoom / Math.max(1, canvasHeight)) *
    pixels;
  return { width, height: (width * 224) / 192 };
}

// Shared, camera-facing symbols remain legible when the physical supply case turns.
export function createPickupBadgeMaterial(kind) {
  const info = PICKUPS[kind];
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 224;
  const ctx = canvas.getContext("2d");
  const accent = `#${info.color.toString(16).padStart(6, "0")}`;
  ctx.beginPath();
  ctx.arc(96, 78, 66, 0, Math.PI * 2);
  ctx.fillStyle = "#123b46";
  ctx.fill();
  ctx.strokeStyle = "#0d2c36";
  ctx.lineWidth = 14;
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.fillStyle = "#f6fff4";
  ctx.strokeStyle = "#f6fff4";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (kind === "health") {
    ctx.fillRect(83, 38, 26, 80);
    ctx.fillRect(56, 65, 80, 26);
  } else if (kind === "star") {
    for (const x of [73, 119]) {
      ctx.fillRect(x - 9, 41, 18, 48);
      ctx.fillRect(x - 15, 85, 30, 21);
    }
    ctx.fillStyle = accent;
    ctx.font = "bold 30px Arial";
    ctx.textAlign = "center";
    ctx.fillText("x2", 96, 133);
  } else if (kind === "heli") {
    // Gunship: fuselage, tail boom and a rotor bar.
    ctx.fillRect(38, 40, 116, 9);
    ctx.fillRect(92, 44, 8, 16);
    ctx.beginPath();
    ctx.ellipse(86, 78, 36, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(110, 72, 44, 9);
    ctx.fillRect(146, 60, 9, 26);
    ctx.fillRect(58, 96, 60, 7);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.ellipse(72, 74, 13, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "ally") {
    // Escort boat: hull, cabin and a gun.
    ctx.beginPath();
    ctx.moveTo(36, 88);
    ctx.lineTo(156, 88);
    ctx.lineTo(140, 112);
    ctx.lineTo(52, 112);
    ctx.fill();
    ctx.fillRect(66, 60, 44, 28);
    ctx.fillRect(118, 70, 14, 18);
    ctx.fillRect(128, 74, 30, 7);
    ctx.fillStyle = accent;
    ctx.fillRect(72, 66, 32, 12);
    ctx.fillRect(84, 36, 5, 24);
  } else if (kind === "strike") {
    // Air strike: a bomber over three falling bombs.
    ctx.beginPath();
    ctx.moveTo(96, 30);
    ctx.lineTo(104, 58);
    ctx.lineTo(150, 66);
    ctx.lineTo(104, 72);
    ctx.lineTo(100, 90);
    ctx.lineTo(112, 96);
    ctx.lineTo(80, 96);
    ctx.lineTo(92, 90);
    ctx.lineTo(88, 72);
    ctx.lineTo(42, 66);
    ctx.lineTo(88, 58);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = accent;
    for (const [x, y] of [
      [66, 112],
      [96, 122],
      [126, 112],
    ]) {
      ctx.beginPath();
      ctx.ellipse(x, y, 6, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (info.rounds) {
    // A belt of three rounds, the tips in the round's colour.
    for (const [i, x] of [58, 96, 134].entries()) {
      ctx.fillStyle = "#f6fff4";
      ctx.fillRect(x - 11, 58, 22, 52);
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(x - 11, 58);
      ctx.quadraticCurveTo(x, 20 + (i % 2) * 6, x + 11, 58);
      ctx.fill();
      ctx.fillStyle = "#123b46";
      ctx.fillRect(x - 11, 92, 22, 5);
    }
    if (kind === "plasma") {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(96, 78, 52, -0.4, 0.4);
      ctx.stroke();
    }
  } else if (["gun", "ammo", "support"].includes(kind)) {
    ctx.save();
    ctx.translate(96, 76);
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(0, -43);
    ctx.quadraticCurveTo(23, -19, 17, 22);
    ctx.lineTo(-17, 22);
    ctx.quadraticCurveTo(-23, -19, 0, -43);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-15, 3);
    ctx.lineTo(-30, 28);
    ctx.lineTo(30, 28);
    ctx.lineTo(15, 3);
    ctx.fill();
    ctx.fillStyle = "#123b46";
    ctx.beginPath();
    ctx.arc(0, -6, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(0, 35);
    ctx.lineTo(0, 49);
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(72, 91);
    ctx.lineTo(63, 131);
    ctx.lineTo(92, 113);
    ctx.lineTo(117, 133);
    ctx.lineTo(123, 91);
    ctx.fill();
    ctx.fillStyle = "#f6fff4";
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5,
        radius = i % 2 ? 17 : 38;
      const x = 96 + Math.sin(a) * radius,
        y = 73 - Math.cos(a) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = "#10343f";
  ctx.beginPath();
  ctx.roundRect(12, 153, 168, 45, 12);
  ctx.fill();
  ctx.fillStyle = "#f5fff3";
  ctx.font = "bold 29px Arial";
  ctx.textAlign = "center";
  ctx.fillText(info.label, 96, 185);
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(85, 205);
  ctx.lineTo(107, 205);
  ctx.lineTo(96, 217);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}
