# Tidelock 5.0 plan: pressure, progression and a reason to come back

## Evaluation of 4.0

Measured on 2026-11-19 on the live game, plus a read of the code.

**What your ideas have produced so far, and how each stands**

| Idea | Result | Verdict |
| --- | --- | --- |
| Easy to read, lower buildings | 2.6 city | solid |
| Destructible banks, rounds, helicopter pickups | 2.7 | solid |
| Menus and mobile UI | 2.8 | solid |
| Lovely but light details (fish, birds, effects) | 2.9 to 3.1 | solid, and cheaper to draw than before |
| "Too easy, fix it" | 3.2 | canal fixed; city and harbour still cannot be lost |
| AAA story and gameplay | 4.0 | a real third act; the finale's scripted pilot wins with one star on Normal |

**What is still not AAA**
1. **No pressure outside the canal.** Eleven of the nineteen missions (city, harbour, all valleys) cannot be lost by doing nothing. The story keeps saying "the storm is coming" and the game never makes it matter.
2. **Nothing carries over.** Stars are scores. A player who three-stars Chapter 1 gets nothing for Chapter 2, so there is no reason to replay and no feeling of growing.
3. **A short last chapter.** The three valley sorties take a scripted pilot 25 to 33 seconds.
4. **Presentation.** Cast portraits are two-letter circles, there is no music, and no intro or outro.

## New ideas

1. **The surge clock.** Every strike mission has a surge window. When it closes the water is in the streets and the mission is lost. It is generous (a human needs about a third of it) but it makes "doing nothing" lose and gives par times a meaning. Harder modes shrink it; Easy stretches it.
2. **Requisition.** Stars become requisition points. Between missions you spend them on six upgrades, two per vehicle, with two levels each: spare ordnance and wider blasts for Kestrel; barge plating and rocket pods for Marlin; a flare rack and ammunition racks for Lantern. 45 points buy everything and the campaign offers at most 57, so players choose a build, and replaying a mission for a missing star has a purpose.
3. **Replay value:** a "no requisition" challenge (ending record line) and a best-run summary: later.
4. **Longer valley sorties with a second objective** (carry a wounded soldier, hold a crossing): later.
5. **Presentation:** Blender cast portraits, music stems that follow mission state, an animated intro and outro: later; they need assets this environment cannot make reliably right now.

## Refined scope (this release, 5.0)

Chosen for most effect on "interesting" per unit of risk, and for being testable without changing any earlier mission's behaviour.

1. **Surge clock** on the nine strike missions: window = (240 + 30 × par) seconds, city; (360 + 30 × par), harbour; times a mode factor (Easy 1.5, Normal 1, Hard 0.8, Crazy 0.65). HUD countdown, warnings at 60 and 20 seconds, a failure line, and a radio call.
2. **Requisition** as a pure module with its own unit tests, a Mission Control panel (44 px buttons), a save field, and the six effects wired in at mission start. Fresh saves get no upgrades, so every scripted run stays identical.
3. **Finale tuning** so a competent pilot can three-star it: Normal gives the station a little more integrity on a strong start. Only if the numbers show it is needed.
4. Clean up the code touched, update docs and tests, deploy.

## Acceptance
- A do-nothing player loses every strike mission, and the scripted pilots still win all nine with the same results as 4.0 (bombs, times, stars).
- Upgrades apply at the next mission start, persist across a reload, cannot be bought without points, and never overspend.
- Unit and browser suites pass; layout checks pass at 320 px for the new panel.
