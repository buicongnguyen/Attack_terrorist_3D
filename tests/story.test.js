import test from "node:test";
import assert from "node:assert/strict";
import {
  CAST,
  PROLOGUE,
  CHAPTER_STORY,
  MISSION_STORY,
  FINALE,
  INQUIRY_FILES,
  INTERCEPTS,
  CREW_RADIO,
  FAILURE_RADIO,
  FAILURE_TEXT,
  STRIKE_RADIO,
  RIVER_RADIO,
  LANDFALL,
  filesRead,
  finaleRecord,
  landfallLabel,
} from "../src/story.js";
import { MISSIONS } from "../src/data.js";
import { RADIO_EVENTS as STRIKE_EVENTS } from "../src/strike-data.js";
import { RADIO_EVENTS as RIVER_EVENTS } from "../src/river-data.js";
import { RADIO_EVENTS as RESCUE_EVENTS } from "../src/rescue-data.js";
import { STORY, priorityOf, wordCount } from "../src/radio-queue.js";

test("every mission has a place, a clock, goals, a briefing and both endings", () => {
  assert.equal(MISSION_STORY.length, MISSIONS.length);
  for (const story of MISSION_STORY) {
    assert.ok(story.place && story.clock && story.goals.length >= 1);
    assert.ok(story.brief.length >= 2);
    assert.ok(story.success.length > 40 && story.failure.length > 20);
    for (const line of [...story.brief, ...Object.values(story.radio)]) assert.ok(CAST[line.who], `unknown speaker ${line.who}`);
    assert.ok(story.radio.start && story.radio.success);
  }
});

test("the campaign is one story: prologue, three chapters, finale", () => {
  assert.equal(CHAPTER_STORY.length, 3);
  assert.ok(PROLOGUE.paragraphs.join(" ").includes("Tidelock"));
  // The villain is introduced in each chapter's briefings.
  for (const chapter of [0, 1, 2]) {
    const lines = MISSIONS.flatMap((m, i) => (m.chapter === chapter ? MISSION_STORY[i].brief : []));
    assert.ok(lines.some((l) => l.who === "marrow"), `Marrow speaks in chapter ${chapter + 1}`);
  }
  // Echo team: spotters in Chapter 1, the rescue in Chapter 3, and the key comes home with Reyes.
  assert.ok(MISSION_STORY[5].radio.success.text.includes("override key"));
  // Lock Gate, the last river mission, frees Highwater for the key.
  assert.ok(MISSION_STORY[MISSIONS.findIndex((m) => m.name === "Lock Gate")].radio.success.text.includes("override key"));
  const last = MISSIONS.filter((m) => m.team).at(-1);
  assert.equal(last.crew.length, last.team);
  assert.equal(last.crew.at(-1), "Sgt. Mara Reyes");
  assert.ok(FINALE.text.includes("Tidelock"));
});

test("the Wall Inquiry runs under the campaign: six files, a confession, and a choice (4.0)", () => {
  assert.equal(INQUIRY_FILES.length, 6);
  // Files come in order, spread over all three chapters, and the last is found before the finale.
  const chapters = INQUIRY_FILES.map((f) => MISSIONS[f.index].chapter);
  assert.deepEqual([...new Set(chapters)], [0, 1, 2]);
  assert.ok(INQUIRY_FILES.at(-1).index < MISSIONS.length - 1);
  for (const file of INQUIRY_FILES) assert.ok(file.title.startsWith("Inquiry file") && file.text.length > 60);
  // 5.1: file 4 hides the deputy's name and file 5 gives it; the hinge is the last file.
  assert.ok(!INQUIRY_FILES[3].text.includes("Okafor"));
  assert.ok(INQUIRY_FILES[4].text.includes("A. Okafor"));
  assert.ok(INQUIRY_FILES[5].text.includes("hinge"));
  // The finale: Okafor confesses, Marrow speaks, and its radio covers every beat of the siege.
  const finale = MISSION_STORY.at(-1);
  assert.equal(finale.brief[0].who, "okafor");
  assert.ok(finale.brief.some((l) => l.who === "marrow"));
  for (const key of ["start", "sappers", "drones", "charge", "half", "boss", "stall", "rage", "bossDown", "success"]) assert.ok(finale.radio[key], key);
  // Two endings, each with its own epilogue; the record line counts the stars.
  assert.deepEqual(Object.keys(FINALE.choices), ["broadcast", "seal"]);
  for (const choice of Object.values(FINALE.choices)) assert.ok(choice.label && choice.title && choice.text.length > 150);
  assert.notEqual(FINALE.choices.broadcast.text, FINALE.choices.seal.text);
  assert.ok(finaleRecord(57, 57).includes("57 of 57") && finaleRecord(57, 57) !== finaleRecord(20, 57));
});

test("rescue crews match each sortie's team size", () => {
  for (const mission of MISSIONS.filter((m) => m.chapter === 2)) assert.equal(mission.crew.length, mission.team);
});

// ---------------------------------------------------------------- 5.1 N1: the script

const minutes = (clock) => clock.split(":").reduce((h, m) => Number(h) * 60 + Number(m));
const crewOf = (index) => MISSIONS[index].crew || [];
// Every line a player can read in a mission: briefing, radio, debrief, file, intercept, survivors.
function texts(index) {
  const story = MISSION_STORY[index];
  return [
    story.place,
    ...story.goals,
    ...story.brief.map((l) => l.text),
    ...Object.values(story.radio).map((l) => l.text),
    story.success,
    story.failure,
    ...(story.file ? [story.file.title, story.file.text, story.file.from] : []),
    ...INTERCEPTS.filter((i) => i.mission === index).map((i) => i.line.text),
    ...crewOf(index).map((name) => CREW_RADIO[name]?.text || ""),
  ];
}
const chapterOf = (index) => MISSIONS[index].chapter;
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

test("one timeline: landfall tonight at 19:10, clocks that only run forward (5.1)", () => {
  const prologue = PROLOGUE.paragraphs.join(" ");
  assert.ok(prologue.includes("tonight") && prologue.includes("storm tide"));
  assert.ok(!prologue.includes("tomorrow"));
  let last = 0;
  for (const story of MISSION_STORY) {
    assert.ok(minutes(story.clock) >= last, `${story.clock} runs backwards`);
    assert.ok(minutes(story.clock) <= minutes(LANDFALL), `${story.clock} is after landfall`);
    last = minutes(story.clock);
  }
  assert.equal(landfallLabel("06:40"), "LANDFALL 19:10 · 12 H 30 MIN");
  assert.equal(landfallLabel("14:10"), "LANDFALL 19:10 · 5 H");
  assert.equal(landfallLabel("16:45"), "LANDFALL 19:10 · 2 H 25 MIN");
  // The chapters carry no clocks of their own any more: the first briefing names the landfall.
  for (const chapter of CHAPTER_STORY) assert.equal(chapter.clock, undefined);
  // 3.3 at 18:30: forty minutes to last light, from Reyes and from Marrow.
  assert.ok(MISSION_STORY[17].brief[0].text.includes("forty minutes"));
  assert.ok(MISSION_STORY[17].brief[1].text.startsWith("Forty minutes"));
});

test("Chapter 1 reads HIGH TIDE: no player-facing string says surge (5.1)", () => {
  const strings = [
    ...range(0, 8).flatMap(texts),
    CHAPTER_STORY[0].title,
    CHAPTER_STORY[0].intro,
    ...Object.values(STRIKE_RADIO).map((l) => l.text),
    ...["shelter", "ferry", "surge", "harbourSurge", "flight", "ordnance"].map((k) => FAILURE_RADIO[k].text),
    ...["shelter", "ferry", "surge", "harbourSurge", "flight"].map((k) => FAILURE_TEXT[k]),
  ];
  for (const text of strings) assert.ok(!/surge/i.test(text), text);
  assert.ok(STRIKE_RADIO.surge.text.startsWith("High tide"));
  assert.ok(FAILURE_TEXT.surge.startsWith("High tide reached the low streets"));
  assert.equal(FAILURE_TEXT.harbourSurge, "High tide: the flotilla rode it over the bar and out to sea.");
});

test("the reveal holds: no 'you signed' before 3.2, no hinge before 3.3, every file has a source (5.1)", () => {
  for (const index of range(0, 15)) for (const text of texts(index)) assert.ok(!/you signed/i.test(text), `${index}: ${text}`);
  for (const index of range(0, 16)) for (const text of texts(index)) assert.ok(!/hinge/i.test(text), `${index}: ${text}`);
  for (const file of INQUIRY_FILES) assert.ok(file.from?.trim(), file.title);
  assert.ok(INQUIRY_FILES[5].text.includes("four years") && INQUIRY_FILES[5].text.includes("reported nothing"));
  assert.ok(MISSION_STORY[17].radio.success.text.includes("hinge for four years"));
  assert.equal(MISSION_STORY[18].radio.stall.who, "marrow");
  // With the stall line Marrow's, Iona still gives the order on the same moment.
  assert.ok(MISSION_STORY[18].radio.jam.text.includes("Bring him down"));
  assert.ok(MISSION_STORY[17].success.includes("Last light") && !MISSION_STORY[17].success.includes("surge"));
});

test("Marrow's six intercepts, one story line per event, a voice for every soldier (5.1)", () => {
  assert.equal(INTERCEPTS.length, 6);
  const events = [STRIKE_EVENTS, RIVER_EVENTS, RESCUE_EVENTS];
  for (const intercept of INTERCEPTS) {
    assert.equal(intercept.line.who, "marrow");
    assert.ok(wordCount(intercept.line.text) <= 26, intercept.line.text);
    assert.ok(events[chapterOf(intercept.mission)].includes(intercept.event), `${intercept.mission}: ${intercept.event}`);
    if (intercept.event === "start") assert.ok(intercept.after > 0);
  }
  assert.deepEqual(
    INTERCEPTS.map((i) => i.mission),
    [2, 5, 8, 10, 13, 17],
  );
  // Story lines by event: radio keys are events, a timed intercept is its own moment.
  for (const index of range(0, MISSIONS.length - 1)) {
    const count = new Map();
    const add = (event, key) => priorityOf(key) === STORY && count.set(event, (count.get(event) || 0) + 1);
    for (const key of Object.keys(MISSION_STORY[index].radio)) add(key, key);
    for (const i of INTERCEPTS.filter((i) => i.mission === index)) add(i.event === "start" ? `start+${i.after}` : i.event, "intercept");
    for (const name of crewOf(index)) add(`aboard:${name}`, "aboard");
    for (const [event, n] of count) assert.ok(n <= 1, `mission ${index}: ${n} story lines on ${event}`);
  }
  for (const name of MISSIONS.flatMap((m) => m.crew || [])) {
    assert.ok(CREW_RADIO[name], `${name} has no line`);
    assert.ok(CAST[CREW_RADIO[name].who], `${name}: unknown speaker`);
  }
  assert.ok(CREW_RADIO["Cpl. Kofi Mensah"].text.includes("took the key north"));
  // The harbour's beats, and the Belle's one line.
  for (const index of [6, 7, 8]) for (const key of ["q25", "q50", "q75"]) assert.ok(MISSION_STORY[index].radio[key], `${index} ${key}`);
  assert.ok(MISSION_STORY[8].radio.freed.text.startsWith("My father brought ferries"));
});

test("no Chapter 2-3 line calls the player Kestrel One (5.1)", () => {
  const strings = [
    ...range(9, MISSIONS.length - 1).flatMap(texts),
    ...CHAPTER_STORY.slice(1).map((c) => c.intro),
    ...Object.values(RIVER_RADIO).map((l) => l.text),
    ...["barges", "hull", "heliHull", "station"].map((k) => FAILURE_RADIO[k].text),
  ];
  for (const text of strings) assert.ok(!text.includes("Kestrel One"), text);
  // 1.1's opening line teaches tap-to-mark.
  assert.ok(/tap or click/i.test(MISSION_STORY[0].radio.start.text));
});

test("the finale's file panel counts the files in the save (5.1)", () => {
  assert.equal(filesRead({}).text, "You have read 0 of 6 files");
  const some = filesRead({ 5: { stars: 3 }, 14: { stars: 1 } });
  assert.equal(some.read, 2);
  assert.equal(some.text, "You have read 2 of 6 files");
  assert.deepEqual(
    some.rows.map((r) => r.found),
    INQUIRY_FILES.map((f) => f.index === 5 || f.index === 14),
  );
  const all = filesRead(Object.fromEntries(INQUIRY_FILES.map((f) => [f.index, { stars: 1 }])));
  assert.equal(all.text, "You have read 6 of 6 files");
});
