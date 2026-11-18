import { NextResponse } from "next/server";

import { isServerStoreConfigured } from "@/lib/call-review/admin-db";
import { removeTokens, tokensFor } from "@/lib/call-review/device-store";
import { isDiaryDate, MAX_COMMENT, parseDiaryComment, toDiaryView } from "@/lib/call-review/diary";
import { setDiaryComment } from "@/lib/call-review/diary-store";
import { buildDiaryComment, sendPush } from "@/lib/call-review/push";
import { ownStudentsAmong, requireTeacher } from "@/lib/call-review/teacher-auth";
import { StudyApiError } from "@/lib/study-api/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

// 담당 학생의 일기에 댓글을 남기거나 고친다. 학생 앱 일기장에 보이고, 알림을 허용한 기기에는 알림도 간다.
export async function POST(request: Request, context: { params: Promise<{ customerNo: string; id: string }> }) {
  const gate = await requireTeacher();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status, headers });
  const { customerNo, id } = await context.params;
  if (!isDiaryDate(id)) return NextResponse.json({ error: "일기를 찾을 수 없어요." }, { status: 404, headers });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400, headers });
  }
  const comment = parseDiaryComment(body);
  if (!comment) return NextResponse.json({ error: `댓글은 1~${MAX_COMMENT}자로 써 주세요.` }, { status: 400, headers });

  try {
    if (!(await ownStudentsAmong([customerNo]))) {
      return NextResponse.json({ error: "학생을 찾을 수 없어요." }, { status: 404, headers });
    }
  } catch (error) {
    const status = error instanceof StudyApiError && error.status === 401 ? 401 : 502;
    return NextResponse.json({ error: "담당 학생을 확인하지 못했어요." }, { status, headers });
  }
  if (!isServerStoreConfigured()) {
    return NextResponse.json({ error: "일기 저장소가 설정되지 않았어요." }, { status: 503, headers });
  }

  const teacherName = gate.session.displayName ?? null;
  let entry;
  try {
    entry = await setDiaryComment(customerNo, id, { body: comment, teacherName, teacherNo: gate.session.subjectId });
  } catch {
    return NextResponse.json({ error: "댓글을 저장하지 못했어요." }, { status: 502, headers });
  }
  if (!entry) return NextResponse.json({ error: "일기를 찾을 수 없어요." }, { status: 404, headers });

  let reached = false;
  if (process.env.CALL_REVIEW_PUSH_DISPATCH === "enabled") {
    try {
      const devices = await tokensFor([customerNo]);
      const result = await sendPush(devices.get(customerNo) ?? [], buildDiaryComment(comment, teacherName, id));
      reached = result.sent > 0;
      await removeTokens(result.invalidTokens).catch(() => undefined);
    } catch {
      // 알림이 실패해도 댓글은 저장됐으니 학생이 일기장을 열면 볼 수 있다.
    }
  }
  return NextResponse.json({ entry: toDiaryView(entry), reached }, { headers });
}
