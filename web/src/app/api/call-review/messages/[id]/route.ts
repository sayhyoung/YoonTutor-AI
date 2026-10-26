import { NextResponse } from "next/server";

import { isServerStoreConfigured } from "@/lib/call-review/admin-db";
import { updateMessage } from "@/lib/call-review/message-store";
import { parseMessageUpdate, toMessageView } from "@/lib/call-review/messages";
import { corsHeaders, preflight } from "@/lib/study-api/call-review-cors";
import { readMobileToken } from "@/lib/study-api/call-review-mobile-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METHODS = "POST, OPTIONS";

function json(request: Request, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", ...corsHeaders(request, METHODS) } });
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}

// 학생이 메시지를 읽었거나 반응 아이콘을 골랐을 때. 본인 메시지만 바꿀 수 있다.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const student = readMobileToken(request);
  if (!student) return json(request, { error: "로그인이 필요해요." }, 401);
  const { id } = await context.params;
  if (!/^[A-Za-z0-9]{10,40}$/.test(id)) return json(request, { error: "메시지를 찾을 수 없어요." }, 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(request, { error: "잘못된 요청이에요." }, 400);
  }
  const update = parseMessageUpdate(body);
  if (!update) return json(request, { error: "잘못된 요청이에요." }, 400);
  if (!isServerStoreConfigured()) return json(request, { error: "메시지 저장소가 설정되지 않았어요." }, 503);

  try {
    const message = await updateMessage(student.subjectId, id, update);
    if (!message) return json(request, { error: "메시지를 찾을 수 없어요." }, 404);
    return json(request, { message: toMessageView(message) });
  } catch {
    return json(request, { error: "메시지를 저장하지 못했어요." }, 502);
  }
}
