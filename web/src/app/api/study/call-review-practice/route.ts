import { NextResponse } from "next/server";

import { summarizePractice } from "@/lib/call-review/practice-summary";
import { isReportStoreConfigured, listCallReports } from "@/lib/call-review/report-store";
import { StudyApiError, isStudyApiConfigured } from "@/lib/study-api/client";
import { authedStudyFetch } from "@/lib/study-api/server-fetch";
import { loadTeacherStudents } from "@/lib/study-api/teacher-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

// 웹 튜터 교사 화면 "회원 오답 현황": 학생이 전화관리 앱에서 실제로 푼 표현과 결과.
// 웹 튜터 로그인 쿠키(교사 토큰)로 담당 학생인지 study-api에서 확인한 뒤 통화 기록만 집계한다.
export async function GET(request: Request) {
  if (!isStudyApiConfigured() || !isReportStoreConfigured()) {
    return NextResponse.json({ configured: false }, { headers });
  }
  const customerNo = (new URL(request.url).searchParams.get("customerNo") ?? "").trim();
  if (!customerNo) return NextResponse.json({ error: "customerNo is required" }, { status: 400, headers });

  let isOwnStudent: boolean;
  try {
    const students = await loadTeacherStudents(authedStudyFetch, []);
    isOwnStudent = students.some((student) => student.customerNo === customerNo);
  } catch (error) {
    const status = error instanceof StudyApiError && (error.status === 401 || error.status === 403) ? error.status : 502;
    return NextResponse.json({ error: "교사 계정으로 로그인해 주세요." }, { status, headers });
  }
  // 담당이 아닌 학생은 존재 여부도 알리지 않는다.
  if (!isOwnStudent) return NextResponse.json({ error: "학생을 찾을 수 없어요." }, { status: 404, headers });

  try {
    const reports = await listCallReports(customerNo, 50);
    return NextResponse.json({ configured: true, ...summarizePractice(reports) }, { headers });
  } catch {
    return NextResponse.json({ error: "통화 기록을 불러오지 못했어요." }, { status: 502, headers });
  }
}
