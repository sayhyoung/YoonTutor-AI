import { describe, expect, it } from "vitest";

import { buildPushContent, buildTeacherMessage, dueEvents, invalidTokensFrom, isPushToken } from "./push";

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

  it("builds call and reminder content that the app can recognize", () => {
    expect(buildPushContent({ kind: "call", at: new Date() }, 10)).toMatchObject({ data: { kind: "call-review", type: "call" } });
    expect(buildPushContent({ kind: "reminder", at: new Date() }, 10).title).toBe("10분 뒤 관리 전화가 와요");
  });

  it("accepts FCM registration tokens and rejects other values", () => {
    expect(isPushToken("dQw4w9WgXcQ:APA91bHun4MxP5egoKMwt2KZFBaFUH-1RYqx")).toBe(true);
    expect(isPushToken("ExponentPushToken[abc]")).toBe(false);
    expect(isPushToken("short")).toBe(false);
    expect(isPushToken(42)).toBe(false);
  });

  it("removes only tokens that FCM says are no longer registered", () => {
    expect(
      invalidTokensFrom(
        ["ok-token", "gone-token", "bad-token", "busy-token"],
        [
          { success: true },
          { success: false, error: { code: "messaging/registration-token-not-registered" } },
          { success: false, error: { code: "messaging/invalid-registration-token" } },
          { success: false, error: { code: "messaging/server-unavailable" } },
        ],
      ),
    ).toEqual(["gone-token", "bad-token"]);
  });
});

describe("teacher message push", () => {
  it("opens the app without starting a call", () => {
    expect(buildTeacherMessage("내일 통화 잊지 마세요!", "김윤")).toEqual({
      title: "김윤 선생님의 메시지",
      body: "내일 통화 잊지 마세요!",
      data: { kind: "call-review", type: "message" },
    });
    expect(buildTeacherMessage("안녕", null).title).toBe("선생님의 메시지");
  });
});
