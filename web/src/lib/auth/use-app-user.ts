"use client";

import { useCallback, useSyncExternalStore } from "react";

import { ensureFirebaseUser } from "../firebase/client";
import { upsertStudentProfile, upsertUserProfile } from "../firebase/firestore";
import { demoStudent } from "../mock-data";
import type { AppUser } from "../types";
import { getStoredAppUser, subscribeAppUser, writeStoredAppUser } from "./session-store";

export type StudentLogin = {
  studentId: string;
  memberId: string;
  displayName: string;
};

// study-api 실로그인용 자격증명(external 모드).
export type StudyCredentials = {
  userId: string;
  password: string;
};

type StudyLoginProfile = {
  userId?: string;
  customerNo?: string;
  customerName?: string;
  teacherNo?: string;
  teacherName?: string;
};

// Anonymous Firebase Auth still backs the pilot so Firestore writes get a real
// uid; if it fails or Firebase is unconfigured we fall back to a local uid.
async function resolveUid(fallback: string) {
  try {
    const user = await ensureFirebaseUser();
    return user?.uid ?? fallback;
  } catch {
    return fallback;
  }
}

export function useAppUser() {
  const appUser = useSyncExternalStore(subscribeAppUser, getStoredAppUser, () => null);

  const loginAsStudent = useCallback(async ({ studentId, memberId, displayName }: StudentLogin) => {
    const uid = await resolveUid(`local-student-${memberId}`);
    const appUser: AppUser = { uid, role: "student", studentId, memberId, displayName };
    writeStoredAppUser(appUser);
    void upsertUserProfile(appUser);
    if (studentId === demoStudent.id) {
      void upsertStudentProfile(demoStudent);
    }
  }, []);

  // external 모드: study-api JWT 로그인(BFF). 토큰은 서버 httpOnly 쿠키에 저장되고
  // 여기선 화면용 profile만 받아 AppUser를 구성한다. Firestore uid는 익명 Firebase 유지.
  const loginWithStudyApi = useCallback(async ({ userId, password }: StudyCredentials) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, password, role: "student" }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || "로그인에 실패했어.");
    }
    const { profile } = (await res.json()) as { profile: StudyLoginProfile };
    const customerNo = String(profile.customerNo ?? userId);
    const uid = await resolveUid(`study-${customerNo}`);
    const appUser: AppUser = {
      uid,
      role: "student",
      studentId: customerNo,
      memberId: customerNo,
      displayName: profile.customerName || `회원 ${customerNo}`,
    };
    writeStoredAppUser(appUser);
    void upsertUserProfile(appUser);
  }, []);

  const loginAsTeacher = useCallback(async (displayName: string) => {
    const uid = await resolveUid("local-teacher");
    const appUser: AppUser = { uid, role: "teacher", displayName };
    writeStoredAppUser(appUser);
    void upsertUserProfile(appUser);
  }, []);

  // external 모드: study-api 교사 JWT 로그인(BFF). 토큰 쿠키로 담당 회원 조회 권한 확보.
  const loginAsTeacherApi = useCallback(async ({ userId, password }: StudyCredentials) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, password, role: "teacher" }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || "로그인에 실패했어.");
    }
    const { profile } = (await res.json()) as { profile: StudyLoginProfile };
    const uid = await resolveUid(`teacher-${profile.teacherNo ?? userId}`);
    const appUser: AppUser = {
      uid,
      role: "teacher",
      memberId: profile.teacherNo ? String(profile.teacherNo) : undefined,
      displayName: profile.teacherName || `교사 ${profile.teacherNo ?? ""}`.trim(),
    };
    writeStoredAppUser(appUser);
    void upsertUserProfile(appUser);
  }, []);

  const logout = useCallback(async () => {
    // study-api 세션 쿠키 정리(없으면 무해). 그 후 로컬 앱 세션 제거.
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // 네트워크 실패해도 로컬 세션은 정리한다.
    }
    writeStoredAppUser(null);
  }, []);

  return { appUser, loginAsStudent, loginWithStudyApi, loginAsTeacher, loginAsTeacherApi, logout };
}
