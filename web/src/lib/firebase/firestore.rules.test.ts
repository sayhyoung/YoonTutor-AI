import { readFileSync } from "node:fs";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

const emulatorAvailable = Boolean(
  process.env.FIRESTORE_EMULATOR_HOST,
);

describe.skipIf(!emulatorAvailable)(
  "firestore rewardLedger rules",
  () => {
    let testEnv: RulesTestEnvironment;

    beforeAll(async () => {
      const rules = readFileSync(
        new URL("../../../firestore.rules", import.meta.url),
        "utf8",
      );
      testEnv = await initializeTestEnvironment({
        projectId: "yoon-ai-tutor-rules-test",
        firestore: { rules },
      });
    });

    beforeEach(async () => {
      await testEnv.clearFirestore();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(
          doc(context.firestore(), "students", "student-a"),
          {
            id: "student-a",
            uid: "uid-a",
          },
        );
      });
    });

    afterAll(async () => {
      await testEnv?.cleanup();
    });

    function ledgerData(overrides: Record<string, unknown> = {}) {
      return {
        id: "session:session-a",
        uid: "uid-a",
        studentId: "student-a",
        sourceType: "session",
        sourceId: "session-a",
        starsDelta: 3,
        xpDelta: 0,
        createdAt: "2026-07-24T00:00:00Z",
        ...overrides,
      };
    }

    it("학생 본인이 올바른 원장 문서를 생성하고 읽을 수 있다", async () => {
      const db = testEnv
        .authenticatedContext("uid-a")
        .firestore();
      const ref = doc(
        db,
        "students",
        "student-a",
        "rewardLedger",
        "session:session-a",
      );

      await assertSucceeds(setDoc(ref, ledgerData()));
      const snapshot = await assertSucceeds(getDoc(ref));

      expect(snapshot.exists()).toBe(true);
    });

    it("다른 학생은 원장을 생성할 수 없다", async () => {
      const db = testEnv
        .authenticatedContext("uid-b")
        .firestore();
      const ref = doc(
        db,
        "students",
        "student-a",
        "rewardLedger",
        "session:session-a",
      );

      await assertFails(
        setDoc(
          ref,
          ledgerData({
            uid: "uid-b",
          }),
        ),
      );
    });

    it("uid·studentId·eventId가 일치하지 않으면 생성할 수 없다", async () => {
      const db = testEnv
        .authenticatedContext("uid-a")
        .firestore();
      const ref = doc(
        db,
        "students",
        "student-a",
        "rewardLedger",
        "session:session-a",
      );

      await assertFails(
        setDoc(
          ref,
          ledgerData({
            studentId: "student-b",
          }),
        ),
      );
    });

    it("이미 생성한 원장 문서는 수정할 수 없다", async () => {
      const db = testEnv
        .authenticatedContext("uid-a")
        .firestore();
      const ref = doc(
        db,
        "students",
        "student-a",
        "rewardLedger",
        "session:session-a",
      );

      await assertSucceeds(setDoc(ref, ledgerData()));
      await assertFails(
        setDoc(
          ref,
          ledgerData({
            starsDelta: 999,
          }),
        ),
      );
    });
  },
);
