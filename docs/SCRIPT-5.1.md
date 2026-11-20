# Tidelock 5.1 script: every new or changed line

Written for N1 of [PLAN-5.1](PLAN-5.1.md) before any story code changed. Every line here lives as data in `src/story.js`, so a change after review edits that file only and reopens no logic. Mission numbers are chapter.mission (1.7 is index 6); the trigger says when the line is said; the radio key is what the code passes to the radio director, which sets the line's priority (story 2, tactical 1, chatter 0; see `src/radio-queue.js`).

Rules the lines keep (checked by `tests/story.test.js`):

- One timeline: landfall is tonight at 19:10, and the mission clocks (06:40 to 19:10) never run backwards.
- No player-facing Chapter 1 string says 'surge'; it is HIGH TIDE. The finale keeps the word.
- Nobody says 'Kestrel One' in Chapters 2 and 3, and nobody says 'hinge' before 3.3.
- No line before 3.2 says 'you signed'; file 4 hides the name, file 5 gives it.
- Each Marrow intercept has at most 26 words and fires once.
- Every story line (story-priority key) reads in full in the phone ticker; the intercepts and the lines named in review were trimmed to about 75 characters, and the browser suite checks none is clipped at 390x844.
- One moment carries at most one story line; the game logs an error if two arrive in the same step.

## 1. One timeline

| Where | Speaker | Line | Was |
|---|---|---|---|
| Prologue eyebrow | (title) | MERIDIA ARCHIPELAGO / LANDFALL TONIGHT | MERIDIA ARCHIPELAGO / T-36 HOURS |
| Prologue, paragraph 4 | (narration) | Typhoon Ilse makes landfall tonight at last light. Her outer bands push a storm tide up the estuary, and with every radio jammed the pump stations are blind: each high tide pours into the low streets. | Typhoon Ilse makes landfall tomorrow at last light. Marrow will hold the gates open when the surge peaks unless someone stops him. ... |
| Prologue, paragraph 5 (new) | (narration) | Marrow holds Highwater's controls and says the city will learn tonight what its walls are made of. You fly for the Kestrel Response Unit: strike aircraft, a river gunboat, and a rescue helicopter. | (the end of paragraph 4) |
| First briefing of each chapter, eyebrow | (label) | `landfallLabel(clock)`: 1.1 'LANDFALL 19:10 · 12 H 30 MIN', 2.1 'LANDFALL 19:10 · 5 H', 3.1 'LANDFALL 19:10 · 2 H 25 MIN' | The chapter clocks 'T-36H / 06:40', 'T-20H / 14:10', 'T-6H / 16:45' (removed) |
| 3.3 briefing | Reyes (echo) | North Ridge. I have the key and three wounded. Drones everywhere. Last light is in forty minutes. | ... Last light is in twenty minutes. |
| 3.3 briefing | Marrow | Forty minutes, Kestrel. Read what your sergeant carries. Then tell me who drowned the Quays. | Twenty minutes, Kestrel. ... |

### HIGH TIDE in Chapter 1

The code keeps its names (`op.surge`, reason `'surge'`, `surgeWindow`); only what the player reads changes.

| Where | Trigger | Key | Line | Was |
|---|---|---|---|---|
| Tide chip (top bar) | always in Chapter 1 | (HUD) | HIGH TIDE 3:12 | SURGE 3:12 |
| Tide chip label (screen readers) | | (HUD) | High tide | Surge window |
| Toast | 60 s left | (toast) | HIGH TIDE / 60 SECONDS | SURGE WINDOW / 60 SECONDS |
| Toast | 20 s left | (toast) | HIGH TIDE / 20 SECONDS | SURGE WINDOW / 20 SECONDS |
| Radio, Iona, any Chapter 1 mission | 60 s left | `surge` | High tide in one minute, Kestrel. Then the water is in the low streets. | Surge window closing, Kestrel. One minute, then the water is in the streets. |
| Result, city failure (1.1-1.6) | reason `surge` | (result text) | High tide reached the low streets before the pumps came back. Strike the key targets first, and use Reverse and the map marks to waste no passes. | The surge window closed and the water reached the streets. ... |
| Result, harbour failure (1.7-1.9) | reason `surge` | (result text) | High tide: the flotilla rode it over the bar and out to sea. | (the city text) |

## 2. The reveal ladder ('hinge' waits for 3.3)

| Mission | Speaker | Trigger | Key | Line | Was |
|---|---|---|---|---|---|
| 2.2 The Narrows | Marrow | briefing | (brief) | Someone signed for that concrete, Kestrel. It wasn't me. Ask who stood beside me that winter. | Anselm. Still carrying other men's papers? Tell your pilot what you signed. Then turn back, and you'll live. |
| 2.2 The Narrows | (narration) | win | (result text) | The pincer broke on its own fuel. Okafor heard every word on the open channel, and does not speak of it. Beyond the Narrows the river spills over the floodplain, and the Front is waiting in the water. | ... Okafor does not answer Marrow, and does not speak of it afterwards. ... |
| 2.5 The Cut | Marrow | briefing | (brief) | The Authority had a deputy who signed what it put in front of him. He is closer to you than you think. | You'll never see Highwater, Anselm. You signed for one grave already. The Cut is another, and this one has walls. |
| 2.6 Lock Gate | File 4 / Testimony | win | (file) | Inquiry transcript, day six. Q: Did Dr. Marrow approve the grade B mix? A: "He was chief engineer. Everything was his to approve." The witness was his deputy. The name on the page has been blacked out. | ... The name on the page is A. Okafor. |
| 3.3 Last Light | File 6 / The east hinge | win | (file) | Tidelock construction log, four years ago: the east gate hinge block was poured from leftover stock, grade B. Marrow's own note, dated that week: "Close her fast against a full surge and she shears. Let them find it the way they found mine." He reported nothing. | Tidelock construction log: the east gate hinge block was poured from remaining stock, grade B. A note in Marrow's hand: "Close her fast against a full surge and she shears. They built my proof into their own gate." |
| 3.3 Last Light | Reyes (echo) | win (closing line) | `success` | Marrow knew about that hinge for four years, Commander, and kept quiet. | Key's home. Kestrel... Okafor's name is on these papers. You need to hear this before he touches that gate. |
| 3.4 Eye of the Storm | Marrow | the gates stall at 90% | `stall` | Ninety per cent, Anselm. Slam them now and the city watches the hinge go. | (Okafor) He's jamming the motors from that gunship. I'm stuck at ninety per cent. Bring him down! |
| 3.4 Eye of the Storm | Iona | the gates stall at 90% (after Marrow's line) | `jam` (tactical) | He's jamming the motors from that gunship. Bring him down, Lantern! | (new: the order the stall line used to carry) |
| 3.3 Last Light | (narration) | win | (result text) | ... Last light is less than forty minutes away, and Marrow has not finished. | ... The surge is forty minutes out, and Marrow has not finished. |

File 5 (3.2) is unchanged: it is the true reveal, 'A. Okafor, Deputy Engineer'.

### Where each file came from (new 'from' line)

| File | Mission | From |
|---|---|---|
| 1 / The verdict | 1.6 | Carried out of Marrow's strongroom by Echo team |
| 2 / A letter never answered | 1.9 | Pulled by Ines from the harbour archive |
| 3 / The substitution order | 2.2 | Uplinked by Echo over the network you un-jammed |
| 4 / Testimony | 2.6 | Printed in the Highwater control room by Okafor's crew |
| 5 / The missing corner | 3.2 | Found by Reyes inside Marrow's own copy of the order |
| 6 / The east hinge | 3.3 | Handed over by Reyes at Highwater |

## 3. Marrow on the radio: six intercepts

Each fires once, in a red INTERCEPT frame with the Ashen Front emblem, from an existing event. Key `intercept` (story priority). A timed trigger counts mission time from the start; 2.2 fires on whichever comes first.

| Mission | Trigger | Words | Line |
|---|---|---|---|
| 1.3 Shift Change | start + 12 s | 14 | Now you can hear me. Ask the Authority what it buried under the Quays. |
| 1.6 The Glass Tower | the meeting is struck (event `gatheringStruck`: a member falls while the gathering is live) | 15 | Six of mine in a glass room. The Authority will call that my arithmetic too. |
| 1.9 The Ring | start + 15 s (kept off the Belle-freed event) | 9 | Keep your ferry, Duarte. Your father never got one. |
| 2.2 The Narrows | first pincer destroyed (event `pincerDown`) or start + 20 s | 9 | You read water well, Kestrel. Read the inquiry better. |
| 2.5 The Cut | start + 10 s | 14 | Leave the gates open, the city drowns. Close them wrong, it sees the truth. |
| 3.3 Last Light | Reyes is aboard (event `reyesAboard`; when her moment already carries a story line, such as the pickup line when she is last aboard, it comes one step later) | 17 | She's read it all. Ask her what I knew about the hinge, then decide who you're defending. |

## 4. Harbour beats

On the share of the quota sunk (25, 50 and 75 per cent of the boats the mission needs). Keys `q25`, `q50`, `q75` (tactical).

| Mission | Key | Speaker | Line |
|---|---|---|---|
| 1.7 Harbour Mouth | `q25` | Ines | A quarter of them gone. The mouth's starting to breathe. |
| 1.7 Harbour Mouth | `q50` | Bram | Half the column. Keep the Stick for the big hulls. |
| 1.7 Harbour Mouth | `q75` | Ines | They're panicking on the quays. Finish it. |
| 1.8 Dry Dock | `q25` | Ines | A quarter of the dock is on the bottom. Keep going. |
| 1.8 Dry Dock | `q50` | Piper | Half of them gone. The shapes are doing the work. |
| 1.8 Dry Dock | `q75` | Ines | The slipways are emptying. A few more, Kestrel. |
| 1.9 The Ring | `q25` | Bram | A quarter down. Their rings are coming apart. |
| 1.9 The Ring | `q50` | Ines | Half the flotilla. They're losing their nerve. |
| 1.9 The Ring | `q75` | Iona | The quays are cheering, Kestrel. Finish it. |
| 1.9 The Ring | `freed` (story) | Ines | My father brought ferries through that mouth for thirty years. The Belle doesn't sink on my watch. |

The 1.9 Belle-freed line replaces 'The escorts are gone! Island Belle is steaming clear to the west roads.'; it is the only line on that event.

The quarter beats alone left the Normal harbour runs 54-161 s without a line, so a quiet spell gets a working tip too: after 45 s without any radio line, the next of three tips (keys `quiet1` to `quiet3`, tactical, each once per mission, any harbour mission).

| Key | Speaker | Line |
|---|---|---|
| `quiet1` | Piper | Tap or click a group on the map, Kestrel, and we'll fly straight there. |
| `quiet2` | Ines | Look for boats moored in rows. One pattern laid along a row sinks the lot. |
| `quiet3` | Bram | Watch the count on the pattern before you let go. Wait for a full line. |

## 5. Survivor voices

One line for each of the nine Echo crew, said as that soldier is aboard (key `aboard`, tactical). When Reyes is the last aboard, her line gives way to the mission's pickup line, so the moment carries one story line. The seven without a cast entry get one (name, role 'Echo team', an Echo green), so the portrait dot and name show.

| Mission | Crew | Line |
|---|---|---|
| 3.1 | Cpl. Kofi Mensah | Mensah aboard. Reyes split us at the river and took the key north. |
| 3.1 | Medic Lin Tao | Three wounded in my head and none in this aircraft. Fly. I'll manage. |
| 3.2 | Pvt. Sam Hart | Hart aboard. I'd stopped counting the trucks. Thanks, Lantern. |
| 3.2 | Spc. Ada Okoro | Okoro aboard. I kept the sergeant's radio dry the whole way. |
| 3.2 | Pvt. Noor Haddad | Haddad. Eight hours in a culvert. I never want to see water again. |
| 3.3 | Pvt. Teo Brandt | Brandt aboard. The drones followed us all the way up the ridge. |
| 3.3 | Spc. Juno Park | Park aboard, with the wounded. Easy on the turns, Lantern. |
| 3.3 | Pvt. Pell Ashby | Ashby. I thought the storm would get here before you did. |
| 3.3 | Sgt. Mara Reyes | Reyes aboard. I read every file on the ridge, Lantern. Every one. |

Changed so the survivor lines do not repeat it:

| Mission | Speaker | Trigger | Key | Line | Was |
|---|---|---|---|---|---|
| 3.1 Hidden Signals | Kofi | everyone aboard | `pickup` | Both aboard. Reyes has Marrow's files: read them before you trust anyone. | Aboard! The sergeant went north with the key and Marrow's files. She says read them before you trust anyone. The aid station is upriver. |

### Other changed lines

| Mission | Speaker | Trigger | Key | Line | Was |
|---|---|---|---|---|---|
| 1.1 Wake-Up Call | Iona | start | `start` | Cleared in hot, Kestrel. Tap or click the mast to mark it. | Kestrel One, you're cleared in hot. Pipper on the mast. |
| 2.1 Mangrove Mile | Iona | briefing | (brief) | The barges follow your wake, Marlin. Steer them around mines, and put yourself between the barges and any gun that's aiming at them. | The barges follow your wake, Kestrel One. Steer them around mines, and put Marlin between ... |

## 6. Lines the radio now keys

Two lines were said without a key; they now carry one.

| Where | Speaker | Key | Line |
|---|---|---|---|
| Chapter 1, an aircraft shot down | its crew | `downed` (tactical) | (callsign) is hit! Breaking off. |
| Chapter 2, a barge sinks | Okafor | `bargeLost` (story) | Harbor Mercy is going down! Get the crew across! / We lost the second barge! Keep going! |

## 7. The closing-line card and the failure lines

The result dialog opens with the mission's closing line at the top (`#result-quote`: the speaker's dot, name and line): on a win, the mission's `success` radio line; on a loss, the failure line for the reason. These failure lines are new and are shown only on the card.

| Reason | Speaker | Line |
|---|---|---|
| `shelter` | Iona | Abort, abort! That was the shelter. Pull out, Kestrel. |
| `ferry` | Iona | The ferry is hit! Abort the strike, Kestrel. |
| `surge`, city | Iona | High tide's in the low streets. Pull back, Kestrel. We go again. |
| `surge`, harbour | Ines | They've ridden the tide over the bar. They're gone. |
| `flight` | Iona | Kestrel Flight is down. Regroup, and we go again. |
| `ordnance` | Iona | Racks are empty, Kestrel. Come home and rearm. |
| `barges` | Okafor | Both barges are gone. Get us another convoy, Kestrel. |
| `hull`, canal | Iona | Marlin's going down! Everyone off the boat! |
| `hull`, valley | Iona | Lantern is down. Echo, hold on. We're coming back. |
| `station` | Okafor | The station's gone. The gates have stopped. |

## 8. The debrief

| Where | Text |
|---|---|
| Requisition line | +N requisition points · M to spend |
| Requisition button (when the cheapest upgrade is affordable) | Requisition |
| Failure, second button (was a second Retry) | Mission control |
| After two failures of the same mission | Try it on Easy |
| Canal third star | Barges above 80% and Marlin takes at most 2 damage |
| Finale choice panel title | What the files say |
| A file not yet recovered | Not recovered |
| Panel count | You have read N of 6 files |
