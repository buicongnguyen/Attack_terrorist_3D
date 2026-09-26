// Difficulty (2.5). Easy is the default and really is easy; each harder mode pulls the same few
// levers across all three chapters, so a mission plays the same way, only more or less kindly.

export const DIFFICULTIES = ["easy", "normal", "hard", "crazy"];
export const DEFAULT_DIFFICULTY = "easy";

export const DIFFICULTY = Object.freeze({
  easy: {
    label: "Easy",
    blurb: "More bombs and rockets, bigger blasts, and enemy fire that rarely lands.",
    bombs: 1.5,
    power: 1.15,
    assist: 1.3,
    hit: 1,
    hitFloor: 0,
    enemyReload: 1.35,
    enemyDamage: 0.6,
    bargeHp: 1.5,
    rockets: 1.5,
    strikes: 3,
    score: 1,
  },
  normal: {
    label: "Normal",
    blurb: "The payloads the missions were designed with; enemy fire lands now and then.",
    bombs: 1,
    power: 1,
    assist: 1,
    hit: 3,
    hitFloor: 0.05,
    enemyReload: 1,
    enemyDamage: 1,
    bargeHp: 1,
    rockets: 1,
    strikes: 2,
    score: 1.25,
  },
  hard: {
    label: "Hard",
    blurb: "Fewer bombs, less homing, and enemy fire that finds you if you hold your course.",
    bombs: 0.8,
    power: 0.9,
    assist: 0.6,
    hit: 6,
    hitFloor: 0.15,
    enemyReload: 0.8,
    enemyDamage: 1.25,
    bargeHp: 0.85,
    rockets: 0.75,
    strikes: 1,
    score: 1.5,
  },
  crazy: {
    label: "Crazy",
    blurb: "Scarce bombs and little mercy: most rounds that reach you hit.",
    bombs: 0.65,
    power: 0.8,
    assist: 0.3,
    hit: 12,
    hitFloor: 0.4,
    enemyReload: 0.6,
    enemyDamage: 1.6,
    bargeHp: 0.7,
    rockets: 0.5,
    strikes: 1,
    score: 2,
  },
});

export function difficulty(name) {
  return DIFFICULTY[name] || DIFFICULTY[DEFAULT_DIFFICULTY];
}

// Chance, on Easy, that enemy fire reaching you actually hurts, per mission (by index): nothing
// can hit you in the first two city missions or the first two canal missions, then a few per cent
// more each mission (the harbour and the rescue start at 5 %). City 1.1-1.6, harbour 1.7-1.9,
// canal 2.1-2.6, rescue 3.1-3.3. (`enemyReload` multiplies the enemy's reload time.)
export const BASE_HIT = Object.freeze([
  0, 0, 0.03, 0.05, 0.05, 0.08, 0.05, 0.05, 0.08, 0, 0, 0.05, 0.05, 0.08, 0.1, 0.05, 0.08, 0.1,
]);

// The chance for mission `index` in mode `name`: never more than certain.
export function hitChance(index, name) {
  const mode = difficulty(name);
  return Math.min(1, (BASE_HIT[index] ?? 0.1) * mode.hit + mode.hitFloor);
}

// A strike payload for the mode: every bomb type keeps at least one.
export function scalePayload(payload, name) {
  const k = difficulty(name).bombs;
  return Object.fromEntries(Object.entries(payload).map(([kind, n]) => [kind, Math.max(1, Math.round(n * k))]));
}

// A percentage for the HUD: "5%", "0%", "100%".
export function percent(chance) {
  return `${Math.round(chance * 100)}%`;
}

// Deterministic randomness per mission, so scripted runs and tests repeat exactly.
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
