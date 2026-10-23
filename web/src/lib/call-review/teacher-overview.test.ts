import { describe, expect, it } from "vitest";

import { buildClassStats, buildTeacherRows, missedLatestCall, statusOf } from "./teacher-overview";
import type { StoredCallReport } from "./report-schema";

function report(studentId: string, endedAt: string, finishReason: StoredCallReport["finishReason"]): StoredCallReport {
  return {
    schemaVersion: 1,
    reportId: `${studentId}-${endedAt}`,
    studentId,
    studentName: null,
    startedAt: endedAt,
    endedAt,
    finishReason,
    targets: [],
    conversation: [],
    reviewedCount: 0,
    needsReviewCount: 0,
    savedAt: endedAt,
  };
}

const student = (customerNo: string, customerName: string) => ({ customerNo, customerName, agencyNos: [], bmNames: [] });

describe("teacher overview", () => {
  it("uses the latest call per student and hides student ids from the summary", () => {
    const rows = buildTeacherRows(
      [student("1", "가"), student("2", "나")],
      [
        report("1", "2026-10-20T10:00:00.000Z", "completed"),
        report("1", "2026-10-21T10:00:00.000Z", "no-response"),
        report("9", "2026-10-21T10:00:00.000Z", "completed"),
      ],
    );

    expect(rows[0]).toMatchObject({ customerNo: "1", callCount: 2, status: "재통화 필요" });
    expect(rows[0].lastCall?.endedAt).toBe("2026-10-21T10:00:00.000Z");
    expect(rows[0].lastCall).not.toHaveProperty("studentId");
    expect(rows[1]).toMatchObject({ status: "기록 없음", callCount: 0, lastCall: null });
  });

  it("maps finish reasons to teacher statuses", () => {
    expect(statusOf(null)).toBe("기록 없음");
    expect(statusOf({ finishReason: "completed" })).toBe("완료");
    expect(statusOf({ finishReason: "stopped" })).toBe("완료");
    expect(statusOf({ finishReason: "no-response" })).toBe("재통화 필요");
  });
});

describe("class stats", () => {
  it("counts daily calls by finish reason and ranks missed expressions by students", () => {
    const withTargets = (studentId: string, endedAt: string, finishReason: StoredCallReport["finishReason"], misses: string[]) => ({
      ...report(studentId, endedAt, finishReason),
      targets: [
        ...misses.map((answerEn, index) => ({ targetId: `${index}`, sourceLabel: "단어 복습", promptKo: "뜻", answerEn, outcome: "retry" as const })),
        { targetId: "ok", sourceLabel: "문장 복습", promptKo: "뜻", answerEn: "Fine.", outcome: "correct" as const },
      ],
    });
    const stats = buildClassStats(
      [
        withTargets("1", "2026-10-21T01:00:00.000Z", "completed", ["close", "library"]),
        withTargets("2", "2026-10-21T02:00:00.000Z", "no-response", ["close"]),
        withTargets("2", "2026-10-20T02:00:00.000Z", "stopped", ["library."]),
        withTargets("3", "2026-09-01T02:00:00.000Z", "completed", ["old"]),
      ],
      new Date("2026-10-21T12:00:00.000Z"),
      14,
    );

    expect(stats.dailyCalls).toHaveLength(14);
    expect(stats.dailyCalls.at(-1)).toMatchObject({ date: "2026-10-21", completed: 1, noResponse: 1 });
    expect(stats.dailyCalls.at(-2)).toMatchObject({ date: "2026-10-20", stopped: 1 });
    expect(stats.outcomeTotals).toEqual({ correct: 4, hinted: 0, retry: 5, skipped: 0 });
    expect(stats.topMissed[0]).toMatchObject({ answerEn: "close", students: 2, misses: 2 });
    expect(stats.topMissed[1]).toMatchObject({ students: 2, misses: 2 });
    expect(stats.topMissed[0]).not.toHaveProperty("studentIds");
  });
});

describe("missed scheduled calls", () => {
  // 화·목 19:30 KST, 일정은 미리 만들어 둠. 2026-10-22(목) 19:30 KST = 10:30 UTC
  const schedule = {
    schemaVersion: 1 as const,
    customerNo: "1",
    teacherNo: "t",
    weekdays: ["화" as const, "목" as const],
    time: "19:30",
    reminderMinutesBefore: 10,
    active: true,
    updatedAt: "2026-10-01T00:00:00.000Z",
    updatedByName: null,
  };

  it("marks a student as missed after the grace period without a call", () => {
    const now = new Date("2026-10-22T12:00:00.000Z"); // 21:00 KST
    expect(missedLatestCall(schedule, [], now)).toBe(true);
    const [row] = buildTeacherRows([student("1", "가")], [], new Map([["1", schedule]]), now);
    expect(row.status).toBe("부재중");
    expect(row.schedule?.nextCallLabel).toBe("10월 27일(화) 오후 7:30");
  });

  it("does not mark missed within the grace period, after a call, or for a new schedule", () => {
    const soon = new Date("2026-10-22T11:00:00.000Z"); // 20:00 KST
    expect(missedLatestCall(schedule, [], soon)).toBe(false);
    const later = new Date("2026-10-22T12:00:00.000Z");
    expect(missedLatestCall(schedule, [{ endedAt: "2026-10-22T10:20:00.000Z" }], later)).toBe(false);
    expect(missedLatestCall({ ...schedule, updatedAt: "2026-10-22T11:30:00.000Z" }, [], later)).toBe(false);
    expect(missedLatestCall({ ...schedule, active: false }, [], later)).toBe(false);
  });
});
