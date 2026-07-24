import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Attempt, QuizSession } from "../types";

vi.mock("./client", () => ({
  ensureFirebaseUser: vi.fn(),
  getFirebaseDb: vi.fn(),
  isFirebaseConfigured: () => false,
}));

import {
  finalizeQuizSession,
  loadGamification,
  readLocalSessions,
} from "./firestore";

class MemoryStorage {
  private values = new Map<string, string>();

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const storage = new MemoryStorage();

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage: storage },
});

const session: QuizSession = {
  id: "session-fixed",
  uid: "uid-test",
  studentId: "student-test",
  memberId: "member-test",
  studentName: "테스트",
  source: "mock",
  totalItems: 1,
  completedItems: 1,
  score: 100,
  results: [
    {
      itemId: "word-test",
      sourceType: "word",
      sourceLabel: "단어",
      question: "습관",
      answer: "habit",
      status: "Perfect",
      attempts: 1,
    },
  ],
  createdAt: "2026-07-24T00:00:00Z",
  completedAt: "2026-07-24T00:01:00Z",
};

const attempts: Attempt[] = [
  {
    id: "attempt-fixed",
    uid: "uid-test",
    sessionId: session.id,
    itemId: "word-test",
    answer: "habit",
    feedback: "정확해.",
    status: "Perfect",
    countsAsAttempt: true,
    attemptNumber: 1,
    createdAt: "2026-07-24T00:00:30Z",
  },
];

describe("local finalizeQuizSession", () => {
  beforeEach(() => {
    storage.clear();
  });

  it("같은 sessionId의 보상을 한 번만 지급하고 세션도 중복 저장하지 않는다", async () => {
    const first = await finalizeQuizSession(session, attempts);
    const second = await finalizeQuizSession(session, attempts);
    const state = await loadGamification(session.studentId);

    expect(first.granted).toBe(true);
    expect(first.earnedStars).toBe(3);
    expect(first.earnedXp).toBe(25);
    expect(second.granted).toBe(false);
    expect(second.earnedStars).toBe(0);
    expect(second.earnedXp).toBe(0);
    expect(state?.stars).toBe(3);
    expect(state?.xp).toBe(25);
    expect(state?.level).toBe(1);
    expect(state?.totalSessions).toBe(1);
    expect(readLocalSessions()).toHaveLength(1);
  });
});
