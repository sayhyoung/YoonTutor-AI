import type { LearningItem, MasteryStatus, SessionResult, TutorResponse } from "./types";

export const MAX_ATTEMPTS = 3;

export type AttemptSituation = "correct" | "retry" | "reveal" | "help";

export type AttemptDecision = TutorResponse & {
  situation: AttemptSituation;
  attemptNumber: number;
  nextAttemptCount: number;
};

const HELP_PATTERNS = [
  "힌트",
  "모르",
  "뭐",
  "어떻게",
  "help",
  "hint",
  "again",
  "다시",
];

export function normalizeAnswer(value: string) {
  return value
    .toLowerCase()
    .replace(/[.?!,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isHelpRequest(value: string) {
  const normalized = value.toLowerCase().trim();
  return HELP_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function isCorrectAnswer(item: LearningItem, answer: string) {
  return normalizeAnswer(item.answerEn) === normalizeAnswer(answer);
}

export function getQuestionPrompt(item: LearningItem, index: number, total: number) {
  return `${index + 1}/${total} · ${item.sourceLabel} 복습\n${item.promptKo}`;
}

export function maskAnswer(answer: string) {
  return answer
    .split(" ")
    .map((word) => {
      if (word.length <= 2) return word[0] ? `${word[0]}_` : "_";
      return `${word[0]}${"_".repeat(Math.max(1, word.length - 2))}${word[word.length - 1]}`;
    })
    .join(" ");
}

export function scoreStatus(status: MasteryStatus) {
  if (status === "Perfect") return 100;
  if (status === "Good") return 75;
  return 50;
}

export function calculateSessionScore(results: SessionResult[]) {
  if (results.length === 0) return 0;
  const total = results.reduce((sum, item) => sum + scoreStatus(item.status), 0);
  return Math.round(total / results.length);
}

export function evaluateAttempt(
  item: LearningItem,
  answer: string,
  attemptNumber: number,
): TutorResponse {
  const decision = decideAttempt(item, answer, Math.max(0, attemptNumber - 1));
  return {
    countsAsAttempt: decision.countsAsAttempt,
    reply: decision.reply,
    status: decision.status,
  };
}

// `previousAttemptCount`는 현재 답변을 제출하기 전까지 실제로 카운트된 오답/정답
// 시도 수다. 힌트 요청은 횟수를 늘리지 않고, 정답 판정과 3진아웃은 항상 이
// 순수 함수가 결정한다. AI는 이 결과를 변경하지 않고 표현만 담당한다.
export function decideAttempt(
  item: LearningItem,
  answer: string,
  previousAttemptCount: number,
): AttemptDecision {
  const safePreviousCount = Math.max(0, previousAttemptCount);
  const attemptNumber = safePreviousCount + 1;

  if (isHelpRequest(answer)) {
    return {
      situation: "help",
      countsAsAttempt: false,
      attemptNumber,
      nextAttemptCount: safePreviousCount,
      reply:
        safePreviousCount < 1
          ? `"${item.meaningKo ?? item.promptKo}"라는 뜻을 영어로 어떻게 표현할지 떠올려봐. 단어의 의미부터 천천히 생각해도 좋아.`
          : `조금 더 구체적으로 볼까? 정답은 ${maskAnswer(item.answerEn)} 모양이야. 빈칸에 들어갈 철자와 단어 순서를 살펴봐.`,
    };
  }

  if (isCorrectAnswer(item, answer)) {
    const status: MasteryStatus = attemptNumber === 1 ? "Perfect" : "Good";
    return {
      situation: "correct",
      countsAsAttempt: true,
      attemptNumber,
      nextAttemptCount: attemptNumber,
      status,
      reply:
        status === "Perfect"
          ? `정확해! 뜻과 표현을 제대로 기억하고 있네.`
          : `맞았어! 다시 생각해서 스스로 찾아낸 게 정말 좋아.`,
    };
  }

  if (attemptNumber >= MAX_ATTEMPTS) {
    return {
      situation: "reveal",
      countsAsAttempt: true,
      attemptNumber,
      nextAttemptCount: attemptNumber,
      status: "Not mastered",
      reply: `조금 어려웠지? 이 문항의 정답은 "${item.answerEn}"이야. 다음에 다시 만나면 훨씬 익숙하게 느껴질 거야.`,
    };
  }

  return {
    situation: "retry",
    countsAsAttempt: true,
    attemptNumber,
    nextAttemptCount: attemptNumber,
    reply:
      attemptNumber === 1
        ? `좋은 시도야. 지금 답과 정답 사이에 조금 차이가 있어. 문제의 뜻과 단어 형태를 한 번 더 차근차근 살펴봐.`
        : `한 끗만 더 다듬어보자. 정답은 ${maskAnswer(item.answerEn)} 모양이야. 빠진 철자나 단어 순서를 확인해봐.`,
  };
}
