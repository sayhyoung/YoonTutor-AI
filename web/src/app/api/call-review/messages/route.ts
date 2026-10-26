import { NextResponse } from "next/server";

import { isServerStoreConfigured } from "@/lib/call-review/admin-db";
import { listMessages } from "@/lib/call-review/message-store";
import { toMessageView } from "@/lib/call-review/messages";
import { corsHeaders, preflight } from "@/lib/study-api/call-review-cors";
import { readMobileToken } from "@/lib/study-api/call-review-mobile-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METHODS = "GET, OPTIONS";

function json(request: Request, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", ...corsHeaders(request, METHODS) } });
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}

// 학생 본인이 받은 선생님 메시지(최근순 20개). 학생 번호는 Bearer 토큰에서만 읽는다.
export async function GET(request: Request) {
  const student = readMobileToken(request);
  if (!student) return json(request, { error: "로그인이 필요해요." }, 401);
  if (!isServerStoreConfigured()) return json(request, { messages: [] });
  try {
    const messages = await listMessages(student.subjectId, 20);
    return json(request, { messages: messages.map(toMessageView) });
  } catch {
    return json(request, { error: "메시지를 불러오지 못했어요." }, 502);
  }
}
