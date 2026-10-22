import { describe, expect, it } from "vitest";

import type { StoredCallReport } from "./report-schema";
import { summarizePractice } from "./practice-summary";

function report(endedAt: string, targets: StoredCallReport["targets"]): StoredCallReport {
  return {
    schemaVersion: 1,
    reportId: endedAt,
    studentId: "s1",
    studentName: null,
    startedAt: endedAt,
    endedAt,
    finishReason: "completed",
    targets,
    conversation: [],
    reviewedCount: targets.length,
    needsReviewCount: 0,
    savedAt: endedAt,
  };
}

describe("summarizePractice", () => {
  it("counts only expressions practiced in calls, using the latest result", () => {
    const summary = summarizePractice([
      report("2026-10-21T10:00:00.000Z", [
        { targetId: "a", sourceLabel: "단어 복습", promptKo: "졸리운", answerEn: "sleepy", outcome: "retry", learnerAnswer: "tired" },
      ]),
      report("2026-10-22T00:27:17.774Z", [
        { targetId: "b", sourceLabel: "단어 복습", promptKo: "닫다", answerEn: "close", outcome: "correct" },
        { targetId: "c", sourceLabel: "문장 복습", promptKo: "그는 중국에서 왔어요.", answerEn: "He is from China.", outcome: "correct" },
        { targetId: "a", sourceLabel: "단어 복습", promptKo: "졸리운", answerEn: "Sleepy", outcome: "retry", learnerAnswer: "Tired" },
      ]),
    ]);

    expect(summary).toMatchObject({ calls: 2, practiced: 3, wrong: 1, skipped: 0, words: 2, sentences: 1 });
    const sleepy = summary.items.find((item) => item.answerEn.toLowerCase() === "sleepy");
    expect(sleepy).toMatchObject({ outcome: "retry", learnerAnswer: "Tired", times: 2 });
    expect(summary.sessions.map((session) => [session.endedAt, session.correct, session.total, session.score])).toEqual([
      ["2026-10-22T00:27:17.774Z", 2, 3, 67],
      ["2026-10-21T10:00:00.000Z", 0, 1, 0],
    ]);
  });

  it("returns zeros when there are no calls", () => {
    expect(summarizePractice([])).toMatchObject({ calls: 0, practiced: 0, wrong: 0, items: [], sessions: [] });
  });
});
