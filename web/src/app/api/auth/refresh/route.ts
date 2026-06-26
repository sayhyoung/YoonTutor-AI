import { NextResponse } from "next/server";

import { studyRefresh } from "@/lib/study-api/auth";
import { clearTokens, getRefreshToken, setTokens } from "@/lib/study-api/token-store";

export const runtime = "nodejs";

// refreshToken으로 토큰 재발급(rotation). 실패 시 세션 폐기.
export async function POST() {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    return NextResponse.json({ error: "세션이 없어." }, { status: 401 });
  }

  try {
    const tokens = await studyRefresh(refreshToken);
    await setTokens(tokens);
    return NextResponse.json({ ok: true });
  } catch {
    await clearTokens();
    return NextResponse.json({ error: "세션이 만료됐어. 다시 로그인해줘." }, { status: 401 });
  }
}
