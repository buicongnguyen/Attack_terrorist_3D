# Plan 5.1: "High Tide": see it, read it, feel it

Written 2026-11-19 from a multi-agent evaluation of the 5.0 build (seven play-testing lenses, three planners, two judges, a critic and a refinement pass). Earlier plans: [PLAN-4.0](PLAN-4.0.md), [PLAN-5.0](PLAN-5.0.md).

## Thesis

Tidelock already simulates a city racing a typhoon, but players feel little of that pressure:

- On a phone the tide clock is hidden.
- On Normal the harbour is a trap: the pilot meets the quota and still runs out of bombs before the last key hull.
- Doing nothing wins 2.1 in 9 of 16 seeds.
- 63% of canal fire is launched from above the visible frame.
- Each mission's closing radio line is covered after 1.41 s.

5.1 "High Tide" fixes what players see, read and feel. It is built on a test net strong enough to prove that nothing else moved.

- **A clock you can see.** Landfall is tonight at 19:10, which fits the mission clocks (06:40 to 19:10, one day). Chapter 1 reads HIGH TIDE in the top bar at every width, and every duration carries its units ('LANDFALL 19:10 · 12 H 30 MIN').
- **Every hit lands.** Hit-stop through a pure, unit-tested loop module, trauma shake, floating score pops, damage direction, window blowouts, and a real cue set with stingers.
- **Chapter peaks that work:**
  - an armed strike on the lieutenants' meeting that never leaves the flight hovering;
  - a harbour endgame where the boats that don't count stand down, plus a one-time LAST RUN resupply, so meeting the quota on Normal is never a dead end;
  - a boom across 2.1 that makes idling lose;
  - a canal engage line inside the frame.
- **The story stays on screen.** A radio director never drops a story line. The closing line moves onto the result card. The reveal holds its twist until 3.3. Marrow breaks into the radio six times.

**How it is built**
1. G1 records 50 single-seed golden rows under frozen keys ('mission/pilot/mode'). They are the drift gate. G1 also adds an 8-seed balance sweep that does not gate, and every balance claim rests on it.
2. P1, H1, N1 and J1 must leave every golden row byte-identical. The goldens never run main.js or render(), so the loop and the render get their own unit tests and four interleave checks.
3. C1 and K1 each re-baseline only the keys they list, in one reviewed commit.
4. X1 cleans up, records the performance numbers and ships.

**Owner reviews come first, not last:** the N1 script document before any story code, and the J1 listen panel before any cue is wired into play.

**Scope:**
- 5.2 gets the storm on screen (S1), the pincer and the shuttered Lock Gate (rest of R1), the vehicle loops, haptics and a menu theme.
- 5.3 gets the valley clock, Marrow's boss fight (V1) and adaptive music.

**Cut order if time runs short:**
1. C1's 1.1 mast set piece
2. J1's indoor blowouts
3. N1's survivor voices and harbour beats
4. K1's engage line

**Never cut:** G1; P1; H1; N1's timeline, closing-line card and radio director; C1's harbour endgame and LAST RUN; K1's 2.1 boom; X1.

## Evaluation: Where 5.0 stands against the AAA bar (Mario Kart 8 polish, vivid colour, story depth): about 5/10

Seven lenses played the 5.0 production build in Chrome at 390x844, 844x390 and desktop sizes, using:
- Playwright;
- the scripted pilots;
- naive bots and do-nothing players;
- CDP profiling.

A critique pass then re-measured the plan's assumptions on 5.0.

| Area | Score | Key problems (measured) |
|---|---|---|
| Ch1 city + harbour | 5 | **City:** a naive nearest-target clicker wins all six city missions on Normal and loses no aircraft. Flak is live for only 4 of 62 s on 1.4. Marking the meeting early drops the bomb at 33.9 s, before the 36 s meeting, so the cell scatters. The Drill burst inside the Glass Tower shows only as a faint tint. **Harbour:** on Normal the quota is met (72 of 40 sunk) and the mission is still lost. harbourPilot fails 1.7 with reason 'ordnance' (17 bombs used of par 8, at 232 s) and 1.8 the same way (16 used, at 245 s), against tide windows of 600 and 570 s. The trap is the payload, not the clock. It fails all three on Hard, and CI runs this pilot on Easy only. 1.7 has a 126 s stretch with no radio line. |
| Ch2 canal | 5 | Lock Gate towers fired 0 shells under three policies, the hold lasted 3.8-4.6 s and 0 of 9 pincers formed. On 16:9 screens the view covers only z -34.5 to +24.5, yet guns aim at z > -44 and launchers fire at z > -46: 63 of 110 hostile shots and 16 of 17 missiles were launched above the visible frame. Doing nothing wins 2.1 on Normal in 9 of 16 seeds (success at 62 s; the rest fail 'hull' at 44-60 s). Gun-only play earns the same stars, and 27-48% of each mission is empty water. |
| Ch3 valley + finale | 5 | A competent pilot draws 0 missiles, fires 0 flares and leaves 6 crates. Sorties last 25-33 s, and a player idling for 420 s is still 'playing'. A novice dies with 0 rescued. All 54 station points lost on Normal came from Marrow's untelegraphed strafe (rescue.js:272-277). The finale is the one pilot CI already runs on Normal (rescue-browser.mjs:422): it wins with 1 star (station 46%) and loses on Hard at 124 s. On a phone, 31% of siege shots and 48% of missiles come from off-screen. |
| Story | 5 | The closing radio line is covered after 1.41 s, so Ines's father is never seen. The twist is spelled out at 2.2 and repeated five times. Marrow has 6.9% of the words, speaks live only in 3.4, and his plan contradicts itself. 'Surge' contradicts 'landfall tomorrow', and the 3.3 briefing at 18:30 says last light is twenty minutes away. 10 of 135 lines are pushed off the feed unread. |
| Progression | 5 | Stars earn 43 points and the whole shop costs 45, so there is no real choice. Upgrades cancel out the hard modes, and speed earns nothing. The finale's third star asks for at most 2 hits against the pilot's 24-26. The canal star text is false. Requisition sits 1718 px down a phone scroll. |
| Presentation | 5 | In-mission text is 9-10 px and combat buttons are 36-42 px, with no HUD audit test. The surge chip is display:none on phones. Toasts collide in 3 of 5 captures. Audio is 14 one-shot sounds with no music or ambience, and there is no weather. The Full screen button has 1.07:1 contrast. The HUD covers 40-55% of a phone screen. Hostile, key and civilian targets differ by colour alone. |
| Code health | 6 | **Render:** transparent DoubleSide rings draw in two passes; forcing one pass cut 1.6 from 6.1 to 3.7 ms of render CPU and from 674 to 211 KiB of garbage a frame. **Simulation:** the harbour allocates about 575 KB per step. **DOM:** same-value HUD writes cause 36-180 getComputedStyle calls a second. **Draws:** 305-562 per frame on phones. **Tests:** the 19 scripted runs share one page and assert only `status === 'success'`. They call game.update directly, so main.js and render() are never covered. About 55 Math.random sites in cosmetic code make before/after renders noisy. **CI** takes 18-32 min. |

**Strengths to keep:**
- exact, unit-tested ballistics;
- a deterministic fixed-step clock with a seeded game.random;
- GPU fx pools (30 blasts add 0 draws);
- a clear teaching ladder;
- strong writing, and a finale mechanic that comes from the story;
- 105 unit tests and 441 browser checks with no runtime errors.

**Facts checked in the repo:**

*Harness and tests*
- main.js:38 starts a mission at load, and game.js:115-116 seeds from a page-wide attempt count, so fresh contexts move every seed.
- The animate() body lives inline in main.js:45-65.
- The pilot marks rallies only when next < 2.2 s (strike-browser.mjs:88).
- rescuePilot already flares missiles within 18 m (rescue-browser.mjs:34, 67).
- story.test.js:43 pins file 4 as the one that names Okafor.
- progress-browser.mjs:30 expects 'SURGE 4:30'.
- deploy.yml is one job with an uncached Playwright install and no timeout.

*Tide windows*
- surgeWindow = (240 or 360 + 30 × par) × mode.surge (strike-data.js:1326). Normal windows run 270-630 s and Easy windows 405-945 s.
- Doing nothing on 1.2 Normal fails at 360.01 s, and on 1.7 at 600.01 s.

*Harbour and canal*
- Key targets are groups, not ships: 1.7 is 'column' (4 patrol boats), 1.8 'frigate', 1.9 'ring' plus 'cinder'.
- Ships run periodic timetables (harbour.js:94-103).
- Three callers rescale rings (river.js:692, river.js:759, strike.js:1736).
- The fragment, emitter and debris filters are the update loops themselves (game.js:1102, 1128, 1162).
- game.radio(line) drops the radio key (strike.js:608, river.js:137, rescue.js:1057).
- The barges sit at z 9.5 and 16.5, and Marlin's near bound is z 17 (river-data.js:5-14).

*Assets and story*
- The gate leaves are 8 boxes (rescue.js:159-162).
- 1.9's Belle-freed line already belongs to Ines (story.js:413).
- Inquiry files arrive at 1.6, 1.9, 2.2, 2.6, 3.2 and 3.3. The word 'hinge' first appears in 3.3.
- The models total 4,477,584 bytes = 4.27 MiB of the 4.5 MiB limit (tests/assets.test.js:59), so about 235 KiB is free.

### How the plan was made

**Synthesis.** The base is Plan 2, the most deliverable plan, with its cut order.

Grafted from Plan 1:
- the golden-run discipline;
- the one-day timeline;
- the reveal ladder.

Grafted from Plan 0:
- the present API;
- shared edge markers;
- the Lock Gate shutters and Marrow's livery, both now in later releases.

The critique then cut the release from 9 items (four of them L) to 8 (two L). The changes:
- S1, the rest of R1 and J1's vehicle loops move to 5.2.
- V1 and adaptive music move to 5.3.
- Single-seed balance claims are replaced by 8-seed win rates.
- A harbour flee path that would have piled 60-70 boats onto one mouth point is replaced by a simple stand-down.
- A canal camera move that would have pushed the rear barge off screen is dropped.

## The owner's ideas: what landed and what comes next

### (1) Easier and clearer to read: lower buildings, bigger markers, parks, yards, road works, crewed barracks (2.6)

**Verdict.** Landed on desktop: the 1.9 m storeys, ripples, gold key rings and rally tags read well. It did not reach phones in play: labels are 9-10 px, combat buttons 36-42 px, and world tags sit under panels. Target kinds differ by colour only. The biggest hit in Chapter 1, a Drill burst inside the Glass Tower, shows as a faint tint because the wall depth-tests the effect away.

**Next.** H1 adds an in-mission HUD audit (hud-browser.mjs, five viewports), fixes every size, makes named coverage cuts and adds shape glyphs for each target kind. J1 adds window blowouts so indoor bursts come out through the facade.

### (2) Canal destructible banks, barracks and auto weapon switching; helicopter fly-through pickups, direction fire, launch crews, 5 s missile trucks, drone pads and a map per sortie (2.7)

**Verdict.** The systems landed and read well, but measured play shows the threats rarely bite. A valley pilot draws 0 missiles. 63% of canal shots are launched above the frame. The Lock Gate towers die before firing, and 0 of 9 pincers form.

**Next.** In 5.1, K1 adds an engage line inside the frame with no camera move, and H1's edge chevrons mark whatever is still off-screen (canal aimers, valley missiles). The pincer and the shuttered Lock Gate come in 5.2, sector alarms and pin tethers in 5.3.

### (3) Reuse the KITEFALL character faces

**Verdict.** Correctly judged not feasible as in-game models: rig, licence, and only about 235 KiB of GLB budget left. The need behind it is real: the cast are still two-letter circles.

**Next.** Deferred: Blender toy-style portrait busts as WebP files outside the GLB budget, with an owner contact sheet first. In 5.1, N1 gives Marrow a visible beat on the radio: a red INTERCEPT frame with an original inline-SVG Ashen Front emblem, a static cue and six live lines.

### (4) Phone-friendly menus, shop and settings with Blender medallions (2.8)

**Verdict.** Landed for dialogs, which are audited at 7 sizes. Three gaps remain: the live HUD was never audited, Requisition sits 1718 px down a phone scroll, and the injected Full screen button has 1.07:1 contrast.

**Next.** H1 audits the HUD and styles the Full screen button to a contrast of 4.5:1 or better. N1 adds '+N requisition points' and a Requisition button to the result screen, plus a dot on the pause button while points wait. Splitting Mission Control into Pause and Campaign is deferred.

### (5) Tiny, light but beautiful living details (fish, birds, reeds) and a graphics governor (2.9)

**Verdict.** Landed and cheap: instanced, driven by a seeded cosmetic RNG, with budgets set by the governor. The one missing living layer is weather, in a story about a typhoon.

**Next.** S1 (one-draw rain, seeded lightning, a visible flood, a Weather switch) moves to 5.2, so it lands on P1's measured headroom and X1's phone numbers. Its design is corrected: the harbour shows the rising tide with a shader tint, not by raising the water geometry, which would bury the ripples.

### (6) More VFX without slowing the game (3.0/3.1 GPU pools, scorch, splashes, wakes)

**Verdict.** Landed: 30 blasts add 0 draws. The feel is still thin: the shake is gone in 0.17 s, and there is no hit-stop and no per-kill score. Two-pass transparent rings waste up to 40% of render CPU on 1.6.

**Next.** P1 makes the rings single-pass (measured 6.1 to 3.7 ms) and moves the main loop into a pure src/loop.js. J1 adds hit-stop there, plus trauma shake (applied and removed inside render()), pooled score pops, hit flashes and blowouts, all through the existing pools.

### (7) 'Too easy?': harder modes, Normal as the default (3.2)

**Verdict.** Partly landed. The canal can be lost. Still, a naive clicker wins every city mission on Normal, the harbour on Normal is a bomb-starved trap, doing nothing wins 2.1 in 9 of 16 seeds, and the valley cannot be lost by waiting. The scripted runs guard Normal only for the finale.

**Next.** G1 records Normal and Easy goldens, naive and do-nothing rows, and an 8-seed balance sweep. C1 adds the harbour stand-down and LAST RUN, and K1 adds the 2.1 boom. City tuning is explicitly accepted as it is for 5.1 and recorded with the sweep numbers. It goes to the owner for 5.2, given the history of swinging between 'easier' and 'too easy?'.

### (8) AAA gameplay and story: Wall Inquiry, finale siege with Marrow, chosen ending (4.0)

**Verdict.** Strong writing, and the finale's main mechanic comes from the story. The delivery falls short: closing lines are covered after 1.41 s, Marrow speaks live only in 3.4, his plan contradicts itself, the twist is given away at 2.2, and the boss fight is a waiting game.

**Next.** N1 starts from a script document the owner reads first. It then adds the closing-line card, a radio director that never drops story lines, and a reveal ladder that keeps 'hinge' out of everything before 3.3. Marrow gets a coherent plan and six live intercepts. The boss fight with telegraphed gun runs (V1) comes in 5.3.

### (9) Pressure and progression: surge clock and requisition upgrades (5.0)

**Verdict.** Half landed. The clock makes waiting lose, but it is display:none on phones and 9 px on desktop, never rewards speed, and contradicts 'tomorrow at last light'. The shop forces no choice and is hard to find.

**Next.** H1 shows the clock on every layout. N1 renames it HIGH TIDE on a one-day timeline (landfall tonight at 19:10), with durations that carry units, and shows points on the result screen. The valley clock comes with V1 in 5.3, under an honest name tied to the story clock. The tide medal, mode ribbons and loadouts are deferred.

### Still open: longer valley sorties with second objectives

**Verdict.** Not built. Sorties take 25-33 s and cannot be lost by waiting.

**Next.** 5.3, with V1: a daylight clock tied to the story time, sector alarms, pin tethers and survivor voices, then the authored set pieces (hold the ford, last bridge, Reyes's run).

### Still open: cast portraits

**Verdict.** Not built.

**Next.** Deferred. Render a contact sheet for the owner first, against the Mario Kart 8 bar, with the initials kept as the fallback. In 5.1 Marrow's INTERCEPT frame carries an SVG emblem, not a face.

### Still open: music

**Verdict.** Not built. There are 14 one-shot sounds and long silences (0.35 events a second in the harbour).

**Next.** In 5.1, J1 adds a distinct cue set and stingers (mission start, objective met, win, fail), plus a qa listen panel the owner hears before any cue is wired in. N1 adds the star cue. A synthesized menu theme comes in 5.2, and adaptive music with a boss layer in 5.3.

### Still open: animated intro and outro

**Verdict.** Not built.

**Next.** Deferred. The 'TIDELOCK SEALED' moment (forced lightning flash, banner, 0.5 s of slow motion) comes with V1 in 5.3, on J1's present API. The title screen and the outro sequence wait for the story-staging release.

### Still open: a no-requisition challenge (Iron Kestrel)

**Verdict.** Not built.

**Next.** Deferred. G1's goldens with no upgrades and its balance sweep already give its balance baseline.

### Still open: best-run summary

**Verdict.** Not built.

**Next.** N1 shows the points earned and the points to spend on the result screen. The service record (stars per chapter, ribbons, ending) is deferred.

## New ideas in this plan

- Two kinds of evidence. 50 single-seed golden rows are the drift gate (byte-identical or a reviewed re-baseline). An 8-seed balance sweep, which does not gate, prints win rates. Every balance claim in an acceptance ('do-nothing loses', 'pilot wins on Hard') is stated as a rate from the sweep, never as one row.
- A golden schema frozen in G1. Rows are keyed 'mission/pilot/mode', and every field a later item will fill is present as null from day one, so filling a field changes only the rows that item owns. `npm run golden -- --allow '6/*/*,5/naive/normal'` refuses to rewrite if any key outside the list moved.
- randomCalls counted inside the seededRandom closure (not by a wrapper added after start). It is the cheapest proof that pops, shake noise and later rain and lightning never touch the gameplay RNG.
- A pure src/loop.js holding the animate() body. Hit-stop, slow motion and the 1/120 step contract are unit-tested with fake timestamps, because the goldens call game.update directly and never run main.js.
- A qa-only deterministic render mode (?qa&det=1) that replaces Math.random with a seeded cosmetic RNG at boot (never game.random). Before/after parity renders and fragment-trajectory checks then repeat exactly.
- Four interleave checks (2.3, 1.8, 2.6, 3.4 with the HUD and render between every second step) that must equal their plain rows. This proves that render-side code (shake, pops, chevrons) never feeds back into the simulation.
- A free play rect: the viewport minus the cached HUD rects. Edge chevrons sit on its border, world tags clamp into it, the canal engage line must project inside it, and one shared boss-bar slot under the top bar is part of it.
- A harbour endgame with no new way to fail and no new motion. Once the quota is met, the boats that don't count turn grey, hold fire and score 0 but keep their timetables. The objective names the remaining key group in plural-aware text.
- LAST RUN: a one-time resupply on Easy and Normal when the endgame is on, key hulls are afloat and the flight's payload hits 0. The measured harbour trap is ammunition, not time.
- The 2.1 boom: a breakable boom across the mouth that holds the convoy under the final gun nests. Doing nothing then always loses, and the moment teaches 'shoot what blocks the barges', instead of a coin flip on the seed.
- Shape, not only colour: key targets carry a star glyph, civilians a 'ban' glyph and the minimap uses diamond, ring and dot. This is the first colour-blind-safe step, before a palette option.
- Owner reviews at the front: N1 begins with docs/SCRIPT-5.1.md (every new or changed line with its trigger) and J1 with a qa listen panel. Lines and cue parameters live in data tables, so changes after review touch no logic.
- Durations always carry units ('12 H 30 MIN', 'HIGH TIDE 3:12' stays minutes:seconds only inside a chip with an icon), so a countdown is never mistaken for a time of day.

## Build order

G1 → P1 → H1 → N1 → J1 → C1 → K1 → X1

| Item | Title | Effort | Depends on |
|---|---|---|---|
| G1 | Golden safety net | L | none |
| P1 | Headroom and bit-identical clean-up | M | G1 |
| H1 | A HUD that reads on a phone | L | P1 |
| N1 | A story you can follow and a debrief that lands | M | G1, P1, H1 |
| J1 | Hits that land and threats you can hear | M | P1, H1 |
| C1 | Chapter 1 peaks | M | G1, H1, N1, J1 |
| K1 | Canal fairness | S | G1, H1 |
| X1 | Release 5.1 | S | G1, P1, H1, N1, J1, C1, K1 |

## G1. Golden safety net: isolated, asserted scripted runs on Normal and Easy, a frozen row schema, and an 8-seed balance sweep

### Why

The hard rule that the 19 scripted runs stay identical is checked today only by people reading logs. The problems:
- The pilots share one page (tests/browser.mjs:267-341).
- The seed uses a page-wide start count (game.js:115-116) on top of the start at load (main.js:38).
- strike-browser.mjs leaves Easy selected for every later pilot.
- The checks assert only status === 'success'. One extra ui.start(3) shifted 2.3-2.5.
- Normal, the default, is guarded only for the finale (rescue-browser.mjs:422). Normal is where the harbour pilot fails 1.7 and 1.8.
Single seeds also cannot carry balance claims: doing nothing on 2.1 Normal wins 9 of 16 seeds, and the skipper's stars and barge HP vary across seeds on 2.3-2.5. C1 and K1 change runs on purpose. Without asserted goldens and win rates, those changes look the same as accidental drift.

### What

1) Bridge first. On unchanged 5.0 source, run the current browser suite and save its scripted-run log lines to tests/golden/5.0-reference.txt. It is a reference, not a gate.

2) Per-mission seeds.
- Game keeps attemptsBy = new Map(). The seed becomes 1 + index*7919 + n*104729, where n counts starts of this mission in this page.
- Retries still roll a new seed.
- The golden harness calls game.attemptsBy.clear() before ui.start, so the start at load never shifts a row.
- The sweep sets n through a qa hook, game.setAttempt(index, n).

3) randomCalls. seededRandom (difficulty.js) counts its own calls inside the closure, and Game exposes game.randomCalls. This catches calls made inside Game.start and the operation constructors (e.g. rescue.js:394), which a wrapper added after start would miss. Bit-identical.

4) Frozen schema (schema 1). Each row has:
- the key 'mission/pilot/mode';
- status, reason, endTime (0.01 s), window (strike tide window, else null);
- used, stars, score, kills, lost, hitsTaken, bargeHp, shields, integrity, gate, flaresUsed, randomCalls;
- reserved nulls, filled later only for the keys their item owns: standDown, resupply (C1), launches (K1), runsBroken, phase (5.3).

5) tests/golden-browser.mjs (new).
- One Chrome, a fresh context per run (?qa=1, empty storage, no upgrades), mode set explicitly.
- Each run executes inside one synchronous page.evaluate that ends with game.paused = true, so the rAF loop never advances the game between calls.
- 50 rows:
  - the five existing pilots on Normal and on Easy (38): autopilot 0-5, harbourPilot 6-8, skipper 9-14, rescuePilot 15-17, siegePilot 18;
  - a new naivePilot on 0-5 Normal (6). It clicks the projected screen point of the nearest live target through ui.markDrop, keeps the default bomb, never sets floor or angle, and never dodges;
  - a do-nothing player on 1, 6, 9, 14, 15 and 18 Normal (6). It is stepped at 1/120 until the status changes, capped at the mission's own window + 5 s where a window exists, else at 1000 s.
- Each row also keeps a radio log, ticked at 1/120 per step once N1 adds the director.

6) Interleave checks. 2.3 skipper, 1.8 harbourPilot, 2.6 skipper and 3.4 siegePilot on Normal are re-run with ui.updateHUD() and view.render() between every second step (with &feel=1 once J1 lands). Each must equal its plain row in every field.

7) tests/golden-diff.js (pure).
- Compares rows by key and field and prints one line per change, e.g. '7/harbour/normal used: 17 -> 15'.
- UPDATE_GOLDEN=1 rewrites the file and prints the same diff.
- --allow 'pattern,...' makes the rewrite refuse if a key outside the patterns moved.
- The file header records {schema, browser version, git sha}, and the diff warns when the browser version differs.
- House rule: every rewrite is its own commit, with its diff pasted into docs/VERIFICATION.md and its own acceptance (pilot wins, do-nothing loses), never 'whatever the new code printed'.

8) tests/balance-browser.mjs (new; npm run balance; not in CI, does not gate).
- Seeds n = 1..8 per mission for the pilot, naive (city) and do-nothing players, on Easy, Normal and Hard.
- One context per mission/pilot/mode group.
- Prints win rate, mean stars and mean endTime per cell to test-results/balance.json.
- --missions, --modes and --seeds filters let each later item sweep only its own missions (at most about 15 min).
- The full baseline sweep runs once locally, with GPU=1 preferred.

9) Pilot runs move out of strike-, harbour-, river- and rescue-browser.mjs; their mechanics checks stay. Each pilot runs once, isolated, and no suite sets a mode globally.

10) CI (deploy.yml).
- The build job builds once and uploads dist as an artifact.
- 'browser' and 'golden' jobs download it and run in parallel, on Playwright's pinned chromium (@playwright/test 1.55.1).
- ~/.cache/ms-playwright is cached by that version; only install-deps runs each time.
- timeout-minutes: 30 on both, deploy needs both, test-results/ is uploaded on failure, and npm run golden is added.
- If the golden job passes 20 min, shard it into missions 0-8 and 9-18.

11) Decision gate for the city. After the baseline sweep, docs/VERIFICATION.md records the naive clicker's city win rate on Normal. It also records the decision: 5.1 accepts the city as it is, and the Normal-only tuning proposal goes to the owner for 5.2.

### Acceptance

- Two consecutive `npm run golden` runs on the same build give a byte-identical tests/golden/scripted-runs.json, with exactly 50 rows keyed 'mission/pilot/mode' and every row carrying the full frozen field set (reserved fields null).
- tests/golden.test.js: for a fixture where one row's used and stars differ, the comparator names exactly that key and those two fields, and equal fixtures pass. With --allow '6/*/*', a change in '9/skipper/normal' makes the rewrite refuse.
- Isolation: the '11/skipper/normal' row is identical in a fresh context and in a context that first started missions 3, 0 and 9.
- A test-only fixture that calls game.random once from a cosmetic path changes that row's randomCalls, and the comparator reports it. A call made inside Game.start is counted too.
- The four interleave runs (2.3, 1.8, 2.6 and 3.4, with HUD and render between every second step) each equal their plain row in every field.
- The do-nothing rows record today's behaviour honestly. '1/idle/normal' fails 'surge' with endTime in [360, 360.02] and '6/idle/normal' fails 'surge' in [600, 600.02]. '18/idle/normal' fails. '15/idle/normal' is still 'playing' at the 1000 s cap. Rows 9 and 14 record whatever their seed gives, and the sweep reports their 8-seed rates.
- `npm run balance -- --missions 9 --modes normal --seeds 8` prints a table with win rate, mean stars and mean endTime for the pilot and do-nothing players. The full baseline table is in docs/VERIFICATION.md, including the 2.1 do-nothing rate, the naive city rates and the city decision line.
- docs/VERIFICATION.md has a table comparing the 5.0 reference lines with the new rows, each difference explained (fresh context, explicit mode, per-mission seed).
- The push that lands G1 takes no more CI wall time than the 5.0 run (28 min). Every job has timeout-minutes, and the golden file header names the browser version.

### Files

- src/game.js
- src/difficulty.js
- tests/golden-browser.mjs (new)
- tests/golden-diff.js (new)
- tests/golden.test.js (new)
- tests/balance-browser.mjs (new)
- tests/golden/scripted-runs.json (new)
- tests/golden/5.0-reference.txt (new)
- tests/browser.mjs
- tests/strike-browser.mjs
- tests/harbour-browser.mjs
- tests/river-browser.mjs
- tests/rescue-browser.mjs
- tests/difficulty.test.js
- .github/workflows/deploy.yml
- package.json
- docs/VERIFICATION.md

### Effort and risk

Effort: **L**.

The seed change and fresh contexts move every row once. That is why the bridge file exists, and why G1 lands alone with no gameplay change in the same commit.

50 fresh contexts each load 60 GLBs under SwiftShader. The parallel job, the dist artifact and the cached browser pay for that. Shard if the job passes 20 min.

The full sweep is long (roughly 1-2 h under SwiftShader), so it stays local and filterable, never in CI.

Goldens recorded on local Windows Chrome may differ from CI's Playwright chromium. The header warning shows a version mismatch before anyone chases a phantom drift. If rows differ only by platform, record them on chromium.

Chapter suites that relied on state left behind by a pilot run need small setup changes.

## P1. Headroom and bit-identical clean-up: single-pass rings, HUD write guards, hot-path de-allocation, a pure loop module, one RNG and a deterministic render mode

### Why

Juice and later the storm need phone headroom, and today it is wasted.

**Rings.** Transparent DoubleSide rings render in two passes and re-derive their shader program twice a frame: 106 look-ups a frame on 1.6. Forcing a single pass at runtime cut 1.6 render CPU from 6.1 to 3.7 ms and garbage from 674 to 211 KiB a frame.

**Harbour.** It allocates about 575 KB per fixed step, mostly from destructuring in onLand (harbour-data.js:286).

**HUD.** It rewrites unchanged attributes 72-84 times a second, which wakes the shared gesture helper into 36-180 getComputedStyle calls a second.

**Tests.** The main loop lives inline in main.js, where no test reaches it. About 55 Math.random sites make every before/after render noisy.

**Hygiene.** mulberry32 is copied four times.

The owner asked for clean code.

### What

1) Rings.
- forceSinglePass: true on view.ring(), the RingPool ShaderMaterial (fx.js) and the pipper tick material.
- Geometry is cached by its exact (inner, outer, segments) key. No radius is baked into mesh.scale, so callers that already rescale rings keep working: river.js:692 (mine halos), river.js:759 (pincer rings), strike.js:1736 (gathering rings).
- Materials stay per ring, because opacity changes per ring.

2) ui.js helpers setText(el, v), setHidden(el, v) and setClass(el, name, on) write only when the value changes. They are used across updateHUD, updateStrike, updateRiver and rescue-hud.js.

3) Canvas size cache. A ResizeObserver on the canvas (which also covers iOS toolbar, visualViewport and fullscreen changes) stores viewWidth and viewHeight. render(), resizeBadge(), game.steerHeli() and screenDirection() read the cache instead of clientWidth and clientHeight.

4) Harbour hot path.
- onLand becomes an indexed loop over a flat Float64Array (never Float32: bounds such as -6.2 and 0.8 are not exact in float32), with no destructuring or closures.
- Each fish's water test is cached per step.
- strike-data buildingsNear uses numeric cell keys and a scratch array stamped with a query id. Its comment states the rule: no nested queries, and callers never mutate the returned array, including the !cells path (strike-data.js:666).

5) game.js scratch objects.
- Module scratch vectors and quaternions for shield offsets, wakes, steerHeli, shot velocity and missile steering.
- targetPosition(e, out) writes into an out parameter.
- world.js followPlayer uses scratch vectors.
- Object.values(view.fx) is cached.

6) Compaction. The fragment, emitter and debris updates (game.js:1102, 1128, 1162) are the update loops themselves. Each becomes an in-place for-loop with a write index: the same order, the same per-item work, no new array. Only the pure projectile compaction (game.js:644) runs behind a dirty flag set when one dies.

7) src/loop.js (new, pure). createLoop({clock, governor, game, ui, view}).frame(now) holds the animate() body: governor sample, input, fixed steps, HUD and render gating. main.js only calls it. J1's present API and N1's director tick live here later.

8) Deterministic render mode. With ?qa&det=1, boot replaces Math.random with a seeded cosmetic mulberry32 (seed 1), never game.random. Every parity render in this release uses it.

9) Hygiene, all bit-identical:
- one src/rng.js (mulberry32), imported by difficulty, city, strike-data, swarm and rescue-world;
- the game.rescue alias goes once its reads are replaced, and so does the redundant body-removal loop in Game.start;
- module-private names are un-exported (birdGeometry, CIVILIAN_MARGIN, QUALITY_KEY, RESCUE_BOUNDS).

10) tests/perf-browser.mjs (new) uses count budgets only, no timings:
- program look-ups per frame;
- same-value attribute writes;
- draw-call ceilings, recorded now and enforced from then on, with each later item declaring its allowance.
It also writes two baselines to docs/VERIFICATION.md (they do not gate):
- grid-sampled HUD panel coverage at 390x844 for every mission;
- p50/p95 frame times at 390x844 with CPU throttled 4x, GPU=1, on 1.6, 1.8 and 3.4.

### Acceptance

- All 50 golden rows are byte-identical and the four interleave checks pass. No re-baseline is allowed in this item: if a row moves, that piece is reverted.
- A scene scan on missions 0, 5, 7, 11, 15 and 18 finds no visible material that is transparent, DoubleSide and without forceSinglePass. Shader program look-ups are 2 or fewer per frame on missions 0, 5, 7, 11 and 18 (customProgramCacheKey wrapper).
- Ring radius check: on 1.6, 2.2 and 2.5, every view.ring mesh's world-space outer radius equals the radius it was asked for times its caller's own scale, within 1e-6. Mine halos and pincer rings still scale. The 1.6 scene holds at most half of today's 53 RingGeometry objects.
- Under ?qa&det=1, two renders of 1.6 after the same scripted 600 steps are pixel-identical. Renders of 1.6 and 1.8 before and after P1 differ in at most 1% of pixels, and the diff images are kept in .scratch/ and reviewed.
- Fragment trajectories: under det=1, the positions of the first 20 fragments over 120 steps after a 1.6 blast equal the trajectory recorded on 5.0 source. Emitters keep spawning and debris keeps following its bodies.
- A MutationObserver with attributeOldValue counts 0 same-value hidden or class writes over 3 s of play on missions 2, 10 and 18.
- A spy on the canvas clientHeight getter sees at most 1 read over 60 rendered frames after a resize. A simulated visualViewport-style resize of the canvas updates the cache before the next frame.
- tests/loop.test.js uses fake timestamps (16.7 ms frames, 33 ms frames, a 250 ms hitch, pause and resume). Fixed steps equal floor(clamped unpaused real time × 120), every update receives exactly 1/120, paused frames run 0 steps and reset the clock, and render gating matches 5.0's rule.
- Unit parity: the new onLand matches the old one over a 0.05 m grid within 1 m of every land edge in the 1.7-1.9 layouts. buildingsNear returns the same buildings in the same order for 1000 random boxes. mulberry32 from rng.js matches the old outputs for seeds 1, 7919 and 104729 over 1000 values each, and 'function mulberry32' appears only in src/rng.js.
- Draw calls at 390x844 are recorded as ceilings (1.6 at most 565, 1.8 at most 374, 3.2 at most 343), and perf-browser enforces them.
- With GPU=1, mission 1.8 allocates 60 KB or less per fixed step on average over 480 steps (about 575 KB today). Under SwiftShader the number is logged only.
- docs/VERIFICATION.md holds the per-mission coverage baseline and the throttled frame-time baseline.

### Files

- src/main.js
- src/loop.js (new)
- src/rng.js (new)
- src/world.js
- src/fx.js
- src/strike.js
- src/ui.js
- src/rescue-hud.js
- src/game.js
- src/harbour-data.js
- src/strike-data.js
- src/ambient.js
- src/difficulty.js
- src/city.js
- src/swarm.js
- src/rescue-world.js
- tests/loop.test.js (new)
- tests/perf-browser.mjs (new)
- tests/harbour.test.js
- tests/strike.test.js
- tests/difficulty.test.js
- tests/browser.mjs
- docs/VERIFICATION.md

### Effort and risk

Effort: **M**.

Low. These are render, DOM and order-preserving changes only, and the goldens, the loop tests and the parity tests prove them. Some damage is visual only and the goldens cannot see it: ring radius and fragment motion. Those have their own checks.

Single-pass rendering can change how overlapping rings blend slightly, which is why there is a reviewed det=1 diff. Two-sided GLB glass is untouched.

Tests that read game.rescue change in the same commit. The shared mobile-game-support helper is not edited; its upstream guard is deferred to the gesture rollout workflow.

## H1. A HUD that reads on a phone: visible tide clock, 11 px / 44 px in play, named coverage cuts, callout lanes, a free play rect with edge markers and one boss-bar slot

### Why

The 5.0 pressure mechanic cannot be seen on the main platform. #surge-chip sits in .mission-meta, which phones hide (style.css:2023, 2289), and it is 9 px on desktop.

The in-mission HUD breaks both house rules:
- 9-10 px text: SCORE, the objective unit, chips, SPEED and ANGLE;
- small targets: bomb chips 47x32, floor arrows 36, Reverse 39x48, Formation 39x40, weapon buttons 40, angle chips 42.

The HUD covers 40-55% of a 390x844 screen, and bigger controls alone would make that worse, so the cuts must be named. Toasts and multi-kill banners collide in 3 of 5 action captures. World tags sit under panels. Fire comes from off-screen with no indicator. Target kinds differ by colour alone. The canal boss bars and later bosses need one agreed slot.

### What

1) Tide chip.
- #tide-chip moves into the top bar beside the score, visible at every width.
- At least 13 px bold, with a Lucide 'waves' icon.
- Gold above 120 s, orange from 120 to 60 s, red with the existing pulse under 60 s (no pulse under reduced motion).
- A 4 px tide bar runs along the bottom edge of the top bar (scaleX = elapsed / window), written only when the whole percentage changes.
- The label is unchanged here (N1 renames it), and the chip is generic so later clocks can reuse it.

2) Text at 11 px or more: SCORE, objective unit, difficulty chip, SPEED, ANGLE, speaker roles, rocket/guided/flare/strike stock, barge names, rescue status, footer, ladder name and pattern count. Minimap digits are drawn at 11 CSS px times the canvas-to-CSS ratio.

3) Touch sizes:
- bomb chips 52x44, floor arrows 44x44;
- Reverse 48x48, Salvo 48x48, Formation 48x44;
- angle chips 44x44, weapon buttons 44x44, Flares 46x46;
- desktop chapter tabs 44 px tall.

4) Named coverage cuts on phones:
- (a) the minimap collapses to a 44x44 map button, collapsed by default in portrait under 400 px wide. A dot pulses on a new ping, and a tap opens it.
- (b) the intel strip becomes one chip showing the next event ('MEETING 0:12 · 6'), and a tap expands the list.
- (c) the mission header merges into the top bar as one objective line, ellipsized, with a tap for the full text.
- (d) Marlin's and Lantern's shield pips move from a panel to a segmented ring around the vehicle: one draw, the segment count as a uniform, single-pass.
- (e) the flight card collapses to one row when the flight carries one payload kind.
Target: 40% or less coverage at 390x844 on each of missions 0, 6, 9, 15 and 18. P1's baseline gives each mission's starting value.

5) Callouts manager in ui.js with three lanes:
- banner lane at 34% of the height (multi-kill, checkpoint, medal);
- toast lane under the top bar;
- hint lane above the controls.
Rules:
- one message per lane, with the CSS class reset for each message;
- the same text within 3 s merges ('GLANCING HIT x3');
- timers count in game time, so pausing holds messages;
- onStart clears every lane, including #combo;
- on phones, toasts wrap to at most 2 lines.

6) Free play rect. ui keeps freeRect = the viewport minus the cached HUD rects (top bar, boss slot, controls, panels), recomputed on resize or layout change.
- A world tag whose rect falls under a panel is hidden that tick.
- Boss and objective tags are clamped into freeRect.
- view.projectInto(out, point) gives allocation-free projection.

7) src/edge-markers.js (new).
- A pool of 8 DOM chevrons placed on the border of freeRect (not the viewport edge), projected every frame.
- 11 px labels such as 'MISSILE', 'LAUNCH 3s' and 'MARROW'. The pulse rate follows distance.
- API: edge.track(id, point, kind) and edge.untrack(id), with no allocation.
- In 5.1 it tracks canal aimers and launchers above the frame, valley incoming missiles and launch windows, Marrow when off-screen in 3.4, and the harbour key hulls off-screen during C1's endgame.

8) One boss-bar slot. #boss-slot is a strip directly under the top bar on every layout: full width minus the 16 px gutters, at most 28 px tall, part of the cached HUD rects. The existing canal Lock Gate bars move into it now. Later bosses use it.

9) Shape, not only colour.
- World tags gain a Lucide glyph per kind: key target 'star', civilian 'ban', hostile none.
- Minimap marks: key a diamond, civilian a hollow ring, hostile a dot.

10) Glitch fixes:
- the 'Missed it? F turns the flight round' coach shows only after a bomb lands with 0 kills;
- the star line uses a plural rule ('Use 1 bomb or fewer');
- the release button hides 'Turning 0.0s' once the mission is decided;
- [data-mobile-display] is styled as a secondary button with contrast of 4.5:1 or better (the shared helper is untouched);
- a desktop chapter tab clicked during a mission asks 'Leave this mission? Stay / Leave'.

11) tests/hud-browser.mjs (new) covers missions 0, 3, 6, 9, 14, 15 and 18 at 390x844, 360x740, 844x390, 320x568 and 1440x900.

### Acceptance

- hud-browser: every visible in-mission HUD text node has a computed font size of 11 px or more, on all seven missions at all five viewports.
- hud-browser: on touch layouts, every visible HUD button or [role=button] is at least 44x44 CSS px.
- On missions 0-8 at every viewport, the tide chip is rendered: computed display is not 'none', its rect is inside the viewport and its font size is at least 13 px. This replaces the hidden-attribute-only check at progress-browser.mjs:30.
- Grid-sampled HUD panel coverage at 390x844 is 40% or less on each of missions 0, 6, 9, 15 and 18 (40-55% today). The per-mission before/after table goes into VERIFICATION.md.
- The collapsed minimap button is at least 44x44, opens the map on tap, and shows its ping dot within one frame of a new ping. The intel chip shows the same next event as the full strip.
- No visible world tag rect intersects a HUD panel rect. Boss and objective tags stay fully inside freeRect.
- A multi-kill banner, a checkpoint and a toast fired in the same tick: no two lane rects intersect, and the next normal toast does not carry the checkpoint class. A toast shown before a 3 s pause is still visible after resume. #combo is not visible after ui.start.
- EdgeMarkers still has exactly 8 DOM nodes after 300 track/untrack calls. A tracked point above the frame shows a chevron on freeRect's top border within one frame. At 390x844, 844x390 and 1440x900 no chevron intersects a HUD rect.
- #boss-slot intersects no other HUD rect at 390x844, 844x390 and 1440x900, and the 2.6 Lock Gate bars render inside it.
- Each target kind's tag and minimap mark differ by glyph or shape, not only by colour (checked by DOM class and minimap draw calls).
- On 1.1 the Reverse coach is never shown while the first bomb is falling, and is shown after a bomb lands with 0 kills. The par-1 star text reads 'Use 1 bomb or fewer'. The release button is hidden once the mission is decided.
- menus-browser: the Full screen button's text contrast is 4.5:1 or better. During a mission, a chapter-tab click opens the confirmation, and game.index does not change until Leave is pressed.
- The existing mobile layout checks pass from 320x740 to 768x1024. All golden rows are identical, the interleave checks pass, and perf-browser's ceilings hold within the declared allowance (+1 draw for the shield ring).

### Files

- index.html
- src/style.css
- src/ui.js
- src/rescue-hud.js
- src/strike.js
- src/river.js
- src/world.js
- src/edge-markers.js (new)
- tests/hud-browser.mjs (new)
- tests/menus-browser.mjs
- tests/progress-browser.mjs
- tests/strike-browser.mjs
- tests/river-browser.mjs
- tests/perf-browser.mjs
- tests/browser.mjs

### Effort and risk

Effort: **L**.

The strike camera frames the city around the measured HUD (hudInset, updateBadgeBounds), so bigger controls shrink the visible city. Check pickup badges and markers by screenshot at 320x568 and 844x390.

If the named cuts still leave a mission above 40%, record the measured number and get the owner's sign-off rather than shrinking text or tap targets.

A collapsed minimap hides information. The ping dot and the edge chevrons carry what matters.

Browser checks that read #toast text need their selectors moved to the lanes. Layout only, no simulation change.

## N1. A story you can follow and a debrief that lands: script review first, one timeline, a radio director, the closing line on the result card, Marrow on the radio

### Why

The closing radio line is readable for 1.41 s before the result screen covers it (game.js:231). That is where 1.9's 'My father was a pilot on the Lower Quays' lives, the line the broadcast ending pays off.

The feed fails both ways. The 2-slot feed pushed 10 of 135 lines out unread (4 of 14 in Floodplain), while the harbour goes 126-161 s without a line. game.radio(line) drops the radio key, so no priority can be set today.

Marrow and the twist:
- Marrow has 6.9% of the words, speaks live only in 3.4, and his plan contradicts his 90% stall.
- The twist is spelled out at 2.2 and repeated five times.

The timeline contradicts itself:
- 'The water reached the streets' contradicts 'landfall tomorrow'.
- The three CHAPTER_STORY clocks imply three landfall times.
- The 3.3 briefing at 18:30 says last light is twenty minutes away.

The result screen never shows the points that 5.0 made the currency. The failure screen shows a success badge and two buttons that both restart.

### What

0) Script first. docs/SCRIPT-5.1.md lists every new or changed line with speaker, mission, trigger and radio key. It is written and handed to the owner before any code. Lines live as data in story.js, so edits after review touch no logic.

1) One timeline. Landfall is tonight at 19:10, which the mission clocks already fit (06:40 to 19:10).
- A pure landfallLabel(clock) returns 'LANDFALL 19:10 · 12 H 30 MIN'. Durations always carry units: '5 H', '2 H 25 MIN'. It replaces the CHAPTER_STORY clock strings on each chapter's first briefing eyebrow.
- Prologue: 'Typhoon Ilse makes landfall tonight at last light. Her outer bands push a storm tide up the estuary, and with every radio jammed the pump stations are blind: each high tide pours into the low streets.'
- Marrow's plan in the prologue: 'Marrow holds Highwater's controls and says the city will learn tonight what its walls are made of.'
- story.js:714 becomes 'Last light is in forty minutes.'
- Chapter 1's player-facing 'SURGE' becomes 'HIGH TIDE':
  - chip 'HIGH TIDE 3:12';
  - toasts 'HIGH TIDE / 60 SECONDS', and Iona's 60 s line;
  - city failure: 'High tide reached the low streets before the pumps came back. Strike the key targets first, and use Reverse and the map marks to waste no passes.';
  - harbour failure: 'High tide: the flotilla rode it over the bar and out to sea.'
- Code identifiers stay (op.surge, reason 'surge', surgeWindow), and the word 'surge' is kept for the finale.

2) Radio director, src/radio-queue.js (new, pure).
- director.tick(dt) is driven by src/loop.js with real dt while unpaused, and by the golden harness at 1/120 per step, so the goldens' radio log is time-true.
- The key is passed through: game.radio(line, key) becomes notify('radio', {line, key}) at strike.js:608, river.js:137 and rescue.js:1057.
- RADIO_PRIORITY is keyed by radio key: 2 story, 1 tactical, 0 chatter, default 1.
- Minimum display is 1 s + words/3.5 s, capped at 7.8 s. The same text within 20 s is dropped.
- Story lines are never dropped and never displaced before their minimum; the queue grows for them. When more than 4 lines wait, chatter is dropped first, then tactical lines older than 6 s.
- Desktop shows 3 slots. Phones show a one-line ticker (portrait dot, name, line, at most 2 lines), and a tap expands the last 3.

3) Closing-line card.
- #result-quote at the top of the result dialog shows the speaker's dot, name and MISSION_STORY[i].radio.success (the failure line on a loss).
- The result actions stay hidden until min(6, 1 + words/3.5) s after the line was said. A tap, click or Enter skips the wait, but a held, repeating key does not.
- game.finishTimer is unchanged.
- ?qa skips the wait unless &hold=1.
- The comms feed is hidden while the result is open.

4) Reveal ladder, holding 'hinge' until 3.3.
- The 2.2 brief line (story.js:481): 'Someone signed for that concrete, Kestrel. It wasn't me. Ask who stood beside me that winter.'
- The 2.5 line (story.js:586): 'The Authority had a deputy who signed what it put in front of him. He is closer to you than you think.'
- File 4 (2.6) ends: 'The witness was his deputy. The name on the page has been blacked out.'
- File 5 (3.2) is the true reveal: 'A. Okafor, Deputy Engineer'.
- File 6 (3.3) adds the turn: the construction log and Marrow's own note show he knew for four years that the hinge was grade B, and reported nothing.
- The 3.3 radio line (story.js:730) becomes Reyes: 'Marrow knew about that hinge for four years, Commander, and kept quiet.'
- The 3.4 stall line: 'Ninety per cent, Anselm. Now you'll have to slam them, and the whole city will watch the hinge go.'
- Each file gets a one-line 'from' source, e.g. 'Uplinked by Echo over the network you un-jammed', 'Pulled by Ines from the harbour archive'.

5) Six live Marrow intercepts. Each has at most 26 words and fires once from a trigger on an existing event. They appear in a red INTERCEPT frame with a scan-line static (CSS transform, off under reduced motion) and an original inline-SVG Ashen Front emblem (no face, no model bytes). The static cue lands with J1; until then the existing radio chirp plays.
- 1.3, start + 12 s: 'The network's back, so now you can hear me. Ask the Harbour Authority what it buried under the Lower Quays.'
- 1.6, meeting struck: 'Six of mine in a glass room. The Authority will call that my arithmetic too.'
- 1.9, start + 15 s (kept off the Belle-freed event, which keeps one line): 'Keep your ferry, Duarte. Your father never got one.'
- 2.2, first pincer destroyed or start + 20 s: 'You read water well, Kestrel. Read the inquiry better.'
- 2.5, start + 10 s: 'Hold the gates open and the city drowns. Close them wrong and everyone sees what the Authority poured.'
- 3.3, Reyes aboard: 'She's read it all. Ask her what I knew about the hinge, then decide who you're defending.'

6) Harbour beats (cut third).
- q25, q50 and q75 radio keys on the Fleet sunk count. 1.7 examples: Ines 'A quarter of them gone. The mouth's starting to breathe.', Bram 'Half the column. Keep the Stick for the big hulls.', Echo 'They're panicking on the quays. Finish it.'
- The existing 1.9 Belle-freed line (story.js:413) is replaced, not joined, by Ines: 'My father brought ferries through that mouth for thirty years. The Belle doesn't sink on my watch.'

7) Survivor voices (cut third). One pickup line for each of the 9 crew in data.js, e.g.:
- Kofi: 'Mensah aboard. Reyes split us at the river and took the key north.'
- Lin Tao: 'Three wounded in my head and none in this aircraft. Fly. I'll manage.'
Iona's 1.1 line teaches tap-to-mark. No Chapter 2-3 line uses 'Kestrel One'.

8) Debrief.
- Stars appear one at a time, 300 ms apart, with a 1.0 to 1.25 to 1.0 punch and a synthesized 'star' cue (C5, E5, G5). The score counts up over 0.6 s and the criteria tick in sequence; all at once under reduced motion.
- A line reads '+N requisition points · M to spend', with a Requisition button when the cheapest upgrade is affordable, and a dot on the pause button while points wait.
- A failure shows the Lucide 'triangle-alert' icon, 'Mission control' replaces the duplicate Retry, and after 2 failures of the same mission a 'Try it on Easy' button appears.
- The canal third-star text becomes 'Barges above 80% and Marlin takes at most 2 damage'.
- The finale choice gets a 'What the files say' panel: 6 titles, 'Not recovered' where missing, and 'You have read N of 6 files'.

### Acceptance

- docs/SCRIPT-5.1.md exists before the first story.js change, and every new or changed line in story.js appears in it with its key and trigger.
- tests/radio-queue.test.js checks:
  - the minimum display time and the 20 s dedupe;
  - 3 and 2 slot counts;
  - that a story line is never dropped or displaced before its minimum, even with 10 lines queued;
  - that chatter is dropped before tactical lines.
  Replaying the recorded 2.3 Floodplain timeline (14 lines in 67 s) displaces 0 story lines and shows 'Kestrel Two rolling in' once.
- Every game.radio call site passes a key, and a unit test fails on a call without one.
- story.test.js, timeline:
  - the prologue contains 'tonight' and 'storm tide';
  - mission clocks never decrease and all sit at or before 19:10;
  - landfallLabel('06:40'), ('14:10') and ('16:45') return 'LANDFALL 19:10 · 12 H 30 MIN', 'LANDFALL 19:10 · 5 H' and 'LANDFALL 19:10 · 2 H 25 MIN';
  - story.js:714's line contains 'forty minutes';
  - no player-facing Chapter 1 string contains 'surge'.
- story.test.js, reveal:
  - INQUIRY_FILES[3] does not contain 'Okafor' (this replaces the pin at story.test.js:43) and INQUIRY_FILES[4] contains 'A. Okafor';
  - no line in missions 0-15 contains 'you signed';
  - no line, file or intercept in missions 0-16 contains 'hinge';
  - every file has a non-empty 'from'.
- story.test.js, radio:
  - the 6 intercepts have who 'marrow', at most 26 words, and a trigger from their chapter's exported event list;
  - no event carries more than one story-priority line;
  - every crew name in data.js has a pickup line;
  - no Chapter 2-3 line contains 'Kestrel One'.
- In the golden harness's radio log (ticked at 1/120), each intercept fires from its event in a pilot run, and Kofi's and Lin Tao's lines appear in the 3.1 run. Over all Easy and Normal pilot rows, 0 story-priority lines are shown for less than their minimum and 0 are dropped (10 of 135 were displaced in 5.0).
- Over the Normal harbour pilot runs, q25, q50 and q75 all appear, and the longest gap between radio lines is 60 s or less (126-161 s today).
- With &hold=1, after a 1.9 win:
  - the result actions appear no earlier than the computed hold;
  - #result-quote equals the story success line;
  - Enter skips the wait.
  Under plain ?qa the dialog opens as in 5.0. A menu opened during the hold leaves the game paused.
- Debrief:
  - earned stars are revealed at least 300 ms apart, and all at once under reduced motion;
  - the '+N' value equals the change in requisition points;
  - the Requisition button appears exactly when the points cover the cheapest upgrade, and opens the panel;
  - a failure dialog has no badge-check icon and no duplicate Retry;
  - after two failures 'Try it on Easy' appears and sets the mode.
- Unit: every canal criterion text matches its check on every mode. The finale choice card shows 'You have read N of 6 files', with N equal to the files in the save.
- HUD panel coverage at 390x844 is 36% or less on each of missions 0, 6, 9, 15 and 18 with the ticker. progress-browser reads 'HIGH TIDE 4:30'. All golden rows are identical apart from the radio log (radio and UI only).

### Files

- docs/SCRIPT-5.1.md (new)
- src/story.js
- src/ui.js
- src/radio-queue.js (new)
- src/loop.js
- src/game.js
- src/strike.js
- src/harbour.js
- src/river.js
- src/rescue.js
- src/audio.js
- index.html
- src/style.css
- tests/radio-queue.test.js (new)
- tests/story.test.js
- tests/progress-browser.mjs
- tests/menus-browser.mjs
- tests/strike-browser.mjs
- tests/golden-browser.mjs
- docs/REDESIGN.md

### Effort and risk

Effort: **M**.

The owner reads the script document first. Since lines are data, the owner's edits after review do not reopen code.

While the result screen holds, dialog stacking and pause handling (anyDialog, pendingBrief) must stay correct, which the paused-menu check guards.

The story.test.js pin on file 4 and the 'SURGE' browser matches change in the same commit as the text.

A queue that grows for story lines could lag behind events in a dense burst. The 2.3 replay and the golden radio log bound that.

The radio log is new golden data, not a gameplay field, so adding it is part of G1's frozen schema (an empty log until this item). No simulation change.

## J1. Hits that land and threats you can hear: listen panel first, render-only hit-stop in the loop module, trauma shake, score pops, indoor blowouts, damage direction and a cue set with stingers

### Why

Across every lens, hits feel light:
- there is no hit-stop anywhere in src;
- a fixed sinusoid shake is gone in about 0.17 s;
- MULTI-KILL is the only per-kill feedback;
- the meeting dies as a faint orange tint inside the Glass Tower.

Sound is thin:
- enemy launches are silent (rescue shoot()), and there is no lock tone;
- the laser and rockets reuse the gun's click, and barge hits share Marlin's 'hit';
- there are no stingers for a start, a win or a fail.

Players cannot tell where damage came from. The owner's bar is Mario Kart 8-level polish.

### What

0) Listen first. A qa-only Sound test panel (?qa&listen=1, in Mission Control) lists every new cue and stinger with Play buttons and a 'play all' sequence. It is built before any cue is wired into gameplay and shared with the owner as the listen gate. Every cue's parameters live in one CUES table in audio.js, so changes after the listen are data-only.

1) Present API in src/loop.js only. game.present = {stopUntil, slowUntil}.
- While real time is before stopUntil, the loop skips clock.advance and calls clock.reset(), so no catch-up burst follows. HUD and render keep running.
- While before slowUntil, delta is scaled by 0.4; fixed steps stay 1/120.
- Stops:
  - 3-4 kills in one blast: 50 ms;
  - 5+ kills, a gold-ring target, a tower, generator, launcher, missile site, drone pad or key hull: 90 ms;
  - the mission-deciding hit: 120 ms, then 0.5 s at 0.4x.
- At most 160 ms of stop per rolling second.
- Off under reduced motion, and under ?qa unless &feel=1.
- game.update never reads present. The governor is not changed: frames inside a stop still render and are fair GPU samples.

2) Trauma shake.
- game.shake becomes trauma in [0,1]: small blast +0.15, big blast +0.35, player hit +0.45, key kill +0.5, decaying 1.6 a second.
- Offset = trauma squared × 0.55 m × smooth value noise at 6-18 Hz of real time (frame-rate independent, below Nyquist at 60 fps), plus a 0.12 s kick of 0.25 m away from the blast.
- render() adds the offset to the camera and restores the base camera before it returns, so project(), steerHeli() and screenDirection() always see the unshaken camera.
- 0 under reduced motion.

3) Score pops.
- 16 pre-created spans in a #pops layer inside #world-labels: '+100', '+200 OFFICER', '+250 LAUNCHER', '+1000 x5', 'RUN BROKEN'.
- Text is updated through span.firstChild.nodeValue. Each pop rises 28 px over 0.9 s by transform only, is re-projected every frame through view.projectInto, and the oldest is recycled.
- GLANCING HIT, INTERCEPT and SHOT BLOCKED become pops at the spot instead of toasts.

4) Indoor blowouts (cut second).
- When a burst point is inside a building footprint, each camera-facing wall of that storey gets 2 fireballs and 2 smoke puffs, spawned 0.3 m outside the wall at mid-storey height and moving outward at 2-3 m/s.
- Glass buildings add 10 pale-blue (0x9fe8ff) shards with gravity 14.
- Plus a floor-band glow and view.lightFlash. Pools only, no new draws.

5) Hit flash and damage direction.
- damage() adds a 0.08 s white glow at radius × 1.4.
- A #hurt-edge vignette carries data-dir left/right/top/bottom from the hit sector and fades over 0.35 s.
- Shields at 3 of 9 or below give a slow red edge pulse and one 'SHIELDS LOW'.

6) Cues in audio.js (WebAudio, no files):
- enemyLaunch, a rising noise sweep, also played in rescue shoot();
- lockBeep at 2-8 Hz by missile distance, at least 0.12 s apart;
- rocketWhoosh;
- laserHum, one persistent oscillator pair started and stopped, pitch rising with heat;
- shellWhistle, 1800 to 400 Hz over 0.9 s;
- bargeClang, distinct from Marlin's hit;
- enemyShot, a lower timbre than the player's gun;
- comboTick, +1 semitone per combo step up to +12;
- glassTinkle, and a low thump under big blasts;
- intercept, a ring-modulated static burst for Marrow's lines;
- stingers: missionStart, objectiveMet, win and fail, each at most 2.5 s and ducking one-shots by 6 dB.
One-shots route to three persistent StereoPanner buses by screen third. At most 24 play at once, and the oldest is dropped.

7) Suspend rule. The AudioContext suspends only while the tab is hidden, or after 2 s paused with no dialog open. It resumes before any UI cue, so the debrief star cue and menu sounds always play.

### Acceptance

- The listen panel (?qa&listen=1) lists exactly the entries of the CUES table, and each Play button starts its cue. The owner has heard it before the first gameplay call site of a new cue is committed.
- tests/loop.test.js with fake timestamps:
  - a 90 ms stop runs 0 fixed steps during the stop, and the first frame after it runs at most 1 step (no catch-up burst);
  - slow motion runs floor(0.4 × real time × 120) steps;
  - every update still receives exactly 1/120;
  - ten key kills in one frame give at most 160 ms of stop within 1 s;
  - under reduced motion the stop stays 0.
- The four golden interleave checks pass with &feel=1, and all golden rows are identical with randomCalls unchanged.
- For the same input, steerHeli() and view.project() return identical results with trauma 1 and trauma 0. The camera position after render() equals the position before it, exactly.
- At the same real times, sampled at 60 and at 120 fps, the shake offsets are equal to 1e-6.
- After 200 kills, #pops still has exactly 16 children. A MutationObserver on #pops (childList, no subtree) sees 0 mutations. The texts of the newest three pops match the last three score deltas.
- A Drill burst on Glass Tower F6 in 1.6 spawns at least 6 glow particles 0.2 m or more outside the footprint, inside the F6 height band. fx-browser: 30 blasts still add 0 draw calls.
- A hit from the left sets #hurt-edge data-dir='left' and clears it within 400 ms. At 3 shields or fewer the low-shield class is set.
- tests/audio.test.js with a FakeAudioContext:
  - every new cue creates at most 8 nodes and disconnects them when done (the existing 'flutter' cue is exempt);
  - laserHum held for 3 s creates its oscillators once;
  - muted starts 0 nodes;
  - after 10 simulated minutes at peak event rate, concurrent one-shots stay at or below 24 and live nodes at or below 120;
  - lockBeep keeps its rate limit.
- The context suspends within 2 s of visibilitychange to hidden. With the result dialog open after 2 s paused, it stays running and the star cue plays. It resumes before a menu sound.

### Files

- src/loop.js
- src/main.js
- src/game.js
- src/world.js
- src/strike.js
- src/river.js
- src/rescue.js
- src/fx.js
- src/audio.js
- src/ui.js
- src/style.css
- index.html
- tests/loop.test.js
- tests/feel-browser.mjs (new)
- tests/audio.test.js (new)
- tests/fx-browser.mjs
- tests/golden-browser.mjs

### Effort and risk

Effort: **M**.

A hit-stop longer than about 120 ms reads as lag, so keep the caps. The feel contract is proven in loop.test.js, not in real-time browser runs, because SwiftShader frames of 50-100 ms can step over a 90 ms stop. feel-browser checks only wiring (present is set, pops recycle).

Pops are capped at 16 and moved by transform only.

iOS Safari's unlock-on-gesture path must keep working, and the voice cap limits node churn.

Headless tests only count nodes, which is why the listen panel comes first.

Vehicle loops, haptics and an Effects volume slider are not in this item. They are mixed in 5.2 against the wind and rain bed.

## C1. Chapter 1 peaks: arm the meeting strike, a harbour endgame that stands down the boats that don't count, a LAST RUN resupply, a mast that falls

### Why

Marking the lieutenants' meeting while its label counts down, the most natural move, ruins the chapter's climax. autoRelease drops at once, at 33.9 s against the 36 s meeting: 2 kills, and the cell scatters.

On Normal, the default, the harbour is a hidden trap:
- Fleet.left() is max(quota - sunk, key hulls afloat) (harbour.js:274-280). Once the quota is met only the key groups count, yet every other boat keeps its red ripples and still pays combos.
- The pilot sank 72 against a quota of 40 and lost.
- It fails 1.7 and 1.8 with reason 'ordnance' (17 bombs used of par 8, at 232 s; 16 at 245 s), long before the 600 and 570 s tide windows. A player can meet the quota holding 0-1 bombs and be unable to finish.
- Key targets are groups: 1.7 'column' (4 patrol boats), 1.8 'frigate', 1.9 'ring' (5 escorts) and 'cinder'.

Mission 1.1, the first minute of the game, has no moment of payoff.

### What

1) Armed drop, on the UI path only.
- ui.markDrop calls a new strike.markAt(point). Pilots keep calling setAim, and the verified pilot rule still marks rallies only when next < 2.2 s (strike-browser.mjs:88). naivePilot goes through ui.markDrop, so '5/naive/normal' may change in this commit.
- A point within 3 m of a pending gathering (alive > 0, not active, next > 2.5 s) arms instead of dropping: aim = {x, z, rally, armed: true}. An indoor gathering sets the Drill floor to its storey.
- Arming never hovers. While armed, autoPilot returns null, so the flight patrols and the player steers as normal, and jinks and Reverse keep the arm. autoPilot steers onto the mark only once the gathering's convene time minus the forecast fall time is within 5 s.
- autoRelease releases an armed mark only when, at the forecast impact time, at least max(1, ceil(alive/2)) members are predicted (sampleRoute) within 2.2 m of the centre.
- The release button and a world tag read 'ARMED · DROPS IN 0:04 · 4 OF 6 EXPECTED'.
- A second tap cancels ('ARM CANCELLED'). An alerted cell cancels it with 'CELL SCATTERED'.
- The 1.6 hit blows out F6 (J1) under 'THE MEETING IS BROKEN'.

2) Harbour endgame, the simple version.
- Fleet.quotaMet() is true once hostile sinkings reach needed(). On the first tick it holds with key hulls (layout.required groups) afloat, fleet.endgame turns on, and every non-key hostile ship gets standDown.
- Stood-down ships keep their timetable: no new route, no flight, no disposal.
- They show a grey (0x8a96a8) 'STANDING DOWN' marker instead of health pips, hold fire, and leave targets(), bomb assist and the red ripples.
- Bombed anyway, they still sink but score 0, add nothing to the combo and toast 'NOT A TARGET / SAVE YOUR BOMBS'.
- Each required group gains a data 'title' in harbour-data.js. The objective is plural-aware:
  - 1.7: 'QUOTA MET · SINK THE CHANNEL COLUMN (2 LEFT)';
  - 1.8: 'QUOTA MET · SINK THE AA FRIGATE';
  - 1.9: 'QUOTA MET · SINK THE ESCORT RING (3 LEFT) AND CINDER'.
- Key hulls get a pulsing gold ring, a world tag, a map ping and an H1 edge chevron when off-screen, and keep their flak.
- Radio STRIKE_RADIO.quota per mission, e.g. 1.9 Ines: 'That's the quota! Only the ring and Cinder now, Kestrel.'
- harbourPilot skips stood-down groups, as a player reading the HUD would.

3) LAST RUN. Once per mission, on Easy and Normal, when the endgame is on, key hulls are afloat and the flight's total payload reaches 0, the lead live aircraft gets min(2, key hulls afloat) Sticks. This is checked before the 1.2 s ordnance timer (strike.js:1944-1947).
- Bram: 'Last run, Kestrel. Sticks on the rail. Make them count.'
- A 'LAST RUN' banner shows.
- The bombs count toward 'used', and the golden 'resupply' field records the grant.
- Hard and Crazy get none.
- Documented tuning lever if the Normal pilot still runs short: a Normal-only +1 bomb per type on 1.7 and 1.8.

4) 1.1 set piece (cut first, cosmetic and timed by events only). The jammer mast topples 80 degrees around its base over 1.2 s with sparks. Street lamps along three streets flick to emissive. Echo: 'Jammer's down. Network's back. I can see you, Kestrel.'

### Acceptance

- strike.test.js:
  - the arm rule releases only when at least max(1, ceil(alive/2)) members are predicted within 2.2 m at the forecast impact time;
  - an arm request less than 2.5 s before a gathering returns null;
  - while armed, autoPilot returns null until the 5 s steering window.
- Browser, 1.6 Normal: markAt on the meeting ring 15 s before it convenes sets aim.rally and the Drill floor to the rally's storey. Until the steering window, the flight's along-track speed stays above 50% of patrol speed (no hover), and a jink keeps aim.armed. Nothing is released before half the cell is predicted to arrive. The meeting blast kills at least 4, and no 'Runners heading for the ground floors' line fires. A second markAt shows 'ARM CANCELLED'.
- A source scan finds no markAt call in any pilot under tests/. naivePilot reaches it only through ui.markDrop.
- harbour.test.js, endgame:
  - quotaMet and standDown work on a stub fleet;
  - stood-down ships are absent from targets(), and their shipPose over 240 s equals the pose they would have had without standing down;
  - they never fire;
  - sinking one changes the score by 0 and leaves the combo count unchanged.
- Unit: the objective text reads '(2 LEFT)', '(1 LEFT)' and no count for single-ship groups, and names both groups on 1.9.
- LAST RUN: an ad-hoc harness run on 1.7 Normal wastes bombs on non-key hulls before the quota and meets it with 1 bomb or fewer left. It wins after the resupply. The same run on Hard fails 'ordnance' with resupply null.
- Browser, 1.7:
  - after the quota is met with key hulls afloat, the objective contains 'SINK';
  - the stood-down markers use the grey material;
  - the 'NOT A TARGET' toast shows on a detonation over a stood-down ship;
  - an off-screen key hull has an edge chevron.
- Balance sweep, 8 seeds:
  - harbourPilot wins 1.7, 1.8 and 1.9 on Normal in at least 7/8 seeds each (it fails 1.7 and 1.8 on 'ordnance' today);
  - its Easy win rate is not below the G1 baseline;
  - its Hard rate is recorded, with no target;
  - do-nothing on 1.7 Normal fails 'surge' at its window (endTime in [600, 600.02]) in 8/8.
- Golden scope: the re-baseline runs with --allow '6/*/*,7/*/*,8/*/*,5/naive/normal'. Every other key is byte-identical, and the diff is in VERIFICATION.md.
- Browser (if the set piece ships): on 1.1 the mast's rotation reaches 1.2 rad or more within 1.5 s of its kill.

### Files

- src/strike.js
- src/strike-data.js
- src/ui.js
- src/harbour.js
- src/harbour-data.js
- src/city.js
- src/world.js
- src/story.js
- src/style.css
- tests/strike.test.js
- tests/harbour.test.js
- tests/strike-browser.mjs
- tests/harbour-browser.mjs
- tests/golden-browser.mjs
- tests/golden/scripted-runs.json
- docs/VERIFICATION.md
- docs/REDESIGN.md

### Effort and risk

Effort: **M**.

The harbour change also moves the Easy rows 6-8, because stood-down ships stop firing and paying out on every mode. The sweep shows whether Easy got easier, and that is acceptable.

Fleeing ships and exit lanes are deliberately left out: dodge offsets, timetable swaps and 60-70 hulls converging on one mouth point would pile up.

If the Normal pilot still runs short on 1.8 after LAST RUN, use the documented Normal-only lever, so Easy does not change. Hard may stay low, which is recorded rather than tuned here.

The armed path must never leave a stationary flight under flak, which is why there is no hover.

City payload trim and rooftop missile teams are not in this item; see G1's decision gate.

## K1. Canal fairness: a boom that makes idling lose 2.1, and an engage line inside the frame

### Why

Doing nothing on 2.1 Normal wins in 9 of 16 seeds ('success' at 62 s). The rest fail 'hull' at 44-60 s. The first canal mission is a coin flip for an idle player.

On 16:9 desktop and landscape screens the view covers only z -34.5 to +24.5. Yet guns start aiming at z > -44 (river.js:718) and launchers fire at z > -46 (river.js:743). As a result, 63 of 110 hostile shots and 16 of 17 homing missiles were launched from above the visible frame.

Moving the camera forward is not an option. The barges sit at z 9.5 and 16.5, and Marlin's near bound is z 17, so the bottom of the frame must stay where it is.

### What

1) 2.1 'The Boom', so idling must lose on every mode.
- A new 'boom' script entry in river-data.js at d 186 on 2.1 only: a float-and-chain boom across the whole channel.
- The convoy eases to a stop 8 m short of it and holds until the boom is broken, reusing the Lock Gate hold path in river.js.
- Boom hp 14: about 7 deck-gun rounds, one rocket salvo, or 1.6 s of laser.
- Two crewed gun nests cover it (guns(180, ±1, {crew: 2})).
- A checkpoint 'THE BOOM', Okafor at d 176: 'Chain boom across the mouth, Marlin. Break it or the barges sit under those guns.'
- A one-time hint: 'Shoot the boom to let the barges through.'

2) Engage line, the same on every viewport so gameplay stays deterministic.
- ENGAGE_Z and LAUNCH_Z become constants in river-data.js.
- Guns start aiming at z > ENGAGE_Z (was -44) and fire 0.9 s later. Launchers and towers fire only at z > LAUNCH_Z (was -46).
- Starting values are -32 and -30. A browser probe checks that both project inside H1's free play rect (below the top bar and boss slot) at 1280x720, 844x390 and 390x844.
- If they do not at 844x390, raise landscape heightWorld (zoom out, at most 10%) rather than moving the line closer.
- The camera target never moves.
- An aimer still outside the free play rect gets an H1 edge chevron.

3) Tuning lever. If do-nothing's 8-seed win rate on any of 2.2-2.6 Normal rises above its G1 baseline, raise that mission's fireRate by up to 10%. Never move the line again.

4) The golden 'launches' field is filled for keys 9-14: hostile shots and missiles launched, and the count launched outside freeRect at the default viewport.

### Acceptance

- river.test.js, boom:
  - convoy travel does not advance while the boom stands, and resumes at mission speed once it breaks;
  - 7 deck-gun rounds break it and 6 do not;
  - the radio and the checkpoint fire once.
- river.test.js, lines: gun aim, launcher fire and tower targeting read ENGAGE_Z and LAUNCH_Z, and the 'threats at the top of the screen' test runs against the 16:9 camera depth as well as portrait.
- Browser: ENGAGE_Z and LAUNCH_Z project inside the free play rect at 1280x720, 844x390 and 390x844.
- Browser, skipper on Normal at 1280x720 and at 844x390: fewer than 5% of hostile shots and missiles are launched from points outside the free play rect (57% today).
- Browser: the barge and Marlin rects stay inside the canvas and outside every HUD panel rect at 844x390 and 1280x720, both on the approach and during the 2.6 hold.
- Balance sweep, 8 seeds:
  - do-nothing loses 2.1 on Easy and on Normal in 8/8 seeds (it wins 9 of 16 today);
  - the skipper wins each of 2.1-2.6 on Easy and Normal in at least 7/8 seeds and at no less than its G1 rate;
  - its mean stars stay within 0.25 of the baseline;
  - do-nothing's win rate on 2.2-2.6 Normal is not above the baseline.
- Golden scope: one re-baseline commit with --allow '9/*/*,10/*/*,11/*/*,12/*/*,13/*/*,14/*/*', with its diff in VERIFICATION.md. Every other key is byte-identical.

### Files

- src/river-data.js
- src/river.js
- src/world.js
- src/story.js
- tests/river.test.js
- tests/river-browser.mjs
- tests/hud-browser.mjs
- tests/golden-browser.mjs
- tests/golden/scripted-runs.json
- docs/VERIFICATION.md
- docs/REDESIGN.md

### Effort and risk

Effort: **S**.

All six canal runs are re-baselined at once.

Firing later can soften Normal. The fireRate lever is the answer, never a camera move, because the barges and Marlin must stay on screen.

If the Lock Gate hold path cannot be reused cleanly for the boom, use a small convoy speed scalar that the boom sets to 0. It is the same rule, tested the same way.

The boom makes idling lose on Easy too, which is intended. The skipper's Easy rate guards real players.

The pincer, the shuttered Lock Gate, the canal pressure clock and the gun-only star fix wait for 5.2, measured against these new baselines.

## X1. Release 5.1: clean-up pass, numbers recorded, docs, ship

### Why

The owner asked to clean up the code after the work. The release also needs its evidence in one place:
- golden diffs per commit;
- before/after balance tables;
- before/after performance numbers.
Without that, the next release starts from guesses again. Real-phone frame times were missing from every earlier plan.

### What

1) Clean-up over every file touched in 5.1:
- no dead code and no leftover debug paths;
- helpers moved out of the chapter suites are deleted where they were copied;
- tests/hygiene.test.js (new) scans src for exported names that nothing imports (allow-list for the qa API) and for 'TODO 5.1' markers, and fails on either.

2) Numbers in docs/VERIFICATION.md:
- the golden re-baseline diffs from C1 and K1;
- the balance sweep before (G1) and after (C1 and K1 missions);
- coverage per mission before (P1) and after (H1 and N1);
- p50/p95 frame times at 390x844, CPU throttled 4x, GPU=1, on 1.6, 1.8 and 3.4, before (P1) and after. p95 must not be more than 10% worse.

3) A qa frame-time readout (?qa&fps=1) shows p50 and p95 over 30 s. It gives the owner real-phone numbers for the same three missions, recorded as a 'real phone' row (or 'not measured' if no phone was used).

4) Docs:
- README: 5.1 features and controls;
- docs/REDESIGN.md: a 5.1 section;
- version strings set to 5.1.

5) The full local run, in this order, with no src edits while it runs:
- npm test;
- npm run golden;
- the browser suite on a private preview port.
Then push to main. CI tests, builds, runs the Chrome and golden jobs, and deploys Pages. Check that the live URL loads and shows 5.1.

6) Housekeeping. Stop this session's preview servers by exact PID, and delete this session's .scratch/ outputs except screenshots cited in VERIFICATION.md.

### Acceptance

- tests/hygiene.test.js passes: no unused exports outside the allow-list, and no 'TODO 5.1' left.
- docs/VERIFICATION.md holds the four tables (golden diffs, balance before/after, coverage before/after, throttled frame times before/after). Throttled p95 on 1.6, 1.8 and 3.4 is no more than 10% worse than P1's baseline.
- ?qa&fps=1 shows p50 and p95 frame times over 30 s, and the real-phone row is filled in or marked 'not measured'.
- npm test, npm run golden and the browser suite pass locally. CI on main is green for build, browser, golden and deploy.
- The live Pages build loads without runtime errors and shows version 5.1.
- No preview server started by this session is left running, and .scratch/ holds only the screenshots that VERIFICATION.md cites.

### Files

- tests/hygiene.test.js (new)
- src/ui.js
- README.md
- docs/REDESIGN.md
- docs/VERIFICATION.md
- package.json

### Effort and risk

Effort: **S**.

Another session may be editing the same repo. Fetch before pushing, and never run vite build into a dist/ that others are using during evaluation. CI builds its own.

The e2e run must not overlap src edits.

A real phone may not be at hand. The throttled numbers are the gate, and the real-phone row is reported honestly.

## Deferred to 5.2 and 5.3

- S1 Typhoon Ilse on screen, moved to 5.2. It covers moods for 0-8, one-draw instanced rain, seeded cosmetic lightning, a visible flood, a finale in the eye with merged gate leaves (8 boxes today), wind sway, an ambience bed and a Weather On/Off setting.
  - Reason: it is the largest phone cost in the plan and should land on P1's measured headroom and X1's frame-time numbers; it does not fit beside G1-K1.
  - Design corrections it carries: no geometric water rise in the harbour (ripples at y 0.07-0.17 and wakes at 0.1 would be buried); show the tide there with a shader tint or a shoreline foam band, or lift ripples, wakes and hulls by the same view offset.
  - Moods: 11 (missing) and 16 (saturation about 0.10) are listed as changed, or 16 is exempt as a deliberate squall.
  - Pine sway is new shader work with its own perf allowance.
  - Ripple and gold-ring contrast is computed from material colours against the lit water colour, or rendered under ?det=1.
  - Do-nothing flood checks use G1's run-to-window cap.
- The rest of R1, moved to 5.2: a pincer that forms (bank channels, armour until 2.5 s before the meeting, a shimmer tell, a 5.6 m chain) and a shuttered three-phase Lock Gate (towerHp 54, 3.5 s open/shut cycle, heavy shells, a 12 s grind, Okafor's lines).
  - Reason: it re-tunes all six canal runs again right after K1, so K1's baselines are measured first.
  - Corrections: no camera target move (the barges at z 9.5/16.5 and Marlin at z 17 must stay on screen; zoom out if more depth is needed); boss bars in H1's shared slot; every balance claim as an 8-seed rate.
- Canal depth, 5.2 with R1: about 27-48% empty water, gun-only play earning the same stars, and no canal pressure clock. Also weapon jobs (a laser that burns along its beam, explosive-only skiff chains, multi-lock rockets, armoured bow plates) and escort hazards (sandbars, oil, deck fires, boarding skiffs, boat yaw, Full Ahead, the searchlight and sluice currents).
  - Reason: the gun-only baseline must be retaken after K1 and R1.
- V1 Valley and finale, moved to 5.3: a valley clock, sector alarms, pin tethers, siteSilent; Marrow with telegraphed gun runs in three phases, an Ashen livery, the boss bar and the 'TIDELOCK SEALED' moment.
  - Reason: four runs are re-baselined, and the design depends on S1's darkness and on J1's present API being proven in play.
  - Corrections:
    - name the valley clock honestly ('LAST LIGHT 2:30' at 16:45 contradicts last light at 19:10), either 'DAYLIGHT' tied to the story clock or a fuel clock;
    - Marrow's bar goes in H1's boss slot;
    - combined storm and dusk darkening is clamped so sun intensity never falls below 1.8;
    - contrast checks on 3.2, 3.3 and the finale;
    - a Hard hit-chance cap of 0.8 for Marrow if siegePilot still loses;
    - runsBroken and phase are already reserved in the golden schema.
- The rest of J1, moved to 5.2: vehicle loops (jet drone, boat engine, rotor), haptics with a 44 px Vibration toggle, and an Effects volume slider.
  - Reason: they are mixed against S1's wind and rain bed, after the owner's listen pass on the 5.1 cue set.
- Music: a synthesized menu theme (5.2), then adaptive chapter music with a boss layer and more stingers, a lookahead sequencer in src/music.js, cast voice babble, and Music and Voices settings (5.3).
  - Reason: it needs a sequencer and a mix against the ambience bed, and the owner hears 5.1's cues and stingers first through the listen panel.
- City decision depth: the naive clicker wins all six city missions on Normal. Options for 5.2: Normal-only flak uptime or reaction time, a payload trim of about 0.8x, rooftop missile teams that answer back once alerted, and score-only skill rewards (Bullseye x1.5, hit chain, 'Ahead of the tide', a Beat-the-tide medal).
  - Reason: the owner has swung between 'easier' and 'too easy?'. 5.1 explicitly accepts the city as it is (recorded with G1's sweep numbers), and the tuning needs the owner's OK.
- Harbour flee paths (stood-down ships running for the mouth and being disposed of).
  - Reason: they need dodge zeroed on the timetable swap, staggered departures by group, flee sampling over the whole plan period and hull-separation tests. The 5.1 stand-down already removes the measured trap.
- The 1.6 camera push-in on the Glass Tower.
  - Reason: it belongs with story staging and must never hide a lock banner; the F6 blowout already marks the moment in 5.1.
- Gamepad support (src never calls getGamepads), 5.2.
  - Reason: it covers three control schemes (flight marks, boat stick, rotor), the menus and button-glyph prompts, and needs its own input audit and tests.
- Accessibility beyond 5.1's shape glyphs: a colour-blind palette option, a text-size setting and key remapping, 5.2.
  - Reason: each touches every HUD colour and ring material and needs its own audit pass after H1.
- Progression: star-criteria memory with 'Replay for' hints and a Hunt-stars filter; mode ribbons with +1/+2 first-clear points; weaker spare ordnance on Hard and Crazy; a Crazy hit-chance cap; requisition loadouts with sidegrades (total about 70); Lantern upgrades that act on hits and station integrity.
  - Reason: each re-baselines many rows, and the shop rework needs the 5.1 debrief data first.
- Valley content: authored mid-sortie set pieces (hold the ford, last bridge, Reyes's run), armour that needs rockets, crates on contested routes, and Marrow screening behind the ridge (which needs an Easy reachability survey).
  - Reason: it builds on V1 in 5.3.
- Story staging:
  - a comms-scene player with a typewriter reveal and 5 interstitial beats (it also fixes the 1067 px phone briefing scroll);
  - Blender toy-style cast portraits (owner contact sheet first, initials as fallback);
  - a title screen over the live harbour, a shorter prologue;
  - in-play hints for the boat (2.1) and the helicopter (3.1);
  - a staged outro, a three-voice choice card, epilogue cards, credits, a service record and two echo choices.
  Reason: owner art review, plus the most text and layout work. 5.1's INTERCEPT frame is the first visible character beat.
- Campaign shape: ordered unlocks with Skip after 2 failures, chapter debriefs, and Mission Control split into Pause and Campaign tabs.
  - Reason: it changes save flow and menus. 5.1's 'Try it on Easy' and the result-screen Requisition button cover the urgent part.
- Challenge modes: Iron Kestrel (no requisition, its own ribbon) and a date-seeded Daily Sortie.
  - Reason: G1's no-upgrade goldens and sweep give their baseline, but they need ribbons and progression first.
- Phone draw-call diet (instanced crowd parts, merged ship hulls, instanced valley roads without shadows, pooled tracers; target 250 or fewer at 390x844), with det=1 parity renders.
  - Reason: P1 takes the cheap 40%. This one is art-pipeline work.
- A smooth pipper moved every frame between the 0.07 s forecasts, world labels re-projected every frame, and the remaining per-tick allocation in the strike loop (cached targets(), updateFlight and updateBombs scratch) and in rescue.js (labels, marks, crew filters).
  - Reason: after P1's hot paths, measured by perf-browser.
- A headless NullView simulation harness, and splitting strike.js, game.js, ui.js and rescue.js along their seams, one module per commit, with CI sharding beyond two jobs.
  - Reason: it is safe only once the goldens and loop tests from 5.1 have run for a release.
- Meshopt-compressed GLBs (gltfpack -c -noq -kn -km, about -40%).
  - Corrected budget: the models total 4,477,584 bytes = 4.27 MiB of the 4.5 MiB limit, so about 235 KiB is free. That space is spent only on purpose, e.g. a small Blender detail for Marrow's gunship in 5.3 if it reads better than a tint.
- ESLint and Prettier, starting with no-undef and no-unused-vars as warnings.
  - Reason: they go in their own commit while no other session is editing src. X1's hygiene test covers unused exports meanwhile.
- An upstream same-value attribute guard for the shared mobile-game-support helper.
  - Reason: it goes through the iPhone gesture rollout workflow, and P1 removes the trigger locally.

## Risks

- Baseline shift: main.js:38 starts a mission at load, and the seed counts every start in the page (game.js:115-116). Fresh contexts and per-mission seeds therefore move every row once. Capture tests/golden/5.0-reference.txt on unchanged source, clear attemptsBy in the harness, land G1 alone with no gameplay change, and review the new baseline against the reference.
- Single-seed rows cannot carry balance claims: 2.1 idle wins 9 of 16 seeds, and the skipper's stars vary on 2.3-2.5. Goldens gate drift only. Every 'wins' or 'loses' acceptance is an 8-seed rate from npm run balance, compared with G1's baseline table.
- Golden churn: P1, H1, N1 and J1 must leave all 50 rows byte-identical (revert, don't re-baseline). C1 and K1 re-baseline only the keys in their --allow lists, in reviewed commits with their own acceptance. The frozen schema (reserved null fields) keeps a new field from touching rows its item does not own.
- Coverage blind spots: the goldens call game.update directly, so main.js and render() never run in them. The present API and the step contract are proven in tests/loop.test.js with fake timestamps, and render-side code by the four interleave checks (2.3, 1.8, 2.6, 3.4). Visual-only damage (ring radius, fragment motion) has its own checks.
- CI time and determinism: 50 fresh contexts under SwiftShader. The mitigations:
  - build once and share dist as an artifact;
  - run browser and golden jobs in parallel on Playwright's pinned, cached chromium, with timeout-minutes 30;
  - shard golden at 20 min;
  - record the browser version in the golden header so platform drift is visible.
- Cosmetic code touching game.random: pops, shake noise, the boom and (later) rain and lightning must never call it. randomCalls counted inside the seededRandom closure proves it. ?det=1 replaces Math.random in qa only, never game.random.
- HUD coverage: bigger controls and new chips push coverage up, while the targets are 40% (H1) and 36% (N1). The named cuts (collapsed minimap, intel chip, merged header, shield ring, one-row flight card) carry it. If a mission still misses, record the number and get the owner's sign-off rather than shrinking text or tap targets. Bigger controls also shrink the strike camera's city frame (hudInset, updateBadgeBounds): check at 320x568 and 844x390.
- Difficulty swings:
  - C1's stand-down also moves Easy harbour rows;
  - LAST RUN changes Normal;
  - K1's boom makes idling lose on Easy too;
  - the later engage line can soften Normal.
  Each is checked against G1's sweep. The levers are documented (Normal-only +1 bomb, fireRate up to +10%), and the city stays untouched in 5.1 by explicit decision.
- Text renames break tests: 'SURGE 4:30' (progress-browser.mjs:30) and the file-4 Okafor pin (story.test.js:43) change in the same commit as the text. Internal identifiers (op.surge, reason 'surge', surgeWindow) stay.
- Owner reviews at the front, not the end: docs/SCRIPT-5.1.md before any story code, and the qa listen panel before any cue is wired into play. Lines and cue parameters are data, so late edits never reopen logic.
- Feel and audio: a hit-stop over about 120 ms reads as lag, so the caps stay. iOS Safari's unlock path must keep working. The suspend rule must never silence the debrief or menus (checked in audio.test.js). Headless tests only count nodes, which is why the owner listens first.
- GLB budget: the models are 4,477,584 bytes (4.27 MiB) of 4.5 MiB, so about 235 KiB is free. 5.1 adds no model bytes: the shield ring, boom, pops and chevrons are primitives, pools or DOM. The assets test must show an unchanged total.
- Scope: 8 items (two L), with the internal cut order C1 mast, then J1 blowouts, then N1 survivor voices and harbour beats, then K1 engage line. Never cut G1, P1, H1, N1's timeline, closing-line card and director, C1's harbour endgame and LAST RUN, K1's boom, or X1. S1, the R1 set pieces and V1 are already moved out.
- Shared machine: other sessions run servers and builds here.
  - Use a private preview port and stop servers by exact PID.
  - Keep scratch files in the repo's .scratch/.
  - Never write into the shared dist/ during evaluation.
  - Fetch before pushing.
  - Make no src edits while an e2e run is going.
