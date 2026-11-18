import { NextResponse } from "next/server";

import { buildDiaryInput, buildDiaryInstructions, parseDiarySuggestions, parseDiarySuggestRequest } from "@/lib/call-review/diary";
import { callOpenAiMessages, isOpenAiEnabled } from "@/lib/openai";
import { corsHeaders, preflight } from "@/lib/study-api/call-review-cors";
import { readMobileToken } from "@/lib/study-api/call-review-mobile-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METHODS = "POST, OPTIONS";
// 학생이 화면에서 기다리므로 오래 끌지 않는다.
const TIMEOUT_MS = 20000;

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

// 오늘 있었던 일(한국어 글·말, 기분, 사진)로 영어 한 줄 일기 문장 3개(쉬움·보통·도전)를 추천한다.
// 사진은 이 요청 안에서 모델에 보내는 데만 쓰고 저장하거나 로그에 남기지 않는다.
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store", ...corsHeaders(request, METHODS) };
  if (!readMobileToken(request)) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401, headers });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400, headers });
  }
  const parsed = parseDiarySuggestRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers });
  if (!isOpenAiEnabled()) {
    return NextResponse.json({ error: "지금은 문장을 추천할 수 없어요. 잠시 뒤에 다시 해 주세요." }, { status: 503, headers });
  }

  try {
    const raw = await withTimeout(
      callOpenAiMessages(
        [
          { role: "developer", content: buildDiaryInstructions() },
          { role: "user", content: buildDiaryInput(parsed.request) },
        ],
        900,
        process.env.CALL_REVIEW_DIARY_MODEL || undefined,
        "none",
      ),
      TIMEOUT_MS,
    );
    const suggestions = parseDiarySuggestions(raw, parsed.request);
    if (suggestions === null) {
      return NextResponse.json({ error: "문장을 만들지 못했어요. 다시 한 번 해 볼까요?" }, { status: 502, headers });
    }
    if (suggestions.length === 0) {
      return NextResponse.json(
        { error: "이 내용으로는 일기 문장을 만들기 어려워요. 오늘 있었던 다른 일을 써 볼까요?" },
        { status: 422, headers },
      );
    }
    return NextResponse.json({ suggestions }, { headers });
  } catch (error) {
    console.error("[diary] 문장 추천 실패:", error instanceof Error ? error.message.slice(0, 80) : "unknown");
    return NextResponse.json({ error: "문장을 만들지 못했어요. 다시 한 번 해 볼까요?" }, { status: 502, headers });
  }
}
