import { NextResponse } from "next/server";

import { studyLogin, studyLogout } from "@/lib/study-api/auth";
import { StudyApiError, isStudyApiConfigured } from "@/lib/study-api/client";
import { corsHeaders, preflight } from "@/lib/study-api/call-review-cors";
import {
  isMobileTokenConfigured,
  issueMobileToken,
  readMobileToken,
} from "@/lib/study-api/call-review-mobile-token";
import { extractProfile } from "@/lib/study-api/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METHODS = "POST, DELETE, OPTIONS";

type LoginBody = { userId?: string; password?: string };

function json(request: Request, body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", ...corsHeaders(request, METHODS) },
  });
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}

// 모바일 학생 로그인: 쿠키를 쓰지 않고 봉인된 Bearer 토큰을 응답 본문으로 돌려준다.
// 응답에는 화면 표시용 이름만 담고 학생 번호와 study-api 토큰은 노출하지 않는다.
export async function POST(request: Request) {
  if (!isMobileTokenConfigured() || !isStudyApiConfigured()) {
    return json(request, { error: "전화관리 로그인이 설정되지 않았어요." }, 503);
  }

  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return json(request, { error: "잘못된 요청이에요." }, 400);
  }

  const { userId, password } = body;
  if (!userId?.trim() || !password) {
    return json(request, { error: "아이디와 비밀번호를 입력해 주세요." }, 400);
  }

  try {
    const data = await studyLogin({ userId: userId.trim(), password, role: "student" });
    const issued = issueMobileToken(extractProfile(data), data);
    if (!issued) {
      return json(request, { error: "학생 계정 정보를 확인하지 못했어요." }, 403);
    }
    return json(request, {
      token: issued.token,
      expiresAt: issued.payload.expiresAt,
      displayName: issued.payload.displayName ?? null,
    });
  } catch (error) {
    if (error instanceof StudyApiError) {
      const status = error.status === 401 || error.status === 400 ? 401 : error.status;
      return json(
        request,
        {
          error:
            status === 401
              ? "아이디 또는 비밀번호를 다시 확인해 주세요."
              : "로그인 서버에 연결하지 못했어요.",
          errorCode: error.errorCode,
        },
        status,
      );
    }
    return json(request, { error: "로그인에 실패했어요." }, 500);
  }
}

// 로그아웃: study-api refresh 토큰을 무효화한다. 실패해도 앱은 저장된 토큰을 지운다.
export async function DELETE(request: Request) {
  const payload = readMobileToken(request);
  if (payload) {
    try {
      await studyLogout(payload.studyRefreshToken);
    } catch {
      // 이미 만료된 토큰 등은 무시한다.
    }
  }
  return json(request, { ok: true });
}
