import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildTemplateFreeTalk, FREE_TALK_TURNS, gradeReviewAnswer, kstToIso, selectCallItems, type LearningHistoryItem, type PracticeRecord } from "./index.ts";

function item(answerEn: string, sourceType: "word" | "sentence", studiedAt: string): LearningHistoryItem {
  return {
    id: `${studiedAt}-${answerEn}`,
    studentId: "s1",
    sourceType,
    sourceLabel: sourceType === "word" ? "단어 복습" : "문장 복습",
    promptKo: answerEn,
    answerEn,
    studiedAt,
  };
}

// 테스트 계정의 실제 오답: 2026-06-29 두 차시.
const lessonA = "2026-06-29T13:18:00";
const lessonB = "2026-06-29T14:17:00";
const items: LearningHistoryItem[] = [
  item("close", "word", lessonB),
  item("sleepy", "word", lessonB),
  item("like", "word", lessonB),
  item("He is from China.", "sentence", lessonA),
  item("Do you like movies?", "sentence", lessonA),
  item("I am tired.", "sentence", lessonB),
  item("Wow, how fast!", "sentence", lessonB),
  item("She is a student.", "sentence", lessonB),
];

const names = (selection: ReturnType<typeof selectCallItems>) => selection.items.map((target) => target.answerEn);

describe("selectCallItems", () => {
  it("asks every wrong answer from the lessons not reviewed yet, newest lesson first", () => {
    const selection = selectCallItems(items);
    assert.equal(selection.mode, "new");
    assert.deepEqual(names(selection), [
      "close",
      "sleepy",
      "like",
      "I am tired.",
      "Wow, how fast!",
      "She is a student.",
      "He is from China.",
      "Do you like movies?",
    ]);
  });

  it("caps a call at 10 questions", () => {
    const many = Array.from({ length: 15 }, (_, index) => item(`word${index}`, "word", lessonB));
    assert.equal(selectCallItems(many).items.length, 10);
  });

  it("asks only the expressions not reviewed yet when part of a lesson was already practiced", () => {
    const at = "2026-10-22T00:27:17.774Z";
    const selection = selectCallItems(items, [
      { answerEn: "close", outcome: "correct", practicedAt: at },
      { answerEn: "He is from China.", outcome: "correct", practicedAt: at },
      { answerEn: "sleepy", outcome: "retry", practicedAt: at },
    ]);
    assert.equal(selection.mode, "new");
    assert.deepEqual(names(selection), ["like", "I am tired.", "Wow, how fast!", "She is a student.", "Do you like movies?"]);
  });

  it("asks a new lesson's wrong answers again even if the expression was practiced before", () => {
    const newLesson = "2026-10-25T10:00:00";
    const selection = selectCallItems(
      [item("close", "word", newLesson), item("open", "word", newLesson)],
      [{ answerEn: "close", outcome: "correct", practicedAt: "2026-10-22T00:00:00.000Z" }],
    );
    assert.deepEqual(names(selection), ["close", "open"]);
  });

  it("reviews wrong, then skipped expressions when nothing new was studied", () => {
    const at = "2026-10-22T00:00:00.000Z";
    const practiced: PracticeRecord[] = items.map((target) => ({ answerEn: target.answerEn, outcome: "correct", practicedAt: at }));
    practiced.push({ answerEn: "I am tired.", outcome: "skipped", practicedAt: "2026-10-22T01:00:00.000Z" });
    practiced.push({ answerEn: "sleepy", outcome: "retry", practicedAt: "2026-10-22T01:00:00.000Z" });
    const selection = selectCallItems(items, practiced);
    assert.equal(selection.mode, "review");
    assert.deepEqual(names(selection), ["sleepy", "I am tired."]);
  });

  it("rotates three expressions, oldest practice first, once everything was answered correctly", () => {
    const practiced: PracticeRecord[] = items.map((target, index) => ({
      answerEn: target.answerEn,
      outcome: "correct",
      practicedAt: `2026-10-${String(10 + index).padStart(2, "0")}T00:00:00.000Z`,
    }));
    const selection = selectCallItems(items, practiced);
    assert.equal(selection.mode, "rotation");
    assert.deepEqual(names(selection), ["close", "sleepy", "like"]);
  });
});

describe("kstToIso", () => {
  it("reads study-api times as Korean time", () => {
    assert.equal(kstToIso("2026-06-29T13:18:00"), "2026-06-29T04:18:00.000Z");
    assert.equal(kstToIso("2026-06-29 14:17:05"), "2026-06-29T05:17:05.000Z");
    assert.equal(kstToIso("2026-06-29T13:18:00Z"), "2026-06-29T13:18:00.000Z");
    assert.equal(kstToIso(""), undefined);
  });
});

describe("buildTemplateFreeTalk", () => {
  it("keeps the short talk at three turns even when a call has many review questions", () => {
    const targets = items.map((target) => ({ id: target.id, sourceLabel: target.sourceLabel, promptKo: target.promptKo, answerEn: target.answerEn, hint: "" }));
    const plan = buildTemplateFreeTalk(targets);
    assert.equal(plan.maxTurns, FREE_TALK_TURNS);
    assert.equal(plan.turns.length, FREE_TALK_TURNS);
  });

  it("starts from a question sentence and keeps every turn on that topic", () => {
    const targets = items.map((target) => ({ id: target.id, sourceLabel: target.sourceLabel, promptKo: target.promptKo, answerEn: target.answerEn, hint: "" }));
    const plan = buildTemplateFreeTalk(targets);
    assert.equal(plan.turns[0]!.questionEn, "Do you like movies?");
    assert.deepEqual(new Set(plan.turns.map((turn) => turn.relatedExpression)), new Set(["Do you like movies?"]));
  });
});

describe("gradeReviewAnswer", () => {
  it("treats the same sentence as exact, even without the final period or with a curly apostrophe", () => {
    assert.equal(gradeReviewAnswer("He is from China.", "He is from China."), "exact");
    assert.equal(gradeReviewAnswer("He is from China", "He is from China."), "exact");
    assert.equal(gradeReviewAnswer("He’s from China.", "He's from China."), "exact");
  });

  it("accepts contractions, capital letters and punctuation differences as close", () => {
    assert.equal(gradeReviewAnswer("He's from china.", "He is from China."), "close");
    assert.equal(gradeReviewAnswer("he is from china", "He's from China."), "close");
    assert.equal(gradeReviewAnswer("I'm tired", "I am tired."), "close");
    assert.equal(gradeReviewAnswer("I don't like it.", "I do not like it."), "close");
    assert.equal(gradeReviewAnswer("She can't swim.", "She cannot swim."), "close");
    assert.equal(gradeReviewAnswer("Wow how fast", "Wow, how fast!"), "close");
    assert.equal(gradeReviewAnswer("CLOSE", "close"), "close");
  });

  it("still marks different words wrong", () => {
    assert.equal(gradeReviewAnswer("I am from China.", "He is from China."), "wrong");
    assert.equal(gradeReviewAnswer("sleeping", "sleepy"), "wrong");
    assert.equal(gradeReviewAnswer("", "close"), "wrong");
  });
});
