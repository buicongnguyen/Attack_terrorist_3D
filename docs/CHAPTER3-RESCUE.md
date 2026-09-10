# Chapter 3: Search and Rescue

## Design

Replace the stationary survival timer with a complete sortie: travel into the valley, locate stranded soldiers, suppress nearby threats, hover to operate the winch, and return everyone to the southern landing zone. There is no automatic victory for waiting out a timer.

Three missions rescue two, three, and four soldiers across a 92 by 250 world-unit valley. The helicopter has a following camera, a selectable rescue waypoint, distance readout, and a tactical map. Rescue sites are separated by roads, river crossings, outposts, and rocky uplands. The base and resupply caches offer recovery between engagements.

## Combat and Equipment

- Chain gun: unlimited ammunition, aimed fire with a visible muzzle and traveling tracers.
- Rockets: limited ammunition, splash damage against groups and armored vehicles.
- Guided missiles: limited ammunition, target acquisition within the player's aiming cone.
- Flares: limited charges; break hostile missile guidance for a short evasive window.
- Supply caches: repair shields, replenish rockets, or replenish guided missiles and flares.
- Threats: cave launchers, fixed cannons, roaming infantry, mobile anti-air trucks, and pursuing drones. Distant enemies stay dormant; cave launchers, cannons, and anti-air trucks display warning indicators before firing.

Soldiers are friendly, visually distinct, immune to friendly fire, and never counted as combat targets. Extraction requires proximity, low speed, and a clear pickup zone. Leaving the hover or releasing the winch interrupts progress. Returning to base is required after the last pickup.

## Mobile and Integration

Keep the left movement pad and right aim/fire pad. Fix ground-target elevation, select targets by aiming direction, and preserve airborne missile interception. Add compact weapon, flare, and winch controls. Touch controls must appear on tablets as well as phones; short landscape layouts need their own arrangement. Clear held inputs on interruption and resize.

Chapters 1 and 2 retain their mission rules. Use existing Three.js rendering, fixed-step movement, swept collisions, and Blender authoring conventions. New geometry must not be painted into the background as fake gameplay targets.

## Implementation Checklist

- [x] Rescue objective state, supplies, enemies, and equipment
- [x] Larger terrain, camera follow, navigation, and authored assets
- [x] Desktop/touch controls and responsive HUD
- [x] Unit tests, two-finger input tests, screenshots, and full sortie completion

## Deployment

The repository uses an SSH push to `main` and its existing [test-and-deploy workflow](https://github.com/buicongnguyen/Attack_terrorist_3D/actions/workflows/deploy.yml). The workflow runs the tests against a production preview before publishing GitHub Pages. Verify the published bundle and run the browser suite again with `GAME_URL=https://buicongnguyen.github.io/Attack_terrorist_3D/` after deployment.

## Review Corrections

- Ground enemies were outside the helicopter's old horizontal firing plane. Directional aim now selects a target inside the pad's aiming cone and fires toward its actual elevation. Empty-space fire slopes toward the ground; incoming missiles remain interceptable.
- The previous fixed-coordinate projectile cutoff would delete shots in the northern valley. Helicopter shots now expire by lifetime and distance from the player.
- Tablet touch pads were hidden, and narrow landscape screens inherited portrait spacing. Coarse-pointer/touch capability now controls pad availability, with an independent short-landscape layout.
- Every pointer cancellation, pause, and resize clears held movement/fire. The winch also releases on cancellation. Its three-second pickup resets when interrupted and cannot run alongside helicopter fire.
- Friendly soldiers and supply caches are excluded from aiming, direct damage, and missile splash. Pickups are collected once; repair, rockets, and support each have distinct inventory effects.
- The old survival timer cannot complete a rescue mission. All soldiers must be aboard and the helicopter must land at the southern base.

## Verification and Limits

The expanded suite contains 15 Node tests and 94 browser assertions. It covers complete two-, three-, and four-soldier sorties using normal movement, damage, cooldowns, and return-to-base rules. A scripted pilot selects directions and targets; these runs establish reachability, not human difficulty balance.

Real keyboard events operate the winch. Chrome DevTools touch events exercise simultaneous movement and ground-target firing, held winch input, and touch cancellation. Layout and nonblank-canvas checks cover 320x740, 390x844, 568x320, 667x375, 844x390, and 768x1024 touch emulation. Desktop checks compare animated canvas pixels at the base, outpost, and northern ridge. All 20 Blender models load without resource errors.

The player's firing description was unfinished, so the implementation retains manual right-pad / mouse fire and adds weapon selection rather than normal auto-fire. The helicopter maintains an arcade flight height above the scenery; this is not a full aerodynamic flight or terrain-collision simulator. Actual iOS/Android performance and human difficulty playtests remain follow-up work.
