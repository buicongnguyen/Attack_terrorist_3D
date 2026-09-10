export const MODELS = [
  "boat",
  "helicopter",
  "plane",
  "enemy",
  "cannon",
  "launcher",
  "mine",
  "missile-friendly",
  "missile-enemy",
  "palm",
  "rock",
  "supply",
  "beacon",
  "pickup-health",
  "pickup-star",
  "pickup-gun",
  "pickup-medal",
  "rescue-soldier",
  "aa-truck",
  "drone",
];

export const ASSET_REVISION = "rescue-3";

export const CHAPTERS = [
  {
    name: "Breakwater",
    label: "Precision strike",
    icon: "plane",
    color: "#f5cb67",
  },
  { name: "Relief Run", label: "River escort", icon: "ship", color: "#7ae0d7" },
  {
    name: "Last Light",
    label: "Search and rescue",
    icon: "helicopter",
    color: "#f4a18a",
  },
];

export const MISSIONS = [
  {
    chapter: 0,
    name: "First Light",
    enemies: 1,
    bombs: 2,
    floors: 2,
    width: 10,
    text: "Kestrel, this is Iona. The first relay is ahead. Clear the garrison and open our route inland.",
  },
  {
    chapter: 0,
    name: "Concrete Echo",
    enemies: 1,
    bombs: 2,
    floors: 3,
    width: 10,
    text: "The relay crew has moved downstairs. Set the drill for the deeper floors.",
  },
  {
    chapter: 0,
    name: "Low Road",
    enemies: 1,
    bombs: 2,
    floors: 2,
    width: 12,
    text: "Reinforced foundations ahead. A delayed detonation will reach the lower room.",
  },
  {
    chapter: 0,
    name: "Relay House",
    enemies: 3,
    bombs: 2,
    floors: 2,
    width: 12,
    text: "Three guards, two pods. Place the blast between them. The relief launch is waiting.",
  },
  {
    chapter: 0,
    name: "Crosswind",
    enemies: 6,
    bombs: 3,
    floors: 3,
    width: 14,
    text: "Two occupied floors. Watch the carrier and make each release count.",
  },
  {
    chapter: 0,
    name: "The Last Relay",
    enemies: 10,
    bombs: 5,
    floors: 3,
    width: 16,
    text: "This is the final relay. Clear it and the canal gates are ours.",
  },
  {
    chapter: 1,
    name: "Green Channel",
    duration: 45,
    speed: 3.1,
    fireRate: 3.4,
    text: "Relay silent. Take the relief launch upriver. The beacon must reach the mountain station.",
  },
  {
    chapter: 1,
    name: "Narrow Passage",
    duration: 55,
    speed: 3.6,
    fireRate: 2.9,
    text: "Launchers cover both banks. Their ammunition stores are a useful weak point.",
  },
  {
    chapter: 1,
    name: "Beacon Delivery",
    duration: 65,
    speed: 4.0,
    fireRate: 2.5,
    text: "The station is just beyond the bend. Keep moving. Medical supplies are drifting downstream.",
  },
  {
    chapter: 2,
    name: "Hidden Signals",
    team: 2,
    text: "Two soldiers are stranded beyond the river. Follow their signals, clear each pickup zone, and bring them back to the southern base.",
  },
  {
    chapter: 2,
    name: "Stone Choir",
    team: 3,
    text: "Three signals across the valley. Anti-air patrols control the crossings. Supplies remain at the abandoned aid stations.",
  },
  {
    chapter: 2,
    name: "Clear Skies",
    team: 4,
    text: "The last soldier is beyond North Ridge. Manage your missiles, evade the drone patrols, and return the entire team to base.",
  },
];

export const DEFAULT_LOADOUT = Object.freeze({
  type: "drill",
  path: "ballistic",
  angle: 0,
  speed: 8,
  fuse: 1.8,
  walls: 3,
});
export const STEP = 1 / 120;
export const GRAVITY = -9.81;
export const SHOT_INTERVAL = 0.24;
export const COLORS = {
  friendly: 0x8affef,
  hostile: 0xff705f,
  gold: 0xffd36b,
  concrete: 0xe0e2d2,
  green: 0x77a479,
  dark: 0x25434a,
};

export function missionNumber(index) {
  const chapter = MISSIONS[index].chapter;
  return index - MISSIONS.findIndex((m) => m.chapter === chapter) + 1;
}

export function saveResult(records, index, score, stars) {
  const old = records[index] || { score: 0, stars: 0 };
  return {
    ...records,
    [index]: {
      score: Math.max(old.score, score),
      stars: Math.max(old.stars, stars),
    },
  };
}

export function damageShields(shields, sector, amount = 1) {
  const result = [...shields];
  const absorbed = Math.min(result[sector], amount);
  result[sector] -= absorbed;
  return { shields: result, breached: amount > absorbed };
}
