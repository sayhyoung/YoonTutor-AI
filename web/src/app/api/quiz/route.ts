import { NextResponse } from "next/server";

import { decideAttempt } from "@/lib/quiz-engine";
import { callOpenAiText, isOpenAiEnabled } from "@/lib/openai";
import type { AttemptSituation } from "@/lib/quiz-engine";
import type { LearningItem } from "@/lib/types";

export const runtime = "nodejs";

type QuizRequest = {
  item: LearningItem;
  answer: string;
  attemptNumber: number;
  studentName: string;
};

// 채점 상황. 정답 판정/마감은 결정론적으로 확정하고,
// 상황에 맞는 "자연스러운 한국어 피드백/힌트"만 OpenAI가 생성한다(하이브리드).
export async function POST(request: Request) {
  let body: QuizRequest;
  try {
    body = (await request.json()) as QuizRequest;
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const decision = decideAttempt(
    body.item,
    body.answer,
    Math.max(0, body.attemptNumber - 1),
  );
  const response = {
    countsAsAttempt: decision.countsAsAttempt,
    reply: decision.reply,
    status: decision.status,
  };

  // OpenAI 미설정/모의 모드 → 결정론적 피드백만 사용.
  if (!isOpenAiEnabled()) {
    return NextResponse.json({ ...response, mode: "mock" });
  }

  try {
    const reply = await callOpenAiText(buildPrompt(body, decision.situation));
    // 정답 여부/마감 판정은 그대로 두고(reply만 AI 문장으로 교체) 오판 위험 제거.
    return NextResponse.json({ ...response, reply, mode: "openai" });
  } catch (error) {
    console.error("[quiz] OpenAI 호출 실패 — 결정론적 피드백으로 대체:", error);
    return NextResponse.json({ ...response, mode: "fallback" });
  }
}

// 상황별 프롬프트. 핵심: 오답일 때 "학생이 적은 답이 실제로 무슨 뜻/형태인지"를 짚어
// 정답과 어떻게 다른지 맞춤형으로 안내하게 한다(America vs American 케이스).
function buildPrompt(req: QuizRequest, situation: AttemptSituation): string {
  const { item, answer, attemptNumber, studentName } = req;

  const lines: string[] = [
    `너는 '윤선생 영어교실'의 친근한 AI 복습 코치야. 학생(${studentName})에게 반말로, 따뜻하지만 군더더기 없이 말해.`,
    `한국어로만 답하고, 2~3문장 이내로 짧게 끝내. 이모지는 최대 1개만.`,
    ``,
    `[문항]`,
    `유형: ${item.sourceLabel}`,
    `한국어 제시문: ${item.promptKo}`,
    item.meaningKo ? `핵심 뜻: ${item.meaningKo}` : "",
    `정답(영어): ${item.answerEn}`,
    ``,
    `[학생이 제출한 답] ${answer}`,
    `[시도 횟수] ${attemptNumber}`,
    ``,
  ];

  if (situation === "correct") {
    lines.push(
      `상황: 학생이 정답을 맞혔어. 짧게 칭찬하고, 왜 그 답이 맞는지 한 가지 포인트만 가볍게 짚어줘.`,
    );
  } else if (situation === "reveal") {
    lines.push(
      `상황: 학생이 여러 번 틀려서 이번 문항은 마감해.`,
      `정답이 "${item.answerEn}"임을 분명히 알려주고, 학생이 적은 답과 정답이 어떻게 다른지 1가지만 짚은 뒤 따뜻하게 격려해줘.`,
    );
  } else if (situation === "help") {
    lines.push(
      `상황: 학생이 힌트를 요청했어(아직 정답 시도 아님).`,
      `정답 단어/문장 전체를 절대 그대로 말하지 마. 한국어 뜻을 영어로 바꾸도록 유도하는 힌트만 줘.`,
      `필요하면 초성/형태 힌트(예: w__k)를 활용해.`,
    );
  } else {
    // retry: 학생이 답을 냈지만 틀림
    lines.push(
      `상황: 학생의 답이 정답과 달라. 정답 전체를 그대로 알려주지 마.`,
      `대신 '학생이 적은 답이 실제로 무슨 뜻/형태인지'를 짚고, 지금 찾는 정답과 어떻게 다른지 맞춤형으로 알려줘.`,
      `예시) 정답이 'America'인데 학생이 'American'이라고 적었다면: "'American'은 '미국의·미국인'이라는 뜻이야. 지금은 나라 이름 자체를 찾고 있어!" 처럼.`,
      `마지막에 정답을 떠올릴 수 있는 짧은 힌트를 덧붙여(정답 노출은 금지).`,
    );
  }

  return lines.filter((l) => l !== "").join("\n");
}
