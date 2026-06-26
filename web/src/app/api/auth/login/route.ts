import { NextResponse } from "next/server";

import { studyLogin } from "@/lib/study-api/auth";
import { StudyApiError } from "@/lib/study-api/client";
import { setTokens } from "@/lib/study-api/token-store";
import { extractProfile } from "@/lib/study-api/types";
import type { StudyRole } from "@/lib/study-api/types";

export const runtime = "nodejs";

type LoginBody = { userId?: string; password?: string; role?: StudyRole };

// study-api 로그인을 서버에서 대행: 토큰은 httpOnly 쿠키로 저장하고
// 화면용 profile(토큰 제외)만 응답으로 돌려준다.
export async function POST(request: Request) {
  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { userId, password, role } = body;
  if (!userId?.trim() || !password) {
    return NextResponse.json({ error: "아이디와 비밀번호를 입력해줘." }, { status: 400 });
  }

  try {
    const data = await studyLogin({ userId, password, role });
    await setTokens(data);
    return NextResponse.json({ profile: extractProfile(data) });
  } catch (error) {
    if (error instanceof StudyApiError) {
      // A-1200(아이디/비번 불일치) 등은 상태코드와 함께 전달.
      return NextResponse.json(
        { error: error.detail ?? error.message, errorCode: error.errorCode },
        { status: error.status },
      );
    }
    return NextResponse.json({ error: "로그인에 실패했어." }, { status: 500 });
  }
}
