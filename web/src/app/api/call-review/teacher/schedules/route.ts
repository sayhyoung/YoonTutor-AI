import { NextResponse } from "next/server";

import { isServerStoreConfigured } from "@/lib/call-review/admin-db";
import { parseScheduleInput, toScheduleView } from "@/lib/call-review/schedule";
import { saveSchedule } from "@/lib/call-review/schedule-store";
import { ownStudentsAmong, parseCustomerNos, requireTeacher } from "@/lib/call-review/teacher-auth";
import { StudyApiError } from "@/lib/study-api/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

// 여러 학생에게 같은 관리 전화 일정을 저장한다. 고른 학생이 모두 담당일 때만 저장한다.
export async function PUT(request: Request) {
  const gate = await requireTeacher();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status, headers });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400, headers });
  }
  const customerNos = parseCustomerNos(body?.customerNos);
  if (!customerNos) return NextResponse.json({ error: "학습자를 1명 이상 골라 주세요." }, { status: 400, headers });
  const parsed = parseScheduleInput(body.schedule);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers });

  try {
    if (!(await ownStudentsAmong(customerNos))) {
      return NextResponse.json({ error: "담당 학습자만 고를 수 있어요." }, { status: 404, headers });
    }
  } catch (error) {
    const status = error instanceof StudyApiError && error.status === 401 ? 401 : 502;
    return NextResponse.json({ error: "담당 학생을 확인하지 못했어요." }, { status, headers });
  }
  if (!isServerStoreConfigured()) {
    return NextResponse.json({ error: "일정 저장소가 설정되지 않았어요." }, { status: 503, headers });
  }

  const teacher = { teacherNo: gate.session.subjectId, teacherName: gate.session.displayName ?? null };
  const now = new Date();
  const results = await Promise.allSettled(customerNos.map((customerNo) => saveSchedule(customerNo, parsed.input, teacher, now)));
  const saved = results.flatMap((result, index) =>
    result.status === "fulfilled" ? [{ customerNo: customerNos[index]!, schedule: toScheduleView(result.value) }] : [],
  );
  const failed = customerNos.filter((_, index) => results[index]!.status === "rejected");
  if (saved.length === 0) return NextResponse.json({ error: "일정을 저장하지 못했어요." }, { status: 502, headers });
  return NextResponse.json({ saved, failed }, { headers });
}
