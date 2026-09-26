// Rounds for the main gun (2.7). Marlin's deck gun and Lantern's chin gun always fire the
// strongest rounds in stock and drop back a grade when a magazine runs dry; standard rounds
// never run out. `damage` multiplies the gun's own damage (2 on Marlin, 1 on Lantern).
export const ROUNDS = Object.freeze({
  standard: { name: "STANDARD", short: "STD", damage: 1, magazine: Infinity, color: null },
  ap: { name: "AP ROUNDS", short: "AP", damage: 2, magazine: 60, color: 0xffb13b },
  // High explosive: as hard as AP, and each round bursts on whatever stands close by.
  he: { name: "HE ROUNDS", short: "HE", damage: 2, magazine: 45, color: 0xff6a2b, splash: 2.4, splashDamage: 1 },
  // Plasma bolts hit hardest and carry on through up to three targets in a line.
  plasma: { name: "PLASMA", short: "PLASMA", damage: 3, magazine: 40, color: 0xc77dff, pierce: 3 },
});

// Strongest first.
export const ROUND_ORDER = Object.freeze(["plasma", "he", "ap", "standard"]);

// A stock holds at most two magazines of each kind.
export const MAX_MAGAZINES = 2;

export const emptyRounds = () => ({ ap: 0, he: 0, plasma: 0 });

export function bestRound(stock) {
  return ROUND_ORDER.find((kind) => kind === "standard" || (stock?.[kind] ?? 0) > 0);
}

// Fire one round: the strongest in stock. Returns the kind fired and the stock left.
export function spendRound(stock) {
  const kind = bestRound(stock);
  return { kind, stock: kind === "standard" ? { ...stock } : { ...stock, [kind]: stock[kind] - 1 } };
}

export function addRounds(stock, kind, count = ROUNDS[kind].magazine) {
  if (!ROUNDS[kind] || kind === "standard") return { ...stock };
  const cap = ROUNDS[kind].magazine * MAX_MAGAZINES;
  return { ...stock, [kind]: Math.min(cap, (stock?.[kind] ?? 0) + count) };
}

// What one round does with a gun of the given base damage.
export function roundEffect(kind, base) {
  const spec = ROUNDS[kind] || ROUNDS.standard;
  return {
    kind,
    damage: base * spec.damage,
    splash: spec.splash || 0,
    splashDamage: spec.splash ? base * spec.splashDamage : 0,
    pierce: spec.pierce || 1,
    color: spec.color,
  };
}
