import { NextResponse } from "next/server";

import { callOpenAiText, isOpenAiEnabled } from "@/lib/openai";
import { scoreStatus } from "@/lib/quiz-engine";
import type { SessionResult } from "@/lib/types";

export const runtime = "nodejs";

// POC generate_final_report 대응: 세션 결과로 3~4문장 한국어 코치 총평을 생성한다.
type ReportRequest = {
  studentName: string;
  results: SessionResult[];
};

export async function POST(request: Request) {
  let body: ReportRequest;
  try {
    body = (await request.json()) as ReportRequest;
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const studentName = body.studentName?.trim() || "학생";
  const results = Array.isArray(body.results) ? body.results : [];
  const fallback = buildFallbackComment(studentName, results);

  if (!isOpenAiEnabled()) {
    return NextResponse.json({ comment: fallback, mode: "mock" });
  }

  try {
    const comment = await callOpenAiText(buildPrompt(studentName, results), 320);
    return NextResponse.json({ comment: comment || fallback, mode: "openai" });
  } catch (error) {
    console.error("[report] OpenAI 호출 실패 — 결정론적 총평으로 대체:", error);
    return NextResponse.json({ comment: fallback, mode: "fallback" });
  }
}

function buildPrompt(studentName: string, results: SessionResult[]): string {
  const summary = results
    .map((r) => `- [${r.sourceLabel}] ${r.question} → ${r.status} (${r.attempts}회 시도)`)
    .join("\n");

  return [
    `학생(${studentName})의 오늘 영어 복습 결과를 보고 따뜻한 코치 총평을 써줘.`,
    ``,
    `[결과]`,
    summary || "- (결과 없음)",
    ``,
    `[작성 규칙]`,
    `1. 한국어로, 학생에게 직접 말하는 반말 톤.`,
    `2. 3~4문장으로 짧게.`,
    `3. 잘한 점과 다음에 더 챙길 점을 구체적으로 1가지씩.`,
    `4. 마지막은 다음 학습을 응원하는 한마디로.`,
  ].join("\n");
}

// OpenAI 미사용/실패 시에도 항상 의미 있는 총평을 돌려준다.
function buildFallbackComment(studentName: string, results: SessionResult[]): string {
  if (results.length === 0) {
    return `${studentName}, 오늘은 복습할 문항이 없었어. 다음 학습도 이대로만 하자!`;
  }

  const perfect = results.filter((r) => r.status === "Perfect").length;
  const good = results.filter((r) => r.status === "Good").length;
  const review = results.filter((r) => r.status === "Not mastered").length;
  const avg = Math.round(
    results.reduce((sum, r) => sum + scoreStatus(r.status), 0) / results.length,
  );

  const weak = results
    .filter((r) => r.status === "Not mastered")
    .slice(0, 3)
    .map((r) => r.answer)
    .filter(Boolean);

  const head = `${studentName}, 오늘 ${results.length}문항 복습해서 평균 ${avg}점이야. 한 번에 맞춘 게 ${perfect}개, 다시 풀어 맞춘 게 ${good}개였어.`;
  const tail =
    review > 0
      ? `아직 ${review}개는 더 익혀야 해${weak.length ? ` (예: ${weak.join(", ")})` : ""}. 다음 시간에 이 부분만 한 번 더 보면 완벽해질 거야!`
      : `틀린 문항 없이 깔끔하게 마무리했어. 이대로만 가자!`;

  return `${head} ${tail}`;
}
