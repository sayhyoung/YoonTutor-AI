// study-api 토큰을 httpOnly 쿠키로 보관(서버 전용).
// 브라우저 JS에서 토큰에 접근 못 하게 해 노출/XSS 위험을 줄인다.

import { cookies } from "next/headers";

import type { StudyTokenPair } from "./types";

const ACCESS_COOKIE = "study_at";
const REFRESH_COOKIE = "study_rt";

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

// 토큰 쌍 저장(rotation 시에도 동일 함수로 교체).
export async function setTokens(tokens: StudyTokenPair): Promise<void> {
  const jar = await cookies();
  const base = {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax" as const,
    path: "/",
  };
  jar.set(ACCESS_COOKIE, tokens.accessToken, {
    ...base,
    maxAge: tokens.accessTokenExpiresIn,
  });
  jar.set(REFRESH_COOKIE, tokens.refreshToken, {
    ...base,
    maxAge: tokens.refreshTokenExpiresIn,
  });
}

export async function getAccessToken(): Promise<string | null> {
  return (await cookies()).get(ACCESS_COOKIE)?.value ?? null;
}

export async function getRefreshToken(): Promise<string | null> {
  return (await cookies()).get(REFRESH_COOKIE)?.value ?? null;
}

export async function clearTokens(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}
