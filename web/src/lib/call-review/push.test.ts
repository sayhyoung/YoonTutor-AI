import { describe, expect, it } from "vitest";

import { buildMessages, dueEvents, isExpoPushToken } from "./push";

// 목 19:30 KST = 10:30 UTC (2026-10-22), 10분 전 알림 = 10:20 UTC
const schedule = { weekdays: ["목" as const], time: "19:30", reminderMinutesBefore: 10, active: true };
const at = (iso: string) => new Date(iso);

describe("due push events", () => {
  it("finds the reminder and the call inside the window", () => {
    expect(dueEvents(schedule, at("2026-10-22T10:15:00Z"), at("2026-10-22T10:22:00Z"))).toEqual([
      { kind: "reminder", at: at("2026-10-22T10:20:00.000Z") },
    ]);
    expect(dueEvents(schedule, at("2026-10-22T10:25:00Z"), at("2026-10-22T10:32:00Z"))).toEqual([
      { kind: "call", at: at("2026-10-22T10:30:00.000Z") },
    ]);
  });

  it("returns nothing outside the window, for paused schedules, or without reminders", () => {
    expect(dueEvents(schedule, at("2026-10-22T09:00:00Z"), at("2026-10-22T09:07:00Z"))).toEqual([]);
    expect(dueEvents({ ...schedule, active: false }, at("2026-10-22T10:25:00Z"), at("2026-10-22T10:32:00Z"))).toEqual([]);
    expect(dueEvents({ ...schedule, reminderMinutesBefore: 0 }, at("2026-10-22T10:15:00Z"), at("2026-10-22T10:22:00Z"))).toEqual([]);
  });

  it("builds one message per device and validates Expo tokens", () => {
    const messages = buildMessages(["ExponentPushToken[abc]", "ExpoPushToken[def]"], { kind: "call", at: new Date() }, 10);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.data).toEqual({ kind: "call-review", type: "call" });
    expect(isExpoPushToken("ExponentPushToken[abc-123]")).toBe(true);
    expect(isExpoPushToken("not-a-token")).toBe(false);
  });
});
