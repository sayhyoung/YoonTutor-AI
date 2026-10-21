import { describe, expect, it } from "vitest";

import { parseCallReportInput, toStoredCallReport, toSummary } from "./report-schema";

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    reportId: "report-0001",
    startedAt: "2026-10-21T10:00:00.000Z",
    endedAt: "2026-10-21T10:05:00.000Z",
    finishReason: "completed",
    targets: [
      { targetId: "t1", sourceLabel: "단어 복습", promptKo: "도서관", answerEn: "library", outcome: "correct" },
      { targetId: "t2", sourceLabel: "문장 복습", promptKo: "그는 중국 출신이야.", answerEn: "He is from China.", outcome: "retry", learnerAnswer: "He from China." },
      { targetId: "t3", sourceLabel: "문장 복습", promptKo: "영화 좋아해?", answerEn: "Do you like movies?", outcome: "skipped" },
    ],
    conversation: [{ questionEn: "When can you say it?", answer: "At school." }],
    ...overrides,
  };
}

describe("call report input", () => {
  it("accepts a valid report and computes counts from outcomes", () => {
    const parsed = parseCallReportInput(validBody());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const stored = toStoredCallReport(parsed.input, { studentId: "<CUSTOMER_NO>", studentName: "학생" });
    expect(stored.reviewedCount).toBe(2);
    expect(stored.needsReviewCount).toBe(1);
    expect(stored.studentId).toBe("<CUSTOMER_NO>");
  });

  it("ignores a studentId sent in the body", () => {
    const parsed = parseCallReportInput(validBody({ studentId: "someone-else" }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.input).not.toHaveProperty("studentId");
  });

  it("rejects unknown finish reasons and outcomes", () => {
    expect(parseCallReportInput(validBody({ finishReason: "hacked" })).ok).toBe(false);
    expect(
      parseCallReportInput(
        validBody({ targets: [{ targetId: "t", sourceLabel: "단어", promptKo: "a", answerEn: "b", outcome: "perfect" }] }),
      ).ok,
    ).toBe(false);
  });

  it("rejects an end time before the start time and oversized lists", () => {
    expect(parseCallReportInput(validBody({ endedAt: "2026-10-21T09:00:00.000Z" })).ok).toBe(false);
    expect(
      parseCallReportInput(validBody({ conversation: Array.from({ length: 6 }, () => ({ questionEn: "q", answer: "a" })) })).ok,
    ).toBe(false);
  });

  it("keeps student identifiers out of the summary", () => {
    const parsed = parseCallReportInput(validBody());
    if (!parsed.ok) throw new Error("expected valid input");
    const summary = toSummary(toStoredCallReport(parsed.input, { studentId: "<CUSTOMER_NO>" }));
    expect(summary).not.toHaveProperty("studentId");
    expect(summary).not.toHaveProperty("studentName");
  });
});
