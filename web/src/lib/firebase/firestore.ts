"use client";

import type { AppUser, Attempt, QuizSession, StudentProfile } from "../types";
import { ensureFirebaseUser, getFirebaseDb, isFirebaseConfigured } from "./client";

const LOCAL_SESSION_KEY = "yoon-ai-tutor:sessions";

export async function saveQuizSession(session: QuizSession, attempts: Attempt[]) {
  if (!isFirebaseConfigured()) {
    saveLocalSession(session, attempts);
    return { mode: "local" as const };
  }

  try {
    const [db, user] = await Promise.all([getFirebaseDb(), ensureFirebaseUser()]);
    if (!db || !user) {
      saveLocalSession(session, attempts);
      return { mode: "local" as const };
    }

    const { collection, doc, writeBatch } = await import("firebase/firestore");
    const persistedSession: QuizSession = {
      ...session,
      uid: user.uid,
    };
    const batch = writeBatch(db);
    const sessionRef = doc(collection(db, "quizSessions"), persistedSession.id);

    batch.set(sessionRef, persistedSession);
    batch.set(
      doc(collection(db, "users"), user.uid),
      {
        uid: user.uid,
        role: "student",
        studentId: persistedSession.studentId,
        memberId: persistedSession.memberId ?? null,
        displayName: persistedSession.studentName,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    attempts.forEach((attempt) => {
      const attemptRef = doc(collection(sessionRef, "attempts"), attempt.id);
      batch.set(attemptRef, {
        ...attempt,
        uid: user.uid,
        sessionId: persistedSession.id,
      });
    });

    await batch.commit();
    return { mode: "firestore" as const };
  } catch (error) {
    console.warn("Firestore save failed, falling back to localStorage", error);
    saveLocalSession(session, attempts);
    return { mode: "error" as const };
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

  const existing = readLocalSessions();
  const withAttempts = {
    ...session,
    localAttemptCount: attempts.length,
  };
  window.localStorage.setItem(
    LOCAL_SESSION_KEY,
    JSON.stringify([withAttempts, ...existing].slice(0, 20)),
  );
}
