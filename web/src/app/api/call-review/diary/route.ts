import { NextResponse } from "next/server";

import { isServerStoreConfigured } from "@/lib/call-review/admin-db";
import { parseDiarySave, toDiaryView } from "@/lib/call-review/diary";
import { listDiaryEntries, saveTodayDiary } from "@/lib/call-review/diary-store";
import { corsHeaders, preflight } from "@/lib/study-api/call-review-cors";
import { readMobileToken } from "@/lib/study-api/call-review-mobile-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METHODS = "GET, POST, OPTIONS";

function json(request: Request, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", ...corsHeaders(request, METHODS) } });
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}

// 학생 본인의 영어 한 줄 일기(최근순 30개)와 선생님 댓글. 학생 번호는 Bearer 토큰에서만 읽는다.
export async function GET(request: Request) {
  const student = readMobileToken(request);
  if (!student) return json(request, { error: "로그인이 필요해요." }, 401);
  if (!isServerStoreConfigured()) return json(request, { entries: [], configured: false });
  try {
    const entries = await listDiaryEntries(student.subjectId, 30);
    return json(request, { entries: entries.map(toDiaryView), configured: true });
  } catch {
    return json(request, { error: "일기를 불러오지 못했어요." }, 502);
  }
}

// 오늘 일기 저장(하루 한 줄). 날짜는 서버가 한국 시간으로 정한다. 사진은 받지 않는다.
export async function POST(request: Request) {
  const student = readMobileToken(request);
  if (!student) return json(request, { error: "로그인이 필요해요." }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(request, { error: "잘못된 요청이에요." }, 400);
  }
  const parsed = parseDiarySave(body);
  if (!parsed.ok) return json(request, { error: parsed.error }, 400);
  if (!isServerStoreConfigured()) return json(request, { error: "일기 저장소가 설정되지 않았어요." }, 503);

  try {
    const result = await saveTodayDiary(student.subjectId, parsed.entry);
    if (!result.ok) {
      return json(request, { error: "선생님이 댓글을 남긴 일기라 바꿀 수 없어요. 내일 새로 써 볼까요?" }, 409);
    }
    return json(request, { entry: toDiaryView(result.entry) });
  } catch {
    return json(request, { error: "일기를 저장하지 못했어요." }, 502);
  }
}
