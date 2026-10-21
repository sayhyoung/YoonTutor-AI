import { NextResponse } from "next/server";

import {
  getCallReviewSession,
  isCallReviewSessionConfigured,
} from "@/lib/study-api/call-review-session";
import { corsHeaders, preflight } from "@/lib/study-api/call-review-cors";
import {
  bearerToken,
  createMobileStudyFetcher,
  readMobileToken,
} from "@/lib/study-api/call-review-mobile-token";
import { StudyApiError, isStudyApiConfigured } from "@/lib/study-api/client";
import { loadWrongAnswerItems } from "@/lib/study-api/wrong-answer-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METHODS = "GET, OPTIONS";

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", ...corsHeaders(request, METHODS) };

  if (!isCallReviewSessionConfigured() || !isStudyApiConfigured()) {
    return NextResponse.json(
      { error: "전화관리 학습 데이터 연동이 설정되지 않았어." },
      { status: 503, headers },
    );
  }

  // 모바일 앱은 Bearer 토큰, 웹은 서명 세션 쿠키로 학생을 식별한다.
  // 어느 쪽이든 회원번호는 요청 값이 아니라 서버가 검증한 주체에서만 읽는다.
  const usesBearer = bearerToken(request) !== null;
  const mobile = usesBearer ? readMobileToken(request) : null;
  const session = usesBearer ? null : await getCallReviewSession();
  const subject = mobile ?? session;

  if (!subject) {
    return NextResponse.json({ error: "로그인이 필요해." }, { status: 401, headers });
  }
  if (subject.role !== "student") {
    return NextResponse.json({ error: "학생 계정으로 로그인해줘." }, { status: 403, headers });
  }

  const fetcher = mobile ? createMobileStudyFetcher(mobile) : null;
  const params = new URL(request.url).searchParams;
  try {
    const result = await loadWrongAnswerItems({
      customerNo: subject.subjectId,
      from: params.get("from"),
      to: params.get("to"),
      sources: "word-sentence",
      ...(fetcher ? { fetcher: fetcher.fetch } : {}),
    });
    return NextResponse.json(
      {
        ...result,
        source: "study-api",
        // study-api 토큰이 갱신되면 앱이 저장된 토큰을 교체한다.
        ...(fetcher?.renewedToken() ? { renewedToken: fetcher.renewedToken() } : {}),
      },
      { headers },
    );
  } catch (error) {
    const status = error instanceof StudyApiError ? error.status : 502;
    return NextResponse.json(
      {
        items: [],
        source: "study-api",
        error:
          status === 401
            ? "세션이 만료됐어. 다시 로그인해줘."
            : "학습 데이터를 불러오지 못했어.",
      },
      { status, headers },
    );
  }
}
