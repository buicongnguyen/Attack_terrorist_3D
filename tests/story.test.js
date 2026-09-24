import test from "node:test";
import assert from "node:assert/strict";
import { CAST, PROLOGUE, CHAPTER_STORY, MISSION_STORY, FINALE } from "../src/story.js";
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
  assert.ok(MISSION_STORY[8].radio.success.text.includes("override key"));
  const last = MISSIONS.at(-1);
  assert.equal(last.crew.length, last.team);
  assert.equal(last.crew.at(-1), "Sgt. Mara Reyes");
  assert.ok(FINALE.text.includes("Tidelock"));
});

test("rescue crews match each sortie's team size", () => {
  for (const mission of MISSIONS.filter((m) => m.chapter === 2)) assert.equal(mission.crew.length, mission.team);
});
