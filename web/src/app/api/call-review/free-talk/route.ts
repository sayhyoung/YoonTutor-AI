import { NextResponse } from "next/server";

import {
  buildFreeTalkInput,
  buildFreeTalkInstructions,
  parseFreeTalkRequest,
  parseGeneratedTurn,
} from "@/lib/call-review/free-talk";
import { callOpenAiMessages, isOpenAiEnabled } from "@/lib/openai";
import { corsHeaders, preflight } from "@/lib/study-api/call-review-cors";
import { readMobileToken } from "@/lib/study-api/call-review-mobile-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METHODS = "POST, OPTIONS";
// 통화 중이라 오래 기다리지 않는다. 시간이 넘으면 앱이 템플릿 질문을 쓴다.
const TIMEOUT_MS = 8000;

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

// 짧은 대화 질문 한 개 생성. 실패하면 turn: null(앱은 템플릿 질문 사용).
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
  const parsed = parseFreeTalkRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers });

  if (!isOpenAiEnabled()) return NextResponse.json({ turn: null, source: "disabled" }, { headers });

  try {
    const raw = await withTimeout(
      callOpenAiMessages(
        [
          { role: "developer", content: buildFreeTalkInstructions() },
          { role: "user", content: buildFreeTalkInput(parsed.request) },
        ],
        1200,
        // 통화 중 지연을 줄이려면 더 빠른 모델을 따로 지정할 수 있다(없으면 OPENAI_MODEL).
        process.env.CALL_REVIEW_FREE_TALK_MODEL || undefined,
      ),
      TIMEOUT_MS,
    );
    const turn = parseGeneratedTurn(raw, parsed.request);
    return NextResponse.json({ turn, source: turn ? "ai" : "invalid" }, { headers });
  } catch {
    return NextResponse.json({ turn: null, source: "error" }, { headers });
  }
}
