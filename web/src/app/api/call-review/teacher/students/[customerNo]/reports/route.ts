import { NextResponse } from "next/server";

import { toSummary } from "@/lib/call-review/report-schema";
import { isReportStoreConfigured, listCallReports } from "@/lib/call-review/report-store";
import { loadOwnStudents, requireTeacher } from "@/lib/call-review/teacher-auth";
import { StudyApiError } from "@/lib/study-api/client";
import { authedStudyFetch } from "@/lib/study-api/server-fetch";
import { loadWrongAnswerItems } from "@/lib/study-api/wrong-answer-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

// 학생 한 명의 통화 기록. 요청한 학생이 지금 이 교사의 담당인지 먼저 확인한다.
export async function GET(_request: Request, context: { params: Promise<{ customerNo: string }> }) {
  const gate = await requireTeacher();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status, headers });

  const { customerNo } = await context.params;
  let students;
  try {
    students = await loadOwnStudents();
  } catch (error) {
    const status = error instanceof StudyApiError && error.status === 401 ? 401 : 502;
    return NextResponse.json({ error: "담당 학생을 확인하지 못했어요." }, { status, headers });
  }
  const student = students.find((item) => item.customerNo === customerNo);
  if (!student) {
    // 담당이 아닌 학생은 존재 여부도 알리지 않는다.
    return NextResponse.json({ error: "학생을 찾을 수 없어요." }, { status: 404, headers });
  }

  // 다음 통화에서 복습할 표현(현재 study-api 오답). 실패해도 리포트는 보여준다.
  const upcoming = await loadWrongAnswerItems({
    customerNo,
    sources: "word-sentence",
    bms: student.bmNames,
    fetcher: authedStudyFetch,
  })
    .then((result) => ({
      studyStartDate: result.studyStartDate,
      studyEndDate: result.studyEndDate,
      // 교사 화면이 학생 앱과 같은 규칙으로 다음 통화 문항을 고르도록 후보를 모두 보낸다.
      items: result.items.slice(0, 100).map((item) => ({
        id: item.id,
        sourceType: item.sourceType,
        answerEn: item.answerEn,
        meaningKo: item.meaningKo ?? null,
        unitName: item.unitName,
        wrongAt: item.wrongAt,
      })),
      total: result.items.length,
    }))
    .catch(() => null);

  if (!isReportStoreConfigured()) {
    return NextResponse.json({ student, reports: [], reportsConfigured: false, upcoming }, { headers });
  }
  try {
    const reports = await listCallReports(customerNo, 50);
    return NextResponse.json(
      { student, reports: reports.map(toSummary), reportsConfigured: true, upcoming },
      { headers },
    );
  } catch {
    return NextResponse.json({ error: "통화 기록을 불러오지 못했어요." }, { status: 502, headers });
  }
}
