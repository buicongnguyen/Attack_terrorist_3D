import { isHostileEntity, riverAt } from "./rescue-data.js";

export class RescueHUD {
  constructor(game) {
    this.game = game;
    this.canvas = document.getElementById("rescue-map");
    this.context = this.canvas.getContext("2d");
    this.canvas.addEventListener("pointerdown", (event) => {
      if (!game.rescue || game.paused) return;
      const r = this.canvas.getBoundingClientRect();
      const x = ((event.clientX - r.left) / r.width) * this.canvas.width;
      const y = ((event.clientY - r.top) / r.height) * this.canvas.height;
      let selected = -1,
        best = 26;
      game.rescue.soldiers.forEach((s, i) => {
        const p = this.mapPoint(s.position);
        const d = Math.hypot(p.x - x, p.y - y);
        if (!s.rescued && d < best) {
          best = d;
          selected = i;
        }
      });
      if (selected >= 0) game.rescue.select(selected);
    });
    document.getElementById("next-signal").onclick = () => {
      const r = game.rescue;
      if (!r) return;
      for (let n = 1; n <= r.soldiers.length; n++) {
        const index = (r.selected + n) % r.soldiers.length;
        if (!r.soldiers[index].rescued) {
          r.select(index);
          break;
        }
      }
    };
  }

  mapPoint(p) {
    const b = this.game.rescue.layout.bounds;
    return {
      x: 14 + ((p.x - b.left) / (b.right - b.left)) * (this.canvas.width - 28),
      y: 12 + ((p.z - b.far) / (b.near - b.far)) * (this.canvas.height - 24),
    };
  }

  update(state) {
    const r = state.rescue;
    if (!r) return;
    const $ = (id) => document.getElementById(id);
    $("rescue-signal").textContent = r.objective.name;
    $("rescue-distance").textContent = `${Math.round(r.distance)} m`;
    $("rescue-status").textContent = r.state;
    $("rescue-count").textContent = `${r.rescued} / ${r.total}`;
    $("rocket-stock").textContent = r.gear.rockets;
    $("guided-stock").textContent = r.gear.guided;
    $("flare-stock").textContent = r.gear.flares;
    $("flare-action").disabled =
      r.gear.flares === 0 || r.flareCooldown > 0 || state.status !== "playing";
    $("rocket-weapon").disabled = r.gear.rockets <= 0;
    $("guided-weapon").disabled = r.gear.guided <= 0;
    this.draw();
  }

  draw() {
    const g = this.game,
      r = g.rescue,
      c = this.context,
      w = this.canvas.width,
      h = this.canvas.height;
    c.clearRect(0, 0, w, h);
    c.fillStyle = "#264a46";
    c.fillRect(0, 0, w, h);
    const map = r.layout.map;
    c.fillStyle = "#368b92";
    c.beginPath();
    const left = [],
      right = [];
    for (let z = r.layout.bounds.near; z >= r.layout.bounds.far; z -= 4) {
      const river = riverAt(map, z);
      left.push(this.mapPoint({ x: river.x - river.width / 2, z }));
      right.push(this.mapPoint({ x: river.x + river.width / 2, z }));
    }
    [...left, ...right.reverse()].forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.closePath();
    c.fill();
    c.strokeStyle = "#e9c98c88";
    c.lineWidth = 2;
    c.beginPath();
    map.road.forEach(([x, z], i) => {
      const p = this.mapPoint({ x, z });
      if (i) c.lineTo(p.x, p.y);
      else c.moveTo(p.x, p.y);
    });
    c.stroke();
    c.strokeStyle = "#c6e6d618";
    c.lineWidth = 1;
    for (let y = 18; y < h; y += 32) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }
    const player = this.mapPoint(g.player.position),
      objective = this.mapPoint(r.objective());
    c.strokeStyle = "#ffdb83";
    c.setLineDash([3, 4]);
    c.beginPath();
    c.moveTo(player.x, player.y);
    c.lineTo(objective.x, objective.y);
    c.stroke();
    c.setLineDash([]);
    for (const e of g.entities) {
      if (!isHostileEntity(e) || e.position.distanceTo(g.player.position) > 48) continue;
      const p = this.mapPoint(e.position);
      c.fillStyle = "#ff8a74";
      c.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    r.soldiers.forEach((s, i) => {
      const p = this.mapPoint(s.position);
      c.fillStyle = s.rescued ? "#688780" : "#9bffc8";
      c.beginPath();
      c.arc(p.x, p.y, 4, 0, Math.PI * 2);
      c.fill();
      if (i === r.selected && !s.rescued) {
        c.strokeStyle = "#ffdb83";
        c.beginPath();
        c.arc(p.x, p.y, 7, 0, Math.PI * 2);
        c.stroke();
      }
      c.font = "bold 9px Arial";
      c.fillStyle = "#eff9e6";
      c.fillText(String(i + 1), p.x + 7, p.y + 3);
    });
    // Where the sortie started (cyan) and where it lands (gold).
    const start = this.mapPoint(r.layout.start);
    c.fillStyle = "#7fe8ff";
    c.fillRect(start.x - 3, start.y - 3, 6, 6);
    const base = this.mapPoint(r.layout.landing);
    c.fillStyle = "#ffdb83";
    c.fillRect(base.x - 4, base.y - 4, 8, 8);
    c.fillStyle = "#fff";
    c.beginPath();
    c.moveTo(player.x, player.y - 6);
    c.lineTo(player.x + 4, player.y + 4);
    c.lineTo(player.x, player.y + 2);
    c.lineTo(player.x - 4, player.y + 4);
    c.closePath();
    c.fill();
  }
}
