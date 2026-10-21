import { NextResponse } from "next/server";

import { isServerStoreConfigured } from "@/lib/call-review/admin-db";
import { parseScheduleInput, toScheduleView } from "@/lib/call-review/schedule";
import { getSchedule, saveSchedule } from "@/lib/call-review/schedule-store";
import { loadOwnStudents, requireTeacher } from "@/lib/call-review/teacher-auth";
import { StudyApiError } from "@/lib/study-api/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

type Context = { params: Promise<{ customerNo: string }> };

// 교사 권한 + 지금 담당 학생인지 확인. 담당이 아니면 존재 여부도 알리지 않는다.
async function authorize(context: Context) {
  const gate = await requireTeacher();
  if (!gate.ok) return { response: NextResponse.json({ error: gate.error }, { status: gate.status, headers }) };
  const { customerNo } = await context.params;
  try {
    const students = await loadOwnStudents();
    if (!students.some((student) => student.customerNo === customerNo)) {
      return { response: NextResponse.json({ error: "학생을 찾을 수 없어요." }, { status: 404, headers }) };
    }
  } catch (error) {
    const status = error instanceof StudyApiError && error.status === 401 ? 401 : 502;
    return { response: NextResponse.json({ error: "담당 학생을 확인하지 못했어요." }, { status, headers }) };
  }
  if (!isServerStoreConfigured()) {
    return { response: NextResponse.json({ error: "일정 저장소가 설정되지 않았어요." }, { status: 503, headers }) };
  }
  return { customerNo, session: gate.session };
}

export async function GET(_request: Request, context: Context) {
  const auth = await authorize(context);
  if ("response" in auth) return auth.response;
  try {
    const stored = await getSchedule(auth.customerNo);
    return NextResponse.json({ schedule: stored ? toScheduleView(stored) : null }, { headers });
  } catch {
    return NextResponse.json({ error: "일정을 불러오지 못했어요." }, { status: 502, headers });
  }
}

export async function PUT(request: Request, context: Context) {
  const auth = await authorize(context);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400, headers });
  }
  const parsed = parseScheduleInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers });

  try {
    const stored = await saveSchedule(auth.customerNo, parsed.input, {
      teacherNo: auth.session.subjectId,
      teacherName: auth.session.displayName ?? null,
    });
    return NextResponse.json({ schedule: toScheduleView(stored) }, { headers });
  } catch {
    return NextResponse.json({ error: "일정을 저장하지 못했어요." }, { status: 502, headers });
  }
}
