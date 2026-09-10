# Tidelock: Operation Breakwater

## 1. Purpose and Scope

Turn the original Sky Drill prototype into a coherent, playable 3D browser game. The repository requested by the owner is `Attack_terrorist_3D`; the player-facing title is **Tidelock: Operation Breakwater**. Keep the original three chapter ideas and twelve missions, but rebuild rendering, interaction, art, progression, and physics around a shared engine.

This document distinguishes the first playable release from later production ambitions. A polished browser arcade game is achievable here; a photorealistic open-world military simulator is not the scope. The conflict is fictional, set in the Meridia archipelago, with small stylized opponents and non-graphic effects.

## 2. Evaluation of the Existing Game

Reviewed source: `Games/src/game.js`, `Games/index.html`, and the existing `Games/skydrill2/README.md`. Sky Drill 2 already records useful improvements such as fixed simulation steps, swept collisions, chapter continuity, and saved progress. Preserve those lessons rather than reproduce the first prototype's defects.

| Finding | Player impact | 3D response |
| --- | --- | --- |
| Chapter 2 background art has historically depicted mines and cannons | Decorative objects are mistaken for shootable hazards | No painted gameplay objects; every mine, crew member, turret, and launcher is a state-owned 3D entity |
| Ship created at a display size, then `setScale(1, 1)` applied at `game.js:3029` | Sprite can jump to full texture dimensions | Models use a single authored metre scale; no texture-derived size changes |
| `fireHeliWeapon` applies hits immediately while drawing a traveling shot | Hit timing contradicts what the player sees | Projectiles travel in world space and use swept collision over their actual path |
| Fire methods have inconsistent cooldown enforcement | Keyboard, pointer, and touch can have different fire rates | A single weapon controller gates every input source |
| Flat background landmarks and colliders are unrelated | River holes or ghost hazards break spatial trust | Geometry, spawn zones, and colliders use the same world coordinates |
| Abstract timers and generic chapter names | Little motivation to continue | Clear campaign cause and effect, named missions, field transmissions, extraction progress |
| Dense controls across the mobile view | The action is hard to see | Compact top HUD, collapsible mission/settings panel, bottom controls within safe areas |
| Large effects overwhelm small enemies | Hard to judge accuracy | Distinct projectile colors, compact impacts, short-lived smoke, visible hit feedback |
| Restart can retain a run's accumulated score | Repeated retries can inflate score | Per-mission score; only a better completed result replaces the saved record |

## 3. Creative Direction

### Story

The Ashen Front has occupied the Meridia islands and shut the only relief corridor. A storm is approaching. Commander Iona coordinates a small response team aboard the survey carrier *Kestrel*. The player clears the defenses, takes a relief launch upriver, and holds the mountain extraction zone until the stranded survey crew can evacuate.

The chapter order has a reason: tower relays control the canal defenses; the relief launch carries a navigation beacon to the mountain base; the helicopter protects the extraction once the beacon is active. Avoid long cutscenes. Use a short initial transmission, one mission objective, a completion report, and a final rescue message.

### Art

- Bright, low-poly coastal dioramas: turquoise moving water, pale concrete, green palms, chalky rock, navy vehicle hulls, and warm yellow rescue markings.
- Three-quarter orthographic cameras keep tactical distances legible. Chapter 1 exposes building interiors; Chapter 2 looks farther down the canal; Chapter 3 frames the helicopter and opposing mountain positions together.
- Vehicles should read as vehicles even at mobile scale: boat with bow, cabin, railings, rotating gun tower, and a small crew member; helicopter with cockpit, tail, moving rotor, and segmented shield; carrier aircraft with wings and propellers.
- Faction shapes and colors are redundant: friendly rounds are cyan streaks; hostile missiles have coral bodies and visible fins; pickups have different geometry as well as color.
- Do not use real flags, real countries, photo backgrounds, or scenic objects that resemble interactive targets.

### Sound and Feedback

- Lightweight WebAudio sounds for fire, impact, pickup, objective complete, and shield damage. Audio starts only after player interaction and respects mute.
- Small impact flashes, physically moving fragments, expanding rings, short smoke trails, water wakes, and temporary target hit flashes.
- Reduced-motion setting removes camera shake. Do not make readability depend on sound or camera motion.

## 4. Campaign and Gameplay

### Chapter 1: Breakwater

Six compact precision puzzles, preserving three single-opponent missions followed by groups of three, six, and ten. Later missions provide approximately half as many bombs as opponents. Skill comes from release position, launch speed, drilling depth, fuse timing, and blast placement.

1. **First Light**: one exposed ground-floor opponent; generous default trajectory and two pods to learn the release timing.
2. **Concrete Echo**: one opponent in a taller structure; drill through several slabs.
3. **Low Road**: one opponent behind a stronger foundation; test a delayed or bounce fuse.
4. **Relay House**: three opponents; two pods; use room-sized blast overlap.
5. **Crosswind**: six opponents; three pods; release timing becomes tighter.
6. **The Last Relay**: ten opponents; five pods; clear the final relay to open the canal.

Loadout: Drill / Bounce / Timed. Flight program: Ballistic / Hook / Zigzag. Controls: launch angle, launch speed, fuse, and number of slabs to penetrate. Each released bomb captures its settings; later slider changes affect only future bombs. Loadouts can apply to all remaining pods or only the next pod.

Bombs inherit aircraft velocity. Gravity, damping, contact friction, and restitution are handled by cannon-es. Guidance is explicitly an arcade force, not a claim of passive ballistic realism. Drill penetration uses swept segment tests against the same slab geometry used for rendering. A slab is counted once per projectile. Foundations have double resistance. Bombs make a narrow local gap; detonation damages a room-sized area. Debris gets rigid-body motion and a short lifetime.

The aim preview is an unobstructed ballistic/guidance forecast generated from the same motion rules. It ends at the first structure or terrain contact; it must not promise an exact post-impact path when contact resolution is not included.

### Chapter 2: Relief Run

Three legs: **Green Channel**, **Narrow Passage**, **Beacon Delivery**. Move freely inside a wide channel while banks, guns, houses, mines, and pickups move past at the same travel speed. Water flow is visualized separately from the boat's travel speed.

- Manual hold-to-fire by default, with a shared moderate cadence. Desktop points into the world; touch uses a right aim/fire stick.
- Bank cannons have two crew members; launcher houses telegraph a coral launch glow for one second before firing. Destroying a launcher causes a larger explosion that can eliminate adjacent cannons and crew.
- Mines are faintly visible at a distance, rise and brighten as the boat approaches, and can be shot before contact.
- The boat has three shield banks, each with three hit points. Damage consumes protection before hull failure. The HUD shows all nine points; medical pickups refill them.
- Star pickup grants twin automatic guns for seven seconds. Gun pickup grants guided support missiles for five seconds. Medal awards score. Medical supply repairs shields.
- Travel progress, destruction score, and damage taken determine the mission result. Surviving is the main objective; optional targets improve the result.

### Chapter 3: Last Light

Three defenses: **Hidden Signals**, **Stone Choir**, **Clear Skies**. A helicopter moves around the near side of the arena. Mountain caves are placed on dry rock shelves, never in the river. More openings appear gradually as the mission advances.

- A cave opens, a small opponent emerges, a launcher follows after three seconds, and a missile follows five seconds later. Larger caves are more durable and worth more points.
- Gunfire can hit opponents and intercept missiles. Player rockets close caves longer and damage nearby opponents. Gunfire closes an opening briefly, buying time rather than permanently deleting its geometry.
- Hostile missiles steer toward the helicopter with bounded turning, have coral fins and exhaust, and grow slightly as their threat increases. Intercepting a close missile awards a risk bonus.
- Three visible shield sectors each absorb one hit. A later hit through that broken sector reaches the helicopter and fails the mission.
- Hold until extraction reaches 100%. End the campaign with the crew rescued and a replay option.

## 5. UI and Controls

First screen is the live 3D mission, not a marketing page. The world remains full-bleed behind a restrained HUD.

| Surface | Desktop | Phone |
| --- | --- | --- |
| Top bar | Brand, chapter tabs, score, pause, sound, settings | Small brand, current chapter, icon actions |
| Objective | Compact upper-left transmission and progress | Short objective line and compact progress |
| Bomb setup | Bottom compact loadout strip | Small bottom sheet opened by loadout icon |
| Movement | WASD / arrows | Left floating joystick |
| Fire | Aim with pointer, hold primary button or Space | Right aim/fire joystick and rocket toggle |
| Retry / skip | Pause/settings panel | Same panel, hidden during play |
| Progress | Mission name, stars, score | Same information at smaller density |

Accessible names on all icon buttons, tooltips for unfamiliar controls, visible focus rings, touch targets at least 44 CSS pixels, reduced motion, mute persistence, and no browser scrolling while using the sticks. Help is available in the settings panel; it does not cover the active field by default. Chapter selection remains available for testing without granting completion rewards.

## 6. Blender Asset Pipeline

Use Blender 4.5 LTS in background mode with a checked-in Python authoring script. Commit the script, generated `.blend`, and exported `.glb` models. Runtime does not require Blender.

Coordinate contract: author in Blender Z-up, export glTF Y-up, use metres, unit scale 1. Model forward is Blender +Y (runtime -Z). Origins at the ground/water contact for props and vehicle centre for flight assets. Name articulated nodes: `Turret`, `Barrel`, `Rotor`, `Propeller`, `ArmL`, `ArmR`, `LegL`, `LegR`.

Asset list:

- Patrol boat with deck, cabin windows, bow, railings, turret and crew.
- Helicopter with canopy, landing skids, rotor, tail rotor, and rescue markings.
- Carrier aircraft with cockpit, wings, twin propellers, and tail.
- Small stylized opponent with separate limbs for crawl, stand, fall, and sink poses.
- Cannon, launcher house, mine, friendly and hostile missiles.
- Palm tree, faceted rock, supply crate, extraction beacon.

Flat surfaces with bevel highlights, shared materials, no large texture atlases needed for this style. No expensive transmission shaders on the canopy. Export separate models for independent loading and reuse. Instantiate shared geometry/materials; dispose only generated level geometry on transition, and preserve the asset cache. Export an asset manifest with counts and provenance.

## 7. Three.js Architecture

Use Vite and local npm dependencies; production must make no third-party CDN requests.

| Module | Responsibility |
| --- | --- |
| `src/main.js` | Startup, asset loading, render loop, UI wiring, mission transitions |
| `src/world.js` | Three.js scene, cameras, lights, water, terrain, reusable model instances |
| `src/game.js` | Shared mission state, chapter simulation, damage, projectile and pickup rules |
| `src/physics.js` | Fixed-step clock, cannon-es integration, swept collision helpers |
| `src/data.js` | Mission definitions, story, tuning values, model list |
| `src/ui.js` | HUD, input, dialogs, touch controls, persistence |
| `src/audio.js` | Small synthesized effects and mute policy |
| `tools/build_assets.py` | Reproducible Blender authoring/export |
| `tests/` | Physics/rules regressions and browser interaction/render smoke checks |

State owns object lifetime. Every gameplay object has a type, world position, health/state, and optional collider/model. Removal eliminates collision and visible threat together. Cosmetics such as debris are separate from damage authority.

## 8. Physics and Fairness

- Fixed 120 Hz simulation with a bounded catch-up accumulator. Rendering is independent. Tab blur pauses the mission rather than silently losing or advancing progress.
- cannon-es for rigid-body bombs, restitution, contact friction, and debris. Swept segment/sphere tests for fast bullets and missiles prevent tunneling at lower render rates.
- Vehicle acceleration, drag, speed limits, and world boundaries are stable across input types; preserve analog stick magnitude.
- Player projectiles inherit a fraction of vehicle velocity. Enemy missile steering is capped. Weapon cooldown belongs to the weapon, not an event handler.
- Check failure before mission completion on the same tick. Retry creates a clean state and mission score. Only completed records contribute to campaign bests.
- Limit particles, projectile lifetime, and debris count. Input release/cancel/blur clears held buttons and sticks.

## 9. Delivery Sequence

- [x] Inspect the original source and identify gameplay/visual regressions.
- [x] Define art direction, story, mechanics, controls, and implementation boundaries in this document.
- [x] Generate and inspect Blender source and GLB asset library.
- [x] Build the shared Three.js world, animated water, responsive HUD, and controls.
- [x] Implement all six precision missions and bomb options.
- [x] Implement all three river missions, hazards, pickups, shield health, and retaliation.
- [x] Implement all three helicopter defenses, progressive caves, interception, and shield sectors.
- [x] Verify rules, desktop/mobile framing, nonblank canvas, input, retries, and asset loads.
- [x] Commit the separate local repository and push via Git SSH.
- [x] Deploy the production build to GitHub Pages and verify the public URL.

## 10. Acceptance Checks

Release delivered at `C:\Users\n\source\repos\Attack_terrorist_3D`. The playable build is [Tidelock on GitHub Pages](https://buicongnguyen.github.io/Attack_terrorist_3D/). Commit `de1689d` passed the [production build, browser checks, and deployment](https://github.com/buicongnguyen/Attack_terrorist_3D/actions/runs/34484150202). The original Games repository was not modified.

1. Every chapter renders a clearly different, nonblank 3D scene on desktop and portrait/landscape mobile.
2. All Blender models load locally from the build; vehicle dimensions remain stable during movement.
3. Chapter 1 bombs fall, drill or bounce according to loadout, and can complete a level through ordinary controls.
4. Chapter 2 bank objects scroll consistently, boat movement works in both axes, and fire destroys mines, guns, and launcher houses.
5. Chapter 2 base firing is manual; temporary pickups restore shields or enable the advertised automatic weapons.
6. Chapter 3 caves appear on mountain shelves, hostile missiles move toward the helicopter, interception is possible, and shield sectors reflect damage.
7. Mouse, keyboard, and touch share fire cadence; release/cancel does not leave a weapon stuck on.
8. Retry resets the current attempt, pause freezes simulation, and chapter skip is accessible without covering active mobile play.
9. A clean checkout can run `npm ci`, `npm test`, and `npm run build`.
10. The new SSH remote and live Pages URL are documented in README. The original repositories remain available.

## 11. Follow-On Improvements

These are suggestions after the first playable release, not features to claim as complete:

- Artist-polished skeletal animations, richer character silhouettes, and bespoke mission props.
- More authored precision puzzles with alternative solutions and a replay ghost.
- Full rigid-body structural collapse with support graphs and per-platform performance budgets.
- Gamepad input, remapping, localization, and broader assist settings.
- More music and environmental audio, authored with a clear license record.
- Difficulty telemetry from consenting playtests; tune ammo, enemy fire cadence, and time-to-first-success.
- Additional browser/device testing, especially real iOS Safari, low-end Android GPUs, and battery usage.
- Cloud save and leaderboards only after abuse prevention and privacy requirements are specified.

## 12. Technical References

- [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html): runtime glTF loading and supported extensions.
- [cannon-es documentation](https://pmndrs.github.io/cannon-es/docs/): rigid bodies, gravity, contact response, and fixed stepping.
- [Blender 4.5 LTS](https://www.blender.org/releases/4-5/): model-authoring toolchain.
- [GitHub Pages with Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages): static production deployment.
