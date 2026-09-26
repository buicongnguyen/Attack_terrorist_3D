# Release Verification

## Tidelock 2.6 (a lower city, with parks, road works and crowded barracks)

The lower storeys with blasts measured in storeys, the three kinds of park, the road works and the crewed barracks ([REDESIGN.md §14](REDESIGN.md#14-tidelock-26-a-lower-city-with-parks-road-works-and-crowded-barracks)) were verified on 2026-09-26 against the production build (`vite preview`), with GPU rendering and with SwiftShader as in CI.

- **77 Node tests.** New or changed:
  - storeys of 1.9 m, a figure still fits, and the tallest tower clears the flight;
  - blasts reach the same floors as with 2.8 m storeys, and a street-level blast is unchanged;
  - the wider city is low and open: towers of one to three storeys on under half the lots;
  - crewed barracks: one storey, next to each mission's blocks, 0/1/1/1/2/2 of them;
  - each crewed barracks brings two bombs, and Crazy always keeps at least one spare;
  - road works: one lane of an inner street, clear of the walking line, doorways, crossings and the convoy loop, one per segment;
  - every mission re-expands identically, and the authored missions are never changed.
- **275 browser checks**, zero runtime or resource errors, both on the GPU and on SwiftShader. New:
  - each crewed barracks holds five fighters on its one floor, all counted as targets;
  - one bomb clears a barracks on Easy, and one Drill does on Crazy, whether it bursts on the floor or on the roof;
  - every marker sits inside its target's own storey, and so does the Drill's floor band;
  - a Drill set to F3 reaches F4 but never F5;
  - letting go, the flight drifts (the check no longer assumes it stays clear of the patrol edge).
- **Scripted pilots**, all on Easy:

  | Missions | Result |
  | --- | --- |
  | City 1.1–1.6 | all six, crewed barracks and tunnels included; 1, 4, 5, 8, 9 and 13 bombs in 11–173 s |
  | Harbour 1.7–1.9 | the quota with the lower warehouses: 20, 15 and 20 bombs in 190–323 s |
  | Canal 2.1–2.6 | all six, 3 stars each |
  | Rescue 3.1–3.3 | full sorties home |
- **Layout audit** at eight sizes from 320×568 to 1440×900, with banners and help forced on: no overlaps, nothing off-screen. World tags now sit under every panel.
- **Rendering:** 216–627 draw calls in the city (1.6 is the most; its barracks crews skip the shadow pass), at most 1.7 ms a frame there and 2.4 ms in the busiest harbour on the test GPU.
- **Independent review:** 5 findings and a tail of smaller ones, all fixed ([REDESIGN.md §14](REDESIGN.md#independent-review-of-26)).

## Tidelock 2.5 (easy by default, free flight, an airier city, a harbour four times the size)

Difficulty modes, free flight, hit chances, ripples, the airier city with tunnels, the 2 × 2 harbour with badges and health bars, and the canal's markers ([REDESIGN.md §13](REDESIGN.md#13-tidelock-25-easy-by-default-free-flight-an-airier-city-and-a-harbour-four-times-the-size)) were verified on 2026-09-26 against the production build (`vite preview`, GPU rendering).

- **72 Node tests.** New:
  - four modes with Easy the default;
  - on Easy nothing can hit you in the first two city and canal missions, and never more than 10 %;
  - each harder mode hits at least as often, never beyond certain;
  - every lever points the right way from Easy to Crazy; payloads scale but never lose a bomb type;
  - the per-mission random source repeats exactly;
  - streets twice as wide as they were;
  - tunnels only in yards beside each mission's blocks, never under a building, with their garrisons;
  - every harbour 270 m long and twice as deep, with 99–108 boats and a quota between a third and a half;
  - fits for the new flotillas; no hull overlaps or grounding over four minutes.
- **269 browser checks**, zero runtime or resource errors. New:
  - holding back turns the flight round and flies it back; a light touch creeps; let go, it drifts; the safe airspace holds; every target ripples;
  - flak with no chance never harms a held course;
  - garrisons hide underground, a near miss spares them, a hit on the entrance collapses it, and a fighter in the street runs into a tunnel;
  - Crazy carries fewer bombs and flak that can hit from 1.1; the mode is saved and shown; Easy comes back;
  - a mark on a circling raider still gets its drop;
  - harbour badges are a symbol and a count, with stars on key groups;
  - the canal banner names the hit chance, and guns wear health pips.
- **Scripted pilots**, all on Easy (the default):

  | Missions | Result |
  | --- | --- |
  | City 1.1–1.6 | all six, tunnels included; 1, 3, 4, 9, 8 and 9 bombs in 11–133 s |
  | Harbour 1.7–1.9 | the quota by marking groups: 20, 15 and 20 bombs in 190–323 s |
  | Canal 2.1–2.6 | all six, barges almost untouched, 3 stars each |
  | Rescue 3.1–3.3 | full sorties home |
- **Layout audit** at eight sizes from 320×568 to 1440×900 (tablets 768×1024 and 820×1180 included) across city, harbour, canal and rescue, with the flak banner, the canal banner, every help timer and the difficulty chip showing: no overlaps, nothing off-screen.
- **Rendering:** 188–572 draw calls; at most 2.5 ms a frame on the test GPU, the 108-boat harbour included.
- **Independent review:** 7 findings and a tail of smaller ones, all fixed ([REDESIGN.md §13](REDESIGN.md#independent-review-of-25)).

## Tidelock 2.4 (crowded harbours, a canal at war)

The crowded harbours, the angle buttons, the wider canal with its weapons, air strike and help, and the three new canal missions ([REDESIGN.md §12](REDESIGN.md#12-tidelock-24-crowded-harbours-and-a-canal-at-war)) were verified on 2026-09-26 against the production build (`vite preview`, GPU rendering).

- **64 Node tests.** New:
  - every harbour has 30 or more boats, a quota between 80 % and 100 % of them, its key groups and enough bombs;
  - each new group has a pattern and angle that sinks it in one release, sidesteps included;
  - no hull collides or runs aground over four minutes of every timetable in the widened harbours;
  - six canal legs with valid crates and nothing spawned in the banks;
  - the new legs teach rockets, the laser, the gunship and the escort;
  - an air strike always crosses the canal bank to bank, ahead of the barges;
  - the laser overheats after 3.2 s and restarts once cooled;
  - saves from 2.2 and 2.3 keep their records on the right missions.
- **Browser checks**, zero runtime or resource errors. New:
  - a mark in the far west basin: the flight flies there, the camera slides after it, and the Stick sinks a boatyard row;
  - the angle buttons turn and flip the pattern;
  - the quota waits for the key ships, then lets the rest run;
  - keys 2 and 3 pick rockets and the laser;
  - a rocket salvo of three bursts through a pack;
  - the laser burns a gun down in under a second, then overheats;
  - Q lays the air strike across the canal and clears it, every bomb more than 10 m ahead of the barges;
  - two strikes only dent the lock gate;
  - crates restock rockets and strikes and call the gunship and the escort;
  - the gunship fires where Marlin fires, and help does not count towards accuracy.
- **Scripted pilots:**

  | Missions | Result |
  | --- | --- |
  | Strike 1.1–1.6 | as in 2.3 |
  | Harbour 1.7–1.9 | quota reached with 15, 14 and 16 bombs (the greedy pilot steers by hand, no marks) |
  | River 2.1–2.6 | all six with both barges; 3, 3, 2, 3, 2 and 3 stars |
  | Rescue 3.1–3.3 | full sorties home |
- **Layout audit** at nine sizes from 320×568 to 1440×900 across city, harbour, canal and rescue, with every help timer and weapon showing: no overlaps and nothing off-screen.
- **Rendering:** the crowded harbours draw 290–505 calls; a frame costs under 2.5 ms on the test GPU.
- **Independent review:** 5 defects and a tail of smaller ones, all fixed ([REDESIGN.md §12](REDESIGN.md#independent-review-of-24)).

## Tidelock 2.3 (mark the drop, a wider city)

Aim marks, homing assist, mission power, the 3 × 4 city and the sliding camera ([REDESIGN.md §11](REDESIGN.md#11-tidelock-23-mark-the-drop-a-wider-city)) were verified on 2026-09-26 against the production build (`vite preview`, GPU rendering).

- **59 Node tests.** New:
  - every city grid is exactly three times wider and four times deeper, with each outer lot holding one tower or one park, generated the same way every time;
  - bounds, flight lanes and turn points cover the whole grid;
  - mission power and assist fall from 1.1 to 1.6, and the harbour keeps power 1;
  - the building index agrees with a search of every building for 400 random points and 200 random segments in every direction.
- **217 browser checks**, zero runtime or resource errors. New or changed:
  - a click on the jammer mast marks it, the flight flies there by itself, and its bomb wins 1.1;
  - a right click cancels a mark;
  - the Drill still lands where its forecast says (checked with the assist off).
- **Scripted pilots** now fly the city by marking targets, as a player would:

  | Missions | Bombs used against par | Time |
  | --- | --- | --- |
  | Strike 1.1–1.6 | 1/1, 2/2, 3/3, 7/5, 4/6, 9/8 | 9–105 s (2.2's manual pilot needed up to 420 s on the bigger map) |
  | Harbour 1.7–1.9 | 3/2, 4/4, 6/6 | 22–28 s |
  | River and rescue | unchanged | |
- **Layout audit** at 320×568, 390×844, 844×390, 568×320, 768×1024, 1024×768, 1280×800 and 1440×900 with the map panel: no overlaps and nothing off-screen. On phones the map is hidden.
- **Rendering:** 180–450 draw calls and 0.7–1.1 M triangles (shadow pass included) across the city missions; a frame of the Glass Tower costs 1.4 ms on the test GPU, against 2.9 ms for 2.2's smaller district.

## Tidelock 2.2 (slow flight and harbour strikes)

The slower back-and-forth flight and the three harbour missions ([REDESIGN.md §10](REDESIGN.md#10-tidelock-22-the-slow-flight-and-the-harbour-strikes)) were verified on 2026-09-25 against the production build (`vite preview`, GPU rendering).

- **54 Node tests** (`npm test`). New since 2.1:
  - pattern shapes and their rotation;
  - hull segments and blast reach;
  - every harbour group has a pattern and angle that sinks it in one release, sidesteps included, without touching a civilian;
  - the angle lessons fail when the pattern is turned a quarter the wrong way;
  - the L's sweet spot on the L pier is at least four times any other shape's;
  - the O-Ring spares the ferry when centred and hits her two metres off;
  - no hull overlaps another or runs aground over four minutes of every timetable, including its turns and the freed ferry's run;
  - stations count down, and permanent stations are always on;
  - the gathering windows outlast the worst wait with Reverse;
  - saves from before the harbour keep their records on the right missions.
- **215 browser checks**, zero runtime or resource errors. New since 2.1:
  - the flight: Reverse starts a wingover and flies back along the same lane; the edges turn the flight round by themselves; speed is screen-relative; F reverses; a mouse click on the map releases;
  - pattern bombs:
    - the harbour opens on its pattern, and the pattern turns by 45°;
    - a Stick bursts into five bomblets, an aligned Stick sinks the column, and sunk ships count;
    - **the hit counter matches what actually sinks**: a Stick on the column and an O-Ring on the ferry are released live, sidesteps included;
  - controls:
    - payload keys follow the chips on screen;
    - the wheel turns the dial one step per notch;
    - Reverse is refused where the edge would only turn the flight round again;
    - the aircraft carry their speed on the tick a turn ends;
    - E / C do nothing where there is nothing to set;
  - ships dodge falling bombs, but moored boats can't; ship flak dies with its ship;
  - civilians: hitting the launch aborts the strike; the forecast sees the ferry in a pattern; breaking the escort ring frees the ferry;
  - all 49 models load; river and rescue checks run at their new mission numbers.
- **Scripted pilots complete all fifteen missions** with ordinary controls:

  | Missions | Result |
  | --- | --- |
  | Strike 1.1–1.6 | bombs used against par: 1/1, 2/2, 3/3, 7/5, 5/6, 10/8 |
  | Harbour 1.7–1.9 | 3/2, 4/4, 4/6, using Reverse 2, 1 and 2 times |
  | River 2.1–2.3 | 3, 3 and 2 stars |
  | Rescue 3.1–3.3 | full sorties home |
- **Layout audit** at 320×568, 320×740, 390×844, 844×390, 568×320, 768×1024 and 1440×900, across all nine Chapter 1 missions, with coach and flak callouts showing:
  - no HUD overlaps, no control off-screen, and every flight-panel button inside the panel;
  - on the 320×568 phone the coach line steps aside while a radio line is showing.
- **Draw calls** stay under 500 in every tested scene: the harbour missions 1.8 and 1.9 draw 250 and 348, the Glass Tower 499.
- **Independent review.** A separate reviewer reproduced 12 defects in the harbour update, among them a hit counter that ignored ship sidesteps and hull headings that disagreed between forecast and live. All are fixed ([REDESIGN.md §10](REDESIGN.md#independent-review-of-the-harbour-update)).

Limits: the scripted pilots are greedy and prove only that each mission can be finished; on 1.7 and in the city they still use more bombs than par. Ship evasion is deliberately gentle and has not been tuned with real players.

## Tidelock 2.1 (second evaluation and review pass)

The fixes in [REDESIGN.md §9](REDESIGN.md#9-second-review-pass-tidelock-21) were verified on 2026-09-25 against the production build (`vite preview`, GPU rendering).

- **44 Node tests** (`npm test`). New since 2.0:
  - someone standing on a slab can be seen from the room above it;
  - every gathering outlasts a full pass cycle;
  - the Lock Gate medal is not scripted and has room to reach Marlin;
  - the base rearm never lowers stock;
  - the campaign resumes at the first mission without a record.
- **174 browser checks**, zero runtime or resource errors. New since 2.0:
  - Chapter 1:
    - flak hits a held course but misses a break after the solution freezes;
    - a flak lock keeps its target;
    - success waits for bombs in flight;
    - a Drill detonates where its forecast said;
    - rally labels count who is there and read SCATTERED after an alert;
    - the coach teaches mission 1.1;
    - flight controls appear only when the flight can use them.
  - Chapter 2:
    - kills chain into combos;
    - a ramming skiff dies without a reward, even mid-aim;
    - gate towers take hits at their base;
    - the medal floats out when the gate opens.
  - UI:
    - AZERTY keys steer by position;
    - the result dialog focuses its main action and ignores a held Space;
    - the Reduced motion setting reaches the HUD.
  - Scripted pilots still complete all twelve missions:

    | Missions | Result |
    | --- | --- |
    | Strike 1.1–1.6 | bombs used against par: 1/1, 2/2, 3/3, 6/5, 5/6, 10/8 |
    | River 2.1–2.3 | 3, 3 and 2 stars |
    | Rescue 3.1–3.3 | full sorties home |
- **Layout audit** at 320×568, 320×740, 390×844, 844×390, 568×320, 768×1024, 1024×768 and 1440×900:
  - no HUD overlaps, including the coach and flak callouts;
  - no control off-screen;
  - the district framed above the flight panel and touch stick.
- **Loading failures.** A blocked script bundle and a missing model each show an error and a Reload button.

## Tidelock 2.0 (Operation Breakwater redesign)

The redesign ([REDESIGN.md](REDESIGN.md)) was verified on 2026-09-25 with the commands below against the production build (`vite preview`, SwiftShader WebGL, the same setup CI uses) and again against the dev server with GPU rendering.

- **39 Node tests** (`npm test`):
  - rally schedules converge in every cycle and are spread out between cycles;
  - walkers never cross building footprints and change floors only at stair cores;
  - the pipper forecast matches a mirror of the live bomb loop to 1e-6;
  - the Drill reports the floor it actually reaches, and warns when it would pass through the shelter;
  - Scatter covers a solid disc, and one shelter rule serves both the warning and the abort;
  - pincer skiffs meet abreast, and river scripts are ordered;
  - story coherence: every mission has a place, goals, briefing, radio and both debriefs; Marrow speaks in every chapter; Reyes carries the key home;
  - every GLB has the nodes and materials the runtime animates or recolours, and the model set stays under 4.5 MiB.
- **155 browser checks** (`npm run test:browser`, 128 s):
  - all 41 models load;
  - the prologue, briefing and radio flow;
  - real keyboard steering, release and floor keys, plus a 200 ms ladder press;
  - the shelter abort and victory debriefs with star criteria;
  - convoy mechanics: wake following, body-blocking, drum chains, pincer meeting and chain, full columns;
  - Chapter 1 regressions: flight loss waits for bombs in flight, people fall through holes, the tallest roof is selectable;
  - **scripted pilots complete all twelve missions** with ordinary controls:

    | Missions | Result |
    | --- | --- |
    | Strike 1.1–1.6 | bombs used against par: 1/1, 2/2, 4/3, 5/5, 5/6, 10/8 |
    | River 2.1–2.3 | 2–3 stars, with real barge damage |
    | Rescue 3.1–3.3 | full sorties home |

  - rendering: non-blank scenes under 900 draw calls;
  - layouts: phone and tablet layouts without overlap at 320×740, 390×844, 844×390, 768×1024, 568×320 and 667×375, including the portrait strike camera and touch sticks;
  - zero runtime or resource errors.
- **Independent review.** A separate review pass reproduced 12 defects, and all were fixed with regression tests (see [REDESIGN.md §8](REDESIGN.md#8-code-and-logic-review)). The scripted-pilot runs are deterministic: the one random gameplay choice (boss wave side) now alternates.

**Limits.** Browser emulation is not real-device testing. The scripted pilots prove reachability and pacing, not human difficulty. Ballistics and patrols are arcade models, not simulations. Destruction removes slab and wall tiles but there is no structural collapse. Progress saves only in the local browser.

## Earlier releases

The sections below record the first releases, before the redesign.

## Launcher Shutdown Update

Chapter 3 cave launchers and mobile anti-air racks now stop firing permanently after a landed hit. Traveling-projectile tests verify shutdown, twenty seconds without new launches, one-time cave rewards, preservation of missiles already airborne, and fresh launchers on retry. The suite now has 16 Node tests and 103 browser assertions. Chapter 2 launchers retain their existing rules.

## Rescue Update

[Chapter 3 search and rescue](CHAPTER3-RESCUE.md) replaces the fixed helicopter defense with a larger following-camera map and three extraction sorties. Coverage now includes 15 Node tests and 95 browser assertions, 20 Blender assets, limited ordnance, flare countermeasures, friendly-fire protection, interrupted winches, base return, and all three complete rescue routes. Touch tests include real two-finger Chrome input and narrow landscape/tablet layouts. Screenshots and canvas-pixel checks verify the helicopter chapter at several map locations. Browser emulation is not real-device testing.

The historical sections below describe earlier releases, including the helicopter defense missions that this update replaces.

## Detail Update

The subsequent [3D detail and pickup review](REVIEW-DETAILS.md) expands coverage to 11 Node tests and 54 browser assertions, 17 GLBs, independent bonus timers, authored gun muzzles, and HUD-safe pickup badges. It adds 320x740 mobile emulation alongside the original desktop and phone orientations. The sections below preserve the initial release's verification history.

## Automated Checks

Eight Node tests cover render-rate-independent stepping, catch-up limits, fast swept collisions, analog movement, speed limits, damping, cannon-es bounce energy, forecast agreement before contact, shield absorption, and best-score persistence.

The browser suite exercises:

- Loading every one of the thirteen GLB models.
- A nonblank WebGL canvas with more than 10,000 triangles and varied sampled pixel colors.
- Completing the first mission using a timed keyboard release.
- Boat movement on both axes, manual fire by default, common cooldown gating, and projectiles damaging a moving cannon after travel.
- Scrolling river enemies, repair/twin/guided/medal pickups, and guided support shots.
- Armor absorbing a multi-point mine hit across remaining boat protection.
- Gradually opening caves on dry terrain, missile interception, and localized helicopter shield breach.
- Fresh retry state, failure taking priority over simultaneous completion, and paused simulation.
- All chapters at 1440x900 desktop, 390x844 portrait, and 844x390 landscape.
- Mission selection and joystick movement at both mobile viewport sizes.
- Browser exceptions and resource errors.

The initial suite passed 28 browser assertions with zero runtime/resource errors. The captured desktop canvas contained 152 quantized colors and approximately 31,000 rendered triangles in Chapter 1. Counts vary with mission and effects.

## Additional Playability Checks

All six Chapter 1 missions were simulated to success with actual falling/drilling pods and their configured ammo budgets: 1/1, 1/1, 1/1, 3/3, 6/6, and 10/10 opponents. These tests selected release positions programmatically but used ordinary projectile physics and damage. A separate browser test uses the actual Space key release for the first mission.

Full-length automated play also reached the objectives in all three river missions and all three helicopter defenses using ordinary movement, weapon cooldowns, pickups, interception, and rockets. The harder missions required prioritizing launchers, collecting repair supplies, and using rocket suppression. These controlled runs show that the campaign is completable; they do not replace human difficulty playtests.

Additional pixel checks covered every chapter at both 390x844 and 844x390. Each scene contained 88-142 quantized sampled colors and different canvas hashes at different water-animation times, confirming nonblank animated rendering in both phone orientations.

The first Linux CI run exposed a fixed-wall-clock assumption in the joystick test on software WebGL. The test now waits for observed movement with a bounded timeout. Paused missions also stop unnecessary GPU rendering while still redrawing on resize. The corrected [GitHub Actions run](https://github.com/buicongnguyen/Attack_terrorist_3D/actions/runs/34484150202) passed both jobs and deployed commit `de1689d` to [the public game](https://buicongnguyen.github.io/Attack_terrorist_3D/).

The public URL returned HTTP 200 with the expected release asset `index-_Qx5-d9A.js`. The complete 28-assertion browser suite also passed against the deployed GitHub Pages URL, including all thirteen model loads and both mobile orientations, with zero runtime or resource errors.

Visual review found and corrected washed-out Blender materials, overly dense water highlights, near-plane clipping on tall portrait viewports, and decorative rocks/palms covering cave entrances. The models now have explicit linear-space colors; terrain and vehicles remain separate from the animated water.

Logic review found and corrected duplicate drill-layer counts at adjacent tile edges, damage leaking past remaining boat armor, and mismatch between visible shield arcs and sector indexing. Friendly and enemy projectiles use distinct colors and shapes; hit detection follows their travel.

## Practical Limits

- This is a first playable arcade release with authored low-poly assets, not a finished commercial art pass.
- Touch layouts and pointer capture are browser-emulated. Real iOS Safari and low-end Android hardware still require device testing.
- Desktop screenshots were captured in headless Chrome with software WebGL. They verify rendering and layout, not a real-device 60 FPS performance guarantee.
- Chapters 1 and 2 use fixed cameras; Chapter 3 follows the helicopter through the valley. Precision bombing intentionally keeps its easy-to-read side-plane control scheme.
- Drilling removes local slab tiles. Full structural support/collapse simulation is a future improvement.
- Bomb trajectory previews end at first geometry contact. Post-impact travel depends on the physics engine and selected fuse.
- Cave geometry is simplified and repeatedly suppressible. Character poses are node animations, not motion-captured skeletal clips.
- Progress is local to the current browser; there is no account, multiplayer, or online leaderboard.
- Browser tests inspect all chapter types, but human difficulty balancing across all river and helicopter missions is still a follow-on playtest task.

## Reproduction

```sh
npm ci
npm test
npm run build
npm run preview -- --port 5183
npm run test:browser
```

The QA object is exposed only when the URL includes `?qa=1`, allowing deterministic test scenarios. Normal play does not expose that test handle.
