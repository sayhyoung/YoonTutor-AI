import { describe, expect, it } from "vitest";

import { applyMessageUpdate, parseMessageUpdate, type StoredTeacherMessage, toMessageView } from "./messages";

const message: StoredTeacherMessage = {
  schemaVersion: 1,
  id: "m1",
  customerNo: "<CUSTOMER_NO>",
  teacherNo: "<TEACHER_NO>",
  teacherName: "김윤",
  body: "오늘 통화 정말 잘했어요!",
  sentAt: "2026-10-26T10:00:00.000Z",
};

describe("teacher messages", () => {
  it("accepts only read or a known reaction", () => {
    expect(parseMessageUpdate({ action: "read" })).toEqual({ action: "read" });
    expect(parseMessageUpdate({ action: "react", reaction: "thanks" })).toEqual({ action: "react", reaction: "thanks" });
    expect(parseMessageUpdate({ action: "react", reaction: "angry" })).toBeNull();
    expect(parseMessageUpdate({ action: "reply", text: "hi" })).toBeNull();
  });

  it("keeps the first read time and marks a reaction as read", () => {
    const read = applyMessageUpdate(message, { action: "read" }, new Date("2026-10-26T11:00:00.000Z"));
    expect(read.readAt).toBe("2026-10-26T11:00:00.000Z");
    const again = applyMessageUpdate(read, { action: "read" }, new Date("2026-10-26T12:00:00.000Z"));
    expect(again.readAt).toBe("2026-10-26T11:00:00.000Z");
    const reacted = applyMessageUpdate(message, { action: "react", reaction: "cheer" }, new Date("2026-10-26T13:00:00.000Z"));
    expect(reacted).toMatchObject({ readAt: "2026-10-26T13:00:00.000Z", reaction: "cheer", reactedAt: "2026-10-26T13:00:00.000Z" });
  });

  it("hides member and teacher numbers from the view", () => {
    const view = toMessageView(message);
    expect(view).not.toHaveProperty("customerNo");
    expect(view).not.toHaveProperty("teacherNo");
  });
});
