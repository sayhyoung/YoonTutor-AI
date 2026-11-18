import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { addDiaryTarget, type DiaryEntry, pickDiaryForCall, repeatMatch, type LearningTarget } from "./index.ts";

describe("repeatMatch", () => {
  it("passes an exact or contraction-equivalent repeat", () => {
    assert.equal(repeatMatch("I didn't go to school today.", "I did not go to school today").passed, true);
    assert.equal(repeatMatch("It's so spicy!", "it is so spicy").ratio, 1);
  });

  it("marks the words the student skipped", () => {
    const result = repeatMatch("I ate tteokbokki with my friend after school.", "I ate with my friend after school");
    assert.deepEqual(result.words.filter((word) => !word.said).map((word) => word.text), ["tteokbokki"]);
    assert.equal(result.passed, true);
  });

  it("fails when many words are missing", () => {
    const result = repeatMatch("I walked my dog in the park.", "I walked");
    assert.equal(result.passed, false);
    assert.ok(result.ratio < 0.5);
  });

  it("allows one miss in a short sentence but not two", () => {
    assert.equal(repeatMatch("I ate cake today.", "I ate cake").passed, true);
    assert.equal(repeatMatch("I ate cake today.", "I cake").passed, false);
  });

  it("does not match words said out of order", () => {
    const result = repeatMatch("My family ate a big cake.", "cake big a ate family my");
    assert.equal(result.passed, false);
  });
});

function entry(date: string, sentenceEn: string): DiaryEntry {
  return {
    id: date,
    date,
    source: "text",
    noteKo: "메모",
    mood: null,
    sentenceEn,
    meaningKo: "뜻",
    level: "easy",
    usedWord: null,
    practice: { attempts: 1, passed: true },
    createdAt: `${date}T10:00:00.000Z`,
    updatedAt: `${date}T10:00:00.000Z`,
  };
}

describe("diary in the next call", () => {
  const now = new Date("2026-11-18T12:00:00.000Z");

  it("picks the latest recent diary not yet practiced in a call", () => {
    const entries = [entry("2026-11-16", "I played soccer."), entry("2026-11-17", "I ate pizza."), entry("2026-11-01", "Old one.")];
    assert.equal(pickDiaryForCall(entries, [], now)?.id, "2026-11-17");
    const practiced = [{ answerEn: "I ate pizza", outcome: "correct" as const, practicedAt: "2026-11-17T12:00:00.000Z" }];
    assert.equal(pickDiaryForCall(entries, practiced, now)?.id, "2026-11-16");
    assert.equal(pickDiaryForCall([entry("2026-11-01", "Old one.")], [], now), null);
  });

  it("adds the diary sentence last and keeps the call at ten items", () => {
    const targets: LearningTarget[] = Array.from({ length: 10 }, (_, index) => ({ id: `t${index}`, sourceLabel: "단어 복습", promptKo: "뜻", answerEn: `word${index}`, hint: "" }));
    const next = addDiaryTarget(targets, entry("2026-11-17", "I ate pizza."));
    assert.equal(next.length, 10);
    assert.equal(next[9]?.id, "diary-2026-11-17");
    assert.equal(addDiaryTarget(targets.slice(0, 2), null).length, 2);
  });
});
