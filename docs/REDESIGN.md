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
- **Kestrel Flight.** Up to three aircraft fly passes over the district. The left stick or WASD steers the lane and sets the throttle, which is how you time a pass. Formation spacing toggles between tight and wide. **Salvo** releases one bomb from every aircraft at once, so three pippers, three bomb types, one pass.
- **Four bombs.**

  | Bomb | Role | Behaviour |
  | --- | --- | --- |
  | Drill (orange) | Enemies inside floors | Punches through slabs and detonates on the floor you set. The pipper names the floor it will reach. |
  | Scatter (violet) | Crowds in the open or on rooftops | Bursts into eight bomblets: one at the centre and seven in a ring. |
  | Shockwave (red) | Roofs, flak, jammer masts | Huge blast on first contact that tears roof tiles open. |
  | Lance (cyan) | Moving trucks | Guided. Locks onto the target nearest the pipper. |

- **Patterns and gatherings.** Enemies follow deterministic schedules through doors, stairs and streets. Rally groups (shift changes, musters, the lieutenants' meeting) arrive at a point together on a countdown, shown in the intel strip and as in-world labels. Unit tests prove every member is within 1.5 m of the rally point in every cycle and spread out between cycles.
- **Hiding.** In the late missions a blast alerts the cell. Survivors run for ground floors, and Echo tags their hiding spots so a Drill can follow them down. They then rejoin their schedules. The lesson: make the first strike count.
- **Threats and consequences.** Flak nests telegraph a red lock line for 1.5 s before firing, and one volley can hit an aircraft at most once. A civilian shelter is a no-strike zone: the pipper turns blue and a strike aborts the mission. The Lance has an interlock that releases its lock rather than follow a truck into the shelter's zone.
- **Scoring.** Multi-kill combos pay `n² × 40`. Stars reward clearing every target, staying at or under par, and bringing the flight home undamaged.

The six missions teach one idea each: Shockwave → Drill floors → Scatter + gathering → flak + salvo → hiding + shelter → Lance + convoy + the meeting.

## 5. Chapter 2: Relief Run (the convoy)

- Two relief barges sail in echelon behind Marlin's wake. You lead them around mines and put the gunboat between them and the guns.
- Guns, skiffs and bridge gunners draw a red aim line at their target for about a second before firing. Shots Marlin absorbs are scored as blocks.
- Fuel drums beside gun crews, and the ammunition crate on the Narrows bridge, chain-detonate the whole crew.
- Skiff formations: a **wedge** coming downriver, a **pincer** where two line-abreast groups from the banks meet at a marked point (hit one there and the chain takes the rest), and a **column** overtaking from behind.
- The deck gun reaches about 36 m, so threats get a turn to shoot.
- **Lock Gate boss.** The convoy holds while two gate towers fire telegraphed homing shells. Destroying both drops the generator's shield. Destroying the generator swings the gate leaves open.

## 6. Chapter 3: Last Light (the rescue)

The sortie design was kept. Survivors now have names, and Echo team members speak on the radio when winched aboard. The final sortie ends with Sgt. Reyes and the override key. The valley was rebuilt: jungle canopy, palms, cliff rims, riverside stilt villages, bridges, and Highwater's helipad and control station. All of it is kept clear of rescue sites, caves and patrol roads so scenery never hides gameplay. The sunset lighting uses a warm key with a cool sky fill so the valley stays colourful.

## 7. Art direction and the Blender pipeline

![All 41 assets](asset-sheet.jpg)

- **Kit.** [`tools/blender/style.py`](../tools/blender/style.py) holds the palette, a shared painted-light ramp, soft-bevel builders, weighted normals, and per-pivot mesh batching. [`tools/blender/catalog.py`](../tools/blender/catalog.py) lists each asset's builder, budget and runtime contract.
- **Build.** `blender --background --factory-startup --python tools/blender/build_assets.py -- --output public/models` rebuilds all 41 GLBs (3.13 MiB) and fails if any contract node or material is missing. `tools/blender/render_sheet.py` renders the contact sheets.
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

## 9. Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Steer formation (lane / throttle) | W S / A D | Left stick (portrait: the camera looks along the flight path) |
| Payload, release, salvo | 1–4, Space, X | Payload chips, Release, Salvo |
| Drill floor, formation spacing | E / C, Q | Floor ladder or ± buttons, spacing button |
| Gunboat and helicopter | WASD, pointer aim and fire, 1/2/3 weapons, F flares, hold E winch | Two sticks, weapon and flare buttons, hold Winch |
| Pause, retry | Esc, R | Top bar |
