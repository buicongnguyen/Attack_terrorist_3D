// Edge markers (5.1 H1): chevrons on the border of the free play rect pointing at threats that
// are outside it (canal guns and launchers above the frame, valley missiles and launch crews,
// Marrow, key hulls). A fixed pool of DOM nodes: tracking, untracking and placing allocate
// nothing per frame, and a point inside the rect shows no chevron.
import { createElement, ChevronUp } from "lucide";

// What each kind says when the caller passes no text of its own.
const KIND_TEXT = {
  gun: "GUN AIMING",
  launcher: "LAUNCHER",
  missile: "MISSILE",
  launch: "LAUNCH",
  boss: "MARROW",
  key: "KEY SHIP",
};
// A marker's box: the chevron over an 11 px label, kept fully inside the free rect.
export const MARKER = { width: 76, height: 42 };
// Screen distance beyond the rect's edge (CSS px) at which the pulse slows down.
const NEAR = 140,
  FAR = 420;

// The largest rectangle of the viewport that no HUD rect overlaps, among the rectangles bounded
// by the viewport and the HUD rects' edges, preferring those that hold the screen centre (the
// action) over any larger one beside it. `out` is filled and returned.
export function freeRectOf(rects, width, height, out = { left: 0, top: 0, right: 0, bottom: 0 }) {
  const lefts = [0],
    rights = [width],
    tops = [0],
    bottoms = [height];
  for (const r of rects) {
    if (r.right > 0 && r.right < width) lefts.push(r.right);
    if (r.left > 0 && r.left < width) rights.push(r.left);
    if (r.bottom > 0 && r.bottom < height) tops.push(r.bottom);
    if (r.top > 0 && r.top < height) bottoms.push(r.top);
  }
  const cx = width / 2,
    cy = height / 2;
  let best = -1,
    bestCentre = false;
  for (const left of lefts)
    for (const right of rights) {
      if (right - left < 1) continue;
      for (const top of tops)
        for (const bottom of bottoms) {
          if (bottom - top < 1) continue;
          const area = (right - left) * (bottom - top);
          const centre = cx >= left && cx <= right && cy >= top && cy <= bottom;
          if ((bestCentre && !centre) || (centre === bestCentre && area <= best)) continue;
          let clear = true;
          for (const r of rects)
            if (r.left < right && r.right > left && r.top < bottom && r.bottom > top) {
              clear = false;
              break;
            }
          if (!clear) continue;
          best = area;
          bestCentre = centre;
          out.left = left;
          out.right = right;
          out.top = top;
          out.bottom = bottom;
        }
    }
  if (best < 0) Object.assign(out, { left: 0, top: 0, right: width, bottom: height });
  return out;
}

// Where a marker for the screen point (x, y) sits: the centre of a `w` x `h` box on the border of
// `rect`, along the line from the rect's centre to the point. Fills `out` with the box centre, the
// direction (radians, 0 = up, clockwise) and how far beyond the border the point lies.
export function borderPlacement(rect, x, y, w, h, out) {
  const cx = (rect.left + rect.right) / 2,
    cy = (rect.top + rect.bottom) / 2;
  const hw = Math.max(0, (rect.right - rect.left - w) / 2),
    hh = Math.max(0, (rect.bottom - rect.top - h) / 2);
  const dx = x - cx,
    dy = y - cy;
  // Scale the direction until it meets the inset rect's edge.
  const sx = dx === 0 ? Infinity : hw / Math.abs(dx),
    sy = dy === 0 ? Infinity : hh / Math.abs(dy);
  const s = Math.min(sx, sy, 1e9);
  out.x = cx + dx * s;
  out.y = cy + dy * s;
  out.angle = Math.atan2(dx, -dy);
  // Distance outside the rect itself (0 when inside).
  const ox = Math.max(rect.left - x, 0, x - rect.right),
    oy = Math.max(rect.top - y, 0, y - rect.bottom);
  out.beyond = Math.hypot(ox, oy);
  return out;
}

export const outside = (rect, x, y) => x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;

export class EdgeMarkers {
  constructor(container, size = 8) {
    this.container = container;
    this.slots = [];
    this.tick = 0;
    this.projected = { x: 0, y: 0, visible: false };
    this.place = { x: 0, y: 0, angle: 0, beyond: 0 };
    for (let i = 0; i < size; i++) {
      const el = document.createElement("div");
      el.className = "edge-marker";
      const chevron = createElement(ChevronUp);
      chevron.classList.add("lucide", "lucide-chevron-up");
      const label = document.createElement("span");
      el.append(chevron, label);
      container.append(el);
      this.slots.push({ el, chevron, label, id: null, point: null, kind: "", text: "", seen: -1, shown: false, x: NaN, y: NaN, angle: NaN, band: "" });
    }
  }

  // Follow `point` (anything with x, y, z, read again every frame) under `id`. `text` replaces the
  // kind's own label. When every slot is taken the newcomer waits for a free one.
  track(id, point, kind, text = KIND_TEXT[kind] || "") {
    let free = null;
    for (const slot of this.slots) {
      if (slot.id === id) {
        free = slot;
        break;
      }
      if (!free && slot.id === null) free = slot;
    }
    if (!free) return false;
    free.id = id;
    free.point = point;
    free.kind = kind;
    free.text = text;
    free.seen = this.tick;
    return true;
  }

  untrack(id) {
    for (const slot of this.slots)
      if (slot.id === id) {
        slot.id = null;
        slot.point = null;
      }
  }

  // One frame's tracking: begin(), track() what is outside, end() drops whatever was not tracked.
  begin() {
    this.tick++;
  }

  end() {
    for (const slot of this.slots)
      if (slot.id !== null && slot.seen !== this.tick) {
        slot.id = null;
        slot.point = null;
      }
  }

  // Projects every tracked point and puts its chevron on the border of `rect` (CSS px), or hides
  // it while the point is inside. Writes only what changed.
  update(view, rect) {
    for (const slot of this.slots) {
      let show = false;
      if (slot.id !== null && rect) {
        const p = view.projectInto(this.projected, slot.point);
        show = p.visible && outside(rect, p.x, p.y);
        if (show) {
          const at = borderPlacement(rect, p.x, p.y, MARKER.width, MARKER.height, this.place);
          const x = Math.round(at.x - MARKER.width / 2),
            y = Math.round(at.y - MARKER.height / 2),
            angle = Math.round((at.angle * 180) / Math.PI);
          if (x !== slot.x || y !== slot.y) {
            slot.x = x;
            slot.y = y;
            slot.el.style.transform = `translate(${x}px, ${y}px)`;
          }
          if (angle !== slot.angle) {
            slot.angle = angle;
            slot.chevron.style.transform = `rotate(${angle}deg)`;
          }
          const band = at.beyond < NEAR ? "near" : at.beyond < FAR ? "mid" : "far";
          if (band !== slot.band) {
            slot.band = band;
            slot.el.dataset.pulse = band;
          }
          if (slot.label.textContent !== slot.text) slot.label.textContent = slot.text;
          if (slot.el.dataset.kind !== slot.kind) slot.el.dataset.kind = slot.kind;
        }
      }
      if (show !== slot.shown) {
        slot.shown = show;
        slot.el.style.visibility = show ? "visible" : "hidden";
      }
    }
  }

  clear() {
    for (const slot of this.slots) {
      slot.id = null;
      slot.point = null;
      if (slot.shown) {
        slot.shown = false;
        slot.el.style.visibility = "hidden";
      }
    }
  }
}
