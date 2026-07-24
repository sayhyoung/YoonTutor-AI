import { describe, expect, it } from "vitest";

import type { LearningItem } from "./types";
import { decideAttempt, normalizeAnswer } from "./quiz-engine";

const item: LearningItem = {
  id: "word-test",
  studentId: "student-test",
  sourceType: "word",
  sourceLabel: "단어",
  unitName: "Test Unit",
  promptKo: "습관을 영어로 써봐.",
  meaningKo: "습관",
  answerEn: "habit",
  wrongAt: "2026-01-01T00:00:00Z",
};

describe("normalizeAnswer", () => {
  it("대소문자·문장부호·연속 공백을 정규화한다", () => {
    expect(normalizeAnswer("  HABIT?!  ")).toBe("habit");
  });
});

describe("decideAttempt", () => {
  it("첫 정답을 Perfect로 확정한다", () => {
    const result = decideAttempt(item, "habit", 0);

    expect(result.status).toBe("Perfect");
    expect(result.situation).toBe("correct");
    expect(result.countsAsAttempt).toBe(true);
    expect(result.nextAttemptCount).toBe(1);
  });

  it("재시도 후 정답을 Good으로 확정한다", () => {
    const result = decideAttempt(item, "habit", 1);

    expect(result.status).toBe("Good");
    expect(result.attemptNumber).toBe(2);
  });

  it("힌트 요청은 시도 횟수를 늘리지 않는다", () => {
    const result = decideAttempt(item, "힌트 줘", 1);

    expect(result.status).toBeUndefined();
    expect(result.situation).toBe("help");
    expect(result.countsAsAttempt).toBe(false);
    expect(result.nextAttemptCount).toBe(1);
  });

  it("기회가 남은 오답은 같은 문항 재시도로 처리한다", () => {
    const result = decideAttempt(item, "happy", 0);

    expect(result.status).toBeUndefined();
    expect(result.situation).toBe("retry");
    expect(result.nextAttemptCount).toBe(1);
    expect(result.reply).toContain("좋은 시도야");
    expect(result.reply).not.toContain("뜻은 맞");
    expect(result.reply).not.toContain("habit");
  });

  it("두 번째 오답에는 정답 전체 대신 마스킹 힌트를 준다", () => {
    const result = decideAttempt(item, "happy", 1);

    expect(result.situation).toBe("retry");
    expect(result.reply).toContain("h___t");
    expect(result.reply).not.toContain('"habit"');
  });

  it("세 번째 오답을 Not mastered로 확정한다", () => {
    const result = decideAttempt(item, "happy", 2);

    expect(result.status).toBe("Not mastered");
    expect(result.situation).toBe("reveal");
    expect(result.attemptNumber).toBe(3);
  });
});
