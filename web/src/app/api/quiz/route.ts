import { NextResponse } from "next/server";

import { evaluateAttempt } from "@/lib/quiz-engine";
import type { LearningItem, TutorResponse } from "@/lib/types";

export const runtime = "nodejs";

type QuizRequest = {
  item: LearningItem;
  answer: string;
  attemptNumber: number;
  studentName: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as QuizRequest;
  const fallback = evaluateAttempt(body.item, body.answer, body.attemptNumber);

  if (!process.env.OPENAI_API_KEY || process.env.USE_MOCK_AI === "true") {
    return NextResponse.json({ ...fallback, mode: "mock" });
  }

  try {
    const reply = await getOpenAiTutorReply(body, fallback);
    return NextResponse.json({ ...fallback, reply, mode: "openai" });
  } catch {
    return NextResponse.json({ ...fallback, mode: "fallback" });
  }
}

async function getOpenAiTutorReply(
  request: QuizRequest,
  evaluation: TutorResponse,
) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5.2",
      input: buildPrompt(request, evaluation),
      temperature: 0.3,
      max_output_tokens: 180,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status}`);
  }

  const data = (await response.json()) as { output_text?: string };
  return data.output_text?.trim() || evaluation.reply;
}

function buildPrompt(request: QuizRequest, evaluation: TutorResponse) {
  const statusText = evaluation.status ? `채점 결과: ${evaluation.status}` : "채점 결과: 진행 중";
  return [
    "너는 윤선생 영어 학습 코치야. 학생에게 짧고 명확한 한국어 피드백을 반말 친구 모드로 말해.",
    "정답을 미리 스포일러하지 말고, 채점 결과가 Not mastered일 때만 정답을 공개해.",
    "반드시 2문장 이내로 답해.",
    "",
    `학생: ${request.studentName}`,
    `문항 유형: ${request.item.sourceLabel}`,
    `한국어 프롬프트: ${request.item.promptKo}`,
    `정답: ${request.item.answerEn}`,
    `학생 답: ${request.answer}`,
    `시도 횟수: ${request.attemptNumber}`,
    statusText,
    `기본 피드백: ${evaluation.reply}`,
  ].join("\n");
}
