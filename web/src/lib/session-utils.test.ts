import { describe, expect, it } from "vitest";

import type { QuizSession } from "./types";
import { buildVisibleSessions } from "./session-utils";

function session(id: string): QuizSession {
  return {
    id,
    studentId: "student-test",
    studentName: "테스트",
    source: "mock",
    totalItems: 1,
    completedItems: 1,
    score: 100,
    results: [],
    createdAt: "2026-07-24T00:00:00Z",
  };
}

describe("buildVisibleSessions", () => {
  it("external-api 모드에서는 데모 세션을 제외한다", () => {
    const visible = buildVisibleSessions(
      [session("stored")],
      [session("demo")],
      "external-api",
    );

    expect(visible.map((item) => item.id)).toEqual(["stored"]);
  });

  it("mock 모드에서는 데모 세션을 합치되 ID 중복을 제거한다", () => {
    const visible = buildVisibleSessions(
      [session("stored"), session("same")],
      [session("same"), session("demo")],
      "mock",
    );

    expect(visible.map((item) => item.id)).toEqual([
      "stored",
      "same",
      "demo",
    ]);
  });
});
