"use client";

import type { AppUser, Attempt, QuizSession, StudentProfile } from "../types";
import {
  applySessionToState,
  emptyGamification,
  normalizeGamification,
  starsForSession,
  todayKst,
  xpForSession,
  type GamificationState,
} from "../gamification";
import { ensureFirebaseUser, getFirebaseDb, isFirebaseConfigured } from "./client";

const LOCAL_SESSION_KEY = "yoon-ai-tutor:sessions";
const LOCAL_GAMIFICATION_KEY = "yoon-ai-tutor:gamification";
const LOCAL_REWARD_STATE_KEY = "yoon-ai-tutor:reward-state";

type LocalRewardLedgerEntry = {
  id: string;
  sourceType: "session";
  sourceId: string;
  starsDelta: number;
  xpDelta: number;
  createdAt: string;
};

type LocalRewardState = {
  gamification: GamificationState;
  ledger: Record<string, LocalRewardLedgerEntry>;
};

export type FinalizeQuizSessionResult = {
  granted: boolean;
  mode: "firestore" | "local" | "error";
  gamification: GamificationState;
  earnedStars: number;
  earnedXp: number;
  previousLevel: number;
  newLevel: number;
};

// 세션 저장과 완료 보상을 하나의 멱등 처리로 확정한다.
// eventId는 안정적인 session.id에서 파생되므로 같은 완료 요청은 한 번만 지급된다.
export async function finalizeQuizSession(
  session: QuizSession,
  attempts: Attempt[],
): Promise<FinalizeQuizSessionResult> {
  const eventId = `session:${session.id}`;
  const earnedStars = starsForSession(session.results);
  const earnedXp = xpForSession(session.results);

  if (!isFirebaseConfigured()) {
    return finalizeLocalSession(
      session,
      attempts,
      eventId,
      earnedStars,
      earnedXp,
      "local",
    );
  }

  try {
    const [db, user] = await Promise.all([
      getFirebaseDb(),
      ensureFirebaseUser(),
    ]);
    if (!db || !user) {
      return finalizeLocalSession(
        session,
        attempts,
        eventId,
        earnedStars,
        earnedXp,
        "local",
      );
    }

    const { collection, doc, runTransaction, setDoc } = await import(
      "firebase/firestore"
    );
    const now = new Date().toISOString();
    const today = todayKst();

    // rewardLedger/meta 쓰기 규칙이 참조하는 학생 소유 문서를 먼저 보장한다.
    await setDoc(
      doc(collection(db, "students"), session.studentId),
      {
        id: session.studentId,
        uid: user.uid,
        updatedAt: now,
      },
      { merge: true },
    );

    const sessionRef = doc(
      collection(db, "quizSessions"),
      session.id,
    );
    const userRef = doc(collection(db, "users"), user.uid);
    const gamificationRef = doc(
      db,
      "students",
      session.studentId,
      "meta",
      "gamification",
    );
    const ledgerRef = doc(
      db,
      "students",
      session.studentId,
      "rewardLedger",
      eventId,
    );

    const transactionResult = await runTransaction(db, async (tx) => {
      const [ledgerSnap, gamificationSnap] = await Promise.all([
        tx.get(ledgerRef),
        tx.get(gamificationRef),
      ]);
      const previous = gamificationSnap.exists()
        ? normalizeGamification(gamificationSnap.data())
        : emptyGamification();

      if (ledgerSnap.exists()) {
        return {
          granted: false,
          gamification: previous,
          previousLevel: previous.level,
          newLevel: previous.level,
        };
      }

      const next = applySessionToState(
        previous,
        session.results,
        today,
        now,
        earnedXp,
      );
      const persistedSession = withoutUndefined({
        ...session,
        uid: user.uid,
      });

      tx.set(sessionRef, persistedSession);
      tx.set(
        userRef,
        {
          uid: user.uid,
          role: "student",
          studentId: session.studentId,
          memberId: session.memberId ?? null,
          displayName: session.studentName,
          updatedAt: now,
        },
        { merge: true },
      );
      attempts.forEach((attempt) => {
        const attemptRef = doc(
          collection(sessionRef, "attempts"),
          attempt.id,
        );
        tx.set(
          attemptRef,
          withoutUndefined({
            ...attempt,
            uid: user.uid,
            sessionId: session.id,
          }),
        );
      });
      tx.set(gamificationRef, next);
      tx.set(ledgerRef, {
        id: eventId,
        uid: user.uid,
        studentId: session.studentId,
        sourceType: "session",
        sourceId: session.id,
        starsDelta: earnedStars,
        xpDelta: earnedXp,
        createdAt: now,
      });

      return {
        granted: true,
        gamification: next,
        previousLevel: previous.level,
        newLevel: next.level,
      };
    });

    cacheLocalRewardResult(
      session.studentId,
      eventId,
      transactionResult.gamification,
      earnedStars,
      earnedXp,
      now,
    );

    return {
      ...transactionResult,
      mode: "firestore",
      earnedStars: transactionResult.granted ? earnedStars : 0,
      earnedXp: transactionResult.granted ? earnedXp : 0,
    };
  } catch (error) {
    console.warn(
      "Firestore finalize failed, falling back to localStorage",
      error,
    );
    return finalizeLocalSession(
      session,
      attempts,
      eventId,
      earnedStars,
      earnedXp,
      "error",
    );
  }
}

export async function loadQuizSessions(studentId: string) {
  if (!isFirebaseConfigured()) {
    return { mode: "local" as const, sessions: readLocalSessions() };
  }

  try {
    const [db, user] = await Promise.all([getFirebaseDb(), ensureFirebaseUser()]);
    if (!db || !user) {
      return { mode: "local" as const, sessions: readLocalSessions() };
    }

    const { collection, getDocs, limit, orderBy, query, where } = await import("firebase/firestore");
    const sessionsQuery = query(
      collection(db, "quizSessions"),
      where("uid", "==", user.uid),
      where("studentId", "==", studentId),
      orderBy("createdAt", "desc"),
      limit(20),
    );
    const snapshot = await getDocs(sessionsQuery);
    const sessions = snapshot.docs.map((docSnap) => docSnap.data() as QuizSession);
    return { mode: "firestore" as const, sessions };
  } catch (error) {
    console.warn("Firestore read failed, falling back to localStorage", error);
    return { mode: "error" as const, sessions: readLocalSessions() };
  }
}

export async function upsertUserProfile(appUser: AppUser) {
  if (!isFirebaseConfigured()) return { mode: "local" as const };

  try {
    const [db, user] = await Promise.all([getFirebaseDb(), ensureFirebaseUser()]);
    if (!db || !user) return { mode: "local" as const };

    const { collection, doc, setDoc } = await import("firebase/firestore");
    await setDoc(
      doc(collection(db, "users"), user.uid),
      {
        uid: user.uid,
        role: appUser.role,
        studentId: appUser.studentId ?? null,
        memberId: appUser.memberId ?? null,
        displayName: appUser.displayName,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    return { mode: "firestore" as const };
  } catch (error) {
    console.warn("User profile upsert failed", error);
    return { mode: "error" as const };
  }
}

// Best-effort: anonymous pilot users may lack permission to write
// students/{id}. We swallow permission errors so login still succeeds.
export async function upsertStudentProfile(profile: StudentProfile) {
  if (!isFirebaseConfigured()) return { mode: "local" as const };

  try {
    const [db, user] = await Promise.all([getFirebaseDb(), ensureFirebaseUser()]);
    if (!db || !user) return { mode: "local" as const };

    const { collection, doc, setDoc } = await import("firebase/firestore");
    await setDoc(
      doc(collection(db, "students"), profile.id),
      {
        id: profile.id,
        uid: user.uid,
        name: profile.name,
        memberId: profile.memberId,
        level: profile.level,
        campus: profile.campus,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    return { mode: "firestore" as const };
  } catch (error) {
    console.warn("Student profile upsert skipped (insufficient permission?)", error);
    return { mode: "error" as const };
  }
}

// Teacher dashboard broad read across all pilot sessions. Per firestore.rules
// this requires a `role=teacher` custom claim; anonymous pilot teachers are
// denied and the caller falls back to local/demo data.
export async function loadAllSessions(max = 50) {
  if (!isFirebaseConfigured()) {
    return { mode: "local" as const, sessions: readLocalSessions() };
  }

  try {
    const [db, user] = await Promise.all([getFirebaseDb(), ensureFirebaseUser()]);
    if (!db || !user) {
      return { mode: "local" as const, sessions: readLocalSessions() };
    }

    const { collection, getDocs, limit, orderBy, query } = await import("firebase/firestore");
    const sessionsQuery = query(
      collection(db, "quizSessions"),
      orderBy("createdAt", "desc"),
      limit(max),
    );
    const snapshot = await getDocs(sessionsQuery);
    const sessions = snapshot.docs.map((docSnap) => docSnap.data() as QuizSession);
    return { mode: "firestore" as const, sessions };
  } catch (error) {
    console.warn(
      "Teacher session read failed (teacher custom claim required), falling back",
      error,
    );
    return { mode: "error" as const, sessions: readLocalSessions() };
  }
}

// ===== 게이미피케이션 (students/{studentId}/meta/gamification) =====

function withoutUndefined<T extends Record<string, unknown>>(
  value: T,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}

function localRewardStateKey(studentId: string): string {
  return `${LOCAL_REWARD_STATE_KEY}:${studentId}`;
}

function readLocalRewardState(studentId: string): LocalRewardState {
  if (typeof window === "undefined") {
    return { gamification: emptyGamification(), ledger: {} };
  }

  try {
    const raw = window.localStorage.getItem(
      localRewardStateKey(studentId),
    );
    if (raw) {
      const parsed = JSON.parse(raw) as {
        gamification?: unknown;
        ledger?: unknown;
      };
      return {
        gamification: normalizeGamification(parsed.gamification),
        ledger:
          parsed.ledger &&
          typeof parsed.ledger === "object" &&
          !Array.isArray(parsed.ledger)
            ? (parsed.ledger as Record<
                string,
                LocalRewardLedgerEntry
              >)
            : {},
      };
    }

    // 기존 버전의 단일 gamification 키를 최초 읽기 시 새 구조로 흡수한다.
    const legacy = window.localStorage.getItem(
      `${LOCAL_GAMIFICATION_KEY}:${studentId}`,
    );
    return {
      gamification: legacy
        ? normalizeGamification(JSON.parse(legacy))
        : emptyGamification(),
      ledger: {},
    };
  } catch {
    return { gamification: emptyGamification(), ledger: {} };
  }
}

function writeLocalRewardState(
  studentId: string,
  state: LocalRewardState,
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    localRewardStateKey(studentId),
    JSON.stringify(state),
  );
}

function readLocalGamification(studentId: string): GamificationState {
  return readLocalRewardState(studentId).gamification;
}

function cacheLocalRewardResult(
  studentId: string,
  eventId: string,
  gamification: GamificationState,
  starsDelta: number,
  xpDelta: number,
  createdAt: string,
) {
  const local = readLocalRewardState(studentId);
  writeLocalRewardState(studentId, {
    gamification: normalizeGamification(gamification),
    ledger: {
      ...local.ledger,
      [eventId]: {
        id: eventId,
        sourceType: "session",
        sourceId: eventId.replace(/^session:/, ""),
        starsDelta,
        xpDelta,
        createdAt,
      },
    },
  });
}

function finalizeLocalSession(
  session: QuizSession,
  attempts: Attempt[],
  eventId: string,
  earnedStars: number,
  earnedXp: number,
  mode: "local" | "error",
): FinalizeQuizSessionResult {
  const now = new Date().toISOString();
  const local = readLocalRewardState(session.studentId);
  const existing = local.ledger[eventId];

  // 세션 저장도 ID 기준 upsert라서 재시도 시 중복 목록이 생기지 않는다.
  saveLocalSession(session, attempts);

  if (existing) {
    const current = normalizeGamification(local.gamification);
    return {
      granted: false,
      mode,
      gamification: current,
      earnedStars: 0,
      earnedXp: 0,
      previousLevel: current.level,
      newLevel: current.level,
    };
  }

  const previous = normalizeGamification(local.gamification);
  const next = applySessionToState(
    previous,
    session.results,
    todayKst(),
    now,
    earnedXp,
  );
  writeLocalRewardState(session.studentId, {
    gamification: next,
    ledger: {
      ...local.ledger,
      [eventId]: {
        id: eventId,
        sourceType: "session",
        sourceId: session.id,
        starsDelta: earnedStars,
        xpDelta: earnedXp,
        createdAt: now,
      },
    },
  });

  return {
    granted: true,
    mode,
    gamification: next,
    earnedStars,
    earnedXp,
    previousLevel: previous.level,
    newLevel: next.level,
  };
}

export async function loadGamification(studentId: string): Promise<GamificationState | null> {
  if (!isFirebaseConfigured()) {
    const local = readLocalGamification(studentId);
    return local.updatedAt ? local : null;
  }
  try {
    const [db, user] = await Promise.all([getFirebaseDb(), ensureFirebaseUser()]);
    if (!db || !user) {
      const local = readLocalGamification(studentId);
      return local.updatedAt ? local : null;
    }
    const { doc, getDoc } = await import("firebase/firestore");
    const ref = doc(db, "students", studentId, "meta", "gamification");
    const snap = await getDoc(ref);
    return snap.exists() ? normalizeGamification(snap.data()) : null;
  } catch (error) {
    console.warn("Gamification read failed, falling back to localStorage", error);
    const local = readLocalGamification(studentId);
    return local.updatedAt ? local : null;
  }
}

export function readLocalSessions(): QuizSession[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(LOCAL_SESSION_KEY);
    return raw ? (JSON.parse(raw) as QuizSession[]) : [];
  } catch {
    return [];
  }
}

function saveLocalSession(session: QuizSession, attempts: Attempt[]) {
  if (typeof window === "undefined") return;

  const existing = readLocalSessions().filter(
    (item) => item.id !== session.id,
  );
  const withAttempts = {
    ...session,
    localAttemptCount: attempts.length,
  };
  window.localStorage.setItem(
    LOCAL_SESSION_KEY,
    JSON.stringify([withAttempts, ...existing].slice(0, 20)),
  );
}
