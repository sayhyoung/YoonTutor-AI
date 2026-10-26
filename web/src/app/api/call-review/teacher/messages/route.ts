import { NextResponse } from "next/server";

import { isServerStoreConfigured } from "@/lib/call-review/admin-db";
import { removeTokens, tokensFor } from "@/lib/call-review/device-store";
import { buildTeacherMessage, MAX_TEACHER_MESSAGE, sendPush } from "@/lib/call-review/push";
import { ownStudentsAmong, parseCustomerNos, requireTeacher } from "@/lib/call-review/teacher-auth";
import { StudyApiError } from "@/lib/study-api/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

// 담당 학생들의 앱으로 선생님 메시지 알림을 보낸다. 앱을 설치해 알림을 등록한 기기에만 간다.
export async function POST(request: Request) {
  const gate = await requireTeacher();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status, headers });
  if (process.env.CALL_REVIEW_PUSH_DISPATCH !== "enabled") {
    return NextResponse.json({ error: "푸시 발송이 꺼져 있어요." }, { status: 503, headers });
  }

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
    return NextResponse.json({ error: "기기 저장소가 설정되지 않았어요." }, { status: 503, headers });
  }

  try {
    const devices = await tokensFor(customerNos);
    const tokens = [...devices.values()].flat();
    const reached = devices.size;
    if (tokens.length === 0) return NextResponse.json({ sent: 0, reached: 0, noDevice: customerNos.length }, { headers });
    const result = await sendPush(tokens, buildTeacherMessage(message, gate.session.displayName ?? null));
    await removeTokens(result.invalidTokens).catch(() => undefined);
    return NextResponse.json({ sent: result.sent, reached, noDevice: customerNos.length - reached }, { headers });
  } catch {
    return NextResponse.json({ error: "메시지를 보내지 못했어요." }, { status: 502, headers });
  }
}
