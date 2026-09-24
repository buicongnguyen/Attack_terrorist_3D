// Campaign narrative: one villain, one ticking clock, and a reason for every mechanic.
// Chapter 1 breaks the jamming network and recovers the override key's location,
// Chapter 2 delivers the engineers to the Tidelock, Chapter 3 brings the key home.

export const CAST = Object.freeze({
  iona: {
    name: "Cmdr. Iona Vale",
    role: "Kestrel Actual",
    initials: "IV",
    color: "#ffc62b",
  },
  echo: {
    name: "Sgt. Mara Reyes",
    role: "Echo recon",
    initials: "ER",
    color: "#33d69f",
  },
  piper: {
    name: "Piper",
    role: "Kestrel Two",
    initials: "K2",
    color: "#ff8a6b",
  },
  bram: {
    name: "Bram",
    role: "Kestrel Three",
    initials: "K3",
    color: "#7fd8ff",
  },
  okafor: {
    name: "Dr. Anselm Okafor",
    role: "Tidelock engineer",
    initials: "AO",
    color: "#f7f1e1",
  },
  kofi: {
    name: "Cpl. Kofi Mensah",
    role: "Echo radio",
    initials: "KM",
    color: "#8fd64a",
  },
  marrow: {
    name: "Marrow",
    role: "Ashen Front / intercept",
    initials: "M",
    color: "#ff4b2b",
    hostile: true,
  },
});

export const PROLOGUE = {
  eyebrow: "MERIDIA ARCHIPELAGO / T-36 HOURS",
  title: "The city that lives below the sea",
  paragraphs: [
    "Solace Harbor sits three metres below the tide. Only the Tidelock, a storm barrier across the mouth of the Verde River, keeps it dry.",
    "Its designer, an engineer the city blamed for the old sea wall's collapse, now calls himself Marrow. His Ashen Front has seized the Glass District, jammed every radio, and marched on Highwater Station, where the barrier is controlled.",
    "Typhoon Ilse makes landfall tomorrow at last light. Marrow will hold the gates open when the surge peaks unless someone stops him. You fly for the Kestrel Response Unit: strike aircraft, a river gunboat, and a rescue helicopter.",
  ],
  action: "Begin Operation Breakwater",
};

export const CHAPTER_STORY = [
  {
    title: "Breakwater",
    subtitle: "Glass District air strikes",
    place: "GLASS DISTRICT / SOLACE HARBOR",
    clock: "T-36H / 06:40",
    intro:
      "The Front's jammers blind the whole harbour. Echo recon is hidden inside the district and can read their patrol schedules. Lead Kestrel Flight over the towers and strike when they gather.",
  },
  {
    title: "Relief Run",
    subtitle: "Verde River convoy",
    place: "VERDE RIVER / SOUTH DELTA",
    clock: "T-20H / 14:10",
    intro:
      "With the jammers down, Dr. Okafor's engineers can sail for Highwater Station. Their barges carry the pumps and the crew who can close the Tidelock. The Front will try to sink them before they reach the lock.",
  },
  {
    title: "Last Light",
    subtitle: "Cinder Valley rescue",
    place: "CINDER VALLEY / NORTH OF HIGHWATER",
    clock: "T-6H / 16:45",
    intro:
      "Highwater is ours, but the gates will not move without the master override key. Echo team took it from the Glass Tower and was scattered across the valley. Bring them home before last light.",
  },
];

const line = (who, text) => ({ who, text });

// Mission narrative, indexed like MISSIONS. Radio lines are keyed by gameplay events.
export const MISSION_STORY = [
  // ---------------------------------------------------------------- Chapter 1
  {
    place: "HARBOR FRONT / TOWER 1",
    clock: "06:40",
    goals: [
      "Destroy the jammer mast",
      "Eliminate the rooftop guards",
    ],
    brief: [
      line(
        "iona",
        "Kestrel One, the first jammer mast is on the harbour tower. While it stands, we can't reach anyone inside the district.",
      ),
      line(
        "echo",
        "Echo here. Three guards on the roof, right beside the mast. One Shockwave on that roof takes all of them.",
      ),
      line(
        "iona",
        "Watch the gold pipper ahead of your aircraft. It shows where the bomb will land. Release when it covers the mast.",
      ),
    ],
    radio: {
      start: line("iona", "Kestrel One, you're cleared in hot. Pipper on the mast."),
      success: line("echo", "Mast is down. I can hear you now, Kestrel. Loud and clear."),
    },
    success:
      "The first jammer is silent. For the first time since dawn, Echo's voice reaches the carrier clearly.",
    failure:
      "The mast is still up. Wait for the pipper to sit on the roof before you release.",
  },
  {
    place: "CANAL ROW / TOWERS 1-2",
    clock: "07:05",
    goals: [
      "Eliminate the gunners hiding inside",
      "Set the Drill to the floor they occupy",
    ],
    brief: [
      line(
        "echo",
        "They learned. The spotters moved indoors. Two are on the third floor of the tall tower, one on the second floor next door.",
      ),
      line(
        "iona",
        "The Drill punches through slabs and detonates on the floor you choose. Read the floor number beside the pipper.",
      ),
    ],
    radio: {
      start: line("echo", "Tall tower, floor three. Short tower, floor two."),
      success: line("echo", "Both rooms are clear. They never saw it coming."),
    },
    success:
      "Echo confirms both rooms are empty. The Front now knows its concrete won't protect it.",
    failure:
      "Some spotters survived. Set the Drill's floor before release; the pipper label shows where it will detonate.",
  },
  {
    place: "MARKET SQUARE",
    clock: "07:30",
    goals: [
      "Destroy the jammer on the centre tower",
      "Hit the patrols when they gather in the square",
    ],
    brief: [
      line(
        "echo",
        "Their shift change is like clockwork. Two squads walk down to the market square and stand around for a few seconds.",
      ),
      line(
        "piper",
        "Kestrel Two joining. I carry Scatter: it bursts into bomblets over open ground. Perfect for a crowd in the square.",
      ),
      line(
        "iona",
        "The intel strip shows each gathering's countdown. Use the throttle to be over the square when they arrive.",
      ),
    ],
    radio: {
      start: line("echo", "First squad is moving. The square fills on the countdown."),
      rally: line("echo", "They're in the square. Now, Kestrel!"),
      multi: line("piper", "Look at that! One pass, one crowd."),
      success: line("iona", "Market Square is quiet. Two jammers left."),
    },
    success:
      "The shift change never finished. Echo marks the next jammer: behind the flak guns on Canal Row.",
    failure:
      "They scattered. Wait for the countdown, then drop the Scatter when the square is full.",
  },
  {
    place: "CANAL ROW / FLAK LINE",
    clock: "08:10",
    goals: [
      "Destroy both rooftop flak guns",
      "Eliminate every tagged fighter",
    ],
    brief: [
      line(
        "iona",
        "Two flak nests cover Canal Row. A red line means a gun has locked onto one of you; change lane or throttle before it fires.",
      ),
      line(
        "bram",
        "Kestrel Three. Shockwave payload. Point me at the flak guns and they're scrap.",
      ),
      line(
        "iona",
        "The full flight is up. Salvo drops one bomb from every aircraft at once. Spread the formation to cover a wider line.",
      ),
    ],
    radio: {
      start: line("bram", "Flak on two roofs. Let's take the guns first."),
      flak: line("piper", "Flak lock! Break, break!"),
      aa: line("bram", "Flak nest down."),
      success: line("iona", "Canal Row is open. Good work, Kestrel Flight."),
    },
    success:
      "The flak line is broken and the flight is intact. Echo's team moves deeper into the district.",
    failure:
      "The flak line held. Silence the guns first, and change lane when a red lock line appears.",
  },
  {
    place: "ORCHARD BLOCK / SHELTER ZONE",
    clock: "08:55",
    goals: [
      "Eliminate the Orchard Block cell",
      "Never strike the blue civilian shelter",
    ],
    brief: [
      line(
        "echo",
        "The blue-roofed building is a civilian shelter. Forty families. Nothing hits that roof. Nothing.",
      ),
      line(
        "iona",
        "The cell here is jumpy. After the first blast, survivors run for the ground floors and hide for a while.",
      ),
      line(
        "echo",
        "Make the first strike count. I'll tag where the runners hide so a Drill can follow them down.",
      ),
    ],
    radio: {
      start: line("echo", "Blue roof is the shelter. Keep every pipper off it."),
      alert: line("echo", "They're running for cover. Tagging the hiding spots."),
      shelter: line("iona", "Pipper is over the shelter. Hold your release."),
      success: line("echo", "The cell is gone and the shelter is untouched. Thank you."),
    },
    success:
      "Orchard Block is clear and not a window of the shelter is cracked. The families will sleep tonight.",
    failure:
      "The mission was aborted. When survivors hide, follow them with the Drill, and keep every bomb clear of the shelter.",
  },
  {
    place: "THE GLASS TOWER",
    clock: "09:40",
    goals: [
      "Destroy the jammer and flak around the Glass Tower",
      "Strike the lieutenants' meeting on the sixth floor",
      "Stop the technical convoy",
    ],
    brief: [
      line(
        "echo",
        "Marrow's lieutenants meet on the sixth floor of the Glass Tower. It is the only time they are all in one room.",
      ),
      line(
        "iona",
        "Flak covers the tower and a convoy of technicals circles the streets. Kestrel One carries a Lance guided bomb for the trucks.",
      ),
      line(
        "marrow",
        "Kestrel, is it? You're bombing towers I designed. Tomorrow at last light, you'll watch the sea take the rest.",
      ),
    ],
    radio: {
      start: line("echo", "The meeting starts on the countdown. Sixth floor."),
      rally: line("echo", "They're all in the room. Now or never."),
      multi: line("bram", "Direct hit on the meeting."),
      success: line(
        "echo",
        "Echo is going in. We have the master override key! We're blown; heading north into the valley.",
      ),
    },
    success:
      "The Front's command in the district is gone. Echo team recovered the Tidelock's master override key, then fled north under fire. Marrow's fighters now hold Highwater Station.",
    failure:
      "The lieutenants are still meeting. Clear the flak, then time a Drill for the sixth floor on the countdown.",
  },
  // ---------------------------------------------------------------- Chapter 2
  {
    place: "MANGROVE MILE",
    clock: "14:10",
    goals: [
      "Escort both relief barges upriver",
      "Shoot the red fuel drums to hit whole gun crews",
    ],
    brief: [
      line(
        "okafor",
        "Okafor aboard Harbor Mercy. These barges carry the flood pumps and the crew who can run the Tidelock. We can't lose them.",
      ),
      line(
        "iona",
        "The barges follow your wake, Kestrel One. Steer them around mines, and put Marlin between the barges and any gun that's aiming at them.",
      ),
      line(
        "iona",
        "A red line means a gun is aiming at a barge. The gun crews stack fuel drums nearby; one shot on the drums takes out the crew.",
      ),
    ],
    radio: {
      start: line("okafor", "Barges under way. We're right behind you."),
      drums: line("okafor", "The whole bank just went up! Good eye."),
      barge: line("okafor", "We're taking hits! Cover us!"),
      skiffs: line("iona", "Fast boats inbound. Watch their approach lines."),
      success: line("okafor", "Through the mangroves. Next is the Narrows."),
    },
    success:
      "Both barges cleared the mangroves. Upriver, the Front is setting a trap at the Narrows.",
    failure:
      "A barge went down. Keep Marlin between the guns and the convoy, and lead the barges around mines.",
  },
  {
    place: "THE NARROWS",
    clock: "15:25",
    goals: [
      "Get the convoy through the bridge ambush",
      "Hit the skiff pincers where their paths meet",
    ],
    brief: [
      line(
        "iona",
        "The Narrows is a pincer trap. Skiffs launch from both banks and meet at one point in front of the barges.",
      ),
      line(
        "okafor",
        "Their skiffs carry fuel. If you hit one while they're bunched up, the others go with it.",
      ),
      line(
        "marrow",
        "Okafor. You always did trust the wrong people. Turn back and you'll live.",
      ),
    ],
    radio: {
      start: line("okafor", "Entering the Narrows. It's tight in here."),
      pincer: line("iona", "Pincer forming. Watch where the lines cross."),
      bridge: line("iona", "Gunners on the bridge, with an ammunition crate in the middle."),
      success: line("okafor", "We're through! Highwater's lock is dead ahead."),
    },
    success:
      "The pincer broke on its own fuel. Beyond the Narrows, the lock gate at Highwater is sealed and guarded.",
    failure:
      "The Narrows held. Shoot skiffs where their paths meet, and body-block shots aimed at the barges.",
  },
  {
    place: "HIGHWATER LOCK",
    clock: "16:30",
    goals: [
      "Destroy both gate towers",
      "Destroy the exposed gate generator",
      "Bring the barges into Highwater",
    ],
    brief: [
      line(
        "okafor",
        "Marrow sealed the river lock. Two gun towers guard it, and the gate generator is shielded while they stand.",
      ),
      line(
        "iona",
        "The convoy will hold short of the gate. Destroy the towers, then the generator, and the gates will swing open.",
      ),
    ],
    radio: {
      start: line("okafor", "Holding short. Open that gate for us, Kestrel."),
      shield: line("iona", "Both towers down. The generator shield has dropped."),
      open: line("okafor", "The gates are opening! Bring us in!"),
      success: line(
        "okafor",
        "We're in the control room... Kestrel, the gates are locked out. We need the master override key. Echo has it.",
      ),
    },
    success:
      "Highwater Station is retaken, but the Tidelock won't answer without its master override key, and Echo team is scattered across Cinder Valley.",
    failure:
      "The convoy couldn't break the lock. Destroy the towers first, then the generator, and intercept the heavy shells.",
  },
  // ---------------------------------------------------------------- Chapter 3
  {
    place: "LOWLAND OUTPOST",
    clock: "16:45",
    goals: [
      "Winch up Cpl. Kofi Mensah and medic Lin Tao",
      "Return to Highwater's pad",
    ],
    brief: [
      line(
        "kofi",
        "Mensah, Echo team. Lin and I got separated from the sergeant. We're pinned near the lowland outpost.",
      ),
      line(
        "iona",
        "Lantern is fuelled. Clear each pickup zone, hover low and slow, and hold the winch. Everyone comes back to the pad.",
      ),
    ],
    radio: {
      start: line("kofi", "Green smoke's out. You'll see our signals."),
      pickup: line("kofi", "Aboard! Sergeant Reyes went north with the key."),
      success: line("iona", "Two home. Refuel and go back for the rest."),
    },
    success:
      "Mensah and Tao are safe. They confirm Sgt. Reyes carries the override key toward North Ridge.",
    failure:
      "Lantern lost protection. Use flares against locks, and clear each zone before you hover.",
  },
  {
    place: "BROKEN CROSSING",
    clock: "17:40",
    goals: [
      "Winch up three members of Echo team",
      "Beat the anti-air patrols at the crossings",
    ],
    brief: [
      line(
        "echo",
        "Reyes. I sent my rear guard west of the crossings. Get them out, then come for me. I'm still moving.",
      ),
      line(
        "iona",
        "Anti-air trucks patrol the crossings. Rockets break up vehicles; guided missiles pick off drones.",
      ),
    ],
    radio: {
      start: line("echo", "Three signals. Watch those trucks at the crossings."),
      pickup: line("echo", "That's my people. Thank you, Lantern."),
      success: line("iona", "Five of Echo home. One sortie left. The storm is here."),
    },
    success:
      "The rear guard is aboard. The typhoon's outer bands are hitting the coast. Only North Ridge remains.",
    failure:
      "The crossings held. Kill the anti-air trucks' launchers first and resupply at the aid stations.",
  },
  {
    place: "NORTH RIDGE",
    clock: "18:30",
    goals: [
      "Rescue the last of Echo team, and Sgt. Reyes with the key",
      "Land at Highwater before last light",
    ],
    brief: [
      line(
        "echo",
        "North Ridge. I have the key and three wounded. Drones everywhere. Last light is in twenty minutes.",
      ),
      line(
        "marrow",
        "Twenty minutes, Kestrel. Then the sea decides who was right.",
      ),
      line(
        "okafor",
        "Get that key to me and I'll close the gates myself. Fly, Kestrel. Fly.",
      ),
    ],
    radio: {
      start: line("echo", "Four signals on the ridge. I'm the last one out."),
      pickup: line("echo", "Key's aboard. Take us home."),
      success: line(
        "okafor",
        "Key in... turning... The Tidelock is closing!",
      ),
    },
    success:
      "The gates met as the surge arrived. The typhoon broke against the Tidelock and Solace Harbor stayed dry. Marrow's last broadcast cut out mid-sentence.",
    failure:
      "Lantern went down on the ridge. Pace your missiles, flare the drones' locks, and resupply before the climb.",
  },
];

export const FINALE = {
  eyebrow: "OPERATION BREAKWATER / COMPLETE",
  title: "Solace Harbor stayed dry.",
  text: "Twelve sorties, one flight, one gunboat and one helicopter. Echo team is home, the key is turned, and the Tidelock held through the worst of Typhoon Ilse. Well flown, Kestrel.",
};

export function speaker(id) {
  return CAST[id] || CAST.iona;
}
