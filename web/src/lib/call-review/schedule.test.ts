import { describe, expect, it } from "vitest";

import { formatCallLabel, nextCallAt, parseScheduleInput, previousCallAt } from "./schedule";

// 2026-10-21은 수요일. KST 15:00 = UTC 06:00.
const wedAfternoon = new Date("2026-10-21T06:00:00.000Z");
const schedule = { weekdays: ["화" as const, "목" as const], time: "19:30", reminderMinutesBefore: 10, active: true };

describe("parseScheduleInput", () => {
  it("accepts a valid schedule and orders weekdays Monday first", () => {
    const parsed = parseScheduleInput({ weekdays: ["목", "월"], time: "07:05", reminderMinutesBefore: 5 });
    expect(parsed).toEqual({
      ok: true,
      input: { weekdays: ["월", "목"], time: "07:05", reminderMinutesBefore: 5, active: true },
    });
  });

  it("rejects bad weekdays, times and reminders", () => {
    expect(parseScheduleInput({ weekdays: ["Mon"], time: "19:30", reminderMinutesBefore: 10 }).ok).toBe(false);
    expect(parseScheduleInput({ weekdays: ["월"], time: "24:00", reminderMinutesBefore: 10 }).ok).toBe(false);
    expect(parseScheduleInput({ weekdays: ["월"], time: "7:30", reminderMinutesBefore: 10 }).ok).toBe(false);
    expect(parseScheduleInput({ weekdays: ["월"], time: "19:30", reminderMinutesBefore: 7 }).ok).toBe(false);
    expect(parseScheduleInput({ weekdays: [], time: "19:30", reminderMinutesBefore: 10 }).ok).toBe(false);
  });

  it("allows a paused schedule without weekdays", () => {
    expect(parseScheduleInput({ weekdays: [], time: "19:30", reminderMinutesBefore: 10, active: false }).ok).toBe(true);
  });
});

describe("call times in KST", () => {
  it("finds the next and previous scheduled calls", () => {
    // 다음: 목 10/22 19:30 KST = 10:30 UTC, 이전: 화 10/20 19:30 KST
    expect(nextCallAt(schedule, wedAfternoon)?.toISOString()).toBe("2026-10-22T10:30:00.000Z");
    expect(previousCallAt(schedule, wedAfternoon)?.toISOString()).toBe("2026-10-20T10:30:00.000Z");
  });

  it("uses today when today's time has not passed yet", () => {
    const tueMorning = new Date("2026-10-20T00:00:00.000Z"); // 화 09:00 KST
    expect(nextCallAt(schedule, tueMorning)?.toISOString()).toBe("2026-10-20T10:30:00.000Z");
  });

  it("handles the KST date boundary (UTC still the previous day)", () => {
    const kstWedEarly = new Date("2026-10-20T16:30:00.000Z"); // 수 01:30 KST, UTC는 화요일
    expect(nextCallAt({ ...schedule, weekdays: ["수"], time: "07:00" }, kstWedEarly)?.toISOString()).toBe(
      "2026-10-20T22:00:00.000Z",
    );
  });

  it("returns nothing for a paused schedule", () => {
    expect(nextCallAt({ ...schedule, active: false }, wedAfternoon)).toBeNull();
  });

  it("formats labels relative to today", () => {
    expect(formatCallLabel(new Date("2026-10-21T10:30:00.000Z"), wedAfternoon)).toBe("오늘 오후 7:30");
    expect(formatCallLabel(new Date("2026-10-22T10:30:00.000Z"), wedAfternoon)).toBe("내일 오후 7:30");
    expect(formatCallLabel(new Date("2026-10-26T23:05:00.000Z"), wedAfternoon)).toBe("10월 27일(화) 오전 8:05");
  });
});
