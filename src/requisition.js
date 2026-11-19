// Requisition (5.0): stars become points to spend between missions. Six upgrades, two per vehicle,
// two levels each. 45 points buy everything and the campaign offers at most 57, so players choose a
// build. A fresh save has no upgrades, so nothing changes until the player buys something.

export const UPGRADES = Object.freeze([
  { id: "ordnance", chapter: 0, name: "Spare ordnance", blurb: "+1 bomb of every type per aircraft, per level.", costs: [3, 6] },
  { id: "blast", chapter: 0, name: "Wide-bore charges", blurb: "Blasts reach 8% further, per level.", costs: [2, 4] },
  { id: "plating", chapter: 1, name: "Barge plating", blurb: "Barges take 15% more damage before sinking, per level.", costs: [3, 6] },
  { id: "pods", chapter: 1, name: "Rocket pods", blurb: "30% more rockets aboard Marlin, per level.", costs: [2, 4] },
  { id: "flares", chapter: 2, name: "Flare rack", blurb: "+2 flares for Lantern, per level.", costs: [2, 4] },
  { id: "racks", chapter: 2, name: "Ammunition racks", blurb: "+4 rockets and +2 guided missiles, per level.", costs: [3, 6] },
]);

const BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

// Stars banked: the best result of every mission.
export const earned = (records) => Object.values(records || {}).reduce((sum, r) => sum + (Number.isFinite(r?.stars) ? Math.max(0, Math.min(3, r.stars)) : 0), 0);

// A save's upgrade levels, cleaned: known ids only, whole levels within range.
export function sanitize(levels) {
  const out = {};
  for (const u of UPGRADES) {
    const n = Math.floor(Number(levels?.[u.id]));
    if (Number.isFinite(n) && n > 0) out[u.id] = Math.min(u.costs.length, n);
  }
  return out;
}

export const level = (levels, id) => sanitize(levels)[id] || 0;

export const spent = (levels) => UPGRADES.reduce((sum, u) => sum + u.costs.slice(0, level(levels, u.id)).reduce((a, b) => a + b, 0), 0);

export const available = (records, levels) => Math.max(0, earned(records) - spent(levels));

// The cost of the next level of an upgrade, or null at its top level.
export const nextCost = (id, levels) => BY_ID[id]?.costs[level(levels, id)] ?? null;

export function canBuy(id, records, levels) {
  const cost = nextCost(id, levels);
  return cost !== null && cost <= available(records, levels);
}

// The levels after buying one level of `id`, or null when it cannot be bought.
export function buy(id, records, levels) {
  if (!canBuy(id, records, levels)) return null;
  return { ...sanitize(levels), [id]: level(levels, id) + 1 };
}

// What the levels do in a mission, as plain numbers the game applies at its start.
export function bonuses(levels) {
  const l = (id) => level(levels, id);
  return {
    bombs: l("ordnance"),
    power: 1 + 0.08 * l("blast"),
    bargeHp: 1 + 0.15 * l("plating"),
    rockets: 1 + 0.3 * l("pods"),
    flares: 2 * l("flares"),
    heliRockets: 4 * l("racks"),
    heliGuided: 2 * l("racks"),
  };
}
