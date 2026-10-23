import { NextResponse } from "next/server";

import {
  buildAnswerCheckInput,
  buildAnswerCheckInstructions,
  parseAnswerCheck,
  parseAnswerCheckRequest,
} from "@/lib/call-review/answer-check";
import { callOpenAiMessages, isOpenAiEnabled } from "@/lib/openai";
import { corsHeaders, preflight } from "@/lib/study-api/call-review-cors";
import { readMobileToken } from "@/lib/study-api/call-review-mobile-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METHODS = "POST, OPTIONS";
// 통화 중 학생이 기다리고 있으므로 짧게 기다린다. 시간이 넘으면 오답으로 본다.
const TIMEOUT_MS = 3500;

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}

// 규칙 채점에서 틀린 답이 뜻으로는 맞는지 판정한다. 판정하지 못하면 acceptable: false.
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
  const parsed = parseAnswerCheckRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers });

  if (!isOpenAiEnabled()) return NextResponse.json({ acceptable: false, source: "disabled" }, { headers });

  try {
    const raw = await Promise.race([
      callOpenAiMessages(
        [
          { role: "developer", content: buildAnswerCheckInstructions() },
          { role: "user", content: buildAnswerCheckInput(parsed.request) },
        ],
        200,
        process.env.CALL_REVIEW_FREE_TALK_MODEL || undefined,
      ),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
    ]);
    const acceptable = parseAnswerCheck(raw);
    return NextResponse.json({ acceptable: acceptable === true, source: acceptable === null ? "invalid" : "ai" }, { headers });
  } catch {
    return NextResponse.json({ acceptable: false, source: "error" }, { headers });
  }
}
