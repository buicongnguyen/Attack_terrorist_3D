import * as THREE from "three";

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
    duration: 7,
    toast: "TWIN GUNS / 7 SEC",
  },
  gun: {
    model: "pickup-gun",
    color: 0x6bdaff,
    label: "GUIDED",
    reward: 60,
    duration: 5,
    toast: "GUIDED SUPPORT / 5 SEC",
  },
  medal: {
    model: "pickup-medal",
    color: 0xffb957,
    label: "+250",
    reward: 250,
    toast: "FIELD MEDAL +250",
  },
});

export function activeBonuses(state) {
  return [
    { kind: "star", remaining: state.twin, ...PICKUPS.star },
    { kind: "gun", remaining: state.auto, ...PICKUPS.gun },
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
  } else if (kind === "gun") {
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
