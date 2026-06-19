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

  const loginAsTeacher = useCallback(async (displayName: string) => {
    const uid = await resolveUid("local-teacher");
    const appUser: AppUser = { uid, role: "teacher", displayName };
    writeStoredAppUser(appUser);
    void upsertUserProfile(appUser);
  }, []);

  const logout = useCallback(() => {
    writeStoredAppUser(null);
  }, []);

  return { appUser, loginAsStudent, loginAsTeacher, logout };
}
