import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { alternativeAnswerMessage, containsBadWords, buildCallPlanFromLearningItems, gradeSentenceTyped, isCloseMiss, isNearSpelling, sentenceBlanks, buildTemplateFreeTalk, FREE_TALK_TURNS, gradeReviewAnswer, kstToIso, reviewHint, selectCallItems, type LearningHistoryItem, type PracticeRecord } from "./index.ts";

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

describe("buildTemplateFreeTalk without a question to ask the student", () => {
  it("talks about the student's day instead of quizzing a textbook sentence", () => {
    const talk = buildTemplateFreeTalk([{ id: "t1", sourceLabel: "", promptKo: "그는 중국 출신이에요.", answerEn: "He is from China.", hint: "" }]);
    assert.equal(talk.turns[0]!.questionEn, "How was your day today?");
    assert.ok(talk.turns.every((turn) => !turn.questionEn.includes("China")));
  });
});

describe("buildTemplateFreeTalk without review expressions", () => {
  it("still opens a three-turn talk about the student's day", () => {
    const talk = buildTemplateFreeTalk([]);
    assert.equal(talk.turns.length, FREE_TALK_TURNS);
    assert.equal(talk.turns[0]!.questionEn, "How was your day today?");
  });
});

describe("gradeReviewAnswer spelling variants", () => {
  it("treats OK/Okay/O.K. and number words as the same answer", () => {
    assert.equal(gradeReviewAnswer("Okay,mom", "OK, mom."), "close");
    assert.equal(gradeReviewAnswer("o.k. mom", "OK, mom."), "close");
    assert.equal(gradeReviewAnswer("I have two cats.", "I have 2 cats."), "close");
  });

  it("accepts every reading of 's and 'd, odd apostrophes, spacing and fillers", () => {
    assert.equal(gradeReviewAnswer("Mom is here.", "Mom's here."), "close");
    assert.equal(gradeReviewAnswer("He has got a dog.", "He's got a dog."), "close");
    assert.equal(gradeReviewAnswer("I had better go.", "I'd better go."), "close");
    assert.equal(gradeReviewAnswer("I would like some water.", "I'd like some water."), "close");
    assert.equal(gradeReviewAnswer("Tom's bag", "Tom's bag."), "exact");
    assert.equal(gradeReviewAnswer("Itʼs sunny.", "It's sunny."), "exact");
    assert.equal(gradeReviewAnswer("It's sunny.", "It&#39;s sunny."), "exact");
    assert.equal(gradeReviewAnswer("um I like tshirts", "I like T-shirts."), "close");
    assert.equal(gradeReviewAnswer("Hello.", "Hi./Hello."), "exact");
    assert.equal(gradeReviewAnswer("I have fifteen pens.", "I have 15 pens."), "close");
  });

  it("still marks a different word wrong", () => {
    assert.equal(gradeReviewAnswer("Dad's here.", "Mom's here."), "wrong");
    assert.equal(gradeReviewAnswer("He is a dog.", "He's got a dog."), "wrong");
  });
});

describe("reviewHint", () => {
  it("gives a length hint first and a letter shape second, never the full answer", () => {
    assert.equal(reviewHint("good", 1), "4글자짜리 영어 단어예요. 뜻을 다시 떠올려 볼까요?");
    assert.equal(reviewHint("good", 2), "g로 시작해요. g _ _ _");
    assert.equal(reviewHint("nice", 2).startsWith("n으로"), true);
    assert.equal(reviewHint("He is from China.", 1), '빈칸 단어는 "c…"로 시작해요. 다시 듣고 문장 전체를 말해 보세요.');
    assert.equal(reviewHint("He is from China.", 2), "문장을 보고 그대로 따라 읽어 보세요. He is from China.");
  });

  it("explains an acceptable alternative word", () => {
    assert.equal(alternativeAnswerMessage("nice", "good"), '"nice"도 맞는 말이에요! 그런데 이번 레슨에서는 g로 시작하는 단어를 찾고 있어요.');
  });
});

describe("selectCallItems with hinted outcomes", () => {
  it("asks an expression answered with a hint once more in the next call", () => {
    const at = "2026-10-23T00:00:00.000Z";
    const items = [
      { id: "a", studentId: "s", sourceType: "word" as const, sourceLabel: "단어 복습", promptKo: "좋은", answerEn: "good", studiedAt: "2026-10-01T00:00:00.000Z" },
      { id: "b", studentId: "s", sourceType: "word" as const, sourceLabel: "단어 복습", promptKo: "닫다", answerEn: "close", studiedAt: "2026-10-01T00:00:00.000Z" },
    ];
    const selection = selectCallItems(items, [
      { answerEn: "good", outcome: "hinted", practicedAt: at },
      { answerEn: "close", outcome: "correct", practicedAt: at },
    ]);
    assert.equal(selection.mode, "review");
    assert.deepEqual(selection.items.map((item) => item.answerEn), ["good"]);
  });
});

describe("sentenceBlanks", () => {
  it("blanks one key word in a short sentence and two in a longer one, never function words", () => {
    assert.deepEqual(sentenceBlanks("He is from China."), { masked: "He is from _____.", blanks: ["China"] });
    assert.deepEqual(sentenceBlanks("I usually get up at seven."), { masked: "I _____ get up at _____.", blanks: ["usually", "seven"] });
    assert.deepEqual(sentenceBlanks("Do you like movies?"), { masked: "Do you like _____?", blanks: ["movies"] });
  });

  it("still blanks something when every word is short", () => {
    assert.equal(sentenceBlanks("I am ok.").blanks.length, 1);
  });
});

describe("near misses and typed blanks", () => {
  it("spots a misspelling instead of calling it a different word", () => {
    assert.equal(isNearSpelling("Schol", "school"), true);
    assert.equal(isNearSpelling("nice", "good"), false);
    assert.equal(isNearSpelling("Guin", "China"), false);
  });

  it("calls only answers that share most of the words a close miss", () => {
    assert.equal(isCloseMiss("He is from Japan.", "He is from China."), true);
    assert.equal(isCloseMiss("Guin", "He is from China."), false);
  });

  it("lets a typed sentence answer be just the blank word", () => {
    assert.equal(gradeSentenceTyped("China", "He is from China."), "exact");
    assert.equal(gradeSentenceTyped("china", "He is from China."), "close");
    assert.equal(gradeSentenceTyped("He's from China", "He is from China."), "close");
    assert.equal(gradeSentenceTyped("Guin", "He is from China."), "wrong");
    assert.equal(gradeSentenceTyped("usually seven", "I usually get up at seven."), "exact");
  });

  it("gives typed hints for the blank word", () => {
    assert.equal(reviewHint("He is from China.", 2, "type"), "빈칸 단어 모양이에요. c _ _ _ _");
  });
});

describe("call order", () => {
  it("always asks words before sentences, keeping the order inside each group", () => {
    const plan = buildCallPlanFromLearningItems({
      id: "p",
      studentId: "s",
      scheduledAtLabel: "",
      items: [item("He is from China.", "sentence", "2026-11-02T00:00:00.000Z"), item("school", "word", "2026-11-01T00:00:00.000Z")],
      freeTalk: buildTemplateFreeTalk([]),
    });
    assert.deepEqual(plan.targets.map((target) => target.answerEn), ["school", "He is from China."]);
  });
});

describe("containsBadWords", () => {
  it("catches English and Korean swear words, including censored and spaced ones", () => {
    for (const text of ["fuck you", "F*ck", "this is shit", "You bitch!", "sh1t", "wtf", "씨발", "시 발", "병신아", "ㅅㅂ", "개새끼"]) {
      assert.equal(containsBadWords(text), true, text);
    }
  });

  it("leaves ordinary answers alone", () => {
    for (const text of ["I'm in class.", "My assistant teacher", "Scunthorpe", "He is from China.", "I took a shower.", "Dick and Jane", "새해 복 많이 받아", "시발점"]) {
      assert.equal(containsBadWords(text), false, text);
    }
  });
});
