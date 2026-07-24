import { readFileSync } from "node:fs";

import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc } from "firebase/firestore";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { Attempt, QuizSession } from "../types";

const mockedFirebase = vi.hoisted(() => ({
  db: null as unknown,
}));

vi.mock("./client", () => ({
  ensureFirebaseUser: async () => ({ uid: "uid-a" }),
  getFirebaseDb: async () => mockedFirebase.db,
  isFirebaseConfigured: () => true,
}));

import { finalizeQuizSession } from "./firestore";

const emulatorAvailable = Boolean(
  process.env.FIRESTORE_EMULATOR_HOST,
);

describe.skipIf(!emulatorAvailable)(
  "finalizeQuizSession with Firestore rules",
  () => {
    let testEnv: RulesTestEnvironment;

    const session: QuizSession = {
      id: "session-fixed",
      uid: "uid-a",
      studentId: "student-a",
      memberId: "member-a",
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
        uid: "uid-a",
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

    beforeAll(async () => {
      const rules = readFileSync(
        new URL("../../../firestore.rules", import.meta.url),
        "utf8",
      );
      testEnv = await initializeTestEnvironment({
        projectId: "yoon-ai-tutor-finalize-test",
        firestore: { rules },
      });
      mockedFirebase.db = testEnv
        .authenticatedContext("uid-a")
        .firestore();
    });

    beforeEach(async () => {
      await testEnv.clearFirestore();
    });

    afterAll(async () => {
      await testEnv?.cleanup();
    });

    it("세션·시도·원장·게이미피케이션을 저장하고 재호출은 보상하지 않는다", async () => {
      const first = await finalizeQuizSession(session, attempts);
      const second = await finalizeQuizSession(session, attempts);
      const db = testEnv
        .authenticatedContext("uid-a")
        .firestore();

      const sessionSnapshot = await getDoc(
        doc(db, "quizSessions", session.id),
      );
      const attemptSnapshot = await getDoc(
        doc(
          db,
          "quizSessions",
          session.id,
          "attempts",
          attempts[0].id,
        ),
      );
      const ledgerSnapshot = await getDoc(
        doc(
          db,
          "students",
          session.studentId,
          "rewardLedger",
          `session:${session.id}`,
        ),
      );
      const gamificationSnapshot = await getDoc(
        doc(
          db,
          "students",
          session.studentId,
          "meta",
          "gamification",
        ),
      );

      expect(first.granted).toBe(true);
      expect(first.earnedXp).toBe(25);
      expect(second.granted).toBe(false);
      expect(second.earnedXp).toBe(0);
      expect(sessionSnapshot.exists()).toBe(true);
      expect(attemptSnapshot.exists()).toBe(true);
      expect(ledgerSnapshot.exists()).toBe(true);
      expect(ledgerSnapshot.data()?.xpDelta).toBe(25);
      expect(gamificationSnapshot.data()?.stars).toBe(3);
      expect(gamificationSnapshot.data()?.xp).toBe(25);
      expect(gamificationSnapshot.data()?.level).toBe(1);
      expect(gamificationSnapshot.data()?.totalSessions).toBe(1);
    });
  },
);
