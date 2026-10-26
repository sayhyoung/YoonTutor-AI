import { NextResponse } from "next/server";

import { isServerStoreConfigured } from "@/lib/call-review/admin-db";
import { listMessages } from "@/lib/call-review/message-store";
import { toMessageView } from "@/lib/call-review/messages";
import { ownStudentsAmong, requireTeacher } from "@/lib/call-review/teacher-auth";
import { StudyApiError } from "@/lib/study-api/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

// 담당 학생에게 보낸 메시지와 학생의 읽음·반응(리포트 맨 아래).
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
  if (!isServerStoreConfigured()) return NextResponse.json({ messages: [] }, { headers });
  try {
    const messages = await listMessages(customerNo, 20);
    return NextResponse.json({ messages: messages.map(toMessageView) }, { headers });
  } catch {
    return NextResponse.json({ error: "메시지를 불러오지 못했어요." }, { status: 502, headers });
  }
}
