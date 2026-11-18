import { NextResponse } from "next/server";

import { isServerStoreConfigured } from "@/lib/call-review/admin-db";
import { toDiaryView } from "@/lib/call-review/diary";
import { listDiaryEntries } from "@/lib/call-review/diary-store";
import { ownStudentsAmong, requireTeacher } from "@/lib/call-review/teacher-auth";
import { StudyApiError } from "@/lib/study-api/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

// 담당 학생의 영어 한 줄 일기(최근순 30개)와 남긴 댓글(리포트의 일기 칸).
export async function GET(_request: Request, context: { params: Promise<{ customerNo: string }> }) {
  const gate = await requireTeacher();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status, headers });
  const { customerNo } = await context.params;
  try {
    if (!(await ownStudentsAmong([customerNo]))) {
      return NextResponse.json({ error: "학생을 찾을 수 없어요." }, { status: 404, headers });
    }
  } catch (error) {
    const status = error instanceof StudyApiError && error.status === 401 ? 401 : 502;
    return NextResponse.json({ error: "담당 학생을 확인하지 못했어요." }, { status, headers });
  }
  if (!isServerStoreConfigured()) return NextResponse.json({ entries: [] }, { headers });
  try {
    const entries = await listDiaryEntries(customerNo, 30);
    return NextResponse.json({ entries: entries.map(toDiaryView) }, { headers });
  } catch {
    return NextResponse.json({ error: "일기를 불러오지 못했어요." }, { status: 502, headers });
  }
}
