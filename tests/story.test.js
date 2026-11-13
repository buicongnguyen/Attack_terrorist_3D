import test from "node:test";
import assert from "node:assert/strict";
import { CAST, PROLOGUE, CHAPTER_STORY, MISSION_STORY, FINALE, INQUIRY_FILES, finaleRecord } from "../src/story.js";
import { MISSIONS } from "../src/data.js";

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
  // Okafor is named by file 4, and the hinge that explains the finale is the last file.
  assert.ok(INQUIRY_FILES[3].text.includes("Okafor"));
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
