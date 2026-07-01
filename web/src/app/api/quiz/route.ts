import { NextResponse } from "next/server";

import { isCorrectAnswer, isHelpRequest, maskAnswer } from "@/lib/quiz-engine";
import { callOpenAiText, isOpenAiEnabled } from "@/lib/openai";
import type { LearningItem, MasteryStatus, TutorResponse } from "@/lib/types";

export const runtime = "nodejs";

// 3회째 시도에도 오답이면 정답을 공개하고 문항을 마감한다(POC와 동일한 3진아웃).
const MAX_ATTEMPTS = 3;

type QuizRequest = {
  item: LearningItem;
  answer: string;
  attemptNumber: number;
  studentName: string;
};

// 채점 상황. 정답 판정/마감은 결정론적으로 확정하고(아래 judge),
// 상황에 맞는 "자연스러운 한국어 피드백/힌트"만 OpenAI가 생성한다(하이브리드).
type Situation = "correct" | "hint" | "reveal" | "help";

export async function POST(request: Request) {
  let body: QuizRequest;
  try {
    body = (await request.json()) as QuizRequest;
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const guard = judge(body.item, body.answer, body.attemptNumber);

  // OpenAI 미설정/모의 모드 → 결정론적 피드백만 사용.
  if (!isOpenAiEnabled()) {
    return NextResponse.json({ ...guard.response, mode: "mock" });
  }

  try {
    const reply = await callOpenAiText(buildPrompt(body, guard.situation));
    // 정답 여부/마감 판정은 그대로 두고(reply만 AI 문장으로 교체) 오판 위험 제거.
    return NextResponse.json({ ...guard.response, reply, mode: "openai" });
  } catch (error) {
    console.error("[quiz] OpenAI 호출 실패 — 결정론적 피드백으로 대체:", error);
    return NextResponse.json({ ...guard.response, mode: "fallback" });
  }
}

// 결정론적 채점 guardrail: 정답 확정 + 3진아웃 + 힌트요청 구분.
// AI는 이 판정을 바꾸지 못하고 reply 문장만 생성한다.
function judge(
  item: LearningItem,
  answer: string,
  attemptNumber: number,
): { situation: Situation; response: TutorResponse } {
  // 힌트/모름 요청은 오답 시도로 세지 않는다.
  if (isHelpRequest(answer)) {
    return {
      situation: "help",
      response: {
        countsAsAttempt: false,
        reply:
          attemptNumber <= 1
            ? `좋아, 힌트 줄게. 한국어 뜻 "${item.meaningKo ?? item.promptKo}"을(를) 영어로 바꾸면 돼.`
            : `정답 모양은 ${maskAnswer(item.answerEn)} 이런 형태야. 철자와 어순을 떠올려봐.`,
      },
    };
  }

  // 정확히 맞으면(정규화 비교) 시도 횟수에 따라 Perfect/Good.
  if (isCorrectAnswer(item, answer)) {
    const status: MasteryStatus = attemptNumber === 1 ? "Perfect" : "Good";
    return {
      situation: "correct",
      response: {
        countsAsAttempt: true,
        status,
        reply: status === "Perfect" ? "정확해! 한 번에 맞췄어." : "맞았어! 잘 따라왔어.",
      },
    };
  }

  // 3회째 오답 → 정답 공개 후 마감(Not mastered).
  if (attemptNumber >= MAX_ATTEMPTS) {
    return {
      situation: "reveal",
      response: {
        countsAsAttempt: true,
        status: "Not mastered",
        reply: `이번 문항은 여기서 정리하자. 정답은 "${item.answerEn}" 이야. 다음엔 꼭 기억하자!`,
      },
    };
  }

  // 그 외(틀렸지만 기회 남음) → 정답 비공개, 맞춤형 힌트.
  return {
    situation: "hint",
    response: {
      countsAsAttempt: true,
      reply:
        attemptNumber === 1
          ? "아쉽지만 조금 달라. 뜻은 맞게 봤으니 철자나 형태를 다시 떠올려봐."
          : `거의 왔어! 정답은 ${maskAnswer(item.answerEn)} 형태야.`,
    },
  };
}

// 상황별 프롬프트. 핵심: 오답일 때 "학생이 적은 답이 실제로 무슨 뜻/형태인지"를 짚어
// 정답과 어떻게 다른지 맞춤형으로 안내하게 한다(America vs American 케이스).
function buildPrompt(req: QuizRequest, situation: Situation): string {
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
    // hint: 학생이 답을 냈지만 틀림
    lines.push(
      `상황: 학생의 답이 정답과 달라. 정답 전체를 그대로 알려주지 마.`,
      `대신 '학생이 적은 답이 실제로 무슨 뜻/형태인지'를 짚고, 지금 찾는 정답과 어떻게 다른지 맞춤형으로 알려줘.`,
      `예시) 정답이 'America'인데 학생이 'American'이라고 적었다면: "'American'은 '미국의·미국인'이라는 뜻이야. 지금은 나라 이름 자체를 찾고 있어!" 처럼.`,
      `마지막에 정답을 떠올릴 수 있는 짧은 힌트를 덧붙여(정답 노출은 금지).`,
    );
  }

  return lines.filter((l) => l !== "").join("\n");
}
