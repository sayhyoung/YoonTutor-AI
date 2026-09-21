import { NextResponse } from "next/server";

import {
  getCallReviewSession,
  isCallReviewSessionConfigured,
} from "@/lib/study-api/call-review-session";
import { StudyApiError, isStudyApiConfigured } from "@/lib/study-api/client";
import { loadWrongAnswerItems } from "@/lib/study-api/wrong-answer-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  if (!isCallReviewSessionConfigured() || !isStudyApiConfigured()) {
    return NextResponse.json(
      { error: "전화관리 학습 데이터 연동이 설정되지 않았어." },
      { status: 503, headers: privateHeaders },
    );
  }

  const session = await getCallReviewSession();
  if (!session) {
    return NextResponse.json(
      { error: "로그인이 필요해." },
      { status: 401, headers: privateHeaders },
    );
  }
  if (session.role !== "student") {
    return NextResponse.json(
      { error: "학생 계정으로 로그인해줘." },
      { status: 403, headers: privateHeaders },
    );
  }

  const params = new URL(request.url).searchParams;
  try {
    const result = await loadWrongAnswerItems({
      customerNo: session.subjectId,
      from: params.get("from"),
      to: params.get("to"),
    });
    return NextResponse.json(
      { ...result, source: "study-api" },
      { headers: privateHeaders },
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
      { status, headers: privateHeaders },
    );
  }
}
