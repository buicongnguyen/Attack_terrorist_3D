// Campaign narrative: one villain, one ticking clock, and a reason for every mechanic.
// Chapter 1 breaks the jamming network and recovers the override key's location,
// Chapter 2 delivers the engineers to the Tidelock, Chapter 3 brings the key home and holds
// the station while the gates close.
// 4.0: under the missions runs the Wall Inquiry. Six files, recovered as the campaign goes,
// show that Marrow was blamed for a wall the Harbour Authority cheapened, that Okafor signed
// for it, and that the Tidelock's east hinge has the same flaw: which is why the gates must be
// walked shut in the finale. The player decides what happens to the files.
// 5.1: one timeline (landfall tonight at 19:10), a reveal that holds the hinge until 3.3, Marrow
// on the radio, the harbour's beats and a voice for every rescued soldier. docs/SCRIPT-5.1.md
// lists every line 5.1 added or changed, with its trigger and radio key.

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
  ines: {
    name: "Ines Duarte",
    role: "Harbourmaster",
    initials: "ID",
    color: "#6ec3f0",
  },
  kofi: {
    name: "Cpl. Kofi Mensah",
    role: "Echo radio",
    initials: "KM",
    color: "#8fd64a",
  },
  sol: {
    name: "Capt. Sol Adeyemi",
    role: "Hornet gunship",
    initials: "SA",
    color: "#8fb8ff",
  },
  marrow: {
    name: "Marrow",
    role: "Ashen Front / intercept",
    initials: "M",
    color: "#ff4b2b",
    hostile: true,
  },
  // 5.1: the rest of Echo team, who speak as they come aboard.
  lin: { name: "Medic Lin Tao", role: "Echo medic", initials: "LT", color: "#5fe0b4" },
  hart: { name: "Pvt. Sam Hart", role: "Echo team", initials: "SH", color: "#5fe0b4" },
  okoro: { name: "Spc. Ada Okoro", role: "Echo team", initials: "AK", color: "#5fe0b4" },
  haddad: { name: "Pvt. Noor Haddad", role: "Echo team", initials: "NH", color: "#5fe0b4" },
  brandt: { name: "Pvt. Teo Brandt", role: "Echo team", initials: "TB", color: "#5fe0b4" },
  park: { name: "Spc. Juno Park", role: "Echo team", initials: "JP", color: "#5fe0b4" },
  ashby: { name: "Pvt. Pell Ashby", role: "Echo team", initials: "PA", color: "#5fe0b4" },
});

// Landfall (5.1): tonight at last light. Every mission clock runs from 06:40 up to it.
export const LANDFALL = "19:10";

const minutesOf = (clock) => {
  const [h, m] = clock.split(":").map(Number);
  return h * 60 + m;
};

// 'LANDFALL 19:10 · 12 H 30 MIN' from a mission clock: the time left always carries its units.
export function landfallLabel(clock) {
  const left = minutesOf(LANDFALL) - minutesOf(clock),
    hours = Math.floor(left / 60),
    minutes = left % 60;
  const span = [hours && `${hours} H`, minutes && `${minutes} MIN`].filter(Boolean).join(" ") || "NOW";
  return `LANDFALL ${LANDFALL} · ${span}`;
}

export const PROLOGUE = {
  eyebrow: "MERIDIA ARCHIPELAGO / LANDFALL TONIGHT",
  title: "The city that lives below the sea",
  paragraphs: [
    "Solace Harbor sits three metres below the tide. Only the Tidelock, a storm barrier across the mouth of the Verde River, keeps it dry.",
    "Twelve years ago the old sea wall failed and the Lower Quays drowned. The inquiry blamed the wall's designer, Dr. Elias Marrow. He has said ever since that it was not his wall that failed.",
    "Now he calls himself only Marrow. His Ashen Front has seized the Glass District, jammed every radio, and marched on Highwater Station, where the Tidelock is controlled.",
    "Typhoon Ilse makes landfall tonight at last light. Her outer bands push a storm tide up the estuary, and with every radio jammed the pump stations are blind: each high tide pours into the low streets.",
    "Marrow holds Highwater's controls and says the city will learn tonight what its walls are made of. You fly for the Kestrel Response Unit: strike aircraft, a river gunboat, and a rescue helicopter.",
  ],
  action: "Begin Operation Breakwater",
};

export const CHAPTER_STORY = [
  {
    title: "Breakwater",
    subtitle: "Glass District and harbour strikes",
    place: "GLASS DISTRICT / SOLACE HARBOR",
    intro:
      "The Front's jammers blind the whole harbour and its flotilla holds the water. Echo recon is hidden inside the district and can read their patrol schedules. Lead Kestrel Flight over the towers, then the quays, and strike when they gather.",
  },
  {
    title: "Relief Run",
    subtitle: "Verde River convoy",
    place: "VERDE RIVER / SOUTH DELTA",
    intro:
      "With the jammers down and the flotilla sunk, Dr. Okafor's engineers can sail for Highwater Station. Their barges carry the pumps and the crew who can close the Tidelock. The Front will try to sink them before they reach the lock.",
  },
  {
    title: "Last Light",
    subtitle: "Cinder Valley rescue",
    place: "CINDER VALLEY / NORTH OF HIGHWATER",
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
        "The ring ahead of your aircraft, the pipper, shows where the bomb will land. Steer it over the mast, then release.",
      ),
    ],
    radio: {
      start: line("iona", "Cleared in hot, Kestrel. Tap or click the mast to mark it."),
      // 5.1 C1: the jammer set piece's line (the mast topples and the street lamps come back on).
      success: line("echo", "Jammer's down. Network's back. I can see you, Kestrel."),
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
        "The Drill punches through slabs and detonates on the floor you choose. The ladder on the right shows every floor under the pipper and who is on it.",
      ),
    ],
    radio: {
      start: line("echo", "Tall tower, floor three. Short tower, floor two. Check the ladder."),
      success: line("echo", "Both rooms are clear. They never saw it coming."),
    },
    success:
      "Echo confirms both rooms are empty. The Front now knows its concrete won't protect it.",
    failure:
      "Some spotters survived. Set the Drill's floor before release; the ladder highlights the floor it will reach.",
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
        "The intel strip shows each gathering's countdown. Use your speed, or Reverse, to be over the square when they arrive.",
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
        "Two flak nests cover Canal Row. A red line means a gun has locked onto one of you; when the HUD says BREAK, change lane.",
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
        "Kestrel, is it? I designed those towers. I designed the wall, too, and it was not my wall that failed. Ask your Authority what they poured into it.",
      ),
    ],
    radio: {
      start: line("echo", "The meeting starts on the countdown. Sixth floor."),
      rally: line("echo", "They're all in the room. Now or never."),
      flak: line("bram", "Three flak nests up. Watch the red lines."),
      alert: line("echo", "They heard that. Runners heading for the ground floors."),
      shelter: line("echo", "Careful! The blue roof by the fish market is the shelter."),
      multi: line("bram", "Direct hit on the meeting."),
      success: line(
        "echo",
        "Echo is going in. We have the master override key, and a strongroom full of old inquiry files. We're blown; heading north into the valley.",
      ),
    },
    success:
      "The Front's command in the district is gone. Echo team took the Tidelock's master override key from Marrow's strongroom, and the files he kept beside it, then fled north under fire. Marrow's fighters now hold Highwater Station, and his flotilla still holds the harbour.",
    file: {
      title: "Inquiry file 1 / The verdict",
      from: "Carried out of Marrow's strongroom by Echo team",
      text: "Harbour Authority inquiry into the sea wall collapse. Finding: the wall failed through errors in its design. Responsible: Dr. Elias Marrow, chief engineer. Dead in the Lower Quays: 212.",
    },
    failure:
      "The lieutenants are still meeting. Clear the flak, then time a Drill for the sixth floor on the countdown.",
  },
  // ---------------------------------------------------------------- Chapter 1: the harbour
  {
    place: "SOLACE HARBOR / MAIN CHANNEL",
    clock: "10:30",
    goals: [
      "Sink 40 of the 103 boats, the channel column among them",
      "Lay the Stick across the boatyard rows and along the raider lines",
    ],
    brief: [
      line(
        "iona",
        "The district is ours, but the Front's flotilla still holds Solace Harbor. Okafor's barges can't reach the river while those boats guard the mouth.",
      ),
      line(
        "ines",
        "Harbourmaster Duarte. Their patrol column waits at the channel buoys, nose to tail on the diagonal. Two missile boats lie against the north quay.",
      ),
      line(
        "ines",
        "And that's only the middle basin. Raiders are moored in rows at the west boatyard and the fuel depot, lined up in the east anchorage, and the outer roads are full. A hundred boats. Sink forty and the rest will run.",
      ),
      line(
        "piper",
        "Stick bombs, Kestrel: five in a line. Turn it across, down or on the diagonal with the angle buttons, and one pass sinks a whole row. Tap a group on the map and we'll fly there.",
      ),
    ],
    radio: {
      start: line("iona", "We fly slow over the water. Turn back whenever you want another look."),
      q25: line("ines", "A quarter of them gone. The mouth's starting to breathe."),
      q50: line("bram", "Half the column. Keep the Stick for the big hulls."),
      q75: line("ines", "They're panicking on the quays. Finish it."),
      quota: line("ines", "That's the quota! Only the channel column now, Kestrel."),
      multi: line("piper", "The whole column in one line!"),
      success: line("ines", "The channel is clear. What's left of them is running for the open sea."),
    },
    success:
      "The patrol column never left the channel. Duarte's tugs can move again, but the dry dock is still full of Front boats.",
    failure:
      "Boats got away. Turn the Stick until it lies along the column, and watch the hit count before you release.",
  },
  {
    place: "SOLACE HARBOR / DRY DOCK",
    clock: "11:20",
    goals: [
      "Sink 36 of the 99 boats: piers, slipways, the dry dock and the outer roads",
      "Sink the flak frigate",
      "Never hit the Island Belle ferry",
    ],
    brief: [
      line(
        "ines",
        "They've moored boats round the corner of the fitting-out pier, and against three walls of the dry dock.",
      ),
      line(
        "ines",
        "The west and east slipways are L-shaped too, and there's a U-shaped slip in the east quay packed with raiders.",
      ),
      line(
        "iona",
        "Kestrel One carries L-patterns for the pier. Piper has U-patterns: turn the U so its open end faces out of the dock.",
      ),
      line(
        "ines",
        "The Island Belle is ferrying civilians across the harbour. Keep every bomb off her.",
      ),
    ],
    radio: {
      start: line("ines", "Island Belle is crossing. She's the one with the blue ring."),
      q25: line("ines", "A quarter of the dock is on the bottom. Keep going."),
      q50: line("piper", "Half of them gone. The shapes are doing the work."),
      q75: line("ines", "The slipways are emptying. A few more, Kestrel."),
      quota: line("ines", "That's the quota! Only the frigate now, Kestrel."),
      flak: line("piper", "Flak from the frigate! Break when it says break."),
      ferry: line("iona", "Civilians in your pattern. Hold your release."),
      multi: line("piper", "That shape fit like a glove."),
      success: line("ines", "Pier and dock are clear, and the Island Belle made it across."),
    },
    success:
      "The dry dock is a wreck and the frigate is on the bottom. Then the Front's last ships close round the Island Belle. They've taken her.",
    failure:
      "The strike was called off. Fit the L to the pier corner and the U to the dock, and wait until the ferry is clear.",
  },
  {
    place: "SOLACE HARBOR / INNER BASIN",
    clock: "12:15",
    goals: [
      "Break the escort ring without touching the Island Belle",
      "Sink the destroyer Cinder",
      "Sink 45 of the 108 boats: rafts, the raider rings and the convoy",
    ],
    brief: [
      line(
        "ines",
        "They've seized the Island Belle with forty passengers aboard. Five escorts circle her in the middle of the basin.",
      ),
      line(
        "iona",
        "The O-Ring bursts in a circle. Centre it on the ferry: the escorts sit on the ring and she stays safe in the middle.",
      ),
      line(
        "marrow",
        "Forty passengers, Kestrel. The Authority counted two hundred and twelve in the Lower Quays and called it my arithmetic. Touch that ferry and this count is yours.",
      ),
      line(
        "bram",
        "Box bombs for the boats rafted at the fuel pier and the pontoons. I'm saving a Stick for Cinder's hull.",
      ),
      line(
        "ines",
        "Eight raiders are circling in the west basin. No ferry in the middle of that one: any ring will do.",
      ),
    ],
    radio: {
      start: line("ines", "Escorts circling the Belle. Your pattern counts what it will hit."),
      q25: line("bram", "A quarter down. Their rings are coming apart."),
      q50: line("ines", "Half the flotilla. They're losing their nerve."),
      q75: line("iona", "The quays are cheering, Kestrel. Finish it."),
      quota: line("ines", "That's the quota! Only the ring and Cinder now, Kestrel."),
      freed: line("ines", "My father brought ferries through that mouth for thirty years. The Belle doesn't sink on my watch."),
      flak: line("bram", "Flak from Cinder and the frigate. Watch the red lines."),
      ferry: line("ines", "The ferry is inside your pattern. Don't release!"),
      multi: line("bram", "Scratch one ring."),
      success: line("ines", "Cinder is down. My father was a pilot on the Lower Quays, Kestrel. Twelve years I've waited to see Marrow's ships burn. Okafor, you're clear to sail."),
    },
    success:
      "The flotilla is gone and the Island Belle rides safe in the west roads. The mouth of the Verde River is open for Okafor's convoy.",
    file: {
      title: "Inquiry file 2 / A letter never answered",
      from: "Pulled by Ines from the harbour archive",
      text: "Marrow to the Harbour Authority, eleven weeks before the collapse: \"The concrete delivered to bay nine is not the mix I specified. If it is poured, I will not sign the wall.\" Stamped RECEIVED. No reply on file.",
    },
    failure:
      "Regroup. Centre the O-Ring on the ferry, box the rafted boats, and lay a Stick along Cinder's hull.",
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
        "The barges follow your wake, Marlin. Steer them around mines, and put yourself between the barges and any gun that's aiming at them.",
      ),
      line(
        "iona",
        "A red line means a gun is aiming at a barge. The gun crews stack fuel drums nearby; one shot on the drums takes out the crew.",
      ),
    ],
    radio: {
      start: line("okafor", "Barges under way. We're right behind you."),
      drumsHint: line("iona", "Red fuel drums on the left bank, Kestrel. One shot takes the whole gun crew."),
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
        "Someone signed for that concrete, Kestrel. It wasn't me. Ask who stood beside me that winter.",
      ),
    ],
    radio: {
      start: line("okafor", "Entering the Narrows. It's tight in here."),
      pincer: line("iona", "Pincer forming. Watch where the lines cross."),
      bridge: line("iona", "Gunners on the bridge, with an ammunition crate in the middle."),
      success: line("okafor", "We're through! Wide water ahead, and it's flooded."),
    },
    success:
      "The pincer broke on its own fuel. Okafor heard every word on the open channel, and does not speak of it. Beyond the Narrows the river spills over the floodplain, and the Front is waiting in the water.",
    file: {
      title: "Inquiry file 3 / The substitution order",
      from: "Uplinked by Echo over the network you un-jammed",
      text: "Purchase order 7781: marine-grade concrete replaced with \"equivalent grade B\" to meet the opening date. Saving: eleven per cent. Authorised for the Authority. The engineering countersignature is torn away.",
    },
    failure:
      "The Narrows held. Shoot skiffs where their paths meet, and body-block shots aimed at the barges.",
  },
  {
    place: "VERDE FLOODPLAIN",
    clock: "15:50",
    goals: [
      "Escort both barges across the flooded fields",
      "Break skiff swarms with rockets and the air strike",
    ],
    brief: [
      line(
        "okafor",
        "Past the Narrows the Verde spills over the rice fields. Wide water, and the Front has skiffs hidden in every flooded barn.",
      ),
      line(
        "iona",
        "Marlin's rocket pods are loaded: three rockets a salvo, and they burst. Save them for crowds.",
      ),
      line(
        "piper",
        "Piper here. Kestrel Two is overhead with bombs to spare. Aim where you want them and call the strike. We lay a line right across the water.",
      ),
    ],
    radio: {
      start: line("okafor", "Open water. They can come at us from anywhere now."),
      rockets: line("iona", "Rockets are loaded, Kestrel. Put a salvo into a pack of skiffs."),
      strike: line("piper", "Air strike ready. Point at the swarm and call it."),
      barge: line("okafor", "They're swarming the barges!"),
      pincer: line("iona", "Pincer forming. Rockets on the meeting point."),
      skiffs: line("iona", "Skiffs in the columns. Rake them before they reach the barges."),
      success: line("okafor", "Across the floodplain. There's a sawmill camp ahead; I can smell the smoke."),
    },
    success:
      "The floodplain is behind the convoy. Upriver, the Front has turned the old sawmill into a fortress on both banks.",
    failure:
      "The swarm got through. Fire a rocket salvo into a crowd, and call the air strike across the canal ahead of the barges.",
  },
  {
    place: "SAWMILL REACH",
    clock: "16:05",
    goals: [
      "Get the convoy past the sawmill camp",
      "Burn the gun lines down with the laser",
    ],
    brief: [
      line(
        "okafor",
        "The sawmill camp holds both banks: gun lines in the log yards, launchers behind the stacks, and a log bridge across the reach.",
      ),
      line(
        "iona",
        "Your laser is live. Hold it on a target and it burns through; let go before it overheats.",
      ),
      line(
        "ines",
        "Duarte here. I've sent my harbour launch up after you. Pick up the green crate and she'll ride with the barges.",
      ),
    ],
    radio: {
      start: line("okafor", "Sawmill in sight. Keep us in the middle of the channel."),
      laser: line("iona", "Laser's hot. Sweep it along the gun line."),
      bridge: line("iona", "Log bridge ahead, gunners on top and an ammunition crate in the middle."),
      barge: line("okafor", "Hits on Relief Two! Cover us!"),
      pincer: line("iona", "Skiffs from both banks. Watch where they cross."),
      success: line("okafor", "Through the sawmill. One more stretch: the Cut."),
    },
    success:
      "The sawmill burns behind the convoy. Ahead lies the Cut, a straight canal through the ridge and the last road to Highwater.",
    failure:
      "The camp held the reach. Burn the gun lines with the laser, shoot the fuel drums, and take every crate of help on the water.",
  },
  {
    place: "THE CUT",
    clock: "16:20",
    goals: [
      "Run the Cut with both barges",
      "Use every kind of help: gunship, escort boat and air strike",
    ],
    brief: [
      line(
        "okafor",
        "The Cut runs straight through the ridge for two hundred metres. Marrow has gun lines along both banks, the whole way.",
      ),
      line(
        "sol",
        "Hornet, Captain Adeyemi. I'm refuelling at the ridge. Grab my crate on the water and I'll fly your wing: I shoot where you shoot.",
      ),
      line(
        "marrow",
        "The Authority had a deputy who signed what it put in front of him. He is closer to you than you think.",
      ),
    ],
    radio: {
      start: line("okafor", "Entering the Cut. No way back now."),
      cut: line("iona", "Gun lines on both banks, Kestrel. Rockets, laser, air strike: use it all."),
      barge: line("okafor", "We're taking fire from both sides!"),
      pincer: line("iona", "Pincer from the banks!"),
      success: line("okafor", "We're through the Cut! Highwater's lock is dead ahead."),
    },
    success:
      "The Cut is clear and the barges are still afloat. Beyond it, the lock gate at Highwater is sealed and guarded.",
    failure:
      "The Cut held. Take the gunship and the escort crates, and save an air strike for the thickest gun line.",
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
      start: line("okafor", "Last stretch to Highwater. Keep the barges together, Kestrel."),
      hold: line("okafor", "Holding short. Open that gate for us, Kestrel."),
      shield: line("iona", "Both towers down. The generator shield has dropped."),
      open: line("okafor", "The gates are opening! Bring us in!"),
      success: line(
        "okafor",
        "We're in the control room... Kestrel, the gates are locked out. We need the master override key. Echo has it.",
      ),
    },
    success:
      "Highwater Station is retaken, but the Tidelock won't answer without its master override key, and Echo team is scattered across Cinder Valley.",
    file: {
      title: "Inquiry file 4 / Testimony",
      from: "Printed in the Highwater control room by Okafor's crew",
      text: "Inquiry transcript, day six. Q: Did Dr. Marrow approve the grade B mix? A: \"He was chief engineer. Everything was his to approve.\" The witness was his deputy. The name on the page has been blacked out.",
    },
    failure:
      "The convoy couldn't break the lock. Destroy the towers first, then the generator, and intercept the heavy shells.",
  },
  // ---------------------------------------------------------------- Chapter 3
  {
    place: "LOWLAND OUTPOST",
    clock: "16:45",
    goals: [
      "Fly over Cpl. Kofi Mensah and medic Lin Tao to pick them up",
      "Shoot launch crews before they reach their missiles",
      "Land at the Verde aid station",
    ],
    brief: [
      line(
        "kofi",
        "Mensah, Echo team. Lin and I got separated from the sergeant. We're pinned near the lowland outpost.",
      ),
      line(
        "iona",
        "Lantern is fuelled. Fly over each signal and they ride the line up: no hovering. Launch crews lounge by their missiles until they see you, so shoot them first. Then land at the Verde aid station.",
      ),
    ],
    radio: {
      start: line("kofi", "Green smoke's out. You'll see our signals."),
      siteSilent: line("iona", "Launch crew down. That site won't fire now."),
      drones: line("iona", "Drones in the air! Rockets or guided, Kestrel."),
      pickup: line("kofi", "Both aboard. Reyes has Marrow's files: read them before you trust anyone."),
      success: line("iona", "Two safe at the aid station. Refuel and go back for the rest."),
    },
    success:
      "Mensah and Tao are safe. They confirm Sgt. Reyes carries the override key toward North Ridge.",
    failure:
      "Lantern lost protection. Use flares against locks, and shoot launch crews before they reach their missiles.",
  },
  {
    place: "BROKEN CROSSING",
    clock: "17:40",
    goals: [
      "Fly over three members of Echo team to pick them up",
      "Stop missile trucks before their racks are up",
      "Land at the East Crossing camp",
    ],
    brief: [
      line(
        "echo",
        "Reyes. My rear guard is spread across the crossings. Get them out, then come for me. I'm still moving.",
      ),
      line(
        "iona",
        "Missile trucks patrol the crossings. When they see you they stop and raise the rack: five seconds before they fire. Hit them first. Rockets break up vehicles.",
      ),
    ],
    radio: {
      start: line("echo", "Three signals. Watch those trucks at the crossings."),
      siteSilent: line("iona", "That launch crew is down. Site's dead."),
      drones: line("iona", "Drones up from the station! Break their locks with flares."),
      pickup: line("echo", "That's my people. Thank you, Lantern."),
      success: line("iona", "Five of Echo home. One sortie left. The storm is here."),
    },
    success:
      "The rear guard is aboard. The typhoon's outer bands are hitting the coast. Only North Ridge remains.",
    file: {
      title: "Inquiry file 5 / The missing corner",
      from: "Found by Reyes inside Marrow's own copy of the order",
      text: "Reyes found the torn corner of order 7781 pinned inside Marrow's own copy. The countersignature reads: A. Okafor, Deputy Engineer.",
    },
    failure:
      "The crossings held. Kill missile trucks before their racks are up, and fly through the supply crates.",
  },
  {
    place: "NORTH RIDGE",
    clock: "18:30",
    goals: [
      "Rescue the last of Echo team, and Sgt. Reyes with the key",
      "Hit drone stations before their drones lift",
      "Land at Highwater Station before last light",
    ],
    brief: [
      line(
        "echo",
        "North Ridge. I have the key and three wounded. Drones everywhere. Last light is in forty minutes.",
      ),
      line(
        "marrow",
        "Forty minutes, Kestrel. Read what your sergeant carries. Then tell me who drowned the Quays.",
      ),
      line(
        "okafor",
        "Get that key to me and I'll close the gates myself. Fly, Kestrel. Fly.",
      ),
    ],
    radio: {
      start: line("echo", "Four signals on the ridge. I'm the last one out."),
      siteSilent: line("iona", "Launch crew down. One less missile."),
      drones: line("echo", "Drones lifting off the ridge! Hit the stations before the rest go up."),
      pickup: line("echo", "Key's aboard, and the files. Take us to Highwater."),
      success: line("echo", "Marrow knew about that hinge for four years, Commander, and kept quiet."),
    },
    success:
      "Reyes and the key are at Highwater. So are the inquiry files, and Dr. Okafor's signature is on the page that matters. Last light is less than forty minutes away, and Marrow has not finished.",
    file: {
      title: "Inquiry file 6 / The east hinge",
      from: "Handed over by Reyes at Highwater",
      text: "Tidelock construction log, four years ago: the east gate hinge block was poured from leftover stock, grade B. Marrow's own note, dated that week: \"Close her fast against a full surge and she shears. Let them find it the way they found mine.\" He reported nothing.",
    },
    failure:
      "Lantern went down on the ridge. Hit drone stations before their drones lift, flare the locks, and fly through the crates.",
  },
  {
    place: "HIGHWATER STATION / THE TIDELOCK",
    clock: "19:10",
    goals: [
      "Hold Highwater Station while the gates close",
      "Stop the sappers before they reach the gate motors",
      "Shoot down Marrow's gunship",
    ],
    brief: [
      line(
        "okafor",
        "It's true, Kestrel. I was his deputy. The Authority swapped his concrete for a cheaper mix and I signed for it. When the wall went, I let them blame him. I was thirty and frightened.",
      ),
      line(
        "echo",
        "The same mix is in the Tidelock's east hinge. Slam the gates against a full surge and it shears. Marrow knows. That's the proof he wants the whole city to watch.",
      ),
      line(
        "okafor",
        "So I walk them shut by hand. Two and a half minutes. Keep his sappers off my gate motors, and keep this station standing.",
      ),
      line(
        "marrow",
        "Twelve years I told them. Tonight the sea tells them. Stand aside, Kestrel. Everyone who could leave has left.",
      ),
      line(
        "iona",
        "Forty families in the Orchard shelter couldn't. Lantern, you are cleared hot. Fly over the camp pad to repair and rearm. Hold that station.",
      ),
    ],
    radio: {
      start: line("okafor", "Gates moving. Slowly. Keep them off me, Kestrel."),
      sappers: line("iona", "Sappers on the road with charges! Gold rings, Kestrel. Don't let them reach the motors."),
      drones: line("echo", "Drones over the station! Flares if they lock you."),
      charge: line("okafor", "That was a motor housing! We can't take many of those."),
      half: line("okafor", "Halfway. The hinge is holding. Keep going."),
      boss: line("sol", "Kestrel, that's Hornet Two, my wingman's bird. He took her at Highwater. That's Marrow flying."),
      stall: line("marrow", "Ninety per cent, Anselm. Slam them now and the city watches the hinge go."),
      jam: line("iona", "He's jamming the motors from that gunship. Bring him down, Lantern!"),
      rage: line("marrow", "I gave this city a wall that would have stood! You are defending the men who cheated it!"),
      bossDown: line("marrow", "...Close them, then. Slowly, Anselm. Slowly. You know why."),
      success: line("okafor", "Gates are meeting... sealed. The hinge held. It held."),
    },
    success:
      "The gates met as the surge arrived, slowly enough that the east hinge held. Typhoon Ilse broke against the Tidelock and Solace Harbor stayed dry. Marrow ditched on the breakwater and was pulled out alive.",
    failure:
      "Highwater fell and the gates stopped. Shoot the sappers with the gold rings before they reach the motors, flare Marrow's missiles, and fly over the camp pad to repair.",
  },
];

// The inquiry files (4.0), in the order they are recovered: [mission index, file].
export const INQUIRY_FILES = MISSION_STORY.map((story, index) => (story.file ? { index, ...story.file } : null)).filter(Boolean);

// Chapter 1 fallbacks for missions that don't script their own line.
export const STRIKE_RADIO = {
  flak: line("piper", "Flak lock! Change lane when it says break!"),
  aa: line("bram", "Flak nest down."),
  shelter: line("iona", "Pipper is over the shelter. Hold your release."),
  abort: line("iona", "Abort, abort! That was the shelter. Pull out, Kestrel."),
  alert: line("echo", "They're scattering for cover. I'm tagging where they hide."),
  multi: line("piper", "Look at that. One pass, one crowd."),
  ferry: line("iona", "A civilian boat is in your pattern. Hold your release."),
  ferryHit: line("iona", "The ferry is hit! Abort the strike, Kestrel."),
  freed: line("ines", "The ferry is free!"),
  surge: line("iona", "High tide in one minute, Kestrel. Then the water is in the low streets."),
  // The harbour's quiet spells (5.1): a working tip after 45 s without a word.
  quiet1: line("piper", "Tap or click a group on the map, Kestrel, and we'll fly straight there."),
  quiet2: line("ines", "Look for boats moored in rows. One pattern laid along a row sinks the lot."),
  quiet3: line("bram", "Watch the count on the pattern before you let go. Wait for a full line."),
  // The harbour endgame (5.1 C1): the quota is met (each harbour mission names its key ships in
  // its own line), and LAST RUN.
  quota: line("ines", "That's the quota! Only the key ships now, Kestrel."),
  lastRun: line("bram", "Last run, Kestrel. Sticks on the rail. Make them count."),
};

// Marrow on the radio (5.1): six intercepts, each said once from an event in its mission. The
// event comes from the chapter's RADIO_EVENTS; 'start' with `after` fires that many seconds into
// the mission, and `after` on any other event is a fallback time if the event has not come.
export const INTERCEPTS = [
  { mission: 2, event: "start", after: 12, line: line("marrow", "Now you can hear me. Ask the Authority what it buried under the Quays.") },
  { mission: 5, event: "gatheringStruck", line: line("marrow", "Six of mine in a glass room. The Authority will call that my arithmetic too.") },
  { mission: 8, event: "start", after: 15, line: line("marrow", "Keep your ferry, Duarte. Your father never got one.") },
  { mission: 10, event: "pincerDown", after: 20, line: line("marrow", "You read water well, Kestrel. Read the inquiry better.") },
  { mission: 13, event: "start", after: 10, line: line("marrow", "Leave the gates open, the city drowns. Close them wrong, it sees the truth.") },
  { mission: 17, event: "reyesAboard", line: line("marrow", "She's read it all. Ask her what I knew about the hinge, then decide who you're defending.") },
];

export const interceptFor = (index) => INTERCEPTS.find((i) => i.mission === index) || null;

// Survivor voices (5.1): each of Echo team speaks as they come aboard (radio key 'aboard').
export const CREW_RADIO = {
  "Cpl. Kofi Mensah": line("kofi", "Mensah aboard. Reyes split us at the river and took the key north."),
  "Medic Lin Tao": line("lin", "Three wounded in my head and none in this aircraft. Fly. I'll manage."),
  "Pvt. Sam Hart": line("hart", "Hart aboard. I'd stopped counting the trucks. Thanks, Lantern."),
  "Spc. Ada Okoro": line("okoro", "Okoro aboard. I kept the sergeant's radio dry the whole way."),
  "Pvt. Noor Haddad": line("haddad", "Haddad. Eight hours in a culvert. I never want to see water again."),
  "Pvt. Teo Brandt": line("brandt", "Brandt aboard. The drones followed us all the way up the ridge."),
  "Spc. Juno Park": line("park", "Park aboard, with the wounded. Easy on the turns, Lantern."),
  "Pvt. Pell Ashby": line("ashby", "Ashby. I thought the storm would get here before you did."),
  "Sgt. Mara Reyes": line("echo", "Reyes aboard. I read every file on the ridge, Lantern. Every one."),
};

// A loss (5.1): the line on the result card for each reason, and the debrief's advice. `{boat}`
// is the civilian boat that was hit. The city and the harbour lose to the tide differently.
export const FAILURE_RADIO = {
  shelter: STRIKE_RADIO.abort,
  ferry: STRIKE_RADIO.ferryHit,
  surge: line("iona", "High tide's in the low streets. Pull back, Kestrel. We go again."),
  harbourSurge: line("ines", "They've ridden the tide over the bar. They're gone."),
  flight: line("iona", "Kestrel Flight is down. Regroup, and we go again."),
  ordnance: line("iona", "Racks are empty, Kestrel. Come home and rearm."),
  barges: line("okafor", "Both barges are gone. Get us another convoy, Kestrel."),
  hull: line("iona", "Marlin's going down! Everyone off the boat!"),
  heliHull: line("iona", "Lantern is down. Echo, hold on. We're coming back."),
  station: line("okafor", "The station's gone. The gates have stopped."),
};

export const FAILURE_TEXT = {
  shelter: "A bomb struck the civilian shelter and the strike was aborted. Keep every pipper off the blue roof.",
  ferry: "A bomb struck the {boat} and the strike was aborted. When the pattern turns blue, a civilian boat is inside it: hold your release.",
  surge: "High tide reached the low streets before the pumps came back. Strike the key targets first, and use Reverse and the map marks to waste no passes.",
  harbourSurge: "High tide: the flotilla rode it over the bar and out to sea.",
  flight: "Kestrel Flight was shot down. Silence the flak first and change lane when a red lock line appears.",
  barges: "Both barges sank before reaching the lock. Shield them with Marlin and steer them clear of mines.",
  station: "The control room was destroyed and the gates stopped. Shoot the sappers with the gold rings before they reach the motors, and bring Marrow down quickly once he arrives.",
};

// The key a loss reads under: the harbour's tide and the helicopter's hull have their own lines.
export function failureKey(reason, chapter, harbour) {
  if (reason === "surge" && harbour) return "harbourSurge";
  if (reason === "hull" && chapter === 2) return "heliHull";
  return reason;
}

// Canal lines that can come in any Chapter 2 mission: the help that joins from crates, and
// weapon advice.
export const RIVER_RADIO = {
  heli: line("sol", "Hornet on station. I'm on your wing, Marlin: I'll shoot where you shoot."),
  heliOut: line("sol", "Hornet's bingo fuel. Good hunting, Marlin."),
  ally: line("ines", "My launch is with you. She'll keep the skiffs off the barges."),
  allyOut: line("ines", "The launch is heading home. Well sailed, Marlin."),
  strikeIn: line("piper", "Kestrel Two rolling in. Keep your heads down!"),
  strikeGain: line("piper", "Rearmed and back overhead. Call it when you need it."),
  weapons: line("iona", "Try the rockets and the laser, Kestrel. And Kestrel Two will lay an air strike wherever you aim."),
  overheat: line("iona", "Laser's overheated. Switch to the gun while it cools."),
  noStrike: line("piper", "No bombs left, Marlin. Find us a crate and we'll rearm."),
  barracks: line("iona", "Barracks on the bank! Riflemen are coming down to the water. Knock it flat before they're out."),
};

export const FINALE = {
  eyebrow: "OPERATION BREAKWATER / COMPLETE",
  title: "Solace Harbor stayed dry.",
  text: "Nineteen sorties, one flight, one gunboat and one helicopter. Echo team is home and the Tidelock held. The inquiry files are aboard Lantern. Tonight only you, Reyes and Okafor know what they say.",
  question: "What happens to the inquiry files?",
  // 4.0: the player's choice, and what the city becomes.
  choices: {
    broadcast: {
      label: "Broadcast the files",
      title: "The truth, on every radio",
      text: "You read the inquiry files over the open channel as the storm passed. By morning the Harbour Authority had resigned. Okafor turned himself in, and asked only to finish rebuilding the east hinge before his trial. Marrow will answer for the Ashen Front, but the city no longer calls the Lower Quays his. At the breakwater, Ines Duarte read her father's name aloud with the others.",
    },
    seal: {
      label: "Seal the files",
      title: "A quiet repair",
      text: "The files went into the Highwater strongroom. The city woke dry and grateful, and asked no questions. Okafor rebuilt the east hinge that winter, quietly, with the right concrete, and never slept well again. Marrow went to prison as the man who tried to drown the city twice. Sergeant Reyes kept one page. She has not said which.",
    },
  },
};

// The finale's 'What the files say' panel (5.1): every file's title, or 'Not recovered' for one
// whose mission has no win in the save, and how many were read.
export function filesRead(records) {
  const rows = INQUIRY_FILES.map((file) => ({ title: file.title, found: Boolean(records?.[file.index]) }));
  const read = rows.filter((row) => row.found).length;
  return { rows, read, text: `You have read ${read} of ${INQUIRY_FILES.length} files` };
}

// How the city remembers Kestrel, from the campaign's stars (of `max`).
export function finaleRecord(stars, max) {
  const share = max ? stars / max : 0;
  const memory = share >= 0.85 ? "a flight that never missed" : share >= 0.55 ? "a flight that got it done" : "how close it was";
  return `Kestrel's record: ${stars} of ${max} stars. The city remembers ${memory}.`;
}

export function speaker(id) {
  return CAST[id] || CAST.iona;
}
