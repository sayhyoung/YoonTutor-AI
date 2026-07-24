import { describe, expect, it } from "vitest";

import {
  applySessionToState,
  emptyGamification,
  levelFromXp,
  levelProgress,
  nextStreak,
  normalizeGamification,
  starsForStatus,
  xpForSession,
} from "./gamification";
import type { SessionResult } from "./types";

const result: SessionResult = {
  itemId: "word-test",
  sourceType: "word",
  sourceLabel: "단어",
  question: "습관",
  answer: "habit",
  status: "Perfect",
  attempts: 1,
};

describe("normalizeGamification", () => {
  it("기존 별·스트릭 문서에 신규 필드 기본값을 채운다", () => {
    const state = normalizeGamification({
      stars: 12,
      streak: {
        current: 3,
        best: 5,
        lastStudyDate: "2026-07-23",
      },
      totalSessions: 4,
      updatedAt: "2026-07-23T00:00:00Z",
    });

    expect(state.stars).toBe(12);
    expect(state.xp).toBe(0);
    expect(state.level).toBe(1);
    expect(state.streak.freezesAvailable).toBe(0);
    expect(state.activeCosmetics).toEqual({});
  });

  it("잘못된 숫자와 객체를 안전한 기본값으로 복구한다", () => {
    const state = normalizeGamification({
      stars: Number.NaN,
      xp: "invalid",
      level: -1,
      streak: null,
      activeCosmetics: "invalid",
    });

    expect(state).toEqual(emptyGamification());
  });
});

describe("rewards and streak", () => {
  it("모든 결과에 최소 1개의 별을 준다", () => {
    expect(starsForStatus("Perfect")).toBe(3);
    expect(starsForStatus("Good")).toBe(2);
    expect(starsForStatus("Not mastered")).toBe(1);
  });

  it("같은 날에는 스트릭을 중복 증가시키지 않는다", () => {
    const previous = {
      current: 4,
      best: 4,
      lastStudyDate: "2026-07-24",
      freezesAvailable: 1,
    };

    expect(nextStreak(previous, "2026-07-24")).toEqual(previous);
  });

  it("기존 확장 필드를 보존하면서 세션 보상을 적용한다", () => {
    const previous = {
      ...emptyGamification(),
      xp: 60,
      level: 2,
      activeCosmetics: { hat: "cap-basic" },
    };
    const next = applySessionToState(
      previous,
      [result],
      "2026-07-24",
      "2026-07-24T01:00:00Z",
    );

    expect(next.stars).toBe(3);
    expect(next.xp).toBe(60);
    expect(next.level).toBe(2);
    expect(next.activeCosmetics.hat).toBe("cap-basic");
  });

  it("완료·문항·재시도 성공 기준으로 XP를 계산한다", () => {
    const retryResult = { ...result, itemId: "word-retry", status: "Good" as const };
    const reviewResult = {
      ...result,
      itemId: "word-review",
      status: "Not mastered" as const,
    };

    expect(xpForSession([])).toBe(0);
    expect(xpForSession([result, retryResult, reviewResult])).toBe(40);
  });

  it("누적 XP를 레벨과 다음 레벨 진행률로 변환한다", () => {
    expect(levelFromXp(59)).toBe(1);
    expect(levelFromXp(60)).toBe(2);
    expect(levelProgress(105)).toMatchObject({
      level: 2,
      currentThreshold: 60,
      nextThreshold: 150,
      xpIntoLevel: 45,
      xpNeeded: 90,
      percent: 50,
    });
  });
});
