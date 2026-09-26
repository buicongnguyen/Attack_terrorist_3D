export const MODELS = [
  "boat",
  "helicopter",
  "bomber",
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
  "bomb-penetrator",
  "bomb-cluster",
  "bomb-blast",
  "bomb-guided",
  "bomblet",
  "aa-nest",
  "relay-mast",
  "roof-tank",
  "roof-hvac",
  "car",
  "technical",
  "barricade",
  "street-tree",
  "streetlight",
  "barge",
  "skiff",
  "fuel-drums",
  "gate-tower",
  "lock-gate",
  "jungle-tree",
  "stilt-house",
  "patrol-boat",
  "missile-boat",
  "frigate",
  "destroyer",
  "ferry",
  "harbour-crane",
  "buoy",
  "container-stack",
  "gunship",
  "escort-boat",
  // 2.7: launchers, trucks and stations for the valleys; barracks and bank dressing.
  "missile-truck",
  "missile-site",
  "drone-pad",
  "barracks-hut",
  "pine",
  "log-pile",
  "shed",
  "reeds",
  "shrub",
];

export const ASSET_REVISION = "frontier-1";

export const CHAPTERS = [
  { name: "Breakwater", label: "City and harbour strikes", icon: "plane", color: "#ffc62b" },
  { name: "Relief Run", label: "River convoy", icon: "ship", color: "#33d69f" },
  { name: "Last Light", label: "Valley rescue", icon: "helicopter", color: "#ff8a6b" },
];

export const MISSIONS = [
  { chapter: 0, name: "Wake-Up Call" },
  { chapter: 0, name: "Floors Below" },
  { chapter: 0, name: "Shift Change" },
  { chapter: 0, name: "Flak Alley" },
  { chapter: 0, name: "Scatter" },
  { chapter: 0, name: "The Glass Tower" },
  { chapter: 0, name: "Harbour Mouth" },
  { chapter: 0, name: "Dry Dock" },
  { chapter: 0, name: "The Ring" },
  { chapter: 1, name: "Mangrove Mile" },
  { chapter: 1, name: "The Narrows" },
  { chapter: 1, name: "Floodplain" },
  { chapter: 1, name: "Sawmill Reach" },
  { chapter: 1, name: "The Cut" },
  { chapter: 1, name: "Lock Gate" },
  {
    chapter: 2,
    name: "Hidden Signals",
    team: 2,
    crew: ["Cpl. Kofi Mensah", "Medic Lin Tao"],
  },
  {
    chapter: 2,
    name: "Broken Crossing",
    team: 3,
    crew: ["Pvt. Sam Hart", "Spc. Ada Okoro", "Pvt. Noor Haddad"],
  },
  {
    chapter: 2,
    name: "Last Light",
    team: 4,
    crew: ["Pvt. Teo Brandt", "Spc. Juno Park", "Pvt. Pell Ashby", "Sgt. Mara Reyes"],
  },
];

export const STEP = 1 / 120;
export const GRAVITY = -9.81;
export const SHOT_INTERVAL = 0.24;
export const COLORS = {
  friendly: 0x7fe8ff,
  hostile: 0xff4b2b,
  gold: 0xffc62b,
  concrete: 0xf0d7aa,
  green: 0x5cbf45,
  dark: 0x173a6b,
};

export function missionNumber(index) {
  const chapter = MISSIONS[index].chapter;
  return index - MISSIONS.findIndex((m) => m.chapter === chapter) + 1;
}

// Index of the first mission in a chapter.
export function chapterStart(chapter) {
  return MISSIONS.findIndex((m) => m.chapter === chapter);
}

export function chapterSize(chapter) {
  return MISSIONS.filter((m) => m.chapter === chapter).length;
}

// Saves number missions by index. A v2 save predates the three harbour missions inserted after
// 1.6; a v3 save predates the three canal missions inserted before Lock Gate (its index 11).
// Each insertion moves the records at and after it up by three.
const INSERTED = [
  [6, 3],
  [11, 3],
];
export function migrateSave(saved, version = 2) {
  let records = { ...(saved?.records || {}) };
  for (const [at, count] of INSERTED.slice(version - 2)) {
    const moved = {};
    for (const [key, value] of Object.entries(records)) moved[+key >= at ? +key + count : +key] = value;
    records = moved;
  }
  return { ...saved, records };
}

// The campaign resumes at the first mission without a record (the start once all are done).
export function firstOpenMission(records) {
  const index = MISSIONS.findIndex((_, i) => !records?.[i]);
  return index < 0 ? 0 : index;
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
