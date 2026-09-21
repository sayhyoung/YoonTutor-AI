import { NextResponse } from "next/server";

import { StudyApiError, isStudyApiConfigured } from "@/lib/study-api/client";
import { loadWrongAnswerItems } from "@/lib/study-api/wrong-answer-service";

export const runtime = "nodejs";

// 기존 웹 POC용 엔드포인트. 모바일 전화관리는 회원번호를 쿼리로 받지 않는
// /api/call-review/learning-items를 사용한다.
export async function GET(request: Request) {
  if (!isStudyApiConfigured()) {
    return NextResponse.json({ items: [], source: "unconfigured" });
  }

  const params = new URL(request.url).searchParams;
  const customerNo = params.get("customerNo") ?? params.get("studentId") ?? "";
  if (!customerNo.trim()) {
    return NextResponse.json({ error: "customerNo is required" }, { status: 400 });
  }

  try {
    const result = await loadWrongAnswerItems({
      customerNo,
      from: params.get("from") ?? params.get("studyStartDate"),
      to: params.get("to") ?? params.get("studyEndDate"),
    });
    return NextResponse.json({ ...result, source: "study-api" });
  } catch (error) {
    const status = error instanceof StudyApiError ? error.status : 502;
    return NextResponse.json(
      { items: [], source: "study-api", error: String(error) },
      { status },
    );
  }
}
