# Release Verification

## Tidelock 5.1, G1: the golden scripted runs

The drift gate from [PLAN-5.1.md](PLAN-5.1.md) G1 was verified on 2026-11-19 against the production build (`vite preview`), with no gameplay change.

**What changed in the game code.** Three things, all bit-identical:
- The seed counts starts per mission: `1 + index × 7919 + n × 104729`, where n counts the starts of that mission in the page (`game.attemptsBy`). A retry still rolls a new seed; the start at load and other missions no longer move it. `game.setAttempt(index, n)` makes the next start attempt n.
- `seededRandom` counts its own draws inside its closure, and `game.randomCalls` reads the count, draws made while Game.start builds the mission included. The numbers drawn are unchanged (a unit test pins the first three for 1.1, attempt 1, and 10,000 draws for five seeds matched the 5.0 function).
- The valley operation counts the flares it fires (`flaresUsed`).

**The golden runs.** `npm run golden` (tests/golden-browser.mjs) plays 50 rows, each in a fresh browser context (`?qa=1`, empty storage, no upgrades, its mode set explicitly), inside one synchronous `page.evaluate` that ends with the game paused. Rows are keyed `mission/pilot/mode` in the frozen schema 1 (tests/golden-diff.js), with `standDown`, `resupply`, `launches`, `runsBroken` and `phase` reserved as null and an empty radio log for N1. The five pilots run on Normal and Easy (38 rows), the naive clicker on 1.1-1.6 Normal (6) and the do-nothing player on 1.2, 1.7, 2.1, 2.6, 3.1 and 3.4 Normal (6). The pilots no longer run inside the chapter suites; their mechanics checks stay there, and each suite that changes the mode gives the page its mode back.

- **125 Node tests** (20 new: the random source's count, the comparator and the rewrite, the `--missions` and `--allow` options, the recorded file (its keys and fields, the do-nothing rows, and the wins the 5.0 suite asserted for the pilots), and the balance sweep's cells, rates and table) and **421 browser checks** with zero runtime or resource errors (441 before: the 19 scripted-run checks and the finale's do-nothing check are golden rows now).
- **Repeatable:** a second run on the same build gave a byte-identical file.
- **Same rows on CI's browser:** the rows were recorded on Chrome 155 (Windows, GPU). Playwright's own Chromium 140.0.7339.186 (the build @playwright/test 1.55.1 runs in CI) under SwiftShader gave the same 50 rows, with only the header warning about the browser. That Chromium on Windows logged "The AudioContext encountered an error from the audio device or the WebAudio renderer" on 1-5 of the long rows per run while a run held the page's main thread for minutes, muted or not, so the golden pages no longer open an AudioContext (sound never touches a row).
- **Isolated:** `11/skipper/normal` is identical in a fresh page and in a page that first started 1.4, 1.1 and 2.1.
- **Render-side code never feeds back:** 2.3, 1.8, 2.6 and 3.4 on Normal, re-run with `ui.updateHUD()` and `view.render()` between every second step (480x320, Battery saver), equal their plain rows in every field. Nothing reads those frames back, so in these pages the WebGL draw calls (`drawArrays`, `drawElements` and their instanced forms) do nothing: the game's render code, and three.js up to each draw (culling, sorting, uniforms, buffer uploads), still run, and the GPU draws nothing. A scratch fixture whose render draws once from `game.random` at the 100th frame moved `14/skipper/normal` (score 23400 -> 23365, the second barge 21.6 -> 20.35 hp, randomCalls 95 -> 96), so the check still sees feedback. It moved the same three fields when the draws still ran (with rasterizing skipped) and now that they do nothing.
- **randomCalls sees cosmetic draws:** a test-only fixture that draws once from `game.random` in the first wake ring changes `15/rescue/normal` randomCalls from 34 to 35, and the comparator reports exactly that. Mission 3.1 draws 26 numbers while Game.start builds it; one extra draw inside Game.start makes it 27.
- **Comparator** (tests/golden.test.js): it names exactly the key and fields that moved (`7/harbour/normal used: 17 -> 15`), passes equal files, reports rows that appear or go, and `--allow '6/*/*'` refuses a rewrite when `9/skipper/normal` moved. The header records the schema, the browser and the git sha, and a different browser build prints a warning. A rewrite replaces every recorded row of the missions it ran, so a key the run no longer produces leaves the file (before, the row stayed and every later run failed on it), and the other missions' rows stay as they were. With `--actual` and no `--missions`, the missions are those the file holds, so adopting the file of a run made with `--missions` leaves the other missions' rows alone.
- **A selection that checks nothing fails.** `--missions` takes mission indexes 0-18 and ranges such as `0-8,18`. A label (`1.8`, `2.1-3.4`), an open or reversed range (`9-`, `8-6`), an en dash, a mission past 18 or empty text stops the runner with an error before a browser starts; before, each of these selected nothing and printed "All 0 golden rows match" with exit 0. A comparison that ends with no row (an `--actual` file without the missions asked for) fails. `--allow` with no pattern in it (`''`, `','`, or no value) is an error rather than "any key may move". An option left without its value is an error. The balance sweep uses the same parser, and a filter that leaves no cell (`--missions 9 --players naive`, `--modes ''`) stops before a browser starts and before test-results/balance.json is written; before, it wrote an empty sweep marked complete over the last one. Each case was run against copies of the recorded file in a scratch folder.
- **Time** (12 contexts at once on this 28-thread machine, not pinned): a full `npm run golden` takes 2.0 min on the GPU (Chrome 155) and 1.8 min under SwiftShader on Playwright's Chromium, with all 50 rows and 7 checks passing. The interleave checks used to be most of it, and nearly all of their time was SwiftShader running the draws. With rasterizing skipped but the draws still running, the 1.8 check took 633.9 s in a job of its own pinned to four CPUs. Unpinned, it took 318 s with the draws and 50 s without them; the HUD and render code themselves take 2.8 ms a frame (for 239 draw calls and 226,000 triangles a frame on average). Without the draws, the 1.8 check takes 101 s on Sharp, twice as long as on Battery saver, so the checks stay on Battery saver. Each interleave check runs in a browser of its own, because the contexts of one browser share a GPU process. On the busy machine a SwiftShader page took up to 139 s to get ready, and one run lost eight rows to a 180 s ready limit; a page now gets 300 s and is opened again, at most twice, if it is not ready (a run that fails is never retried).

**The 5.0 reference against the new rows.** The 5.0 suite ran every pilot in one shared page, on Easy (left selected by the strike checks) except the finale on Normal, with the page-wide start count in every seed. The table compares each [5.0 reference](../tests/golden/5.0-reference.txt) line with the G1 row on the same mode.

| Mission | 5.0 reference | G1 row (attempt 1) | Difference |
|---|---|---|---|
| 1.1 Easy | used 1, 11 s, 3 stars, 0 lost | used 1, 11.09 s, 3 stars, 0 lost | none |
| 1.2 Easy | used 4, 24 s, 3 stars | used 4, 23.97 s, 3 stars | none |
| 1.3 Easy | used 5, 50 s, 3 stars | used 5, 50.13 s, 3 stars | none |
| 1.4 Easy | used 8, 71 s, 2 stars | used 8, 70.63 s, 2 stars | none |
| 1.5 Easy | used 9, 97 s, 3 stars | used 9, 96.92 s, 3 stars | none |
| 1.6 Easy | used 13, 173 s, 2 stars | used 13, 172.51 s, 2 stars | none |
| 1.7 Easy | used 20, 266 s, 2 stars | used 20, 266.42 s, 2 stars | none |
| 1.8 Easy | used 15, 190 s, 2 stars | used 15, 189.51 s, 2 stars | none |
| 1.9 Easy | used 20, 323 s, 2 stars | used 20, 323.06 s, 2 stars | none |
| 2.1 Easy | barges 24, 24, shields 9, 3 stars, 62 s | barges 24, 24, shields 9, 3 stars, 61.77 s | none |
| 2.2 Easy | barges 24, 24, shields 9, 3 stars, 69 s | barges 24, 24, shields 9, 3 stars, 69.45 s | none |
| 2.3 Easy | barges 24, 24, shields 9, 3 stars, 67 s | barges 22.75, 24, shields 9, 3 stars, 66.67 s | seed: one more hit on the first barge |
| 2.4 Easy | barges 24, 24, shields 9, 3 stars, 74 s | barges 24, 22.75, shields 9, 3 stars, 74.29 s | seed: one more hit on the second barge |
| 2.5 Easy | barges 13, 24, shields 9, 2 stars, 72 s | barges 11.5, 24, shields 8, 2 stars, 72.23 s | seed: one more barge hit and one shield |
| 2.6 Easy | barges 24, 23, shields 9, 3 stars, 59 s | barges 24, 24, shields 9, 3 stars, 59.28 s | seed: one barge hit fewer |
| 3.1 Easy | 25 s, 0 hits | 25.11 s, 0 hits | none |
| 3.2 Easy | 29 s, 0 hits | 29.41 s, 0 hits | none |
| 3.3 Easy | 33 s, 0 hits | 33.15 s, 1 hit (2 stars) | seed: one hit |
| 3.4 Normal | 170 s, gates 100 %, station 46, 16 hits, 1 star | 150 s, gates 100 %, station 58, 18 hits, 1 star | seed |

Every difference comes from the seed. With `game.setAttempt` set to the start count each pilot had in the 5.0 page (37-42 for the city, 54-56 for the harbour, 79-84 for the canal, 107-109 for the valley sorties and 114 for the finale), the new harness prints all 19 reference lines exactly. Rows with no reference line are new: Normal for 1.1-3.3, and the naive and do-nothing players.

**What the new rows record.** One seed each, so no balance claim rests on them; win rates need the 8-seed balance sweep.
- The harbour pilot fails 1.7 and 1.8 on Normal for lack of bombs: 17 used at 231.72 s and 16 used at 245.3 s, inside windows of 600 and 570 s. It wins 1.9 on Normal.
- The naive clicker, which never changes the bomb, the floor or the angle, wins 1.1, 1.2 and 1.4 on Normal and runs out of bombs on 1.3, 1.5 and 1.6 (10, 18 and 24 used).
- **The naive rows are landscape rows.** The golden pages are 1280x720. Played at 390x844, all 38 pilot rows and the 6 do-nothing rows were identical, but the naive clicker clicks where its target shows on screen, and the click marks the first building along that line of sight. A portrait screen (aspect under 0.85) turns the city camera to look along the flight path, so the same click can mark another building. All six naive rows were identical at 1920x1080, 1366x768, 1024x768, 800x600, 844x390 and 480x320. At 390x844 and 768x1024, five of the six moved the same way: 1.3 is won (9 bombs, 17 kills, 2 stars), 1.2 takes 5 bombs for 2 stars, 1.4 takes 10 bombs, and 1.5 and 1.6 still run out of bombs with more kills.
- The do-nothing player fails 1.2 and 1.7 on the tide (360.01 s and 600.01 s), wins 2.1 with the first barge at 0 hp (one star), loses 2.6 at 27.59 s and 3.4 at 64.52 s (Lantern shot down), and is still flying 3.1 at the 1000 s cap.

**The balance sweep.** `npm run balance` (tests/balance-browser.mjs; the cells, rates and table are in tests/balance-sweep.js, unit-tested in tests/balance.test.js) gives the win rates every balance claim in 5.1 must rest on. It does not gate and does not run in CI. A cell is one mission, player and mode. Its attempts n = 1..8 (`game.setAttempt`, so n = 1 is the golden row's seed) play one after another in one fresh context, each exactly as a golden run plays. The players are each mission's pilot, the naive clicker on 1.1-1.6 and the do-nothing player on every mission, and the modes are Easy, Normal and Hard. `--missions`, `--modes`, `--seeds` and `--players` narrow a sweep. The cells are written to test-results/balance.json as each one finishes, so a stopped sweep keeps what it measured and lists the cells it did not.

- **The baseline:** the full sweep, 132 cells × 8 seeds (1,056 runs), ran on Chrome 155 on the GPU with 12 contexts at once and finished in 25.6 min with every cell measured: none failed and none was left out. A cell's runs take from 1 s (the canal on Hard) to 23 min (1.9 do-nothing on Easy, 8 × 945 s of game time).
- **It plays the golden runs:** seed 1 of all 50 golden keys equals its golden row in every field. Sixteen runs from 15 cells (city, harbour, canal, valley and finale, all three modes), each a seed from 3 to 8 replayed in a context of its own, equal the same seed played late in the cell's shared context.
- **The acceptance command:** `npm run balance -- --missions 9 --modes normal --seeds 8` prints the two cells for 2.1 (skipper 8/8, ★3.00, 61.8 s; do-nothing 5/8, ★0.88, 59.5 s, hull 3) in 0.1 min.

Each entry gives the wins out of 8, the mean stars (a loss counts 0), the mean end time and how the other runs ended: `ordnance` is out of bombs, `surge` the tide window, `hull` the convoy or Lantern lost, `flight` the strike flight shot down, `station` Highwater lost, and `playing` still going at the run's cap (1000 s for the do-nothing player without a tide window).

| Mission | Player | Easy | Normal | Hard |
|---|---|---|---|---|
| 1.1 | autopilot | 8/8 (100%) · ★3.00 · 11.1 s | 8/8 (100%) · ★3.00 · 11.1 s | 8/8 (100%) · ★3.00 · 11.1 s |
| 1.1 | naive | 8/8 (100%) · ★3.00 · 6.3 s | 8/8 (100%) · ★3.00 · 7.2 s | 8/8 (100%) · ★2.00 · 11.1 s |
| 1.1 | idle | 0/8 (0%) · ★0.00 · 405.0 s · surge 8 | 0/8 (0%) · ★0.00 · 270.0 s · surge 8 | 0/8 (0%) · ★0.00 · 216.0 s · surge 8 |
| 1.2 | autopilot | 8/8 (100%) · ★3.00 · 24.0 s | 8/8 (100%) · ★3.00 · 25.5 s | 8/8 (100%) · ★3.00 · 32.7 s |
| 1.2 | naive | 8/8 (100%) · ★3.00 · 26.2 s | 8/8 (100%) · ★3.00 · 27.8 s | 8/8 (100%) · ★3.00 · 31.2 s |
| 1.2 | idle | 0/8 (0%) · ★0.00 · 540.0 s · surge 8 | 0/8 (0%) · ★0.00 · 360.0 s · surge 8 | 0/8 (0%) · ★0.00 · 288.0 s · surge 8 |
| 1.3 | autopilot | 8/8 (100%) · ★3.00 · 50.1 s | 8/8 (100%) · ★3.00 · 51.7 s | 8/8 (100%) · ★3.00 · 58.7 s |
| 1.3 | naive | 8/8 (100%) · ★2.00 · 40.1 s | 0/8 (0%) · ★0.00 · 57.4 s · ordnance 8 | 0/8 (0%) · ★0.00 · 58.7 s · ordnance 8 |
| 1.3 | idle | 0/8 (0%) · ★0.00 · 585.0 s · surge 8 | 0/8 (0%) · ★0.00 · 390.0 s · surge 8 | 0/8 (0%) · ★0.00 · 312.0 s · surge 8 |
| 1.4 | autopilot | 8/8 (100%) · ★2.00 · 70.6 s | 8/8 (100%) · ★3.00 · 62.4 s | 8/8 (100%) · ★2.00 · 90.0 s |
| 1.4 | naive | 8/8 (100%) · ★2.00 · 90.3 s | 8/8 (100%) · ★1.38 · 75.2 s | 8/8 (100%) · ★1.13 · 85.6 s |
| 1.4 | idle | 0/8 (0%) · ★0.00 · 675.0 s · surge 8 | 0/8 (0%) · ★0.00 · 450.0 s · surge 8 | 0/8 (0%) · ★0.00 · 360.0 s · surge 8 |
| 1.5 | autopilot | 8/8 (100%) · ★3.00 · 96.9 s | 8/8 (100%) · ★3.00 · 97.3 s | 0/8 (0%) · ★0.00 · 140.9 s · ordnance 8 |
| 1.5 | naive | 8/8 (100%) · ★2.00 · 73.8 s | 0/8 (0%) · ★0.00 · 88.3 s · ordnance 8 | 0/8 (0%) · ★0.00 · 74.2 s · ordnance 8 |
| 1.5 | idle | 0/8 (0%) · ★0.00 · 810.0 s · surge 8 | 0/8 (0%) · ★0.00 · 540.0 s · surge 8 | 0/8 (0%) · ★0.00 · 432.0 s · surge 8 |
| 1.6 | autopilot | 8/8 (100%) · ★2.00 · 172.5 s | 8/8 (100%) · ★2.00 · 175.5 s | 8/8 (100%) · ★2.00 · 207.1 s |
| 1.6 | naive | 8/8 (100%) · ★1.38 · 165.4 s | 0/8 (0%) · ★0.00 · 113.4 s · ordnance 8 | 0/8 (0%) · ★0.00 · 91.8 s · ordnance 8 |
| 1.6 | idle | 0/8 (0%) · ★0.00 · 900.0 s · surge 8 | 0/8 (0%) · ★0.00 · 600.0 s · surge 8 | 0/8 (0%) · ★0.00 · 480.0 s · surge 8 |
| 1.7 | harbour | 8/8 (100%) · ★2.00 · 266.4 s | 0/8 (0%) · ★0.00 · 231.7 s · ordnance 8 | 0/8 (0%) · ★0.00 · 175.4 s · ordnance 8 |
| 1.7 | idle | 0/8 (0%) · ★0.00 · 900.0 s · surge 8 | 0/8 (0%) · ★0.00 · 600.0 s · surge 8 | 0/8 (0%) · ★0.00 · 438.7 s · surge 7 · flight 1 |
| 1.8 | harbour | 8/8 (100%) · ★2.00 · 189.5 s | 0/8 (0%) · ★0.00 · 245.3 s · ordnance 8 | 0/8 (0%) · ★0.00 · 156.0 s · ordnance 8 |
| 1.8 | idle | 0/8 (0%) · ★0.00 · 855.0 s · surge 8 | 0/8 (0%) · ★0.00 · 570.0 s · surge 8 | 0/8 (0%) · ★0.00 · 378.3 s · flight 2 · surge 6 |
| 1.9 | harbour | 8/8 (100%) · ★2.00 · 323.1 s | 8/8 (100%) · ★2.00 · 326.6 s | 0/8 (0%) · ★0.00 · 320.5 s · ordnance 8 |
| 1.9 | idle | 0/8 (0%) · ★0.00 · 945.0 s · surge 8 | 0/8 (0%) · ★0.00 · 597.4 s · surge 5 · flight 3 | 0/8 (0%) · ★0.00 · 207.2 s · flight 8 |
| 2.1 | skipper | 8/8 (100%) · ★3.00 · 61.8 s | 8/8 (100%) · ★3.00 · 61.8 s | 8/8 (100%) · ★3.00 · 61.8 s |
| 2.1 | idle | 8/8 (100%) · ★2.00 · 61.8 s | 5/8 (63%) · ★0.88 · 59.5 s · hull 3 | 0/8 (0%) · ★0.00 · 41.6 s · hull 8 |
| 2.2 | skipper | 8/8 (100%) · ★3.00 · 69.5 s | 8/8 (100%) · ★3.00 · 69.5 s | 8/8 (100%) · ★3.00 · 69.5 s |
| 2.2 | idle | 7/8 (88%) · ★1.75 · 68.5 s · hull 1 | 0/8 (0%) · ★0.00 · 49.9 s · hull 8 | 0/8 (0%) · ★0.00 · 27.1 s · hull 8 |
| 2.3 | skipper | 8/8 (100%) · ★3.00 · 66.7 s | 8/8 (100%) · ★2.75 · 66.7 s | 8/8 (100%) · ★2.00 · 66.7 s |
| 2.3 | idle | 6/8 (75%) · ★1.13 · 65.3 s · hull 2 | 0/8 (0%) · ★0.00 · 30.3 s · hull 8 | 0/8 (0%) · ★0.00 · 19.0 s · hull 8 |
| 2.4 | skipper | 8/8 (100%) · ★3.00 · 74.3 s | 8/8 (100%) · ★3.00 · 74.3 s | 8/8 (100%) · ★3.00 · 74.3 s |
| 2.4 | idle | 1/8 (13%) · ★0.25 · 65.4 s · hull 7 | 0/8 (0%) · ★0.00 · 27.8 s · hull 8 | 0/8 (0%) · ★0.00 · 18.9 s · hull 8 |
| 2.5 | skipper | 8/8 (100%) · ★2.00 · 72.2 s | 8/8 (100%) · ★2.00 · 72.2 s | 6/8 (75%) · ★1.50 · 64.2 s · hull 2 |
| 2.5 | idle | 0/8 (0%) · ★0.00 · 48.3 s · hull 8 | 0/8 (0%) · ★0.00 · 21.8 s · hull 8 | 0/8 (0%) · ★0.00 · 15.8 s · hull 8 |
| 2.6 | skipper | 8/8 (100%) · ★3.00 · 59.3 s | 8/8 (100%) · ★3.00 · 59.4 s | 8/8 (100%) · ★3.00 · 59.5 s |
| 2.6 | idle | 0/8 (0%) · ★0.00 · 59.4 s · hull 8 | 0/8 (0%) · ★0.00 · 27.6 s · hull 8 | 0/8 (0%) · ★0.00 · 16.5 s · hull 8 |
| 3.1 | rescue | 8/8 (100%) · ★3.00 · 25.1 s | 8/8 (100%) · ★3.00 · 25.1 s | 8/8 (100%) · ★3.00 · 25.1 s |
| 3.1 | idle | 0/8 (0%) · ★0.00 · 1000.0 s · playing 8 | 0/8 (0%) · ★0.00 · 1000.0 s · playing 8 | 0/8 (0%) · ★0.00 · 1000.0 s · playing 8 |
| 3.2 | rescue | 8/8 (100%) · ★3.00 · 29.4 s | 8/8 (100%) · ★3.00 · 29.4 s | 8/8 (100%) · ★3.00 · 29.4 s |
| 3.2 | idle | 0/8 (0%) · ★0.00 · 1000.0 s · playing 8 | 0/8 (0%) · ★0.00 · 1000.0 s · playing 8 | 0/8 (0%) · ★0.00 · 1000.0 s · playing 8 |
| 3.3 | rescue | 8/8 (100%) · ★2.75 · 33.1 s | 8/8 (100%) · ★2.38 · 33.1 s | 8/8 (100%) · ★1.50 · 33.1 s |
| 3.3 | idle | 0/8 (0%) · ★0.00 · 1000.0 s · playing 8 | 0/8 (0%) · ★0.00 · 1000.0 s · playing 8 | 0/8 (0%) · ★0.00 · 1000.0 s · playing 8 |
| 3.4 | siege | 8/8 (100%) · ★1.00 · 182.0 s | 8/8 (100%) · ★1.00 · 162.9 s | 0/8 (0%) · ★0.00 · 118.2 s · hull 8 |
| 3.4 | idle | 0/8 (0%) · ★0.00 · 93.5 s · hull 2 · station 6 | 0/8 (0%) · ★0.00 · 69.2 s · hull 8 | 0/8 (0%) · ★0.00 · 48.2 s · hull 8 |

**What the sweep says.**
- **The seed hardly touches chapter 1.** A strike run draws 0-47 numbers from the mission's source, and 48 of the 54 city cells and 11 of the 18 harbour cells play the same run on all 8 seeds, so their rates can only be 0/8 or 8/8. The seed matters on the canal (35 of 36 cells vary) and in the finale. A chapter 1 target such as C1's "at least 7/8 seeds" is in effect one run.
- **Doing nothing on 2.1** wins 8/8 on Easy, 5/8 on Normal (63%; the evaluation counted 9 of 16) and 0/8 on Hard. On Easy it also wins 2.2 (7/8), 2.3 (6/8) and 2.4 (1/8). It loses 2.2-2.6 on Normal and Hard in 8/8.
- **The harbour pilot** wins 1.7-1.9 on Easy in 8/8, fails 1.7 and 1.8 on Normal in 8/8 for lack of bombs, wins 1.9 on Normal in 8/8, and fails all three on Hard.
- **The city pilot** wins every city mission on every mode in 8/8, except 1.5 on Hard (0/8, out of bombs).
- **The canal skipper** wins 2.1-2.6 on every mode in 8/8, except 2.5 on Hard (6/8). **The valley pilot** wins 3.1-3.3 on every mode in 8/8. **The finale pilot** wins 3.4 in 8/8 with one star on Easy and Normal, and loses it on Hard in 8/8.
- **Doing nothing** never wins a strike mission (0 of 216 runs: the tide, or the flight shot down, on 1.9 Normal in 3 of 8 and on 1.7-1.9 Hard in 11 of 24), never ends a valley sortie (still flying at 1000 s in 72 of 72), and loses the finale in 24 of 24.

**The city decision (G1 step 11).** On Normal the naive clicker wins 24 of 48 city runs: 8/8 on 1.1, 1.2 and 1.4, and 0/8 on 1.3, 1.5 and 1.6, where it runs out of bombs (Easy 48 of 48, Hard 24 of 48). These are landscape rates: `npm run balance` always plays 1280x720. The same sweep code played at 390x844, the phone in portrait, gives 32 of 48 on Normal (1.3 is won too, 8/8; 1.5 and 1.6 still 0/8, out of bombs), 48 of 48 on Easy and 32 of 48 on Hard (1.1-1.4 won, 1.5 and 1.6 lost). The evaluation's own clicker won all six; this one keeps the starting bomb and never sets the floor or the angle. **Decision: 5.1 accepts the city as it is. The Normal-only tuning proposal goes to the owner for 5.2, and it has to hold in both orientations.**

**CI** (.github/workflows/deploy.yml).
- **Build once:** the `build` job runs the Node tests and builds once. It uploads `dist` as an artifact and as the Pages artifact.
- **Three test jobs in parallel:** `browser`, `golden 1.8` (`--missions 7`) and `golden` (`--missions 0-6,8-18`) each download that build and serve it with `vite preview`. They run on Playwright's pinned Chromium (@playwright/test 1.55.1). `~/.cache/ms-playwright` is cached under that version, and `playwright install-deps` runs every time.
- **Deploy needs all of them.** `deploy` needs `build` and all three test jobs. Every job has `timeout-minutes: 30`. A test job that fails, or is cancelled (as a job that runs past its timeout is), uploads its `test-results/`, which for a golden job includes `golden-actual.json`.
- **Why the golden runs are split:** the two parts add up to 11-19 min even on this machine, so one job could pass 20 min on a runner, and they run in two jobs as the plan says. They were measured locally, not on CI, on Playwright's Chromium under SwiftShader, with each job pinned to four logical CPUs of this i7-14700KF (which other sessions were also using) and three contexts, as on a four-vCPU runner. Over two runs:
  - missions 0-8 took 7.1 and 12.5 min, of which the 1.8 interleave check took 388.5 and 697.5 s;
  - missions 9-18 took 3.9 and 6.6 min (the 3.4 check 217.2 and 330.6 s);
  - all 50 rows matched both times.

  Before the interleave checks skipped rasterizing, the 1.8 check alone took 40.5 min under the same pinning, more than a job's 30 min limit.
- **The phone checks no longer wait on the desktop page.** The browser suite's phone and tablet checks open four pages of their own. Until now the desktop page was left playing 3.1 meanwhile, and its frame loop kept rendering 1440x900 frames in the GPU process those pages share, which under SwiftShader draws one frame at a time. In the 5.0 CI run the four viewports took 14.4 of the suite's 20.6 min. The desktop page is now paused during those checks (the rescue checks after them start their own mission, as before). Pinned to four CPUs under SwiftShader on Chrome 155, the phone checks went from 319 s to 62 s and the whole suite from 9.1 to 4.6 min, with the same 421 checks and no errors. On Playwright's Chromium, side by side with the two golden jobs (each job on its own four CPUs), the suite took 5.6 min, golden 0-8 7.1 min and golden 9-18 3.9 min, all passing.
- **Expected wall time** (an estimate until the first CI run): the runner has taken about twice as long as this machine pinned to four CPUs (the browser suite took about 20 min there in the 5.0 run, not counting its pilot runs, and 9.1-9.7 min here with the same 421 checks before the phone fix). That puts the browser step at about 11-12 min. Mission 7 gets a golden job of its own because its 1.8 interleave check alone took 662 s pinned to four CPUs (about 22 min on the runner); the other missions' rows and checks take about 12-14 min there. Each test job also spends 1-7 min on setup, mostly `playwright install-deps` (the 5.0 run fetched packages at 94.5 kB/s, 5.7 of its 6.4 install minutes). The longest job, golden 1.8, should then end after 23-29 min, inside its 30 min limit; the first CI run settles it. With about 1 min for the build job before it and the deploy after it, the push should take about 25-31 min, against 28 min for 5.0.

## Tidelock 5.0 (pressure and progression)

The surge clock and requisition ([REDESIGN.md §21](REDESIGN.md#21-tidelock-50-pressure-and-progression), plan in [PLAN-5.0.md](PLAN-5.0.md)) were verified on 2026-11-19 against the production build (`vite preview`).

- **105 Node tests.** New: six upgrades, two per vehicle, costing 45 in all; stars are the points (best result per mission, capped at three); buying spends points in order and cannot overspend or pass the top level; a hand-edited save is cleaned; levels turn into the numbers the game applies and a fresh save changes nothing; every strike mission has a window that Easy stretches and Hard and Crazy shrink.
- **Browser suite**, zero runtime or resource errors, with 20 new checks: the window follows the rule and the HUD clock shows it; modes change it; the warning comes at 60 s, the clock turns urgent, and a closed window loses the mission; the harbour has the longer window and the canal no clock; the points equal the stars; buttons follow the points; purchases spend points and an unaffordable upgrade stays locked; each upgrade applies at the next mission start (an extra bomb and wider blasts, rockets and barge strength, flares); the upgrades are saved and a hand-edited save is cleaned on load.
- **A player who does nothing** loses all nine strike missions on Normal and Hard (see REDESIGN §21).
- **Earlier missions unchanged:** the 18 scripted runs give the same results as 4.0.
- **Found by the new checks:** loading a canal mission crashed while reading the upgrades, because the barges were built before the upgrades were read. Fixed before release.

## Tidelock 4.0 (the third act)

The Wall Inquiry, the finale mission and the ending choice ([REDESIGN.md §20](REDESIGN.md#20-tidelock-40-the-third-act), plan in [PLAN-4.0.md](PLAN-4.0.md)) were verified on 2026-11-13 against the production build (`vite preview`).

- **99 Node tests.** New: six inquiry files spread over all three chapters, Okafor named by file 4 and the hinge in file 6; the finale's radio covers every beat; two endings with different epilogues; the siege's waves are ordered, Marrow arrives before the gates stall, sappers can out-damage the station, and the motors stand on dry land.
- **421 browser checks**, zero runtime or resource errors. New: the finale starts as a siege; a sapper at the motor hurts the station and one shot on the way does not; the gates close with time, stall at 90 % while Marrow flies and finish once he is down; Marrow strafes the station; closed gates win and a destroyed station loses; only the camp pad repairs; a player who does nothing loses; the scripted pilot wins with Marrow shot down; the finale asks its question, each choice shows its epilogue and is saved, a result screen shows its recovered file, and Mission Control keeps the files; phone layout checks cover the finale and file screens.
- **Earlier missions unchanged:** the 18 scripted runs give the same results as 3.2.
- **Finale, scripted pilot:** won in 170 s on Normal (station 46 %, Marrow down, one star); a do-nothing player loses on every mode.

## Tidelock 3.2 (a game you can lose)

The difficulty changes ([REDESIGN.md §19](REDESIGN.md#19-tidelock-32-a-game-you-can-lose)) were verified on 2026-11-02 against the production build (`vite preview`).

- **97 Node tests**: Normal is the default; on Easy only the two tutorial city missions are damage-proof; barge damage rises from Easy to Crazy; the canal third star wants 80 % barges and at most 2 damage.
- **390 browser checks**, zero runtime or resource errors (the ram check now follows the barge damage lever).
- **Do-nothing player, canal:** on Normal every mission is lost (2.1 and 2.2 were won before); on Easy 2.1 to 2.3 survive with the convoy badly damaged, 2.4 to 2.6 are lost.
- **Scripted pilots:** every mission won on Easy, Normal and Hard. On Normal and Hard even the scripted skipper drops to two stars on some canal missions (2.5 on Normal; 2.3 and 2.5 on Hard).

## Tidelock 3.1 (scorch marks, sparks, spray, and upload fix)

Verified on 2026-10-29 against the production build (`vite preview`).

- **97 Node tests** unchanged.
- **390 browser checks**, zero runtime or resource errors, with two new effect checks:
  - street blasts leave a scorch that fades, and an airburst leaves none;
  - a blast's particles are still queued for upload after four more steps of spawning wakes, before the frame renders.
- **The new upload check catches the bug:** run in the page with the 3.0 behaviour restored, it fails.
- **Scripted runs:** identical to 3.0.
- The menu layout check now waits (up to 5 s) for the medallions to load before judging them; on a busy machine the fixed 0.3 s wait sometimes judged them too early.

## Tidelock 3.0 (more effects, fewer draws)

The effect pools and new effects ([REDESIGN.md §18](REDESIGN.md#18-tidelock-30-more-effects-fewer-draws)) were verified on 2026-10-29 against the production build (`vite preview`).

- **97 Node tests** unchanged.
- **388 browser checks**, zero runtime or resource errors, including 7 new effect checks:
  - thirty blasts at once add no draw calls (214 before and after, with 360 glows, 276 smoke puffs and 30 rings alive);
  - a new mission starts with every pool empty;
  - the canal has wakes, and a blast on the water throws up a plume;
  - reduced motion stops the ongoing trails;
  - Lantern's rotor wash appears over the valley.
- **Same look:** a blast adds the same light around it as on 2.9.1 when both use the same random numbers.
- **Scripted pilots, skippers and rescue runs:** the same results as recorded for 2.7–2.9: 1, 4, 5, 8, 9 and 13 bombs in 11–173 s, the harbour quota with 20, 15 and 20 bombs in 190–323 s, three stars on every canal mission, and the three sorties home in 25, 29 and 33 s.
- **Cost under heavy fire** (390×844 phone, 30 blasts in two seconds): peak draw calls 364–455 → 214 in the city, 321–420 → 197–260 on the canal; median frame time lower in every paired run.

## Tidelock 2.9.1

Graphics and reduced-motion changes made in Mission Control now apply to the wildlife of the mission in progress, not just the next one. Verified on 2026-10-01: 97 Node tests and 381 browser checks (one new: Battery saver halves the canal fish at once, reduced motion drops the swallows at once, and both come back), zero errors, and the 18 scripted runs unchanged.

## Tidelock 2.9 (living details, light enough for phones)

The wildlife, the graphics levels and the turning fixes ([REDESIGN.md §17](REDESIGN.md#17-tidelock-29-living-details-light-enough-for-phones)) were verified on 2026-10-01 against the production build (`vite preview`).

- **97 Node tests.** New:
  - fish keep to their water, and a seed replays the same school;
  - a scare sends fish darting away;
  - canal fish drift with the flow and wrap round as whole schools;
  - river fish follow a winding river without sticking on its banks;
  - startled birds go nearest first, their group follows, and they settle on another perch;
  - only a blast at a perch's height strikes it off;
  - after any run of scares every bird settles again, with no NaNs;
  - reduced motion keeps birds perched, and headings turn the short way;
  - the governor lowers the resolution, then the level, ignores menus and hitches, recovers, and only QA keeps the drawing buffer.
- **380 browser checks**, zero runtime or resource errors, including 31 new ones:
  - city, harbour, canal and the three valleys each have their expected wildlife, with every fish in the water;
  - each scene's details add at most 4 draws and under 9,000 triangles, and none cast or receive shadows;
  - a blast flushes the birds in every scenario;
  - after 30 s of canal flow every fish is still in the water and the reeds have moved with the current;
  - the gunboat's bow scatters fish, and Lantern's downwash flushes waders;
  - reduced motion drops the circling flocks and keeps birds perched;
  - the Graphics picker's Battery saver drops the shadow pass and the resolution, and Auto restores them;
  - an emulated phone starts Balanced: 1.25× resolution, no antialiasing, 1024 px shadows, three quarters of the wildlife.
- **Scripted pilots, skippers and the rescue runs**: all 18 missions give exactly the same results (bombs, times, stars) as 2.8.1. The wildlife never touches the game's random numbers.
- **Cost**, counted from the detail meshes at 1280×800: city 1 instanced draw and 0.9k triangles, harbour 3 and 2.1k, canal 4 and 3.8k, valleys 3 and 2.1–2.2k. Showing and hiding them changed the raw WebGL draw count per frame by 0–5, within the noise of effects coming and going. A phone at Balanced draws 487×1055 instead of 682×1477.

## Tidelock 2.8.1 (follow-up fixes)

The fixes in [REDESIGN.md §16](REDESIGN.md#follow-up-fixes-281) were verified on 2026-10-01 against the production build (`vite preview`).

- **88 Node tests**; the shield test now covers damage spilling round to the other sectors and the breach only at zero.
- **349 browser checks**, zero runtime or resource errors. New:
  - a hit on Lantern's empty side drains the other sides, and the sortie ends only when every shield is gone;
  - a strike mark on a target that has run out of the airspace is kept for a moment, then dropped;
  - on a touchscreen laptop a mouse nudged while a finger holds the stick keeps the touch layout and the stick, and switches back once the finger lifts.
- On 568×320, 667×375, 740×360 and 844×390 landscape phones, the 11 px radio line was checked in city, harbour, canal and helicopter missions and overlaps no HUD panel.

## Tidelock 2.8 (menus that fit a phone)

The menu layout and the Blender medallions ([REDESIGN.md §16](REDESIGN.md#16-tidelock-28-menus-that-fit-a-phone)) were verified on 2026-09-30.

- **344 browser checks**, zero runtime or resource errors, including 35 new menu checks (28 layout checks and 7 for page errors): the briefing, Mission Control, victory and defeat screens at 320×568, 360×740, 390×844, 844×390, 667×375, 768×1024 and 1440×900, none with a target under 43 px, text under 11 px, sideways scrolling, a button outside its dialog or a medallion that failed to load.
- **88 Node tests** unchanged.

## Tidelock 2.7 (banks that burn, and a helicopter that is easy to fly)

The canal's destructible banks and barracks, rounds, and the helicopter's three maps, fly-over pickups, direction fire, launch crews, missile trucks and drone stations ([REDESIGN.md §15](REDESIGN.md#15-tidelock-27-banks-that-burn-and-a-helicopter-that-is-easy-to-fly)) were verified on 2026-09-26 against the production build (`vite preview`), with GPU rendering and with SwiftShader as in CI.

- **88 Node tests.** New or changed:
  - rounds: the strongest fires first, spent magazines fall back to standard rounds, each grade outhits the one below, a stock holds two magazines, and every kind has crates on the canal and in the valleys;
  - every canal mission dresses its banks differently, what stands there has hit points, and barracks stand in every mission early enough to be seen;
  - three sortie maps, each a different country, landing at a different base from where it started (and the next one starting there);
  - nothing stands in the water or past the valley walls, every signal is pinned by a squad, and no vehicle's route passes within reach of a pickup;
  - bridges stand wherever the road crosses the water, and patrols keep to the road;
  - trucks and drone stations give five seconds, and the chain gun can stop each in time.
- **303 browser checks**, zero runtime or resource errors, both on the GPU and on SwiftShader. New:
  - a pinned signal waits, a cleared one is picked up by flying over it, and the sortie ends by landing at the other base;
  - flying over a base repairs and rearms Lantern;
  - direction fire hits along the line, Space fires the way she flies, she turns to face her fire, and the assist takes an incoming missile before a soldier on the same line;
  - rounds load and fall back, plasma goes through two targets, and a weaker crate still says what it gave;
  - launch crews idle until they see Lantern, then run to the launcher, which fires and fires again a reload later; kill the crew and it never fires;
  - a destroyed launch site leaves debris, smoke and a crater;
  - a missile truck raises its rack for five seconds before it fires, and killed early it never fires;
  - a drone station launches after five seconds, and hit first its drones never fly;
  - barracks send soldiers out one by one, and trucks don't pin signals;
  - the three maps render and look different, and the touch fire stick hits along its direction;
  - on the canal, bank houses go down with pieces and smoke and come back intact, without smoke, when the bank scrolls round;
  - every canal mission's banks differ, barracks send riflemen to the water and go down with those inside;
  - rockets follow the deck gun onto a heavy target but keep the last salvo, AP rounds hit twice as hard, twin guns keep the best rounds, and enemy positions clear the bank.
- **Scripted pilots**, all on Easy:

  | Missions | Result |
  | --- | --- |
  | City 1.1–1.6 | all six; 1, 4, 5, 8, 9 and 13 bombs in 11–173 s |
  | Harbour 1.7–1.9 | the quota: 20, 15 and 20 bombs in 190–323 s |
  | Canal 2.1–2.6 | all six, barges almost untouched, 3 stars each |
  | Rescue 3.1–3.3 | everyone aboard and landed at the next base in 25, 29 and 33 s, every pinning squad cleared |
- **Layout audit** at eight sizes from 320×568 to 1440×900 across every chapter: no overlaps, nothing off-screen.
- **Rendering:** 182–262 draw calls on the canal and in the valleys, at most 0.8 ms a frame on the test GPU. The nine new models add 365 KB (60 models, 4.48 MB of the 4.5 MiB budget).
- **Independent review:** 9 findings and a tail of smaller ones, all fixed ([REDESIGN.md §15](REDESIGN.md#independent-review-of-27)).

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
npm run golden
npm run balance   # the 8-seed sweep, not a gate: about 25 min on a GPU
```

The QA object is exposed only when the URL includes `?qa=1`, allowing deterministic test scenarios. Normal play does not expose that test handle.
