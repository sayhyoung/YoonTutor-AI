// study-api 인증 호출 (로그인/재발급/로그아웃). 문서 4·7·10장 기준.

import { studyFetch } from "./client";
import type { StudyLoginData, StudyRole, StudyTokenPair } from "./types";

const LOGIN_PATHS: Record<StudyRole, string> = {
  student: "/api/auth/login",
  teacher: "/api/auth/teacher/login",
  center: "/api/auth/center/login",
};

function clientId(): string {
  return process.env.STUDY_API_CLIENT_ID ?? "study-api";
}

function deviceType(): string {
  return process.env.STUDY_API_DEVICE_TYPE ?? "web";
}

export type LoginInput = {
  userId: string;
  password: string;
  role?: StudyRole;
};

// 로그인: path만 유형별로 다르고 body 구조는 동일.
export async function studyLogin({ userId, password, role = "student" }: LoginInput): Promise<StudyLoginData> {
  return studyFetch<StudyLoginData>(LOGIN_PATHS[role], {
    method: "POST",
    body: { userId, password, clientId: clientId(), deviceType: deviceType() },
  });
}

// 토큰 재발급: refreshToken rotation. 새 access/refresh를 모두 반환.
export async function studyRefresh(refreshToken: string): Promise<StudyTokenPair> {
  return studyFetch<StudyTokenPair>("/api/auth/refresh", {
    method: "POST",
    body: { refreshToken },
  });
}

// 로그아웃: 서버 refreshToken 무효화. 성공/실패와 무관하게 호출 측에서 쿠키를 지운다.
export async function studyLogout(refreshToken: string): Promise<void> {
  await studyFetch<unknown>("/api/auth/logout", {
    method: "POST",
    body: { refreshToken },
  });
}
