import { NextResponse } from "next/server";

import { studyLogout } from "@/lib/study-api/auth";
import { clearTokens, getRefreshToken } from "@/lib/study-api/token-store";

export const runtime = "nodejs";

// 로그아웃: 서버 refreshToken 무효화 시도 후, 성공 여부와 무관하게 쿠키 삭제.
export async function POST() {
  const refreshToken = await getRefreshToken();
  try {
    if (refreshToken) {
      await studyLogout(refreshToken);
    }
  } catch {
    // 무효화 실패해도 로컬 세션은 정리한다.
  } finally {
    await clearTokens();
  }
  return NextResponse.json({ ok: true });
}
