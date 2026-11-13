# Tidelock 4.0 plan: a story with a reason, a villain with a case, and a real ending

## Evaluation of 3.2

Measured and read on 2026-11-13.

**Story**
- The premise is strong (a city below the tide, a storm barrier, a typhoon at last light), but nothing develops. The prologue says the city *blamed* Marrow for the old sea wall's collapse and then never returns to it.
- Marrow has five taunts in eighteen missions and no motive beyond spite. He never appears. The campaign ends with "his last broadcast cut out mid-sentence".
- Dr. Okafor, the person you escort for six missions, has no secret, no doubt and no arc. Marrow's one interesting line ("you always did trust the wrong people") leads nowhere.
- The player never learns anything, never decides anything, and nothing they do changes the ending.

**Gameplay**
- The climax is the weakest mission. The three helicopter sorties take a scripted pilot 25, 29 and 33 seconds with no hits; the campaign's last act is its shortest and easiest.
- There is no final confrontation: no boss, no last stand, no moment where the clock in the story is a clock in the game.
- City and harbour missions have no pressure (doing nothing never loses). The canal was fixed in 3.2.
- Nothing carries over between missions except stars.

**Verdict:** the three vehicle chapters are solid arcade pieces, but the campaign has no third act and its story is a setting, not a plot. "AAA" for a game this size means: a through-line the player uncovers, a villain who is partly right, mechanics that mean something in the story, a finale that tests everything, and an ending the player owns.

## Plan

### Phase 1 (this release, 4.0): the missing third act

1. **A plot under the missions: the Wall Inquiry.**
   - Twelve years ago the old sea wall failed and the Lower Quays drowned. The inquiry blamed the wall's designer, Dr. Elias Marrow.
   - Six inquiry files are recovered through the campaign (after 1.6, 1.9, 2.2, 2.6, 3.2 and 3.3). They are shown on the result screen and kept in Mission Control under Story.
   - What they show: the Harbour Authority swapped Marrow's concrete for a cheaper mix and buried his warnings. His deputy signed the substitution and testified against him. The deputy was Anselm Okafor. And the Tidelock's east gate hinge was poured from the same mix.
   - Marrow is still the villain (he will drown a city to be proved right), but he is right about the wall. Okafor is still the ally, and he lied.
   - Briefings and radio lines are rewritten where needed to seed this; nothing about the first seventeen missions' mechanics changes.
2. **A finale mission, 3.4 "Eye of the Storm".**
   - The story reason is the mechanic: slam the gates at full surge and the east hinge shears, so Okafor has to walk them shut. That takes two and a half minutes, at night, in the typhoon.
   - Lantern holds Highwater Station while the gates close. Sappers run for the gate motors with charges, drones and missile trucks hunt Lantern, and the station has an integrity bar.
   - Marrow comes himself, in a Hornet gunship taken at Highwater. The gates stall at 90 % while he is airborne; shoot him down to finish.
   - Lose by losing Lantern or the station. Stars for a station kept above 70 % and for taking at most two hits.
3. **An ending the player chooses.**
   - With the gates shut and the files aboard, the last screen asks: broadcast the inquiry files, or seal them.
   - Each choice has its own epilogue; the campaign's star total adds a line about how the city remembers Kestrel. The choice is saved and shown in Mission Control.

### Phase 2 (next): pressure and carry-over
- A storm clock in the city and harbour: par times that matter, and a surge meter across the campaign.
- Requisition: stars buy upgrades for the three vehicles between missions.
- Longer valley sorties with a second objective each (the helicopter chapter is still short).

### Phase 3 (later): presentation
- Portraits for the cast in briefings and radio (rendered in Blender), a short animated intro and outro.
- Music stems that follow mission state.

## Acceptance for Phase 1
- All earlier missions play exactly as before (the 18 scripted runs unchanged).
- A scripted pilot can win 3.4 on Easy and Normal; a do-nothing player loses it.
- Files, the choice and the epilogue survive a reload.
- Unit and browser suites pass; phone layout checks pass for the new screens.
