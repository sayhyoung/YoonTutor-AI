import { NextResponse } from "next/server";

import { isServerStoreConfigured } from "@/lib/call-review/admin-db";
import { isDiaryDate, toDiaryView } from "@/lib/call-review/diary";
import { markDiaryCommentRead } from "@/lib/call-review/diary-store";
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

// 학생이 일기에 달린 선생님 댓글을 읽었을 때. 본인 일기만 바꿀 수 있다.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const student = readMobileToken(request);
  if (!student) return json(request, { error: "로그인이 필요해요." }, 401);
  const { id } = await context.params;
  if (!isDiaryDate(id)) return json(request, { error: "일기를 찾을 수 없어요." }, 404);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json(request, { error: "잘못된 요청이에요." }, 400);
  }
  if (body?.action !== "read-comment") return json(request, { error: "잘못된 요청이에요." }, 400);
  if (!isServerStoreConfigured()) return json(request, { error: "일기 저장소가 설정되지 않았어요." }, 503);

  try {
    const entry = await markDiaryCommentRead(student.subjectId, id);
    if (!entry) return json(request, { error: "일기를 찾을 수 없어요." }, 404);
    return json(request, { entry: toDiaryView(entry) });
  } catch {
    return json(request, { error: "일기를 저장하지 못했어요." }, 502);
  }
}
