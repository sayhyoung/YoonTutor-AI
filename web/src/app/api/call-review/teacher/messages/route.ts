import { NextResponse } from "next/server";

import { isServerStoreConfigured } from "@/lib/call-review/admin-db";
import { removeTokens, tokensFor } from "@/lib/call-review/device-store";
import { createMessages } from "@/lib/call-review/message-store";
import { buildTeacherMessage, MAX_TEACHER_MESSAGE, sendPush } from "@/lib/call-review/push";
import { ownStudentsAmong, parseCustomerNos, requireTeacher } from "@/lib/call-review/teacher-auth";
import { StudyApiError } from "@/lib/study-api/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

// 담당 학생에게 메시지를 남기고(학생 앱 메시지함에 보임) 앱 알림으로도 보낸다.
// 알림은 앱에서 알림을 허용한 기기에만 가고, 푸시 발송이 꺼져 있으면 저장만 한다.
export async function POST(request: Request) {
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
  const message = typeof body.message === "string" ? body.message.replace(/\s+/g, " ").trim() : "";
  if (!message || message.length > MAX_TEACHER_MESSAGE) {
    return NextResponse.json({ error: `메시지는 1~${MAX_TEACHER_MESSAGE}자로 써 주세요.` }, { status: 400, headers });
  }

  try {
    if (!(await ownStudentsAmong(customerNos))) {
      return NextResponse.json({ error: "담당 학습자만 고를 수 있어요." }, { status: 404, headers });
    }
  } catch (error) {
    const status = error instanceof StudyApiError && error.status === 401 ? 401 : 502;
    return NextResponse.json({ error: "담당 학생을 확인하지 못했어요." }, { status, headers });
  }
  if (!isServerStoreConfigured()) {
    return NextResponse.json({ error: "메시지 저장소가 설정되지 않았어요." }, { status: 503, headers });
  }

  const teacherName = gate.session.displayName ?? null;
  let saved;
  try {
    saved = await createMessages(customerNos, message, { teacherNo: gate.session.subjectId, teacherName });
  } catch {
    return NextResponse.json({ error: "메시지를 저장하지 못했어요." }, { status: 502, headers });
  }

  let reached = 0;
  if (process.env.CALL_REVIEW_PUSH_DISPATCH === "enabled") {
    try {
      const devices = await tokensFor(customerNos);
      const invalid: string[] = [];
      for (const [customerNo, tokens] of devices) {
        const result = await sendPush(tokens, buildTeacherMessage(message, teacherName, saved.get(customerNo)?.id));
        if (result.sent > 0) reached += 1;
        invalid.push(...result.invalidTokens);
      }
      await removeTokens(invalid).catch(() => undefined);
    } catch {
      // 알림이 실패해도 메시지는 저장됐으니 학생이 앱을 열면 볼 수 있다.
    }
  }
  return NextResponse.json({ saved: saved.size, reached, noDevice: customerNos.length - reached }, { headers });
}
