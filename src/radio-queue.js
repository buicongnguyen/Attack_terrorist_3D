// The radio director (5.1 N1): which radio lines are on screen, and for how long. Pure: no DOM and
// no clock of its own. The frame loop ticks it after every fixed step while the game runs, and the
// golden harness ticks it the same way (1/120 s per step), so its log is time-true.
//
// - A line's priority comes from its radio key: story 2, tactical 1, chatter 0 (default 1).
// - Each line stays up at least 1 s + words / 3.5 s (at most HOLD), and leaves after HOLD unless
//   a waiting line needs its slot sooner. No line is displaced before its minimum.
// - The same text said again within DEDUPE seconds is dropped.
// - Story lines are never dropped: the queue grows for them. With more than MAX_WAITING lines
//   waiting, chatter goes first, then tactical lines waiting longer than STALE seconds.
// tick() allocates nothing.

export const STORY = 2;
export const TACTICAL = 1;
export const CHATTER = 0;
const RADIO_PRIORITY = Object.freeze({
  success: STORY,
  pickup: STORY,
  intercept: STORY,
  freed: STORY,
  bargeLost: STORY,
  boss: STORY,
  stall: STORY,
  rage: STORY,
  bossDown: STORY,
  quota: STORY,
  lastRun: STORY,
  multi: CHATTER,
  aa: CHATTER,
  drums: CHATTER,
  siteSilent: CHATTER,
  strikeGain: CHATTER,
  heliOut: CHATTER,
  allyOut: CHATTER,
});
export const HOLD = 7.8;
export const DEDUPE = 20;
const MAX_WAITING = 4;
const STALE = 6;

export const priorityOf = (key) => RADIO_PRIORITY[key] ?? TACTICAL;
export const wordCount = (text) => text.trim().split(/\s+/).length;
export const minimumFor = (text) => Math.min(HOLD, 1 + wordCount(text) / 3.5);

// Remove arr[i] in place (splice would allocate the removed list).
function removeAt(arr, i) {
  for (let j = i; j < arr.length - 1; j++) arr[j] = arr[j + 1];
  arr.length--;
}

const round = (x) => Math.round(x * 100) / 100;

export class RadioDirector {
  constructor(slots = 3) {
    this.slots = slots;
    this.version = 0;
    this.clear();
  }

  // A new mission: nothing on screen, nothing waiting, an empty log.
  clear() {
    this.time = 0;
    this.shown = [];
    this.waiting = [];
    this.log = [];
    this.lastSaid = new Map();
    this.version++;
  }

  // Desktop shows 3 lines at once, the phones' ticker 1. Lines over the new count wait their minimum.
  setSlots(n) {
    if (n === this.slots) return;
    this.slots = n;
    this.pump();
  }

  say(line, key) {
    const t = this.time;
    const entry = { line, key, priority: priorityOf(key), said: t, shownAt: -1, left: -1, min: minimumFor(line.text), outcome: null };
    this.log.push(entry);
    const last = this.lastSaid.get(line.text);
    if (last !== undefined && t - last < DEDUPE) {
      entry.outcome = "dupe";
      return entry;
    }
    this.lastSaid.set(line.text, t);
    this.waiting.push(entry);
    this.pump();
    return entry;
  }

  tick(dt) {
    this.time += dt;
    this.pump();
  }

  pump() {
    const t = this.time;
    for (let i = this.shown.length - 1; i >= 0; i--) if (t - this.shown[i].shownAt >= HOLD) this.retire(i, "shown");
    while (this.waiting.length) {
      if (this.shown.length >= this.slots) {
        const i = this.displaceable();
        if (i < 0) break;
        this.retire(i, "displaced");
        continue;
      }
      const next = this.next();
      const entry = this.waiting[next];
      removeAt(this.waiting, next);
      entry.shownAt = t;
      this.shown.push(entry);
      this.version++;
    }
    this.trim();
  }

  // The waiting line to show next: the highest priority, then the oldest.
  next() {
    let best = 0;
    for (let i = 1; i < this.waiting.length; i++) if (this.waiting[i].priority > this.waiting[best].priority) best = i;
    return best;
  }

  // The line up longest that has had its minimum, or -1.
  displaceable() {
    let pick = -1;
    for (let i = 0; i < this.shown.length; i++) {
      const e = this.shown[i];
      if (this.time - e.shownAt >= e.min && (pick < 0 || e.shownAt < this.shown[pick].shownAt)) pick = i;
    }
    return pick;
  }

  retire(i, outcome) {
    const entry = this.shown[i];
    entry.left = this.time;
    entry.outcome = outcome;
    removeAt(this.shown, i);
    this.version++;
  }

  // Too many waiting: drop chatter, then stale tactical lines, oldest first. Never a story line.
  trim() {
    while (this.waiting.length > MAX_WAITING) {
      let drop = -1;
      for (let i = 0; i < this.waiting.length && drop < 0; i++) if (this.waiting[i].priority === CHATTER) drop = i;
      for (let i = 0; i < this.waiting.length && drop < 0; i++) {
        const e = this.waiting[i];
        if (e.priority === TACTICAL && this.time - e.said > STALE) drop = i;
      }
      if (drop < 0) return;
      this.waiting[drop].outcome = "dropped";
      removeAt(this.waiting, drop);
    }
  }

  // The newest lines shown, newest first: what the phones' ticker lists when it is opened.
  recent(n = 3) {
    return this.log
      .filter((e) => e.shownAt >= 0)
      .sort((a, b) => b.shownAt - a.shownAt || b.said - a.said)
      .slice(0, n);
  }

  // The log as golden rows keep it: [said, shown, who, key, held], times in seconds (hundredths).
  // held is the time on screen, or 'open' (still up), 'waiting', 'dropped' or 'dupe'.
  record() {
    return this.log.map((e) => [
      round(e.said),
      e.shownAt < 0 ? null : round(e.shownAt),
      e.line.who,
      e.key,
      e.outcome === "shown" || e.outcome === "displaced" ? round(e.left - e.shownAt) : e.outcome ?? (e.shownAt < 0 ? "waiting" : "open"),
    ]);
  }
}
