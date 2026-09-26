# Tidelock 2.0: Operation Breakwater redesign

This document records why the game was redesigned, what changed, and how the result was verified. The earlier plan ([PLAN.md](../PLAN.md)) describes the first release and is kept for history.

![The Glass Tower: a salvo over the lieutenants' meeting](chapter1.png)

## 1. Evaluation of the previous release

| Area | Finding | Consequence |
| --- | --- | --- |
| Story | Three unrelated goals: "clear the relay garrison", "deliver a beacon", "rescue soldiers". No antagonist, no stakes, no clock, no named people. | Nothing made the player care or explained why each chapter followed the last. |
| Chapter 1 | A single side-view building. Enemies stood still in a line. Tuning meant six sliders (angle, speed, fuse, layers, flight path, scope). | Enemy "patterns" and groups didn't exist, so there was no reason to time a strike or pick a bomb. |
| Chapter 2 | Victory by surviving a timer. Enemies scrolled past and killing them was optional. The "beacon delivery" never happened. | The chapter had no objective, so the player had no reason to engage. |
| Chapter 3 | The strongest design (winch rescues, flares, limited ordnance), but disconnected from the story. | Good mechanics without meaning. |
| Art | Muted teal and grey flat-shaded models, pastel water, generic boxes for scenery. | Well below the user's quality bar (Mario Kart 8-style vivid, chunky, readable). |
| Code | `game.js` was a 1,500-line class holding all three chapters. The Chapter 1 forecast integrated at 1/60 s while physics ran at 1/120 s. Cave code had a dead `"closed"` phase, and a turret lookup ran every frame per cannon. | Hard to extend, with small correctness gaps. |

## 2. Research and how it shaped the design

| Reference | Lesson | Where it landed |
| --- | --- | --- |
| *Into the Breach*: [enemy intentions](https://atomicbobomb.home.blog/2020/05/17/into-the-breach-enemy-intentions/), [design postmortem](https://www.gdcvault.com/play/1025772/-Into-the-Breach-Design) | When enemy intentions are telegraphed, a fight becomes a fair puzzle, and every loss feels like the player's own fault. | Red flak lock lines, gun aim lines, pincer meeting rings, gathering countdowns. |
| [Stealth game design](https://www.gamedeveloper.com/design/stealth-game-design): predictable patrols | Players plan around patrols they can predict. The level must let them isolate or catch enemies. | Chapter 1 schedules: patrols converge on rally points at announced times. |
| [*Angry Birds* bird roles](https://en.wikibooks.org/wiki/Angry_Birds/How_to_Play) | Each projectile type answers a different structure or material. | Four bombs with distinct jobs: Drill (floors), Scatter (crowds), Shockwave (roofs and flak), Lance (moving vehicles). |
| [Fixing escort missions](https://www.gamedeveloper.com/design/can-we-fix-escort-mission-game-design-) | Escorts fail when the player can't control pace or protect the escort, and when the escort's AI is dumb. Let the player "tank" damage and heal the escort. | Barges follow Marlin's wake, shots can be body-blocked (+20), and repair pickups heal the barges. |
| [*Choplifter*](https://en.wikipedia.org/wiki/Choplifter), [*Desert Strike*](https://en.wikipedia.org/wiki/Desert_Strike) | Repeated sorties, capacity pressure, resource management and escalating danger. | Chapter 3 kept its sortie loop and gained named survivors and the key carrier. |
| *Ace Combat* [briefings and radio chatter](https://acecombat.wiki.gg/wiki/Briefing) | Story is best delivered through briefings and in-mission radio, while the player keeps control. | Briefing cards with portraits, and a radio feed triggered by gameplay events. |

## 3. Story

**Setting.** Solace Harbor lies three metres below the tide, protected by the Tidelock storm barrier at the mouth of the Verde River. The barrier is controlled from Highwater Station.

**Antagonist.** Marrow built the Tidelock and was blamed for the old sea wall's collapse. He now leads the Ashen Front. His plan is to hold the gates open when Typhoon Ilse peaks at last light and drown the lower city.

**Cast.** Cmdr. Iona Vale (mission control), Sgt. Mara Reyes and Echo recon team, wingmen Piper and Bram, and Dr. Anselm Okafor (Tidelock engineer). Marrow appears as radio intercepts.

| Chapter | Clock | Why it matters | Climax |
| --- | --- | --- | --- |
| 1 Breakwater: Glass District air strikes | T-36h | The Front's jammers blind the harbour. Echo recon reads their patrol schedules so Kestrel Flight can strike when they gather. | The lieutenants' meeting in the Glass Tower. Echo recovers the master override key but is exposed. |
| 2 Relief Run: Verde River convoy | T-20h | Okafor's barges carry the pumps and the crew who can run the Tidelock. | Breaking the Highwater lock gate. The station is retaken, but the gates won't move without the key. |
| 3 Last Light: Cinder Valley rescue | T-6h | Echo team, scattered in the valley, carries the key. | Reyes is the last soldier winched aboard. The Tidelock closes as the surge arrives. |

Story data lives in [`src/story.js`](../src/story.js). Each mission has a place, a clock time, goals, briefing lines, gameplay-triggered radio lines, and success and failure debriefs. Failure debriefs are specific (shelter struck, flight lost, barges sunk).

## 4. Chapter 1: Breakwater (the city strike)

This is the chapter the brief asked about directly: *a grid of high buildings, several aircraft together, many bomb types, enemies hiding, and enemies whose patterns bring them together.*

- **City grid.** 3×2 and 3×3 districts of 2–7-storey towers. Every roof and floor slab tile and every wall panel is destructible, drawn with instanced meshes. South faces are glass curtain walls, so you can see into the floors where enemies hide.
- **Kestrel Flight.** Up to three aircraft sweep back and forth over the district at an unhurried 3.4 m/s. At each edge they turn round with a wingover and come back along the same lane, and **Reverse** turns them round at any moment. The left stick or WASD steers the lane and sets the speed; speed is screen-relative, so pushing toward the direction of flight speeds up. Formation spacing toggles between tight and wide. **Salvo** releases one bomb from every aircraft at once, so three pippers, three bomb types, one pass. A mouse click on the map releases, like Space.
- **Four bombs.**

  | Bomb | Role | Behaviour |
  | --- | --- | --- |
  | Drill (orange) | Enemies inside floors | Punches through slabs and detonates on the floor you set. The pipper names the floor it will reach. |
  | Scatter (violet) | Crowds in the open or on rooftops | Bursts into eight bomblets: one at the centre and seven in a ring. |
  | Shockwave (red) | Roofs, flak, jammer masts | Huge blast on first contact that tears roof tiles open. |
  | Lance (cyan) | Moving trucks | Guided. Locks the nearest target it can actually reach, marked by a cyan ring. |

- **Patterns and gatherings.** Enemies follow deterministic schedules through doors, stairs and streets. Rally groups (shift changes, musters, the lieutenants' meeting) arrive at a point together on a countdown, shown in the intel strip and as in-world labels. While a gathering is on, its label counts who is actually there; if an alert sends them running, it reads SCATTERED. Each gathering lasts 20 s: at worst a Reverse, a short run back and a second Reverse bring the pipper over any point in about 10 s. Unit tests prove every member is within 1.5 m of the rally point in every cycle and spread out between cycles.
- **Hiding.** In the late missions a blast alerts the cell. Survivors run for ground floors, and Echo tags their hiding spots so a Drill can follow them down. They then rejoin their schedules. The lesson: make the first strike count.
- **Threats and consequences.** Flak nests telegraph a red lock line for 2 s before firing. A volley can hurt only the aircraft its lock line names, and only once. The fire solution freezes 0.8 s before the shot: the line stops flickering and the HUD shows BREAK. A lane change from then on throws the volley off; at the slow flight's speeds the throttle alone cannot. Nests reload for 7 s, because the slow flight stays in range longer. A civilian shelter is a no-strike zone: the pipper turns blue and a strike aborts the mission. The Lance has an interlock that releases its lock rather than follow a truck into the shelter's zone.
- **Scoring.** Multi-kill combos pay `n² × 40`. Stars reward clearing every target, staying at or under par, and bringing the flight home undamaged.

The city missions teach one idea each: Shockwave → Drill floors → Scatter + gathering → flak + salvo → hiding + shelter → Lance + convoy + the meeting. Three harbour missions follow (§10). In the teaching missions, a coach line above the flight panel explains the idea, worded for keyboard or touch. The flight panel only shows the controls that mission's flight can use.

## 5. Chapter 2: Relief Run (the convoy)

- Two relief barges sail in echelon behind Marlin's wake. You lead them around mines and put the gunboat between them and the guns.
- Guns, skiffs and bridge gunners draw a red aim line at their target for about a second before firing. Shots Marlin absorbs are scored as blocks.
- Fuel drums beside gun crews, and the ammunition crate on the Narrows bridge, chain-detonate the whole crew.
- Skiff formations: a **wedge** coming downriver, a **pincer** where two line-abreast groups from the banks meet at a marked point (hit one there and the chain takes the rest), and a **column** overtaking from behind.
- The deck gun reaches about 36 m, so threats get a turn to shoot.
- **Lock Gate boss.** The convoy holds while two gate towers fire telegraphed homing shells, and skiff pincers slip out of the bank channels beside the towers. Destroying both towers drops the generator's shield. Destroying the generator swings the gate leaves open, and Highwater's field medal floats out through the gap.
- Kills that land within a second of each other chain into one combo worth `n² × 30`.

## 6. Chapter 3: Last Light (the rescue)

The sortie design was kept. Survivors now have names, and Echo team members speak on the radio when winched aboard. The final sortie ends with Sgt. Reyes and the override key. The valley was rebuilt: jungle canopy, palms, cliff rims, riverside stilt villages, bridges, and Highwater's helipad and control station. All of it is kept clear of rescue sites, caves and patrol roads so scenery never hides gameplay. The sunset lighting uses a warm key with a cool sky fill so the valley stays colourful.

## 7. Art direction and the Blender pipeline

![The Blender assets](asset-sheet.jpg)

- **Kit.** [`tools/blender/style.py`](../tools/blender/style.py) holds the palette, a shared painted-light ramp, soft-bevel builders, weighted normals, and per-pivot mesh batching. [`tools/blender/catalog.py`](../tools/blender/catalog.py) lists each asset's builder, budget and runtime contract.
- **Build.** `blender --background --factory-startup --python tools/blender/build_assets.py -- --output public/models` rebuilds all 49 GLBs (3.64 MiB, including the eight harbour models) and fails if any contract node or material is missing. `tools/blender/render_sheet.py` renders the contact sheets.
- **Palette.** Friendly units are sky blue and sunflower, hostile ones charcoal and ember, relief mint. Environment colours are vivid and warm; beige is avoided.
- **Runtime.** Renderer: Neutral tone mapping, a sky gradient and lighting mood per chapter, and a brighter water shader. VFX: layered sprite explosions (flash, fireball, sparks, smoke), light flashes, and debris rigid bodies. [`src/consolidate.js`](../src/consolidate.js) merges static parts into vertex-coloured meshes at load time. `WorldView.instances` draws scenery props instanced. Together these cut the Glass Tower scene from about 1,250 to about 500 draw calls.

## 8. Code and logic review

Architecture: `game.js` is now the shared core (entities, projectiles, damage, effects, results). Each chapter is an operation class: [`strike.js`](../src/strike.js), [`river.js`](../src/river.js) and [`rescue.js`](../src/rescue.js). The pure rules they build on live in `strike-data.js`, `river-data.js` and `rescue-data.js`, and are unit-tested in Node.

Defects found and fixed during the redesign, most of them by the new tests:

1. **Scatter forecast drift.** The forecast stepped at 1/60 s but the live bomb at 1/120 s, so canisters that clipped a building edge burst on the roof in the live game while the pipper showed ground impact (about 5 m off). The forecast now steps at 1/120 s, and a test asserts the forecast and a mirrored live loop agree to 1e-6.
2. **Scatter coverage gap.** The old ring pattern left a hole at the centre, so a bomb centred on a single target could miss it. It now uses one centre bomblet and a ring, and a test checks the solid disc.
3. **Bomblets overshooting.** Bomblets thrown from a roof used the roof's fall time, flew past its edge and struck a civilian shelter. Each bomblet is now timed to the surface beneath its own landing point.
4. **Unsafe shelter warning.** The shelter warning and the abort used different rules, so a correct strike near the shelter was flagged unsafe. One shared rule (`shelterStruck`) now drives both.
5. **Wrong Drill floor.** A Drill that clipped a corner low down was labelled with the floor that had been set. It now reports the floor it actually reaches, and hits inside a slab count as the floor that slab carries.
6. **Late radio cues.** River scripts were out of order, so radio cues fired late. Scripts are now sorted by distance.
7. **Flak too lethal.** One volley could hit an aircraft three times, and Kestrel Two died within 4 s. Now each volley hurts an aircraft at most once, locks last 1.5 s, there is a grace period, and aircraft have 3 HP.
8. **Cheap Chapter 2 wins.** The deck gun outranged every threat, so a naive skipper won with 3 stars. Its range is now 36 m, and enemy guns start aiming earlier.
9. **Opening radio line lost.** The chapter's first radio line was wiped by the HUD reset. Operations now speak on their first update.
10. **Dead and wasteful code.** The dead cave `"closed"` phase and the per-frame turret lookups are gone. The obsolete cannon-es bomb path and loadout sliders were removed.

An independent review of the finished source then reproduced 12 more defects. All were fixed and pinned with regression tests:

| # | Defect | Fix |
| --- | --- | --- |
| 1 | A Drill passing *through* the shelter on its way to the street aborted the mission with no pipper warning. | The forecast records every block the Drill crosses and flags shelter crossings. |
| 2 | Tapping a floor on the ladder failed on touch, because the rows were rebuilt every 80 ms. | Rows are rebuilt only when the building changes, and floors are chosen on press. |
| 3 | The flak warning could stay on screen into Chapters 2 and 3. | Cleared on every mission start. |
| 4 | Column skiffs lost their trailing boats on the tick they spawned. | Only downriver patterns despawn at the bottom edge. |
| 5 | The pipper could lag the real release by up to 70 ms. | The bomb's forecast (and Lance lock) is recomputed at the instant of release. |
| 6 | Losing the flight failed the mission while bombs were still falling, and bombs froze mid-air. | The fail waits for ordnance in flight; bombs, flak and projectiles resolve after the result. |
| 7 | Opening the Story panel during the finish delay left the game paused with no dialog. | Closing the panel always resumes unless another dialog is open. |
| 8 | People walked across broken floors, and flak nests floated over broken roofs. | O(1) per-tick support checks drop people and wreck rooftop props. After a second fall a person takes cover downstairs instead of looping. |
| 9 | Rejoining a schedule could snap a person 4 m, or 1.2 m up a stair. | The rejoin target is iterated until the arrival time settles, and partial stair climbs take time. |
| 10 | City disposal freed shared geometry, and the shelter decal texture leaked. | Meshes free only what they own; decal textures are released. |
| 11 | Icons in the rally chips never rendered. | Chips are rebuilt only on change, then icons are drawn. |
| 12 | The Glass Tower's ROOF row couldn't be selected. | The Drill floor range follows the tallest building. |

Balancing after these fixes: once column skiffs arrived at full strength, one stretch of The Narrows stacked into a 6-shield burst in one second. The extra wedge was removed and skiff first shots now ripple down the formation. Boss waves alternate banks instead of picking one at random.

## 9. Second review pass (Tidelock 2.1)

A second pass first evaluated the game by playing it. Three independent reviews followed: Chapter 1; Chapters 2–3 with the shared core; and the UI across desktop, touch and phone layouts. Every finding below was reproduced before it was fixed, and each fix is pinned by a Node test or a browser check.

**Evaluation (playing the game):**

| Finding | Fix |
| --- | --- |
| The pipper ring drew on top of buildings in front of it, so a ring behind a tower looked as if it sat on the roof. | The ring is drawn twice: solid where the impact point is visible, faint through buildings. |
| Bombs alternated between the wing pylons, so the pipper jumped sideways after every release. | Every release comes from the centreline pylon. |
| Only 34% of each pass cycle had a pipper over the district. Gatherings (7–9 s) were shorter than a pass cycle, so some couldn't be reached at normal speed. | The flight speeds up once the pipper leaves the district, the turn is shorter, and gatherings last 12 s. |
| Flak led the aircraft's velocity at the moment it fired, so a player who broke on the warning steered into the volley. | The fire solution freezes 0.6 s before the shot, and the HUD says BREAK. |
| The strike camera applied its screen reserves upside down, so the district sat under the flight panel at every screen size. | Fixed. The UI reports how much height the flight panel and touch stick take, and the camera frames the district above them. |
| Teaching missions didn't teach. Touch briefings listed keyboard keys. Mission 1.1 showed Drill, Salvo and formation controls it can't use. | Coach hints, touch control hints, and a flight panel that only shows usable controls. |
| Text promised a "gold pipper" (the rings are bomb-coloured). The drum-chain congratulation played before the player had done anything. | Text and radio cues corrected. |

**Chapter 1 review:**

| Defect | Fix |
| --- | --- |
| The live Drill slowed through each slab but its forecast didn't, so it detonated short of the floor shown. | Both apply the same slowdown per slab. A browser check drops a Drill and compares the detonation with the forecast. |
| The Lance locked targets it could never reach. | It simulates its own guidance against each candidate's predicted path and locks the first one it can reach. |
| Someone standing on a slab counted as hidden by that same slab. | Sightline tests skip blocks that hold either end of the line. |
| A flak lock hopped between aircraft, and all nests shared one lock line. | Each nest has its own line and keeps its target while that target stays in reach. |
| A mission could succeed while bombs were still falling, cutting off their kills and combo. | Success waits for ordnance in flight. |
| The gathering radio call fired even when the group had scattered. | It needs at least half the group present, and labels show who is there. |
| When Scatter burst inside a roof, its bomblets spread from below the surface. | The burst centre is lifted to the surface along the approach. |
| A radio line could play only once per mission, and missions without their own line stayed silent. | Each line has a cooldown, and shared fallback lines fill the gaps. |

**Chapters 2–3 and the shared core:**

| Defect | Fix |
| --- | --- |
| Gate towers are 7 m tall, but only their top half registered hits. | Three hit spheres cover each tower from base to top. |
| The Lock Gate medal spawned so late that it could never reach Marlin. | It floats out through the gate once it opens, and the leg is 10 m longer. |
| A skiff that was aiming skipped its ram check and sailed through the barges. Rams also paid the player for a kill. | The ram check runs first, and a ramming skiff dies without a reward. |
| Rearming at the base took away rockets the crew had picked up. | The base tops racks up to the standard load and never lowers them. |
| Losing the barges blew up Marlin, and the fail sound only played for missions without a player craft. | Only a hull breach destroys the player's craft, and every failure plays the fail sound. |
| Shots blocked after the mission ended still scored. | Blocks score only while the mission is live. |
| Boss waves were skiff columns sailing through the closed gate, and the lock checkpoint was announced twice. | Pincers from the bank channels, and one checkpoint. |
| Aim lines outlived their shooters, and turret and rotor nodes were looked up every tick. | Lines are disposed with their shooter, and nodes are cached. |

**UI review:**

| Defect | Fix |
| --- | --- |
| Touchscreen laptops always got the touch layout. | The primary pointer decides first, then the last input used. |
| A Space or Enter held from the last release clicked through the result dialog. | Repeated confirm keys are ignored while a dialog is open, and the result dialog focuses its main action. |
| Keys were read by character, so AZERTY players couldn't steer. | Gameplay keys use physical key codes. |
| A resize, such as a phone toolbar sliding away, dropped the stick under the player's thumb. | Resizes clear only held keys. |
| The flak pill's pulse animation undid its centring. On phones it covered the radio or ran off-screen. | Each placement has its own animation, and on phones callouts sit above the flight panel or the stick. |
| Space re-pressed the last HUD button clicked, and ladder floors ignored the keyboard. | Pointer clicks hand focus back to the game, and ladder floors respond to click and keyboard. |
| A failed script or model load left the loading bar running forever. | Both show an error and a Reload button. |
| The game always opened at mission 1.1. | It resumes at the first mission without a record. |
| The in-game Reduced motion setting only stilled the camera. Dialogs, sticks and star ratings had no accessible names. | The setting stills the HUD too. Dialogs are labelled, the decorative sticks are hidden from assistive technology, and mission buttons announce their stars. |
| HUD refreshes rebuilt identical markup and re-read the canvas position for every label. | Markup is replaced only when it changes, and the canvas position is cached on resize. |

## 10. Tidelock 2.2: the slow flight and the harbour strikes

### The brief

Make the aircraft about three times slower so decisions can be calm and the game easier; let the flight fly left-to-right and right-to-left; release with a mouse click or Space; make sure phones work. Then extend the bombing with harbour stages: bombs that fall in a line ("stride") or in shapes such as a square, rectangle, U, O or L, whose angle changes, fitted onto battleships that move slowly away from the danger and sometimes gather in shapes.

### Evaluation of the idea, and what changed

| The idea | Kept | Changed, and why |
| --- | --- | --- |
| A slower flight | Speed 10 → 3.4 m/s | The old fixed loop (fly off the east edge, reappear in the west) would have left three times as much dead time. The flight now sweeps back and forth and turns round just past each edge, so every pass crosses the targets. |
| Both directions | Yes | Direction is a decision, not a menu choice: **Reverse** (F, or the button) turns the flight round at any moment with a wingover along the same lane. A player who just missed turns back instead of waiting a whole loop. |
| Click or Space to release | Yes | Touch keeps the Release button. A stray tap on the map would waste a bomb, and on a phone the map is where your thumb rests. |
| A line of bombs at a different angle each time | The Stick: five bombs in a line | **The player turns the pattern** in 45° steps (E / C, the mouse wheel, or the dial). A random angle per bomb would make the puzzle luck. The variety comes from the targets instead: the column waits on a diagonal, then wheels south, and a destroyer's hull lies along its own heading. |
| Square, rectangle, U, O and L shapes | Box (3 × 2), U, O-Ring, L | Each shape has **a reason in the harbour**: the L fits boats moored round a pier corner, the U fits a dry dock with its open end toward the civilian launch in the entrance, the Box fits boats rafted side by side, and the O-Ring fits escorts circling a ferry. The ring spares whatever sits inside it, which is the whole point. |
| Ships move away from the danger | Yes, gently, and honestly | Ships sidestep only once bombs are **falling**: after a 0.8 s reaction they move straight away from the nearest bomblet at up to half a metre a second, a few tenths of a metre in all. Moored boats and civilians can't. Ships that fled the aiming ring itself would make aiming a chase. **The pipper's count already includes the sidestep**, so what it says is what sinks. A well-centred pattern still lands; a hull at the edge of a sloppy one slips out. |
| Ships gather in shapes | Yes, on a timetable | Formations follow schedules shown in the intel strip, like the city's gatherings: the column holds at the buoys, then wheels for the mouth; the frigate anchors in the roads; the destroyer runs for the mouth. |

Added on top:

- **A civilian in every harbour.** The *Island Belle* ferry and a pilot launch are no-strike, like the city shelter. The pattern turns blue when it would touch one, a strike that does aborts the mission, and the forecast keeps a 0.4 m safety margin.
- **The pipper counts.** Pattern cells are drawn on the water where the bomblets will land, predicted for where the ships will be when they land. A label reads "3 ON TARGET / 2 SINK", ships under the pattern turn their markers yellow, and the side panel shows the shape and its angle.
- **Hull hits.** Ships are hull segments with a beam. Patrol boats take 1 hit, missile boats 2, the flak frigate 3 and the destroyer *Cinder* 5, so lining a Stick up along a long hull is what sinks it.

### The harbour missions

| Mission | Lesson | Targets |
| --- | --- | --- |
| 1.7 Harbour Mouth | The Stick and its angle | A patrol column waiting on the diagonal channel, then wheeling south for the mouth; two missile boats against the north quay. |
| 1.8 Dry Dock | The L and U shapes, civilians | Missile boats round the corner of the L pier; boats against three walls of the dry dock with the pilot launch in the entrance; a flak frigate at anchor; the Island Belle crossing. |
| 1.9 The Ring | The O-Ring and the Box | Five escorts circling the seized Island Belle (sink them and she steams clear); missile boats rafted at the fuel pier; the destroyer Cinder and a flak frigate. |

![The O-Ring centred on the Island Belle: five escorts on target, the ferry spared](chapter1-harbour.png)

Harbourmaster Ines Duarte joins the cast. The flotilla stands between the city and the river mouth, so Chapter 1 now ends by opening the way for Okafor's convoy in Chapter 2.

### Design checks (Node tests)

- For every group, the intended pattern at the intended angle sinks the whole group in one release, sidesteps included, without touching a civilian.
- For the angle lessons (the column, the frigate, the L pier, the destroyer), no aim point sinks the whole group with the pattern turned a quarter the wrong way.
- On the L pier the L has at least four times the sweet spot (aim points that sink all four boats) of any other shape.
- The O-Ring centred on the ferry sinks the escorts and spares her; two metres off-centre it would hit her, which is what the warning is for.
- No hull ever overlaps another or a quay over four minutes of every timetable, including its turns and the freed ferry's run to safety.

### Found in review and fixed while building

- **Release on the first frame.** Before the first update the aircraft sat at the world origin, so a release on frame 0 dropped a bomb from ground level straight onto the nearest ships. The flight is now positioned when the mission is built.
- **Forecast at the edge of reach.** Bomblet drag moved a ring cell 6 cm, from just outside the ferry's reach to just inside it. Civilian checks now keep a margin.
- **The freed ferry sailed into the destroyer's anchorage.** It now steams to the west roads. A test flies its route against every other timetable.
- **Pattern reach too generous.** At a 1.7 m bomblet radius any shape fitted a compact group, so the shapes didn't matter. Pattern bomblets are now 1.3 m, with the hit counter guiding the player.
- **Flak hit wingmen.** Breaking away moved the whole formation into the predicted spot of the aircraft that was locked, so its wingman took the volley. A volley now threatens only its target.
- **Double releases.** With the slower flight the pipper lingers on a target, and the scripted pilot released a second bomb before the first had landed. The same thing would waste a player's bomb: only the aircraft whose pipper is bright releases, and the next one ripples in only once it is ready.

### Independent review of the harbour update

A separate reviewer read the whole change and reproduced each defect in the browser before reporting it. All of them are fixed and covered by the checks listed in VERIFICATION.md.

| # | Defect | Fix |
| --- | --- | --- |
| 1 | Evasion made the pipper's count wrong. It said "4 SINK" over the column where at most 3 could sink, so 1.7's par was impossible and the 1.9 ring often came up short. | Sidesteps are predictable (a fixed direction and distance) and the forecast applies them. Evasion is gentler. A browser check flies a Stick onto the column and an O-Ring onto the ferry, reads the count, releases, and counts what sinks: they match. |
| 2 | Forecast and live hulls disagreed about heading while ships sailed, by up to 86°, and hulls snapped by up to 179° at the ends of legs. | One heading model for both: turn onto the course early in each leg and onto the next station's heading late, continuously. Sidesteps move a hull without turning it. The 1.9 ring, ferry and frigate were moved so that no turn sweeps across another hull. |
| 3 | The throttle could no longer dodge flak at the slow speeds, but the briefing and radio still said it could. | The text now says "change lane when it says break". |
| 4 | Payload keys followed an internal order, not the chips on screen: in 1.9 key 1 chose the last chip. | Keys and tooltips number the chips in the order they appear, card by card. |
| 5 | A dimmed wingman's pipper over the ferry raised the alarm while the selected pattern was clear. | Every pipper over a civilian turns blue; only the next release raises the alarm. |
| 6 | The mouse wheel turned the dial once per event: a trackpad spun it round, and sideways scrolls turned it too. | Wheel movement accumulates into one step per notch; sideways scrolling is ignored. |
| 7 | With a single bomb selected in a harbour, the dial still showed "DRILL F1" and E / C changed an unused floor. | The dial controls a pattern's angle or the Drill floor, and is disabled and labelled accordingly when it has nothing to control. |
| 8 | On the tick a turn ended, release was allowed but the aircraft had no speed, so the bomb landed short of the pipper. | The aircraft carry their new speed on that tick. |
| 9 | Reverse just after an edge turn turned the flight straight back out, and the edge turned it round again. | Reverse (and its button) is refused where it would point the flight back past the edge. |
| 10 | The wingover at the west edge happened under the mission panel. | The landscape camera frames the whole sweep, turns included. |
| 11 | Hitting the pilot launch was reported as hitting the Island Belle. | Warnings say "civilian", and the debrief names the boat that was hit. |
| 12 | Freeing the ferry with the last kill played its radio line after the victory line. | Nothing is freed once the mission is decided. |

Smaller notes from the same review were fixed too:
- turrets turn the short way round;
- the destroyer's aft turret has one owner;
- the panel shows the count the instant a bomb drops, and TURNING during turns;
- the portrait speed arrow points down the screen;
- decorative gunboats no longer sit past the harbour's south quay, where they could be mistaken for targets;
- flight panel key hints hide in narrow windows;
- duplicated CSS is gone;
- the save migration has a test;
- a pen tap no longer releases a bomb.

## 11. Tidelock 2.3: mark the drop, a wider city

### The brief

Make the city strikes easier. Fly even slower and make the drop point easy to control. Early bombs hit harder, so a near miss still destroys the target, and bombs home a little onto a target they nearly hit. Make the city three times wider and four times deeper. Let the camera follow a large area and slide only when the flight goes far. Then: more bombs and a shorter wait between releases.

### What changed

| Ask | Change |
| --- | --- |
| Easier control of the drop | **Mark the drop.** Click or tap the city (or the new map panel) and the flight steers there by itself: lane, speed and turning round. It releases when the pipper sits on the mark. A mark on a target within 3.5 m snaps to it and follows it. A Drill marked on someone indoors sets its own floor and only enters their building. Holding any steering input takes over; a right click cancels; Space still drops at once. The auto-release refuses whenever the pipper is blue (shelter or civilian). |
| Slower flight | 3.4 → 2.4 m/s; the throttle still reaches 6.5 m/s for the long way round. |
| Stronger early bombs | Each city mission has a **power** that scales blast radius: 1.6× on 1.1 down to 1.2× on 1.6. The pipper ring and the shelter check use the same radius. The harbour's pattern bomblets keep their size, because fitting the shape is the puzzle there. |
| Bombs that track | **Homing assist.** A bomb homes gently (6 m/s²) onto the nearest target within the mission's assist radius of its forecast impact: 4.5 m on 1.1 down to 2.5 m on 1.6 and the harbour. A gold ring shows what it will home onto. The Lance keeps its own guidance, and pattern bombs don't home. **The assist never homes onto a target whose blast would reach the shelter or a civilian hull,** because the forecast only vouches for the unassisted impact. |
| 3× wider, 4× deeper city | The authored district sits in the middle of a grid 3× its width and 4× its depth. Every other lot holds a generated tower (2–6 storeys) or a pocket park, the same every time. That's 60–95 buildings and up to 11,700 destructible blocks. A spatial index (buildings by grid cell, blocks by building) keeps a forecast under a millisecond. |
| Track a large area | The camera frames a window of about four by three blocks. **It only slides when the pipper strays past the middle 70 % of it**, smoothly, never past the city's edge; the sun and its shadows travel with it. A map panel shows the whole city, the window, targets, gatherings, the flight and the mark, and a click on it marks a drop there. On phones the map is hidden (tap the city itself). |
| More bombs, shorter reload | City payloads roughly doubled (1.1 carries 4 Shockwaves instead of 2, the Glass Tower's lead aircraft 8 Drills and 2 Lances) and the harbour's raised by half or more. An aircraft is ready to release again after 0.25 s instead of 0.6 s. |

Also:
- **The flight stays over the action.** With no mark, it turns round 18 m past the last live target instead of crossing empty blocks to the far edge (57 s each way at the new speed).
- **The outer city is quieter.** Cars, street lamps, trees and roof plant thin out more than a block from the mission's own district, keeping the scene at 180–450 draw calls and 0.7–1.1 M triangles (shadow pass included). On the test GPU a frame costs less than 2.2's did.

### Found while building

- **A moving mark made the flight turn back and forth.** A truck circling the Glass Tower block swung behind the flight and ahead again; each time the autopilot reversed. Automatic turns are now at least 5 s apart, and a mark that the Lance has locked, or that the homing assist has, releases without waiting for the pipper to sit exactly on it.
- **Homing onto the shelter.** On 1.5 an assisted bomb bent onto a fighter beside the civilian shelter. See the assist rule above.
- **Right-to-left segments lost their search margin** in the new building index, so a segment could miss a building it clipped. Both directions now search the same box, and a Node test compares the index with a search of every building for 600 random points and segments.
- **The scripted pilot re-marked its target while the first bomb was falling** and dropped extra bombs. It now waits for the bomb, like the release rule it tests.

## 12. Tidelock 2.4: crowded harbours and a canal at war

### The brief

In the harbour: change the bomb shape between a vertical line, a horizontal line and the rest with a button or a click, and put more than 30 ships in each harbour so it looks crowded and fun. On the canal escort: make the guns, bullets and missiles clearer and more beautiful, give the player more power, more levels and a larger canal, and more weapons such as a laser and rockets. Add a strike button for help, and bonus packets on the way: an Apache helicopter that joins and fires where the player fires, or allied boats with guns that fire at the enemy.

### The harbour

| Ask | Change |
| --- | --- |
| Change the shape with a button or a click | **Angle buttons.** Under the pattern diagram, four buttons show the actual shape across, on both diagonals and up and down. Tap one to point the pattern along it; tap the lit one again to flip it half round (which matters for the L and the U). Clicking the diagram turns it one step. E / C, the wheel and the dial still work. The O-Ring looks the same at every angle, so it has no buttons. |
| More than 30 ships | **Every harbour gained a west and an east basin**, behind piers off a quay that now runs the whole width. The camera slides over them like the city's, and the map panel shows all three basins. 1.7 has 36 boats, 1.8 32 and 1.9 41. The new ones are mostly **raiders**, small fast boats that sink with one hit, moored and formed up so the shapes pay off: three rows at the west boatyard (a Stick across each row, or a vertical Stick between two columns for six), raider lines abreast in the east anchorage (a vertical Stick each), wheeling columns (the diagonal), L-shaped slipways, a U-shaped slip, rafts for the Box, and eight raiders circling the west basin for the O-Ring. |
| Crowded but still easy | **A quota.** Sink 30 of 36, 27 of 32 or 34 of 41, including each harbour's key ships (the channel column, the flak frigate, the escort ring and Cinder); the rest run for the open sea. Payloads grew to match (up to 22 bombs in 1.9), and a flight with no mark turns round near the boats rather than at the far quay. |

![The west basin of 1.9: an O-Ring over eight circling raiders, rafts beside it](chapter1-crowd.png)

Every new group is held to the harbour's rules in Node tests: its intended pattern and angle sinks it in one release with the sidesteps included; no hull overlaps another or a quay over four minutes of every timetable; and every harbour has 30 or more boats, a quota between 80 % and 100 % of them, and enough bombs for it.

### The canal

| Ask | Change |
| --- | --- |
| A larger canal | The banks moved from ±12.2 m to ±17.5 m. Guns, crews, launchers, the bridge, the lock gate and the skiff formations all spread to the wider water, and narrow screens keep the whole width in view. |
| Clearer, more beautiful fire | Marlin's rounds are bright gold tracers in a soft halo; enemy rounds are glowing fireballs that shed embers; missiles and rockets burn at the tail and leave smoke. Muzzle flashes are bigger. The shots use shared geometry, so the extra glow costs no extra draw calls. |
| More weapons | Keys 1, 2 and 3 (or the weapon icons): the **deck gun**; **rockets**, fired in salvos of three that home on what you aim at and burst (18 to start, crates add 9); and the **laser**, a held beam that burns the first enemy it touches and knocks down missiles. The laser overheats after 3.2 s of fire and restarts once it has cooled. |
| More power | The deck gun hits twice as hard and a little faster, the barges have half as much armour again (24), twin guns last 10 s and guided support 8 s. |
| A strike button | **Air strike (Q or the orange icon).** Kestrel Two lays a line of nine bombs right across the canal where Marlin aims, marked on the water first. It always falls well ahead of the barges. Two per mission; crates add more. |
| Bonus packets | Floating crates now carry help as well as repairs: the **Hornet gunship** (Capt. Sol Adeyemi) flies Marlin's wing for 20 s and shoots where Marlin shoots, or at the nearest threat, with a rocket every few seconds; **Duarte's escort launch** rides beside the barges for 25 s and shoots whatever comes closest; and crates of **rockets** and **air strikes**. Timers for the help show beside the weapon bonuses. Help doesn't count towards Marlin's accuracy. |
| More levels | Three new canal missions before Lock Gate: **2.3 Floodplain** (skiff swarms on wide water: rockets and the air strike), **2.4 Sawmill Reach** (gun lines in a lumber camp and a log bridge: the laser, and the escort joins), **2.5 The Cut** (gun lines on both banks the whole way, with every kind of help). Lock Gate is now 2.6, with tougher towers and help crates of its own. Saves from 2.3 and earlier keep their records on the right missions. |

Two new Blender models carry the help: the **gunship** (a tandem-seat attack helicopter in Kestrel navy and sky with stub wings, rocket pods, missile rails and a chin cannon; 5.9k triangles) and the **escort boat** (a white launch with sky and sunflower stripes and a twin gun; 4.1k), so neither can be mistaken for Marlin or the rescue helicopter. The asset library is 4.1 MB of its 4.5 MiB budget.

![The Floodplain: Marlin's laser, the Hornet gunship and the escort launch](chapter2.png)

### Independent review of 2.4

A separate reviewer read the change and reproduced each defect with a browser probe before reporting it. All are fixed.

| # | Defect | Fix |
| --- | --- | --- |
| 1 | The Drill ladder's button style overrode the new angle buttons: their pictures shrank to nothing and on phones the fourth button spilled out of the panel. | The ladder's style applies to floor rows only; the buttons wrap two by two on portrait phones and sit in one row on short ones. |
| 2 | Two air strikes beat the Lock Gate boss without a shot: overlapping bombs each dealt full damage, and one strike reached both towers. | A strike hits any one target once, and the gate's towers and generator are hardened (6 damage a strike). A check strikes the gate twice and finds everything standing. |
| 3 | On touch, the air strike always fell at the default aim once the fire stick was let go. | The stick's last aim stays the aim. |
| 4 | In portrait the angle buttons and the pattern diagram were drawn in world orientation, a quarter turn off what the rotated camera shows. | They are drawn as seen on screen (like the minimap), with labels to match. |
| 5 | A desktop render check still used the old mission numbers and no longer covered the gate or the rescue. | It renders Lock Gate and the first rescue again. |

Smaller findings, also fixed:
- the rocket rack's "empty" style carried over into the rescue chapter;
- after a mission ended the laser beam stayed lit and the bombers and help froze in mid-air (they now fly on, harmlessly);
- the gunship could spin a full turn when the aim crossed behind it;
- the escort's comments described its targeting wrongly, and its range outreached its bullets (now 34 m). Aiming it at the threat nearest the barges instead let skiff columns past it on its own side, so it keeps guarding its side;
- embers could crowd kill explosions out of the effect budget (embers now stop well short of the cap);
- keyboard-only wording ("press Q", "key 2") reached touch players;
- a check that could never fail now measures that every bomb bursts more than 10 m ahead of the nearest barge;
- the widened lock gate's doors skewed as they opened (it now scales evenly);
- the harbour's star criterion still said "every target";
- clicking the diagram of a single bomb turned an unused pattern;
- and a few dead checks and duplicated values.

Kills by the gunship, the escort and the air strike count towards the score and combos, as the flight's own help; they don't count towards Marlin's accuracy.

## 13. Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Steer formation (lane / speed) | W S / A D | Left stick (portrait: the camera looks along the flight path) |
| Turn the flight round | F | Reverse |
| Mark the drop (the flight flies there and releases) | Click the city or the map; right click cancels | Tap the city |
| Payload, release now, salvo | 1–9, Space, X | Payload chips, Release, Salvo |
| Drill floor or pattern angle, formation spacing | E / C or the mouse wheel, the angle buttons, Q | Floor ladder, the dial's arrows or the angle buttons, spacing button |
| Gunboat | WASD, pointer aim and fire, 1 gun / 2 rockets / 3 laser, Q air strike | Two sticks, weapon icons, strike icon |
| Helicopter | WASD, pointer aim and fire, 1 gun / 2 rockets / 3 guided, F flares, hold E winch | Two sticks, weapon and flare buttons, hold Winch |
| Pause, retry | Esc, R | Top bar |

Keys are read by physical position, so on an AZERTY keyboard Z Q S D steer like W A S D.
