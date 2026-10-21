import { NextResponse } from "next/server";

import { isReportStoreConfigured, listRecentReportsForStudents } from "@/lib/call-review/report-store";
import { loadOwnStudents, requireTeacher } from "@/lib/call-review/teacher-auth";
import { buildClassStats, buildTeacherRows } from "@/lib/call-review/teacher-overview";
import { StudyApiError } from "@/lib/study-api/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

// 교사 대시보드: 담당 학생 목록과 학생별 최근 통화 결과.
export async function GET() {
  const gate = await requireTeacher();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status, headers });

  let students;
  try {
    students = await loadOwnStudents();
  } catch (error) {
    const status = error instanceof StudyApiError && error.status === 401 ? 401 : 502;
    return NextResponse.json(
      { error: status === 401 ? "로그인이 만료됐어요. 다시 로그인해 주세요." : "담당 학생 목록을 불러오지 못했어요." },
      { status, headers },
    );
  }

  const reportsConfigured = isReportStoreConfigured();
  let reports: Awaited<ReturnType<typeof listRecentReportsForStudents>> = [];
  let reportsError = false;
  if (reportsConfigured && students.length > 0) {
    try {
      reports = await listRecentReportsForStudents(students.map((student) => student.customerNo));
    } catch {
      reportsError = true;
    }
  }

  return NextResponse.json(
    {
      teacher: { displayName: gate.session.displayName ?? null },
      students: buildTeacherRows(students, reports),
      classStats: buildClassStats(reports),
      reportsConfigured,
      reportsError,
    },
    { headers },
  );
}
