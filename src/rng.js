// mulberry32: a small, fast seeded random source. Missions draw from it through game.random
// (difficulty.js), and cosmetic systems (the city, harbour scatter, wildlife, valley terrain)
// each keep one of their own, so scripted runs replay exactly.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
